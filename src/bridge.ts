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

/**
 * SENU — Tauri IPC Bridge
 *
 * Exposes window.nextterm with the same API as the old Electron preload.
 * All React components use window.nextterm — no changes needed in App.tsx.
 *
 * API matches App.tsx usage exactly (not the preload types).
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ─── App.tsx types (mirror exactly what App.tsx uses) ────────────────────────

interface AppJumpHost {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  useAgent?: boolean;
}

interface AppSshConnectOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  useAgent?: boolean;
  forwardAgent?: boolean;
  jumpHost?: AppJumpHost;
}

interface AppNote {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  createdAt?: string;
  folderId?: string;
  serverId?: string;
  links?: import('./types').NoteLink[];
}

interface AppSnippet {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags?: string[];
}

// ─── Chat types ──────────────────────────────────────────────────────────────

export interface ChatIdentity {
  pubkey_b64:   string;
  short_id:     string;
  display_name: string;
}

export interface ChatContact {
  pubkey_b64:   string;
  short_id:     string;
  display_name: string;
}

export interface OnlineUser {
  pubkey_b64:   string;
  short_id:     string;
  display_name: string;
}

export interface ChatMessage {
  id:              string;
  from_pubkey_b64: string;
  from_name:       string;
  content:         string;
  timestamp:       number;
  is_snippet:      boolean;
}

export interface SshKeyPair {
  private_key_pem: string;
  public_key:      string;
  key_type:        string;
}

interface AppServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  useAgent?: boolean;
  color?: string;
  // Non-SSH connection types
  connType?: string;
  localShell?: string;
  asAdmin?: boolean;
  serialPort?: string;
  baudRate?: number;
  dockerContainer?: string;
  dockerShell?: string;
}

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  permissions: string;
  modified?: number;
  owner: string;
}
interface LogSnapshot {
  path: string;
  fileSize: number;
  lineCount: number;
  truncated: boolean;
  lines: string[];
}

// ─── Rust conversion helpers ─────────────────────────────────────────────────

function toRustAuth(opts: { useAgent?: boolean; privateKeyPath?: string; passphrase?: string; password?: string }) {
  if (opts.useAgent) return { type: 'agent' };
  // rename_all = "camelCase" on AuthMethod enum only renames variant names, not their fields.
  // So key_path stays as key_path in JSON (snake_case), not keyPath.
  if (opts.privateKeyPath) return { type: 'key', key_path: opts.privateKeyPath, passphrase: opts.passphrase ?? null };
  return { type: 'password', password: opts.password ?? '' };
}

function toRustJumpHost(j: AppJumpHost) {
  return {
    host: j.host,
    port: j.port,
    username: j.username,
    auth: toRustAuth(j),
    jump_host: null,
  };
}

function toRustServer(s: AppServer) {
  return {
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    auth_type: s.useAgent ? 'agent' : s.privateKeyPath ? 'key' : 'password',
    key_path: s.privateKeyPath ?? null,
    group: null,
    tags: [],
    color: s.color ?? null,
    notes: null,
    // Non-SSH connection types
    conn_type: s.connType ?? null,
    local_shell: s.localShell ?? null,
    as_admin: s.asAdmin ?? null,
    serial_port: s.serialPort ?? null,
    baud_rate: s.baudRate ?? null,
    docker_container: s.dockerContainer ?? null,
    docker_shell: s.dockerShell ?? null,
  };
}

function fromRustServer(s: Record<string, unknown>): AppServer {
  return {
    id: s.id as string,
    name: s.name as string,
    host: s.host as string,
    port: s.port as number,
    username: s.username as string,
    privateKeyPath: (s.key_path as string | null) ?? undefined,
    useAgent: s.auth_type === 'agent',
    color: (s.color as string | null) ?? undefined,
    // Non-SSH connection types
    connType: (s.conn_type as string | null) ?? undefined,
    localShell: (s.local_shell as string | null) ?? undefined,
    asAdmin: (s.as_admin as boolean | null) ?? undefined,
    serialPort: (s.serial_port as string | null) ?? undefined,
    baudRate: (s.baud_rate as number | null) ?? undefined,
    dockerContainer: (s.docker_container as string | null) ?? undefined,
    dockerShell: (s.docker_shell as string | null) ?? undefined,
  };
}

function toRustNote(serverId: string, note: AppNote) {
  return {
    id: note.id,
    serverId: note.serverId ?? serverId,
    title: note.title,
    content: note.content,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
    folderId: note.folderId,
    links: note.links ?? [],
  };
}

function fromRustNote(n: Record<string, unknown>): AppNote {
  return {
    id: n.id as string,
    title: (n.title as string) ?? 'Untitled',
    content: n.content as string,
    updatedAt:
      (n.updatedAt as string) ?? (n.updated_at as string) ?? new Date().toISOString(),
    createdAt: (n.createdAt as string | undefined) ?? (n.created_at as string | undefined),
    folderId: (n.folderId as string | undefined) ?? (n.folder_id as string | undefined),
    serverId: (n.serverId as string | undefined) ?? (n.server_id as string | undefined),
    links: (n.links as import('./types').NoteLink[] | undefined) ?? [],
  };
}

function toRustSnippet(s: AppSnippet) {
  return {
    id: s.id,
    name: s.name,
    command: s.command,
    description: s.description ?? null,
    tags: s.tags ?? [],
  };
}

function fromRustSnippet(s: Record<string, unknown>): AppSnippet {
  return {
    id: s.id as string,
    name: s.name as string,
    command: s.command as string,
    description: (s.description as string | null) ?? undefined,
    tags: (s.tags as string[]) ?? [],
  };
}

// ─── Key type detection ───────────────────────────────────────────────────────

function detectKeyType(path: string): string {
  const name = path.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  if (name.endsWith('.pub')) return 'public';
  if (name.includes('ed25519')) return 'ed25519';
  if (name.includes('ecdsa')) return 'ecdsa';
  if (name.includes('rsa')) return 'rsa';
  if (name.includes('dsa')) return 'dsa';
  return 'private';
}

// ─── Bridge implementation ────────────────────────────────────────────────────

export const bridge = {

  // ── SSH ────────────────────────────────────────────────────────────────────

  async sshConnect(opts: AppSshConnectOptions): Promise<{ sessionId: string }> {
    const payload = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      auth: toRustAuth(opts),
      jump_host: opts.jumpHost ? toRustJumpHost(opts.jumpHost) : null,
      forward_agent: !!opts.forwardAgent,
    };
    const result = await invoke<{ session_id: string }>('ssh_connect', { options: payload });
    return { sessionId: result.session_id };
  },

  async sshDisconnect(sessionId: string): Promise<void> {
    // Tauri 2: top-level command params must be camelCase on JS side
    await invoke('ssh_disconnect', { sessionId });
  },

  async sshSendInput(sessionId: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;
    await invoke('ssh_send_input', {
      sessionId,
      data: Array.from(bytes),
    });
  },

  async sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
    await invoke('ssh_resize', { sessionId, cols, rows });
  },

  // ── SSH event listeners ────────────────────────────────────────────────────

  onSshOutput(
    callback: (sessionId: string, data: Uint8Array) => void
  ): UnlistenFn {
    let unlisten: UnlistenFn = () => {};
    listen<{ session_id: string; data: number[] }>('terminal_data', (event) => {
      callback(event.payload.session_id, new Uint8Array(event.payload.data));
    }).then((fn) => { unlisten = fn; });
    return () => unlisten();
  },

  onSshError(
    callback: (sessionId: string, message: string) => void
  ): UnlistenFn {
    let unlisten: UnlistenFn = () => {};
    listen<{ session_id: string; message: string }>('terminal_error', (event) => {
      callback(event.payload.session_id, event.payload.message);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten();
  },

  onSshClose(
    callback: (sessionId: string, exitCode?: number) => void
  ): UnlistenFn {
    let unlisten: UnlistenFn = () => {};
    listen<{ session_id: string; exit_code?: number }>('terminal_close', (event) => {
      callback(event.payload.session_id, event.payload.exit_code);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten();
  },

  // ── SFTP ───────────────────────────────────────────────────────────────────

  async sftpListDir(sessionId: string, path: string): Promise<FileEntry[]> {
    const entries = await invoke<Array<Record<string, unknown>>>('sftp_list_dir', {
      sessionId,
      path,
    });
    return entries.map((e) => ({
      name: e.name as string,
      path: e.path as string,
      isDir: e.is_dir as boolean,
      size: e.size as number,
      permissions: e.permissions as string,
      modified: e.modified as number | undefined,
      owner: e.owner as string,
    }));
  },

  async sftpReadFile(sessionId: string, path: string): Promise<string> {
    const result = await invoke<{ content: number[]; path: string }>('sftp_read_file', {
      sessionId,
      path,
    });
    return new TextDecoder().decode(new Uint8Array(result.content));
  },

  async sftpWriteFile(sessionId: string, path: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content);
    await invoke('sftp_write_file', {
      sessionId,
      path,
      content: Array.from(bytes),
    });
  },

  // Returns local path saved to, or null if user cancelled
  async sftpDownloadFile(sessionId: string, remotePath: string): Promise<string | null> {
    return invoke<string | null>('sftp_download_file', { sessionId, remotePath });
  },

  // Returns uploaded filename, or null if user cancelled
  async sftpUploadFile(sessionId: string, remoteDir: string): Promise<string | null> {
    return invoke<string | null>('sftp_upload_file', { sessionId, remoteDir });
  },
  async readLocalLogTail(path: string, maxLines: number): Promise<LogSnapshot> {
    return invoke<LogSnapshot>('read_local_log_tail', { path, maxLines });
  },
  async readRemoteLogTail(sessionId: string, path: string, maxLines: number): Promise<LogSnapshot> {
    return invoke<LogSnapshot>('sftp_read_log_tail', { sessionId, path, maxLines });
  },

  // ── SSH Keys ───────────────────────────────────────────────────────────────

  async listSshKeys(): Promise<Array<{ name: string; path: string; keyType: string; encrypted: boolean }>> {
    const paths = await invoke<string[]>('list_ssh_keys');
    return paths.map(p => ({
      name: p.split(/[/\\]/).pop() ?? p,
      path: p,
      keyType: detectKeyType(p),
      encrypted: false, // will be discovered when passphrase is required
    }));
  },

  async generateSshKey(keyType: 'ed25519' | 'rsa', filename: string, passphrase?: string): Promise<{ private_path: string; public_path: string; public_key: string }> {
    return invoke('ssh_generate_key', { keyType, filename, passphrase: passphrase ?? null });
  },

  // ── Session Logging ────────────────────────────────────────────────────────
  async sessionStartLog(sessionId: string, logPath?: string): Promise<string> {
    return invoke('ssh_start_log', { sessionId, logPath: logPath ?? null });
  },
  async sessionAppendLog(sessionId: string, data: string): Promise<void> {
    return invoke('ssh_append_log', { sessionId, data });
  },
  async sessionStopLog(sessionId: string): Promise<void> {
    return invoke('ssh_stop_log', { sessionId });
  },

  async selectSshKey(): Promise<{ path: string; keyType: string; encrypted: boolean } | null> {
    // Prefer JS-side plugin (newer versions parent correctly to the frameless
    // window on Windows). Fall back to the Rust command if the plugin is not
    // reachable for any reason.
    let filePath: string | null = null;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({ multiple: false, directory: false, title: 'Select SSH Private Key' });
      filePath = typeof result === 'string' ? result : null;
    } catch (e) {
      console.warn('[bridge] JS dialog failed, falling back to Rust picker:', e);
      try {
        filePath = await invoke<string | null>('pick_ssh_key');
      } catch (e2) {
        console.error('[bridge] selectSshKey error:', e2);
        return null;
      }
    }
    if (!filePath) return null;
    return { path: filePath, keyType: detectKeyType(filePath), encrypted: false };
  },

  async netProbe(host: string, port: number, timeoutMs: number = 1500): Promise<boolean> {
    try {
      return await invoke<boolean>('net_probe', { host, port, timeoutMs });
    } catch {
      return false;
    }
  },

  async detectSshAgent(): Promise<{ available: boolean }> {
    try {
      const result = await invoke<{ available: boolean; key_count: number }>('detect_ssh_agent');
      return { available: result.available };
    } catch {
      return { available: false };
    }
  },

  // ── Servers ────────────────────────────────────────────────────────────────

  async getServers(): Promise<AppServer[]> {
    const servers = await invoke<Array<Record<string, unknown>>>('get_servers');
    return servers.map(fromRustServer);
  },

  async saveServer(server: AppServer): Promise<void> {
    await invoke('save_server', { server: toRustServer(server) });
  },

  async deleteServer(serverId: string): Promise<void> {
    await invoke('delete_server', { serverId });
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  // App.tsx API: getNotes(serverId), saveNote(serverId, note), deleteNote(serverId, id)

  async getNotes(serverId: string): Promise<AppNote[]> {
    const notes = await invoke<Array<Record<string, unknown>>>('get_notes', {
      serverId,
    });
    return notes.map(fromRustNote);
  },

  async saveNote(serverId: string, note: AppNote): Promise<void> {
    await invoke('save_note', { note: toRustNote(serverId, note) });
  },

  async deleteNote(serverId: string, noteId: string): Promise<void> {
    void serverId;
    await invoke('delete_note', { noteId });
  },

  // ── Folders ────────────────────────────────────────────────────────────────

  async getFolders(): Promise<import('./types').Folder[]> {
    return await invoke<import('./types').Folder[]>('get_folders');
  },

  async saveFolder(folder: import('./types').Folder): Promise<void> {
    await invoke('save_folder', { folder });
  },

  async deleteFolder(folderId: string): Promise<void> {
    await invoke('delete_folder', { folderId });
  },

  // Export notes as markdown — opens native "Save As" dialog
  async saveMarkdown(filename: string, content: string): Promise<void> {
    try {
      await invoke('save_markdown_dialog', { filename, content });
    } catch (e) {
      console.error('saveMarkdown failed:', e);
    }
  },

  // ── Snippets ───────────────────────────────────────────────────────────────

  async getSnippets(): Promise<AppSnippet[]> {
    const snippets = await invoke<Array<Record<string, unknown>>>('get_snippets');
    return snippets.map(fromRustSnippet);
  },

  async saveSnippet(snippet: AppSnippet): Promise<void> {
    await invoke('save_snippet', { snippet: toRustSnippet(snippet) });
  },

  async deleteSnippet(snippetId: string): Promise<void> {
    await invoke('delete_snippet', { snippetId });
  },

  // ── Vault (system keychain) ────────────────────────────────────────────────
  // secretType: "password" | "passphrase"

  async vaultSave(serverId: string, secret: string, secretType: 'password' | 'passphrase' = 'password'): Promise<void> {
    await invoke('vault_save', { serverId, secret, secretType });
  },

  async vaultLoad(serverId: string, secretType: 'password' | 'passphrase' = 'password'): Promise<string | null> {
    return invoke<string | null>('vault_load', { serverId, secretType });
  },

  async vaultDelete(serverId: string, secretType: 'password' | 'passphrase' = 'password'): Promise<void> {
    await invoke('vault_delete', { serverId, secretType });
  },

  async vaultDeleteServer(serverId: string): Promise<void> {
    await invoke('vault_delete_server', { serverId });
  },

  // ── SSH key tools (formerly under Password Vault) ─────────────────────────

  async vaultGenSshKey(keyType: string): Promise<SshKeyPair> {
    return invoke<SshKeyPair>('vault_gen_ssh_key', { keyType });
  },

  async vaultSaveKeyDialog(content: string, filename: string): Promise<string | null> {
    return invoke<string | null>('vault_save_key_dialog', { content, filename });
  },

  async vaultPushKeyToServer(
    sessionId: string,
    publicKey: string,
    remotePath: string,
  ): Promise<string> {
    return invoke<string>('vault_push_key_to_server', { sessionId, publicKey, remotePath });
  },

  // ── Chat (E2E encrypted ephemeral messaging) ───────────────────────────────

  async chatGetIdentity(): Promise<ChatIdentity> {
    return invoke<ChatIdentity>('chat_get_identity');
  },

  async chatSetDisplayName(name: string): Promise<ChatIdentity> {
    return invoke<ChatIdentity>('chat_set_display_name', { name });
  },

  async chatListContacts(): Promise<ChatContact[]> {
    return invoke<ChatContact[]>('chat_list_contacts');
  },

  async chatAddContact(pubkeyB64: string, displayName: string): Promise<ChatContact> {
    return invoke<ChatContact>('chat_add_contact', { pubkeyB64, displayName });
  },

  async chatRemoveContact(pubkeyB64: string): Promise<void> {
    return invoke<void>('chat_remove_contact', { pubkeyB64 });
  },

  async chatAnnouncePresence(sessionId: string): Promise<void> {
    return invoke<void>('chat_announce_presence', { sessionId });
  },

  async chatGetOnline(sessionId: string): Promise<OnlineUser[]> {
    return invoke<OnlineUser[]>('chat_get_online', { sessionId });
  },

  async chatSendMessage(
    sessionId: string,
    recipientPubkeyB64: string,
    content: string,
    isSnippet: boolean,
  ): Promise<void> {
    return invoke<void>('chat_send_message', {
      sessionId,
      recipientPubkeyB64,
      content,
      isSnippet,
    });
  },

  async chatPollMessages(sessionId: string): Promise<ChatMessage[]> {
    return invoke<ChatMessage[]>('chat_poll_messages', { sessionId });
  },

  async chatLeave(sessionId: string): Promise<void> {
    return invoke<void>('chat_leave', { sessionId });
  },

  // ── Known-hosts verification ───────────────────────────────────────────────

  /** Відповідь на `host_key_verify` подію від Rust */
  async sshVerifyHostKey(opts: {
    sessionId: string
    accepted: boolean
    remember: boolean
  }): Promise<void> {
    await invoke('ssh_verify_host_key', {
      sessionId: opts.sessionId,
      accepted: opts.accepted,
      remember: opts.remember,
    });
  },

  /** Слухаємо запити підтвердження host key */
  onHostKeyVerify(
    callback: (event: {
      sessionId: string
      host: string
      port: number
      fingerprint: string
      keyType: string
      reason: 'new' | 'changed'
    }) => void
  ): import('@tauri-apps/api/event').UnlistenFn {
    let unlisten: import('@tauri-apps/api/event').UnlistenFn = () => {};
    listen<{
      session_id: string; host: string; port: number;
      fingerprint: string; key_type: string; reason: string
    }>('host_key_verify', (event) => {
      callback({
        sessionId: event.payload.session_id,
        host: event.payload.host,
        port: event.payload.port,
        fingerprint: event.payload.fingerprint,
        keyType: event.payload.key_type,
        reason: event.payload.reason as 'new' | 'changed',
      });
    }).then((fn) => { unlisten = fn; });
    return () => unlisten();
  },

  // ── Window ─────────────────────────────────────────────────────────────────

  windowMinimize(): void {
    invoke('window_minimize').catch(console.error);
  },

  windowMaximize(): void {
    invoke('window_maximize').catch(console.error);
  },

  windowClose(): void {
    invoke('window_close').catch(console.error);
  },

  windowHide(): void {
    invoke('window_hide').catch(console.error);
  },

  onWindowResize(callback: (width: number, height: number) => void): () => void {
    // Use tauri://resize — fired by Tauri's Rust layer on every OS window resize.
    // window.addEventListener('resize') does NOT reliably fire in WebView2 when
    // the native window is resized (same issue as in Electron on Windows).
    let unlisten: UnlistenFn | null = null;
    listen('tauri://resize', () => {
      // innerWidth/Height are updated by WebView2 before the event is dispatched
      callback(window.innerWidth, window.innerHeight);
    }).then(fn => { unlisten = fn; });

    // Belt-and-suspenders: also keep window.resize for platforms where it works
    const handler = () => callback(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', handler);

    return () => {
      unlisten?.();
      window.removeEventListener('resize', handler);
    };
  },

  // ── SSH Config import ──────────────────────────────────────────────────────
  async parseSSHConfig(): Promise<{ name: string; host: string; port: number; username: string; key_path: string | null }[]> {
    return invoke('parse_ssh_config');
  },

  // ─── Port Forwarding ──────────────────────────────────────────────────────────
  sshForwardAdd(sessionId: string, localPort: number, remoteHost: string, remotePort: number): Promise<string> {
    return invoke('ssh_forward_add', {
      sessionId,
      localPort,
      remoteHost,
      remotePort,
    });
  },

  sshForwardRemove(forwardId: string): Promise<void> {
    return invoke('ssh_forward_remove', { forwardId });
  },

  sshForwardList(sessionId: string): Promise<Array<{ id: string; local_port: number; remote_host: string; remote_port: number }>> {
    return invoke('ssh_forward_list', { sessionId });
  },

  // ─── New connection types ──────────────────────────────────────────────────
  async localConnect(shell?: string, cwd?: string): Promise<{ sessionId: string }> {
    const r = await invoke<{ session_id: string }>('local_connect', { shell: shell ?? null, cwd: cwd ?? null });
    return { sessionId: r.session_id };
  },

  /** Open a new elevated SENU window via UAC with the given shell as a tab.
   *  The current window stays open. Throws if user cancels UAC. */
  async localConnectAdmin(shell?: string): Promise<void> {
    await invoke('local_connect_admin', { shell: shell ?? null });
  },

  /** Returns the --admin-shell value passed on CLI, or null.
   *  Used by the elevated instance to auto-open the requested shell. */
  getStartupAdminShell(): Promise<string | null> {
    return invoke<string | null>('get_startup_admin_shell');
  },

  listShells(): Promise<string[]> {
    return invoke('list_shells');
  },

  async dockerConnect(container: string, shell?: string): Promise<{ sessionId: string }> {
    const r = await invoke<{ session_id: string }>('docker_connect', { container, shell: shell ?? null });
    return { sessionId: r.session_id };
  },

  dockerListContainers(): Promise<Array<{ id: string; name: string; image: string; status: string }>> {
    return invoke('docker_list_containers');
  },

  async telnetConnect(host: string, port: number): Promise<{ sessionId: string }> {
    const r = await invoke<{ session_id: string }>('telnet_connect', { host, port });
    return { sessionId: r.session_id };
  },

  serialListPorts(): Promise<string[]> {
    return invoke('serial_list_ports');
  },

  async serialConnect(port: string, baudRate: number): Promise<{ sessionId: string }> {
    const r = await invoke<{ session_id: string }>('serial_connect', { port, baudRate });
    return { sessionId: r.session_id };
  },

  // ── Updater ────────────────────────────────────────────────────────────────
  // Holds the Update object between check → download → install calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _pendingUpdate: null as any,

  async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = await check();
      bridge._pendingUpdate = update ?? null;
      if (update) return { hasUpdate: true, version: update.version };
      return { hasUpdate: false };
    } catch (e) {
      // Updater not configured or network unavailable — fail silently
      console.warn('[SENU updater] check failed:', e);
      return { hasUpdate: false };
    }
  },

  async downloadUpdate(onProgress?: (percent: number) => void): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = bridge._pendingUpdate;
    if (!update) return;
    let total = 0;
    let downloaded = 0;
    await update.download((event: { event: string; data: { contentLength?: number; chunkLength?: number } }) => {
      if (event.event === 'Started')   total = event.data.contentLength ?? 0;
      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength ?? 0;
        if (total > 0) onProgress?.(Math.round((downloaded / total) * 100));
      }
    });
  },

  async installUpdate(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = bridge._pendingUpdate;
    if (!update) return;
    await update.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },

  // ── Workspace (split layout persistence) ────────────────────────────────────

  async getWorkspace(): Promise<unknown> {
    return invoke('get_workspace');
  },

  async saveWorkspace(data: unknown): Promise<void> {
    await invoke('save_workspace', { workspace: data });
  },
};

// ─── Inject as window.nextterm ────────────────────────────────────────────────
// Self-initialize at import time so that any module that imports bridge.ts
// before reading window.nextterm will see it already set.

export type Bridge = typeof bridge;

// window.nextterm is the bridge. Typed as `any` to remain compatible with
// existing loose call sites (callback types, plugin methods added elsewhere,
// etc). Prefer importing `bridge` directly from this module for type safety.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextterm: any;
  }
}

window.nextterm = bridge;

/** @deprecated window.nextterm is now set automatically on import. No-op. */
export function injectBridge() {}
