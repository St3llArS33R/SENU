use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use russh::client;
use russh_sftp::client::SftpSession;

use crate::error::SenuError;
use crate::ssh::{SessionStore, SenuSshHandler};

// ─── Public types (serialized to frontend) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub permissions: String,
    pub modified: Option<u64>,
    pub owner: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpReadResult {
    pub content: Vec<u8>,
    pub path: String,
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/// Open a new SFTP subsystem on the existing SSH session.
/// Clones the Arc (cheap) to release the sessions lock before any network I/O,
/// then locks the Handle only long enough to open a new channel.
async fn open_sftp(
    session_id: &str,
    sessions: &tauri::State<'_, SessionStore>,
) -> Result<SftpSession, SenuError> {
    // 1. Grab Arc clone, drop the sessions lock immediately
    let handle_arc: Arc<tokio::sync::Mutex<client::Handle<SenuSshHandler>>> = {
        let lock = sessions.lock().await;
        let h = lock
            .get(session_id)
            .ok_or_else(|| SenuError::Sftp(format!("Session not found: {session_id}")))?;
        Arc::clone(&h.ssh_handle)
    };

    // 2. Lock Handle only for channel_open_session, then release
    let channel: russh::Channel<client::Msg> = {
        let mut handle = handle_arc.lock().await;
        handle
            .channel_open_session()
            .await
            .map_err(|e| SenuError::Sftp(format!("channel_open_session: {e}")))?
    };

    // 3. Request SFTP subsystem on the new channel
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| SenuError::Sftp(format!("request_subsystem: {e}")))?;

    // 4. Hand the channel stream to russh-sftp
    SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| SenuError::Sftp(format!("SftpSession::new: {e}")))
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// List directory contents.
#[tauri::command]
pub async fn sftp_list_dir(
    session_id: String,
    path: String,
    sessions: tauri::State<'_, SessionStore>,
    _app: AppHandle,
) -> Result<Vec<FileEntry>, SenuError> {
    let sftp = open_sftp(&session_id, &sessions).await?;

    let read_dir = sftp
        .read_dir(&path)
        .await
        .map_err(|e| SenuError::Sftp(format!("read_dir \"{path}\": {e}")))?;

    let mut entries: Vec<FileEntry> = read_dir
        .into_iter()
        .filter(|e| {
            let n = e.file_name();
            n != "." && n != ".."
        })
        .map(|e| {
            let meta    = e.metadata();
            let name    = e.file_name();
            let is_dir  = e.file_type().is_dir();
            let full    = if path.ends_with('/') {
                format!("{}{}", path, name)
            } else {
                format!("{}/{}", path, name)
            };
            FileEntry {
                name:        name,
                path:        full,
                is_dir,
                size:        meta.size.unwrap_or(0),
                permissions: meta.permissions
                    .map(|p| format_permissions(p, is_dir))
                    .unwrap_or_default(),
                modified:    meta.mtime.map(|t| t as u64),
                owner:       String::new(),
            }
        })
        .collect();

    // Directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read file contents via SFTP. Returns raw bytes.
#[tauri::command]
pub async fn sftp_read_file(
    session_id: String,
    path: String,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<SftpReadResult, SenuError> {
    let sftp = open_sftp(&session_id, &sessions).await?;

    let mut file = sftp
        .open(&path)
        .await
        .map_err(|e| SenuError::Sftp(format!("open \"{path}\": {e}")))?;

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|e| SenuError::Sftp(format!("read \"{path}\": {e}")))?;

    Ok(SftpReadResult { content, path })
}

/// Write (create or truncate) file contents via SFTP.
#[tauri::command]
pub async fn sftp_write_file(
    session_id: String,
    path: String,
    content: Vec<u8>,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<(), SenuError> {
    let sftp = open_sftp(&session_id, &sessions).await?;

    let mut file = sftp
        .create(&path)
        .await
        .map_err(|e| SenuError::Sftp(format!("create \"{path}\": {e}")))?;

    file.write_all(&content)
        .await
        .map_err(|e| SenuError::Sftp(format!("write \"{path}\": {e}")))?;

    file.flush()
        .await
        .map_err(|e| SenuError::Sftp(format!("flush \"{path}\": {e}")))?;

    Ok(())
}

/// Download a remote file via SFTP — shows a native save dialog.
/// Returns the local path where the file was saved, or None if user cancelled.
#[tauri::command]
pub async fn sftp_download_file(
    session_id: String,
    remote_path: String,
    window: tauri::WebviewWindow,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<Option<String>, SenuError> {
    // 1. Derive default filename from remote path
    let filename = remote_path
        .split('/')
        .next_back()
        .unwrap_or("download")
        .to_string();

    // 2. Show native save dialog
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    window
        .dialog()
        .file()
        .set_title("Save File")
        .set_file_name(&filename)
        .save_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });

    let local_path = rx
        .await
        .map_err(|_| SenuError::Unknown("Dialog closed unexpectedly".into()))?;

    let local_path = match local_path {
        None => return Ok(None), // user cancelled
        Some(p) => p,
    };

    // 3. Read file content from remote via SFTP
    let sftp = open_sftp(&session_id, &sessions).await?;
    let mut file = sftp
        .open(&remote_path)
        .await
        .map_err(|e| SenuError::Sftp(format!("open \"{remote_path}\": {e}")))?;

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|e| SenuError::Sftp(format!("read \"{remote_path}\": {e}")))?;

    // 4. Write to local disk
    std::fs::write(&local_path, &content)?;

    Ok(Some(local_path))
}

