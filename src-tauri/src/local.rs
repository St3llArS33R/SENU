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
use std::sync::Arc;
use portable_pty::{CommandBuilder, PtySize, native_pty_system, MasterPty};
use uuid::Uuid;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

use crate::error::SenuError;
use crate::ssh::{SessionStore, SessionHandle, SshChannelMsg, ConnectResult,
                 TerminalDataEvent, TerminalCloseEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerContainer {
    pub id:     String,
    pub name:   String,
    pub image:  String,
    pub status: String,
}

fn default_shell() -> String {
    #[cfg(windows)]
    { std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()) }
    #[cfg(not(windows))]
    { std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()) }
}

#[tauri::command]
pub async fn list_shells() -> Vec<String> {
    tokio::task::spawn_blocking(|| {
        let mut shells = Vec::new();
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            if std::process::Command::new("where")
                .arg("pwsh")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|o| o.status.success()).unwrap_or(false)
            {
                shells.push("pwsh.exe".into());
            }
            shells.push("powershell.exe".into());
            shells.push("cmd.exe".into());
            if std::process::Command::new("wsl")
                .arg("--status")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|o| o.status.success()).unwrap_or(false)
            {
                shells.push("wsl.exe".into());
            }
        }
        #[cfg(not(windows))]
        {
            if let Ok(s) = std::env::var("SHELL") { shells.push(s); }
            for s in &["/bin/zsh", "/bin/bash", "/bin/sh", "/usr/bin/fish"] {
                if std::path::Path::new(s).exists() && !shells.contains(&s.to_string()) {
                    shells.push(s.to_string());
                }
            }
        }
        shells
    })
    .await
    .unwrap_or_default()
}

/// Spawn a local shell with a real PTY.
#[tauri::command]
pub async fn local_connect(
    shell: Option<String>,
    cwd:   Option<String>,
    sessions:   tauri::State<'_, SessionStore>,
    app_handle: AppHandle,
) -> Result<ConnectResult, SenuError> {
    let session_id = Uuid::new_v4().to_string();
    let shell_path = shell.unwrap_or_else(default_shell);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 40, cols: 220, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| SenuError::Io(format!("openpty: {e}")))?;

    let mut cmd = CommandBuilder::new(&shell_path);
    if let Some(dir) = cwd { cmd.cwd(dir); }

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| SenuError::Io(format!("spawn {shell_path}: {e}")))?;
    drop(pair.slave);

    spawn_pty_tasks(session_id.clone(), pair.master, child, app_handle, &sessions).await?;
    Ok(ConnectResult { session_id })
}

/// Open a shell inside a running Docker container via `docker exec -it`.
#[tauri::command]
pub async fn docker_connect(
    container: String,
    shell:     Option<String>,
    sessions:   tauri::State<'_, SessionStore>,
    app_handle: AppHandle,
) -> Result<ConnectResult, SenuError> {
    let session_id = Uuid::new_v4().to_string();
    let sh = shell.unwrap_or_else(|| "sh".into());

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 40, cols: 220, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| SenuError::Io(format!("openpty: {e}")))?;

    let mut cmd = CommandBuilder::new("docker");
    cmd.args(["exec", "-it", &container, &sh]);

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| SenuError::Io(format!("docker exec: {e}")))?;
    drop(pair.slave);

    spawn_pty_tasks(session_id.clone(), pair.master, child, app_handle, &sessions).await?;
    Ok(ConnectResult { session_id })
}

/// List running Docker containers (requires docker CLI in PATH).
/// Uses a 3-second timeout so the UI doesn't hang if Docker isn't running.
#[tauri::command]
pub async fn docker_list_containers() -> Result<Vec<DockerContainer>, SenuError> {
    // CREATE_NO_WINDOW prevents a console window from flashing on Windows
    // when ServerModal probes for containers on mount. Without this flag a
    // brief CMD window appears every time the user opens "Add server".
    let mut cmd = tokio::process::Command::new("docker");
    // tokio::process::Command exposes creation_flags() directly on Windows
    // (no std::os::windows::process::CommandExt needed) — used to suppress
    // the conhost console window that briefly flashes on every probe.
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let out = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        cmd.args(["ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}"])
            .output(),
    )
    .await
    .map_err(|_| SenuError::Io("docker timed out".into()))?
    .map_err(|e| SenuError::Io(format!("docker not found: {e}")))?;
    let s = String::from_utf8_lossy(&out.stdout);
    Ok(s.lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let p: Vec<&str> = line.splitn(4, '\t').collect();
            (p.len() >= 3).then(|| DockerContainer {
                id:     p[0].into(),
                name:   p[1].into(),
                image:  p[2].into(),
                status: p.get(3).unwrap_or(&"").to_string(),
            })
        })
        .collect())
}

