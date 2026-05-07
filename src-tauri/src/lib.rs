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

mod chat;
mod crypto;
mod dialog_commands;
mod error;
mod local;
mod log_viewer;
mod serial;
mod sftp;
mod ssh;
mod ssh_config;
mod ssh_keys;
mod storage;
mod telnet;
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
    let forwards: ssh::ForwardStore = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        // ─── Plugins ─────────────────────────────────────────────────────
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // ─── State ───────────────────────────────────────────────────────
        .manage(session_store)
        .manage(pending_verifications)
        .manage(trusted_hosts)
        .manage(session_logs)
        .manage(forwards)
        // ─── Window setup ────────────────────────────────────────────────
        .setup(|app| {
            // Window-style hooks below are macOS-only; on other platforms the
            // closure body is empty and the parameter would be flagged unused.
            let _ = &app;
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
            // Port forwarding
            ssh::ssh_forward_add,
            ssh::ssh_forward_remove,
            ssh::ssh_forward_list,
            // Local terminal + Docker
            local::local_connect,
            local::local_connect_admin,
            local::get_startup_admin_shell,
            local::list_shells,
            local::docker_connect,
            local::docker_list_containers,
            // Telnet
            telnet::telnet_connect,
            // Serial / COM port
            serial::serial_list_ports,
            serial::serial_connect,
            // SFTP
            sftp::sftp_list_dir,
            sftp::sftp_read_file,
            sftp::sftp_write_file,
            sftp::sftp_download_file,
            sftp::sftp_upload_file,
            // Log viewer
            log_viewer::read_local_log_tail,
            log_viewer::sftp_read_log_tail,
            // Storage — Servers
            storage::get_servers,
            storage::save_server,
            storage::delete_server,
            // Storage — Notes
            storage::get_notes,
            storage::save_note,
            storage::delete_note,
            // Storage — Folders
            storage::get_folders,
            storage::save_folder,
            storage::delete_folder,
            // Storage — Snippets
            storage::get_snippets,
            storage::save_snippet,
            storage::delete_snippet,
            // Storage — Workspace
            storage::get_workspace,
            storage::save_workspace,
            // Vault (system keychain — SSH credentials)
            vault::vault_save,
            vault::vault_load,
            vault::vault_delete,
            vault::vault_delete_server,
            // Chat (E2E encrypted ephemeral messaging via shared SSH server)
            chat::chat_get_identity,
            chat::chat_set_display_name,
            chat::chat_list_contacts,
            chat::chat_add_contact,
            chat::chat_remove_contact,
            chat::chat_announce_presence,
            chat::chat_get_online,
            chat::chat_send_message,
            chat::chat_poll_messages,
            chat::chat_leave,
            // SSH key tools (formerly under passwords/, now standalone)
            ssh_keys::vault_gen_ssh_key,
            ssh_keys::vault_save_key_dialog,
            ssh_keys::vault_push_key_to_server,
            // SSH Config import
            ssh_config::parse_ssh_config,
            // Dialog
            dialog_commands::pick_ssh_key,
            dialog_commands::save_markdown_dialog,
            // Window
            window_minimize,
            window_maximize,
            window_close,
            window_hide,
            net_probe,
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

#[tauri::command]
fn window_hide(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

/// TCP reachability probe — returns true if we could open a TCP connection
/// to host:port within timeout_ms. Used by the Home screen to show live
/// health dots next to each server.
#[tauri::command]
async fn net_probe(host: String, port: u16, timeout_ms: u64) -> Result<bool, String> {
    use std::time::Duration;
    let addr = format!("{host}:{port}");
    let fut = tokio::net::TcpStream::connect(addr);
    match tokio::time::timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(Ok(_stream)) => Ok(true),
        _ => Ok(false),
    }
}
