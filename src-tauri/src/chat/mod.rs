// Copyright 2026 Borys Zaitsev
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use x25519_dalek::{StaticSecret, PublicKey};
use ed25519_dalek::{SigningKey, VerifyingKey, Signer, Verifier, Signature};
use rand::RngCore;

use crate::error::SenuError;
use crate::sftp::open_sftp;
use crate::ssh::SessionStore;

// Identity key now lives in app_data_dir/chat_identity.key (see crypto.rs's
// get_or_create_key_file) — the old Windows Credential Manager path was
// flaky. Removed: CHAT_KEYCHAIN_SERVICE, CHAT_KEY_ACCOUNT.
const PRESENCE_DIR: &str       = "/tmp/.senu/presence";
const INBOX_BASE: &str         = "/tmp/.senu/inbox";

// ─── Public types (sent to frontend) ─────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatIdentity {
    pub pubkey_b64:    String,
    pub short_id:      String,
    pub display_name:  String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatContact {
    pub pubkey_b64:   String,
    pub short_id:     String,
    pub display_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OnlineUser {
    pub pubkey_b64:   String,
    pub short_id:     String,
    pub display_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub id:             String,
    pub from_pubkey_b64: String,
    pub from_name:      String,
    pub content:        String,
    pub timestamp:      u64,
    pub is_snippet:     bool,
}

// ─── Internal types ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct PresenceBeacon {
    pubkey_b64:   String,
    short_id:     String,
    display_name: String,
    expires_at:   u64,
}

