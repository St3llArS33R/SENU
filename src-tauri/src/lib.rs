mod dialog_commands;
mod error;
mod sftp;
mod ssh;
mod storage;
mod vault;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub fn run() {
    env_logger::init();

    let session_store: ssh::SessionStore = Arc::new(Mutex::new(HashMap::new()));
    let pending_verifications: ssh::PendingVerifications = Arc::new(Mutex::new(HashMap::new()));
    let trusted_hosts: ssh::TrustedHostsCache = Arc::new(std::sync::Mutex::new(HashMap::new()));
    let session_logs: ssh::SessionLogs = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        // ─── Plugins ─────────────────────────────────────────────────────
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // ─── State ───────────────────────────────────────────────────────
        .manage(session_store)
        .manage(pending_verifications)
        .manage(trusted_hosts)
        .manage(session_logs)
        // ─── Window setup ────────────────────────────────────────────────
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let win = app.get_webview_window("main").unwrap();
                win.set_title_bar_style(TitleBarStyle::Overlay).unwrap();
                // Traffic light position — matches Electron config (14, 9)
                win.set_traffic_lights_inset(tauri::PhysicalPosition::new(14.0, 9.0))
                    .unwrap();
            }

            Ok(())
        })
        // ─── IPC Commands ────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            // SSH
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            ssh::ssh_send_input,
            ssh::ssh_resize,
            ssh::list_ssh_keys,
            ssh::ssh_generate_key,
            ssh::detect_ssh_agent,
            ssh::ssh_verify_host_key,
            ssh::ssh_start_log,
            ssh::ssh_append_log,
            ssh::ssh_stop_log,
            // SFTP
            sftp::sftp_list_dir,
            sftp::sftp_read_file,
            sftp::sftp_write_file,
            sftp::sftp_download_file,
            sftp::sftp_upload_file,
            // Storage — Servers
            storage::get_servers,
            storage::save_server,
            storage::delete_server,
            // Storage — Notes
            storage::get_notes,
            storage::save_note,
            storage::delete_note,
            // Storage — Snippets
            storage::get_snippets,
            storage::save_snippet,
            storage::delete_snippet,
            // Storage — Workspace
            storage::get_workspace,
            storage::save_workspace,
            // Vault (system keychain)
            vault::vault_save,
            vault::vault_load,
            vault::vault_delete,
            vault::vault_delete_server,
            // Dialog
            dialog_commands::pick_ssh_key,
            // Window
            window_minimize,
            window_maximize,
            window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SENU");
}

// ─── Window controls ─────────────────────────────────────────────────────────

#[tauri::command]
fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
