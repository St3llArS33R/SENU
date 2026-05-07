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

import { useState, useRef, useEffect, useCallback } from 'react'
import './notes.css'
import { notesStore, useNote, useIsDirty } from '../stores/notesStore'
import { useFolders, foldersStore } from '../stores/foldersStore'
import { tagClassWithOverride, resolveTagColor, nextTagColor } from './tagColor'
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu'

// ── Types ──────────────────────────────────────────────────────────────────
export interface NoteLink {
  type: 'tag' | 'server' | 'path' | 'file'
  label: string
  serverId?: string
  path?: string
  /** User-overridden color index (0..7). Tags only. See notes/tagColor.ts. */
  colorIndex?: number
}

export interface NoteData {
  id: string
  title: string
  content: string
  updatedAt: string
  createdAt?: string
  folderId?: string
  folder?: string // legacy — kept so old saved notes still deserialize cleanly
  links?: NoteLink[]
  scope?: 'global' | 'server' | 'path'
  boundServers?: string[]
  pathPattern?: string
}

export interface NoteServer {
  id: string
  name: string
  host: string
}

interface Props {
  note: NoteData
  servers: NoteServer[]
  existingFolders: string[]
  lang: string
  onSave: (note: NoteData) => void
  onDelete?: (id: string) => void
  onClose: () => void
  /** Servers with an active SSH session, available as push-as-docs targets. */
  connectedServers?: { id: string; name: string }[]
  /** Push the note's markdown to (server, remotePath). */
  onPushToServer?: (serverId: string, remotePath: string, content: string) => Promise<{ ok: boolean; error?: string }>
  /** Confirmation dialog hook (yes/no). Used before destructive moves. */
  onConfirm?: (msg: string) => Promise<boolean>
  /**
   * Persist a freshly-created folder. Called from the "Create new folder"
   * button below the folder section in fullscreen. Caller is responsible for
   * the disk write + foldersStore.upsert.
   */
  onCreateFolder?: (name: string) => Promise<{ id: string; name: string } | null>
  /** Save the note's markdown to a user-chosen local file (native Save As). */
  onSaveLocal?: (filename: string, content: string) => Promise<void>
}

// ── Block types ────────────────────────────────────────────────────────────
type BlockT = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'code' | 'divider'

interface Block {
  id: string
  type: BlockT
  text: string
  lang?: string
}

let _seq = 0
const mkid = () => `b${Date.now()}_${++_seq}`

// ── Markdown ↔ Blocks ──────────────────────────────────────────────────────
function mdToBlocks(md: string): Block[] {
  if (!md.trim()) return [{ id: mkid(), type: 'p', text: '' }]
  const result: Block[] = []
  const lines = md.split('\n')
  let i = 0
  while (i < lines.length) {
    const raw  = lines[i]
    const trim = raw.trim()
    if (!trim) { i++; continue }

    if (trim.startsWith('```')) {
      const lang = trim.slice(3).trim() || 'bash'
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      result.push({ id: mkid(), type: 'code', text: code.join('\n'), lang })
    } else if (trim === '---' || trim === '***') {
      result.push({ id: mkid(), type: 'divider', text: '' })
    } else if (trim.startsWith('# '))   { result.push({ id: mkid(), type: 'h1',   text: trim.slice(2) })
    } else if (trim.startsWith('## '))  { result.push({ id: mkid(), type: 'h2',   text: trim.slice(3) })
    } else if (trim.startsWith('### ')) { result.push({ id: mkid(), type: 'h3',   text: trim.slice(4) })
    } else if (trim.startsWith('- ') || trim.startsWith('* ')) {
      result.push({ id: mkid(), type: 'ul', text: trim.slice(2) })
    } else if (/^\d+\.\s/.test(trim)) {
      result.push({ id: mkid(), type: 'ol', text: trim.replace(/^\d+\.\s/, '') })
    } else if (trim.startsWith('> ')) {
      result.push({ id: mkid(), type: 'quote', text: trim.slice(2) })
    } else {
      result.push({ id: mkid(), type: 'p', text: trim })
    }
    i++
  }
  if (result.length === 0) result.push({ id: mkid(), type: 'p', text: '' })
  return result
}

function blocksToMd(blocks: Block[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'h1':      return `# ${b.text}`
      case 'h2':      return `## ${b.text}`
      case 'h3':      return `### ${b.text}`
      case 'ul':      return `- ${b.text}`
      case 'ol':      return `1. ${b.text}`
      case 'quote':   return `> ${b.text}`
      case 'divider': return '---'
      case 'code':    return `\`\`\`${b.lang || 'bash'}\n${b.text}\n\`\`\``
      default:        return b.text
    }
  }).join('\n')
}

// ── Relative time formatter ────────────────────────────────────────────────
// "just now" / "Nm ago" / "Nh ago" / locale-formatted date for older entries.
// `_tick` is a ticker counter the component bumps every 30s — passing it as a
// dependency makes React re-render the label, but the function itself just
// reads Date.now() each call.
function formatRelative(iso: string | undefined, lang: 'uk'|'en', _tick: number): string {
  void _tick
  if (!iso) return lang === 'uk' ? 'щойно' : 'just now'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return lang === 'uk' ? 'щойно' : 'just now'
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 45)         return lang === 'uk' ? 'щойно'      : 'just now'
  if (sec < 60 * 60)    return lang === 'uk' ? `${Math.floor(sec/60)} хв тому`  : `${Math.floor(sec/60)}m ago`
  if (sec < 60 * 60 * 24) return lang === 'uk' ? `${Math.floor(sec/3600)} год тому` : `${Math.floor(sec/3600)}h ago`
  return new Date(iso).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })
}

// ── Inline markdown renderer (bold, italic, code) ─────────────────────────
function renderInline(text: string): React.ReactNode {
  if (!text) return null
  // Split on **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="rne-inline-code">{p.slice(1, -1)}</code>
    return p
  })
}