#[derive(Serialize, Deserialize)]
struct MessagePayload {
    id:              String,
    from_pubkey_b64: String,
    from_name:       String,
    content:         String,
    timestamp:       u64,
    is_snippet:      bool,
    /// Ed25519 signature (base64) over the canonical signing input
    /// (see `signing_input`). Required on incoming messages — recipient
    /// rejects unsigned blobs to defeat forgery by third parties on the
    /// same SSH host. Older clients without dual-key identity write `None`
    /// here; recipient drops those.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sig: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct ContactsStore {
    display_name: String,
    contacts:     Vec<ChatContact>,
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn pubkey_short_id(pk: &PublicKey) -> String {
    bytes_to_hex(&pk.as_bytes()[..4])
}

/// Combined identity: X25519 for ECDH (encryption) + Ed25519 for signing.
///
/// File format (`chat_identity.key`, base64-encoded bytes):
/// - **64 bytes:** modern dual-key identity = `[x25519_priv (32) || ed25519_seed (32)]`
/// - **32 bytes:** legacy X25519-only identity (auto-upgraded on first read by
///   generating a fresh Ed25519 seed and rewriting the file).
pub struct Identity {
    pub x_priv: StaticSecret,
    pub x_pub:  PublicKey,
    pub sig:    SigningKey,   // Ed25519
}

/// Combined wire pubkey: `<x25519_pub_b64>.<ed25519_pub_b64>`. The dot
/// disambiguates from legacy single-key format (no separator).
fn encode_combined_pubkey(x_pub: &PublicKey, ed_pub: &VerifyingKey) -> String {
    format!("{}.{}", B64.encode(x_pub.as_bytes()), B64.encode(ed_pub.as_bytes()))
}

/// Parse a combined pubkey. Returns `(x25519_pub, Some(ed25519_pub))` for the
/// new format, or `(x25519_pub, None)` for legacy keys (no dot separator).
fn parse_combined_pubkey(s: &str) -> Result<(PublicKey, Option<VerifyingKey>), SenuError> {
    let (x_b64, ed_opt) = match s.split_once('.') {
        Some((x, ed)) => (x, Some(ed)),
        None => (s, None),
    };
    let x_bytes = B64.decode(x_b64)
        .map_err(|e| SenuError::Unknown(format!("decode pubkey: {e}")))?;
    if x_bytes.len() != 32 {
        return Err(SenuError::Unknown("Invalid X25519 pubkey length".into()));
    }
    let mut x_arr = [0u8; 32];
    x_arr.copy_from_slice(&x_bytes);
    let x_pub = PublicKey::from(x_arr);

    let ed_pub = if let Some(ed_b64) = ed_opt {
        let ed_bytes = B64.decode(ed_b64)
            .map_err(|e| SenuError::Unknown(format!("decode ed25519 pubkey: {e}")))?;
        if ed_bytes.len() != 32 {
            return Err(SenuError::Unknown("Invalid Ed25519 pubkey length".into()));
        }
        let mut ed_arr = [0u8; 32];
        ed_arr.copy_from_slice(&ed_bytes);
        Some(VerifyingKey::from_bytes(&ed_arr)
            .map_err(|e| SenuError::Unknown(format!("Ed25519 pubkey: {e}")))?)
    } else {
        None
    };

    Ok((x_pub, ed_pub))
}

/// Load identity from disk, generating + persisting a fresh dual key on first
/// run. Legacy 32-byte files are upgraded in place by appending a fresh Ed25519
/// seed (existing X25519 key is preserved so previously-known peers can still
/// reach this user).
fn load_or_create_keypair(app: &AppHandle) -> Result<Identity, SenuError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| SenuError::Unknown(format!("app_data_dir: {e}")))?;
    let key_path = dir.join("chat_identity.key");

    let (x_bytes, ed_seed): ([u8; 32], [u8; 32]) = if key_path.exists() {
        let b64 = std::fs::read_to_string(&key_path)
            .map_err(|e| SenuError::Unknown(format!("read identity key: {e}")))?;
        let bytes = B64.decode(b64.trim())
            .map_err(|e| SenuError::Unknown(format!("decode identity key: {e}")))?;
        match bytes.len() {
            64 => {
                let mut x = [0u8; 32]; x.copy_from_slice(&bytes[..32]);
                let mut e = [0u8; 32]; e.copy_from_slice(&bytes[32..]);
                (x, e)
            }
            32 => {
                // Legacy upgrade: keep the X25519 priv, append a fresh Ed25519 seed.
                let mut x = [0u8; 32]; x.copy_from_slice(&bytes);
                let mut e = [0u8; 32]; rand::thread_rng().fill_bytes(&mut e);
                let mut combined = Vec::with_capacity(64);
                combined.extend_from_slice(&x);
                combined.extend_from_slice(&e);
                std::fs::write(&key_path, B64.encode(&combined))
                    .map_err(|err| SenuError::Unknown(format!("upgrade identity key: {err}")))?;
                (x, e)
            }
            _ => return Err(SenuError::Unknown(format!(
                "Bad identity key length: {} bytes (expected 32 or 64)", bytes.len()))),
        }
    } else {
        // First run — generate both halves
        let mut x = [0u8; 32]; rand::thread_rng().fill_bytes(&mut x);
        let mut e = [0u8; 32]; rand::thread_rng().fill_bytes(&mut e);
        std::fs::create_dir_all(&dir)
            .map_err(|err| SenuError::Unknown(format!("create_dir: {err}")))?;
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(&x);
        combined.extend_from_slice(&e);
        std::fs::write(&key_path, B64.encode(&combined))
            .map_err(|err| SenuError::Unknown(format!("write identity key: {err}")))?;
        (x, e)
    };

    let x_priv = StaticSecret::from(x_bytes);
    let x_pub  = PublicKey::from(&x_priv);
    let sig    = SigningKey::from_bytes(&ed_seed);
    Ok(Identity { x_priv, x_pub, sig })
}

/// ECIES-style encrypt: ephemeral X25519 ECDH + AES-256-GCM.
/// Wire format: `<epk_b64>:<nonce_b64>:<ct_b64>`
///
/// `recipient_pubkey_b64` may be combined ("x.ed") or legacy x25519-only;
/// we only need the X25519 half to encrypt.
fn encrypt_for(recipient_pubkey_b64: &str, plaintext: &str) -> Result<String, SenuError> {
    let (rec_pk, _) = parse_combined_pubkey(recipient_pubkey_b64)?;

    // Ephemeral keypair
    let mut ephem_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut ephem_bytes);
    let ephem_secret = StaticSecret::from(ephem_bytes);
    let ephem_public = PublicKey::from(&ephem_secret);

    // ECDH shared secret → AES key
    let shared = ephem_secret.diffie_hellman(&rec_pk);
    let key = Key::<Aes256Gcm>::from_slice(shared.as_bytes());
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| SenuError::Unknown(format!("encrypt: {e}")))?;

    Ok(format!(
        "{}:{}:{}",
        B64.encode(ephem_public.as_bytes()),
        B64.encode(&nonce_bytes),
        B64.encode(&ct)
    ))
}

