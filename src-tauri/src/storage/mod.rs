use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::{Store, StoreExt};

use crate::error::SenuError;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
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

// ─── Notes CRUD ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_notes(app: AppHandle, server_id: String) -> Result<Vec<Note>, SenuError> {
    let store = get_store(&app, "notes.json")?;
    let notes: Vec<Note> = store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(notes.into_iter().filter(|n| n.server_id == server_id).collect())
}

#[tauri::command]
pub async fn save_note(app: AppHandle, note: Note) -> Result<(), SenuError> {
    let store = get_store(&app, "notes.json")?;
    let mut notes: Vec<Note> = store
        .get("notes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    match notes.iter().position(|n| n.id == note.id) {
        Some(i) => notes[i] = note,
        None => notes.push(note),
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
