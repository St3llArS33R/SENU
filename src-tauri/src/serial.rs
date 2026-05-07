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

use std::io::{Read, Write};
use std::time::Duration;
use uuid::Uuid;
use tauri::{AppHandle, Emitter};

use crate::error::SenuError;
use crate::ssh::{SessionStore, SessionHandle, SshChannelMsg, ConnectResult,
                 TerminalDataEvent, TerminalCloseEvent};

/// List available serial/COM ports on this machine.
/// Runs in a blocking thread to avoid freezing the UI.
#[tauri::command]
pub async fn serial_list_ports() -> Result<Vec<String>, SenuError> {
    tokio::task::spawn_blocking(|| {
        serialport::available_ports()
            .map(|ps| ps.into_iter().map(|p| p.port_name).collect::<Vec<_>>())
            .unwrap_or_default()
    })
    .await
    .map_err(|e| SenuError::Io(format!("spawn_blocking: {e}")))
}

/// Open a serial port and attach it to a terminal session.
#[tauri::command]
pub async fn serial_connect(
    port:      String,
    baud_rate: u32,
    sessions:   tauri::State<'_, SessionStore>,
    app_handle: AppHandle,
) -> Result<ConnectResult, SenuError> {
    let session_id = Uuid::new_v4().to_string();

    let serial = serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| SenuError::Io(format!("Cannot open {port} @ {baud_rate}: {e}")))?;

    let mut reader = serial.try_clone()
        .map_err(|e| SenuError::Io(format!("Cannot clone serial port: {e}")))?;
    let mut writer = serial;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SshChannelMsg>();

    // ── Read task: serial RX → frontend ──────────────────────────────────────
    let sid_r = session_id.clone();
    let app_r = app_handle.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 256];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let _ = app_r.emit("terminal_data", TerminalDataEvent {
                        session_id: sid_r.clone(),
                        data: buf[..n].to_vec(),
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // 50 ms read timeout — normal, just loop
                }
                Ok(0) | Err(_) => {
                    let _ = app_r.emit("terminal_close", TerminalCloseEvent {
                        session_id: sid_r, exit_code: None,
                    });
                    break;
                }
                Ok(_) => {}
            }
        }
    });

    // ── Write task: frontend input → serial TX ────────────────────────────────
    std::thread::spawn(move || {
        loop {
            match rx.blocking_recv() {
                Some(SshChannelMsg::Data(data)) => {
                    let _ = writer.write_all(&data);
                }
                Some(SshChannelMsg::Resize { .. }) => {
                    // Serial ports have no window size concept — ignore
                }
                Some(SshChannelMsg::Close) | None => break,
            }
        }
    });

    sessions.lock().await.insert(session_id.clone(), SessionHandle {
        channel_tx:   tx,
        ssh_handle:   None,
        _jump_session: None,
    });

    Ok(ConnectResult { session_id })
}
