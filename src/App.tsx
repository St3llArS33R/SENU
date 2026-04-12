import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import Editor from '@monaco-editor/react'
import '@xterm/xterm/css/xterm.css'
import './App.css'
// Must be imported before reading window.nextterm below — this ensures bridge.ts
// evaluates (and sets window.nextterm = bridge) before the module-level const nt.
import './bridge'
import { LangContext, useLangState, useLanguage } from './i18n'

// ── Flat SVG Icons ─────────────────────────────────────────────────────────
const Ico = {
  pencil: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:  (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  notes:  (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  lock:   (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  key:    (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/></svg>,
  folder: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  tag:    (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  filter: (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  plus:   (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  agent:  (s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>,
  // SENU crystal for empty state
  crystal: () => (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <polygon points="26,3 3,26 26,26" fill="#23233a"/>
      <polygon points="26,3 49,26 26,26" fill="#2e2e48"/>
      <polygon points="3,26 26,49 26,26" fill="#5B4FE8"/>
      <polygon points="49,26 26,49 26,26" fill="#1a1a2e"/>
      <line x1="26" y1="3" x2="26" y2="49" stroke="#0d0d1a" strokeWidth="0.7"/>
      <line x1="3" y1="26" x2="49" y2="26" stroke="#0d0d1a" strokeWidth="0.7"/>
    </svg>
  ),
}

// Types
interface JumpHost {
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  useAgent?: boolean
}

interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  useAgent?: boolean
  color?: string
  jumpHost?: JumpHost
}

interface Note {
  id: string
  title: string
  content: string
  updatedAt: string
}

interface TabGroup {
  id: string
  name: string
  color: string
}

interface Tab {
  id: string
  server: Server
  sessionId: string | null
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  terminal: Terminal | null
  fitAddon: FitAddon | null
  connectedAt?: number
  groupId?: string
}

interface EditorFile {
  remotePath: string
  content: string
  sessionId: string
  modified: boolean
}

interface Snippet {
  id: string
  title: string
  command: string
  description?: string
  tags?: string[]
}

// --- Built-in snippet library ---
const SNIPPET_LIBRARY: { category: string; icon: string; items: { title: string; command: string; description?: string }[] }[] = [
  {
    category: 'System', icon: '🖥',
    items: [
      { title: 'Disk usage', command: 'df -h', description: 'Human-readable disk space' },
      { title: 'Memory usage', command: 'free -h', description: 'RAM and swap usage' },
      { title: 'Top processes', command: 'top -b -n 1 | head -20' },
      { title: 'CPU info', command: 'lscpu | grep -E "Model|CPU\\(s\\)|MHz"' },
      { title: 'Load average', command: 'uptime' },
      { title: 'Kernel version', command: 'uname -r' },
      { title: 'OS release', command: 'cat /etc/os-release' },
      { title: 'List open ports', command: 'ss -tulpn' },
      { title: 'Who is logged in', command: 'who' },
      { title: 'Last logins', command: 'last -n 20' },
      { title: 'Running services', command: 'systemctl list-units --type=service --state=running' },
      { title: 'Journal errors', command: 'journalctl -p err -n 50 --no-pager' },
    ]
  },
  {
    category: 'Network', icon: '🌐',
    items: [
      { title: 'IP addresses', command: 'ip addr show' },
      { title: 'Routing table', command: 'ip route' },
      { title: 'DNS lookup', command: 'nslookup google.com' },
      { title: 'Ping gateway', command: 'ping -c 4 8.8.8.8' },
      { title: 'Traceroute', command: 'traceroute google.com' },
      { title: 'Active connections', command: 'ss -tnp' },
      { title: 'Netstat sockets', command: 'netstat -tulpn 2>/dev/null || ss -tulpn' },
      { title: 'Download speed test', command: 'curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python3 -' },
    ]
  },
  {
    category: 'Docker', icon: '🐳',
    items: [
      { title: 'List containers', command: 'docker ps' },
      { title: 'List all containers', command: 'docker ps -a' },
      { title: 'List images', command: 'docker images' },
      { title: 'Container logs (tail)', command: 'docker logs --tail 100 -f <container>' },
      { title: 'Container stats', command: 'docker stats --no-stream' },
      { title: 'Exec bash in container', command: 'docker exec -it <container> bash' },
      { title: 'Prune unused images', command: 'docker image prune -f' },
      { title: 'Prune everything', command: 'docker system prune -af' },
      { title: 'Docker compose up', command: 'docker compose up -d' },
      { title: 'Docker compose down', command: 'docker compose down' },
      { title: 'Docker compose logs', command: 'docker compose logs -f --tail 100' },
    ]
  },
  {
    category: 'Nginx', icon: '⚡',
    items: [
      { title: 'Test config', command: 'nginx -t' },
      { title: 'Reload', command: 'systemctl reload nginx' },
      { title: 'Restart', command: 'systemctl restart nginx' },
      { title: 'Status', command: 'systemctl status nginx' },
      { title: 'Access log (tail)', command: 'tail -f /var/log/nginx/access.log' },
      { title: 'Error log (tail)', command: 'tail -f /var/log/nginx/error.log' },
      { title: 'List enabled sites', command: 'ls -la /etc/nginx/sites-enabled/' },
    ]
  },
  {
    category: 'Git', icon: '🔀',
    items: [
      { title: 'Status', command: 'git status' },
      { title: 'Log (oneline)', command: 'git log --oneline -20' },
      { title: 'Pull', command: 'git pull' },
      { title: 'Fetch all', command: 'git fetch --all' },
      { title: 'Stash', command: 'git stash' },
      { title: 'Stash pop', command: 'git stash pop' },
      { title: 'Reset hard to origin', command: 'git reset --hard origin/$(git branch --show-current)' },
      { title: 'Branches', command: 'git branch -a' },
      { title: 'Diff staged', command: 'git diff --cached' },
    ]
  },
  {
    category: 'MySQL', icon: '🗄',
    items: [
      { title: 'Connect root', command: 'mysql -u root -p' },
      { title: 'List databases', command: 'mysql -u root -p -e "SHOW DATABASES;"' },
      { title: 'Dump database', command: 'mysqldump -u root -p <dbname> > dump.sql' },
      { title: 'Import dump', command: 'mysql -u root -p <dbname> < dump.sql' },
      { title: 'Show processlist', command: 'mysql -u root -p -e "SHOW PROCESSLIST;"' },
      { title: 'Check tables size', command: "mysql -u root -p -e \"SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,2) AS 'MB' FROM information_schema.tables GROUP BY table_schema;\"" },
    ]
  },
  {
    category: 'Firewall', icon: '🛡',
    items: [
      { title: 'UFW status', command: 'ufw status verbose' },
      { title: 'Allow port 80', command: 'ufw allow 80/tcp' },
      { title: 'Allow port 443', command: 'ufw allow 443/tcp' },
      { title: 'iptables rules', command: 'iptables -L -n -v' },
    ]
  },
  {
    category: 'PHP / Laravel', icon: '🐘',
    items: [
      { title: 'PHP version', command: 'php -v' },
      { title: 'Artisan status', command: 'php artisan about' },
      { title: 'Clear all caches', command: 'php artisan optimize:clear' },
      { title: 'Run migrations', command: 'php artisan migrate --force' },
      { title: 'Queue restart', command: 'php artisan queue:restart' },
      { title: 'Storage link', command: 'php artisan storage:link' },
      { title: 'Composer install', command: 'composer install --no-dev --optimize-autoloader' },
    ]
  },
]

const nt = (window as any).nextterm

// --- Markdown renderer (lightweight, no deps) ---
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>')
}

// --- Toast ---
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className="toast-container">
      <div className={`toast toast-${type}`}>
        {type === 'success' ? '✓' : '⚠'} {message}
      </div>
    </div>
  )
}

// --- Confirm Modal ---
function ConfirmModal({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn-primary" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// --- Language detection for Monaco ---
function detectLanguage(filePath: string): string {
  const basename = filePath.split(/[/\\]/).pop() || ''
  if (/^dockerfile/i.test(basename)) return 'dockerfile'
  if (/^(nginx|apache)\.conf$/i.test(basename)) return 'ini'
  const ext = basename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript',
    jsx: 'javascript', html: 'html', htm: 'html', css: 'css', scss: 'scss',
    json: 'json', sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    yml: 'yaml', yaml: 'yaml', md: 'markdown', rs: 'rust', go: 'go',
    rb: 'ruby', php: 'php', java: 'java', cpp: 'cpp', cc: 'cpp',
    c: 'c', cs: 'csharp', kt: 'kotlin', conf: 'ini', ini: 'ini',
    cfg: 'ini', env: 'shell', sql: 'sql', xml: 'xml', toml: 'toml',
    lua: 'lua', pl: 'perl', swift: 'swift', tf: 'hcl', hcl: 'hcl',
  }
  return map[ext] || 'plaintext'
}

// --- Update bar ---
type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

function UpdateBar({ state, onDownload, onInstall, onDismiss }: {
  state: UpdateState
  onDownload: () => void
  onInstall: () => void
  onDismiss: () => void
}) {
  if (state.status === 'idle' || state.status === 'checking') return null

  if (state.status === 'available') return (
    <div className="update-bar update-bar-available">
      <span>⬆ Update available: <strong>v{state.version}</strong></span>
      <div className="update-bar-actions">
        <button className="update-btn-primary" onClick={onDownload}>Download</button>
        <button className="update-btn-dismiss" onClick={onDismiss}>✕</button>
      </div>
    </div>
  )

  if (state.status === 'downloading') return (
    <div className="update-bar update-bar-downloading">
      <span>⬇ Downloading update… {state.percent}%</span>
      <div className="update-progress-track">
        <div className="update-progress-fill" style={{ width: `${state.percent}%` }} />
      </div>
    </div>
  )

  if (state.status === 'downloaded') return (
    <div className="update-bar update-bar-ready">
      <span>✓ Update <strong>v{state.version}</strong> ready — restart to apply</span>
      <div className="update-bar-actions">
        <button className="update-btn-primary" onClick={onInstall}>Restart & Update</button>
        <button className="update-btn-dismiss" onClick={onDismiss}>Later</button>
      </div>
    </div>
  )

  if (state.status === 'error') return (
    <div className="update-bar update-bar-error">
      <span>⚠ Update error: {state.message}</span>
      <button className="update-btn-dismiss" onClick={onDismiss}>✕</button>
    </div>
  )

  return null
}

// --- Shortcuts Cheatsheet ---
const SHORTCUTS = [
  { section: 'Terminal' },
  { key: 'Ctrl+Shift+C', desc: 'Copy selected text' },
  { key: 'Ctrl+Shift+V', desc: 'Paste from clipboard' },
  { key: 'Right-click', desc: 'Copy selection / Paste' },
  { key: 'R', desc: 'Reconnect (when disconnected)' },
  { section: 'Editor' },
  { key: 'Ctrl+S', desc: 'Save file to server' },
  { section: 'Snippets' },
  { key: 'Insert', desc: 'Send command without Enter' },
  { key: '▶ Run', desc: 'Send command + Enter (execute)' },
  { section: 'Notes' },
  { key: '+ button', desc: 'New note' },
  { key: '✏️ button', desc: 'Edit note' },
  { key: 'Search bar', desc: 'Filter notes by title or content' },
  { section: 'General' },
  { key: 'F1 / ?', desc: 'Show this shortcuts reference' },
]

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>⌨ Keyboard Shortcuts</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body shortcuts-body">
          {SHORTCUTS.map((row, i) =>
            'section' in row ? (
              <div key={i} className="shortcuts-section">{row.section}</div>
            ) : (
              <div key={i} className="shortcut-row">
                <kbd className="shortcut-key">{row.key}</kbd>
                <span className="shortcut-desc">{row.desc}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// --- Status Bar ---
function StatusBar({ tab }: { tab: Tab | null }) {
  const { t, lang, setLang } = useLanguage()
  const [uptime, setUptime] = useState('')

  useEffect(() => {
    if (!tab?.connectedAt || tab.status !== 'connected') { setUptime(''); return }
    const update = () => {
      const secs = Math.floor((Date.now() - tab.connectedAt!) / 1000)
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setUptime(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [tab?.connectedAt, tab?.status])

  const statusColors: Record<string, string> = {
    connected: 'var(--green)', connecting: 'var(--yellow)',
    error: 'var(--red)', disconnected: 'var(--text3)',
  }

  const statusLabel = (status: string) => {
    if (status === 'connected') return t('statusConnected')
    if (status === 'connecting') return t('statusConnecting')
    if (status === 'disconnected') return t('statusDisconnected')
    if (status === 'error') return t('statusError')
    return status.toUpperCase()
  }

  return (
    <div className="status-bar">
      {!tab ? (
        <span className="status-item status-dim">{t('noActiveConnection')}</span>
      ) : (
        <>
          <span className="status-dot" style={{ background: statusColors[tab.status] || 'var(--text3)' }} />
          <span className="status-item">{tab.server.name}</span>
          <span className="status-sep">·</span>
          <span className="status-item status-dim" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {tab.server.username}@{tab.server.host}:{tab.server.port}
          </span>
          {uptime && (
            <>
              <span className="status-sep">·</span>
              <span className="status-item status-dim">⏱ {uptime}</span>
            </>
          )}
          <div className="status-spacer" />
          <span className="status-item status-dim" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
            {tab.status === 'connected' ? 'SSH · xterm-256color' : statusLabel(tab.status)}
          </span>
        </>
      )}
      {/* Language toggle — always visible on the right */}
      <div className="status-spacer" />
      <button
        className="status-lang-btn"
        onClick={() => setLang(lang === 'en' ? 'uk' : 'en')}
        title={lang === 'en' ? 'Switch to Ukrainian' : 'Перемкнути на English'}
      >
        {t('langToggle')}
      </button>
    </div>
  )
}

// --- Host Key Verification Modal ---
function HostKeyModal({
  host, port, fingerprint, keyType, reason,
  onAccept, onReject,
}: {
  host: string
  port: number
  fingerprint: string
  keyType: string
  reason: 'new' | 'changed'
  onAccept: (remember: boolean) => void
  onReject: () => void
}) {
  const [remember, setRemember] = useState(true)
  const isChanged = reason === 'changed'

  return (
    <div className="modal-overlay" onClick={onReject}>
      <div className="modal host-key-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{isChanged ? '⚠ Host Key Changed!' : '🔐 Unknown Host'}</span>
          <button className="modal-close" onClick={onReject}>✕</button>
        </div>
        <div className="modal-body">
          {isChanged ? (
            <div className="host-key-warning">
              <p><strong>WARNING: The host key for <code>{host}:{port}</code> has changed!</strong></p>
              <p>This could indicate a man-in-the-middle attack or the server was reinstalled. Verify with the system administrator before connecting.</p>
            </div>
          ) : (
            <p>Connecting to <strong>{host}:{port}</strong> for the first time.</p>
          )}
          <div className="host-key-info">
            <div className="host-key-row">
              <span className="host-key-label">Key type</span>
              <code className="host-key-value">{keyType}</code>
            </div>
            <div className="host-key-row">
              <span className="host-key-label">Fingerprint</span>
              <code className="host-key-value host-key-fingerprint">{fingerprint}</code>
            </div>
          </div>
          {!isChanged && (
            <label className="host-key-remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>Add to <code>~/.ssh/known_hosts</code></span>
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onReject}>Reject</button>
          {!isChanged && (
            <button className="btn-primary" onClick={() => onAccept(remember)}>Trust & Connect</button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- SSH Key Picker ---
const KEY_TYPE_LABEL: Record<string, string> = {
  openssh: 'OpenSSH', pem: 'PEM', ppk: 'PPK',
  ed25519: 'Ed25519', ecdsa: 'ECDSA', rsa: 'RSA', dsa: 'DSA',
  private: 'Private key',
  public: '⚠ Public key', unknown: '⚠ Unknown',
}

interface SshKey { name: string; path: string; keyType: string; encrypted: boolean }

function SshKeyPicker({
  value, onChange, onEncryptedChange,
}: {
  value: string
  onChange: (path: string) => void
  onEncryptedChange?: (encrypted: boolean) => void
}) {
  const { t } = useLanguage()
  const [keys, setKeys] = useState<SshKey[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genForm, setGenForm] = useState({ type: 'ed25519' as 'ed25519' | 'rsa', name: 'id_ed25519', passphrase: '' })
  const [genResult, setGenResult] = useState<string | null>(null)

  const reloadKeys = () => {
    nt?.listSshKeys().then((list: SshKey[]) => setKeys(list || []))
  }

  useEffect(() => {
    nt?.listSshKeys().then((list: SshKey[]) => { setKeys(list || []); setLoading(false) })
  }, [])

  const browse = async () => {
    const result = await nt?.selectSshKey()
    if (!result) return
    const { path: filePath, keyType, encrypted } = result
    if (keyType === 'public') {
      setWarning(`"${filePath.split(/[/\\]/).pop()}" — це ПУБЛІЧНИЙ ключ, він не підходить для входу. Оберіть приватний ключ (без .pub).`)
      return
    }
    if (keyType === 'unknown') {
      setWarning(`Не вдалося визначити тип ключа. Переконайтесь що це OpenSSH або PEM приватний ключ.`)
    } else {
      setWarning('')
    }
    onChange(filePath)
    onEncryptedChange?.(encrypted)
  }

  const selectKey = (k: SshKey) => {
    if (value === k.path) { onChange(''); setWarning(''); onEncryptedChange?.(false); return }
    setWarning('')
    onChange(k.path)
    onEncryptedChange?.(k.encrypted)
  }

  const filename = value ? value.split(/[/\\]/).pop() : ''
  const selectedKey = keys.find(k => k.path === value)

  return (
    <div className="key-picker">
      {!loading && keys.length > 0 && (
        <div className="key-list">
          {keys.map(k => (
            <div key={k.path} className={`key-item ${value === k.path ? 'active' : ''}`} onClick={() => selectKey(k)}>
              <span className="key-icon">{Ico.key(14)}</span>
              <span className="key-name">{k.name}</span>
              <span className="key-type-badge">{KEY_TYPE_LABEL[k.keyType] || k.keyType}</span>
              {k.encrypted && <span className="key-enc-badge">passphrase</span>}
              {value === k.path && <span className="key-check">✓</span>}
            </div>
          ))}
        </div>
      )}
      {!loading && keys.length === 0 && <div className="key-empty">Приватних ключів в ~/.ssh не знайдено</div>}

      <div className="key-browse-row">
        <button className="btn-secondary btn-key-browse" onClick={browse}>
          {Ico.folder(13)} {value
            ? `${filename}${selectedKey?.encrypted ? ' (passphrase)' : ''}`
            : t('chooseKeyFile')}
        </button>
        {value && <button className="btn-clear-key" onClick={() => { onChange(''); setWarning(''); onEncryptedChange?.(false) }}>✕</button>}
        <button className="btn-secondary btn-genkey" onClick={() => { setGenerating(v => !v); setGenResult(null) }}>
          {t('generateKey')}
        </button>
      </div>

      {/* Key generation panel */}
      {generating && (
        <div className="keygen-panel">
          <div className="keygen-row">
            <label>{t('keyType')}</label>
            <select value={genForm.type} onChange={e => {
              const t = e.target.value as 'ed25519' | 'rsa'
              setGenForm(f => ({ ...f, type: t, name: t === 'rsa' ? 'id_rsa' : 'id_ed25519' }))
            }}>
              <option value="ed25519">{t('keyTypeEd25519')}</option>
              <option value="rsa">{t('keyTypeRsa')}</option>
            </select>
          </div>
          <div className="keygen-row">
            <label>{t('keyFilename')}</label>
            <input value={genForm.name} onChange={e => setGenForm(f => ({ ...f, name: e.target.value }))} placeholder="id_ed25519" />
          </div>
          <div className="keygen-row">
            <label>{t('keyPassphrase')}</label>
            <input type="password" value={genForm.passphrase} onChange={e => setGenForm(f => ({ ...f, passphrase: e.target.value }))} placeholder={t('optional')} />
          </div>
          <button className="btn-primary btn-genkey-run" onClick={async () => {
            try {
              const res = await nt?.generateSshKey(genForm.type, genForm.name, genForm.passphrase || undefined)
              if (res) {
                setGenResult(`${t('keyGenerated')}${res.private_path}`)
                onChange(res.private_path)
                onEncryptedChange?.(!!genForm.passphrase)
                reloadKeys()
                setGenerating(false)
              }
            } catch (e: unknown) {
              setGenResult(`${t('keyGenError')}${e instanceof Error ? e.message : String(e)}`)
            }
          }}>{t('generateKeyPair')}</button>
          {genResult && <div className={`keygen-result ${genResult.startsWith('✓') ? 'ok' : 'err'}`}>{genResult}</div>}
        </div>
      )}

      {warning && <div className="key-warning">⚠ {warning}</div>}
    </div>
  )
}

// --- Server Modal (Add + Edit) ---
function ServerModal({
  existing, onSave, onClose,
}: {
  existing?: Server
  onSave: (s: Server, connect: boolean) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const isEdit = !!existing
  const initMode = existing?.useAgent ? 'agent' : existing?.privateKeyPath ? 'key' : 'password'
  const [form, setForm] = useState({
    name: existing?.name || '',
    host: existing?.host || '',
    port: String(existing?.port || '22'),
    username: existing?.username || '',
    password: existing?.password || '',
    privateKeyPath: existing?.privateKeyPath || '',
    passphrase: existing?.passphrase || '',
    color: existing?.color || '#00d4aa',
  })
  const [authMode, setAuthMode] = useState<'password' | 'key' | 'agent'>(initMode)
  const [keyEncrypted, setKeyEncrypted] = useState(false)
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null)
  const [useJump, setUseJump] = useState(!!existing?.jumpHost)
  const [jump, setJump] = useState({
    host: existing?.jumpHost?.host || '',
    port: String(existing?.jumpHost?.port || '22'),
    username: existing?.jumpHost?.username || '',
    password: existing?.jumpHost?.password || '',
    privateKeyPath: existing?.jumpHost?.privateKeyPath || '',
    authMode: existing?.jumpHost?.useAgent ? 'agent' : existing?.jumpHost?.privateKeyPath ? 'key' : 'password' as 'password' | 'key' | 'agent',
  })
  const colors = ['#00d4aa', '#7c6af7', '#f7706a', '#f0a500', '#4fc3f7', '#e91e8c']

  // Перевіряємо SSH agent при відкритті
  useEffect(() => {
    nt?.detectSshAgent().then((r: { available: boolean }) => setAgentAvailable(r?.available ?? false))
  }, [])

  const buildServer = (): Server => ({
    id: existing?.id || Date.now().toString(),
    name: form.name || form.host,
    host: form.host,
    port: parseInt(form.port) || 22,
    username: form.username,
    useAgent: authMode === 'agent' || undefined,
    password: authMode === 'password' ? (form.password || undefined) : undefined,
    privateKeyPath: authMode === 'key' ? (form.privateKeyPath || undefined) : undefined,
    passphrase: authMode === 'key' ? (form.passphrase || undefined) : undefined,
    color: form.color,
    jumpHost: useJump && jump.host && jump.username ? {
      host: jump.host,
      port: parseInt(jump.port) || 22,
      username: jump.username,
      useAgent: jump.authMode === 'agent' || undefined,
      password: jump.authMode === 'password' ? (jump.password || undefined) : undefined,
      privateKeyPath: jump.authMode === 'key' ? (jump.privateKeyPath || undefined) : undefined,
    } : undefined,
  })

  const valid = !!form.host && !!form.username

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{isEdit ? t('editConnection') : t('newConnection2')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label>{t('fieldName')}</label>
          <input placeholder={t('placeholderName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <label>{t('fieldHost')}</label>
          <input placeholder={t('placeholderHost')} value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} />
          <div className="form-row">
            <div>
              <label>{t('fieldPort')}</label>
              <input placeholder="22" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
            </div>
            <div>
              <label>{t('fieldUsername')}</label>
              <input placeholder={t('placeholderUsername')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab ${authMode === 'password' ? 'active' : ''}`} onClick={() => setAuthMode('password')}>{Ico.lock(13)} {t('authPassword')}</button>
            <button className={`auth-tab ${authMode === 'key' ? 'active' : ''}`} onClick={() => setAuthMode('key')}>{Ico.key(13)} {t('authKey')}</button>
            <button className={`auth-tab ${authMode === 'agent' ? 'active' : ''}`} onClick={() => setAuthMode('agent')}>
              {Ico.agent(13)} {t('authAgent')}{agentAvailable === true ? ' ✓' : agentAvailable === false ? ' ✗' : ''}
            </button>
          </div>

          {authMode === 'password' && (
            <>
              <label>{t('fieldPassword')}</label>
              <input type="password" placeholder={t('placeholderPassword')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </>
          )}

          {authMode === 'key' && (
            <>
              <label>{t('fieldSshKey')}</label>
              <SshKeyPicker
                value={form.privateKeyPath}
                onChange={p => setForm({ ...form, privateKeyPath: p })}
                onEncryptedChange={setKeyEncrypted}
              />
              {keyEncrypted && (
                <div className="key-warning" style={{ marginBottom: 6 }}>
                  🔐 {t('encryptedKeyWarning')}
                </div>
              )}
              <label style={{ marginTop: 6 }}>
                {t('fieldPassphrase')}
                {keyEncrypted
                  ? <span style={{ color: 'var(--red)', marginLeft: 4 }}>{t('passphraseRequired')}</span>
                  : <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>{t('passphraseIfEncrypted')}</span>}
              </label>
              <input
                type="password"
                placeholder={t('placeholderPassphrase')}
                value={form.passphrase}
                onChange={e => setForm({ ...form, passphrase: e.target.value })}
                style={keyEncrypted && !form.passphrase ? { borderColor: 'var(--red)' } : {}}
              />
            </>
          )}

          {authMode === 'agent' && (
            <div className={`agent-info ${agentAvailable ? 'agent-ok' : 'agent-err'}`}>
              {agentAvailable === true && <>
                <span>✓</span>
                <div>
                  <strong>{t('agentFound')}</strong>
                  <div>{t('agentKeys')}</div>
                </div>
              </>}
              {agentAvailable === false && <>
                <span>✗</span>
                <div>
                  <strong>{t('agentNotFound')}</strong>
                  <div>{t('agentInstructions')}</div>
                </div>
              </>}
              {agentAvailable === null && <div>{t('checkingAgent')}</div>}
            </div>
          )}

          {/* ── Jump Host ─────────────────────────────────────────── */}
          <div className="jump-host-toggle" onClick={() => setUseJump(v => !v)}>
            <span className="jump-host-chevron" style={{ transform: useJump ? 'rotate(90deg)' : 'none' }}>›</span>
            <span>{t('proxyJump')}</span>
            {useJump && <span className="jump-host-badge">ON</span>}
          </div>

          {useJump && (
            <div className="jump-host-body">
              <div className="form-row">
                <div>
                  <label>{t('jumpHostLabel')}</label>
                  <input placeholder="bastion.company.com" value={jump.host}
                    onChange={e => setJump({ ...jump, host: e.target.value })} />
                </div>
                <div>
                  <label>{t('fieldPort')}</label>
                  <input placeholder="22" value={jump.port}
                    onChange={e => setJump({ ...jump, port: e.target.value })} />
                </div>
              </div>
              <label>{t('fieldUsername')}</label>
              <input placeholder="ubuntu" value={jump.username}
                onChange={e => setJump({ ...jump, username: e.target.value })} />

              <div className="auth-tabs" style={{ marginTop: 8 }}>
                <button className={`auth-tab ${jump.authMode === 'password' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'password' })}>{Ico.lock(12)} {t('authPassword')}</button>
                <button className={`auth-tab ${jump.authMode === 'key' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'key' })}>{Ico.key(12)} {t('authKey')}</button>
                <button className={`auth-tab ${jump.authMode === 'agent' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'agent' })}>{Ico.agent(12)} {t('authAgent')}</button>
              </div>

              {jump.authMode === 'password' && (
                <>
                  <label>{t('fieldPassword')}</label>
                  <input type="password" placeholder={t('placeholderPassword')} value={jump.password}
                    onChange={e => setJump({ ...jump, password: e.target.value })} />
                </>
              )}
              {jump.authMode === 'key' && (
                <>
                  <label>{t('fieldSshKey')}</label>
                  <input placeholder={t('placeholderKeyPath')} value={jump.privateKeyPath}
                    onChange={e => setJump({ ...jump, privateKeyPath: e.target.value })} />
                </>
              )}
              {jump.authMode === 'agent' && (
                <div className={`agent-info ${agentAvailable ? 'agent-ok' : 'agent-err'}`}
                  style={{ margin: '6px 0 0' }}>
                  <span>{agentAvailable ? '✓' : '✗'}</span>
                  <div>{agentAvailable ? 'Agent доступний' : 'SSH Agent не знайдено'}</div>
                </div>
              )}
            </div>
          )}

          <label>{t('fieldColor')}</label>
          <div className="color-row">
            {colors.map(c => (
              <div key={c} className={`color-dot ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          {isEdit ? (
            <>
              <button className="btn-secondary" disabled={!valid} onClick={() => valid && onSave(buildServer(), false)}>{t('save')}</button>
              <button className="btn-primary" disabled={!valid} onClick={() => valid && onSave(buildServer(), true)}>{t('saveAndConnect')}</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" disabled={!valid} onClick={() => valid && onSave(buildServer(), false)}>{t('saveOnly')}</button>
              <button className="btn-primary" disabled={!valid} onClick={() => valid && onSave(buildServer(), true)}>{t('connect')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Notes Panel ---
// Highlight matching substring in text
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="note-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function NotesPanel({ serverId, visible }: { serverId: string | null; visible: boolean }) {
  const { t } = useLanguage()
  const [notes, setNotes] = useState<Note[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Note | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!serverId) { setNotes([]); setSearch(''); return }
    nt?.getNotes(serverId).then((n: Note[]) => setNotes(n || []))
  }, [serverId])

  const save = async (note: Note) => {
    if (!serverId) return
    const updated = { ...note, updatedAt: new Date().toISOString() }
    await nt?.saveNote(serverId, updated)
    setNotes(prev => {
      const idx = prev.findIndex(n => n.id === note.id)
      if (idx >= 0) { const arr = [...prev]; arr[idx] = updated; return arr }
      return [...prev, updated]
    })
    setEditing(null)
  }

  const del = async (id: string) => {
    if (!serverId) return
    await nt?.deleteNote(serverId, id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const newNote = () => setEditing({ id: Date.now().toString(), title: 'New Note', content: '', updatedAt: '' })

  const exportMarkdown = async () => {
    if (!serverId || notes.length === 0) return
    const md = notes.map(n => `# ${n.title}\n\n${n.content || '_Empty_'}`).join('\n\n---\n\n')
    const serverName = serverId.replace(/[^a-z0-9]/gi, '_')
    await nt?.saveMarkdown(`notes_${serverName}.md`, md)
  }

  const q = search.trim().toLowerCase()

  const filtered = notes.filter(n =>
    !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  )

  // Auto-expand the only match, or all matches when searching
  const isExpanded = (id: string) => {
    if (q) return filtered.some(n => n.id === id)
    return expanded === id
  }

  return (
    <div className={`notes-panel${visible ? '' : ' notes-panel--collapsed'}`}>
      <div className="notes-header">
        <span>{t('notes')}</span>
        <div className="notes-header-actions">
          {notes.length > 0 && (
            <button className="notes-icon-btn" onClick={exportMarkdown} title={t('exportNotes')}>↓</button>
          )}
          <button className="notes-icon-btn" onClick={newNote} title={t('newNote')}>+</button>
        </div>
      </div>

      {/* Search bar — shown only when there are notes */}
      {notes.length > 0 && (
        <div className="notes-search">
          <input
            ref={searchRef}
            placeholder={t('searchNotes')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="notes-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus() }}>✕</button>
          )}
        </div>
      )}

      <div className="notes-list">
        {notes.length === 0 && (
          <div className="notes-empty">{t('noNotes').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}</div>
        )}
        {notes.length > 0 && filtered.length === 0 && (
          <div className="notes-empty">{t('noNotesMatch')}<br />"{search}"</div>
        )}
        {filtered.map(note => (
          <div key={note.id} className={`note-item ${isExpanded(note.id) ? 'note-expanded' : ''}`}>
            <div className="note-title-row" onClick={() => !q && setExpanded(expanded === note.id ? null : note.id)}>
              <span className="note-title">{highlight(note.title, search)}</span>
              <div className="note-actions">
                <button onClick={e => { e.stopPropagation(); setEditing(note) }}>✏️</button>
                <button onClick={e => { e.stopPropagation(); del(note.id) }}>🗑</button>
              </div>
            </div>
            {isExpanded(note.id) && (
              <div
                className="note-preview md-preview"
                dangerouslySetInnerHTML={{
                  __html: note.content
                    ? (q
                        // When searching: highlight matches in rendered markdown
                        ? renderMarkdown(note.content).replace(
                            new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                            '<mark class="note-highlight">$1</mark>'
                          )
                        : renderMarkdown(note.content))
                    : '<em>Empty note</em>'
                }}
              />
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{notes.some(n => n.id === editing.id) ? t('editNote') : t('newNoteTitle')}</span>
              <button className="modal-close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>{t('noteTitle')}</label>
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              <label>{t('noteContent')}</label>
              <textarea rows={12} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={() => save(editing)}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Snippets Panel ---
function SnippetsPanel({
  onInsert, onRun,
}: {
  onInsert: (cmd: string) => void
  onRun: (cmd: string) => void
}) {
  const { t } = useLanguage()
  const [tab, setTab] = useState<'mine' | 'library'>('mine')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Snippet | null>(null)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  useEffect(() => {
    nt?.getSnippets().then((s: Snippet[]) => setSnippets(s || []))
  }, [])

  const save = async (sn: Snippet) => {
    await nt?.saveSnippet(sn)
    setSnippets(prev => {
      const idx = prev.findIndex(x => x.id === sn.id)
      if (idx >= 0) { const a = [...prev]; a[idx] = sn; return a }
      return [...prev, sn]
    })
    setEditing(null)
  }

  const del = async (id: string) => {
    await nt?.deleteSnippet(id)
    setSnippets(prev => prev.filter(s => s.id !== id))
  }

  const newSnippet = (): Snippet => ({ id: Date.now().toString(), title: '', command: '', description: '' })

  const q = search.toLowerCase()

  // Mine tab
  const filtered = snippets.filter(s =>
    !q || s.title.toLowerCase().includes(q) || s.command.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
  )

  // Library tab
  const libFiltered = SNIPPET_LIBRARY.map(cat => ({
    ...cat,
    items: cat.items.filter(it =>
      !q || it.title.toLowerCase().includes(q) || it.command.toLowerCase().includes(q)
    )
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="snippets-panel">
      <div className="snippets-tabs">
        <button className={`snip-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>{t('mySnippets')}</button>
        <button className={`snip-tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>{t('library')}</button>
      </div>

      <div className="snippets-search">
        <input
          placeholder={t('searchSnippets')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="snip-search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {tab === 'mine' && (
        <div className="snippets-list">
          {filtered.length === 0 && (
            <div className="snip-empty">
              {search ? t('noMatches') : t('noSnippets').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}
            </div>
          )}
          {filtered.map(sn => (
            <div key={sn.id} className="snip-item">
              <div className="snip-title">{sn.title || <em>Untitled</em>}</div>
              <div className="snip-command">{sn.command}</div>
              {sn.description && <div className="snip-desc">{sn.description}</div>}
              <div className="snip-actions">
                <button className="snip-btn snip-insert" title={t('insertSnippet')} onClick={() => onInsert(sn.command)}>Insert</button>
                <button className="snip-btn snip-run" title={t('runSnippet')} onClick={() => onRun(sn.command)}>▶ Run</button>
                <button className="snip-btn snip-edit" title={t('editSnippet')} onClick={() => setEditing(sn)}>✏</button>
                <button className="snip-btn snip-del" title={t('deleteSnippet')} onClick={() => del(sn.id)}>🗑</button>
              </div>
            </div>
          ))}
          <button className="snip-add-btn" onClick={() => setEditing(newSnippet())}>{t('newSnippetBtn')}</button>
        </div>
      )}

      {tab === 'library' && (
        <div className="snippets-list">
          {libFiltered.map(cat => (
            <div key={cat.category} className="snip-category">
              <div
                className={`snip-cat-header ${expandedCat === cat.category ? 'expanded' : ''}`}
                onClick={() => setExpandedCat(prev => prev === cat.category ? null : cat.category)}
              >
                <span>{cat.icon} {cat.category}</span>
                <span className="snip-cat-count">{cat.items.length}</span>
                <span className="snip-cat-arrow">{expandedCat === cat.category ? '▾' : '▸'}</span>
              </div>
              {expandedCat === cat.category && cat.items.map((it, i) => (
                <div key={i} className="snip-item snip-lib-item">
                  <div className="snip-title">{it.title}</div>
                  <div className="snip-command">{it.command}</div>
                  {it.description && <div className="snip-desc">{it.description}</div>}
                  <div className="snip-actions">
                    <button className="snip-btn snip-insert" onClick={() => onInsert(it.command)}>Insert</button>
                    <button className="snip-btn snip-run" onClick={() => onRun(it.command)}>▶ Run</button>
                    <button className="snip-btn snip-save-lib" title={t('saveToSnippets')}
                      onClick={() => save({ id: Date.now().toString(), title: it.title, command: it.command, description: it.description })}>
                      + {t('save')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {libFiltered.length === 0 && <div className="snip-empty">{t('noMatches')}</div>}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editing.id && snippets.some(s => s.id === editing.id) ? t('editSnippetTitle') : t('newSnippetTitle')}</span>
              <button className="modal-close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>{t('snippetTitle')}</label>
              <input placeholder={t('snippetTitlePlaceholder')} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              <label>{t('snippetCommand')}</label>
              <textarea rows={4} className="snip-cmd-input" placeholder={t('snippetCommandPlaceholder')} value={editing.command} onChange={e => setEditing({ ...editing, command: e.target.value })} />
              <label>{t('snippetDescription')} <span style={{ opacity: 0.5, fontWeight: 400 }}>{t('optional')}</span></label>
              <input placeholder={t('snippetDescPlaceholder')} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={() => { if (editing.title && editing.command) save(editing) }}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── applyResize: let CSS flex do the layout, FitAddon reads computed size ──
// FitAddon uses getComputedStyle(container).height which IS updated by CSS layout
// even when window.innerHeight JS property lags in Electron on Windows.
// ── Split Pane types & helpers ──────────────────────────────────────────────
type SplitLayout = '1' | '2h' | '2v' | '4' | '6' | '8'

const LAYOUT_CONFIG: Record<SplitLayout, { cols: number; rows: number; panes: number }> = {
  '1':  { cols: 1, rows: 1, panes: 1 },
  '2h': { cols: 2, rows: 1, panes: 2 },
  '2v': { cols: 1, rows: 2, panes: 2 },
  '4':  { cols: 2, rows: 2, panes: 4 },
  '6':  { cols: 3, rows: 2, panes: 6 },
  '8':  { cols: 4, rows: 2, panes: 8 },
}

const DEFAULT_COL_RATIOS: Record<SplitLayout, number[]> = {
  '1':  [],
  '2h': [50],
  '2v': [],
  '4':  [50],
  '6':  [33.33, 66.67],
  '8':  [25, 50, 75],
}

interface PaneRect { top: number; left: number; width: number; height: number }

function getPaneRects(layout: SplitLayout, colRatios: number[], rowRatio: number): PaneRect[] {
  const { cols, rows } = LAYOUT_CONFIG[layout]
  const colBreaks = [0, ...colRatios, 100]
  const rowBreaks = rows === 1 ? [0, 100] : [0, rowRatio, 100]
  const rects: PaneRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        left:   colBreaks[c],
        top:    rowBreaks[r],
        width:  colBreaks[c + 1] - colBreaks[c],
        height: rowBreaks[r + 1] - rowBreaks[r],
      })
    }
  }
  return rects
}

// Layout picker icon SVGs (tiny grid previews)
const LAYOUT_ICONS: Record<SplitLayout, string> = {
  '1':  'M2 2h20v20H2z',
  '2h': 'M2 2h9v20H2zM13 2h9v20H13z',
  '2v': 'M2 2h20v9H2zM2 13h20v9H2z',
  '4':  'M2 2h9v9H2zM13 2h9v9H13zM2 13h9v9H2zM13 13h9v9H13z',
  '6':  'M2 2h6v9H2zM9 2h6v9H9zM16 2h6v9H16zM2 13h6v9H2zM9 13h6v9H9zM16 13h6v9H16z',
  '8':  'M2 2h4v9H2zM7 2h4v9H7zM12 2h4v9H12zM17 2h5v9H17zM2 13h4v9H2zM7 13h4v9H7zM12 13h4v9H12zM17 13h5v9H17z',
}

function applyResize(
  term: import('@xterm/xterm').Terminal,
  fit: import('@xterm/addon-fit').FitAddon,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core  = (term as any)._core
  const cellW = core?._renderService?.dimensions?.css?.cell?.width  ?? 0
  const cellH = core?._renderService?.dimensions?.css?.cell?.height ?? 0
  if (cellW === 0 || cellH === 0) return  // xterm renderer not ready yet
  try { fit.fit() } catch (_) {}
}

// --- Terminal Tab ---
function TerminalPane({ tab, active, onReconnect, inSplit }: { tab: Tab; active: boolean; onReconnect: () => void; inSplit?: boolean }) {
  const { t } = useLanguage()
  const outerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(tab.sessionId)
  const statusRef = useRef(tab.status)
  const onReconnectRef = useRef(onReconnect)

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Session logging
  const [logging, setLogging] = useState(false)
  const [logPath, setLogPath] = useState<string | null>(null)
  const loggingRef = useRef(false)
  useEffect(() => { loggingRef.current = logging }, [logging])

  // Search
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ line: number; text: string }[]>([])
  const [searchIdx, setSearchIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const showSearchRef = useRef(false)


  useEffect(() => { sessionIdRef.current = tab.sessionId }, [tab.sessionId])
  useEffect(() => { statusRef.current = tab.status }, [tab.status])
  useEffect(() => { onReconnectRef.current = onReconnect }, [onReconnect])
  useEffect(() => { showSearchRef.current = showSearch }, [showSearch])

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [showSearch])

  const doSearch = useCallback((query: string) => {
    const term = termRef.current
    if (!term || !query.trim()) { setSearchResults([]); return }
    const buf = term.buffer.active
    const results: { line: number; text: string }[] = []
    const q = query.toLowerCase()
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)
      if (!line) continue
      const text = line.translateToString(true)
      if (text.toLowerCase().includes(q)) results.push({ line: i, text })
    }
    setSearchResults(results)
    setSearchIdx(0)
    if (results.length > 0) term.scrollToLine(results[0].line)
  }, [])

  const searchNavigate = useCallback((dir: 'next' | 'prev') => {
    if (searchResults.length === 0) return
    const next = dir === 'next'
      ? (searchIdx + 1) % searchResults.length
      : (searchIdx - 1 + searchResults.length) % searchResults.length
    setSearchIdx(next)
    termRef.current?.scrollToLine(searchResults[next].line)
  }, [searchResults, searchIdx])

  useEffect(() => {
    if (!containerRef.current) return

    let term: Terminal
    let fit: FitAddon

    if (tab.terminal && tab.fitAddon) {
      // ── REUSE existing terminal ──────────────────────────────────────────────
      // Switching single ↔ split unmounts TerminalPane and mounts a new instance
      // in a different DOM location. Instead of creating a fresh Terminal (which
      // loses all scrollback), we move xterm's existing DOM element to our new
      // container. SSH listeners are already attached — don't re-add them.
      term = tab.terminal
      fit = tab.fitAddon
      const xtermEl = term.element  // the .xterm div created by term.open()
      if (xtermEl && xtermEl.parentElement !== containerRef.current) {
        containerRef.current.appendChild(xtermEl)
      }
      // Refit after DOM move — one RAF to let layout settle
      requestAnimationFrame(() => applyResize(term, fit))
    } else {
      // ── FRESH terminal ───────────────────────────────────────────────────────
      term = new Terminal({
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 14,
        fontWeight: 'normal',
        fontWeightBold: '600',
        drawBoldTextInBrightColors: false,
        letterSpacing: 0,
        lineHeight: 1.2,
        theme: {
          background: '#0f0f14',
          foreground: '#cdd6f4',
          cursor: '#00d4aa',
          selectionBackground: '#313244',
          black: '#1e1e2e', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
          blue: '#89b4fa', magenta: '#cba6f7', cyan: '#89dceb', white: '#cdd6f4',
          brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
          brightCyan: '#89dceb', brightWhite: '#a6adc8',
        },
        cursorBlink: true,
        scrollback: 131072,   // 128K lines — SecureCRT standard
      })

      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)

      // Initial fit — retry every frame until xterm renderer has cell dimensions
      let attempts = 0
      const tryInitialResize = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cellW = (term as any)._core?._renderService?.dimensions?.css?.cell?.width ?? 0
        if (cellW > 0 || attempts > 20) {
          applyResize(term, fit)
        } else {
          attempts++
          requestAnimationFrame(tryInitialResize)
        }
      }
      requestAnimationFrame(tryInitialResize)

      tab.terminal = term
      tab.fitAddon = fit

      // Input / key handlers — only once per terminal lifetime
      term.onData((data) => {
        if (sessionIdRef.current) nt?.sshSendInput(sessionIdRef.current, data)
      })

      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') return true
        // Ctrl+Shift+C — copy
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
          const sel = term.getSelection()
          if (sel) navigator.clipboard.writeText(sel)
          return false
        }
        // Ctrl+Shift+V — paste
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
          e.preventDefault()
          navigator.clipboard.readText().then(text => {
            if (text && sessionIdRef.current) nt?.sshSendInput(sessionIdRef.current, text)
          })
          return false
        }
        // Ctrl+F — search
        if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
          e.preventDefault()
          setShowSearch(v => !v)
          return false
        }
        // Escape — close search
        if (e.key === 'Escape' && showSearchRef.current) {
          setShowSearch(false)
          setSearchQuery('')
          setSearchResults([])
          term.focus()
          return false
        }
        // R — reconnect when disconnected/error
        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.altKey && !e.metaKey &&
            (statusRef.current === 'disconnected' || statusRef.current === 'error')) {
          onReconnectRef.current()
          return false
        }
        return true
      })

      if (tab.status === 'connecting') {
        term.write('\r\n\x1b[33mConnecting to ' + tab.server.host + '...\x1b[0m\r\n')
      }

      // SSH output / close / error — attached once for terminal lifetime
      const handleOutput = (sessionId: string, data: string) => {
        if (sessionId === sessionIdRef.current) {
          term.write(data)
          // Append to log if logging is active for this session
          if (loggingRef.current && sessionId) {
            nt?.sessionAppendLog(sessionId, data).catch(() => {})
          }
        }
      }
      const handleClose = (sessionId: string) => {
        if (sessionId === sessionIdRef.current) {
          term.write('\r\n\x1b[31mConnection closed.\x1b[0m')
          term.write('  \x1b[38;5;240mPress \x1b[33mr\x1b[38;5;240m to reconnect\x1b[0m\r\n')
        }
      }
      const handleError = (sessionId: string, error: string) => {
        if (sessionId === sessionIdRef.current) {
          term.write('\r\n\x1b[31m✗ Error: ' + error + '\x1b[0m\r\n')
          term.write('\x1b[33mClose this tab and try again.\x1b[0m\r\n')
        }
      }
      nt?.onSshOutput(handleOutput)
      nt?.onSshClose(handleClose)
      nt?.onSshError(handleError)
    }

    termRef.current = term
    fitRef.current = fit

    // Right-click context menu — always re-register after DOM move / fresh mount
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const rect = containerRef.current!.getBoundingClientRect()
      setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    containerRef.current.addEventListener('contextmenu', handleContextMenu)

    // ── Resize ──
    const doResize = () => {
      const t = termRef.current
      const f = fitRef.current
      if (!t || !f) return
      // Skip if container has no size (display:none or not yet laid out)
      const rect = outerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return
      applyResize(t, f)
      if (sessionIdRef.current) nt?.sshResize(sessionIdRef.current, t.cols, t.rows)

    }

    // 1. tauri://resize — reliable OS-level event from Tauri Rust layer.
    //    window.resize does NOT fire in WebView2 when the native window is resized
    //    (same limitation as Electron on Windows). onWindowResize() now wraps this.
    const removeIpcResize = nt?.onWindowResize?.(() => doResize())

    // 2. ResizeObserver on outerRef (normal flex element, not absolute child).
    //    Catches resize caused by split layout changes, panel open/close, etc.
    const ro = new ResizeObserver(() => doResize())
    const observeTarget = outerRef.current
    if (observeTarget) {
      ro.observe(observeTarget)
    } else {
      // outerRef not ready yet (shouldn't happen, but guard anyway)
      console.warn('[SENU] TerminalPane: outerRef.current null during RO setup')
    }

    // 3. window.resize — still useful on macOS / Linux where it works
    const onWinResize = () => doResize()
    window.addEventListener('resize', onWinResize)

    return () => {
      removeIpcResize?.()
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      containerRef.current?.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  // When tab becomes active — refit after paint so dimensions are settled
  useLayoutEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      const term = termRef.current
      const fit = fitRef.current
      if (!term || !fit) return
      applyResize(term, fit)
      term.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  const ctxCopy = async () => {
    const sel = termRef.current?.getSelection()
    if (sel) await navigator.clipboard.writeText(sel)
    setCtxMenu(null)
    termRef.current?.focus()
  }
  const ctxPaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && sessionIdRef.current) nt?.sshSendInput(sessionIdRef.current, text)
    } catch {}
    setCtxMenu(null)
    termRef.current?.focus()
  }
  const ctxClear = () => {
    termRef.current?.clear()
    setCtxMenu(null)
    termRef.current?.focus()
  }

  return (
    <div
      ref={outerRef}
      style={{ display: (active || inSplit) ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}
      onClick={() => { setCtxMenu(null); termRef.current?.focus() }}
    >
      {/* Log indicator */}
      {logging && logPath && (
        <div className="term-log-indicator" onClick={e => e.stopPropagation()}>
          <span className="term-log-dot" />
          <span className="term-log-path" title={logPath}>REC {logPath.split(/[/\\]/).pop()}</span>
          <button className="term-log-stop" title="Stop logging" onClick={async () => {
            if (tab.sessionId) await nt?.sessionStopLog(tab.sessionId).catch(() => {})
            setLogging(false); setLogPath(null)
          }}>■</button>
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="term-search-bar" onClick={e => e.stopPropagation()}>
          <input
            ref={searchInputRef}
            className="term-search-input"
            placeholder={t('searchTerminal')}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.shiftKey ? searchNavigate('prev') : searchNavigate('next') }
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]); termRef.current?.focus() }
            }}
          />
          {searchResults.length > 0 && (
            <span className="term-search-count">{searchIdx + 1}/{searchResults.length}</span>
          )}
          {searchQuery && searchResults.length === 0 && (
            <span className="term-search-no-match">{t('noMatches')}</span>
          )}
          <button className="term-search-nav" onClick={() => searchNavigate('prev')} title={t('prevMatch')}>↑</button>
          <button className="term-search-nav" onClick={() => searchNavigate('next')} title={t('nextMatch')}>↓</button>
          <button className="term-search-close" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); termRef.current?.focus() }}>✕</button>
        </div>
      )}

      {/* Terminal container — outer div provides the visual boundary;
          inner div is the actual xterm mount point with 8px inset on all sides.
          This prevents FitAddon from reading border-box padding as available height. */}
      <div className="terminal-container">
        <div ref={containerRef} style={{ position: 'absolute', top: '8px', right: '8px', bottom: '8px', left: '8px' }} />
      </div>

      {/* Context menu — absolute inside position:relative outer div */}
      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button className="ctx-item" onClick={ctxCopy}>
            <span className="ctx-icon">⎘</span> {t('copyText')}
            <span className="ctx-shortcut">Ctrl+Shift+C</span>
          </button>
          <button className="ctx-item" onClick={ctxPaste}>
            <span className="ctx-icon">⏎</span> {t('pasteText')}
            <span className="ctx-shortcut">Ctrl+Shift+V</span>
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { setShowSearch(true); setCtxMenu(null) }}>
            <span className="ctx-icon">🔍</span> {t('findInTerminal')}
            <span className="ctx-shortcut">Ctrl+F</span>
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={async () => {
            setCtxMenu(null)
            if (logging) {
              if (tab.sessionId) await nt?.sessionStopLog(tab.sessionId).catch(() => {})
              setLogging(false); setLogPath(null)
            } else if (tab.sessionId) {
              const path = await nt?.sessionStartLog(tab.sessionId).catch(() => null)
              if (path) { setLogging(true); setLogPath(path) }
            }
          }}>
            <span className="ctx-icon">{logging ? '■' : '⏺'}</span>
            {logging ? t('stopLoggingMenu') : t('startLogging')}
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item ctx-item-danger" onClick={ctxClear}>
            <span className="ctx-icon">✕</span> {t('clearTerminal')}
          </button>
        </div>
      )}
    </div>
  )
}

// --- SFTP file type class ---
function sftpFileClass(name: string): string {
  if (name.startsWith('.')) return 'f-hidden'
  const lower = name.toLowerCase()
  if (lower === '.env' || lower.startsWith('.env.') || lower.endsWith('.env')) return 'f-env'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['md','mdx','rst','txt'].includes(ext)) return 'f-doc'
  if (['env'].includes(ext)) return 'f-env'
  if (['js','ts','jsx','tsx','py','rb','go','rs','php','java','c','cpp','cs','kt','swift','lua','pl','sh','bash','zsh','fish'].includes(ext)) return 'f-code'
  if (['json','yaml','yml','toml','ini','cfg','conf','config','xml','htaccess'].includes(ext)) return 'f-config'
  if (['png','jpg','jpeg','gif','svg','ico','webp','bmp'].includes(ext)) return 'f-image'
  if (['zip','tar','gz','bz2','xz','rar','7z','deb','rpm'].includes(ext)) return 'f-archive'
  if (['sql','db','sqlite','sqlite3'].includes(ext)) return 'f-db'
  return ''
}

// --- SFTP File Browser ---
function SftpBrowser({
  sessionId, onOpenFile,
}: {
  sessionId: string | null
  onOpenFile: (remotePath: string, sessionId: string) => void
}) {
  const { t } = useLanguage()
  const [path, setPath] = useState('/')
  const [files, setFiles] = useState<{ name: string; isDir: boolean; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [pathInput, setPathInput] = useState('/')
  const [transferring, setTransferring] = useState<string | null>(null) // filename being transferred

  const loadDir = useCallback(async (dirPath: string) => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    try {
      // bridge returns FileEntry[] directly (already sorted by Rust: dirs first)
      const entries = await nt?.sftpListDir(sessionId, dirPath) ?? []
      setFiles(entries)
      setPath(dirPath)
      setPathInput(dirPath)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (sessionId) loadDir('/')
    else { setFiles([]); setPath('/') }
  }, [sessionId])

  const navigate = (_name: string, isDir: boolean, fullPath: string) => {
    if (isDir) { loadDir(fullPath); return }
    if (sessionId) onOpenFile(fullPath, sessionId)
  }

  const goUp = () => {
    if (path === '/') return
    const parent = path.substring(0, path.lastIndexOf('/')) || '/'
    loadDir(parent)
  }

  const commitPathEdit = () => {
    setEditingPath(false)
    if (pathInput !== path) loadDir(pathInput || '/')
  }

  const handleDownload = async (e: React.MouseEvent, remotePath: string, name: string) => {
    e.stopPropagation()
    if (!sessionId || transferring) return
    setTransferring(name)
    try {
      await nt?.sftpDownloadFile(sessionId, remotePath)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTransferring(null)
    }
  }

  const handleUpload = async () => {
    if (!sessionId || transferring) return
    setTransferring('…')
    try {
      const uploaded = await nt?.sftpUploadFile(sessionId, path)
      if (uploaded) loadDir(path) // refresh to show new file
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTransferring(null)
    }
  }

  if (!sessionId) return (
    <div className="sftp-no-session">
      <span>📡</span>
      <div>{t('sftpEmpty').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}</div>
    </div>
  )

  return (
    <div className="sftp-browser">
      <div className="sftp-toolbar">
        <button className="sftp-btn" onClick={goUp} disabled={path === '/'} title={t('goUp')}>↑</button>
        {editingPath ? (
          <input
            className="sftp-path-input"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitPathEdit()
              if (e.key === 'Escape') setEditingPath(false)
            }}
            onBlur={commitPathEdit}
            autoFocus
          />
        ) : (
          <span
            className="sftp-path"
            title="Click to edit path"
            onClick={() => { setPathInput(path); setEditingPath(true) }}
          >{path}</span>
        )}
        <button className="sftp-btn" onClick={() => navigator.clipboard.writeText(path)} title={t('copyPath')}>⎘</button>
        <button className="sftp-btn" onClick={() => loadDir(path)} title={t('refresh')}>↺</button>
        <button
          className="sftp-btn sftp-btn-upload"
          onClick={handleUpload}
          disabled={!!transferring}
          title={t('uploadTitle')}
        >{t('upload')}</button>
      </div>
      {loading && <div className="sftp-status">{t('loading')}</div>}
      {transferring && <div className="sftp-status sftp-status-transfer">{transferring === '…' ? t('uploading') : `${t('downloading')}${transferring}…`}</div>}
      {error && <div className="sftp-status sftp-status-error" title={error}>⚠ {error}</div>}
      {!loading && !error && (
        <div className="sftp-list">
          {files.length === 0 && <div className="sftp-status">{t('emptyDirectory')}</div>}
          {files.map(f => (
            <div
              key={f.name}
              className={`sftp-item ${f.isDir ? 'is-dir' : `is-file ${sftpFileClass(f.name)}`}`}
              onClick={() => navigate(f.name, f.isDir, f.path)}
              title={f.name}
            >
              <span className="sftp-icon">{f.isDir ? '▸' : '·'}</span>
              <span className="sftp-name">{f.name}</span>
              {!f.isDir && (
                <button
                  className="sftp-dl-btn"
                  onClick={e => handleDownload(e, f.path, f.name)}
                  disabled={!!transferring}
                  title={`${t('download')}${f.name}`}
                >↓</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Command Palette ---
type PaletteItem = {
  id: string
  section: string
  name: string
  sub?: string
  dot?: string
  icon?: React.ReactNode
  kbd?: string
  action: () => void
}

// ─── Fuzzy search helpers ──────────────────────────────────────────────────

/**
 * Нижчий score = кращий збіг.
 * Penalizes large gaps between matched characters.
 */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 0
  const t = text.toLowerCase()
  let score = 0
  let qi = 0
  let lastMatch = -1
  for (let i = 0; i < t.length && qi < query.length; i++) {
    if (t[i] === query[qi]) {
      score += (i - lastMatch - 1) * 2 // gap penalty
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '-' || t[i - 1] === '_') score -= 5 // word boundary bonus
      lastMatch = i
      qi++
    }
  }
  return qi === query.length ? score : Infinity
}

/** Кращий fuzzy score з кількох полів */
function fuzzyBest(query: string, ...fields: string[]): number {
  return Math.min(...fields.map(f => fuzzyScore(f, query)))
}

function CommandPalette({
  servers, tabs, onClose, onConnect, onChangeSplitLayout, onToggleNotes, onToggleSide,
}: {
  servers: Server[]
  groups?: TabGroup[]
  tabs: Tab[]
  activeTab?: string | null
  onClose: () => void
  onConnect: (s: Server) => void
  onChangeSplitLayout: (l: SplitLayout) => void
  onToggleNotes: () => void
  onToggleSide: () => void
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const q = query.trim().toLowerCase()

  // ── Build + fuzzy-filter items ──────────────────────────────────────────────
  type ScoredItem = PaletteItem & { _score: number }
  const allItems: ScoredItem[] = []

  // Open sessions
  if (tabs.length > 0) {
    tabs.forEach(tab => {
      const score = fuzzyBest(q, tab.server.name, tab.server.host, tab.server.username)
      if (!q || score < Infinity) {
        allItems.push({
          id: 'tab-' + tab.id, section: t('paletteSectionSessions'),
          name: tab.server.name,
          sub: `${tab.server.username}@${tab.server.host}:${tab.server.port}`,
          dot: tab.server.color || '#00d4aa',
          action: () => { onClose() },
          _score: score,
        })
      }
    })
  }

  // Saved servers
  servers.forEach(s => {
    const score = fuzzyBest(q, s.name, s.host, s.username || '')
    if (!q || score < Infinity) {
      allItems.push({
        id: 'srv-' + s.id, section: t('paletteSectionConnect'),
        name: s.name,
        sub: `${s.username}@${s.host}:${s.port}`,
        dot: s.color || '#00d4aa',
        action: () => { onConnect(s); onClose() },
        _score: score,
      })
    }
  })

  // Layouts
  const layouts: { l: SplitLayout; label: string }[] = [
    { l: '1', label: t('layoutSingle') }, { l: '2h', label: t('layout2col') },
    { l: '2v', label: t('layout2row') }, { l: '4', label: t('layout2x2') },
    { l: '6', label: t('layout3x2') }, { l: '8', label: t('layout4x2') },
  ]
  layouts.forEach(({ l, label }) => {
    const score = fuzzyBest(q, label, 'layout split ' + l)
    if (!q || score < Infinity) {
      allItems.push({
        id: 'layout-' + l, section: t('paletteSectionLayout'),
        name: label, sub: `Split: ${l.toUpperCase()}`,
        icon: Ico.filter(13),
        action: () => { onChangeSplitLayout(l); onClose() },
        _score: score,
      })
    }
  })

  // Actions
  const actions = [
    { id: 'act-notes', name: t('actionToggleNotes'),  sub: t('actionToggleNotesDesc'), kbd: 'N', fn: () => { onToggleNotes(); onClose() } },
    { id: 'act-side',  name: t('actionToggleSidebar'),  sub: t('actionToggleSidebarDesc'),  kbd: 'B', fn: () => { onToggleSide(); onClose() } },
    { id: 'act-new',   name: t('actionNewConnection'),       sub: t('actionNewConnectionDesc'),  kbd: '+', fn: () => { onClose() } },
  ]
  actions.forEach(a => {
    const score = fuzzyBest(q, a.name, a.sub || '')
    if (!q || score < Infinity) {
      allItems.push({ id: a.id, section: 'Actions', name: a.name, sub: a.sub, kbd: a.kbd, action: a.fn, _score: score })
    }
  })

  // Sort within each section by fuzzy score when query is active
  const items: PaletteItem[] = q
    ? allItems.sort((a, b) => a._score - b._score)
    : allItems

  const clampedIdx = Math.min(selectedIdx, Math.max(0, items.length - 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); items[clampedIdx]?.action() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // Group items by section
  const sections: { title: string; items: PaletteItem[] }[] = []
  items.forEach(item => {
    const sec = sections.find(s => s.title === item.section)
    if (sec) sec.items.push(item)
    else sections.push({ title: item.section, items: [item] })
  })

  let globalIdx = 0

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" onKeyDown={handleKey}>
        <div className="palette-input-wrap">
          <span className="palette-icon">{Ico.filter(15)}</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={t('palettePlaceholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
          />
          {query && (
            <button style={{ background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:11 }}
              onClick={() => setQuery('')}>✕</button>
          )}
        </div>
        <div className="palette-results">
          {sections.length === 0 && <div className="palette-empty">{t('paletteNoResults')}{query}"</div>}
          {sections.map(sec => (
            <div key={sec.title}>
              <div className="palette-section">{sec.title}</div>
              {sec.items.map(item => {
                const idx = globalIdx++
                return (
                  <button
                    key={item.id}
                    className={`palette-item ${idx === clampedIdx ? 'palette-item--selected' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <div className="palette-item-icon">
                      {item.dot
                        ? <span className="palette-dot" style={{ background: item.dot }} />
                        : item.icon || Ico.plus(13)
                      }
                    </div>
                    <div className="palette-item-main">
                      <div className="palette-item-name">{item.name}</div>
                      {item.sub && <div className="palette-item-sub">{item.sub}</div>}
                    </div>
                    {item.kbd && <span className="palette-item-kbd">{item.kbd}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// --- Group creation modal ---
const GROUP_COLORS = ['#5B4FE8', '#00d4aa', '#f7706a', '#f0a500', '#4fc3f7', '#e91e8c', '#7c6af7', '#a8e063']

function GroupModal({ onSave, onClose }: { onSave: (name: string, color: string) => void; onClose: () => void }) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t('newGroup')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label>{t('groupName')}</label>
          <input
            placeholder={t('groupNamePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color) }}
            autoFocus
          />
          <label style={{ marginTop: 12 }}>{t('groupColor')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {GROUP_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: c,
                  border: color === c ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', padding: 0, outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" disabled={!name.trim()} onClick={() => name.trim() && onSave(name.trim(), color)}>
            {t('groupCreate')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main App ---
export default function App() {
  const [servers, setServers] = useState<Server[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [showAddServer, setShowAddServer] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [quickConnectOpen, setQuickConnectOpen] = useState(false)
  const [quickConnectVal, setQuickConnectVal] = useState('')
  const [showNotes, setShowNotes] = useState(true)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [editorFiles, setEditorFiles] = useState<EditorFile[]>([])
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null)
  const [editorSaveError, setEditorSaveError] = useState('')
  const [activePanel, setActivePanel] = useState<'servers' | 'sftp' | 'snippets'>('servers')
  const [sideCollapsed, setSideCollapsed] = useState(true)   // hidden by default — use Ctrl+K or activity bar
  // ── Split pane ──
  const [splitLayout, setSplitLayout] = useState<SplitLayout>('1')
  const [paneSlots, setPaneSlots] = useState<(string | null)[]>([null])
  const [splitColRatios, setSplitColRatios] = useState<number[]>([])
  const [splitRowRatio, setSplitRowRatio] = useState(50)
  const [splitLocked, setSplitLocked] = useState(false)
  const [activePaneIdx, setActivePaneIdx] = useState(0)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const termAreaRef = useRef<HTMLDivElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void; onCancel: () => void } | null>(null)
  const saveEditorFileRef = useRef<() => void>(() => {})
  // ── Tab groups ──
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [showGroupModal, setShowGroupModal] = useState<{ tabId: string } | null>(null)
  // ── Command palette ──
  const [showPalette, setShowPalette] = useState(false)
  // ── Auto-reconnect ──
  const intentionalDisconnectRef = useRef<Set<string>>(new Set())
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map())   // tabId → кількість спроб
  const reconnectTabImperativeRef = useRef<((tabId: string) => void) | null>(null)
  // ── Host key verification ──
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{
    sessionId: string
    host: string
    port: number
    fingerprint: string
    keyType: string
    reason: 'new' | 'changed'
  } | null>(null)

  // i18n
  const langState = useLangState()
  const { t } = langState

  // Load servers
  useEffect(() => {
    nt?.getServers().then(async (servers: Server[]) => {
      if (!servers?.length) { setServers([]); return }
      // Restore secrets from system keychain for this session
      const withSecrets = await Promise.all(servers.map(async (s: Server) => {
        try {
          const pw  = await nt?.vaultLoad(s.id, 'password')
          const pp  = await nt?.vaultLoad(s.id, 'passphrase')
          return { ...s, password: pw ?? undefined, passphrase: pp ?? undefined }
        } catch { return s }
      }))
      setServers(withSecrets)
    })
  }, [])

  // Groups are session-only — tabs don't persist so groups without tabs make no sense
  const persistGroups = useCallback((next: TabGroup[]) => {
    setGroups(next)
  }, [])

  const assignTabToGroup = useCallback((tabId: string, groupId: string | null) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId: groupId ?? undefined } : t))
    setContextMenu(null)
  }, [])

  const createGroup = useCallback((name: string, color: string, tabId: string) => {
    const newGroup: TabGroup = { id: Date.now().toString(), name, color }
    persistGroups([...groups, newGroup])
    assignTabToGroup(tabId, newGroup.id)
    setShowGroupModal(null)
  }, [groups, persistGroups, assignTabToGroup])

  const _deleteGroup = useCallback((groupId: string) => {
    persistGroups(groups.filter(g => g.id !== groupId))
    setTabs(prev => prev.map(t => t.groupId === groupId ? { ...t, groupId: undefined } : t))
    if (filterGroupId === groupId) setFilterGroupId(null)
  }, [groups, persistGroups, filterGroupId])
  void _deleteGroup // available for future use

  // F1 → shortcuts modal | Ctrl+K → command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowShortcuts(v => !v) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(v => !v) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); setQuickConnectOpen(true) }
      if (e.key === 'Escape') { setShowPalette(false); setContextMenu(null); setQuickConnectOpen(false); setQuickConnectVal('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Global SSH close handler — оновлює статус таба і запускає auto-reconnect
  useEffect(() => {
    const unlisten = nt?.onSshClose?.((sessionId: string) => {
      // Знаходимо таб з цим sessionId
      setTabs(prev => {
        const tab = prev.find(t => t.sessionId === sessionId)
        if (!tab) return prev

        const wasIntentional = intentionalDisconnectRef.current.has(sessionId)
        if (wasIntentional) {
          intentionalDisconnectRef.current.delete(sessionId)
          return prev.map(t => t.sessionId === sessionId ? { ...t, status: 'disconnected' as const } : t)
        }

        // Неочікуваний обрив — показуємо 'disconnected' і плануємо reconnect
        const tabId = tab.id
        const attempt = reconnectAttemptsRef.current.get(tabId) ?? 0
        const maxAttempts = 5
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000) // exp backoff: 2s→4s→8s→16s→30s

        // Очищуємо старий таймер якщо є
        const oldTimer = reconnectTimersRef.current.get(tabId)
        if (oldTimer) clearTimeout(oldTimer)

        if (attempt < maxAttempts) {
          reconnectAttemptsRef.current.set(tabId, attempt + 1)
          const delaySec = Math.round(delay / 1000)
          // Повідомляємо в термінал про майбутній reconnect
          tab.terminal?.write(`\r\n\x1b[33m⟳ Connection lost. Reconnecting in ${delaySec}s (attempt ${attempt + 1}/${maxAttempts})...\x1b[0m\r\n`)
          const timer = setTimeout(() => {
            reconnectTimersRef.current.delete(tabId)
            reconnectTabImperativeRef.current?.(tabId)
          }, delay)
          reconnectTimersRef.current.set(tabId, timer)
        } else {
          reconnectAttemptsRef.current.delete(tabId)
          tab.terminal?.write('\r\n\x1b[31m✗ Auto-reconnect gave up after 5 attempts. Press ↻ to retry manually.\x1b[0m\r\n')
        }

        return prev.map(t =>
          t.sessionId === sessionId
            ? { ...t, status: 'disconnected' as const, sessionId: null }
            : t
        )
      })
    })
    return () => unlisten?.()
  }, [])

  // Host key verification
  useEffect(() => {
    const unlisten = nt?.onHostKeyVerify?.((event: {
      sessionId: string; host: string; port: number;
      fingerprint: string; keyType: string; reason: 'new' | 'changed'
    }) => {
      setHostKeyPrompt(event)
    })
    return () => unlisten?.()
  }, [])

  // Auto-updater events
  useEffect(() => {
    nt?.onUpdaterEvent?.((event: string, data?: any) => {
      switch (event) {
        case 'checking':   setUpdateState({ status: 'checking' }); break
        case 'available':  setUpdateState({ status: 'available', version: data.version }); break
        case 'not-available': setUpdateState({ status: 'idle' }); break
        case 'progress':   setUpdateState({ status: 'downloading', percent: data.percent }); break
        case 'downloaded': setUpdateState({ status: 'downloaded', version: data.version }); break
        case 'error':      setUpdateState({ status: 'error', message: data.message }); break
      }
    })
  }, [])

  const activeTabData = tabs.find(t => t.id === activeTab) || null
  const editorFile = editorFiles.find(f => f.remotePath === activeEditorPath) || null

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmDialog({
        message,
        onConfirm: () => { setConfirmDialog(null); resolve(true) },
        onCancel:  () => { setConfirmDialog(null); resolve(false) },
      })
    })
  }, [])

  // Keep save ref fresh so Monaco Ctrl+S always saves current file
  useEffect(() => {
    saveEditorFileRef.current = async () => {
      if (!editorFile) return
      setEditorSaveError('')
      try {
        // sftpWriteFile returns void — throws on error
        await nt?.sftpWriteFile(editorFile.sessionId, editorFile.remotePath, editorFile.content)
        setEditorFiles(prev => prev.map(f =>
          f.remotePath === editorFile.remotePath ? { ...f, modified: false } : f
        ))
        showToast(`Saved: ${editorFile.remotePath.split('/').pop()}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setEditorSaveError(msg)
        showToast(msg, 'error')
      }
    }
  }, [editorFile, showToast])

  // ── Split layout change ──
  const changeSplitLayout = useCallback((newLayout: SplitLayout, currentTabs: Tab[], currentActiveTab: string | null, currentSlots: (string | null)[]) => {
    const { panes: newCount } = LAYOUT_CONFIG[newLayout]
    setSplitLayout(newLayout)
    setSplitColRatios(DEFAULT_COL_RATIOS[newLayout])
    setSplitRowRatio(50)
    setActivePaneIdx(0)
    setShowLayoutPicker(false)

    // Slots: keep existing assignments, fill NEW empty slots with unassigned tabs.
    // If no content yet → distribute all open tabs into slots (active tab first).
    const hasSlotContent = currentSlots.some(s => s !== null)
    let newSlots: (string | null)[]

    if (hasSlotContent) {
      // Start with old slot assignments (truncate or extend to newCount)
      const base = Array.from({ length: newCount }, (_, i) => currentSlots[i] ?? null)
      // Find tabs not yet assigned to any slot
      const assignedIds = new Set(base.filter((s): s is string => s !== null))
      const unassigned = currentTabs
        .filter(t => !assignedIds.has(t.id))
        .map(t => t.id)
      // Fill empty slots with unassigned tabs in order
      newSlots = base.map(s => s !== null ? s : (unassigned.shift() ?? null))
    } else {
      // Fill from open tabs: active tab → slot 0, rest in order
      const ordered = currentActiveTab
        ? [currentActiveTab, ...currentTabs.filter(t => t.id !== currentActiveTab).map(t => t.id)]
        : currentTabs.map(t => t.id)
      newSlots = Array.from({ length: newCount }, (_, i) => ordered[i] ?? null)
    }
    setPaneSlots(newSlots)
  }, [])

  // ── Splitter drag handlers ──
  const startColDrag = useCallback((splitterIdx: number) => (e: React.MouseEvent) => {
    if (splitLocked) return
    e.preventDefault()
    const startX = e.clientX
    const startRatio = splitColRatios[splitterIdx]
    const areaW = termAreaRef.current?.offsetWidth ?? 1000
    const onMove = (ev: MouseEvent) => {
      const pct = Math.max(5, Math.min(95, startRatio + ((ev.clientX - startX) / areaW) * 100))
      setSplitColRatios(prev => prev.map((r, i) => i === splitterIdx ? pct : r))
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [splitLocked, splitColRatios])

  const startRowDrag = useCallback((e: React.MouseEvent) => {
    if (splitLocked) return
    e.preventDefault()
    const startY = e.clientY
    const startRatio = splitRowRatio
    const areaH = termAreaRef.current?.offsetHeight ?? 600
    const onMove = (ev: MouseEvent) => {
      const pct = Math.max(10, Math.min(90, startRatio + ((ev.clientY - startY) / areaH) * 100))
      setSplitRowRatio(pct)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [splitLocked, splitRowRatio])

  const connectServer = useCallback(async (server: Server) => {
    const tabId = Date.now().toString()
    const newTab: Tab = {
      id: tabId,
      server,
      sessionId: null,
      status: 'connecting',
      terminal: null,
      fitAddon: null,
    }

    setTabs(prev => [...prev, newTab])
    setActiveTab(tabId)
    // In split mode: prefer first empty slot; fall back to active pane
    if (splitLayout !== '1') {
      const emptyIdx = paneSlots.findIndex(s => s === null)
      const targetIdx = emptyIdx !== -1 ? emptyIdx : activePaneIdx
      setActivePaneIdx(targetIdx)
      setPaneSlots(prev => {
        const next = [...prev]
        next[targetIdx] = tabId
        return next
      })
    }

    // Таймер — якщо через 5с ще connecting, показуємо підказку в терміналі
    const hintTimer = setTimeout(() => {
      setTabs(prev => prev.map(t => {
        if (t.id === tabId && t.status === 'connecting' && t.terminal) {
          t.terminal.write('\r\n\x1b[33m⏳ Still connecting... (check server auth.log for errors)\x1b[0m\r\n')
        }
        return t
      }))
    }, 5000)

    try {
      // Vault fallback: if secrets not in memory, load from system keychain
      let connectPassword = server.password
      let connectPassphrase = server.passphrase
      if (!server.useAgent && !server.privateKeyPath && !connectPassword) {
        connectPassword = (await nt?.vaultLoad(server.id, 'password').catch(() => null)) ?? undefined
      }
      if (server.privateKeyPath && !connectPassphrase) {
        connectPassphrase = (await nt?.vaultLoad(server.id, 'passphrase').catch(() => null)) ?? undefined
      }

      const result = await nt?.sshConnect({
        host: server.host,
        port: server.port,
        username: server.username,
        password: connectPassword,
        privateKeyPath: server.privateKeyPath,
        passphrase: connectPassphrase,
        useAgent: server.useAgent,
        jumpHost: server.jumpHost,
      })

      clearTimeout(hintTimer)
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, sessionId: result.sessionId, status: 'connected', connectedAt: Date.now() } : t
      ))
    } catch (err) {
      clearTimeout(hintTimer)
      const errMsg = typeof err === 'string' ? err : ((err as any)?.message || 'Connection failed')
      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          // Пишемо помилку прямо в термінал
          if (t.terminal) {
            t.terminal.write('\r\n\x1b[31m✗ Connection failed\x1b[0m\r\n')
            t.terminal.write('\x1b[31m  ' + errMsg + '\x1b[0m\r\n')
            t.terminal.write('\r\n\x1b[38;5;240mPress the × button on the tab to close.\x1b[0m\r\n')
          }
          return { ...t, status: 'error' }
        }
        return t
      }))
    }
  }, [splitLayout, paneSlots, activePaneIdx])

  const saveServer = useCallback(async (server: Server, connect: boolean) => {
    // 1. Persist secrets to system keychain (never stored in JSON)
    if (server.password) {
      await nt?.vaultSave(server.id, server.password, 'password').catch(console.error)
    }
    if (server.passphrase) {
      await nt?.vaultSave(server.id, server.passphrase, 'passphrase').catch(console.error)
    }
    // 2. Save server metadata without secrets
    await nt?.saveServer({ ...server, password: undefined, passphrase: undefined })
    // 3. Update React state with secrets in memory (for this session)
    setServers(prev => {
      const idx = prev.findIndex(s => s.id === server.id)
      if (idx >= 0) { const arr = [...prev]; arr[idx] = server; return arr }
      return [...prev, server]
    })
    setShowAddServer(false)
    setEditingServer(null)
    if (connect) connectServer(server)
  }, [connectServer])

  const deleteServer = useCallback(async (serverId: string) => {
    // Remove secrets from system keychain first
    await nt?.vaultDeleteServer(serverId).catch(console.error)
    await nt?.deleteServer(serverId)
    setServers(prev => prev.filter(s => s.id !== serverId))
  }, [])

  // ── Quick Connect: парсимо [user@]host[:port] і одразу підключаємось ──
  const handleQuickConnect = useCallback((raw: string) => {
    const s = raw.trim()
    if (!s) return
    // Формати: host | user@host | host:port | user@host:port
    let username = 'root'
    let host = s
    let port = 22
    // витягуємо user@
    if (s.includes('@')) {
      const [u, rest] = s.split('@')
      username = u || 'root'
      host = rest
    }
    // витягуємо :port
    const lastColon = host.lastIndexOf(':')
    if (lastColon !== -1 && !host.includes('[')) {
      const maybePort = parseInt(host.slice(lastColon + 1), 10)
      if (!isNaN(maybePort) && maybePort > 0 && maybePort < 65536) {
        port = maybePort
        host = host.slice(0, lastColon)
      }
    }
    if (!host) return
    const server: Server = {
      id: `quick-${Date.now()}`,
      name: `${username}@${host}`,
      host,
      port,
      username,
      color: '#888',
    }
    setQuickConnectOpen(false)
    setQuickConnectVal('')
    connectServer(server)
  }, [connectServer])

  const openFileInEditor = useCallback(async (remotePath: string, sessionId: string) => {
    // Already open? Just switch to it
    if (editorFiles.some(f => f.remotePath === remotePath)) {
      setActiveEditorPath(remotePath)
      return
    }
    try {
      // sftpReadFile returns string directly
      const content = await nt?.sftpReadFile(sessionId, remotePath) ?? ''
      setEditorFiles(prev => [...prev, { remotePath, content, sessionId, modified: false }])
      setActiveEditorPath(remotePath)
      setEditorSaveError('')
    } catch (e: unknown) {
      showToast(`Cannot open: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }, [editorFiles, showToast])

  const closeEditorFile = useCallback(async (remotePath: string) => {
    const file = editorFiles.find(f => f.remotePath === remotePath)
    if (file?.modified) {
      const ok = await showConfirm('Unsaved changes will be lost. Close anyway?')
      if (!ok) return
    }
    setEditorFiles(prev => {
      const next = prev.filter(f => f.remotePath !== remotePath)
      if (activeEditorPath === remotePath) {
        setActiveEditorPath(next[next.length - 1]?.remotePath || null)
      }
      setEditorSaveError('')
      return next
    })
  }, [editorFiles, activeEditorPath, showConfirm])

  const closeTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.status === 'connected') {
      const ok = await showConfirm(`Close connection to "${tab.server.name}"?`)
      if (!ok) return
    }
    // Скасовуємо авторекон-таймер і скидаємо лічильник
    const timer = reconnectTimersRef.current.get(tabId)
    if (timer) { clearTimeout(timer); reconnectTimersRef.current.delete(tabId) }
    reconnectAttemptsRef.current.delete(tabId)

    // Позначаємо як навмисний disconnect (щоб глобальний onSshClose не тригерив авторекон)
    if (tab?.sessionId) intentionalDisconnectRef.current.add(tab.sessionId)
    if (tab?.sessionId) await nt?.sshDisconnect(tab.sessionId)

    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (activeTab === tabId) setActiveTab(next[next.length - 1]?.id || null)
      return next
    })
  }, [tabs, activeTab])

  const reconnectTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    tab.terminal?.write('\r\n\x1b[33m↻ Reconnecting to ' + tab.server.host + '...\x1b[0m\r\n')
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, status: 'connecting' as const, sessionId: null } : t))

    const hintTimer = setTimeout(() => {
      setTabs(prev => prev.map(t => {
        if (t.id === tabId && t.status === 'connecting' && t.terminal) {
          t.terminal.write('\r\n\x1b[33m⏳ Still connecting...\x1b[0m\r\n')
        }
        return t
      }))
    }, 5000)

    try {
      // Vault fallback for reconnect
      let reconnPassword = tab.server.password
      let reconnPassphrase = tab.server.passphrase
      if (!tab.server.useAgent && !tab.server.privateKeyPath && !reconnPassword) {
        reconnPassword = (await nt?.vaultLoad(tab.server.id, 'password').catch(() => null)) ?? undefined
      }
      if (tab.server.privateKeyPath && !reconnPassphrase) {
        reconnPassphrase = (await nt?.vaultLoad(tab.server.id, 'passphrase').catch(() => null)) ?? undefined
      }

      const result = await nt?.sshConnect({
        host: tab.server.host,
        port: tab.server.port,
        username: tab.server.username,
        password: reconnPassword,
        privateKeyPath: tab.server.privateKeyPath,
        passphrase: reconnPassphrase,
        useAgent: tab.server.useAgent,
        jumpHost: tab.server.jumpHost,
      })
      clearTimeout(hintTimer)
      // Успіх — скидаємо лічильник авторекону
      reconnectAttemptsRef.current.delete(tabId)
      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, sessionId: result.sessionId, status: 'connected', connectedAt: Date.now() } : t
      ))
    } catch (err) {
      clearTimeout(hintTimer)
      const errMsg = typeof err === 'string' ? err : ((err as any)?.message || 'Connection failed')
      const attempt = reconnectAttemptsRef.current.get(tabId) ?? 0
      const maxAttempts = 5
      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          if (attempt < maxAttempts) {
            // Авторекон ще має спроби — плануємо наступну
            const delay = Math.min(2000 * Math.pow(2, attempt), 30000)
            const delaySec = Math.round(delay / 1000)
            t.terminal?.write(`\r\n\x1b[31m✗ Reconnect failed: ${errMsg}\x1b[0m\r\n`)
            t.terminal?.write(`\x1b[33m⟳ Retry in ${delaySec}s (attempt ${attempt + 1}/${maxAttempts})...\x1b[0m\r\n`)
            reconnectAttemptsRef.current.set(tabId, attempt + 1)
            const timer = setTimeout(() => {
              reconnectTimersRef.current.delete(tabId)
              reconnectTabImperativeRef.current?.(tabId)
            }, delay)
            reconnectTimersRef.current.set(tabId, timer)
            return { ...t, status: 'disconnected' as const }
          } else {
            reconnectAttemptsRef.current.delete(tabId)
            t.terminal?.write(`\r\n\x1b[31m✗ Reconnect failed: ${errMsg}\x1b[0m\r\n`)
            t.terminal?.write('\x1b[31m✗ Auto-reconnect gave up. Press ↻ to retry manually.\x1b[0m\r\n')
            return { ...t, status: 'error' as const }
          }
        }
        return t
      }))
    }
  }, [tabs])

  // Keep imperative ref in sync so auto-reconnect timer can call it
  useEffect(() => { reconnectTabImperativeRef.current = reconnectTab }, [reconnectTab])

  // Drag & drop tab reordering
  const handleTabDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragTabId(id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleTabDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragTabId && dragTabId !== id) {
      setTabs(prev => {
        const from = prev.findIndex(t => t.id === dragTabId)
        const to = prev.findIndex(t => t.id === id)
        if (from === -1 || to === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }
  }, [dragTabId])

  const handleTabDragEnd = useCallback(() => setDragTabId(null), [])

  const insertSnippet = useCallback((cmd: string) => {
    const tab = tabs.find(t => t.id === activeTab)
    if (tab?.sessionId) nt?.sshSendInput(tab.sessionId, cmd)
  }, [tabs, activeTab])

  const runSnippet = useCallback((cmd: string) => {
    const tab = tabs.find(t => t.id === activeTab)
    if (tab?.sessionId) nt?.sshSendInput(tab.sessionId, cmd + '\n')
  }, [tabs, activeTab])

  return (
    <LangContext.Provider value={langState}>
      <div className="app">
      {/* Title bar */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-drag" data-tauri-drag-region />
        <span className="titlebar-title" data-tauri-drag-region>SENU</span>
        <div className="titlebar-drag" data-tauri-drag-region />
        <button className="titlebar-help" onClick={() => setShowShortcuts(true)} title={t('keyboardShortcuts')}>?</button>
        <div className="window-controls">
          <button className="wc-btn wc-minimize" onClick={() => nt?.windowMinimize()} title={t('minimize')}>
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button className="wc-btn wc-maximize" onClick={() => nt?.windowMaximize()} title={t('maximize')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
          </button>
          <button className="wc-btn wc-close" onClick={() => nt?.windowClose()} title={t('close')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Update bar */}
      <UpdateBar
        state={updateState}
        onDownload={() => nt?.downloadUpdate()}
        onInstall={() => nt?.installUpdate()}
        onDismiss={() => setUpdateState({ status: 'idle' })}
      />

      {/* Tab bar */}
      <div className="tabbar">
        <div className="tabs">
          {(filterGroupId ? tabs.filter(t => t.groupId === filterGroupId) : tabs)
            .filter(t => !t.groupId || !collapsedGroups.has(t.groupId))
            .map(tab => {
            const grp = tab.groupId ? groups.find(g => g.id === tab.groupId) : null
            // In split mode: show which pane this tab is in (1-indexed)
            const paneIdx = splitLayout !== '1' ? paneSlots.indexOf(tab.id) : -1
            const isFocusedPane = paneIdx !== -1 && paneIdx === activePaneIdx
            return (
              <div
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''} status-${tab.status} ${dragTabId === tab.id ? 'tab-dragging' : ''} ${isFocusedPane ? 'tab-pane-focused' : ''}`}
                style={grp ? { '--tab-group-color': grp.color } as React.CSSProperties : undefined}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (splitLayout !== '1') {
                    if (paneIdx !== -1) {
                      // Tab already shown in a pane → just focus that pane
                      setActivePaneIdx(paneIdx)
                    } else {
                      // Tab not in any pane → put it in the currently active pane
                      setPaneSlots(prev => {
                        const next = [...prev]
                        next[activePaneIdx] = tab.id
                        return next
                      })
                    }
                  }
                }}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }) }}
                draggable
                onDragStart={e => handleTabDragStart(e, tab.id)}
                onDragOver={e => handleTabDragOver(e, tab.id)}
                onDragEnd={handleTabDragEnd}
              >
                {grp && <span className="tab-group-bar" style={{ background: grp.color }} />}
                {tab.status === 'connecting' ? (
                  <span className="tab-spinner" />
                ) : (
                  <span className="tab-dot" style={{ background: tab.server.color || '#00d4aa' }} />
                )}
                <span className="tab-name">{tab.server.name}</span>
                {/* Pane number badge in split mode */}
                {paneIdx !== -1 && (
                  <span className="tab-pane-badge" title={`Pane ${paneIdx + 1}`}>{paneIdx + 1}</span>
                )}
                {(tab.status === 'error' || tab.status === 'disconnected') && (
                  <button className="tab-reconnect" title={t('reconnect')} onClick={e => { e.stopPropagation(); reconnectTab(tab.id) }}>↻</button>
                )}
                <button className="tab-close" onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>✕</button>
              </div>
            )
          })}
        </div>

        <div className="tabbar-actions">
          <button className="tabbar-btn" onClick={() => setShowAddServer(true)} title={t('newConnection')}>{Ico.plus(13)}</button>
          {/* Quick Connect */}
          {quickConnectOpen ? (
            <input
              className="quick-connect-input"
              autoFocus
              placeholder={t('quickConnectPlaceholder')}
              value={quickConnectVal}
              onChange={e => setQuickConnectVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleQuickConnect(quickConnectVal)
                if (e.key === 'Escape') { setQuickConnectOpen(false); setQuickConnectVal('') }
              }}
              onBlur={() => { if (!quickConnectVal) setQuickConnectOpen(false) }}
            />
          ) : (
            <button className="tabbar-btn" onClick={() => setQuickConnectOpen(true)} title={t('quickConnectTitle')}>
              ⚡
            </button>
          )}
          <button
            className="tabbar-btn"
            onClick={() => setShowPalette(v => !v)}
            title={t('commandPaletteTitle')}
            style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', padding: '4px 7px', letterSpacing: '0.05em' }}
          >⌘K</button>

          {/* Group filter buttons */}
          {groups.length > 0 && (
            <div className="group-filters">
              {filterGroupId && (
                <button
                  className="tabbar-btn group-filter-clear"
                  title={t('showAllTabs')}
                  onClick={() => setFilterGroupId(null)}
                >
                  {Ico.filter(12)} All
                </button>
              )}
              {groups.map(g => {
                const tabCount = tabs.filter(t => t.groupId === g.id).length
                const isCollapsed = collapsedGroups.has(g.id)
                return (
                  <span key={g.id} className="group-filter-wrap">
                    <button
                      className={`tabbar-btn group-filter-btn ${filterGroupId === g.id ? 'active' : ''}`}
                      title={`Filter: ${g.name} (${tabCount} tabs)`}
                      onClick={() => setFilterGroupId(prev => prev === g.id ? null : g.id)}
                    >
                      <span className="group-filter-dot" style={{ background: g.color }} />
                      <span className="group-filter-name">{g.name}</span>
                      {tabCount > 0 && <span className="group-filter-count">{tabCount}</span>}
                    </button>
                    <button
                      className={`tabbar-btn group-collapse-btn ${isCollapsed ? 'active' : ''}`}
                      title={isCollapsed ? `Expand group "${g.name}"` : `Collapse group "${g.name}"`}
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(g.id)) next.delete(g.id)
                        else next.add(g.id)
                        return next
                      })}
                    >
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Layout picker */}
          <div className="layout-picker-wrap" style={{ position: 'relative' }}>
            <button
              className={`tabbar-btn layout-btn ${splitLayout !== '1' ? 'active' : ''}`}
              title={t('splitLayout')}
              onClick={() => setShowLayoutPicker(v => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d={LAYOUT_ICONS[splitLayout]} />
              </svg>
            </button>
            {showLayoutPicker && (
              <div className="layout-picker" onMouseLeave={() => setShowLayoutPicker(false)}>
                {(['1', '2h', '2v', '4', '6', '8'] as SplitLayout[]).map(l => (
                  <button
                    key={l}
                    className={`layout-option ${splitLayout === l ? 'active' : ''}`}
                    title={{ '1': t('layoutSingle'), '2h': t('layout2col'), '2v': t('layout2row'), '4': t('layout2x2'), '6': t('layout3x2'), '8': t('layout4x2') }[l]}
                    onClick={() => changeSplitLayout(l, tabs, activeTab, paneSlots)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d={LAYOUT_ICONS[l]} />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lock/unlock splitter — only shown in split mode */}
          {splitLayout !== '1' && (
            <button
              className={`tabbar-btn ${splitLocked ? 'active' : ''}`}
              title={splitLocked ? t('unlockSplitter') : t('lockSplitter')}
              onClick={() => setSplitLocked(v => !v)}
            >
              {splitLocked ? Ico.lock(13) : Ico.unlock(13)}
            </button>
          )}

          <button className={`tabbar-btn ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(v => !v)} title={t('toggleNotes')}>{Ico.notes(13)}</button>
        </div>
      </div>

      {/* Main area */}
      <div className="main">
        {/* Activity bar */}
        <div className="activity-bar">
          {(['servers', 'sftp', 'snippets'] as const).map((panel) => {
            const isActive = activePanel === panel && !sideCollapsed
            const handleClick = () => {
              if (sideCollapsed) {
                setActivePanel(panel)
                setSideCollapsed(false)
              } else if (activePanel === panel) {
                setSideCollapsed(true)  // same icon → collapse
              } else {
                setActivePanel(panel)   // different icon → switch
              }
            }
            return (
              <button
                key={panel}
                className={`activity-btn ${isActive ? 'active' : ''}`}
                title={panel === 'servers' ? t('servers') : panel === 'sftp' ? t('sftpBrowser') : t('commandSnippets')}
                onClick={handleClick}
              >
                {panel === 'servers' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="5" rx="1"/>
                    <circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="6" cy="12.5" r="1" fill="currentColor" stroke="none"/><circle cx="6" cy="19.5" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                )}
                {panel === 'sftp' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  </svg>
                )}
                {panel === 'snippets' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        {/* Side panel — collapses to zero width when sideCollapsed */}
        <div className={`side-panel${sideCollapsed ? ' side-panel--collapsed' : ''}`}>
          {activePanel === 'servers' && (
            <>
              <div className="panel-title">{t('servers')}</div>
              {servers.map(server => (
                <div key={server.id} className="server-item" onClick={() => connectServer(server)}>
                  <span className="server-dot" style={{ background: server.color || '#00d4aa' }} />
                  <div className="server-info">
                    <span className="server-name">{server.name}</span>
                    <span className="server-host">{server.username}@{server.host}</span>
                  </div>
                  <div className="server-actions">
                    <button className="server-action-btn" title={t('edit')}
                      onClick={e => { e.stopPropagation(); setEditingServer(server) }}>{Ico.pencil(13)}</button>
                    <button className="server-action-btn server-action-del" title={t('delete')}
                      onClick={e => { e.stopPropagation(); deleteServer(server.id) }}>{Ico.trash(13)}</button>
                  </div>
                </div>
              ))}
              {servers.length === 0 && (
                <div className="sidebar-empty">{t('noServers').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}</div>
              )}
              <button className="sidebar-add" onClick={() => setShowAddServer(true)}>{t('addServer')}</button>
            </>
          )}
          {/* Always mounted — CSS hides it to preserve path state */}
          <div style={{ display: activePanel === 'sftp' ? 'contents' : 'none' }}>
            <SftpBrowser
              sessionId={activeTabData?.sessionId || null}
              onOpenFile={openFileInEditor}
            />
          </div>
          {/* Snippets — always mounted to preserve search/tab state */}
          <div style={{ display: activePanel === 'snippets' ? 'contents' : 'none' }}>
            <SnippetsPanel onInsert={insertSnippet} onRun={runSnippet} />
          </div>
        </div>

        {/* Terminal area */}
        <div className="terminal-area" ref={termAreaRef} style={{ position: 'relative' }}>
          {/* Single mode — classic layout */}
          {splitLayout === '1' && (
            <>
              {tabs.length === 0 && (
                <div className="empty-state">
                  <div className="empty-hero">
                    <div className="empty-logo">{Ico.crystal()}</div>
                    <div className="empty-title">SENU</div>
                    <div className="empty-sub">{t('appTagline')}</div>
                  </div>
                  {servers.length > 0 && (
                    <div className="empty-servers-section">
                      <div className="empty-section-label">{t('quickConnect')}</div>
                      <div className="empty-server-grid">
                        {servers.slice(0, 6).map(s => (
                          <div key={s.id} className="empty-server-card" onClick={() => connectServer(s)}>
                            <span className="empty-server-dot" style={{ background: s.color || '#00d4aa' }} />
                            <div className="empty-server-info">
                              <div className="empty-server-name">{s.name}</div>
                              <div className="empty-server-host">{s.username}@{s.host}</div>
                            </div>
                            <span className="empty-server-arrow">→</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="btn-primary" onClick={() => setShowAddServer(true)}>
                    {t('newConnectionBtn')}
                  </button>
                </div>
              )}
              {tabs.map(tab => (
                <TerminalPane key={tab.id} tab={tab} active={tab.id === activeTab} onReconnect={() => reconnectTab(tab.id)} />
              ))}
            </>
          )}

          {/* Split mode — panes positioned absolutely */}
          {splitLayout !== '1' && (() => {
            const rects = getPaneRects(splitLayout, splitColRatios, splitRowRatio)
            const { rows } = LAYOUT_CONFIG[splitLayout]
            return (
              <>
                {/* Pane slots */}
                {paneSlots.map((tabId, slotIdx) => {
                  const tab = tabs.find(t => t.id === tabId)
                  const paneGroup = tab?.groupId ? groups.find(g => g.id === tab.groupId) : null
                  const r = rects[slotIdx]
                  const isFocused = slotIdx === activePaneIdx
                  return (
                    <div
                      key={slotIdx}
                      className={`split-pane${isFocused ? ' split-pane--focused' : ''}`}
                      style={{ position: 'absolute', top: `${r.top}%`, left: `${r.left}%`, width: `${r.width}%`, height: `${r.height}%` }}
                      onClick={() => { setActivePaneIdx(slotIdx); if (tabId) setActiveTab(tabId) }}
                    >
                      {paneGroup && (
                        <div className="pane-group-bar" style={{ background: paneGroup.color }} title={`Group: ${paneGroup.name}`} />
                      )}
                      {tab ? (
                        <TerminalPane key={tab.id} tab={tab} active={isFocused} onReconnect={() => reconnectTab(tab.id)} inSplit />
                      ) : (
                        <div className="pane-empty">
                          <div className="pane-empty-label">{`${t('pane')} ${slotIdx + 1}`}</div>
                          <div className="pane-empty-hint">{t('clickToConnect')}</div>
                          <button className="pane-empty-btn" onClick={e => { e.stopPropagation(); setActivePaneIdx(slotIdx); setShowAddServer(true) }}>{t('connectBtn')}</button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Column splitters */}
                {splitColRatios.map((ratio, i) => (
                  <div
                    key={`cs-${i}`}
                    className={`splitter splitter--col${splitLocked ? ' splitter--locked' : ''}`}
                    style={{ position: 'absolute', top: 0, left: `${ratio}%`, height: '100%' }}
                    onMouseDown={startColDrag(i)}
                  />
                ))}

                {/* Row splitter (only for 2v, 4, 6, 8) */}
                {rows > 1 && (
                  <div
                    className={`splitter splitter--row${splitLocked ? ' splitter--locked' : ''}`}
                    style={{ position: 'absolute', left: 0, top: `${splitRowRatio}%`, width: '100%' }}
                    onMouseDown={startRowDrag}
                  />
                )}
              </>
            )
          })()}

          {/* Monaco editor overlay — multi-tab */}

          {editorFiles.length > 0 && (
            <div className="editor-overlay">
              {/* Tab bar */}
              <div className="editor-tabs-bar">
                <div className="editor-tabs-list">
                  {editorFiles.map(f => {
                    const name = f.remotePath.split('/').pop() || f.remotePath
                    const isActive = f.remotePath === activeEditorPath
                    return (
                      <div
                        key={f.remotePath}
                        className={`editor-tab ${isActive ? 'active' : ''}`}
                        title={f.remotePath}
                        onClick={() => setActiveEditorPath(f.remotePath)}
                      >
                        {f.modified && <span className="editor-tab-dot">●</span>}
                        <span className="editor-tab-name">{name}</span>
                        <button
                          className="editor-tab-close"
                          onClick={e => { e.stopPropagation(); closeEditorFile(f.remotePath) }}
                        >✕</button>
                      </div>
                    )
                  })}
                </div>
                <div className="editor-tabs-actions">
                  {editorSaveError && (
                    <span className="editor-save-error" title={editorSaveError}>⚠ {editorSaveError}</span>
                  )}
                  <button className="btn-primary btn-sm" onClick={() => saveEditorFileRef.current()}>
                    Save <span style={{ opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
                  </button>
                </div>
              </div>
              {/* Active file path */}
              {editorFile && (
                <div className="editor-path-bar">
                  <span className="editor-path">{editorFile.remotePath}</span>
                </div>
              )}
              {/* Monaco */}
              {editorFile && (
                <Editor
                  key={activeEditorPath}
                  height="calc(100% - 72px)"
                  language={detectLanguage(editorFile.remotePath)}
                  value={editorFile.content}
                  theme="vs-dark"
                  onChange={(val) => setEditorFiles(prev => prev.map(f =>
                    f.remotePath === activeEditorPath ? { ...f, content: val || '', modified: true } : f
                  ))}
                  options={{ fontSize: 14, fontFamily: '"JetBrains Mono", monospace', minimap: { enabled: false } }}
                  onMount={(editor, monaco) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveEditorFileRef.current())
                  }}
                />
              )}
            </div>
          )}

        </div>

        {/* Notes panel */}
        <NotesPanel serverId={activeTabData?.server.id || null} visible={showNotes} />
      </div>

      {/* Status bar — direct child of .app flex column */}
      <StatusBar tab={activeTabData} />

      {showAddServer && (
        <ServerModal onSave={saveServer} onClose={() => setShowAddServer(false)} />
      )}
      {editingServer && (
        <ServerModal existing={editingServer} onSave={saveServer} onClose={() => setEditingServer(null)} />
      )}
      {confirmDialog && (
        <ConfirmModal
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {hostKeyPrompt && (
        <HostKeyModal
          host={hostKeyPrompt.host}
          port={hostKeyPrompt.port}
          fingerprint={hostKeyPrompt.fingerprint}
          keyType={hostKeyPrompt.keyType}
          reason={hostKeyPrompt.reason}
          onAccept={(remember) => {
            nt?.sshVerifyHostKey({
              sessionId: hostKeyPrompt.sessionId,
              accepted: true,
              remember,
            }).catch(console.error)
            setHostKeyPrompt(null)
          }}
          onReject={() => {
            nt?.sshVerifyHostKey({
              sessionId: hostKeyPrompt.sessionId,
              accepted: false,
              remember: false,
            }).catch(console.error)
            setHostKeyPrompt(null)
          }}
        />
      )}

      {/* Command palette */}
      {showPalette && (
        <CommandPalette
          servers={servers}
          groups={groups}
          tabs={tabs}
          activeTab={activeTab}
          onClose={() => setShowPalette(false)}
          onConnect={connectServer}
          onChangeSplitLayout={(l) => changeSplitLayout(l, tabs, activeTab, paneSlots)}
          onToggleNotes={() => setShowNotes(v => !v)}
          onToggleSide={() => setSideCollapsed(v => !v)}
        />
      )}

      {/* Tab context menu */}
      {contextMenu && (
        <>
          <div className="ctx-backdrop" onClick={() => setContextMenu(null)} />
          <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="ctx-section">Groups</div>
            {groups.map(g => (
              <button
                key={g.id}
                className={`ctx-item ${tabs.find(t => t.id === contextMenu.tabId)?.groupId === g.id ? 'ctx-item--active' : ''}`}
                onClick={() => assignTabToGroup(contextMenu.tabId, tabs.find(t => t.id === contextMenu.tabId)?.groupId === g.id ? null : g.id)}
              >
                <span className="ctx-dot" style={{ background: g.color }} />
                {g.name}
              </button>
            ))}
            <button className="ctx-item" onClick={() => { setShowGroupModal({ tabId: contextMenu.tabId }); setContextMenu(null) }}>
              {Ico.plus(12)} New group…
            </button>
            {tabs.find(t => t.id === contextMenu.tabId)?.groupId && (
              <button className="ctx-item ctx-item--danger" onClick={() => assignTabToGroup(contextMenu.tabId, null)}>
                Remove from group
              </button>
            )}
            <div className="ctx-divider" />
            <button className="ctx-item ctx-item--danger" onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null) }}>
              Close tab
            </button>
          </div>
        </>
      )}

      {/* Group creation modal */}
      {showGroupModal && (
        <GroupModal
          onSave={(name, color) => createGroup(name, color, showGroupModal.tabId)}
          onClose={() => setShowGroupModal(null)}
        />
      )}
      </div>
    </LangContext.Provider>
  )
}