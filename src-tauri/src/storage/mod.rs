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

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::{Store, StoreExt};

use crate::crypto;
use crate::error::SenuError;

/// Keychain account name (legacy) and file name for the notes encryption key.
/// The keychain entry is read once for migration; the canonical store is now a
/// file in app_data_dir, mirroring chat/mod.rs because the Windows keyring
/// backend has been losing entries between runs and breaking decryption.
const NOTES_KEY_ACCOUNT: &str = "senu-notes-key";
const NOTES_KEY_FILE: &str = "notes.key";

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub key_path: Option<String>,
    pub group: Option<String>,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub notes: Option<String>,
    // Non-SSH connection types
    #[serde(default)]
    pub conn_type: Option<String>,
    #[serde(default)]
    pub local_shell: Option<String>,
    #[serde(default)]
    pub as_admin: Option<bool>,
    #[serde(default)]
    pub serial_port: Option<String>,
    #[serde(default)]
    pub baud_rate: Option<u32>,
    #[serde(default)]
    pub docker_container: Option<String>,
    #[serde(default)]
    pub docker_shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    #[serde(rename = "type")]
    pub link_type: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Persisted note shape. Extended in v2 to carry folder_id, links, file binding,
/// and createdAt. Legacy fields (server_id, folder, scope, bound_servers,
/// path_pattern) are kept solely so old notes.json deserializes cleanly during
/// migration; new code should not rely on them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(alias = "updated_at")]
    pub updated_at: String,

    #[serde(default, alias = "created_at", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, alias = "folder_id", skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<NoteLink>,

    // ── Legacy / backward-compat (do not rely on for new code) ───────────────
    #[serde(default, alias = "server_id", skip_serializing_if = "Option::is_none")]
    pub server_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, alias = "bound_servers", skip_serializing_if = "Vec::is_empty")]
    pub bound_servers: Vec<String>,
    #[serde(default, alias = "path_pattern", skip_serializing_if = "Option::is_none")]
    pub path_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_folder_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

// ─── Store helper ─────────────────────────────────────────────────────────────

fn get_store(app: &AppHandle, name: &str) -> Result<Arc<Store<tauri::Wry>>, SenuError> {
    app.store(name).map_err(|e| SenuError::Storage(e.to_string()))
}

// ─── Server CRUD ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_servers(app: AppHandle) -> Result<Vec<Server>, SenuError> {
    let store = get_store(&app, "servers.json")?;
    let servers: Vec<Server> = store
        .get("servers")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(servers)
}

