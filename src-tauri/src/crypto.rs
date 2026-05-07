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

/// SENU — shared AES-256-GCM encryption helpers
///
/// Keys are stored in the OS keychain (same `keyring` crate the vault uses).
/// Ciphertext format on disk:  "enc1:<base64(12-byte nonce || ciphertext || 16-byte GCM tag)>"
/// The "enc1:" prefix lets us transparently migrate legacy plaintext data.

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use keyring::Entry;
use rand::rngs::OsRng;
use tauri::{AppHandle, Manager};

use crate::error::SenuError;

const KEYRING_SERVICE: &str = "senu";
/// Prefix that marks an encrypted blob. Anything without this prefix is treated
/// as legacy plaintext and returned as-is (transparent migration).
const ENC_PREFIX: &str = "enc1:";

// ── Key management ────────────────────────────────────────────────────────────
//
// Historical note: an earlier `get_or_create_key(account)` returned the key
// straight from the OS keychain. The Windows backend dropped keys between
// runs ("notes won't decrypt"), so we migrated everyone to the file-backed
// variant below. The keyring-only function was removed once Password Vault
// (its last user) was retired.

/// File-backed variant. The Windows `keyring` backend has lost notes-encryption
/// keys between runs (see chat/mod.rs for the same workaround). We mirror that
/// approach here: store the key in app_data_dir as base64. On first call, if a
/// pre-existing keychain entry exists under `account`, we adopt it (so notes
/// already encrypted under the keychain key remain decryptable).
pub fn get_or_create_key_file(
    app: &AppHandle,
    account: &str,
    filename: &str,
) -> Result<[u8; 32], SenuError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| SenuError::Vault(format!("app_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| SenuError::Vault(format!("create app_data_dir: {e}")))?;
    let key_path = dir.join(filename);

    if key_path.exists() {
        let b64 = std::fs::read_to_string(&key_path)
            .map_err(|e| SenuError::Vault(format!("read key file: {e}")))?;
        let bytes = B64
            .decode(b64.trim())
            .map_err(|e| SenuError::Vault(format!("key decode: {e}")))?;
        if bytes.len() != 32 {
            return Err(SenuError::Vault(format!(
                "key length invalid: {} bytes",
                bytes.len()
            )));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        return Ok(arr);
    }

    // No file yet — try to adopt an existing keychain key first (one-time migration).
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, account) {
        if let Ok(b64) = entry.get_password() {
            if let Ok(bytes) = B64.decode(&b64) {
                if bytes.len() == 32 {
                    std::fs::write(&key_path, &b64)
                        .map_err(|e| SenuError::Vault(format!("write key file: {e}")))?;
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    return Ok(arr);
                }
            }
        }
    }

    // No keychain entry either — generate fresh and persist to file.
    let mut key = [0u8; 32];
    rand::RngCore::fill_bytes(&mut OsRng, &mut key);
    std::fs::write(&key_path, B64.encode(key))
        .map_err(|e| SenuError::Vault(format!("write key file: {e}")))?;
    Ok(key)
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/// Encrypt `plaintext` and return `"enc1:<base64(nonce||ct)>"`.
pub fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<String, SenuError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 12 random bytes
    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| SenuError::Vault("AES-GCM encrypt failed".into()))?;

    let mut combined = nonce.to_vec(); // 12 bytes
    combined.extend_from_slice(&ct);  // ciphertext + 16-byte tag
    Ok(format!("{}{}", ENC_PREFIX, B64.encode(&combined)))
}

/// Decrypt `"enc1:<base64>"` → plaintext.
/// If `data` has no prefix (legacy plaintext), returns it unchanged.
pub fn decrypt(key: &[u8; 32], data: &str) -> Result<String, SenuError> {
    let b64 = match data.strip_prefix(ENC_PREFIX) {
        Some(s) => s,
        None => return Ok(data.to_string()), // legacy / unencrypted — pass through
    };

    let combined = B64
        .decode(b64)
        .map_err(|e| SenuError::Vault(format!("b64 decode: {e}")))?;

    if combined.len() < 12 {
        return Err(SenuError::Vault("ciphertext too short".into()));
    }

    let (nonce_bytes, ct) = combined.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    let plain = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ct)
        .map_err(|_| SenuError::Vault("AES-GCM decrypt failed (wrong key or tampered data)".into()))?;

    String::from_utf8(plain).map_err(|e| SenuError::Vault(format!("utf8: {e}")))
}
