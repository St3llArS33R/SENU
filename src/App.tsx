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

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import SftpEditor from './components/SftpEditor'
import '@xterm/xterm/css/xterm.css'
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './App.css'
import { LogViewerPanel } from './logs/LogViewerPanel'
import { AchievementsProvider, AchievementsPanel, useAchievements } from './Achievements'
import SnippetsPanel, { SnipDocView } from './snippets/SnippetsPanel'
import type { SnipDocState } from './snippets/SnippetsPanel'
import { NoteEditor } from './notes/NoteEditor'
import { ContextMenu } from './components/ContextMenu'
import { foldersStore } from './stores/foldersStore'
import { DocsPage } from './notes/DocsPage'
import { ChatPanel, ChatThreadView } from './chat/ChatPanel'
import type { ChatThreadState } from './chat/ChatPanel'
import { getErrorMessage } from './utils'
import type { Server } from './types'
export type { Server, JumpHost } from './types'
import { HomeScreen, markServerConnected } from './HomeScreen'
import { ImportSSHModal } from './ImportSSHModal'
import { Ico } from './icons'
import { ServerModal } from './ServerModal'
import { NotesPanel } from './NotesPanel'
import { TunnelsPopover } from './TunnelsPopover'
import { CommandHistoryOverlay } from './CommandHistoryOverlay'
import { addCommand as addCmdHistory } from './commandHistory'
import type { Note } from './types'

// Must be imported before reading window.nextterm below — this ensures bridge.ts
// evaluates (and sets window.nextterm = bridge) before the module-level const nt.
import './bridge'
import { LangContext, useLangState, useLanguage } from './i18n'
import { ThemeContext, useThemeState, useTheme, THEMES, THEME_GROUPS, getXtermTheme } from './themes'

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
  label?: string  // user-defined display name (overrides server.name)
}

interface EditorFile {
  remotePath: string
  content: string
  sessionId: string
  modified: boolean
}

interface TabEditorState {
  files: EditorFile[]
  activePath: string | null
  saveError: string
  minimized: boolean
}
const DEFAULT_EDITOR_STATE: TabEditorState = {
  files: [], activePath: null, saveError: '', minimized: false,
}

interface PortForward {
  id: string
  sessionId: string
  localPort: number
  remoteHost: string
  remotePort: number
}

type SettingsSection = 'themes' | 'language' | 'docs'

// SnippetsPanel and built-in data moved to ./snippets/

const nt = window.nextterm

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
function ConfirmModal({ message, onConfirm, onCancel, danger }: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean
}) {
  const { t, lang } = useLanguage()
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className={`modal confirm-modal${danger ? ' confirm-modal--danger' : ''}`} onClick={e => e.stopPropagation()}>
        {danger && (
          <div className="confirm-danger-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>{lang === 'uk' ? 'Небезпечна дія' : lang === 'de' ? 'Gefährliche Aktion' : 'Dangerous action'}</span>
          </div>
        )}
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>{t('cancel')}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {danger
              ? (lang === 'uk' ? 'Відключити' : lang === 'de' ? 'Trennen' : 'Disconnect')
              : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Language detection for Monaco ---
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

// --- Panic Overlay (Boss Key) ---
type PanicTheme = 'minimal' | 'matrix' | 'starfield' | 'glitch'
const PANIC_THEMES: PanicTheme[] = ['minimal', 'matrix', 'starfield', 'glitch']

// Canvas: Matrix rain
function MatrixCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width  = window.innerWidth
    const H = canvas.height = window.innerHeight
    const cols = Math.floor(W / 18)
    const drops = Array.from({ length: cols }, () => Math.random() * -H)
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF'
    let raf: number
    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fillRect(0, 0, W, H)
      ctx.font = '15px monospace'
      drops.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)]
        const bright = y < 30
        ctx.fillStyle = bright ? '#ccffcc' : `rgba(0,${Math.floor(180 + Math.random()*75)},${Math.floor(Math.random()*40)},0.9)`
        ctx.fillText(ch, i * 18, y)
        drops[i] += 18 + Math.random() * 6
        if (drops[i] > H + 20) drops[i] = -Math.random() * H * 0.5
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="panic-canvas" />
}

// Canvas: Starfield warp
function StarfieldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const W = canvas.width, H = canvas.height
    const CX = W / 2, CY = H / 2
    const stars = Array.from({ length: 220 }, () => ({
      x: (Math.random() - 0.5) * W,
      y: (Math.random() - 0.5) * H,
      z: Math.random() * W,
    }))
    let raf: number
    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(0, 0, W, H)
      stars.forEach(s => {
        s.z -= 6
        if (s.z <= 0) { s.x = (Math.random() - 0.5) * W; s.y = (Math.random() - 0.5) * H; s.z = W }
        const sx = (s.x / s.z) * W + CX
        const sy = (s.y / s.z) * H + CY
        const r  = Math.max(0.3, (1 - s.z / W) * 3)
        const bright = Math.floor((1 - s.z / W) * 255)
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${bright},${bright},${Math.floor(bright*0.85+40)},0.9)`
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="panic-canvas" />
}

// Canvas: TV Static / Glitch
function GlitchCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const W = canvas.width, H = canvas.height
    let raf: number
    const draw = () => {
      const img = ctx.createImageData(W, H)
      const d   = img.data
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() < 0.92 ? Math.floor(Math.random() * 28) : Math.floor(Math.random() * 160)
        d[i]   = v
        d[i+1] = Math.random() < 0.004 ? Math.floor(Math.random()*200) : v
        d[i+2] = Math.random() < 0.003 ? Math.floor(Math.random()*200) : v
        d[i+3] = 255
      }
      // Horizontal glitch bands
      if (Math.random() < 0.08) {
        const y0 = Math.floor(Math.random() * H)
        const bh = Math.floor(Math.random() * 12) + 2
        for (let y = y0; y < Math.min(y0 + bh, H); y++) {
          const shift = (Math.floor(Math.random() * 40) - 20) * 4
          for (let x = 0; x < W; x++) {
            const src = (y * W + Math.max(0, Math.min(W - 1, x + shift / 4))) * 4
            const dst = (y * W + x) * 4
            d[dst]   = d[src] + 80
            d[dst+1] = Math.floor(d[src] * 0.3)
            d[dst+2] = d[src] + 40
            d[dst+3] = 255
          }
        }
      }
      ctx.putImageData(img, 0, 0)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="panic-canvas" />
}

function PanicOverlay({ onExit }: { onExit: () => void }) {
  const [time, setTime]   = useState(() => new Date())
  const [theme, setTheme] = useState<PanicTheme>(() => PANIC_THEMES[Math.floor(Math.random() * PANIC_THEMES.length)])

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); onExit() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onExit])

  const hh = time.getHours().toString().padStart(2, '0')
  const mm = time.getMinutes().toString().padStart(2, '0')
  const ss = time.getSeconds().toString().padStart(2, '0')

  const clockColor: Record<PanicTheme, string> = {
    minimal:  'rgba(255,255,255,0.75)',
    matrix:   'rgba(0,255,80,0.90)',
    starfield:'rgba(200,220,255,0.85)',
    glitch:   'rgba(255,255,255,0.80)',
  }

  return (
    <div className="panic-overlay" onClick={onExit}>
      {theme === 'matrix'    && <MatrixCanvas />}
      {theme === 'starfield' && <StarfieldCanvas />}
      {theme === 'glitch'    && <GlitchCanvas />}

      {/* Clock — center */}
      <div className="panic-content">
        <svg className="panic-lock-icon" width="44" height="44" viewBox="0 0 24 24" fill="none"
          stroke={clockColor[theme]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="panic-clock" style={{ color: clockColor[theme] }}>{hh}:{mm}:{ss}</div>
        <div className="panic-date">{time.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="panic-hint">Press <kbd>Ctrl+Shift+H</kbd> to unlock</div>
      </div>

      {/* Theme dots — bottom center */}
      <div className="panic-themes" onClick={e => e.stopPropagation()}>
        {PANIC_THEMES.map(t => (
          <button
            key={t}
            className={`panic-theme-dot${theme === t ? ' active' : ''}`}
            onClick={() => setTheme(t)}
            title={t}
          />
        ))}
      </div>
    </div>
  )
}

// --- SSH Config Import Modal ---
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

// --- Theme Picker ---
function ThemePicker() {
  const { lang, t } = useLanguage()
  const { themeId, setThemeId } = useTheme()
  const achCtx = useAchievements()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = THEMES.find(th => th.id === themeId) ?? THEMES[0]

  return (
    <div className="theme-picker-wrap" ref={wrapRef}>
      <button
        className="status-theme-btn"
        onClick={() => setOpen(v => !v)}
        title={t('changeTheme')}
      >
        {Ico.palette()}
        <span style={{ fontSize: 10, fontFamily: 'var(--font-ui)' }}>
          {lang === 'uk' ? current.nameUk : lang === 'de' ? (current.nameDe ?? current.name) : current.name}
        </span>
      </button>
      {open && (
        <div className="theme-picker-popup">
          {/* Quick picker shows only stable themes — beta themes live in
              Settings → Themes with a BETA badge. */}
          {THEME_GROUPS.map(group => {
            const groupThemes = THEMES.filter(th => th.group === group.id && th.stable)
            if (groupThemes.length === 0) return null
            return (
              <div key={group.id} className="theme-group">
                <div className="theme-group-label">{lang === 'uk' ? group.labelUk : lang === 'de' ? group.labelDe : group.label}</div>
                <div className="theme-group-items">
                  {groupThemes.map(th => (
                    <div
                      key={th.id}
                      className={`theme-item${themeId === th.id ? ' active' : ''}`}
                      onClick={() => { if (th.id !== themeId) achCtx?.trackEvent({ type: 'theme-changed', themeId: th.id }); setThemeId(th.id); setOpen(false) }}
                    >
                      <div className="theme-swatch">
                        <div className="theme-swatch-top" style={{ background: th.swatch[0] }} />
                        <div className="theme-swatch-bot" style={{ background: th.swatch[1] }} />
                      </div>
                      <span className="theme-item-name">{lang === 'uk' ? th.nameUk : lang === 'de' ? (th.nameDe ?? th.name) : th.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="theme-picker-hint">
            {lang === 'uk'
              ? 'Більше тем у Налаштуваннях →'
              : 'More themes in Settings →'}
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsView({ section }: { section: SettingsSection }) {
  const { lang, setLang, t } = useLanguage()
  const { themeId, setThemeId } = useTheme()
  const achCtx = useAchievements()

  return (
    <div className="settings-view">
      <div className="settings-view-header">
        <div className="settings-view-kicker">{t('settings')}</div>
        <h2>{section === 'language' ? t('interfaceLanguage') : t('themes')}</h2>
      </div>

      <div className="settings-grid">
        {section === 'language' ? (
          <section className="settings-card">
            <div className="settings-card-title">{t('interfaceLanguage')}</div>
            <div className="settings-pill-row">
              {/* German is wired in i18n.ts but hidden from the picker — translation
                  coverage isn't ready for public exposure. To re-enable, add
                  `{ id: 'de', label: 'Deutsch' }` back to this list. */}
              {([
                { id: 'en', label: 'English' },
                { id: 'uk', label: 'Українська' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  className={`settings-pill ${lang === item.id ? 'active' : ''}`}
                  onClick={() => { if (item.id !== lang) achCtx?.trackEvent({ type: 'language-changed', lang: item.id }); setLang(item.id) }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="settings-card settings-card--themes">
            <div className="settings-themes-grid">
              {THEMES.map((th) => {
                const x = th.xterm
                const isActive = themeId === th.id
                return (
                  <button
                    key={th.id}
                    className={`settings-theme-card ${isActive ? 'active' : ''}`}
                    onClick={() => { if (!isActive) achCtx?.trackEvent({ type: 'theme-changed', themeId: th.id }); setThemeId(th.id) }}
                  >
                    <div className="settings-theme-preview" style={{ background: x.background }}>
                      {/* Simulated terminal lines */}
                      <div className="stp-lines">
                        <div className="stp-line"><span style={{ color: x.green, width: '55%' }} /><span style={{ color: x.blue, width: '30%' }} /></div>
                        <div className="stp-line"><span style={{ color: x.cyan, width: '40%' }} /></div>
                        <div className="stp-line"><span style={{ color: x.magenta, width: '65%' }} /><span style={{ color: x.yellow, width: '15%' }} /></div>
                        <div className="stp-line"><span style={{ color: x.blue, width: '35%' }} /></div>
                      </div>
                      <div className="stp-prompt" style={{ color: x.foreground }}>
                        <span style={{ color: x.green }}>root</span>
                        <span style={{ color: x.foreground, opacity: 0.5 }}>@server</span>
                        <span style={{ color: x.foreground, opacity: 0.35 }}>:~$</span>
                        <span className="stp-cursor" style={{ background: x.cursor ?? x.foreground }} />
                      </div>
                      {isActive && <div className="stp-check">✓</div>}
                    </div>
                    <div className="settings-theme-name">
                      {lang === 'uk' ? th.nameUk : lang === 'de' ? (th.nameDe ?? th.name) : th.name}
                      {!th.stable && <span className="settings-theme-beta">BETA</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// --- Per-tab uptime label (mm:ss / h:mm:ss) ---
function TabUptime({ connectedAt, status }: { connectedAt?: number; status: string }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!connectedAt || status !== 'connected') { setLabel(''); return }
    const update = () => {
      const secs = Math.floor((Date.now() - connectedAt) / 1000)
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setLabel(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`)
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [connectedAt, status])
  if (!label) return null
  return <span className="tab-uptime" title="Час сесії">{label}</span>
}