#[tauri::command]
pub async fn save_server(app: AppHandle, server: Server) -> Result<(), SenuError> {
    let store = get_store(&app, "servers.json")?;
    let mut servers: Vec<Server> = store
        .get("servers")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    match servers.iter().position(|s| s.id == server.id) {
        Some(i) => servers[i] = server,
        None => servers.push(server),
    }

    store.set("servers", serde_json::to_value(&servers)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

#[tauri::command]
pub async fn delete_server(app: AppHandle, server_id: String) -> Result<(), SenuError> {
    let store = get_store(&app, "servers.json")?;
    let mut servers: Vec<Server> = store
        .get("servers")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    servers.retain(|s| s.id != server_id);
    store.set("servers", serde_json::to_value(&servers)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

// ─── Migration v2 ─────────────────────────────────────────────────────────────

/// Idempotent: walks existing notes, promotes legacy `folder: String` values
/// into proper Folder entities, and sets each note's `folder_id` accordingly.
/// Safe to call from any read path; no-op after the marker is set.
fn migrate_notes_v2(app: &AppHandle) -> Result<(), SenuError> {
    let notes_store = get_store(app, "notes.json")?;
    if notes_store
        .get("_migration_v2")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Ok(());
    }

    let mut notes: Vec<Note> = notes_store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let folders_store = get_store(app, "folders.json")?;
    let mut folders: Vec<Folder> = folders_store
        .get("folders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    use std::collections::HashMap;
    let mut by_name: HashMap<String, String> =
        folders.iter().map(|f| (f.name.clone(), f.id.clone())).collect();

    // Legacy folders have no real creation timestamp; use epoch as a stable marker.
    let legacy_ts = "1970-01-01T00:00:00Z".to_string();
    let mut notes_changed = false;
    let mut folders_changed = false;

    for n in notes.iter_mut() {
        if n.folder_id.is_some() {
            continue;
        }
        if let Some(name) = n.folder.as_ref().filter(|s| !s.is_empty()) {
            let id = if let Some(id) = by_name.get(name) {
                id.clone()
            } else {
                let id = format!("folder-{}", uuid::Uuid::new_v4());
                folders.push(Folder {
                    id: id.clone(),
                    name: name.clone(),
                    parent_folder_id: None,
                    created_at: legacy_ts.clone(),
                });
                by_name.insert(name.clone(), id.clone());
                folders_changed = true;
                id
            };
            n.folder_id = Some(id);
            notes_changed = true;
        }
    }

    if folders_changed {
        folders_store.set("folders", serde_json::to_value(&folders)?);
        folders_store
            .save()
            .map_err(|e| SenuError::Storage(e.to_string()))?;
    }
    if notes_changed {
        notes_store.set("notes", serde_json::to_value(&notes)?);
    }
    notes_store.set("_migration_v2", serde_json::Value::Bool(true));
    notes_store
        .save()
        .map_err(|e| SenuError::Storage(e.to_string()))?;
    Ok(())
}

// ─── Notes CRUD ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_notes(app: AppHandle, server_id: String) -> Result<Vec<Note>, SenuError> {
    migrate_notes_v2(&app)?;
    let store = get_store(&app, "notes.json")?;
    let notes: Vec<Note> = store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Decrypt content for each note. The crypto::decrypt helper passes plaintext
    // through unchanged (legacy notes), so we only need to handle the failure case
    // for genuinely encrypted blobs — typically a keychain mismatch after the
    // notes-key entry was lost. Showing the raw enc1: blob to the user is wrong;
    // we surface a localized marker instead and refuse to re-encrypt that on save.
    let key = crypto::get_or_create_key_file(&app, NOTES_KEY_ACCOUNT, NOTES_KEY_FILE).ok();
    let decrypted: Vec<Note> = notes
        .into_iter()
        .filter(|n| n.server_id.as_deref() == Some(server_id.as_str()))
        .map(|mut n| {
            if n.content.starts_with("enc1:") {
                match key.as_ref().map(|k| crypto::decrypt(k, &n.content)) {
                    Some(Ok(plain)) => n.content = plain,
                    Some(Err(e)) => {
                        log::warn!("[notes] decrypt failed for note {}: {e}", n.id);
                        n.content = "[⚠ нотатку не вдалося розшифрувати — ключ шифрування з Credential Manager змінено або втрачено. Дані неможливо відновити.]".into();
                    }
                    None => {
                        n.content = "[⚠ keychain недоступний — нотатка зашифрована, відкрийте пізніше]".into();
                    }
                }
            }
            n
        })
        .collect();

    Ok(decrypted)
}

#[tauri::command]
pub async fn save_note(app: AppHandle, note: Note) -> Result<(), SenuError> {
    let store = get_store(&app, "notes.json")?;
    let mut notes: Vec<Note> = store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Encrypt content before storing. Fall back to plaintext if keychain unavailable.
    // Refuse to encrypt the localized "decrypt failed" marker — that would silently
    // overwrite the (already-irrecoverable) original blob with a placeholder.
    let mut note_to_store = note;
    if note_to_store.content.starts_with("[⚠") {
        return Err(SenuError::Vault(
            "Cannot save: this note could not be decrypted. Edit the title only or delete it.".into(),
        ));
    }
    if let Ok(key) = crypto::get_or_create_key_file(&app, NOTES_KEY_ACCOUNT, NOTES_KEY_FILE) {
        note_to_store.content = crypto::encrypt(&key, &note_to_store.content)
            .unwrap_or(note_to_store.content);
    }

    match notes.iter().position(|n| n.id == note_to_store.id) {
        Some(i) => notes[i] = note_to_store,
        None    => notes.push(note_to_store),
    }

    store.set("notes", serde_json::to_value(&notes)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

#[tauri::command]
pub async fn delete_note(app: AppHandle, note_id: String) -> Result<(), SenuError> {
    let store = get_store(&app, "notes.json")?;
    let mut notes: Vec<Note> = store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    notes.retain(|n| n.id != note_id);
    store.set("notes", serde_json::to_value(&notes)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

// ─── Snippets CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_snippets(app: AppHandle) -> Result<Vec<Snippet>, SenuError> {
    let store = get_store(&app, "snippets.json")?;
    Ok(store
        .get("snippets")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn save_snippet(app: AppHandle, snippet: Snippet) -> Result<(), SenuError> {
    let store = get_store(&app, "snippets.json")?;
    let mut snippets: Vec<Snippet> = store
        .get("snippets")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    match snippets.iter().position(|s| s.id == snippet.id) {
        Some(i) => snippets[i] = snippet,
        None => snippets.push(snippet),
    }

    store.set("snippets", serde_json::to_value(&snippets)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

#[tauri::command]
pub async fn delete_snippet(app: AppHandle, snippet_id: String) -> Result<(), SenuError> {
    let store = get_store(&app, "snippets.json")?;
    let mut snippets: Vec<Snippet> = store
        .get("snippets")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    snippets.retain(|s| s.id != snippet_id);
    store.set("snippets", serde_json::to_value(&snippets)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

// ─── Folders CRUD ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_folders(app: AppHandle) -> Result<Vec<Folder>, SenuError> {
    migrate_notes_v2(&app)?;
    let store = get_store(&app, "folders.json")?;
    Ok(store
        .get("folders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn save_folder(app: AppHandle, folder: Folder) -> Result<(), SenuError> {
    let store = get_store(&app, "folders.json")?;
    let mut folders: Vec<Folder> = store
        .get("folders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    match folders.iter().position(|f| f.id == folder.id) {
        Some(i) => folders[i] = folder,
        None => folders.push(folder),
    }

    store.set("folders", serde_json::to_value(&folders)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}

#[tauri::command]
pub async fn delete_folder(app: AppHandle, folder_id: String) -> Result<(), SenuError> {
    let store = get_store(&app, "folders.json")?;
    let mut folders: Vec<Folder> = store
        .get("folders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    folders.retain(|f| f.id != folder_id);
    store.set("folders", serde_json::to_value(&folders)?);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))?;

    // Detach notes from the deleted folder.
    let notes_store = get_store(&app, "notes.json")?;
    let mut notes: Vec<Note> = notes_store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mut changed = false;
    for n in notes.iter_mut() {
        if n.folder_id.as_deref() == Some(folder_id.as_str()) {
            n.folder_id = None;
            changed = true;
        }
    }
    if changed {
        notes_store.set("notes", serde_json::to_value(&notes)?);
        notes_store
            .save()
            .map_err(|e| SenuError::Storage(e.to_string()))?;
    }
    Ok(())
}

// ─── Workspace ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_workspace(app: AppHandle) -> Result<serde_json::Value, SenuError> {
    let store = get_store(&app, "workspace.json")?;
    Ok(store.get("workspace").unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub async fn save_workspace(app: AppHandle, workspace: serde_json::Value) -> Result<(), SenuError> {
    let store = get_store(&app, "workspace.json")?;
    store.set("workspace", workspace);
    store.save().map_err(|e| SenuError::Storage(e.to_string()))
}
