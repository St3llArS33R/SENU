use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use async_trait::async_trait;
use russh::client::{self, Handler, Session};
use russh::ChannelId;
use russh_keys::key::PublicKey;
use russh_keys::load_secret_key;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tauri::{AppHandle, Emitter};
use zeroize::Zeroize;

use crate::error::SenuError;

// ─── In-memory trusted hosts cache ───────────────────────────────────────────
// Key: "[host]:port" or "host" (port 22), Value: key_b64
// Avoids re-asking within the same app session even if file write fails.
pub type TrustedHostsCache = Arc<std::sync::Mutex<HashMap<String, String>>>;

// ─── Known-hosts pending verifications ───────────────────────────────────────

/// Дані що зберігаються поки frontend не відповів на запит підтвердження ключа.
pub struct PendingVerification {
    pub tx:       tokio::sync::oneshot::Sender<bool>,
    pub host:     String,
    pub port:     u16,
    pub key_b64:  String,   // public_key_base64() — для запису в known_hosts
    pub key_type: String,   // "ssh-ed25519" тощо
}

pub type PendingVerifications = Arc<Mutex<HashMap<SessionId, PendingVerification>>>;

// ─── Known-hosts helpers ──────────────────────────────────────────────────────

fn known_hosts_file() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"))
}

/// Перевіряємо known_hosts вручну, порівнюючи base64 wire format.
enum KnownHostsCheck { Trusted, Mismatch, Unknown }

fn check_known_hosts(host: &str, port: u16, server_key_b64: &str) -> KnownHostsCheck {
    let path = match known_hosts_file() {
        Some(p) if p.exists() => p,
        _ => return KnownHostsCheck::Unknown,
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return KnownHostsCheck::Unknown,
    };

    // known_hosts рядок для цього хоста
    let host_entry = if port == 22 {
        host.to_string()
    } else {
        format!("[{}]:{}", host, port)
    };

    let mut found_host = false;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }

        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() < 3 { continue; }

        let hosts_field = parts[0];
        let key_b64_in_file = parts[2].split_whitespace().next().unwrap_or("");

        // Перевіряємо чи рядок стосується нашого хоста
        let matches_host = hosts_field.split(',').any(|h| {
            let h = h.trim();
            h == host_entry || h == host
        });
        if !matches_host { continue; }

        found_host = true;
        if key_b64_in_file == server_key_b64 {
            return KnownHostsCheck::Trusted;
        }
    }

    if found_host {
        KnownHostsCheck::Mismatch  // Хост знайдено але ключ інший (MITM?)
    } else {
        KnownHostsCheck::Unknown   // Хост не знайдено — вперше
    }
}