// --- Status Bar ---
function StatusBar({
  tab, onPanic, hasUnreadChat, chatPanelOpen, onOpenChat,
}: {
  tab: Tab | null
  onPanic: () => void
  hasUnreadChat: boolean
  /** True when the chat side-panel is currently visible (icon shows "active" state). */
  chatPanelOpen: boolean
  /** Toggle chat panel open/closed. When closed, opening it; when open, collapsing back to terminal. */
  onOpenChat: () => void
}) {
  const { t, lang, setLang } = useLanguage()
  const [uptime, setUptime] = useState('')
  const [ipVisible, setIpVisible] = useState(false)

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
          <span
            className="status-item status-dim status-host"
            style={{ fontFamily: '"JetBrains Mono", monospace', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setIpVisible(v => !v)}
            title={ipVisible ? t('hideConnection') : t('revealConnection')}
          >
            {tab.server.username}@{ipVisible ? `${tab.server.host}:${tab.server.port}` : '••••••••'}
          </span>
          {uptime && (
            <>
              <span className="status-sep">·</span>
              <span className="status-item status-dim">⏱ {uptime}</span>
            </>
          )}
          <div className="status-spacer" />
          {tab.status !== 'connected' && (
            <span className="status-item status-dim" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
              {statusLabel(tab.status)}
            </span>
          )}
        </>
      )}
      {/* Theme picker + Language toggle — always visible on the right */}
      <div className="status-spacer" />
      <ThemePicker />
      <button
        className="status-lang-btn"
        onClick={() => setLang(lang === 'en' ? 'uk' : 'en')}
        title={t('switchLanguage')}
      >
        {lang === 'en' ? 'EN' : lang === 'uk' ? 'UK' : 'DE'}
      </button>
      <button
        className={`status-chat-btn${hasUnreadChat ? ' status-chat-btn--unread' : ''}${chatPanelOpen ? ' on' : ''}`}
        onClick={onOpenChat}
        title={lang === 'uk'
          ? (hasUnreadChat ? 'Чат — є непрочитані' : 'Чат')
          : lang === 'de'
          ? (hasUnreadChat ? 'Chat — ungelesen' : 'Chat')
          : (hasUnreadChat ? 'Chat — unread' : 'Chat')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button
        className="status-panic-btn"
        onClick={onPanic}
        title={lang === 'uk' ? 'Boss Key — сховати термінал (Ctrl+Shift+H)' : lang === 'de' ? 'Boss Key — Terminal ausblenden (Ctrl+Shift+H)' : 'Boss Key — hide terminal (Ctrl+Shift+H)'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
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
function TerminalPane({ tab, active, onReconnect, inSplit, onInput, onOpenHistory }: { tab: Tab; active: boolean; onReconnect: () => void; inSplit?: boolean; onInput?: (data: string) => void; onOpenHistory?: (serverId: string, serverName: string) => void }) {
  const { t } = useLanguage()
  const { themeId } = useTheme()
  const outerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(tab.sessionId)
  const statusRef = useRef(tab.status)
  const onReconnectRef = useRef(onReconnect)
  const onInputRef = useRef(onInput)
  const onOpenHistoryRef = useRef(onOpenHistory)
  // Per-terminal buffer for command history capture. Accumulates printable chars
  // until Enter; cleared on escape sequences (arrow keys etc.).
  const cmdBufRef = useRef('')

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
  useEffect(() => { onInputRef.current = onInput }, [onInput])
  useEffect(() => { onOpenHistoryRef.current = onOpenHistory }, [onOpenHistory])
  useEffect(() => { showSearchRef.current = showSearch }, [showSearch])

  // ── Update xterm theme when app theme changes ────────────────────────────
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = getXtermTheme(themeId)
  }, [themeId])

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
        theme: getXtermTheme(themeId),
        cursorBlink: true,
        scrollback: 131072,   // 128K lines — SecureCRT standard
        convertEol: true,     // convert \n → \r\n (fixes Windows ConPTY output)
      })

      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)

      // ── OSC 52: remote → local clipboard sync ─────────────────────────────
      // Format: ESC ] 52 ; <selection> ; <base64 | ?> BEL
      // We handle writes only (selection 'c' or 'p' or 's'); reads are ignored
      // to prevent remote programs from exfiltrating the local clipboard.
      term.parser.registerOscHandler(52, (data: string) => {
        const semi = data.indexOf(';')
        if (semi < 0) return false
        const payload = data.slice(semi + 1)
        if (payload === '?' || payload === '') return true  // ignore reads
        try {
          const bin = atob(payload)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const text = new TextDecoder('utf-8').decode(bytes)
          if (text) navigator.clipboard.writeText(text).catch(() => {})
        } catch { /* malformed base64 — ignore */ }
        return true
      })

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
        // Capture typed commands into per-server history. Best-effort buffer
        // that echoes the user's input before SSH processes it. Escape sequences
        // (arrow keys, Ctrl-R etc.) abort the current buffer.
        for (let i = 0; i < data.length; i++) {
          const ch = data.charCodeAt(i)
          if (ch === 0x0d || ch === 0x0a) {
            const line = cmdBufRef.current.trim()
            cmdBufRef.current = ''
            if (line) addCmdHistory(tab.server.id, line)
          } else if (ch === 0x7f || ch === 0x08) {
            cmdBufRef.current = cmdBufRef.current.slice(0, -1)
          } else if (ch === 0x1b || ch === 0x03 || ch === 0x15) {
            // ESC, Ctrl+C, Ctrl+U — drop buffer
            cmdBufRef.current = ''
            // Skip remainder of CSI/OSC sequence
            if (ch === 0x1b) break
          } else if (ch >= 0x20 && ch < 0x7f) {
            cmdBufRef.current += data[i]
          }
        }
        if (onInputRef.current) {
          onInputRef.current(data)
        } else if (sessionIdRef.current) {
          nt?.sshSendInput(sessionIdRef.current, data)
        }
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
        // Ctrl+Shift+R — command history (local, cross-server fuzzy)
        if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
          e.preventDefault()
          onOpenHistoryRef.current?.(tab.server.id, tab.label || tab.server.name)
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
      // Menu is position:fixed — use viewport coords, clamped to window bounds
      const menuW = 210, menuH = 175
      const x = Math.min(e.clientX, window.innerWidth  - menuW - 8)
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
      setCtxMenu({ x, y })
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

      {/* Breadcrumb toolbar — shown only when connected */}
      {tab.status === 'connected' && (
        <div className="term-toolbar">
          <div className="term-breadcrumb">
            <span className="bc-server">{tab.server.name}</span>
            <span className="bc-sep">›</span>
            <span className="bc-path">{tab.server.username}@{tab.server.host}</span>
          </div>
          <div className="conn-badge">
            <span className="conn-pulse" />
            Connected
          </div>
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
            {t('copyText')}
            <span className="ctx-shortcut">Ctrl+Shift+C</span>
          </button>
          <button className="ctx-item" onClick={ctxPaste}>
            {t('pasteText')}
            <span className="ctx-shortcut">Ctrl+Shift+V</span>
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { setShowSearch(true); setCtxMenu(null) }}>
            {t('findInTerminal')}
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
            {logging ? t('stopLoggingMenu') : t('startLogging')}
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item ctx-item-danger" onClick={ctxClear}>
            {t('clearTerminal')}
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
  sessionId, onOpenFile, onCreateNoteFromFile,
}: {
  sessionId: string | null
  onOpenFile: (remotePath: string, sessionId: string) => void
  /** Right-click → "Create note" — file path is absolute on the remote host. */
  onCreateNoteFromFile?: (remotePath: string, fileName: string) => void
}) {
  const { t } = useLanguage()
  const [path, setPath] = useState('/')
  const [files, setFiles] = useState<{ name: string; isDir: boolean; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [pathInput, setPathInput] = useState('/')
  const [transferring, setTransferring] = useState<string | null>(null) // filename being transferred
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; name: string } | null>(null)

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
      {ctxMenu && (
        <ContextMenu
          open={true}
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: t('createNoteFromFile') || 'Create note',
              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
              onClick: () => onCreateNoteFromFile?.(ctxMenu.path, ctxMenu.name),
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {!loading && !error && (
        <div className="sftp-list">
          {files.length === 0 && <div className="sftp-status">{t('emptyDirectory')}</div>}
          {files.map(f => (
            <div
              key={f.name}
              className={`sftp-item ${f.isDir ? 'is-dir' : `is-file ${sftpFileClass(f.name)}`}`}
              onClick={() => navigate(f.name, f.isDir, f.path)}
              onContextMenu={e => {
                if (f.isDir || !onCreateNoteFromFile) return
                e.preventDefault()
                e.stopPropagation()
                setCtxMenu({ x: e.clientX, y: e.clientY, path: f.path, name: f.name })
              }}
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

// --- Port Forwarding Modal ---
function ForwardingModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { t } = useLanguage()
  const [forwards, setForwards] = useState<PortForward[]>([])
  const [localPort, setLocalPort] = useState('8080')
  const [remoteHost, setRemoteHost] = useState('localhost')
  const [remotePort, setRemotePort] = useState('80')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await nt?.sshForwardList(sessionId) ?? []
      setForwards(list.map((f: { id: string; local_port: number; remote_host: string; remote_port: number }) => ({
        id: f.id,
        sessionId,
        localPort: f.local_port,
        remoteHost: f.remote_host,
        remotePort: f.remote_port,
      })))
    } catch { /* ignore */ }
  }, [sessionId])

  useEffect(() => { reload() }, [reload])

  const handleAdd = async () => {
    setError(null)
    const lp = parseInt(localPort)
    const rp = parseInt(remotePort)
    if (!localPort || !remoteHost || !remotePort || isNaN(lp) || isNaN(rp)) {
      setError(t('forwardInvalidParams')); return
    }
    setAdding(true)
    try {
      await nt?.sshForwardAdd(sessionId, lp, remoteHost, rp)
      await reload()
      setLocalPort(''); setRemoteHost('localhost'); setRemotePort('')
    } catch (e) {
      setError(String(e))
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await nt?.sshForwardRemove(id)
      await reload()
    } catch { /* ignore */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
        <div className="modal-header">
          <span className="modal-title">{t('portForwarding')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="fwd-hint">{t('portForwardHint')}</div>

          {/* Active forwards */}
          {forwards.length > 0 && (
            <div className="fwd-list">
              {forwards.map(f => (
                <div key={f.id} className="fwd-row">
                  <div className="fwd-row-info">
                    <span className="fwd-badge">LOCAL</span>
                    <span className="fwd-addr">127.0.0.1:{f.localPort}</span>
                    <span className="fwd-arrow">→</span>
                    <span className="fwd-addr">{f.remoteHost}:{f.remotePort}</span>
                  </div>
                  <button className="fwd-remove-btn" onClick={() => handleRemove(f.id)} title={t('removeForward')}>✕</button>
                </div>
              ))}
            </div>
          )}
          {forwards.length === 0 && (
            <div className="fwd-empty">{t('noForwards')}</div>
          )}

          {/* Add forward form */}
          <div className="fwd-form">
            <div className="fwd-form-title">{t('addForward')}</div>
            <div className="fwd-form-row">
              <div className="fwd-field">
                <label className="fwd-label">{t('localPort')}</label>
                <input className="fwd-input" type="number" min="1" max="65535" placeholder="8080"
                  value={localPort} onChange={e => setLocalPort(e.target.value)} />
              </div>
              <span className="fwd-form-arrow">→</span>
              <div className="fwd-field" style={{ flex: 2 }}>
                <label className="fwd-label">{t('remoteHost')}</label>
                <input className="fwd-input" placeholder="localhost"
                  value={remoteHost} onChange={e => setRemoteHost(e.target.value)} />
              </div>
              <div className="fwd-field">
                <label className="fwd-label">{t('remotePort')}</label>
                <input className="fwd-input" type="number" min="1" max="65535" placeholder="80"
                  value={remotePort} onChange={e => setRemotePort(e.target.value)} />
              </div>
            </div>
            {error && <div className="fwd-error">{error}</div>}
            <div className="fwd-form-actions">
              <button className="btn-primary" onClick={handleAdd} disabled={adding}>
                {adding ? t('adding') : t('addForwardBtn')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main App ---
export default function App() {
  const [servers, setServers] = useState<Server[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const updateTab = useCallback((id: string, patch: Partial<Tab> | ((t: Tab) => Partial<Tab>)) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== id) return t
      const p = typeof patch === 'function' ? patch(t) : patch
      return { ...t, ...p }
    }))
  }, [])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const tabBarRef = useRef<HTMLDivElement | null>(null)
  const [showAddServer, setShowAddServer] = useState(false)
  const [showImportSSH, setShowImportSSH] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [quickConnectOpen, setQuickConnectOpen] = useState(false)
  const [quickConnectVal, setQuickConnectVal] = useState('')
  const [showNotes, setShowNotes] = useState(true)
  /**
   * Cross-component bridge for the SFTP "Create note" action. SftpBrowser sets
   * this with the file's path + the current server's identity; NotesPanel
   * picks it up via prop, materializes a draft note pre-bound to that
   * file/server, opens the expand popup, and calls onConsumed to clear it.
   */
  const [pendingNoteFromFile, setPendingNoteFromFile] = useState<{
    serverId: string
    serverName: string
    host: string
    path: string
    fileName: string
  } | null>(null)
  const [noteEditor, setNoteEditor] = useState<{
    note: Note
    save: (n: Note) => Promise<void>
    del: (id: string) => void
    folders: string[]
  } | null>(null)
  const [logViewerMinimized, setLogViewerMinimized] = useState(false)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  // ── Per-tab editor + preview state ──
  const [tabEditorStates, setTabEditorStates] = useState<Map<string, TabEditorState>>(new Map())
  const updateEditorState = useCallback((tabId: string, updater: Partial<TabEditorState> | ((prev: TabEditorState) => Partial<TabEditorState>)) => {
    setTabEditorStates(prev => {
      const next = new Map(prev)
      const cur = next.get(tabId) ?? DEFAULT_EDITOR_STATE
      const delta = typeof updater === 'function' ? updater(cur) : updater
      next.set(tabId, { ...cur, ...delta })
      return next
    })
  }, [])
  // Derived — active tab's editor state (used by openFileInEditor callback)
  const editorFiles = ((activeTab ? tabEditorStates.get(activeTab) : null) ?? DEFAULT_EDITOR_STATE).files
  const [activePanel, setActivePanel] = useState<'servers' | 'sftp' | 'snippets' | 'logs' | 'settings' | 'chat'>('servers')
  const [chatThread, setChatThread] = useState<ChatThreadState | null>(null)
  const [hasUnreadChat, setHasUnreadChat] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('themes')
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
  const [panicMode, setPanicMode] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean } | null>(null)
  // ── Tab groups ──
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [showGroupModal, setShowGroupModal] = useState<{ tabId: string } | null>(null)
  // ── Broadcast & port forwarding ──
  const [broadcastMode, setBroadcastMode] = useState(false)
  const [showForwarding, setShowForwarding] = useState(false)
  const [showTunnels, setShowTunnels] = useState(false)
  const [tunnelCount, setTunnelCount] = useState(0)
  const [cmdHistFor, setCmdHistFor] = useState<{ serverId: string; serverName: string } | null>(null)
  // ── Admin shell (elevated instance) ──
  const [isAdminInstance, setIsAdminInstance] = useState(false)
  // ── Command palette ──
  const [showPalette, setShowPalette] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)
  // ── Snippet doc view (central area) ──
  const [snipDoc, setSnipDoc] = useState<SnipDocState | null>(null)
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
  const { t, lang } = langState
  const themeState = useThemeState()
  const achCtx = useAchievements()

  // Last-session workspace (server IDs that were open last time)
  const [lastSessionIds, setLastSessionIds] = useState<string[]>([])
  const workspaceLoadedRef = useRef(false)

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

  // ── Workspace: load saved session IDs once on mount ─────────────────────────
  useEffect(() => {
    nt?.getWorkspace().then((ws: unknown) => {
      const ids = (ws && typeof ws === 'object' && Array.isArray((ws as { serverIds?: unknown }).serverIds))
        ? ((ws as { serverIds: unknown[] }).serverIds.filter((x): x is string => typeof x === 'string'))
        : []
      setLastSessionIds(ids)
      workspaceLoadedRef.current = true
    }).catch(() => { workspaceLoadedRef.current = true })
  }, [])

  // ── Workspace: persist current open tabs (server IDs, deduped) ──────────────
  useEffect(() => {
    if (!workspaceLoadedRef.current) return
    const seen = new Set<string>()
    const serverIds: string[] = []
    for (const tb of tabs) {
      const id = tb.server.id
      if (!seen.has(id) && id && id !== '__admin__') {
        seen.add(id); serverIds.push(id)
      }
    }
    nt?.saveWorkspace({ serverIds, savedAt: Date.now() }).catch(() => {})
  }, [tabs])

  // ── Poll active tunnel count for toolbar badge ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const connected = tabs.filter(t => t.sessionId && t.status === 'connected' && (t.server.connType ?? 'ssh') === 'ssh')
      if (connected.length === 0) { if (!cancelled) setTunnelCount(0); return }
      let total = 0
      for (const tb of connected) {
        try {
          const list = await nt?.sshForwardList(tb.sessionId!) ?? []
          total += list.length
        } catch { /* ignore */ }
      }
      if (!cancelled) setTunnelCount(total)
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [tabs])

  // ── Admin shell auto-connect (elevated instance launched via --admin-shell) ──
  const adminInitDone = useRef(false)
  useEffect(() => {
    if (adminInitDone.current) return   // guard against React StrictMode double-fire
    nt?.getStartupAdminShell().then((shell: string | null) => {
      if (!shell) return
      if (adminInitDone.current) return
      adminInitDone.current = true
      setIsAdminInstance(true)
      const adminServer: Server = {
        id: '__admin__',
        name: shell.replace(/\\/g, '/').split('/').pop() ?? shell,
        connType: 'local',
        localShell: shell,
        asAdmin: false,
        host: '', port: 0, username: '',
      }
      setTimeout(() => connectServer(adminServer), 150)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-update check on startup ──────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      setUpdateState({ status: 'checking' })
      const result = await nt?.checkForUpdates()
      if (result?.hasUpdate && result.version) {
        setUpdateState({ status: 'available', version: result.version })
      } else {
        setUpdateState({ status: 'idle' })
      }
    }
    // Delay 3s so the app has time to fully load first
    const timer = setTimeout(check, 3000)
    return () => clearTimeout(timer)
  }, [])

  // Groups are session-only — tabs don't persist so groups without tabs make no sense
  const persistGroups = useCallback((next: TabGroup[]) => {
    setGroups(next)
  }, [])

  const assignTabToGroup = useCallback((tabId: string, groupId: string | null) => {
    updateTab(tabId, { groupId: groupId ?? undefined })
    setContextMenu(null)
  }, [updateTab])

  const createGroup = useCallback((name: string, color: string, tabId: string) => {
    const newGroup: TabGroup = { id: Date.now().toString(), name, color }
    persistGroups([...groups, newGroup])
    assignTabToGroup(tabId, newGroup.id)
    setShowGroupModal(null)
  }, [groups, persistGroups, assignTabToGroup])

  // F1 → shortcuts modal | Ctrl+K → command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setPanicMode(v => !v); return }
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

        // Non-SSH types (local/docker/serial/telnet) don't auto-reconnect
        if (tab.server.connType && tab.server.connType !== 'ssh') {
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

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const showConfirm = useCallback((message: string, danger = false): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmDialog({
        message,
        danger,
        onConfirm: () => { setConfirmDialog(null); resolve(true) },
        onCancel:  () => { setConfirmDialog(null); resolve(false) },
      })
    })
  }, [])

  // ── Split layout change ──
  const changeSplitLayout = useCallback((newLayout: SplitLayout, currentTabs: Tab[], currentActiveTab: string | null, currentSlots: (string | null)[]) => {
    const { panes: newCount } = LAYOUT_CONFIG[newLayout]
    setSplitLayout(newLayout)
    setSplitColRatios(DEFAULT_COL_RATIOS[newLayout])
    setSplitRowRatio(50)
    setActivePaneIdx(0)
    setShowLayoutPicker(false)
    if (newLayout !== '1') achCtx?.trackEvent({ type: 'split-layout', layout: newLayout })

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

    setTabs(prev => {
      const next = [...prev, newTab]
      achCtx?.trackEvent({ type: 'tabs-changed', count: next.length })
      return next
    })
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
      const ct = server.connType ?? 'ssh'
      let result: { sessionId: string }

      if (ct === 'ssh') {
        // Vault fallback: if secrets not in memory, load from system keychain
        let connectPassword = server.password
        let connectPassphrase = server.passphrase
        if (!server.useAgent && !server.privateKeyPath && !connectPassword) {
          connectPassword = (await nt?.vaultLoad(server.id, 'password').catch(() => null)) ?? undefined
        }
        if (server.privateKeyPath && !connectPassphrase) {
          connectPassphrase = (await nt?.vaultLoad(server.id, 'passphrase').catch(() => null)) ?? undefined
        }
        result = await nt!.sshConnect({
          host: server.host,
          port: server.port,
          username: server.username,
          password: connectPassword,
          privateKeyPath: server.privateKeyPath,
          passphrase: connectPassphrase,
          useAgent: server.useAgent,
          forwardAgent: server.forwardAgent,
          jumpHost: server.jumpHost,
        })
      } else if (ct === 'telnet') {
        result = await nt!.telnetConnect(server.host, server.port)
      } else if (ct === 'serial') {
        result = await nt!.serialConnect(server.serialPort ?? 'COM1', server.baudRate ?? 9600)
      } else if (ct === 'local') {
        if (server.asAdmin) {
          // Launch new elevated SENU window — current window stays open
          clearTimeout(hintTimer)
          setTabs(prev => prev.filter(t => t.id !== tabId))
          await nt!.localConnectAdmin(server.localShell ?? undefined)
          return
        }
        result = await nt!.localConnect(server.localShell ?? undefined, undefined)
      } else if (ct === 'docker') {
        result = await nt!.dockerConnect(server.dockerContainer ?? '', server.dockerShell ?? 'sh')
      } else {
        throw new Error(`Unknown connection type: ${ct}`)
      }

      clearTimeout(hintTimer)
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        // Sync PTY size with actual terminal immediately after connect.
        // PTY starts at 80×24; if the real terminal is wider PowerShell
        // wraps at col 80 with bare \r, causing text to overwrite itself.
        if (t.terminal && t.fitAddon) {
          // Use a small timeout so xterm has finished rendering first
          setTimeout(() => {
            if (t.terminal && t.fitAddon) {
              try { t.fitAddon.fit() } catch { /* ignore */ }
              nt?.sshResize(result.sessionId, t.terminal.cols, t.terminal.rows)
            }
          }, 50)
        }
        // Admin instance: print a visible banner so user knows they're elevated
        if (t.server.id === '__admin__' && t.terminal) {
          t.terminal.write('\x1b[0m\r\n\x1b[41;97m  \u26a1 Administrator  \x1b[0m  \x1b[2mType "exit" to close\x1b[0m\r\n\r\n')
        }
        achCtx?.trackEvent({ type: 'connection', connType: server.connType ?? 'ssh', usedJump: !!server.jumpHost, usedAgent: !!server.useAgent })
        markServerConnected(server.id)
        return { ...t, sessionId: result.sessionId, status: 'connected', connectedAt: Date.now() }
      }))
    } catch (err) {
      clearTimeout(hintTimer)
      const errMsg = getErrorMessage(err, 'Connection failed')
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
    achCtx?.trackEvent({ type: 'server-add' })
    if (connect) connectServer(server)
  }, [connectServer, achCtx])

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
    achCtx?.trackEvent({ type: 'quick-connect' })
    connectServer(server)
  }, [connectServer, achCtx])

  const openFileInEditor = useCallback(async (remotePath: string, sessionId: string) => {
    if (!activeTab) return
    // Already open in this tab? Just activate it
    if (editorFiles.some(f => f.remotePath === remotePath)) {
      updateEditorState(activeTab, { activePath: remotePath, minimized: false })
      return
    }
    try {
      const content = await nt?.sftpReadFile(sessionId, remotePath) ?? ''
      achCtx?.trackEvent({ type: 'editor-open' })
      updateEditorState(activeTab, prev => ({
        files: [...prev.files, { remotePath, content, sessionId, modified: false }],
        activePath: remotePath,
        saveError: '',
        minimized: false,
      }))
    } catch (e: unknown) {
      showToast(`Cannot open: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }, [activeTab, editorFiles, updateEditorState, showToast])


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
      // Admin instance: close the whole window when last tab is gone
      if (isAdminInstance && next.length === 0) {
        setTimeout(() => nt?.windowClose(), 100)
      }
      return next
    })
    setTabEditorStates(prev => {
      const next = new Map(prev)
      next.delete(tabId)
      return next
    })
  }, [tabs, activeTab, isAdminInstance])

  const disconnectAll = useCallback(async () => {
    const connected = tabs.filter(t => t.status === 'connected' && t.sessionId)
    if (!connected.length) return
    const ok = await showConfirm(
      connected.length === 1
        ? `Disconnect "${connected[0].server.name}"?`
        : `Disconnect all ${connected.length} active sessions?`,
      true
    )
    if (!ok) return
    await Promise.all(connected.map(t => {
      intentionalDisconnectRef.current.add(t.sessionId!)
      return nt?.sshDisconnect(t.sessionId!).catch(() => {})
    }))
    setTabs(prev => prev.map(t =>
      t.status === 'connected' ? { ...t, status: 'disconnected' as const, sessionId: null } : t
    ))
  }, [tabs, showConfirm])

  const reconnectTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    tab.terminal?.write('\r\n\x1b[33m↻ Reconnecting to ' + tab.server.host + '...\x1b[0m\r\n')
    updateTab(tabId, { status: 'connecting', sessionId: null })

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
        forwardAgent: tab.server.forwardAgent,
        jumpHost: tab.server.jumpHost,
      })
      clearTimeout(hintTimer)
      // Успіх — скидаємо лічильник авторекону
      reconnectAttemptsRef.current.delete(tabId)
      setTabs(prev => prev.map(t => {
        if (t.id !== tabId) return t
        if (t.terminal && t.fitAddon) {
          setTimeout(() => {
            if (t.terminal && t.fitAddon) {
              try { t.fitAddon.fit() } catch { /* ignore */ }
              nt?.sshResize(result.sessionId, t.terminal.cols, t.terminal.rows)
            }
          }, 50)
        }
        return { ...t, sessionId: result.sessionId, status: 'connected', connectedAt: Date.now() }
      }))
    } catch (err) {
      clearTimeout(hintTimer)
      const errMsg = getErrorMessage(err, 'Connection failed')
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
    achCtx?.trackEvent({ type: 'snippet-run' })
  }, [tabs, activeTab, achCtx])

  const runSnippet = useCallback((cmd: string) => {
    const tab = tabs.find(t => t.id === activeTab)
    if (tab?.sessionId) nt?.sshSendInput(tab.sessionId, cmd + '\n')
    achCtx?.trackEvent({ type: 'snippet-run' })
  }, [tabs, activeTab, achCtx])

  // When the active tab changes (or new tab is opened), make sure it's
  // visible in the (now horizontally-scrollable) tab bar. inline:'nearest'
  // avoids unnecessary scrolling if the tab is already on screen.
  useEffect(() => {
    if (!activeTab || !tabBarRef.current) return
    const el = tabBarRef.current.querySelector(`[data-tab-id="${activeTab}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTab, tabs.length])

  return (
    <ThemeContext.Provider value={themeState}>
    <LangContext.Provider value={langState}>
    <AchievementsProvider lang={langState.lang}>
      <div className="app">
      {panicMode && <PanicOverlay onExit={() => setPanicMode(false)} />}
      {/* Title bar — merged with tab bar */}
      <div className="titlebar">
        {/* macOS window controls */}
        <div className="wc-wrap">
          <div className="wc wc-close" onClick={() => nt?.windowClose()} title={t('close')} />
          <div className="wc wc-min" onClick={() => nt?.windowMinimize()} title={t('minimize')} />
          <div className="wc wc-max" onClick={() => nt?.windowMaximize()} title={t('maximize')} />
        </div>
        {/* SENU Logo — draggable handle */}
        <div className="tb-logo" data-tauri-drag-region>
          <span data-tauri-drag-region>SENU{isAdminInstance && <span style={{ fontSize: 9, marginLeft: 2 }} title="Running as Administrator">🛡</span>}</span>
        </div>

        {/* Tab bar — inside titlebar.
            ref + effect (just below render) auto-scrolls the active tab into
            view when many tabs overflow horizontally. */}
        <div className="tab-bar" ref={tabBarRef}>
          {(filterGroupId ? tabs.filter(t => t.groupId === filterGroupId) : tabs)
            .filter(t => !t.groupId || !collapsedGroups.has(t.groupId))
            .map(tab => {
            const grp = tab.groupId ? groups.find(g => g.id === tab.groupId) : null
            const paneIdx = splitLayout !== '1' ? paneSlots.indexOf(tab.id) : -1
            const isFocusedPane = paneIdx !== -1 && paneIdx === activePaneIdx
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''} status-${tab.status} ${dragTabId === tab.id ? 'tab-dragging' : ''} ${isFocusedPane ? 'tab-pane-focused' : ''}`}
                style={grp ? { '--tab-group-color': grp.color } as React.CSSProperties : undefined}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (splitLayout !== '1') {
                    if (paneIdx !== -1) {
                      setActivePaneIdx(paneIdx)
                    } else {
                      setPaneSlots(prev => {
                        const next = [...prev]
                        next[activePaneIdx] = tab.id
                        return next
                      })
                    }
                  }
                  // Move keyboard focus into the terminal of the clicked tab.
                  // Without this, after clicking a tab while the chat / notes
                  // sidebar had focus, keystrokes still went to the sidebar
                  // instead of the shell.
                  setTimeout(() => { try { tab.terminal?.focus() } catch {} }, 0)
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
                  <span className="tab-dot" style={{ background: tab.server.color || 'var(--accent)' }} />
                )}
                {renamingTabId === tab.id ? (
                  <input
                    className="tab-rename-input"
                    defaultValue={tab.label ?? tab.server.name}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    onBlur={e => {
                      const val = e.target.value.trim()
                      updateTab(tab.id, { label: val || undefined })
                      setRenamingTabId(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') { setRenamingTabId(null) }
                    }}
                  />
                ) : (
                  <span
                    className="tab-name"
                    onDoubleClick={e => { e.stopPropagation(); setRenamingTabId(tab.id) }}
                    title="Double-click to rename"
                  >{tab.label ?? tab.server.name}</span>
                )}
                {paneIdx !== -1 && (
                  <span className="tab-pane-badge" title={`Pane ${paneIdx + 1}`}>{paneIdx + 1}</span>
                )}
                {(tab.status === 'error' || tab.status === 'disconnected') && (
                  <button className="tab-reconnect" title={t('reconnect')} onClick={e => { e.stopPropagation(); reconnectTab(tab.id) }}>↻</button>
                )}
                <TabUptime connectedAt={tab.connectedAt} status={tab.status} />
                <button className="tab-close" onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>✕</button>
              </div>
            )
          })}
          {/* New connection button inside tab bar */}
          {!isAdminInstance && <button className="tab-add" onClick={() => setShowAddServer(true)} title={t('newConnection')}>+</button>}

          {/* Minimized log viewer tab — shown on the right when log is minimized */}
          {logViewerMinimized && (
            <div className="tab tab-log-minimized" onClick={() => setLogViewerMinimized(false)} title={t('logViewer')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 19V5"/><path d="M8 19v-6"/><path d="M12 19V9"/><path d="M16 19v-3"/><path d="M20 19V7"/>
              </svg>
              <span className="tab-name" style={{ color: 'var(--accent)' }}>{t('logViewer')}</span>
              <button className="tab-close" onClick={e => { e.stopPropagation(); setLogViewerMinimized(false) }}>▲</button>
            </div>
          )}
        </div>

        {/* Right actions — inside titlebar */}
        <div className="tb-right">
          {/* Quick Connect */}
          {!isAdminInstance && (quickConnectOpen ? (
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
            <button className="tb-btn" onClick={() => setQuickConnectOpen(true)} title={t('quickConnectTitle')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/>
              </svg>
            </button>
          ))}
          {/* Command Palette */}
          {!isAdminInstance && <button
            className="tb-btn"
            onClick={() => setShowPalette(v => !v)}
            title={t('commandPaletteTitle')}
            style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}
          >⌘K</button>}

          {/* Group filter buttons */}
          {!isAdminInstance && groups.length > 0 && (
            <div className="group-filters">
              {filterGroupId && (
                <button className="tb-btn group-filter-clear" title={t('showAllTabs')} onClick={() => setFilterGroupId(null)}>
                  {Ico.filter(12)} All
                </button>
              )}
              {groups.map(g => {
                const tabCount = tabs.filter(t => t.groupId === g.id).length
                const isCollapsed = collapsedGroups.has(g.id)
                return (
                  <span key={g.id} className="group-filter-wrap">
                    <button
                      className={`tb-btn group-filter-btn ${filterGroupId === g.id ? 'active' : ''}`}
                      title={`Filter: ${g.name} (${tabCount} tabs)`}
                      onClick={() => setFilterGroupId(prev => prev === g.id ? null : g.id)}
                    >
                      <span className="group-filter-dot" style={{ background: g.color }} />
                      <span className="group-filter-name">{g.name}</span>
                      {tabCount > 0 && <span className="group-filter-count">{tabCount}</span>}
                    </button>
                    <button
                      className={`tb-btn group-collapse-btn ${isCollapsed ? 'active' : ''}`}
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
          {!isAdminInstance && <div className="layout-picker-wrap" style={{ position: 'relative' }}>
            <button
              className={`tb-btn layout-btn ${splitLayout !== '1' ? 'active' : ''}`}
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
          </div>}

          {/* Disconnect all — panic button */}
          {!isAdminInstance && tabs.some(t => t.status === 'connected') && (
            <button
              className="tb-panic-btn"
              title={lang === 'uk' ? 'Відключити всі сесії' : lang === 'de' ? 'Alle Sitzungen trennen' : 'Disconnect all sessions'}
              onClick={disconnectAll}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              <span>{tabs.filter(t => t.status === 'connected').length}</span>
            </button>
          )}

          {/* Broadcast toggle */}
          {!isAdminInstance && tabs.filter(t => t.status === 'connected').length > 1 && (
            <button
              className={`tb-btn broadcast-btn ${broadcastMode ? 'active broadcast-btn--on' : ''}`}
              title={broadcastMode ? t('broadcastOff') : t('broadcastOn')}
              onClick={() => { setBroadcastMode(v => { if (!v) achCtx?.trackEvent({ type: 'broadcast' }); return !v }) }}
            >
              {Ico.broadcast(13)}
            </button>
          )}

          {/* Port forwarding — toggles tunnels popover; keeps ForwardingModal for add */}
          {!isAdminInstance && tabs.some(t => t.status === 'connected' && (t.server.connType ?? 'ssh') === 'ssh') && (
            <div style={{ position: 'relative' }}>
              <button
                className={`tb-btn ${showTunnels || showForwarding ? 'active' : ''}`}
                title={t('portForwarding')}
                onClick={() => setShowTunnels(v => !v)}
              >
                {Ico.tunnel(13)}
                {tunnelCount > 0 && <span className="tb-badge">{tunnelCount}</span>}
              </button>
              {showTunnels && (
                <TunnelsPopover
                  tabs={tabs}
                  onClose={() => setShowTunnels(false)}
                  onAddNew={() => {
                    setShowTunnels(false)
                    if (activeTab && tabs.find(t => t.id === activeTab)?.status === 'connected') {
                      achCtx?.trackEvent({ type: 'port-forward' })
                      setShowForwarding(true)
                    }
                  }}
                />
              )}
            </div>
          )}

          {/* Lock/unlock splitter */}
          {splitLayout !== '1' && (
            <button
              className={`tb-btn ${splitLocked ? 'active' : ''}`}
              title={splitLocked ? t('unlockSplitter') : t('lockSplitter')}
              onClick={() => setSplitLocked(v => !v)}
            >
              {splitLocked ? Ico.lock(13) : Ico.unlock(13)}
            </button>
          )}

          {/* Notes toggle */}
          {!isAdminInstance && <button className={`tb-btn ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(v => !v)} title={t('toggleNotes')}>{Ico.notes(13)}</button>}

          {/* Keyboard shortcuts help */}
          {!isAdminInstance && <button className="tb-btn" onClick={() => setShowShortcuts(true)} title={t('keyboardShortcuts')} style={{ fontSize: 11, fontWeight: 600 }}>?</button>}
        </div>
      </div>{/* end .titlebar */}

      {/* Update bar */}
      <UpdateBar
        state={updateState}
        onDownload={async () => {
          const version = updateState.status === 'available' ? updateState.version : '?'
          setUpdateState({ status: 'downloading', percent: 0 })
          try {
            await nt?.downloadUpdate((percent: number) => {
              setUpdateState({ status: 'downloading', percent })
            })
            setUpdateState({ status: 'downloaded', version })
          } catch (e: unknown) {
            setUpdateState({ status: 'error', message: (e as Error)?.message ?? 'Download failed' })
          }
        }}
        onInstall={() => nt?.installUpdate()}
        onDismiss={() => setUpdateState({ status: 'idle' })}
      />

      {/* Main area */}
      <div className="main">
        {/* Activity bar — hidden in admin mode */}
        <div className="activity-bar" style={isAdminInstance ? { display: 'none' } : undefined}>
          {(['servers', 'sftp', 'snippets', 'logs', 'chat'] as const).map((panel) => {
            const isActive = activePanel === panel && !sideCollapsed
            const refitAllTerminals = () => {
              setTimeout(() => {
                tabs.forEach(t => { if (t.fitAddon) { try { t.fitAddon.fit() } catch(_){} } })
              }, 320)
            }
            const handleClick = () => {
              if (sideCollapsed) {
                setActivePanel(panel)
                setSideCollapsed(false)
                refitAllTerminals()
                if (panel === 'sftp') achCtx?.trackEvent({ type: 'sftp-open' })
                if (panel === 'logs') achCtx?.trackEvent({ type: 'log-viewer-open' })
              } else if (activePanel === panel) {
                setSideCollapsed(true)  // same icon → collapse
                refitAllTerminals()
              } else {
                setActivePanel(panel)   // different icon → switch
                if (panel === 'sftp') achCtx?.trackEvent({ type: 'sftp-open' })
                if (panel === 'logs') achCtx?.trackEvent({ type: 'log-viewer-open' })
              }
            }
            return (
              <button
                key={panel}
                className={`ab-icon ${isActive ? 'on' : ''}`}
                title={
                  panel === 'servers' ? t('servers')
                  : panel === 'sftp' ? t('sftpBrowser')
                  : panel === 'snippets' ? t('commandSnippets')
                  : panel === 'chat' ? (lang === 'uk' ? 'Зашифрований чат' : 'Encrypted Chat')
                  : t('logViewer')
                }
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
                {panel === 'logs' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19V5"/><path d="M8 19v-6"/><path d="M12 19V9"/><path d="M16 19v-3"/><path d="M20 19V7"/>
                  </svg>
                )}
                {panel === 'chat' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                )}
              </button>
            )
          })}
          <div className="activity-spacer" />
          {/* Achievements button */}
          <button
            className={`ab-icon${achCtx && achCtx.totalUnlocked > 0 ? ' has-badge' : ''}`}
            title="Achievements"
            onClick={() => setShowAchievements(true)}
            style={{ position: 'relative' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
            {achCtx && achCtx.totalUnlocked > 0 && (
              <span className="ach-activity-badge" />
            )}
          </button>
          {(() => {
            const panel = 'settings' as const
            const isActive = activePanel === panel && !sideCollapsed
            const handleClick = () => {
              if (sideCollapsed) {
                setActivePanel(panel)
                setSideCollapsed(false)
              } else if (activePanel === panel) {
                setSideCollapsed(true)
              } else {
                setActivePanel(panel)
              }
            }
            return (
              <button
                className={`ab-icon ${isActive ? 'on' : ''}`}
                title={t('settings')}
                onClick={handleClick}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )
          })()}
        </div>

        {/* Side panel — collapses to zero width when sideCollapsed */}
        <div className={`side-panel${(sideCollapsed || isAdminInstance) ? ' side-panel--collapsed' : ''}`}>
        <div className="side-panel-inner">
          {activePanel === 'servers' && (
            <>
              <div className="panel-title">{t('servers')}</div>
              {servers.map(server => (
                <div key={server.id} className="server-item" onClick={() => connectServer(server)}>
                  <span className="server-dot" style={{ background: server.color || '#00d4aa' }} />
                  <div className="server-info">
                    <span className="server-name">{server.name}</span>
                    <span className="server-host">
                      {(!server.connType || server.connType === 'ssh') && `${server.username}@${server.host}`}
                      {server.connType === 'telnet' && `telnet://${server.host}:${server.port}`}
                      {server.connType === 'serial' && `${server.serialPort ?? '?'} @ ${server.baudRate ?? 9600}`}
                      {server.connType === 'local' && (server.localShell ?? 'local shell')}
                      {server.connType === 'docker' && `docker: ${server.dockerContainer ?? '?'}`}
                    </span>
                  </div>
                  {server.connType === 'local' && server.asAdmin && (
                    <span className="server-type-badge server-type-badge--admin" title={t('runAsAdmin')}>🛡</span>
                  )}
                  {server.connType && server.connType !== 'ssh' && (
                    <span className="server-type-badge">{server.connType.toUpperCase()}</span>
                  )}
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
              <div className="sidebar-add-row">
                <button className="sidebar-add" onClick={() => setShowAddServer(true)}>{t('addServer')}</button>
                <button className="sidebar-import-btn" onClick={() => setShowImportSSH(true)} title={t('importSshConfig')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {t('importAction')}
                </button>
              </div>
            </>
          )}
          {/* Always mounted — CSS hides it to preserve path state */}
          <div style={{ display: activePanel === 'sftp' ? 'contents' : 'none' }}>
            <SftpBrowser
              sessionId={activeTabData?.sessionId || null}
              onOpenFile={openFileInEditor}
              onCreateNoteFromFile={(path, fileName) => {
                const srv = activeTabData?.server
                if (!srv) return
                setPendingNoteFromFile({
                  serverId: srv.id,
                  serverName: srv.name,
                  host: srv.host,
                  path,
                  fileName,
                })
                setShowNotes(true)
              }}
            />
          </div>
          {/* Snippets — always mounted to preserve search/tab state */}
          <div style={{ display: activePanel === 'snippets' ? 'contents' : 'none' }}>
            <SnippetsPanel onInsert={insertSnippet} onRun={runSnippet} onOpenDoc={setSnipDoc} />
          </div>
          <div style={{ display: activePanel === 'logs' ? 'contents' : 'none' }}>
            <LogViewerPanel
              sessionId={activeTabData?.sessionId || null}
              serverName={activeTabData?.server.name || null}
              isMinimized={logViewerMinimized}
              onMinimizedChange={setLogViewerMinimized}
            />
          </div>
          <div style={{ display: activePanel === 'chat' ? 'contents' : 'none' }}>
            <ChatPanel
              sessionId={activeTabData?.sessionId || null}
              visible={activePanel === 'chat' && !sideCollapsed}
              onOpenThread={setChatThread}
              lang={lang}
              onConfirm={showConfirm}
              onUnreadChange={setHasUnreadChat}
            />
          </div>
          <div style={{ display: activePanel === 'settings' ? 'contents' : 'none' }}>
            <div className="ph">
              <div className="ph-title">{t('settings')}</div>
            </div>
            <div className="panel-scroll settings-nav">
              <button className={`settings-nav-item ${settingsSection === 'themes' ? 'active' : ''}`} onClick={() => setSettingsSection('themes')}>{t('themes')}</button>
              <button className={`settings-nav-item ${settingsSection === 'language' ? 'active' : ''}`} onClick={() => setSettingsSection('language')}>{t('interfaceLanguage')}</button>
              <div className="settings-nav-sep" />
              <button className={`settings-nav-item settings-nav-docs ${settingsSection === 'docs' ? 'active' : ''}`} onClick={() => setSettingsSection('docs')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                {lang === 'uk' ? 'Документація' : 'Documentation'}
              </button>
            </div>
          </div>
        </div>{/* end side-panel-inner */}
        </div>

        {/* Terminal area */}
        <div className="terminal-area" ref={termAreaRef} style={{ position: 'relative' }}>
          {activePanel === 'settings' && !sideCollapsed && !isAdminInstance && (
            <div className="settings-stage">
              {settingsSection === 'docs'
                ? <DocsPage lang={lang} onClose={() => setSettingsSection('themes')} />
                : <SettingsView section={settingsSection} />
              }
            </div>
          )}
          {/* Snippet doc overlay — visible only while Snippets sidebar is active.
              Switching the sidebar away keeps doc state alive and re-shows it
              on return, like a background tab. */}
          {snipDoc && activePanel === 'snippets' && (
            <SnipDocView
              doc={snipDoc}
              onClose={() => setSnipDoc(null)}
              onInsert={insertSnippet}
              onRun={runSnippet}
            />
          )}
          {/* Note editor overlay — tied to the right-side Notes panel toggle */}
          {noteEditor && showNotes && (
            <NoteEditor
              key={noteEditor.note.id}
              note={noteEditor.note}
              servers={servers.map(s => ({ id: s.id, name: s.name, host: s.host }))}
              existingFolders={noteEditor.folders}
              lang={lang}
              onSave={async (n) => { await noteEditor.save(n); setNoteEditor(null) }}
              onDelete={async (id) => { noteEditor.del(id); setNoteEditor(null) }}
              onClose={() => setNoteEditor(null)}
              connectedServers={tabs
                .filter(t => t.status === 'connected' && t.sessionId)
                .map(t => ({ id: t.server.id, name: t.server.name }))
                // Dedupe — same server may have multiple connected tabs.
                .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)}
              onConfirm={showConfirm}
              onSaveLocal={async (filename, content) => {
                // Native "Save As" dialog for the note's markdown.
                await window.nextterm.saveMarkdown(filename, content)
              }}
              onCreateFolder={async (name) => {
                if (!name.trim()) return null
                const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                const folder = {
                  id, name: name.trim(),
                  parentFolderId: undefined as string | undefined,
                  createdAt: new Date().toISOString(),
                }
                try {
                  await window.nextterm.saveFolder?.(folder)
                  foldersStore.upsert(folder)
                  return { id: folder.id, name: folder.name }
                } catch (e) {
                  console.error('saveFolder failed:', e)
                  return null
                }
              }}
              onPushToServer={async (serverId, remotePath, content) => {
                // Find an active session for the requested server. The first
                // connected tab wins; others are duplicates pointing at the
                // same server.
                const tab = tabs.find(t => t.server.id === serverId && t.status === 'connected' && t.sessionId)
                if (!tab?.sessionId) return { ok: false, error: 'No active session for this server' }
                try {
                  await window.nextterm.sftpWriteFile(tab.sessionId, remotePath, content)
                  return { ok: true }
                } catch (e) {
                  return { ok: false, error: String((e as Error)?.message ?? e) }
                }
              }}
            />
          )}
          {/* Chat thread overlay */}
          {chatThread && (
            <ChatThreadView
              state={chatThread}
              sessionId={activeTabData?.sessionId || null}
              onClose={() => setChatThread(null)}
            />
          )}
          {/* Center Mode Bar — Terminal | Editor | Docs */}
          {!isAdminInstance && activePanel !== 'settings' && tabs.length > 0 && (() => {
            const tab = activeTabData
            const pes = tab ? (tabEditorStates.get(tab.id) ?? null) : null
            const hasEditor = pes && pes.files.length > 0
            const editorMode = hasEditor && pes && !pes.minimized ? 'editor' : 'terminal'
            return (
              <div className="cmb">
                <button
                  className={`cmb-btn m-terminal ${editorMode === 'terminal' ? 'on' : ''}`}
                  onClick={() => {
                    if (tab && hasEditor) updateEditorState(tab.id, { minimized: true })
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                  {t('terminalMode')}
                </button>
                <button
                  className={`cmb-btn m-editor ${editorMode === 'editor' ? 'on' : ''}`}
                  onClick={() => {
                    if (tab && hasEditor) updateEditorState(tab.id, { minimized: false })
                  }}
                  style={{ opacity: hasEditor ? 1 : 0.35 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  {t('editorMode')}
                </button>
                <div className="cmb-sep" />
                {tab && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {tab.server.name}
                  </span>
                )}
              </div>
            )
          })()}
          {/* Broadcast active banner */}
          {broadcastMode && tabs.filter(t => t.status === 'connected').length > 1 && (
            <div className="broadcast-banner">
              {Ico.broadcast(12)}
              <span>{t('broadcastActive')} ({tabs.filter(t => t.status === 'connected').length} {t('sessions')})</span>
              <button className="broadcast-banner-close" onClick={() => setBroadcastMode(false)}>✕</button>
            </div>
          )}
          {/* Single mode — classic layout */}
          {splitLayout === '1' && (
            <>
              {tabs.length === 0 && (
                <HomeScreen
                  servers={servers}
                  groups={groups}
                  lang={lang}
                  t={t}
                  onConnect={connectServer}
                  onAddServer={() => setShowAddServer(true)}
                  restorableIds={lastSessionIds.filter(id => servers.some(s => s.id === id))}
                  onRestoreSession={() => {
                    const toOpen = lastSessionIds
                      .map(id => servers.find(s => s.id === id))
                      .filter((s): s is Server => !!s)
                    toOpen.forEach((s, i) => setTimeout(() => connectServer(s), i * 120))
                  }}
                />
              )}
              {tabs.map(tab => (
                <TerminalPane
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTab}
                  onReconnect={() => reconnectTab(tab.id)}
                  onOpenHistory={(sid, sname) => setCmdHistFor({ serverId: sid, serverName: sname })}
                  onInput={tab.id === activeTab ? (data) => {
                    if (tab.sessionId) nt?.sshSendInput(tab.sessionId, data)
                    if (broadcastMode) {
                      tabs.filter(t => t.id !== tab.id && t.status === 'connected' && t.sessionId)
                        .forEach(t => nt?.sshSendInput(t.sessionId!, data))
                    }
                  } : undefined}
                />
              ))}
              {/* Single-layout editor overlays — one per tab, only active is visible */}
              {tabs.map(tab => {
                const tid = tab.id
                const pes = tabEditorStates.get(tid) ?? DEFAULT_EDITOR_STATE
                if (pes.files.length === 0) return null
                const pActivePath = pes.activePath
                const pFiles = pes.files
                const pFile = pFiles.find(f => f.remotePath === pActivePath) ?? null
                const isVisible = tid === activeTab

                const savePane = async () => {
                  if (!pFile) return
                  updateEditorState(tid, { saveError: '' })
                  try {
                    await nt?.sftpWriteFile(pFile.sessionId, pFile.remotePath, pFile.content)
                    updateEditorState(tid, prev => ({
                      files: prev.files.map(f => f.remotePath === pFile.remotePath ? { ...f, modified: false } : f),
                    }))
                    showToast(`Saved: ${pFile.remotePath.split('/').pop()}`)
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e)
                    updateEditorState(tid, { saveError: msg })
                    showToast(msg, 'error')
                  }
                }

                const closePaneFile = async (remotePath: string) => {
                  const f = pFiles.find(x => x.remotePath === remotePath)
                  if (f?.modified) {
                    const ok = await showConfirm('Unsaved changes will be lost. Close anyway?')
                    if (!ok) return
                  }
                  updateEditorState(tid, prev => {
                    const next = prev.files.filter(x => x.remotePath !== remotePath)
                    return {
                      files: next,
                      activePath: prev.activePath === remotePath ? (next[next.length - 1]?.remotePath ?? null) : prev.activePath,
                      saveError: '',
                    }
                  })
                }

                return (
                  <div
                    key={`ed-single-${tid}`}
                    className={`editor-overlay${pes.minimized ? ' editor-overlay--minimized' : ''}`}
                    style={{ display: isVisible ? 'flex' : 'none' }}
                  >
                    <div className="editor-tabs-bar">
                      <div className="editor-tabs-list">
                        {pFiles.map(f => {
                          const name = f.remotePath.split('/').pop() || f.remotePath
                          const isActive = f.remotePath === pActivePath
                          return (
                            <div key={f.remotePath} className={`editor-tab ${isActive ? 'active' : ''}`}
                              title={f.remotePath}
                              onClick={() => updateEditorState(tid, { activePath: f.remotePath })}>
                              {f.modified && <span className="editor-tab-dot">●</span>}
                              <span className="editor-tab-name">{name}</span>
                              <button className="editor-tab-close"
                                onClick={e => { e.stopPropagation(); closePaneFile(f.remotePath) }}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                      <div className="editor-tabs-actions">
                        {pes.saveError && !pes.minimized && (
                          <span className="editor-save-error" title={pes.saveError}>⚠ {pes.saveError}</span>
                        )}
                        <button className="editor-minimize-btn"
                          title={pes.minimized ? 'Restore editor' : 'Minimize editor'}
                          onClick={() => updateEditorState(tid, prev => ({ minimized: !prev.minimized }))}>
                          {pes.minimized ? '▲' : '▼'}
                        </button>
                        {!pes.minimized && (
                          <>
                            <button className="btn-primary btn-sm" onClick={savePane}>
                              Save <span style={{ opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {!pes.minimized && (<>
                      <div className="editor-body">
                        {pFile && (
                          <div className="editor-monaco-pane">
                            <SftpEditor
                              key={pActivePath}
                              remotePath={pFile.remotePath}
                              value={pFile.content}
                              modified={!!pFile.modified}
                              onChange={(val: string) => updateEditorState(tid, prev => ({
                                files: prev.files.map(f =>
                                  f.remotePath === prev.activePath ? { ...f, content: val, modified: true } : f
                                ),
                              }))}
                              onSave={() => savePane()}
                            />
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                )
              })}
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

                  // ── Per-pane editor state ──
                  const pes        = (tabId ? tabEditorStates.get(tabId) : null) ?? DEFAULT_EDITOR_STATE
                  const pFiles     = pes.files
                  const pActivePath = pes.activePath
                  const pFile      = pFiles.find(f => f.remotePath === pActivePath) ?? null

                  const savePane = async () => {
                    if (!pFile || !tabId) return
                    updateEditorState(tabId, { saveError: '' })
                    try {
                      await nt?.sftpWriteFile(pFile.sessionId, pFile.remotePath, pFile.content)
                      updateEditorState(tabId, prev => ({
                        files: prev.files.map(f => f.remotePath === pFile.remotePath ? { ...f, modified: false } : f),
                      }))
                      showToast(`Saved: ${pFile.remotePath.split('/').pop()}`)
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : String(e)
                      updateEditorState(tabId, { saveError: msg })
                      showToast(msg, 'error')
                    }
                  }

                  const closePaneFile = async (remotePath: string) => {
                    if (!tabId) return
                    const f = pFiles.find(x => x.remotePath === remotePath)
                    if (f?.modified) {
                      const ok = await showConfirm('Unsaved changes will be lost. Close anyway?')
                      if (!ok) return
                    }
                    updateEditorState(tabId, prev => {
                      const next = prev.files.filter(x => x.remotePath !== remotePath)
                      return {
                        files: next,
                        activePath: prev.activePath === remotePath ? (next[next.length - 1]?.remotePath ?? null) : prev.activePath,
                        saveError: '',
                      }
                    })
                  }

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
                        <TerminalPane
                          key={tab.id}
                          tab={tab}
                          active={isFocused}
                          onReconnect={() => reconnectTab(tab.id)}
                          onOpenHistory={(sid, sname) => setCmdHistFor({ serverId: sid, serverName: sname })}
                          inSplit
                          onInput={isFocused ? (data) => {
                            if (tab.sessionId) nt?.sshSendInput(tab.sessionId, data)
                            if (broadcastMode) {
                              tabs.filter(t => t.id !== tab.id && t.status === 'connected' && t.sessionId)
                                .forEach(t => nt?.sshSendInput(t.sessionId!, data))
                            }
                          } : undefined}
                        />
                      ) : (
                        <div className="pane-empty">
                          <div className="pane-empty-label">{`${t('pane')} ${slotIdx + 1}`}</div>
                          <div className="pane-empty-hint">{t('clickToConnect')}</div>
                          <button className="pane-empty-btn" onClick={e => { e.stopPropagation(); setActivePaneIdx(slotIdx); setShowAddServer(true) }}>{t('connectBtn')}</button>
                        </div>
                      )}

                      {/* ── Per-pane Monaco editor overlay ── */}
                      {tabId && pFiles.length > 0 && (
                        <div
                          className={`editor-overlay${pes.minimized ? ' editor-overlay--minimized' : ''}`}
                          onClick={e => e.stopPropagation()}
                        >
                          {/* Tab bar */}
                          <div className="editor-tabs-bar">
                            <div className="editor-tabs-list">
                              {pFiles.map(f => {
                                const name = f.remotePath.split('/').pop() || f.remotePath
                                const isActive = f.remotePath === pActivePath
                                return (
                                  <div
                                    key={f.remotePath}
                                    className={`editor-tab ${isActive ? 'active' : ''}`}
                                    title={f.remotePath}
                                    onClick={e => { e.stopPropagation(); updateEditorState(tabId, { activePath: f.remotePath }) }}
                                  >
                                    {f.modified && <span className="editor-tab-dot">●</span>}
                                    <span className="editor-tab-name">{name}</span>
                                    <button
                                      className="editor-tab-close"
                                      onClick={e => { e.stopPropagation(); closePaneFile(f.remotePath) }}
                                    >✕</button>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="editor-tabs-actions">
                              {pes.saveError && !pes.minimized && (
                                <span className="editor-save-error" title={pes.saveError}>⚠ {pes.saveError}</span>
                              )}
                              <button
                                className="editor-minimize-btn"
                                title={pes.minimized ? 'Restore editor' : 'Minimize editor'}
                                onClick={e => { e.stopPropagation(); updateEditorState(tabId, prev => ({ minimized: !prev.minimized })) }}
                              >
                                {pes.minimized ? '▲' : '▼'}
                              </button>
                              {!pes.minimized && (
                                <>
                                  <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); savePane() }}>
                                    Save <span style={{ opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {!pes.minimized && (<>
                            <div className="editor-body">
                              {pFile && (
                                <div className="editor-monaco-pane">
                                  <SftpEditor
                                    key={pActivePath}
                                    remotePath={pFile.remotePath}
                                    value={pFile.content}
                                    modified={!!pFile.modified}
                                    onChange={(val: string) => updateEditorState(tabId, prev => ({
                                      files: prev.files.map(f =>
                                        f.remotePath === prev.activePath ? { ...f, content: val, modified: true } : f
                                      ),
                                    }))}
                                    onSave={() => savePane()}
                                  />
                                </div>
                              )}
                            </div>
                          </>)}
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


        </div>

        {/* Notes panel — hidden in admin mode */}
        {!isAdminInstance && (
          <NotesPanel
            serverId={null}
            visible={showNotes}
            activeServerName={activeTabData?.label ?? activeTabData?.server.name ?? null}
            activeServerHost={activeTabData?.server.host ?? null}
            activeServerConnected={activeTabData?.status === 'connected'}
            servers={servers.map(s => ({ id: s.id, name: s.name, host: s.host }))}
            onConfirm={showConfirm}
            onOpenEditor={(note, save, del, folders) => { setNoteEditor({ note, save, del, folders }) }}
            fullscreenNoteId={noteEditor?.note.id ?? null}
            pendingNoteFromFile={pendingNoteFromFile}
            onPendingNoteConsumed={() => setPendingNoteFromFile(null)}
          />
        )}
      </div>

      {/* Status bar — direct child of .app flex column */}
      <StatusBar
        tab={activeTabData}
        onPanic={() => { setPanicMode(true); achCtx?.trackEvent({ type: 'boss-key' }) }}
        hasUnreadChat={hasUnreadChat}
        chatPanelOpen={chatThread !== null || (activePanel === 'chat' && !sideCollapsed)}
        onOpenChat={() => {
          // Toggle: if any chat surface is visible (the side panel OR the
          // thread overlay), hide ALL of it — collapse the side panel and
          // close the thread overlay. The terminal underneath becomes
          // fully visible. Re-press to bring chat back.
          const chatVisible = chatThread !== null || (activePanel === 'chat' && !sideCollapsed)
          if (chatVisible) {
            setChatThread(null)
            if (activePanel === 'chat') setSideCollapsed(true)
          } else {
            setActivePanel('chat')
            setSideCollapsed(false)
          }
        }}
      />

      {showForwarding && activeTab && (() => {
        const tab = tabs.find(t => t.id === activeTab)
        return tab?.sessionId && tab.status === 'connected' ? (
          <ForwardingModal
            sessionId={tab.sessionId}
            onClose={() => setShowForwarding(false)}
          />
        ) : null
      })()}
      {showAddServer && (
        <ServerModal onSave={saveServer} onClose={() => setShowAddServer(false)} />
      )}
      {editingServer && (
        <ServerModal existing={editingServer} onSave={saveServer} onClose={() => setEditingServer(null)} />
      )}
      {showImportSSH && (
        <ImportSSHModal
          onClose={() => setShowImportSSH(false)}
          onImport={async (entries) => {
            achCtx?.trackEvent({ type: 'ssh-import' })
            for (const e of entries) {
              const server = {
                id: crypto.randomUUID(),
                name: e.name,
                host: e.host,
                port: e.port,
                username: e.username,
                privateKeyPath: e.key_path ?? undefined,
                color: '#00d4aa',
              }
              await saveServer(server, false)
            }
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmModal
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          danger={confirmDialog.danger}
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
            achCtx?.trackEvent({ type: 'host-key-verify' })
            nt?.sshVerifyHostKey({
              sessionId: hostKeyPrompt.sessionId,
              accepted: true,
              remember,
            }).catch(console.error)
            setHostKeyPrompt(null)
          }}
          onReject={() => {
            achCtx?.trackEvent({ type: 'host-key-reject' })
            nt?.sshVerifyHostKey({
              sessionId: hostKeyPrompt.sessionId,
              accepted: false,
              remember: false,
            }).catch(console.error)
            setHostKeyPrompt(null)
          }}
        />
      )}

      {/* Command history (Ctrl+Shift+R) */}
      {cmdHistFor && (
        <CommandHistoryOverlay
          serverId={cmdHistFor.serverId}
          serverName={cmdHistFor.serverName}
          onPick={(cmd) => {
            const tab = tabs.find(tb => tb.id === activeTab)
            if (tab?.sessionId) nt?.sshSendInput(tab.sessionId, cmd)
          }}
          onClose={() => setCmdHistFor(null)}
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
          onToggleSide={() => {
            setSideCollapsed(v => !v)
            setTimeout(() => {
              tabs.forEach(t => { if (t.fitAddon) { try { t.fitAddon.fit() } catch(_){} } })
            }, 320)
          }}
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

      {/* Achievements panel */}
      {showAchievements && (
        <AchievementsPanel lang={langState.lang} onClose={() => setShowAchievements(false)} />
      )}
      </div>
    </AchievementsProvider>
    </LangContext.Provider>
    </ThemeContext.Provider>
  )
}