/// Upload a local file to a remote directory via SFTP — shows a native open dialog.
/// Returns the remote filename that was uploaded, or None if user cancelled.
#[tauri::command]
pub async fn sftp_upload_file(
    session_id: String,
    remote_dir: String,
    window: tauri::WebviewWindow,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<Option<String>, SenuError> {
    // 1. Show native open-file dialog
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    window
        .dialog()
        .file()
        .set_title("Upload File")
        .pick_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });

    let local_path = rx
        .await
        .map_err(|_| SenuError::Unknown("Dialog closed unexpectedly".into()))?;

    let local_path = match local_path {
        None => return Ok(None), // user cancelled
        Some(p) => p,
    };

    // 2. Derive filename and build remote path
    let filename = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload")
        .to_string();

    let remote_path = if remote_dir.ends_with('/') {
        format!("{}{}", remote_dir, filename)
    } else {
        format!("{}/{}", remote_dir, filename)
    };

    // 3. Read local file
    let content = std::fs::read(&local_path)?;

    // 4. Write to remote via SFTP
    let sftp = open_sftp(&session_id, &sessions).await?;
    let mut file = sftp
        .create(&remote_path)
        .await
        .map_err(|e| SenuError::Sftp(format!("create \"{remote_path}\": {e}")))?;

    file.write_all(&content)
        .await
        .map_err(|e| SenuError::Sftp(format!("write \"{remote_path}\": {e}")))?;

    file.flush()
        .await
        .map_err(|e| SenuError::Sftp(format!("flush \"{remote_path}\": {e}")))?;

    Ok(Some(filename))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Convert Unix permission bits (u32) to "-rwxrwxrwx" string.
fn format_permissions(mode: u32, is_dir: bool) -> String {
    let kind = if is_dir { 'd' } else { '-' };
    let bits = [
        (0o400, 'r'), (0o200, 'w'), (0o100, 'x'),
        (0o040, 'r'), (0o020, 'w'), (0o010, 'x'),
        (0o004, 'r'), (0o002, 'w'), (0o001, 'x'),
    ];
    let s: String = bits
        .iter()
        .map(|(mask, ch)| if mode & mask != 0 { *ch } else { '-' })
        .collect();
    format!("{}{}", kind, s)
}