/// Додає ключ до ~/.ssh/known_hosts
fn add_to_known_hosts(host: &str, port: u16, key_b64: &str, key_type: &str) {
    let path = match known_hosts_file() {
        Some(p) => p,
        None => {
            log::warn!("known_hosts: cannot determine home dir");
            return;
        }
    };
    // Ensure ~/.ssh/ exists (may not exist on fresh Windows installs)
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("known_hosts: cannot create {:?}: {}", parent, e);
            return;
        }
    }
    let host_entry = if port == 22 {
        host.to_string()
    } else {
        format!("[{}]:{}", host, port)
    };
    let line = format!("{} {} {}\n", host_entry, key_type, key_b64);
    use std::io::Write;
    match std::fs::OpenOptions::new().append(true).create(true).open(&path) {
        Ok(mut f) => {
            if let Err(e) = f.write_all(line.as_bytes()) {
                log::warn!("known_hosts: write error: {}", e);
            } else {
                log::info!("known_hosts: added {} ({})", host_entry, key_type);
            }
        }
        Err(e) => {
            log::warn!("known_hosts: cannot open {:?}: {}", path, e);
        }
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

pub type SessionId = String;
pub type SessionStore = Arc<Mutex<HashMap<SessionId, SshSessionHandle>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectOptions {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    pub jump_host: Option<Box<ConnectOptions>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthMethod {
    Password { password: String },
    Key { key_path: String, passphrase: Option<String> },
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectResult {
    pub session_id: SessionId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalDataEvent {
    pub session_id: SessionId,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalCloseEvent {
    pub session_id: SessionId,
    pub exit_code: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalErrorEvent {
    pub session_id: SessionId,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub available: bool,
    pub key_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostKeyEvent {
    pub session_id: SessionId,
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    pub key_type: String,
    /// "new" | "changed" (MITM warning)
    pub reason: String,
}

// ─── Session handle ──────────────────────────────────────────────────────────

pub struct SshSessionHandle {
    pub channel_tx: tokio::sync::mpsc::UnboundedSender<SshChannelMsg>,
    /// Full session handle wrapped in Arc<Mutex> so it can be shared without Clone
    /// (russh::client::Handle does not implement Clone).
    /// Used to open additional channels: SFTP, port forwarding, etc.
    pub ssh_handle: Arc<Mutex<client::Handle<SenuSshHandler>>>,
    // Keep jump host session alive for the lifetime of the tunneled session
    pub _jump_session: Option<client::Handle<SenuSshHandler>>,
}

pub enum SshChannelMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

// ─── SSH client handler ───────────────────────────────────────────────────────

pub struct SenuSshHandler {
    session_id: SessionId,
    app_handle: AppHandle,
    host: String,
    port: u16,
    pending_verifications: PendingVerifications,
    /// In-memory cache of trusted host keys (persists for the app session).
    /// Key: "[host]:port" or "host", Value: key_b64.
    /// Avoids re-asking even if ~/.ssh/known_hosts write failed.
    trusted_hosts: TrustedHostsCache,
    /// Only the PTY channel's data should be forwarded to the terminal.
    /// SFTP and other multiplexed channels must be filtered out.
    /// Set to Some(id) right after channel_open_session() for the shell.
    /// Uses std::sync::Mutex so we can read it inside async Handler methods
    /// without an await point (avoids holding a tokio MutexGuard across awaits).
    pty_channel_id: Arc<std::sync::Mutex<Option<ChannelId>>>,
}

#[async_trait]
impl Handler for SenuSshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        use russh_keys::PublicKeyBase64;

        let fingerprint = server_public_key.fingerprint();
        let key_type    = server_public_key.name().to_string();
        let key_b64     = server_public_key.public_key_base64();

        let cache_key = if self.port == 22 {
            self.host.clone()
        } else {
            format!("[{}]:{}", self.host, self.port)
        };

        // ── 1. Перевіряємо in-memory cache (надійніший ніж файл) ─────────
        {
            let cache = self.trusted_hosts.lock().unwrap();
            if let Some(trusted_b64) = cache.get(&cache_key) {
                if trusted_b64 == &key_b64 {
                    return Ok(true);
                }
                // Key changed — fall through to mismatch warning
                drop(cache);
                let _ = self.app_handle.emit("host_key_verify", HostKeyEvent {
                    session_id: self.session_id.clone(),
                    host: self.host.clone(),
                    port: self.port,
                    fingerprint,
                    key_type,
                    reason: "changed".into(),
                });
                return Ok(false);
            }
        }

        // ── 2. Перевіряємо ~/.ssh/known_hosts ────────────────────────────
        match check_known_hosts(&self.host, self.port, &key_b64) {
            KnownHostsCheck::Trusted => {
                // Ключ знайдено і відповідає — зберігаємо в кеш і дозволяємо
                self.trusted_hosts.lock().unwrap().insert(cache_key, key_b64);
                return Ok(true);
            }
            KnownHostsCheck::Mismatch => {
                // Ключ змінився — потенційний MITM, відхиляємо і попереджаємо
                let _ = self.app_handle.emit("host_key_verify", HostKeyEvent {
                    session_id: self.session_id.clone(),
                    host: self.host.clone(),
                    port: self.port,
                    fingerprint,
                    key_type,
                    reason: "changed".into(),
                });
                return Ok(false);
            }
            KnownHostsCheck::Unknown => {
                // Ключ не знайдено — питаємо користувача
            }
        }

        // ── 2. Ключ новий — питаємо frontend ─────────────────────────────
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        self.pending_verifications
            .lock()
            .await
            .insert(self.session_id.clone(), PendingVerification {
                tx,
                host:     self.host.clone(),
                port:     self.port,
                key_b64:  key_b64,
                key_type: key_type.clone(),
            });

        let _ = self.app_handle.emit("host_key_verify", HostKeyEvent {
            session_id: self.session_id.clone(),
            host: self.host.clone(),
            port: self.port,
            fingerprint,
            key_type,
            reason: "new".into(),
        });

        // Чекаємо відповіді від frontend (60 секунд таймаут)
        match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
            Ok(Ok(accepted)) => Ok(accepted),
            _ => {
                self.pending_verifications.lock().await.remove(&self.session_id);
                Ok(false)
            }
        }
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        // Only forward data from the PTY channel — SFTP and other subsystem
        // channels share the same session but must NOT leak into the terminal.
        let is_pty = self.pty_channel_id.lock().unwrap()
            .map(|id| id == channel)
            .unwrap_or(false);

        if is_pty {
            let _ = self.app_handle.emit("terminal_data", TerminalDataEvent {
                session_id: self.session_id.clone(),
                data: data.to_vec(),
            });
        }
        Ok(())
    }

    async fn extended_data(
        &mut self,
        channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        // stderr — same filter as data()
        let is_pty = self.pty_channel_id.lock().unwrap()
            .map(|id| id == channel)
            .unwrap_or(false);

        if is_pty {
            let _ = self.app_handle.emit("terminal_data", TerminalDataEvent {
                session_id: self.session_id.clone(),
                data: data.to_vec(),
            });
        }
        Ok(())
    }

    async fn exit_status(
        &mut self,
        channel: ChannelId,
        exit_status: u32,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let is_pty = self.pty_channel_id.lock().unwrap()
            .map(|id| id == channel)
            .unwrap_or(false);
        if is_pty {
            let _ = self.app_handle.emit("terminal_close", TerminalCloseEvent {
                session_id: self.session_id.clone(),
                exit_code: Some(exit_status),
            });
        }
        Ok(())
    }

    async fn channel_close(
        &mut self,
        channel: ChannelId,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let is_pty = self.pty_channel_id.lock().unwrap()
            .map(|id| id == channel)
            .unwrap_or(false);
        if is_pty {
            let _ = self.app_handle.emit("terminal_close", TerminalCloseEvent {
                session_id: self.session_id.clone(),
                exit_code: None,
            });
        }
        Ok(())
    }
}

// ─── SSH Agent helpers ────────────────────────────────────────────────────────

/// Try to connect to the local SSH agent.
/// Returns the agent client or an error if unavailable.
async fn open_agent() -> Result<russh_keys::agent::client::AgentClient<impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send>, SenuError> {
    #[cfg(unix)]
    {
        let sock = std::env::var("SSH_AUTH_SOCK")
            .map_err(|_| SenuError::SshAuth("SSH_AUTH_SOCK not set".into()))?;
        let stream = tokio::net::UnixStream::connect(sock)
            .await
            .map_err(|e| SenuError::SshAuth(format!("Cannot connect to SSH agent: {e}")))?;
        Ok(russh_keys::agent::client::AgentClient::connect(stream))
    }
    #[cfg(windows)]
    {
        // Windows OpenSSH agent: named pipe
        use tokio::net::windows::named_pipe::ClientOptions;
        let pipe = ClientOptions::new()
            .open(r"\\.\pipe\openssh-ssh-agent")
            .map_err(|e| SenuError::SshAuth(format!("Cannot connect to SSH agent pipe: {e}")))?;
        Ok(russh_keys::agent::client::AgentClient::connect(pipe))
    }
}

// ─── Authentication ───────────────────────────────────────────────────────────

async fn authenticate(
    session: &mut client::Handle<SenuSshHandler>,
    username: &str,
    auth: &AuthMethod,
) -> Result<bool, SenuError> {
    match auth {
        AuthMethod::Password { password } => {
            let mut pw = password.clone();
            let ok = session
                .authenticate_password(username, &pw)
                .await
                .map_err(|e| SenuError::SshAuth(e.to_string()))?;
            pw.zeroize();
            Ok(ok)
        }

        AuthMethod::Key { key_path, passphrase } => {
            let expanded = shellexpand::tilde(key_path).to_string();
            let key = load_secret_key(expanded, passphrase.as_deref())
                .map_err(|e: russh_keys::Error| SenuError::Key(e.to_string()))?;
            session
                .authenticate_publickey(username, Arc::new(key))
                .await
                .map_err(|e| SenuError::SshAuth(e.to_string()))
        }

        AuthMethod::Agent => {
            let mut agent = open_agent().await?;

            // Request all identities from the agent
            let identities = agent
                .request_identities()
                .await
                .map_err(|e| SenuError::SshAuth(format!("Agent identity request failed: {e}")))?;

            if identities.is_empty() {
                return Err(SenuError::SshAuth(
                    "SSH agent has no identities loaded".into(),
                ));
            }

            // Try each key — authenticate_future returns (agent, Result<bool, Error>)
            let mut result = false;
            for identity in identities {
                // Note: returns tuple, NOT Result — no .map_err here
                let (returned_agent, auth_result) = session
                    .authenticate_future(username, identity, agent)
                    .await;
                agent = returned_agent;
                result = auth_result
                    .map_err(|e: russh::AgentAuthError| SenuError::SshAuth(e.to_string()))?;
                if result { break; }
            }

            Ok(result)
        }
    }
}

// ─── ProxyJump helpers ────────────────────────────────────────────────────────

/// Connect and authenticate to a jump host, then open a direct-tcpip tunnel
/// to the final target. Returns `(jump_session, channel_stream)`.
async fn open_jump_tunnel(
    jump_opts: &ConnectOptions,
    target_host: &str,
    target_port: u16,
    app_handle: &AppHandle,
    pending_verifications: &PendingVerifications,
    trusted_hosts: &TrustedHostsCache,
) -> Result<(client::Handle<SenuSshHandler>, russh::ChannelStream<client::Msg>), SenuError> {
    let jump_id = format!("jump-{}", Uuid::new_v4());

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60)),
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    });

    let handler = SenuSshHandler {
        session_id: jump_id,
        app_handle: app_handle.clone(),
        host: jump_opts.host.clone(),
        port: jump_opts.port,
        pending_verifications: Arc::clone(pending_verifications),
        trusted_hosts: Arc::clone(trusted_hosts),
        // Jump host has no PTY — all data is tunneled, not shown in terminal
        pty_channel_id: Arc::new(std::sync::Mutex::new(None)),
    };

    let addr = format!("{}:{}", jump_opts.host, jump_opts.port);
    let mut jump_session = client::connect(config, addr, handler)
        .await
        .map_err(|e| SenuError::SshConnect(format!("Jump host connect failed: {e}")))?;

    let ok = authenticate(&mut jump_session, &jump_opts.username, &jump_opts.auth).await?;
    if !ok {
        return Err(SenuError::SshAuth("Jump host authentication rejected".into()));
    }

    // Open a direct-tcpip tunnel to the final destination
    let channel = jump_session
        .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| SenuError::SshConnect(format!("direct-tcpip failed: {e}")))?;

    let stream = channel.into_stream();
    Ok((jump_session, stream))
}

