use crate::error::SenuError;
use tauri_plugin_dialog::DialogExt;

/// Opens a native file picker dialog associated with the given window,
/// so it appears correctly on Windows even with a frameless (decorations: false) window.
/// Returns the selected file path as a String, or None if the user cancelled.
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
