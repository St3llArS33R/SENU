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