/// Decrypt a message encrypted with `encrypt_for`. Returns plaintext on success
/// — caller is responsible for parsing the JSON payload AND verifying the
/// embedded signature (see `verify_payload_sig`).
fn decrypt_blob(secret: &StaticSecret, blob: &str) -> Result<String, SenuError> {
    let parts: Vec<&str> = blob.splitn(3, ':').collect();
    if parts.len() != 3 {
        return Err(SenuError::Unknown("Invalid message format".into()));
    }

    let epk_bytes = B64.decode(parts[0])
        .map_err(|e| SenuError::Unknown(format!("decode epk: {e}")))?;
    if epk_bytes.len() != 32 {
        return Err(SenuError::Unknown("Invalid ephemeral pubkey length".into()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&epk_bytes);
    let ephem_pk = PublicKey::from(arr);

    let shared = secret.diffie_hellman(&ephem_pk);
    let key = Key::<Aes256Gcm>::from_slice(shared.as_bytes());
    let cipher = Aes256Gcm::new(key);

    let nonce_bytes = B64.decode(parts[1])
        .map_err(|e| SenuError::Unknown(format!("decode nonce: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = B64.decode(parts[2])
        .map_err(|e| SenuError::Unknown(format!("decode ct: {e}")))?;

    let plaintext = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|e| SenuError::Unknown(format!("decrypt: {e}")))?;

    String::from_utf8(plaintext).map_err(|e| SenuError::Unknown(e.to_string()))
}

/// Bytes that go into the Ed25519 signature. We sign the canonical fields
/// only (not the `sig` field) to make the signature stable regardless of
/// JSON serialization order or whitespace differences. Format:
///   `<id>|<from_pubkey_b64>|<from_name>|<content>|<timestamp>|<is_snippet>`
/// Sender and recipient must build the exact same string; any change to this
/// function is a wire-protocol break — bump message format version if so.
fn signing_input(p: &MessagePayload) -> Vec<u8> {
    format!(
        "{}|{}|{}|{}|{}|{}",
        p.id, p.from_pubkey_b64, p.from_name, p.content, p.timestamp, p.is_snippet
    ).into_bytes()
}

/// Sign payload's canonical bytes with the sender's Ed25519 key.
fn sign_payload(sig_key: &SigningKey, payload: &MessagePayload) -> String {
    let signature = sig_key.sign(&signing_input(payload));
    B64.encode(signature.to_bytes())
}

/// Verify that `sig_b64` was produced by the Ed25519 key claimed in
/// `payload.from_pubkey_b64`. Returns Ok only if signature is valid AND the
/// claimed sender pubkey carries an Ed25519 half (legacy senders are rejected
/// — without authenticity guarantees the message is indistinguishable from
/// an attacker's forgery).
fn verify_payload_sig(payload: &MessagePayload, sig_b64: &str) -> Result<(), SenuError> {
    let (_, ed_pub_opt) = parse_combined_pubkey(&payload.from_pubkey_b64)?;
    let ed_pub = ed_pub_opt.ok_or_else(|| SenuError::Unknown(
        "Sender pubkey missing Ed25519 half — message rejected (cannot verify authenticity)".into()
    ))?;
    let sig_bytes = B64.decode(sig_b64)
        .map_err(|e| SenuError::Unknown(format!("decode signature: {e}")))?;
    if sig_bytes.len() != 64 {
        return Err(SenuError::Unknown("Invalid signature length".into()));
    }
    let mut arr = [0u8; 64];
    arr.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&arr);
    ed_pub.verify(&signing_input(payload), &signature)
        .map_err(|e| SenuError::Unknown(format!("signature verify: {e}")))
}

// ─── Contact storage helpers ──────────────────────────────────────────────────

fn contacts_path(app: &AppHandle) -> Result<std::path::PathBuf, SenuError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| SenuError::Unknown(format!("app_data_dir: {e}")))?;
    Ok(dir.join("chat_contacts.json"))
}

fn load_store(app: &AppHandle) -> ContactsStore {
    contacts_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(app: &AppHandle, store: &ContactsStore) -> Result<(), SenuError> {
    let path = contacts_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(store)?;
    std::fs::write(&path, json)?;
    Ok(())
}

// ─── SFTP helpers ─────────────────────────────────────────────────────────────

/// Create a chat directory and chmod it to 1777 (world-writable + sticky bit).
///
/// Sticky bit + world-write is the same scheme `/tmp` itself uses: any user
/// can drop a file in, but only the file owner can delete or rename their
/// own entries. Without this, the FIRST chat user creates `/tmp/.senu/...`
/// with default 0755 and no other Unix user on the same VPS can post a
/// presence beacon or deliver a message — they end up appearing offline,
/// and outgoing messages silently fail with "Permission denied".
///
/// The chmod is best-effort: if the directory already exists and is owned
/// by another user, setstat fails (only owner / root can chmod) and we
/// just skip — that case requires a manual one-time fix
/// (`sudo chmod -R 1777 /tmp/.senu`). Fresh installs work transparently.
async fn sftp_mkdir(sftp: &russh_sftp::client::SftpSession, path: &str) {
    let _ = sftp.create_dir(path).await;
    let mut attrs = russh_sftp::client::fs::Metadata::default();
    attrs.size = None;
    attrs.uid = None;
    attrs.gid = None;
    attrs.atime = None;
    attrs.mtime = None;
    attrs.permissions = Some(0o1777);
    let _ = sftp.set_metadata(path, attrs).await;
}

async fn sftp_write_str(
    sftp: &russh_sftp::client::SftpSession,
    path: &str,
    data: &str,
) -> Result<(), SenuError> {
    let mut file = sftp
        .create(path)
        .await
        .map_err(|e| SenuError::Sftp(format!("create \"{path}\": {e}")))?;
    file.write_all(data.as_bytes())
        .await
        .map_err(|e| SenuError::Sftp(format!("write \"{path}\": {e}")))?;
    file.flush()
        .await
        .map_err(|e| SenuError::Sftp(format!("flush \"{path}\": {e}")))?;
    Ok(())
}

async fn sftp_read_str(
    sftp: &russh_sftp::client::SftpSession,
    path: &str,
) -> Result<String, SenuError> {
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| SenuError::Sftp(format!("open \"{path}\": {e}")))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| SenuError::Sftp(format!("read \"{path}\": {e}")))?;
    String::from_utf8(buf).map_err(|e| SenuError::Unknown(e.to_string()))
}