// ── Slash-menu block templates ─────────────────────────────────────────────
const SLASH_BLOCKS: { icon: string; name: string; desc: string; type: BlockT; lang?: string }[] = [
  { icon: '¶',   type: 'p',       name: 'Параграф',    desc: 'Звичайний текст' },
  { icon: 'H1',  type: 'h1',      name: 'Заголовок 1', desc: 'Великий заголовок' },
  { icon: 'H2',  type: 'h2',      name: 'Заголовок 2', desc: 'Заголовок секції' },
  { icon: 'H3',  type: 'h3',      name: 'Заголовок 3', desc: 'Підзаголовок' },
  { icon: '•',   type: 'ul',      name: 'Список',      desc: 'Маркований список' },
  { icon: '1.',  type: 'ol',      name: 'Нумерований', desc: 'Нумерований список' },
  { icon: '"',   type: 'quote',   name: 'Цитата',      desc: 'Виділений блок тексту' },
  { icon: '—',   type: 'divider', name: 'Роздільник',  desc: 'Горизонтальна лінія' },
  { icon: '>_',  type: 'code',    name: 'Код/Команда', desc: 'Блок коду з Run/Insert', lang: 'bash' },
]

// ── PathAdder ──────────────────────────────────────────────────────────────
function PathAdder({
  type, servers, lang, onAdd, onCancel,
}: { type: 'path'|'file'; servers: NoteServer[]; lang: string; onAdd:(l:NoteLink)=>void; onCancel:()=>void }) {
  const [sid, setSid] = useState('')
  const [val, setVal] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const commit = () => {
    if (!sid || !val.trim()) return
    const srv = servers.find(s => s.id === sid)
    onAdd({ type, label: `${srv?.name ?? sid}:${val.trim()}`, serverId: sid, path: val.trim() })
  }
  return (
    <div className="ne-path-adder">
      <select className="ne-path-select" value={sid} onChange={e => setSid(e.target.value)}>
        <option value="">{lang === 'uk' ? 'Сервер…' : 'Server…'}</option>
        {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input ref={ref} className="ne-path-input" value={val}
        placeholder={type === 'file' ? '/etc/nginx.conf' : '/var/www'}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }} />
      <button className="ne-path-ok" onClick={commit}>✓</button>
      <button className="ne-path-cancel" onClick={onCancel}>✕</button>
    </div>
  )
}

// ── ServerPicker ───────────────────────────────────────────────────────────
function ServerPicker({ servers, added, lang, onAdd, onClose }: {
  servers: NoteServer[]; added: string[]; lang: string; onAdd:(s:NoteServer)=>void; onClose:()=>void
}) {
  const available = servers.filter(s => !added.includes(s.id))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} className="ne-server-picker">
      {available.length === 0
        ? <div className="ne-picker-empty">{lang === 'uk' ? 'Всі сервери додано' : 'All servers added'}</div>
        : available.map(s => (
          <div key={s.id} className="ne-server-opt" onClick={() => onAdd(s)}>
            <span className="ne-server-opt-name">{s.name}</span>
            <span className="ne-server-opt-host">{s.host}</span>
          </div>
        ))}
    </div>
  )
}