// ─── Main connect command ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_connect(
    options: ConnectOptions,
    sessions: tauri::State<'_, SessionStore>,
    pending: tauri::State<'_, PendingVerifications>,
    trusted_hosts: tauri::State<'_, TrustedHostsCache>,
    app_handle: AppHandle,
) -> Result<ConnectResult, SenuError> {
    let session_id = Uuid::new_v4().to_string();

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60)),
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    });

    // Shared cell: set to the PTY channel ID right after channel_open_session.
    // Handler uses it to filter out SFTP/other channel data from terminal output.
    let pty_channel_id: Arc<std::sync::Mutex<Option<ChannelId>>> =
        Arc::new(std::sync::Mutex::new(None));

    let handler = SenuSshHandler {
        session_id: session_id.clone(),
        app_handle: app_handle.clone(),
        host: options.host.clone(),
        port: options.port,
        pending_verifications: Arc::clone(&pending),
        trusted_hosts: Arc::clone(&trusted_hosts),
        pty_channel_id: Arc::clone(&pty_channel_id),
    };

    // ── Connect (direct or via jump host) ───────────────────────────────────
    let (mut session, jump_session) = if let Some(jump_opts) = &options.jump_host {
        // ProxyJump: tunnel through jump host
        let (jump_sess, stream) = open_jump_tunnel(
            jump_opts,
            &options.host,
            options.port,
            &app_handle,
            &pending,
            &trusted_hosts,
        ).await?;
        let sess = client::connect_stream(config, stream, handler)
            .await
            .map_err(|e| SenuError::SshConnect(e.to_string()))?;
        (sess, Some(jump_sess))
    } else {
        // Direct connection
        let addr = format!("{}:{}", options.host, options.port);
        let sess = client::connect(config, addr, handler)
            .await
            .map_err(|e| SenuError::SshConnect(e.to_string()))?;
        (sess, None)
    };

    // ── Authenticate ────────────────────────────────────────────────────────
    let authenticated = authenticate(&mut session, &options.username, &options.auth).await?;
    if !authenticated {
        return Err(SenuError::SshAuth("Authentication rejected by server".into()));
    }

    // ── Open shell ──────────────────────────────────────────────────────────
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| SenuError::SshConnect(e.to_string()))?;

    // Register PTY channel ID so the handler only forwards data from this channel.
    *pty_channel_id.lock().unwrap() = Some(channel.id());

    channel
        .request_pty(false, "xterm-256color", 220, 50, 0, 0, &[])
        .await
        .map_err(|e| SenuError::SshConnect(e.to_string()))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| SenuError::SshConnect(e.to_string()))?;

    // ── Input loop ──────────────────────────────────────────────────────────
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SshChannelMsg>();
    let sid_task = session_id.clone();
    let app_task = app_handle.clone();

    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Some(SshChannelMsg::Data(data)) => {
                    if let Err(e) = channel.data(data.as_slice()).await {
                        let _ = app_task.emit("terminal_error", TerminalErrorEvent {
                            session_id: sid_task.clone(),
                            message: e.to_string(),
                        });
                        break;
                    }
                }
                Some(SshChannelMsg::Resize { cols, rows }) => {
                    let _ = channel.window_change(cols, rows, 0, 0).await;
                }
                Some(SshChannelMsg::Close) | None => {
                    let _ = channel.close().await;
                    break;
                }
            }
        }
    });

    sessions.lock().await.insert(
        session_id.clone(),
        SshSessionHandle {
            channel_tx: tx,
            ssh_handle: Arc::new(Mutex::new(session)),
            _jump_session: jump_session,
        },
    );

    Ok(ConnectResult { session_id })
}