async fn sftp_rm(sftp: &russh_sftp::client::SftpSession, path: &str) {
    let _ = sftp.remove_file(path).await;
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Get (or lazily create) the local chat identity.
#[tauri::command]
pub fn chat_get_identity(app: AppHandle) -> Result<ChatIdentity, String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let store = load_store(&app);
    Ok(ChatIdentity {
        pubkey_b64:   encode_combined_pubkey(&id.x_pub, &id.sig.verifying_key()),
        short_id:     pubkey_short_id(&id.x_pub),
        display_name: store.display_name,
    })
}

/// Set the display name and return the updated identity.
#[tauri::command]
pub fn chat_set_display_name(app: AppHandle, name: String) -> Result<ChatIdentity, String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let mut store = load_store(&app);
    store.display_name = name.trim().to_string();
    save_store(&app, &store).map_err(|e| e.to_string())?;
    Ok(ChatIdentity {
        pubkey_b64:   encode_combined_pubkey(&id.x_pub, &id.sig.verifying_key()),
        short_id:     pubkey_short_id(&id.x_pub),
        display_name: store.display_name,
    })
}

/// List saved contacts.
#[tauri::command]
pub fn chat_list_contacts(app: AppHandle) -> Vec<ChatContact> {
    load_store(&app).contacts
}

/// Add a contact by their base64 public key.
#[tauri::command]
pub fn chat_add_contact(
    app: AppHandle,
    pubkey_b64: String,
    display_name: String,
) -> Result<ChatContact, String> {
    // Accept either combined `x.ed` form or legacy 32-byte X25519-only.
    // Either way we derive short_id from the X25519 part for stability.
    let (x_pub, _ed_pub) = parse_combined_pubkey(&pubkey_b64)
        .map_err(|e| e.to_string())?;
    let short_id = pubkey_short_id(&x_pub);

    let mut store = load_store(&app);
    if let Some(existing) = store.contacts.iter_mut().find(|c| c.pubkey_b64 == pubkey_b64) {
        // Update name if contact already exists
        existing.display_name = display_name.trim().to_string();
    } else {
        store.contacts.push(ChatContact {
            pubkey_b64:   pubkey_b64.clone(),
            short_id:     short_id.clone(),
            display_name: display_name.trim().to_string(),
        });
    }
    save_store(&app, &store).map_err(|e| e.to_string())?;

    Ok(ChatContact {
        pubkey_b64,
        short_id,
        display_name: display_name.trim().to_string(),
    })
}

