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
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use uuid::Uuid;
use tauri::{AppHandle, Emitter};

use crate::error::SenuError;
use crate::ssh::{SessionStore, SessionHandle, SshChannelMsg, ConnectResult,
                 TerminalDataEvent, TerminalCloseEvent};

// ─── Telnet IAC constants ─────────────────────────────────────────────────────
const IAC:  u8 = 0xFF;
const WILL: u8 = 0xFB;
const WONT: u8 = 0xFC;
const DO:   u8 = 0xFD;
const DONT: u8 = 0xFE;
const SB:   u8 = 0xFA; // Subnegotiation begin
const SE:   u8 = 0xF0; // Subnegotiation end

const OPT_ECHO:        u8 = 0x01;
const OPT_SUPPRESS_GA: u8 = 0x03;
const OPT_NAWS:        u8 = 0x1F; // Negotiate About Window Size

/// Connect to a Telnet host.
#[tauri::command]
pub async fn telnet_connect(
    host: String,
    port: u16,
    sessions:   tauri::State<'_, SessionStore>,
    app_handle: AppHandle,
) -> Result<ConnectResult, SenuError> {
    let session_id = Uuid::new_v4().to_string();
    let addr = format!("{}:{}", host, port);

    let stream = TcpStream::connect(&addr).await
        .map_err(|e| SenuError::SshConnect(format!("telnet {addr}: {e}")))?;

    let (mut rdr, wtr) = stream.into_split();
    let wtr = Arc::new(Mutex::new(wtr));
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SshChannelMsg>();

    // ── Read task: receive data, strip/respond to IAC sequences ──────────────
    let sid_r   = session_id.clone();
    let app_r   = app_handle.clone();
    let wtr_neg = Arc::clone(&wtr);

    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        let mut out = Vec::with_capacity(4096);

        loop {
            let n = match rdr.read(&mut buf).await {
                Ok(0) | Err(_) => {
                    let _ = app_r.emit("terminal_close", TerminalCloseEvent {
                        session_id: sid_r, exit_code: None,
                    });
                    return;
                }
                Ok(n) => n,
            };

            out.clear();
            let data = &buf[..n];
            let mut i = 0;
            while i < data.len() {
                if data[i] == IAC && i + 1 < data.len() {
                    let cmd = data[i + 1];
                    match cmd {
                        WILL | WONT | DO | DONT if i + 2 < data.len() => {
                            let opt = data[i + 2];
                            let resp = negotiate(cmd, opt);
                            if !resp.is_empty() {
                                let _ = wtr_neg.lock().await.write_all(&resp).await;
                            }
                            i += 3;
                        }
                        SB => {
                            // Skip subnegotiation block: find IAC SE
                            i += 2;
                            while i + 1 < data.len() {
                                if data[i] == IAC && data[i + 1] == SE { i += 2; break; }
                                i += 1;
                            }
                        }
                        _ => { i += 2; }
                    }
                } else {
                    out.push(data[i]);
                    i += 1;
                }
            }

            if !out.is_empty() {
                let _ = app_r.emit("terminal_data", TerminalDataEvent {
                    session_id: sid_r.clone(),
                    data: out.clone(),
                });
            }
        }
    });

    // ── Write task: send data / NAWS resize ───────────────────────────────────
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Some(SshChannelMsg::Data(data)) => {
                    let _ = wtr.lock().await.write_all(&data).await;
                }
                Some(SshChannelMsg::Resize { cols, rows }) => {
                    // RFC 1073 NAWS subnegotiation
                    let naws: [u8; 9] = [
                        IAC, SB, OPT_NAWS,
                        (cols >> 8) as u8, (cols & 0xFF) as u8,
                        (rows >> 8) as u8, (rows & 0xFF) as u8,
                        IAC, SE,
                    ];
                    let _ = wtr.lock().await.write_all(&naws).await;
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

/// Minimal Telnet option negotiation.
fn negotiate(cmd: u8, opt: u8) -> Vec<u8> {
    match (cmd, opt) {
        (WILL, OPT_ECHO)        => vec![IAC, DO,   opt], // let server echo
        (WILL, OPT_SUPPRESS_GA) => vec![IAC, DO,   opt], // agree
        (DO,   OPT_NAWS)        => vec![IAC, WILL, opt], // we support NAWS
        (DO,   _)               => vec![IAC, WONT, opt], // decline anything else
        (WILL, _)               => vec![IAC, DONT, opt], // reject anything else
        _                       => vec![],
    }
}
