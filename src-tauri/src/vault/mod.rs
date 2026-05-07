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

/// SENU — Credential Vault
///
/// Зберігає паролі та passphrase у системному keychain:
///   - Windows: Credential Manager
///   - macOS:   Keychain
///   - Linux:   libsecret / kwallet
///
/// Ключ запису: "{server_id}" або "{server_id}:passphrase"
/// Сервіс:      "senu"

use keyring::Entry;
use crate::error::SenuError;

const SERVICE: &str = "senu";

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn entry(account: &str) -> Result<Entry, SenuError> {
    Entry::new(SERVICE, account)
        .map_err(|e| SenuError::Vault(format!("keyring entry: {e}")))
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Зберегти пароль у keychain.
/// `secret_type`: "password" | "passphrase"
#[tauri::command]
pub async fn vault_save(
    server_id: String,
    secret: String,
    secret_type: String,
) -> Result<(), SenuError> {
    let account = vault_key(&server_id, &secret_type);
    entry(&account)?
        .set_password(&secret)
        .map_err(|e| SenuError::Vault(format!("set_password: {e}")))
}

/// Завантажити пароль із keychain. Повертає `null` якщо не знайдено.
#[tauri::command]
pub async fn vault_load(
    server_id: String,
    secret_type: String,
) -> Result<Option<String>, SenuError> {
    let account = vault_key(&server_id, &secret_type);
    match entry(&account)?.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SenuError::Vault(format!("get_password: {e}"))),
    }
}

/// Видалити пароль із keychain.
#[tauri::command]
pub async fn vault_delete(
    server_id: String,
    secret_type: String,
) -> Result<(), SenuError> {
    let account = vault_key(&server_id, &secret_type);
    match entry(&account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // вже відсутній — не помилка
        Err(e) => Err(SenuError::Vault(format!("delete_credential: {e}"))),
    }
}

/// Видалити всі секрети сервера (password + passphrase).
#[tauri::command]
pub async fn vault_delete_server(server_id: String) -> Result<(), SenuError> {
    for t in ["password", "passphrase"] {
        let account = vault_key(&server_id, t);
        match entry(&account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(SenuError::Vault(format!("delete_server: {e}"))),
        }
    }
    Ok(())
}

// ─── Internal ─────────────────────────────────────────────────────────────────

fn vault_key(server_id: &str, secret_type: &str) -> String {
    if secret_type == "password" {
        server_id.to_string()
    } else {
        format!("{}:{}", server_id, secret_type)
    }
}