/// Remove a contact.
#[tauri::command]
pub fn chat_remove_contact(app: AppHandle, pubkey_b64: String) -> Result<(), String> {
    let mut store = load_store(&app);
    store.contacts.retain(|c| c.pubkey_b64 != pubkey_b64);
    save_store(&app, &store).map_err(|e| e.to_string())
}

/// Write a presence beacon to the server so teammates can see you're online.
/// Call every ~60s to keep the beacon alive (TTL = 90s).
#[tauri::command]
pub async fn chat_announce_presence(
    session_id: String,
    sessions: tauri::State<'_, SessionStore>,
    app: AppHandle,
) -> Result<(), String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let store = load_store(&app);
    let beacon = PresenceBeacon {
        pubkey_b64:   encode_combined_pubkey(&id.x_pub, &id.sig.verifying_key()),
        short_id:     pubkey_short_id(&id.x_pub),
        display_name: if store.display_name.is_empty() {
            "Anonymous".into()
        } else {
            store.display_name
        },
        expires_at: now_secs() + 90,
    };
    let json = serde_json::to_string(&beacon).map_err(|e| e.to_string())?;

    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;
    sftp_mkdir(&sftp, "/tmp/.senu").await;
    sftp_mkdir(&sftp, PRESENCE_DIR).await;
    sftp_write_str(&sftp, &format!("{}/{}", PRESENCE_DIR, beacon.short_id), &json)
        .await
        .map_err(|e| e.to_string())
}

/// Return the list of users who have a live presence beacon on this server.
#[tauri::command]
pub async fn chat_get_online(
    session_id: String,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<Vec<OnlineUser>, String> {
    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;

    let entries = match sftp.read_dir(PRESENCE_DIR).await {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    let now = now_secs();
    let mut users = Vec::new();

    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let path = format!("{}/{}", PRESENCE_DIR, name);
        if let Ok(content) = sftp_read_str(&sftp, &path).await {
            if let Ok(beacon) = serde_json::from_str::<PresenceBeacon>(&content) {
                if beacon.expires_at > now {
                    users.push(OnlineUser {
                        pubkey_b64:   beacon.pubkey_b64,
                        short_id:     beacon.short_id,
                        display_name: beacon.display_name,
                    });
                }
            }
        }
    }

    Ok(users)
}

/// Encrypt and deliver a message to a contact's inbox on the shared server.
#[tauri::command]
pub async fn chat_send_message(
    session_id: String,
    recipient_pubkey_b64: String,
    content: String,
    is_snippet: bool,
    sessions: tauri::State<'_, SessionStore>,
    app: AppHandle,
) -> Result<(), String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let store = load_store(&app);

    let msg_id = uuid::Uuid::new_v4().to_string();
    let mut payload = MessagePayload {
        id:              msg_id.clone(),
        from_pubkey_b64: encode_combined_pubkey(&id.x_pub, &id.sig.verifying_key()),
        from_name:       if store.display_name.is_empty() {
            "Anonymous".into()
        } else {
            store.display_name
        },
        content,
        timestamp: now_secs(),
        is_snippet,
        sig: None,
    };
    // Sign canonical fields before serializing — sig field itself is not
    // part of the signed payload (we couldn't sign it before computing it).
    payload.sig = Some(sign_payload(&id.sig, &payload));

    let plaintext  = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let encrypted  = encrypt_for(&recipient_pubkey_b64, &plaintext).map_err(|e| e.to_string())?;

    // Determine recipient's inbox dir from their short ID. We use the X25519
    // half (combined or legacy) — short_id stays stable when a contact
    // upgrades to dual-key.
    let (rec_x_pub, _) = parse_combined_pubkey(&recipient_pubkey_b64)
        .map_err(|e| e.to_string())?;
    let rec_short_id = pubkey_short_id(&rec_x_pub);
    let inbox_dir    = format!("{}/{}", INBOX_BASE, rec_short_id);
    let msg_path     = format!("{}/{}", inbox_dir, msg_id);

    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;
    sftp_mkdir(&sftp, "/tmp/.senu").await;
    sftp_mkdir(&sftp, INBOX_BASE).await;
    sftp_mkdir(&sftp, &inbox_dir).await;
    sftp_write_str(&sftp, &msg_path, &encrypted)
        .await
        .map_err(|e| e.to_string())
}

