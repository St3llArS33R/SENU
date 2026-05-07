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

//! SSH key generation + key-file helpers.
//!
//! These commands used to live in `passwords/mod.rs` (under the legacy
//! `vault_*` naming) because they backed the Password Vault's "Generate
//! key" / "Push public key to server" actions. The Password Vault feature
//! was removed (2026-05-04, see backup/VAULT.md). The keygen helpers are
//! still used by `ServerModal`'s "Generate" button, so they were extracted
//! here to keep them alive.
//!
//! Tauri command names are preserved (`vault_gen_ssh_key`,
//! `vault_save_key_dialog`, `vault_push_key_to_server`) so the JS bridge
//! doesn't need to change. Renaming would be a churn-only refactor.

use serde::Serialize;

#[derive(Serialize)]
pub struct SshKeyPair {
    pub private_key_pem: String,
    pub public_key:      String,   // "ssh-ed25519 <b64> <comment>"
    pub key_type:        String,   // "ed25519" | "rsa-4096"
}

/// Generate an SSH keypair and return both keys as strings (nothing is written to disk yet).
#[tauri::command]
pub async fn vault_gen_ssh_key(key_type: String) -> Result<SshKeyPair, String> {
    use russh_keys::PublicKeyBase64;

    let keypair = match key_type.as_str() {
        "rsa" => russh_keys::key::KeyPair::generate_rsa(
            4096,
            russh_keys::key::SignatureHash::SHA2_256,
        ).ok_or_else(|| "RSA generation failed".to_string())?,
        _ => russh_keys::key::KeyPair::generate_ed25519()
            .ok_or_else(|| "Ed25519 generation failed".to_string())?,
    };

    // Private key → OpenSSH PEM (PKCS#8 wrapper)
    let mut pem_buf: Vec<u8> = Vec::new();
    russh_keys::encode_pkcs8_pem(&keypair, &mut pem_buf)
        .map_err(|e| format!("PEM encode: {e}"))?;
    let private_key_pem = String::from_utf8(pem_buf)
        .map_err(|e| e.to_string())?;

    // Public key → "ssh-ed25519 <b64> senu-generated"
    let pub_type = keypair.clone_public_key().map_err(|e| e.to_string())?.name();
    let pub_b64  = keypair.clone_public_key().map_err(|e| e.to_string())?.public_key_base64();
    let public_key = format!("{} {} senu-generated", pub_type, pub_b64);

    Ok(SshKeyPair {
        private_key_pem,
        public_key,
        key_type: if key_type == "rsa" { "rsa-4096".into() } else { "ed25519".into() },
    })
}

/// Show a native Save dialog and write the key content to the chosen path.
/// On Unix the file gets mode 0600. Returns the chosen path or null if cancelled.
#[tauri::command]
pub async fn vault_save_key_dialog(
    content:  String,
    filename: String,
    window:   tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::io::Write;

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    window
        .dialog()
        .file()
        .set_title("Save SSH Private Key")
        .set_file_name(&filename)
        .save_file(move |p| { let _ = tx.send(p.map(|x| x.to_string())); });

    let path = rx.await.map_err(|_| "Dialog cancelled".to_string())?;
    if let Some(ref p) = path {
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        { use std::os::unix::fs::OpenOptionsExt; opts.mode(0o600); }
        let mut f = opts.open(p).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Upload a public key string to a path on the server via SFTP.
/// Creates parent directories as needed. Returns the full remote path written.
#[tauri::command]
pub async fn vault_push_key_to_server(
    session_id:  String,
    public_key:  String,
    remote_path: String,
    sessions:    tauri::State<'_, crate::ssh::SessionStore>,
) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    use crate::sftp::open_sftp;

    let sftp = open_sftp(&session_id, &sessions).await.map_err(|e| e.to_string())?;

    // Try to create parent dirs (ignore errors — they may already exist)
    if let Some(parent) = remote_path.rsplit_once('/').map(|(p, _)| p) {
        if !parent.is_empty() {
            // Walk up the path components and try to create each
            let mut acc = String::new();
            for part in parent.split('/') {
                if part.is_empty() { acc.push('/'); continue; }
                if !acc.is_empty() && !acc.ends_with('/') { acc.push('/'); }
                acc.push_str(part);
                let _ = sftp.create_dir(&acc).await;
            }
        }
    }

    let mut file = sftp.create(&remote_path).await
        .map_err(|e| format!("create \"{remote_path}\": {e}"))?;
    file.write_all(public_key.as_bytes()).await
        .map_err(|e| format!("write: {e}"))?;
    file.flush().await
        .map_err(|e| format!("flush: {e}"))?;

    Ok(remote_path)
}