// ── Single block view/edit ─────────────────────────────────────────────────
function BlockRow({ block, isActive, olIndex, onFocus, onChange, onKeyDown, onRunInsert }: {
  block: Block
  isActive: boolean
  olIndex: number
  onFocus: () => void
  onChange: (b: Block) => void
  onKeyDown: (e: React.KeyboardEvent, b: Block) => void
  onRunInsert: (cmd: string, action: 'run'|'insert') => void
}) {
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isActive && editRef.current) {
      editRef.current.focus()
      // place cursor at end
      const len = editRef.current.value.length
      editRef.current.selectionStart = editRef.current.selectionEnd = len
    }
  }, [isActive])

  // auto-resize textarea
  useEffect(() => {
    const ta = editRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [block.text, isActive])

  if (block.type === 'divider') {
    return (
      <div className="rne-block" onClick={onFocus}>
        <hr className="rne-b-divider" />
      </div>
    )
  }

  if (block.type === 'code') {
    return (
      <div className={`rne-block ${isActive ? 'rne-block--active' : ''}`}>
        <div className="rne-block-handle" onClick={onFocus}>⠿</div>
        <div className="rne-b-code" onClick={onFocus}>
          <div className="rne-b-code-header">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="3" width="12" height="10" rx="1"/>
              <path d="M5 7l2 2-2 2M9 11h2"/>
            </svg>
            <span>{block.lang || 'bash'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
              bash
            </span>
          </div>
          {isActive ? (
            <textarea
              ref={editRef}
              className="rne-b-code-textarea"
              value={block.text}
              onChange={e => onChange({ ...block, text: e.target.value })}
              onKeyDown={e => onKeyDown(e, block)}
              spellCheck={false}
              placeholder="// код…"
            />
          ) : (
            <pre className="rne-b-code-pre">
              {block.text || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>// код…</span>}
            </pre>
          )}
          <div className="rne-b-code-footer">
            <button className="rne-cmd-insert" onClick={() => onRunInsert(block.text, 'insert')}>Insert</button>
            <button className="rne-cmd-run" onClick={() => onRunInsert(block.text, 'run')}>▶ Run</button>
          </div>
        </div>
      </div>
    )
  }

  const cls = {
    p: 'rne-b-p', h1: 'rne-b-h1', h2: 'rne-b-h2', h3: 'rne-b-h3',
    ul: 'rne-b-ul', ol: 'rne-b-ol', quote: 'rne-b-quote',
  }[block.type] ?? 'rne-b-p'

  const placeholder = {
    p: 'Текст…', h1: 'Заголовок', h2: 'Підзаголовок', h3: 'Розділ',
    ul: 'Пункт списку', ol: 'Пункт', quote: 'Цитата…',
  }[block.type] ?? '…'

  return (
    <div className={`rne-block ${isActive ? 'rne-block--active' : ''}`}>
      <div className="rne-block-handle" onClick={onFocus}>⠿</div>

      {block.type === 'ul' && <span className="rne-b-ul-dot" />}
      {block.type === 'ol' && <span className="rne-b-ol-num">{olIndex}.</span>}
      {block.type === 'quote' && <span className="rne-b-quote-bar" />}

      {isActive ? (
        <textarea
          ref={editRef}
          className={`${cls} rne-b-edit`}
          value={block.text}
          placeholder={placeholder}
          onChange={e => onChange({ ...block, text: e.target.value })}
          onKeyDown={e => onKeyDown(e, block)}
          rows={1}
          spellCheck={false}
        />
      ) : (
        <div className={cls} onClick={onFocus}>
          {block.text
            ? renderInline(block.text)
            : <span className="rne-b-placeholder">{placeholder}</span>}
        </div>
      )}
    </div>
  )
}

// ── Main NoteEditor ────────────────────────────────────────────────────────
export function NoteEditor({
  note, servers, existingFolders, lang, onSave, onDelete, onClose,
  connectedServers = [], onPushToServer, onConfirm, onCreateFolder, onSaveLocal,
}: Props) {
  // Title / folder / links live in notesStore. Blocks remain local — they're
  // a parsed view of the canonical markdown content; serialization happens via
  // the mirror effect below.
  const [blocks, setBlocks] = useState<Block[]>(() => mdToBlocks(note.content))
  const [newTag, setNewTag] = useState('')

  const [focusedId,    setFocusedId]    = useState<string | null>(null)
  const [showSlash,    setShowSlash]    = useState(false)
  const [slashPos,     setSlashPos]     = useState({ x: 0, y: 0 })
  const [slashFocus,   setSlashFocus]   = useState(0)
  const [showLinksMgr, setShowLinksMgr] = useState(false)
  const [showSrvPick,  setShowSrvPick]  = useState(false)
  const [addingPath,   setAddingPath]   = useState<'path'|'file'|null>(null)

  const titleRef  = useRef<HTMLTextAreaElement>(null)
  const docRef    = useRef<HTMLDivElement>(null)
  const isNew = !note.createdAt

  // ── Single source of truth: notesStore ────────────────────────────────────
  // The fullscreen editor reads title/folder/links live from the store. Falls
  // back to the prop only for the (rare) frame where the store entry is
  // missing — in practice NotesPanel populates it before opening the editor.
  const storeNote   = useNote(note.id)
  // Subscribe to folders so the picker grid reflects sidebar CRUD live.
  const allFoldersList = useFolders()
  // When the store entry exists, read its fields DIRECTLY — even if a field
  // is `undefined` (e.g. just-unfiled note has folderId === undefined). Using
  // `??` here would silently restore the legacy prop value and the user's
  // unfile/clear action would appear to revert.
  const titleView    = storeNote ? storeNote.title    : note.title
  const folderIdView = storeNote ? storeNote.folderId : note.folderId
  const linksView    = storeNote ? (storeNote.links ?? []) : (note.links ?? [])
  // Resolve the canonical folderId to a display name. Reads ONLY from the
  // store — falling back to the captured `note` prop is wrong because it
  // freezes the legacy `folder` string at mount time, so unfiling the note
  // would re-display the previous folder name from the stale prop.
  const currentFolderName = folderIdView
    ? (foldersStore.getOne(folderIdView)?.name ?? '')
    : (storeNote?.folder ?? '')

  const applyTitle = useCallback((v: string) => {
    notesStore.patchDraft(note.id, { title: v })
  }, [note.id])
  const applyLinks = useCallback((updater: NoteLink[] | ((p: NoteLink[]) => NoteLink[])) => {
    if (typeof updater === 'function') {
      const cur = notesStore.getDraft(note.id)?.links ?? []
      notesStore.patchDraft(note.id, { links: (updater as (p: NoteLink[]) => NoteLink[])(cur) })
    } else {
      notesStore.patchDraft(note.id, { links: updater })
    }
  }, [note.id])

  // ── Folder picker state (fullscreen Links manager) ────────────────────────
  // Two affordances per the spec: "Create new" opens a name modal; "Add to
  // existing" reveals a horizontally-scrolling grid (6 per column). Picking a
  // folder asks for confirmation before moving the note.
  const [showFolderGrid, setShowFolderGrid] = useState(false)
  const [showFolderCreate, setShowFolderCreate] = useState(false)
  const [folderCreateName, setFolderCreateName] = useState('')
  const [folderCreateBusy, setFolderCreateBusy] = useState(false)

  const applyFolderId = useCallback(async (id: string | undefined) => {
    notesStore.patchDraft(note.id, { folderId: id, folder: undefined })
  }, [note.id])

  const onPickFolder = async (f: { id: string; name: string }) => {
    if (folderIdView === f.id) { setShowFolderGrid(false); return }
    const msg = lang === 'uk'
      ? `Перемістити нотатку у папку «${f.name}»?`
      : `Move note to folder "${f.name}"?`
    const ok = onConfirm ? await onConfirm(msg) : window.confirm(msg)
    if (!ok) return
    await applyFolderId(f.id)
    setShowFolderGrid(false)
  }

  const submitCreateFolder = async () => {
    const name = folderCreateName.trim()
    if (!name || !onCreateFolder) return
    setFolderCreateBusy(true)
    try {
      const created = await onCreateFolder(name)
      if (created) await applyFolderId(created.id)
    } finally {
      setFolderCreateBusy(false)
      setFolderCreateName('')
      setShowFolderCreate(false)
    }
  }

  // ── Save-action menu (consolidates Save / Save locally / Push to server) ──
  const [saveMenuPos, setSaveMenuPos] = useState<{ x: number; y: number } | null>(null)

  // ── Push-as-docs dialog state ─────────────────────────────────────────────
  // The fullscreen editor exposes a "push to server" action that uploads the
  // note's markdown as a remote file. Default target prefers an existing file
  // binding (overwrite the bound file); otherwise we fall back to a tmp path
  // — the user adjusts in the dialog before confirming.
  const [showPush, setShowPush] = useState(false)
  const [pushTargetServer, setPushTargetServer] = useState<string>('')
  const [pushPath, setPushPath] = useState<string>('')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushDone, setPushDone] = useState(false)

  // ── Save status indicator ─────────────────────────────────────────────────
  // Reads dirty + updatedAt from the store. A 30s ticker re-renders the
  // relative-time label ("2m ago") so it stays accurate without user action.
  const dirty = useIsDirty(note.id)
  const updatedAt = storeNote?.updatedAt ?? note.updatedAt
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const statusText = dirty
    ? (lang === 'uk' ? '● Зберігаю…' : '● Saving…')
    : (lang === 'uk' ? `✓ Збережено · ${formatRelative(updatedAt, 'uk', tick)}` : `✓ Saved · ${formatRelative(updatedAt, 'en', tick)}`)

  // Link groups (computed from store-backed view)
  const tags        = linksView.filter(l => l.type === 'tag')
  const serverLinks = linksView.filter(l => l.type === 'server')
  const pathLinks   = linksView.filter(l => l.type === 'path')
  const fileLinks   = linksView.filter(l => l.type === 'file')
  const hasLinks    = serverLinks.length + pathLinks.length + fileLinks.length > 0

  // Word count
  const wordCount = blocks.reduce((n, b) =>
    n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0)

  // lastSerializedRef holds the markdown we last wrote to the store. The
  // loop-guard effect below uses it to distinguish our own writes from
  // external content changes (e.g. user editing the same note in the sidebar).
  const lastSerializedRef = useRef<string>(note.content)

  // Blocks are local UI state (parsed view of markdown). Mirror to store as
  // markdown on every change. lastSerializedRef remembers what we last wrote
  // so the loop-guard below can distinguish our own writes from external ones.
  useEffect(() => {
    const md = blocksToMd(blocks)
    lastSerializedRef.current = md
    notesStore.patchDraft(note.id, { content: md })
  }, [note.id, blocks])

  // Loop-guard: re-parse blocks if the store content was changed by another
  // surface (skipped for our own writes thanks to lastSerializedRef).
  useEffect(() => {
    const md = storeNote?.content
    if (md == null) return
    if (md === lastSerializedRef.current) return
    lastSerializedRef.current = md
    setBlocks(mdToBlocks(md))
  }, [storeNote?.content])

  // Title auto-resize
  useEffect(() => {
    const ta = titleRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [titleView])

  // ── Push-as-docs handlers ────────────────────────────────────────────────
  const openPushDialog = () => {
    if (!onPushToServer) return
    // Prefilled target: prefer the existing file binding (server + path) so
    // "push" naturally overwrites the bound file. Else default to a fresh
    // path under /tmp that the user can rewrite in the dialog.
    const draft = notesStore.getDraft(note.id) ?? note
    const links = draft.links ?? []
    const fileLink = links.find(l => l.type === 'file') ?? links.find(l => l.type === 'path')
    const fileServer = fileLink?.serverId ?? connectedServers[0]?.id ?? ''
    const titleSafe = (draft.title || 'untitled').replace(/[^\w.-]+/g, '_')
    const defaultPath = fileLink?.path ?? `/tmp/${titleSafe}.md`
    setPushTargetServer(fileServer)
    setPushPath(defaultPath)
    setPushError(null)
    setPushDone(false)
    setShowPush(true)
  }
  const submitPush = async () => {
    if (!onPushToServer || !pushTargetServer || !pushPath.trim()) return
    setPushBusy(true)
    setPushError(null)
    const draft = notesStore.getDraft(note.id) ?? note
    const md = draft.content ?? blocksToMd(blocks)
    const res = await onPushToServer(pushTargetServer, pushPath.trim(), md)
    setPushBusy(false)
    if (res.ok) {
      setPushDone(true)
      setTimeout(() => setShowPush(false), 900)
    } else {
      setPushError(res.error ?? 'Push failed')
    }
  }

  // Compose markdown for export / push — title as H1 + body. Kept separate
  // from handleSave so external destinations get a self-contained doc.
  const composeMarkdownForExport = (): { filename: string; content: string } => {
    const draft = notesStore.getDraft(note.id) ?? note
    const t = (draft.title ?? '').trim() || (lang === 'uk' ? 'untitled' : 'untitled')
    const md = draft.content ?? blocksToMd(blocks)
    const safeName = t.replace(/[^\w -￿. -]+/g, '_').slice(0, 80) || 'note'
    return { filename: `${safeName}.md`, content: `# ${t}\n\n${md}\n` }
  }
  const handleSaveLocal = async () => {
    if (!onSaveLocal) return
    const { filename, content } = composeMarkdownForExport()
    await onSaveLocal(filename, content)
  }

  // Save — store is the single source of truth; fall back to prop / local
  // blocks for the brief gap before the store entry is fully populated.
  const handleSave = useCallback(() => {
    // When draft exists, read fields DIRECTLY (an explicit `undefined` is a
    // valid value — e.g. unfiled note). Falling back via `??` to the captured
    // prop would resurrect old folder/links the user just cleared.
    const draft = notesStore.getDraft(note.id)
    const t   = (draft ? draft.title : note.title).trim() || (lang === 'uk' ? 'Без назви' : 'Untitled')
    const md  = draft?.content ?? blocksToMd(blocks)
    const fid = draft ? draft.folderId : note.folderId
    const lks = draft ? (draft.links ?? []) : (note.links ?? [])
    onSave({
      ...note,
      title: t,
      content: md,
      folderId: fid,
      folder: undefined, // legacy field — folderId is now canonical
      links: lks,
      updatedAt: new Date().toISOString(),
      createdAt: note.createdAt ?? new Date().toISOString(),
    })
    // The status indicator now derives from notesStore.isDirty + updatedAt;
    // upsert inside the parent's saveNote clears dirty automatically.
  }, [note, blocks, lang, onSave])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
      if (e.key === 'Escape' && !showSlash && !showLinksMgr) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleSave, onClose, showSlash, showLinksMgr])

  // ── Block operations ──────────────────────────────────────────────────────
  const updateBlock = useCallback((updated: Block) => {
    setBlocks(bs => bs.map(b => b.id === updated.id ? updated : b))
  }, [])

  const addBlockAfter = useCallback((afterId: string, type: BlockT = 'p', lang?: string) => {
    const nb: Block = { id: mkid(), type, text: '', lang }
    setBlocks(bs => {
      const idx = bs.findIndex(b => b.id === afterId)
      const copy = [...bs]
      copy.splice(idx + 1, 0, nb)
      return copy
    })
    setTimeout(() => setFocusedId(nb.id), 0)
  }, [])

  const deleteBlock = useCallback((id: string) => {
    setBlocks(bs => {
      if (bs.length <= 1) return [{ id: mkid(), type: 'p', text: '' }]
      const idx = bs.findIndex(b => b.id === id)
      const prev = bs[Math.max(0, idx - 1)]
      setTimeout(() => setFocusedId(prev.id), 0)
      return bs.filter(b => b.id !== id)
    })
  }, [])

  const handleBlockKeyDown = useCallback((e: React.KeyboardEvent, block: Block) => {
    if (showSlash) {
      if (e.key === 'Escape')    { e.preventDefault(); setShowSlash(false); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashFocus(f => Math.min(f+1, SLASH_BLOCKS.length-1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashFocus(f => Math.max(f-1, 0)); return }
      if (e.key === 'Enter')     { e.preventDefault(); insertSlashBlock(block.id, SLASH_BLOCKS[slashFocus]); return }
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault()
      addBlockAfter(block.id)
      return
    }

    if (e.key === 'Backspace' && !block.text && block.type !== 'code') {
      e.preventDefault()
      deleteBlock(block.id)
      return
    }

    if (e.key === '/' && !block.text && block.type === 'p') {
      const el = (e.target as HTMLElement).getBoundingClientRect()
      setSlashPos({ x: el.left, y: el.bottom + 4 })
      setShowSlash(true)
      setSlashFocus(0)
    }
  }, [showSlash, slashFocus, addBlockAfter, deleteBlock])

  const insertSlashBlock = useCallback((afterId: string, item: typeof SLASH_BLOCKS[0]) => {
    if (item.type === 'divider') {
      const db: Block = { id: mkid(), type: 'divider', text: '' }
      const np: Block = { id: mkid(), type: 'p', text: '' }
      setBlocks(bs => {
        const idx = bs.findIndex(b => b.id === afterId)
        const copy = [...bs]
        // replace empty block with divider + new p
        if (bs[idx].text === '') {
          copy.splice(idx, 1, db, np)
        } else {
          copy.splice(idx + 1, 0, db, np)
        }
        return copy
      })
      setTimeout(() => setFocusedId(np.id), 0)
    } else {
      const nb: Block = { id: mkid(), type: item.type, text: '', lang: item.lang }
      setBlocks(bs => {
        const idx = bs.findIndex(b => b.id === afterId)
        const copy = [...bs]
        if (bs[idx].text === '') {
          copy.splice(idx, 1, nb)
        } else {
          copy.splice(idx + 1, 0, nb)
        }
        return copy
      })
      setTimeout(() => setFocusedId(nb.id), 0)
    }
    setShowSlash(false)
  }, [])

  // ── Format toolbar: apply to focused block ────────────────────────────────
  const applyBlockType = (type: BlockT) => {
    if (!focusedId) return
    setBlocks(bs => bs.map(b => b.id === focusedId ? { ...b, type } : b))
  }

  // ── Link ops ──────────────────────────────────────────────────────────────
  const removeLink = useCallback((l: NoteLink) => applyLinks(p => p.filter(x => x !== l)), [applyLinks])
  /** Cycle a tag's display color to the next of 8 hues. Persists as
   *  `colorIndex` on the NoteLink, so reload preserves the user's choice. */
  const cycleTagColor = useCallback((label: string) => {
    applyLinks(p => p.map(x => {
      if (x.type !== 'tag' || x.label !== label) return x
      return { ...x, colorIndex: nextTagColor(resolveTagColor(label, x.colorIndex)) }
    }))
  }, [applyLinks])
  const addTag = (raw: string) => {
    const v = raw.trim().replace(/^#/, '')
    if (!v || linksView.some(l => l.type === 'tag' && l.label === v)) return
    applyLinks(p => [...p, { type: 'tag', label: v }])
    setNewTag('')
  }
  const addServer = (s: NoteServer) => {
    applyLinks(p => [...p, { type: 'server', label: s.name, serverId: s.id }])
    setShowSrvPick(false)
  }

  void existingFolders // legacy prop kept for backward-compat; new flow reads foldersStore

  // ── Scope badge ───────────────────────────────────────────────────────────
  const ScopeBadge = () => {
    if (serverLinks.length > 0)
      return <span className="rne-badge rne-badge--server">{serverLinks[0].label}</span>
    if (pathLinks.length > 0)
      return <span className="rne-badge rne-badge--path">{pathLinks[0].path}</span>
    return <span className="rne-badge rne-badge--global">{lang === 'uk' ? 'Глобальна' : 'Global'}</span>
  }

  const updatedLabel = note.updatedAt
    ? new Date(note.updatedAt).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })
    : null

  // OL counter per-block
  let olCounter = 0

  const closeAll = () => { setShowSlash(false); setShowLinksMgr(false) }

  return (
    <div className="rne" onClick={closeAll}>

      {/* ── Topbar ── */}
      <div className="rne-topbar" onClick={e => e.stopPropagation()}>
        <button className="rne-back" onClick={onClose}>
          ‹ {lang === 'uk' ? 'Нотатки' : 'Notes'}
        </button>
        <div className="rne-meta">
          <ScopeBadge />
          <span className="rne-meta-name">{titleView.trim() || (lang === 'uk' ? 'Без назви' : 'Untitled')}</span>
          <span className="rne-save-status" style={{ color: dirty ? 'var(--amber)' : 'var(--text3)' }}>
            {statusText}
          </span>
        </div>
        <div className="rne-actions">
          <button
            className="rne-action-btn rne-action-btn--icon"
            style={showLinksMgr ? { color: 'var(--accent)', borderColor: 'rgba(61,158,117,0.4)' } : {}}
            title={lang === 'uk' ? 'Зв\'язки' : 'Links'}
            aria-label={lang === 'uk' ? 'Зв\'язки' : 'Links'}
            onClick={e => { e.stopPropagation(); setShowLinksMgr(v => !v) }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          {!isNew && onDelete && (
            <button
              className="rne-action-btn rne-action-btn--icon rne-action-btn--danger"
              onClick={() => onDelete!(note.id)}
              title={lang === 'uk' ? 'Видалити' : 'Delete'}
              aria-label={lang === 'uk' ? 'Видалити' : 'Delete'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          )}
          {/* Save dropdown — opens a menu with: Save now / Save locally / Push to server.
              Replaces the old separate "Push" + "Save" buttons. */}
          <button
            className="rne-action-btn rne-action-btn--icon"
            onClick={e => {
              e.stopPropagation()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setSaveMenuPos({ x: r.right - 220, y: r.bottom + 4 })
            }}
            title={lang === 'uk' ? 'Зберегти' : 'Save'}
            aria-label={lang === 'uk' ? 'Зберегти' : 'Save'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Format bar ── */}
      <div className="rne-fmt-bar" onClick={e => e.stopPropagation()}>
        <button className="fmt-block-sel">
          <span>{lang === 'uk' ? 'Параграф' : 'Paragraph'}</span>
          <span className="rne-chev">▾</span>
        </button>
        <div className="fmt-sep" />
        <button className="fmt-btn" title="H1" onClick={() => applyBlockType('h1')}>H1</button>
        <button className="fmt-btn" title="H2" onClick={() => applyBlockType('h2')}>H2</button>
        <button className="fmt-btn" title="H3" onClick={() => applyBlockType('h3')}>H3</button>
        <div className="fmt-sep" />
        <button className="fmt-btn" title="Bullet list" onClick={() => applyBlockType('ul')}>• Список</button>
        <button className="fmt-btn" title="Numbered"    onClick={() => applyBlockType('ol')}>1. Список</button>
        <button className="fmt-btn" title="Quote"       onClick={() => applyBlockType('quote')}>" Цитата</button>
        <div className="fmt-sep" />
        <button className="fmt-btn rne-cmd-btn" title="Code/Command block"
          onClick={() => { if (focusedId) setBlocks(bs => bs.map(b => b.id === focusedId ? { ...b, type: 'code', lang: 'bash' } : b)) }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -1, marginRight: 4 }}>
            <polyline points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/>
          </svg>
          Команда
        </button>
        <button className="fmt-btn" title="Divider"
          onClick={() => { if (focusedId) addBlockAfter(focusedId, 'divider') }}>—</button>
        <button className="fmt-btn" title="Slash menu"
          onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setSlashPos({ x: r.left, y: r.bottom + 4 }); setShowSlash(true); setSlashFocus(0) }}>/</button>
        <div style={{ flex: 1 }} />
        <span className="rne-word-count">{wordCount} {lang === 'uk' ? 'сл.' : 'words'}</span>
      </div>

      {/* ── Links manager panel ── */}
      {showLinksMgr && (
        <div className="rne-links-mgr" onClick={e => e.stopPropagation()}>
          {/* Folder — read-only label. Folder changes happen from the sidebar
              (drag-drop or context menu "Move to:"). Showing a picker here
              duplicates that affordance and clutters the editor. */}
          <div className="rne-lmgr-section ne-folder-section">
            <span className="rne-lmgr-label">{lang === 'uk' ? 'Папка' : 'Folder'}</span>
            <div className="ne-folder-row">
              <span className="ne-folder-static">
                {currentFolderName || (lang === 'uk' ? 'Без папки' : 'No folder')}
              </span>
              <button
                type="button"
                className="ne-folder-action ne-folder-action--icon"
                onClick={() => { setShowFolderCreate(true); setShowFolderGrid(false) }}
                title={lang === 'uk' ? 'Створити нову папку' : 'Create new folder'}
                aria-label={lang === 'uk' ? 'Створити нову папку' : 'Create new folder'}
              >
                {/* Folder + small plus glyph — clearer than a bare "+" for "create folder". */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
              </button>
              <button
                type="button"
                className="ne-folder-action ne-folder-action--icon"
                onClick={() => { setShowFolderGrid(v => !v); setShowFolderCreate(false) }}
                title={lang === 'uk' ? 'Додати в існуючу папку' : 'Add to existing folder'}
                aria-label={lang === 'uk' ? 'Додати в існуючу папку' : 'Add to existing folder'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              {folderIdView && (
                <button
                  type="button"
                  className="ne-folder-action ne-folder-action--ghost"
                  onClick={() => { void applyFolderId(undefined) }}
                  title={lang === 'uk' ? 'Прибрати з папки' : 'Remove from folder'}
                >×</button>
              )}
            </div>
            {showFolderGrid && allFoldersList.length > 0 && (
              <div className="ne-folder-grid-wrap">
                <div className="ne-folder-grid">
                  {allFoldersList.map(f => (
                    <button
                      type="button"
                      key={f.id}
                      className={`ne-folder-cell${folderIdView === f.id ? ' ne-folder-cell--active' : ''}`}
                      onClick={() => void onPickFolder({ id: f.id, name: f.name })}
                      title={f.name}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="ne-folder-cell-name">{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showFolderGrid && allFoldersList.length === 0 && (
              <div className="ne-folder-empty">
                {lang === 'uk' ? 'Немає папок — створи першу' : 'No folders yet — create one'}
              </div>
            )}
            {showFolderCreate && (
              <div className="ne-folder-create">
                <input
                  autoFocus
                  className="ne-folder-create-input"
                  value={folderCreateName}
                  placeholder={lang === 'uk' ? 'Назва папки' : 'Folder name'}
                  onChange={e => setFolderCreateName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); void submitCreateFolder() }
                    if (e.key === 'Escape') { e.preventDefault(); setShowFolderCreate(false); setFolderCreateName('') }
                  }}
                  disabled={folderCreateBusy}
                />
                <button
                  type="button"
                  className="ne-folder-action"
                  disabled={folderCreateBusy || !folderCreateName.trim()}
                  onClick={() => void submitCreateFolder()}
                >{lang === 'uk' ? 'OK' : 'OK'}</button>
                <button
                  type="button"
                  className="ne-folder-action ne-folder-action--ghost"
                  onClick={() => { setShowFolderCreate(false); setFolderCreateName('') }}
                >{lang === 'uk' ? 'Скасувати' : 'Cancel'}</button>
              </div>
            )}
          </div>
          {/* Servers */}
          <div className="rne-lmgr-section">
            <span className="rne-lmgr-label">{lang === 'uk' ? 'Сервери' : 'Servers'}</span>
            <div className="ne-chips">
              {serverLinks.map((l, i) => (
                <span key={i} className="ne-chip ne-chip--server">{l.label}
                  <button className="ne-chip-del" onClick={() => removeLink(l)}>×</button></span>
              ))}
              <div className="ne-add-wrap">
                <button className="ne-add-btn" onClick={() => setShowSrvPick(v => !v)}>
                  + {lang === 'uk' ? 'Сервер' : 'Server'}
                </button>
                {showSrvPick && (
                  <ServerPicker servers={servers} added={serverLinks.map(l => l.serverId!)}
                    lang={lang} onAdd={addServer} onClose={() => setShowSrvPick(false)} />
                )}
              </div>
            </div>
          </div>
          {/* Paths */}
          <div className="rne-lmgr-section">
            <span className="rne-lmgr-label">{lang === 'uk' ? 'Директорії' : 'Paths'}</span>
            <div className="ne-chips">
              {pathLinks.map((l, i) => (
                <span key={i} className="ne-chip ne-chip--path">
                  <span className="ne-chip-prefix">{l.label.split(':')[0]}:</span>{l.path}
                  <button className="ne-chip-del" onClick={() => removeLink(l)}>×</button>
                </span>
              ))}
              {addingPath === 'path'
                ? <PathAdder type="path" servers={servers} lang={lang}
                    onAdd={lnk => { applyLinks(p => [...p, lnk]); setAddingPath(null) }}
                    onCancel={() => setAddingPath(null)} />
                : <button className="ne-add-btn" onClick={() => setAddingPath('path')}>
                    + {lang === 'uk' ? 'Шлях' : 'Path'}
                  </button>}
            </div>
          </div>
          {/* Files */}
          <div className="rne-lmgr-section">
            <span className="rne-lmgr-label">{lang === 'uk' ? 'Файли' : 'Files'}</span>
            <div className="ne-chips">
              {fileLinks.map((l, i) => (
                <span key={i} className="ne-chip ne-chip--file">
                  <span className="ne-chip-prefix">{l.label.split(':')[0]}:</span>{l.path}
                  <button className="ne-chip-del" onClick={() => removeLink(l)}>×</button>
                </span>
              ))}
              {addingPath === 'file'
                ? <PathAdder type="file" servers={servers} lang={lang}
                    onAdd={lnk => { applyLinks(p => [...p, lnk]); setAddingPath(null) }}
                    onCancel={() => setAddingPath(null)} />
                : <button className="ne-add-btn" onClick={() => setAddingPath('file')}>
                    + {lang === 'uk' ? 'Файл' : 'File'}
                  </button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Document scroll area ── */}
      <div className="rne-scroll" onClick={closeAll}>
        <div className="rne-doc" ref={docRef}>

          {/* File binding pill — surfaces the (server, path) the note is about
              right at the top so the user sees "what this note is for" at a
              glance instead of digging through Links manager. */}
          {(fileLinks[0] || pathLinks[0]) && (() => {
            const link = fileLinks[0] ?? pathLinks[0]
            const serverLabel = (servers.find(s => s.id === link.serverId)?.name)
              ?? link.label.split(':')[0]
            const filePath = link.path ?? link.label.split(':').slice(1).join(':')
            return (
              <div className="rne-binding-pill" onClick={e => e.stopPropagation()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="rne-binding-path" title={filePath}>{filePath}</span>
                <span className="rne-binding-at">@</span>
                <span className="rne-binding-server">{serverLabel}</span>
              </div>
            )
          })()}

          {/* Cover */}
          <div className="rne-cover">
            <div className="rne-cover-emoji">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
          </div>

          {/* Title */}
          <textarea
            ref={titleRef} rows={1}
            className="rne-title"
            value={titleView}
            placeholder={lang === 'uk' ? 'Заголовок…' : 'Title…'}
            onChange={e => applyTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setFocusedId(blocks[0]?.id ?? null) } }}
            onClick={e => e.stopPropagation()}
          />

          {/* Subtitle row */}
          <div className="rne-subtitle" onClick={e => e.stopPropagation()}>
            <ScopeBadge />
            {tags.map((t, i) => (
              <span
                key={i}
                className={`rne-tag-pill ${tagClassWithOverride(t.label, t.colorIndex)}`}
                onClick={e => { e.stopPropagation(); cycleTagColor(t.label) }}
                title={lang === 'uk' ? 'Натисни щоб змінити колір' : 'Click to change color'}
                style={{ cursor: 'pointer' }}
              >
                #{t.label}
                <button className="rne-tag-x" onClick={e => { e.stopPropagation(); removeLink(t) }}>×</button>
              </span>
            ))}
            <input className="rne-tag-input" value={newTag}
              placeholder={`+ ${lang === 'uk' ? 'тег' : 'tag'}`}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(newTag) }
                if (e.key === 'Backspace' && !newTag && tags.length > 0) removeLink(tags[tags.length - 1])
              }}
              onBlur={() => { if (newTag.trim()) addTag(newTag) }} />
            {updatedLabel && (
              <span className="rne-subtitle-right">
                {lang === 'uk' ? 'Оновлено' : 'Updated'} {updatedLabel} · AES-256
              </span>
            )}
          </div>

          {/* Linked servers/paths chip row */}
          {hasLinks && (
            <div className="rne-links-row">
              {serverLinks.map((l, i) => (
                <span key={i} className="rne-link-chip rne-link-chip--server">
                  {l.label}<button onClick={() => removeLink(l)}>×</button>
                </span>
              ))}
              {pathLinks.map((l, i) => (
                <span key={i} className="rne-link-chip rne-link-chip--path">
                  {l.path}<button onClick={() => removeLink(l)}>×</button>
                </span>
              ))}
              {fileLinks.map((l, i) => (
                <span key={i} className="rne-link-chip rne-link-chip--file">
                  {l.path}<button onClick={() => removeLink(l)}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* ── Content blocks ── */}
          <div className="rne-blocks" onClick={e => e.stopPropagation()}>
            {blocks.map(block => {
              if (block.type === 'ol') olCounter++
              else olCounter = 0
              return (
                <BlockRow
                  key={block.id}
                  block={block}
                  isActive={focusedId === block.id}
                  olIndex={olCounter}
                  onFocus={() => setFocusedId(block.id)}
                  onChange={updateBlock}
                  onKeyDown={handleBlockKeyDown}
                  onRunInsert={(cmd, action) => {
                    // future: pipe to terminal
                    console.log(action, cmd)
                  }}
                />
              )
            })}

            {/* New block trigger zone */}
            <div className="rne-new-block-area"
              onClick={() => {
                const last = blocks[blocks.length - 1]
                if (last?.text === '' && last?.type === 'p') {
                  setFocusedId(last.id)
                } else {
                  addBlockAfter(blocks[blocks.length - 1]?.id ?? '', 'p')
                }
              }}>
            </div>
          </div>

          {/* Trailing hint — very bottom of page */}
          <div className="rne-trailing-hint">
            {lang === 'uk'
              ? 'Натисни тут або / в порожньому рядку для вставки блоку'
              : 'Click here or type / in an empty block to insert'}
          </div>
        </div>
      </div>

      {/* ── Slash menu ── */}
      {showSlash && (
        <div className="slash-menu" style={{ top: slashPos.y, left: slashPos.x }}
          onClick={e => e.stopPropagation()}>
          <div className="slash-section">{lang === 'uk' ? 'Блоки' : 'Blocks'}</div>
          {SLASH_BLOCKS.map((item, i) => (
            <div key={i}
              className={`slash-item ${slashFocus === i ? 'focused' : ''}`}
              onMouseEnter={() => setSlashFocus(i)}
              onClick={() => focusedId && insertSlashBlock(focusedId, item)}>
              <div className="slash-item-icon">{item.icon}</div>
              <div className="slash-item-info">
                <div className="slash-item-name">{item.name}</div>
                <div className="slash-item-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Save action menu (dropdown anchored to the Save button) ── */}
      {saveMenuPos && (() => {
        const items: (ContextMenuItem | null)[] = [
          {
            label: lang === 'uk' ? 'Запам\'ятати зараз' : 'Save now',
            icon: (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>),
            onClick: () => handleSave(),
          },
          {
            label: lang === 'uk' ? 'Зберегти локально (.md)' : 'Save locally (.md)',
            icon: (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>),
            disabled: !onSaveLocal,
            onClick: () => { void handleSaveLocal() },
          },
          null,
          {
            label: connectedServers.length > 0
              ? (lang === 'uk' ? 'Завантажити на сервер…' : 'Push to server…')
              : (lang === 'uk' ? 'Завантажити на сервер (немає підключень)' : 'Push to server (no connections)'),
            icon: (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>),
            disabled: !onPushToServer || connectedServers.length === 0,
            onClick: () => { openPushDialog() },
          },
        ]
        return (
          <ContextMenu
            open={true}
            x={saveMenuPos.x}
            y={saveMenuPos.y}
            items={items}
            onClose={() => setSaveMenuPos(null)}
          />
        )
      })()}

      {/* ── Push-as-docs dialog ── */}
      {showPush && (
        <div className="rne-push-backdrop" onClick={() => !pushBusy && setShowPush(false)}>
          <div className="rne-push-modal" onClick={e => e.stopPropagation()}>
            <div className="rne-push-title">
              {lang === 'uk' ? 'Завантажити нотатку на сервер' : 'Push note to server'}
            </div>
            <label className="rne-push-label">
              {lang === 'uk' ? 'Сервер' : 'Server'}
              <select
                className="rne-push-input"
                value={pushTargetServer}
                onChange={e => setPushTargetServer(e.target.value)}
                disabled={pushBusy}
              >
                {connectedServers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="rne-push-label">
              {lang === 'uk' ? 'Шлях на сервері' : 'Remote path'}
              <input
                className="rne-push-input"
                value={pushPath}
                onChange={e => setPushPath(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); void submitPush() }
                  if (e.key === 'Escape') { e.preventDefault(); if (!pushBusy) setShowPush(false) }
                }}
                placeholder="/home/user/senu/documentations/note.md"
                disabled={pushBusy}
              />
            </label>
            {pushError && <div className="rne-push-error">⚠ {pushError}</div>}
            {pushDone && (
              <div className="rne-push-success">
                {lang === 'uk' ? '✓ Завантажено' : '✓ Pushed'}
              </div>
            )}
            <div className="rne-push-actions">
              <button
                className="rne-action-btn"
                onClick={() => setShowPush(false)}
                disabled={pushBusy}
              >
                {lang === 'uk' ? 'Скасувати' : 'Cancel'}
              </button>
              <button
                className="rne-action-btn rne-action-btn--primary"
                onClick={() => void submitPush()}
                disabled={pushBusy || !pushTargetServer || !pushPath.trim()}
              >
                {pushBusy
                  ? (lang === 'uk' ? 'Завантажую…' : 'Pushing…')
                  : (lang === 'uk' ? 'Завантажити' : 'Push')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