// ─── Other commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: SessionId,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<(), SenuError> {
    if let Some(handle) = sessions.lock().await.remove(&session_id) {
        let _ = handle.channel_tx.send(SshChannelMsg::Close);
        // _jump_session dropped here → jump host connection closes
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_send_input(
    session_id: SessionId,
    data: Vec<u8>,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<(), SenuError> {
    let store = sessions.lock().await;
    let handle = store
        .get(&session_id)
        .ok_or_else(|| SenuError::SessionNotFound(session_id.clone()))?;
    handle
        .channel_tx
        .send(SshChannelMsg::Data(data))
        .map_err(|e| SenuError::SshWrite(e.to_string()))
}

#[tauri::command]
pub async fn ssh_resize(
    session_id: SessionId,
    cols: u32,
    rows: u32,
    sessions: tauri::State<'_, SessionStore>,
) -> Result<(), SenuError> {
    let store = sessions.lock().await;
    let handle = store
        .get(&session_id)
        .ok_or_else(|| SenuError::SessionNotFound(session_id.clone()))?;
    handle
        .channel_tx
        .send(SshChannelMsg::Resize { cols, rows })
        .map_err(|e| SenuError::SshWrite(e.to_string()))
}

/// Відповідь frontend на запит підтвердження host key.
/// `remember: true` → додає ключ до ~/.ssh/known_hosts
#[tauri::command]
pub async fn ssh_verify_host_key(
    session_id: SessionId,
    accepted: bool,
    remember: bool,
    pending: tauri::State<'_, PendingVerifications>,
    trusted_hosts: tauri::State<'_, TrustedHostsCache>,
) -> Result<(), SenuError> {
    // Витягуємо pending verification (ключ + канал)
    let pv = pending.lock().await.remove(&session_id);

    if accepted {
        if let Some(ref pv) = pv {
            // Завжди зберігаємо в in-memory кеш — надійно для поточної сесії
            let cache_key = if pv.port == 22 {
                pv.host.clone()
            } else {
                format!("[{}]:{}", pv.host, pv.port)
            };
            trusted_hosts.lock().unwrap().insert(cache_key, pv.key_b64.clone());

            // Якщо remember → також пишемо у ~/.ssh/known_hosts (для майбутніх сесій)
            if remember {
                add_to_known_hosts(&pv.host, pv.port, &pv.key_b64, &pv.key_type);
            }
        }
    }

    // Відсилаємо відповідь → розблоковуємо check_server_key
    if let Some(pv) = pv {
        let _ = pv.tx.send(accepted);
    }

    Ok(())
}

/// Check whether a local SSH agent is available and how many keys it holds.
#[tauri::command]
pub async fn detect_ssh_agent() -> Result<AgentStatus, SenuError> {
    match try_detect_agent().await {
        Ok(count) => Ok(AgentStatus { available: true, key_count: count }),
        Err(_) => Ok(AgentStatus { available: false, key_count: 0 }),
    }
}

async fn try_detect_agent() -> Result<usize, SenuError> {
    #[cfg(unix)]
    {
        let sock = std::env::var("SSH_AUTH_SOCK")
            .map_err(|_| SenuError::SshAuth("no SSH_AUTH_SOCK".into()))?;
        let stream = tokio::net::UnixStream::connect(sock)
            .await
            .map_err(|e| SenuError::SshAuth(e.to_string()))?;
        let mut agent = russh_keys::agent::client::AgentClient::connect(stream);
        let ids = agent.request_identities().await
            .map_err(|e| SenuError::SshAuth(e.to_string()))?;
        Ok(ids.len())
    }
    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ClientOptions;
        let pipe = ClientOptions::new()
            .open(r"\\.\pipe\openssh-ssh-agent")
            .map_err(|e| SenuError::SshAuth(e.to_string()))?;
        let mut agent = russh_keys::agent::client::AgentClient::connect(pipe);
        let ids = agent.request_identities().await
            .map_err(|e| SenuError::SshAuth(e.to_string()))?;
        Ok(ids.len())
    }
    #[cfg(not(any(unix, windows)))]
    {
        Err(SenuError::SshAuth("SSH agent not supported on this platform".into()))
    }
}

/// Scan ~/.ssh for private key files
#[tauri::command]
pub async fn list_ssh_keys() -> Result<Vec<String>, SenuError> {
    let home = dirs::home_dir()
        .ok_or_else(|| SenuError::Io("Cannot find home directory".into()))?;
    let ssh_dir = home.join(".ssh");

    if !ssh_dir.exists() {
        return Ok(vec![]);
    }

    let mut keys = vec![];
    let well_known = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"];

    for name in well_known {
        let p = ssh_dir.join(name);
        if p.exists() {
            if let Some(s) = p.to_str() {
                keys.push(s.to_string());
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.ends_with(".pub")
                || name.starts_with("known_hosts")
                || name.starts_with("authorized_keys")
                || name.starts_with("config")
                || well_known.contains(&name)
            {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                if content.contains("PRIVATE KEY") {
                    if let Some(s) = path.to_str() {
                        if !keys.contains(&s.to_string()) {
                            keys.push(s.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(keys)
}

/// Генерує SSH keypair (Ed25519 або RSA-4096) і зберігає у ~/.ssh/
/// Повертає { private_path, public_path, public_key } або помилку.
#[tauri::command]
pub async fn ssh_generate_key(
    key_type: String,          // "ed25519" | "rsa"
    filename: String,          // ім'я файлу, напр. "id_ed25519" або "my_key"
    passphrase: Option<String>,
) -> Result<serde_json::Value, SenuError> {
    let home = dirs::home_dir()
        .ok_or_else(|| SenuError::Io("Cannot find home directory".into()))?;
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir)
        .map_err(|e| SenuError::Io(format!("Cannot create ~/.ssh: {e}")))?;

    // Генеруємо keypair
    let keypair = match key_type.as_str() {
        "rsa" => russh_keys::key::KeyPair::generate_rsa(
            4096,
            russh_keys::key::SignatureHash::SHA2_256,
        ).ok_or_else(|| SenuError::Key("RSA generation failed".into()))?,
        _ => russh_keys::key::KeyPair::generate_ed25519()
            .ok_or_else(|| SenuError::Key("Ed25519 generation failed".into()))?,
    };

    // Файлові шляхи
    let safe_name = filename.trim().replace(['/', '\\', ' '], "_");
    let priv_path = ssh_dir.join(&safe_name);
    let pub_path  = ssh_dir.join(format!("{}.pub", &safe_name));

    // Записуємо приватний ключ у OpenSSH PEM формат
    {
        use std::io::Write;
        // encode_pkcs8_pem пише у будь-який Write — передаємо Vec<u8> як буфер
        let mut pem_buf: Vec<u8> = Vec::new();
        russh_keys::encode_pkcs8_pem(&keypair, &mut pem_buf)
            .map_err(|e| SenuError::Key(format!("PEM encode: {e}")))?;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        { use std::os::unix::fs::OpenOptionsExt; opts.mode(0o600); }
        let mut f = opts.open(&priv_path)
            .map_err(|e| SenuError::Io(format!("Cannot write private key: {e}")))?;
        f.write_all(&pem_buf)
            .map_err(|e| SenuError::Io(format!("Write error: {e}")))?;
    }

    // Записуємо публічний ключ
    use russh_keys::PublicKeyBase64;
    let pub_key_type = keypair.clone_public_key()
        .map_err(|e| SenuError::Key(e.to_string()))?
        .name();
    let pub_key_b64 = keypair.clone_public_key()
        .map_err(|e| SenuError::Key(e.to_string()))?
        .public_key_base64();
    let comment = format!("senu-generated-{}", safe_name);
    let pub_line = format!("{} {} {}\n", pub_key_type, pub_key_b64, comment);
    std::fs::write(&pub_path, pub_line.as_bytes())
        .map_err(|e| SenuError::Io(format!("Cannot write public key: {e}")))?;

    Ok(serde_json::json!({
        "private_path": priv_path.to_string_lossy(),
        "public_path":  pub_path.to_string_lossy(),
        "public_key":   pub_line.trim(),
    }))
}

// ─── Session Logging ──────────────────────────────────────────────────────────

/// Глобальний стор відкритих лог-файлів: sessionId → File handle.
pub type SessionLogs = Arc<Mutex<HashMap<String, tokio::fs::File>>>;

/// Починає запис сесії у файл.
/// Повертає шлях до файлу де пишеться лог.
#[tauri::command]
pub async fn ssh_start_log(
    session_id: String,
    log_path: Option<String>,   // якщо None — генеруємо автоматично в ~/senu-logs/
    logs: tauri::State<'_, SessionLogs>,
) -> Result<String, SenuError> {
    use tokio::io::AsyncWriteExt;

    let path = if let Some(p) = log_path {
        std::path::PathBuf::from(p)
    } else {
        let home = dirs::home_dir()
            .ok_or_else(|| SenuError::Io("Cannot find home directory".into()))?;
        let log_dir = home.join("senu-logs");
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| SenuError::Io(format!("Cannot create senu-logs dir: {e}")))?;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        log_dir.join(format!("session-{}-{}.log", &session_id[..8.min(session_id.len())], ts))
    };

    let mut file = tokio::fs::OpenOptions::new()
        .write(true).create(true).append(true)
        .open(&path).await
        .map_err(|e| SenuError::Io(format!("Cannot open log file: {e}")))?;

    // Header
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let header = format!("# SENU Session Log — {} — unix:{}\n", session_id, ts);
    file.write_all(header.as_bytes()).await.ok();

    let path_str = path.to_string_lossy().to_string();
    logs.lock().await.insert(session_id, file);
    Ok(path_str)
}

/// Дописує chunk тексту (вивід терміналу) у лог-файл.
#[tauri::command]
pub async fn ssh_append_log(
    session_id: String,
    data: String,
    logs: tauri::State<'_, SessionLogs>,
) -> Result<(), SenuError> {
    use tokio::io::AsyncWriteExt;
    let mut store = logs.lock().await;
    if let Some(file) = store.get_mut(&session_id) {
        // Strip ANSI escape codes before writing
        let clean = strip_ansi(&data);
        file.write_all(clean.as_bytes()).await.ok();
    }
    Ok(())
}

/// Зупиняє запис (закриває файл).
#[tauri::command]
pub async fn ssh_stop_log(
    session_id: String,
    logs: tauri::State<'_, SessionLogs>,
) -> Result<(), SenuError> {
    use tokio::io::AsyncWriteExt;
    let mut store = logs.lock().await;
    if let Some(mut file) = store.remove(&session_id) {
        let ts2 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let footer = format!("\n# Session ended — unix:{}\n", ts2);
        file.write_all(footer.as_bytes()).await.ok();
    }
    Ok(())
}

/// Простий стриппер ANSI ESC-sequences (regex-free, швидкий).
fn strip_ansi(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1b {
            i += 1;
            if i < bytes.len() && bytes[i] == b'[' {
                // CSI sequence — пропускаємо до першого літерного байта
                i += 1;
                while i < bytes.len() && !bytes[i].is_ascii_alphabetic() {
                    i += 1;
                }
                i += 1; // пропускаємо кінцевий символ
            } else {
                // інші ESC sequences — пропускаємо один байт
                i += 1;
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