/// Poll inbox for new messages — decrypt each file, then delete it immediately.
/// Messages are ephemeral: read once and gone.
#[tauri::command]
pub async fn chat_poll_messages(
    session_id: String,
    sessions: tauri::State<'_, SessionStore>,
    app: AppHandle,
) -> Result<Vec<ChatMessage>, String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let short_id  = pubkey_short_id(&id.x_pub);
    let inbox_dir = format!("{}/{}", INBOX_BASE, short_id);

    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;

    let entries = match sftp.read_dir(&inbox_dir).await {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    let mut messages = Vec::new();

    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." { continue; }
        let path = format!("{}/{}", inbox_dir, name);

        if let Ok(blob) = sftp_read_str(&sftp, &path).await {
            if let Ok(plaintext) = decrypt_blob(&id.x_priv, &blob) {
                if let Ok(payload) = serde_json::from_str::<MessagePayload>(&plaintext) {
                    // ── Authenticity check ────────────────────────────────
                    // Anyone with our X25519 pubkey (which is in
                    // /tmp/.senu/presence/) can encrypt a blob that
                    // decrypts cleanly and CLAIM to be from any sender.
                    // The Ed25519 signature is the only thing that proves
                    // the message actually came from `from_pubkey_b64`.
                    // Reject unsigned or invalid messages and drop them so
                    // they don't keep re-appearing on every poll.
                    let sig_b64 = match &payload.sig {
                        Some(s) => s.clone(),
                        None => {
                            log::warn!("chat: rejecting unsigned message {}", payload.id);
                            sftp_rm(&sftp, &path).await;
                            continue;
                        }
                    };
                    let mut for_verify = MessagePayload {
                        id:              payload.id.clone(),
                        from_pubkey_b64: payload.from_pubkey_b64.clone(),
                        from_name:       payload.from_name.clone(),
                        content:         payload.content.clone(),
                        timestamp:       payload.timestamp,
                        is_snippet:      payload.is_snippet,
                        sig:             None,
                    };
                    for_verify.sig = None;
                    if let Err(e) = verify_payload_sig(&for_verify, &sig_b64) {
                        log::warn!("chat: signature verify failed for {}: {}", payload.id, e);
                        sftp_rm(&sftp, &path).await;
                        continue;
                    }

                    messages.push(ChatMessage {
                        id:              payload.id,
                        from_pubkey_b64: payload.from_pubkey_b64,
                        from_name:       payload.from_name,
                        content:         payload.content,
                        timestamp:       payload.timestamp,
                        is_snippet:      payload.is_snippet,
                    });
                    sftp_rm(&sftp, &path).await;
                }
            }
        }
    }

    messages.sort_by_key(|m| m.timestamp);
    Ok(messages)
}

/// Clean up — remove presence beacon and any leftover inbox files.
/// Call on disconnect / app close.
#[tauri::command]
pub async fn chat_leave(
    session_id: String,
    sessions: tauri::State<'_, SessionStore>,
    app: AppHandle,
) -> Result<(), String> {
    let id = load_or_create_keypair(&app).map_err(|e| e.to_string())?;
    let short_id  = pubkey_short_id(&id.x_pub);
    let inbox_dir = format!("{}/{}", INBOX_BASE, short_id);

    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;

    // Remove presence beacon
    sftp_rm(&sftp, &format!("{}/{}", PRESENCE_DIR, short_id)).await;

    // Remove any stale inbox messages
    if let Ok(entries) = sftp.read_dir(&inbox_dir).await {
        for entry in entries {
            let name = entry.file_name();
            if name != "." && name != ".." {
                sftp_rm(&sftp, &format!("{}/{}", inbox_dir, name)).await;
            }
        }
        let _ = sftp.remove_dir(&inbox_dir).await;
    }

    Ok(())
}
