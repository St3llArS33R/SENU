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
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

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
  jumpHost?: AppJumpHost;
}

interface AppNote {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface AppSnippet {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags?: string[];
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
  };
}

function toRustNote(serverId: string, note: AppNote) {
  return {
    id: note.id,
    server_id: serverId,
    title: note.title,
    content: note.content,
    updated_at: note.updatedAt,
  };
}

function fromRustNote(n: Record<string, unknown>): AppNote {
  return {
    id: n.id as string,
    title: (n.title as string) ?? 'Untitled',
    content: n.content as string,
    updatedAt: (n.updated_at as string) ?? new Date().toISOString(),
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
    try {
      // Use the Rust-side picker so the dialog is properly parented to the
      // frameless window on Windows (JS-side dialogOpen loses the parent).
      const filePath = await invoke<string | null>('pick_ssh_key');
      if (!filePath) return null;
      return { path: filePath, keyType: detectKeyType(filePath), encrypted: false };
    } catch (e) {
      console.error('[bridge] selectSshKey error:', e);
      return null;
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

  // Export notes as markdown — saves to downloads via FS plugin
  async saveMarkdown(filename: string, content: string): Promise<void> {
    try {
      await writeTextFile(filename, content, { baseDir: BaseDirectory.Download });
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

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextterm: any;
  }
}

window.nextterm = bridge;

/** @deprecated window.nextterm is now set automatically on import. No-op. */
export function injectBridge() {}
