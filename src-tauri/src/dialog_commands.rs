use crate::error::SenuError;
use tauri_plugin_dialog::DialogExt;

/// Opens a native file picker dialog associated with the given window.
/// Returns the selected file path, or None if the user cancelled.
#[tauri::command]
pub async fn pick_ssh_key(window: tauri::WebviewWindow) -> Result<Option<String>, SenuError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();

    window
        .dialog()
        .file()
        .set_title("Select SSH Private Key")
        .pick_file(move |file_path| {
            let path_str = file_path.map(|p| p.to_string());
            let _ = tx.send(path_str);
        });

    rx.await
        .map_err(|_| SenuError::Unknown("File dialog closed unexpectedly".into()))
}

/// Opens a native "Save As" dialog and writes the given content to the chosen path.
/// Returns the saved path, or None if the user cancelled.
#[tauri::command]
pub async fn save_markdown_dialog(
    window: tauri::WebviewWindow,
    filename: String,
    content: String,
) -> Result<Option<String>, SenuError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<std::path::PathBuf>>();

    window
        .dialog()
        .file()
        .set_title("Export Notes")
        .set_file_name(&filename)
        .add_filter("Markdown", &["md"])
        .add_filter("Text", &["txt"])
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.into_path().ok()));
        });

    let path = rx
        .await
        .map_err(|_| SenuError::Unknown("Save dialog closed unexpectedly".into()))?;

    if let Some(p) = &path {
        std::fs::write(p, content.as_bytes())
            .map_err(|e| SenuError::Unknown(format!("Failed to write file: {e}")))?;
    }

    Ok(path.map(|p| p.to_string_lossy().to_string()))
}