// ─── Admin shell — new elevated SENU window ───────────────────────────────────

/// Launch a new SENU window elevated via UAC.
/// The new instance receives `--admin-shell <shell>` and auto-opens it as a tab.
/// The calling window stays open unchanged.
#[tauri::command]
pub async fn local_connect_admin(shell: Option<String>) -> Result<(), SenuError> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let exe = std::env::current_exe()
            .map_err(|e| SenuError::Io(e.to_string()))?;
        let sh = shell.unwrap_or_else(|| "powershell.exe".into());
        // Pass the shell to the new elevated instance via CLI arg
        let params = format!("--admin-shell \"{}\"", sh.replace('"', "\\\""));

        tokio::task::spawn_blocking(move || {
            #[link(name = "Shell32")]
            extern "system" {
                fn ShellExecuteW(
                    hwnd:      *mut std::ffi::c_void,
                    operation: *const u16,
                    file:      *const u16,
                    params:    *const u16,
                    directory: *const u16,
                    show:      i32,
                ) -> *mut std::ffi::c_void;
            }
            fn wide(s: &str) -> Vec<u16> {
                OsStr::new(s).encode_wide().chain(Some(0u16)).collect()
            }
            let verb   = wide("runas");
            let file   = wide(&exe.to_string_lossy());
            let par    = wide(&params);
            let ret = unsafe {
                ShellExecuteW(
                    std::ptr::null_mut(),
                    verb.as_ptr(),
                    file.as_ptr(),
                    par.as_ptr(),
                    std::ptr::null(),
                    1, // SW_SHOWNORMAL
                )
            } as isize;
            if ret <= 32 {
                Err(SenuError::Io(if ret == 5 {
                    "UAC cancelled".into()
                } else {
                    format!("ShellExecuteW error {ret}")
                }))
            } else {
                Ok(())
            }
        })
        .await
        .map_err(|e| SenuError::Io(e.to_string()))?
    }
    #[cfg(not(windows))]
    {
        let _ = shell;
        Err(SenuError::Io("Admin shell is Windows-only".into()))
    }
}

/// Called by the frontend on startup to check if this instance was launched
/// with `--admin-shell <shell>`.  Returns the shell path, or null.
#[tauri::command]
pub fn get_startup_admin_shell() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.windows(2)
        .find(|w| w[0] == "--admin-shell")
        .map(|w| w[1].clone())
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async fn spawn_pty_tasks(
    session_id: String,
    master:    Box<dyn MasterPty + Send>,
    mut child: Box<dyn portable_pty::Child + Send>,
    app_handle: AppHandle,
    sessions:  &tauri::State<'_, SessionStore>,
) -> Result<(), SenuError> {
    let master_arc: Arc<std::sync::Mutex<Box<dyn MasterPty + Send>>> =
        Arc::new(std::sync::Mutex::new(master));

    let mut reader = master_arc.lock().unwrap()
        .try_clone_reader()
        .map_err(|e| SenuError::Io(format!("clone_reader: {e}")))?;
    let writer = master_arc.lock().unwrap()
        .take_writer()
        .map_err(|e| SenuError::Io(format!("take_writer: {e}")))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SshChannelMsg>();

    // ── Read task: PTY output → frontend ──────────────────────────────────────
    let sid_r = session_id.clone();
    let app_r = app_handle.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = child.wait();
                    let _ = app_r.emit("terminal_close", TerminalCloseEvent {
                        session_id: sid_r, exit_code: None,
                    });
                    break;
                }
                Ok(n) => {
                    let _ = app_r.emit("terminal_data", TerminalDataEvent {
                        session_id: sid_r.clone(),
                        data: buf[..n].to_vec(),
                    });
                }
            }
        }
    });

    // ── Write/control task: frontend input → PTY ──────────────────────────────
    let master_w = master_arc.clone();
    std::thread::spawn(move || {
        let mut w = writer;
        loop {
            match rx.blocking_recv() {
                Some(SshChannelMsg::Data(data)) => {
                    let _ = w.write_all(&data);
                }
                Some(SshChannelMsg::Resize { cols, rows }) => {
                    if let Ok(m) = master_w.lock() {
                        let _ = m.resize(PtySize {
                            rows: rows as u16,
                            cols: cols as u16,
                            pixel_width:  0,
                            pixel_height: 0,
                        });
                    }
                }
                Some(SshChannelMsg::Close) | None => break,
            }
        }
    });

    sessions.lock().await.insert(session_id, SessionHandle {
        channel_tx:   tx,
        ssh_handle:   None,
        _jump_session: None,
    });
    Ok(())
}
