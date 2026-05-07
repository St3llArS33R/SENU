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

import React, { useState, useEffect, useRef } from 'react'
import { useLanguage } from './i18n'
import { Ico } from './icons'
import type { Note, NoteLink, Folder } from './types'
import { notesStore, useNote, useNotes } from './stores/notesStore'
import { createAutoSaver } from './stores/autoSave'
import { foldersStore, useFolders } from './stores/foldersStore'
import { FolderTree } from './notes/FolderTree'
import { tagClassWithOverride, resolveTagColor, nextTagColor } from './notes/tagColor'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'

const nt = window.nextterm

interface NotesPanelProps {
  serverId: string | null
  serverName?: string | null
  serverHost?: string | null
  activeServerName?: string | null
  activeServerHost?: string | null
  activeServerConnected?: boolean
  servers?: { id: string; name: string; host: string }[]
  visible: boolean
  /** Id of the note currently open in the fullscreen NoteEditor overlay, or null.
   *  Used to enforce mutual exclusion: while a note is fullscreen, the sidebar
   *  inline editor must not also display that same note. */
  fullscreenNoteId?: string | null
  /** External trigger from SFTP "Create note" — materializes a draft pre-bound
   *  to the given file/server and opens the expand popup. Cleared via
   *  onPendingNoteConsumed once handled. */
  pendingNoteFromFile?: {
    serverId: string
    serverName: string
    host: string
    path: string
    fileName: string
  } | null
  onPendingNoteConsumed?: () => void
  onConfirm: (msg: string) => Promise<boolean>
  onOpenEditor: (note: Note, save: (n: Note) => Promise<void>, del: (id: string) => void, folders: string[]) => void
}

export function NotesPanel({
  visible, servers = [], onConfirm, onOpenEditor,
  activeServerName = null, activeServerConnected = false,
  fullscreenNoteId = null,
  pendingNoteFromFile = null, onPendingNoteConsumed,
}: NotesPanelProps) {
  const { t, lang } = useLanguage()
  const uk = lang === 'uk'

  // ── Core note state ──────────────────────────────────────────────────────
  // The notes list is read live from notesStore so any in-flight edit (sidebar,
  // expand popup, fullscreen) updates the sidebar list immediately — even
  // before the user hits Save.
  const notes                           = useNotes()
  const [mode, setMode]                 = useState<'list' | 'edit'>('list')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [search, setSearch]             = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Mutual exclusion: drop sidebar inline editor if fullscreen takes the same note
  useEffect(() => {
    if (fullscreenNoteId && selectedNote?.id === fullscreenNoteId) {
      setMode('list')
      setSelectedNote(null)
    }
  }, [fullscreenNoteId, selectedNote?.id])

  // ── Quick note (inline) state ────────────────────────────────────────────
  const [showQuick, setShowQuick]   = useState(false)
  const [quickText, setQuickText]   = useState('')
  const [quickFolderId, setQuickFolderId] = useState<string | undefined>(undefined)
  const [showQuickFolderPicker, setShowQuickFolderPicker] = useState(false)
  const quickRef = useRef<HTMLTextAreaElement>(null)

  // ── Edit mode state ──────────────────────────────────────────────────────
  // Persisted fields (title/content/tags/servers/paths) live in the shared
  // notesStore — see editView/applyX below. Only the small input buffers and
  // the transient "saved!" flash remain as local state.
  const [editNewTag,  setEditNewTag]  = useState('')
  const [editNewPath, setEditNewPath] = useState('')
  const [editSaved,   setEditSaved]   = useState(false)

  // Single source of truth: subscribe to the store entry for the selected note.
  // Falls back to the click-source note for the very first render frame.
  const storeNote = useNote(selectedNote?.id ?? null)

  // ── Expand popup state ───────────────────────────────────────────────────
  // The popup edits the note identified by `expandNoteId`. For new (unsaved)
  // notes we materialize a draft entry in notesStore upfront so the popup is
  // store-driven; `expandIsNewRef` flags it so Cancel can clean it up.
  const [showExpand,   setShowExpand]   = useState(false)
  const [expandNewTag, setExpandNewTag] = useState('')
  const [expandNoteId, setExpandNoteId] = useState<string | null>(null)
  const expandIsNewRef = useRef(false)

  // ── Folders view state ───────────────────────────────────────────────────
  // The list panel toggles between two organizing schemes: the existing
  // server-aware "now / this server / global" sections, and a user-built
  // folder tree. Choice persists across sessions via localStorage.
  const folders = useFolders()
  const [view, setView] = useState<'sections' | 'folders'>(() => {
    try { return (localStorage.getItem('notes:view') as 'sections' | 'folders') || 'sections' }
    catch { return 'sections' }
  })
  useEffect(() => {
    try { localStorage.setItem('notes:view', view) } catch { /* private mode */ }
  }, [view])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const toggleFolderExpand = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // Manual sibling order — list of folder ids the user has nudged with
  // Move up / Move down. Persisted in localStorage; folders not in the list
  // fall back to createdAt desc.
  const [folderOrder, setFolderOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('folders:order') || '[]') }
    catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('folders:order', JSON.stringify(folderOrder)) }
    catch { /* private mode */ }
  }, [folderOrder])
  // Inline rename / new-folder buffer — when set, the row at `forFolderId`
  // (or `null` for new-at-root) renders an input instead of a label.
  const [folderEdit, setFolderEdit] = useState<
    | { kind: 'rename'; id: string; name: string }
    | { kind: 'create'; parentId: string | undefined; name: string }
    | null
  >(null)
  // Right-click menu context. `target` distinguishes which item set to show.
  type CtxTarget =
    | { kind: 'folder'; folder: Folder }
    | { kind: 'note';   note: Note }
    | { kind: 'root' }
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: CtxTarget } | null>(null)

  const STORAGE_ID = '__global__'

  useEffect(() => {
    nt?.getNotes(STORAGE_ID)
      .then((n: Note[]) => { notesStore.setAll(n || []) })
      .catch(() => { notesStore.setAll([]) })
    nt?.getFolders?.()
      .then((f: Folder[]) => { foldersStore.setAll(f || []) })
      .catch(() => { foldersStore.setAll([]) })
  }, [])
  useEffect(() => {
    if (showQuick) setTimeout(() => quickRef.current?.focus(), 50)
  }, [showQuick])

  // ── Auto-save ────────────────────────────────────────────────────────────
  // Watches notesStore for dirty entries and persists each one 1s after the
  // last patchDraft (per-id debounce). On unmount we flush whatever is still
  // dirty so closing the Notes panel mid-edit doesn't drop the in-flight
  // change. Empty placeholder notes (created by openExpand but never typed
  // into) are skipped via the `skipEmpty` default.
  useEffect(() => {
    const saver = createAutoSaver(
      notesStore,
      async (note) => { await nt?.saveNote(STORAGE_ID, note) },
      { debounceMs: 1000 },
    )
    return () => {
      void saver.flushAll().finally(() => saver.stop())
    }
  }, [])

  // ── Backend helpers ──────────────────────────────────────────────────────
  const persistNote = async (note: Note) => {
    try { await nt?.saveNote(STORAGE_ID, note) } catch (e) { console.error('saveNote failed:', e) }
  }
  const saveNote = async (note: Note) => {
    const updated = { ...note, updatedAt: new Date().toISOString() }
    await persistNote(updated)
    notesStore.upsert(updated) // clears dirty + notifies sidebar list
    if (selectedNote?.id === updated.id) setSelectedNote(updated)
  }
  const delNote = async (id: string) => {
    const note = notes.find(n => n.id === id)
    const ok = await onConfirm(uk ? `Видалити нотатку "${note?.title ?? ''}"?` : `Delete note "${note?.title ?? ''}"?`)
    if (!ok) return
    try { await nt?.deleteNote(STORAGE_ID, id) } catch (e) { console.error('deleteNote failed:', e) }
    notesStore.remove(id)
    if (selectedNote?.id === id) setMode('list')
  }
  const exportMarkdown = async () => {
    if (notes.length === 0) return
    const md = notes.map(n => `# ${n.title}\n\n${n.content || '_Empty_'}`).join('\n\n---\n\n')
    await nt?.saveMarkdown('notes_global.md', md)
  }

  // ── Folder CRUD ──────────────────────────────────────────────────────────
  const persistFolder = async (folder: Folder) => {
    try { await nt?.saveFolder?.(folder) } catch (e) { console.error('saveFolder failed:', e) }
  }
  const saveFolderEntity = async (folder: Folder) => {
    await persistFolder(folder)
    foldersStore.upsert(folder)
  }
  const delFolder = async (id: string) => {
    const f = foldersStore.getOne(id)
    if (!f) return
    const ok = await onConfirm(uk
      ? `Видалити папку «${f.name}»? Нотатки залишаться без папки.`
      : `Delete folder "${f.name}"? Notes will become unfiled.`)
    if (!ok) return
    // Detach all notes pointing to this folder before removing the folder.
    for (const n of notesStore.getAll()) {
      if (n.folderId === id) notesStore.patchDraft(n.id, { folderId: undefined })
    }
    try { await nt?.deleteFolder?.(id) } catch (e) { console.error('deleteFolder failed:', e) }
    foldersStore.remove(id)
  }
  const moveNoteToFolder = (noteId: string, folderId: string | undefined) => {
    notesStore.patchDraft(noteId, { folderId })
    // Auto-save will pick this up via dirty tracking.
  }
  const moveFolderToParent = async (folderId: string, parentId: string | undefined) => {
    if (folderId === parentId) return
    // Cycle prevention: walk up parentId chain, ensure folderId isn't an ancestor.
    let cur = parentId
    while (cur) {
      if (cur === folderId) return // would create a cycle
      cur = foldersStore.getOne(cur)?.parentFolderId
    }
    const f = foldersStore.getOne(folderId)
    if (!f) return
    await saveFolderEntity({ ...f, parentFolderId: parentId })
  }
  /** Reorder a folder up or down within its siblings (same parent). */
  const moveFolderInSiblings = (folderId: string, direction: -1 | 1) => {
    const f = foldersStore.getOne(folderId)
    if (!f) return
    const siblings = foldersStore.getAll().filter(x => (x.parentFolderId ?? undefined) === (f.parentFolderId ?? undefined))
    // Build current visual order: any pre-existing entries from folderOrder (in
    // their listed order) then the rest by createdAt desc — same logic as the
    // tree's sort, just realized eagerly here so we can rotate the array.
    const inOrder: string[] = []
    for (const id of folderOrder) if (siblings.some(s => s.id === id)) inOrder.push(id)
    const remaining = siblings
      .filter(s => !inOrder.includes(s.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(s => s.id)
    const ordered = [...inOrder, ...remaining]
    const idx = ordered.indexOf(folderId)
    const target = idx + direction
    if (idx < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[idx], ordered[target]] = [ordered[target], ordered[idx]]
    // Merge back into the global folderOrder: replace any prior entries from
    // this sibling group, keep ordering for unrelated folders untouched.
    setFolderOrder(prev => {
      const others = prev.filter(id => !siblings.some(s => s.id === id))
      return [...others, ...ordered]
    })
  }
  /** Spawn a fresh note pre-filed under `folderId` and immediately open it. */
  const createNoteInFolder = (folderId: string | undefined) => {
    const id = Date.now().toString()
    const now = new Date().toISOString()
    const draft: Note = {
      id,
      title: '',
      content: '',
      updatedAt: '',
      createdAt: now,
      folderId,
      links: [],
    }
    notesStore.upsert(draft)
    // Pop straight into the popup so the user starts typing without the click
    // dance through sidebar selection.
    expandIsNewRef.current = true
    setExpandNoteId(id)
    setExpandNewTag('')
    setShowExpand(true)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getAutoTitle = (text: string) => {
    const first = text.trim().split('\n')[0].replace(/^#+\s*/, '').trim()
    return first.slice(0, 60) || (uk ? 'Нотатка' : 'Note')
  }


  // Render-source for the sidebar inline editor: shared store entry, falling
  // back to the click-source note for the very first frame before subscription
  // settles.
  const editView = storeNote ?? selectedNote
  const linksOf = (n: Note | null | undefined) => n?.links ?? []
  const editTitleView   = editView?.title   ?? ''
  const editContentView = editView?.content ?? ''
  // Tag links carry the optional colorIndex override (NoteLink.colorIndex).
  // Render iterates the link objects directly so we preserve override per tag.
  const editTagLinks    = linksOf(editView).filter(l => l.type === 'tag')
  const editTagsView    = editTagLinks.map(l => l.label)
  const editServersView = linksOf(editView).filter(l => l.type === 'server').map(l => l.label)
  const editPathsView   = linksOf(editView).filter(l => l.type === 'path').map(l => l.label)

  // Wrappers that patch the store. Each reads the store's current value to
  // avoid stale-closure problems when computing list updates.
  const applyTitle = (t: string) => {
    if (selectedNote) notesStore.patchDraft(selectedNote.id, { title: t })
  }
  const applyContent = (c: string) => {
    if (selectedNote) notesStore.patchDraft(selectedNote.id, { content: c })
  }
  const applyLinkSet = (kind: 'tag'|'server'|'path', next: string[] | ((prev: string[]) => string[])) => {
    if (!selectedNote) return
    const cur = notesStore.getDraft(selectedNote.id)
    const curOfKind = (cur?.links ?? []).filter(l => l.type === kind).map(l => l.label)
    const computed = typeof next === 'function' ? next(curOfKind) : next
    const others = (cur?.links ?? []).filter(l => l.type !== kind)
    const newLinks: NoteLink[] = [
      ...others,
      ...computed.map(label => ({ type: kind as 'tag'|'server'|'path', label })),
    ]
    notesStore.patchDraft(selectedNote.id, { links: newLinks })
  }
  const applyTags    = (next: string[] | ((prev: string[]) => string[])) => applyLinkSet('tag', next)
  const applyServers = (next: string[] | ((prev: string[]) => string[])) => applyLinkSet('server', next)
  const applyPaths   = (next: string[] | ((prev: string[]) => string[])) => applyLinkSet('path', next)

  // ── Expand popup: store-driven render + writers ──────────────────────────
  const expandView = useNote(expandNoteId)
  const expandTitleView = expandView?.title   ?? ''
  const expandTextView  = expandView?.content ?? ''
  const expandTagLinks  = (expandView?.links ?? []).filter(l => l.type === 'tag')
  const expandTagsView  = expandTagLinks.map(l => l.label)

  /** Cycle the color of a single tag (by label) on the given note id. */
  const cycleTagColor = (noteId: string, label: string) => {
    const cur = notesStore.getDraft(noteId)
    if (!cur) return
    const newLinks = (cur.links ?? []).map(l => {
      if (l.type !== 'tag' || l.label !== label) return l
      return { ...l, colorIndex: nextTagColor(resolveTagColor(label, l.colorIndex)) }
    })
    notesStore.patchDraft(noteId, { links: newLinks })
  }

  const applyExpandTitle = (t: string) => {
    if (expandNoteId) notesStore.patchDraft(expandNoteId, { title: t })
  }
  const applyExpandText = (c: string) => {
    if (expandNoteId) notesStore.patchDraft(expandNoteId, { content: c })
  }
  const applyExpandTags = (next: string[] | ((prev: string[]) => string[])) => {
    if (!expandNoteId) return
    const cur = notesStore.getDraft(expandNoteId)
    const curTags = (cur?.links ?? []).filter(l => l.type === 'tag').map(l => l.label)
    const computed = typeof next === 'function' ? next(curTags) : next
    const others = (cur?.links ?? []).filter(l => l.type !== 'tag')
    const newLinks: NoteLink[] = [
      ...others,
      ...computed.map(label => ({ type: 'tag' as const, label })),
    ]
    notesStore.patchDraft(expandNoteId, { links: newLinks })
  }

  // Closes the popup. If the popup was editing a never-saved new draft, the
  // placeholder is dropped from the store so the list doesn't keep ghosts.
  // Auto-save may have already persisted the placeholder to disk if the user
  // typed for >1s before clicking Cancel — call deleteNote defensively so the
  // disk doesn't keep a ghost either. The bridge is no-op for unknown ids.
  const closeExpand = () => {
    if (expandIsNewRef.current && expandNoteId) {
      const id = expandNoteId
      notesStore.remove(id)
      void nt?.deleteNote(STORAGE_ID, id).catch(() => {/* idempotent */})
    }
    expandIsNewRef.current = false
    setShowExpand(false)
    setExpandNoteId(null)
    setExpandNewTag('')
  }

  // ── Edit mode helpers ────────────────────────────────────────────────────
  // No state seeding needed — the store already holds the note (populated by
  // setAll on disk-load). Resets the transient UI buffers only.
  const initEdit = () => {
    setEditNewTag('')
    setEditNewPath('')
    setEditSaved(false)
  }

  // Reads the live draft from the store rather than from a closed-over copy
  // so saves never overwrite a newer in-flight edit from another surface.
  const saveEdit = async () => {
    if (!selectedNote) return
    const draft = notesStore.getDraft(selectedNote.id) ?? selectedNote
    await saveNote({
      ...draft,
      title: (draft.title ?? '').trim() || (uk ? 'Нотатка' : 'Note'),
    })
    setEditSaved(true)
    setTimeout(() => setEditSaved(false), 1800)
  }

  const openExpandFromEdit = () => {
    if (!selectedNote) return
    // Existing note: store already has the draft. Just attach the popup to it.
    expandIsNewRef.current = false
    setExpandNoteId(selectedNote.id)
    setExpandNewTag('')
    setShowExpand(true)
  }

  const openDocumentFromEdit = () => {
    if (!selectedNote) return
    const draft = notesStore.getDraft(selectedNote.id) ?? selectedNote
    onOpenEditor(draft, saveNote, delNote, allFolders)
    // Mutual exclusion: while the note is open fullscreen, the sidebar reverts
    // to the list view so the same note isn't being edited in two places.
    setMode('list')
    setSelectedNote(null)
  }

  // ── Quick note helpers ───────────────────────────────────────────────────
  const resetQuick = () => {
    setQuickText(''); setShowQuick(false); setQuickFolderId(undefined); setShowQuickFolderPicker(false)
  }
  const saveQuickNote = async (text = quickText) => {
    if (!text.trim()) { resetQuick(); return }
    await saveNote({
      id: Date.now().toString(),
      title: getAutoTitle(text),
      content: text,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      folderId: quickFolderId,
      links: [],
    })
    resetQuick()
  }

  const openExpand = (text = quickText) => {
    // New note: materialize a placeholder draft in the store so the popup can
    // be store-driven from frame one. The placeholder is removed by Cancel.
    const id = Date.now().toString()
    const now = new Date().toISOString()
    notesStore.upsert({
      id,
      title: getAutoTitle(text),
      content: text,
      updatedAt: '',
      createdAt: now,
      folderId: quickFolderId,
      links: [],
    })
    expandIsNewRef.current = true
    setExpandNoteId(id)
    setExpandNewTag('')
    setShowExpand(true)
  }

  // ── External: SFTP "Create note from file" ──────────────────────────────
  // Triggered from the SFTP browser context menu. Materializes a draft note
  // already linked to (server, file path), opens the expand popup so the user
  // can immediately write the body, then signals the parent that the request
  // was consumed.
  useEffect(() => {
    if (!pendingNoteFromFile) return
    const { serverId: srvId, serverName, path, fileName } = pendingNoteFromFile
    const id = Date.now().toString()
    const now = new Date().toISOString()
    notesStore.upsert({
      id,
      title: fileName,
      content: '',
      updatedAt: '',
      createdAt: now,
      links: [
        { type: 'server', label: serverName, serverId: srvId },
        { type: 'file',   label: `${serverName}:${path}`, serverId: srvId, path },
      ],
    })
    expandIsNewRef.current = true
    setExpandNoteId(id)
    setExpandNewTag('')
    setShowExpand(true)
    onPendingNoteConsumed?.()
  }, [pendingNoteFromFile, onPendingNoteConsumed])

  const saveExpandNote = async () => {
    if (!expandNoteId) { closeExpand(); return }
    const draft = notesStore.getDraft(expandNoteId)
    if (!draft) { closeExpand(); return }
    if (!(draft.content ?? '').trim() && !(draft.title ?? '').trim()) { closeExpand(); return }
    const wasNew = expandIsNewRef.current
    await saveNote({
      ...draft,
      title: (draft.title ?? '').trim() || getAutoTitle(draft.content ?? ''),
    })
    expandIsNewRef.current = false
    setShowExpand(false)
    setExpandNoteId(null)
    setExpandNewTag('')
    if (wasNew) { setShowQuick(false); setQuickText('') }
  }

  const openEditorNew = (text?: string, title?: string) => {
    let draft: Note | undefined
    if (expandNoteId) {
      draft = notesStore.getDraft(expandNoteId)
    } else if (text !== undefined) {
      const now = new Date().toISOString()
      draft = {
        id: Date.now().toString(),
        title: title ?? getAutoTitle(text),
        content: text,
        updatedAt: '',
        createdAt: now,
        folderId: quickFolderId,
        links: [],
      }
    }
    if (!draft) return
    // Materialize the draft in notesStore BEFORE opening the editor. Without
    // this, the fullscreen NoteEditor's patchDraft calls silently no-op
    // (patchDraft requires the entry to already exist) and tag/folder/links
    // edits appear to "disappear" the moment the user presses Enter.
    notesStore.upsert(draft)
    onOpenEditor(draft, saveNote, delNote, allFolders)
    expandIsNewRef.current = false
    setShowExpand(false)
    setExpandNoteId(null)
    setExpandNewTag('')
    setShowQuick(false)
    setQuickText('')
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const allFolders = Array.from(new Set(notes.map(n => n.folder).filter(Boolean) as string[])).sort()

  const matchesQuery = (n: Note) =>
    !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)

  const noteHasServer = (n: Note, srv: string) =>
    (n.links ?? []).some(l => l.type === 'server' && l.label === srv)
  const noteServerLinks = (n: Note) =>
    (n.links ?? []).filter(l => l.type === 'server')
  const notePathLinks = (n: Note) =>
    (n.links ?? []).filter(l => l.type === 'path')

  // Section classification:
  //   nowHere     — linked to current server, OR untagged-by-server (truly global)
  //   thisServer  — linked to current server (kept separate when also has paths,
  //                 but we group simply: nowHere = current-server-linked + globals,
  //                 thisServer empty when no current server). To match the screenshot
  //                 we split: nowHere = matches current server; global = no server links.
  //   globalSec   — no server links at all (and not in nowHere)
  const visibleNotes = notes.filter(matchesQuery)

  type Section = 'now' | 'srv' | 'global'
  const classify = (n: Note): Section => {
    const srvLinks = noteServerLinks(n)
    const pathLinks = notePathLinks(n)
    const onCurrentSrv = !!activeServerName && noteHasServer(n, activeServerName)

    // "Зараз тут" — context-specific to current location:
    //   • current server + has a path scope (path-attached reminder)
    //   • no server link but has a path scope (path applies anywhere)
    if (onCurrentSrv && pathLinks.length > 0) return 'now'
    if (srvLinks.length === 0 && pathLinks.length > 0) return 'now'

    // "Цей сервер" — current server, no path scope (general server notes)
    if (onCurrentSrv) return 'srv'

    // "Глобальні" — no server, no path (or linked to some other server)
    return 'global'
  }

  const grouped: Record<Section, Note[]> = { now: [], srv: [], global: [] }
  for (const n of visibleNotes) grouped[classify(n)].push(n)
  // If no active server, fold "srv" into "global" so they aren't lost.
  if (!activeServerName) {
    grouped.global = [...grouped.srv, ...grouped.global]
    grouped.srv = []
  }

  // ── NoteItem ─────────────────────────────────────────────────────────────
  function NoteItem({ note }: { note: Note }) {
    const hasPath   = (note.links ?? []).some(l => l.type === 'path')
    const hasServer = (note.links ?? []).some(l => l.type === 'server')
    // Single primary badge: path > server > global
    const badge: 'path' | 'server' | 'global' =
      hasPath ? 'path' : hasServer ? 'server' : 'global'
    const badgeLabel = badge === 'path'   ? (uk ? 'шлях'   : 'path')
                     : badge === 'server' ? (uk ? 'сервер' : 'server')
                     : (uk ? 'інше' : 'other')
    return (
      <div
        className={`np-note-item${selectedNote?.id === note.id && mode === 'edit' ? ' np-note-item--active' : ''}${fullscreenNoteId === note.id ? ' np-note-item--fullscreen' : ''}`}
        onClick={() => {
          // Mutual exclusion: if this note is currently in the fullscreen
          // editor, do nothing — the user is already editing it there.
          if (fullscreenNoteId === note.id) return
          setSelectedNote(note); initEdit(); setMode('edit')
        }}
      >
        <div className="np-note-row">
          <span className="np-note-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </span>
          <span className="np-note-title">{note.title || (uk ? 'Без назви' : 'Untitled')}</span>
          <span className={`np-note-badge np-badge-${badge}`}>{badgeLabel}</span>
        </div>
      </div>
    )
  }

  // ── EDIT MODE (inline) ────────────────────────────────────────────────────
  if (mode === 'edit' && selectedNote) {
    return (
      <div className={`notes-panel${visible ? '' : ' notes-panel--collapsed'}`}>

        {/* Expand popup */}
        {showExpand && (
          <div className="np-expand-backdrop" onClick={e => { if (e.target === e.currentTarget) closeExpand() }}>
            <div className="np-expand-popup">
              <div className="np-expand-header">
                <input className="np-expand-title-input" value={expandTitleView} onChange={e => applyExpandTitle(e.target.value)}
                  placeholder={uk ? 'Заголовок…' : 'Title…'} autoFocus />
                <button className="np-expand-x" onClick={closeExpand}>×</button>
              </div>
              <textarea className="np-expand-text" value={expandTextView} onChange={e => applyExpandText(e.target.value)} rows={8}
                placeholder={uk ? 'Починай писати…' : 'Start writing…'}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void saveExpandNote() } }} />
              <div className="np-expand-tags-row">
                {expandTagLinks.map((link, i) => (
                  <span
                    key={i}
                    className={`np-expand-chip ${tagClassWithOverride(link.label, link.colorIndex)}`}
                    onClick={e => { e.stopPropagation(); if (expandNoteId) cycleTagColor(expandNoteId, link.label) }}
                    title={uk ? 'Натисни щоб змінити колір' : 'Click to change color'}
                    style={{ cursor: 'pointer' }}
                  >
                    #{link.label}
                    <button onClick={e => { e.stopPropagation(); applyExpandTags(t => t.filter((_, j) => j !== i)) }}>×</button>
                  </span>
                ))}
                <input className="np-expand-taginput" value={expandNewTag} placeholder={uk ? '+ тег' : '+ tag'}
                  onChange={e => setExpandNewTag(e.target.value)}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && expandNewTag.trim()) { e.preventDefault(); const tg = expandNewTag.trim().replace(/^#/,''); if (!expandTagsView.includes(tg)) applyExpandTags(p=>[...p,tg]); setExpandNewTag('') }}} />
              </div>
              <div className="np-expand-footer">
                <button className="np-exp-btn np-exp-cancel" onClick={closeExpand}>{uk ? 'Скасувати' : 'Cancel'}</button>
                <div style={{ flex: 1 }} />
                <button className="np-exp-btn np-exp-doc" onClick={() => openEditorNew()}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {uk ? 'Документ' : 'Document'}
                </button>
                <button className="np-exp-btn np-exp-save" onClick={saveExpandNote}>{uk ? 'Зберегти' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="np-view-header">
          <button className="np-back-btn" onClick={async () => { await saveEdit(); setMode('list') }} title={uk ? 'Зберегти і назад' : 'Save & back'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <input
            className="np-edit-title-input"
            value={editTitleView}
            onChange={e => applyTitle(e.target.value)}
            placeholder={uk ? 'Заголовок…' : 'Title…'}
          />
          <div className="np-view-acts">
            <button className="ph-btn" title={uk ? 'Розгорнути' : 'Expand'} onClick={openExpandFromEdit}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            </button>
            <button className="ph-btn" title={uk ? 'Відкрити документ' : 'Open document'} onClick={openDocumentFromEdit}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </button>
            <button className="ph-btn ph-btn--danger" title={uk ? 'Видалити' : 'Delete'} onClick={() => delNote(selectedNote.id)}>
              {Ico.trash(12)}
            </button>
          </div>
        </div>

        {/* Content textarea */}
        <textarea
          className="np-edit-content"
          value={editContentView}
          onChange={e => applyContent(e.target.value)}
          placeholder={uk ? 'Починай писати…' : 'Start writing…'}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void saveEdit() } }}
        />

        {/* Metadata: tags, servers, paths */}
        <div className="np-edit-meta">

          {/* Tags */}
          <div className="np-edit-meta-row">
            <span className="np-edit-meta-label">#</span>
            {editTagLinks.map((link, i) => (
              <span
                key={i}
                className={`np-expand-chip ${tagClassWithOverride(link.label, link.colorIndex)}`}
                onClick={e => { e.stopPropagation(); if (selectedNote) cycleTagColor(selectedNote.id, link.label) }}
                title={uk ? 'Натисни щоб змінити колір' : 'Click to change color'}
                style={{ cursor: 'pointer' }}
              >#{link.label}
                <button onClick={e => { e.stopPropagation(); applyTags(p => p.filter((_, j) => j !== i)) }}>×</button>
              </span>
            ))}
            <input className="np-expand-taginput" value={editNewTag} placeholder={uk ? '+ тег' : '+ tag'}
              onChange={e => setEditNewTag(e.target.value)}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && editNewTag.trim()) { e.preventDefault(); const tg = editNewTag.trim().replace(/^#/,''); if (!editTagsView.includes(tg)) applyTags(p=>[...p,tg]); setEditNewTag('') }}} />
          </div>

          {/* Servers */}
          {servers.length > 0 && (
            <div className="np-edit-meta-row">
              <span className="np-edit-meta-label">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
              </span>
              {editServersView.map((srv, i) => (
                <span key={i} className="np-expand-chip np-expand-chip--server">{srv}
                  <button onClick={() => applyServers(p => p.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
              <select className="np-edit-srv-select"
                value=""
                onChange={e => { if (e.target.value && !editServersView.includes(e.target.value)) applyServers(p => [...p, e.target.value]) }}>
                <option value="">{uk ? '+ сервер' : '+ server'}</option>
                {servers.filter(s => !editServersView.includes(s.name)).map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Paths */}
          <div className="np-edit-meta-row">
            <span className="np-edit-meta-label">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </span>
            {editPathsView.map((p, i) => (
              <span key={i} className="np-expand-chip np-expand-chip--path">{p}
                <button onClick={() => applyPaths(prev => prev.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
            <input className="np-expand-taginput" value={editNewPath} placeholder={uk ? '+ шлях' : '+ path'}
              onChange={e => setEditNewPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && editNewPath.trim()) { e.preventDefault(); if (!editPathsView.includes(editNewPath.trim())) applyPaths(p=>[...p, editNewPath.trim()]); setEditNewPath('') }}} />
          </div>
        </div>

        {/* Footer */}
        <div className="np-edit-footer">
          {editSaved && <span className="np-saved-flash">✓ {uk ? 'Збережено' : 'Saved'}</span>}
          <div style={{ flex: 1 }} />
          <button className="np-qbtn np-qbtn--save" onClick={saveEdit}>
            {uk ? 'Зберегти' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  // ── Context menu builder ─────────────────────────────────────────────────
  // Builds the items shown for each right-click target (folder / note / root).
  // Move-to-folder is rendered inline as a flat list of folders prefixed by
  // path ("Frontend / React") — submenus are out of scope for v1.
  const folderPath = (f: Folder): string => {
    const parts: string[] = [f.name]
    let cur = f.parentFolderId
    let safety = 0
    while (cur && safety++ < 10) {
      const p = foldersStore.getOne(cur)
      if (!p) break
      parts.unshift(p.name)
      cur = p.parentFolderId
    }
    return parts.join(' / ')
  }
  const buildCtxItems = (target: CtxTarget): (ContextMenuItem | null)[] => {
    if (target.kind === 'root') {
      return [
        { label: uk ? 'Нова папка' : 'New folder',
          icon: Ico.plus(12),
          onClick: () => setFolderEdit({ kind: 'create', parentId: undefined, name: '' }) },
      ]
    }
    if (target.kind === 'folder') {
      const f = target.folder
      const items: (ContextMenuItem | null)[] = [
        { label: uk ? 'Новий документ тут' : 'New document here',
          icon: Ico.notes(12),
          onClick: () => createNoteInFolder(f.id) },
        { label: uk ? 'Нова підпапка' : 'New subfolder',
          icon: Ico.plus(12),
          onClick: () => setFolderEdit({ kind: 'create', parentId: f.id, name: '' }) },
        null,
        { label: uk ? 'Перейменувати' : 'Rename',
          icon: Ico.pencil(12),
          onClick: () => setFolderEdit({ kind: 'rename', id: f.id, name: f.name }) },
        { label: uk ? 'Перемістити вгору' : 'Move up',
          icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
          onClick: () => moveFolderInSiblings(f.id, -1) },
        { label: uk ? 'Перемістити вниз' : 'Move down',
          icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
          onClick: () => moveFolderInSiblings(f.id, +1) },
        null,
        { label: uk ? 'Видалити папку' : 'Delete folder',
          icon: Ico.trash(12),
          danger: true,
          onClick: () => { void delFolder(f.id) } },
      ]
      return items
    }
    // target.kind === 'note'
    const n = target.note
    const allFoldersSorted = folders.slice().sort((a, b) => folderPath(a).localeCompare(folderPath(b)))
    const items: (ContextMenuItem | null)[] = [
      { label: uk ? 'Видалити' : 'Delete',
        icon: Ico.trash(12),
        danger: true,
        onClick: () => { void delNote(n.id) } },
      null,
    ]
    items.push({ label: uk ? 'Перенести: Без папки' : 'Move: Unfiled',
      icon: Ico.notes(12),
      disabled: !n.folderId,
      onClick: () => moveNoteToFolder(n.id, undefined) })
    if (allFoldersSorted.length > 0) items.push(null)
    for (const f of allFoldersSorted) {
      items.push({ label: (uk ? 'Перенести: ' : 'Move: ') + folderPath(f),
        icon: Ico.folder(12),
        disabled: n.folderId === f.id,
        onClick: () => moveNoteToFolder(n.id, f.id) })
    }
    return items
  }

  const submitFolderEdit = async () => {
    if (!folderEdit) return
    const name = folderEdit.name.trim()
    if (!name) { setFolderEdit(null); return }
    if (folderEdit.kind === 'create') {
      const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const folder: Folder = {
        id, name, parentFolderId: folderEdit.parentId,
        createdAt: new Date().toISOString(),
      }
      await saveFolderEntity(folder)
      // Auto-expand the parent so the new folder is visible.
      if (folderEdit.parentId) {
        setExpandedFolders(prev => { const next = new Set(prev); next.add(folderEdit.parentId!); return next })
      }
    } else {
      const cur = foldersStore.getOne(folderEdit.id)
      if (cur && cur.name !== name) await saveFolderEntity({ ...cur, name })
    }
    setFolderEdit(null)
  }

  // Right-click router for note rows in folder-tree view. The handler lives
  // on the wrapping `np-tree-note-wrap` (so it covers the indent padding too)
  // — see FolderTree.tsx.
  const onNoteContextMenu = (note: Note, x: number, y: number) =>
    setCtxMenu({ x, y, target: { kind: 'note', note } })

  // ── LIST MODE ─────────────────────────────────────────────────────────────
  return (
    <div className={`notes-panel${visible ? '' : ' notes-panel--collapsed'}`}>

      {/* ── Expand popup (fixed overlay) ── */}
      {showExpand && (
        <div className="np-expand-backdrop" onClick={e => { if (e.target === e.currentTarget) closeExpand() }}>
          <div className="np-expand-popup">
            <div className="np-expand-header">
              <input
                className="np-expand-title-input"
                value={expandTitleView}
                onChange={e => applyExpandTitle(e.target.value)}
                placeholder={uk ? 'Заголовок…' : 'Title…'}
                autoFocus
              />
              <button className="np-expand-x" onClick={closeExpand}>×</button>
            </div>
            <textarea
              className="np-expand-text"
              value={expandTextView}
              onChange={e => applyExpandText(e.target.value)}
              rows={8}
              placeholder={uk ? 'Починай писати…' : 'Start writing…'}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void saveExpandNote() } }}
            />
            <div className="np-expand-tags-row">
              {expandTagLinks.map((link, i) => (
                <span
                  key={i}
                  className={`np-expand-chip ${tagClassWithOverride(link.label, link.colorIndex)}`}
                  onClick={e => { e.stopPropagation(); if (expandNoteId) cycleTagColor(expandNoteId, link.label) }}
                  title={uk ? 'Натисни щоб змінити колір' : 'Click to change color'}
                  style={{ cursor: 'pointer' }}
                >
                  #{link.label}
                  <button onClick={e => { e.stopPropagation(); applyExpandTags(t => t.filter((_, j) => j !== i)) }}>×</button>
                </span>
              ))}
              <input
                className="np-expand-taginput"
                value={expandNewTag}
                placeholder={uk ? '+ тег' : '+ tag'}
                onChange={e => setExpandNewTag(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',') && expandNewTag.trim()) {
                    e.preventDefault()
                    const tg = expandNewTag.trim().replace(/^#/, '')
                    if (!expandTagsView.includes(tg)) applyExpandTags(p => [...p, tg])
                    setExpandNewTag('')
                  }
                }}
              />
            </div>
            <div className="np-expand-footer">
              <button className="np-exp-btn np-exp-cancel" onClick={closeExpand}>
                {uk ? 'Скасувати' : 'Cancel'}
              </button>
              <div style={{ flex: 1 }} />
              <button className="np-exp-btn np-exp-doc" onClick={() => openEditorNew()}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                {uk ? 'Документ' : 'Document'}
              </button>
              <button className="np-exp-btn np-exp-save" onClick={saveExpandNote}>
                {uk ? 'Зберегти' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="notes-header">
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, fontWeight: 600 }}>
          {t('notes')}
        </span>
        <div className="notes-header-actions">
          {notes.length > 0 && (
            <button className="notes-icon-btn" onClick={exportMarkdown} title={t('exportNotes')}>↓</button>
          )}
          <button
            className={`notes-icon-btn${showQuick ? ' active' : ''}`}
            onClick={() => { setShowQuick(v => !v); if (showQuick) setQuickText('') }}
            title={t('newNote')}
          >+</button>
        </div>
      </div>

      {/* ── Quick note inline ── */}
      {showQuick && (
        <div className="np-quick-wrap">
          <textarea
            ref={quickRef}
            className="np-quick-textarea"
            rows={4}
            placeholder={uk ? 'Швидка нотатка…' : 'Quick note…'}
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { resetQuick() }
              if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void saveQuickNote() }
            }}
          />
          {/* Folder picker — chooses where this quick note is filed. */}
          <div className="np-quick-folder-row">
            <span className="np-quick-folder-label">{uk ? 'Папка:' : 'Folder:'}</span>
            <div style={{ position: 'relative', flex: 1 }}>
              <button
                type="button"
                className="np-quick-folder-btn"
                onClick={() => setShowQuickFolderPicker(v => !v)}
              >
                {quickFolderId
                  ? folderPath(foldersStore.getOne(quickFolderId)!)
                  : (uk ? 'Без папки' : 'No folder')}
                <span className="ne-folder-chev">▾</span>
              </button>
              {showQuickFolderPicker && (
                <div className="ne-folder-dropdown np-quick-folder-dropdown">
                  <div
                    className={`ne-folder-opt${!quickFolderId ? ' ne-folder-opt--active' : ''}`}
                    onMouseDown={() => { setQuickFolderId(undefined); setShowQuickFolderPicker(false) }}
                  >
                    {uk ? 'Без папки' : 'No folder'}
                  </div>
                  {folders
                    .slice()
                    .sort((a, b) => folderPath(a).localeCompare(folderPath(b)))
                    .map(f => (
                      <div
                        key={f.id}
                        className={`ne-folder-opt${quickFolderId === f.id ? ' ne-folder-opt--active' : ''}`}
                        onMouseDown={() => { setQuickFolderId(f.id); setShowQuickFolderPicker(false) }}
                      >
                        {folderPath(f)}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="np-quick-bar">
            <button className="np-qbtn np-qbtn--ghost" onClick={() => resetQuick()}>
              {uk ? 'Скасувати' : 'Cancel'}
            </button>
            <div style={{ flex: 1 }} />
            <button className="np-qbtn np-qbtn--expand" onClick={() => openExpand()} title={uk ? 'Розгорнути' : 'Expand'}>
              ↗
            </button>
            <button className="np-qbtn np-qbtn--doc" onClick={() => openEditorNew(quickText, getAutoTitle(quickText))} title={uk ? 'Відкрити як документ' : 'Open as document'}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </button>
            <button
              className="np-qbtn np-qbtn--save"
              onClick={() => void saveQuickNote()}
              disabled={!quickText.trim()}
            >
              {uk ? 'Зберегти' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Current location header */}
      {activeServerName && (
        <div className="np-loc">
          <span className={`np-loc-dot${activeServerConnected ? ' online' : ''}`} />
          <span className="np-loc-name">{activeServerName}</span>
        </div>
      )}

      {/* Search */}
      <div className="notes-search">
        <input ref={searchRef} placeholder={t('searchNotes')} value={search}
          onChange={e => setSearch(e.target.value)} />
        {search && <button className="notes-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus() }}>✕</button>}
      </div>

      {/* View toggle: server-aware sections vs. user-built folder tree */}
      <div className="np-view-toggle-row">
        <div className="np-view-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'sections'}
            className={`np-view-toggle-btn${view === 'sections' ? ' np-view-toggle-btn--active' : ''}`}
            onClick={() => setView('sections')}
            title={uk ? 'Секції за контекстом' : 'Context sections'}
          >
            {Ico.filter(12)}
            <span>{uk ? 'Секції' : 'Sections'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'folders'}
            className={`np-view-toggle-btn${view === 'folders' ? ' np-view-toggle-btn--active' : ''}`}
            onClick={() => setView('folders')}
            title={uk ? 'Папки' : 'Folders'}
          >
            {Ico.folder(12)}
            <span>{uk ? 'Папки' : 'Folders'}</span>
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {view === 'folders' && (
          <button
            type="button"
            className="np-new-folder-btn np-new-folder-btn--icon"
            onClick={() => setFolderEdit({ kind: 'create', parentId: undefined, name: '' })}
            title={uk ? 'Нова папка' : 'New folder'}
            aria-label={uk ? 'Нова папка' : 'New folder'}
          >
            {Ico.plus(12)}
          </button>
        )}
      </div>

      {/* Note list */}
      <div
        className="panel-scroll"
        onContextMenu={e => {
          // In folders view, right-clicking the empty area below the tree
          // should still open the root "New folder" menu. Children inside the
          // tree call stopPropagation when they handle the click themselves.
          if (view !== 'folders') return
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, target: { kind: 'root' } })
        }}
      >
        {notes.length === 0 && !showQuick && view === 'sections' && (
          <div className="notes-empty">{t('noNotes').split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : ''}</span>)}</div>
        )}
        {visibleNotes.length === 0 && notes.length > 0 && view === 'sections' && (
          <div className="notes-empty">{uk ? 'Нічого не знайдено' : 'Nothing found'}</div>
        )}

        {view === 'sections' ? (
          <SectionedList
            activeServerName={activeServerName}
            activeServerConnected={activeServerConnected}
            uk={uk}
            grouped={grouped}
            NoteItem={NoteItem}
          />
        ) : (
          <FolderTree
            folders={folders}
            notes={visibleNotes}
            expanded={expandedFolders}
            sortOrder={folderOrder}
            onToggleExpand={toggleFolderExpand}
            onFolderContextMenu={(folder, x, y) => setCtxMenu({ x, y, target: { kind: 'folder', folder } })}
            onRootContextMenu={(x, y) => setCtxMenu({ x, y, target: { kind: 'root' } })}
            onNoteContextMenu={onNoteContextMenu}
            onDropNoteIntoFolder={moveNoteToFolder}
            onDropFolderIntoFolder={moveFolderToParent}
            renderNote={n => <NoteItem note={n} />}
            lang={lang}
          />
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          open={true}
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems(ctxMenu.target)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Folder name dialog (create / rename) */}
      {folderEdit && (
        <div className="np-folder-modal-backdrop" onClick={() => setFolderEdit(null)}>
          <div className="np-folder-modal" onClick={e => e.stopPropagation()}>
            <div className="np-folder-modal-title">
              {folderEdit.kind === 'create'
                ? (uk ? 'Нова папка' : 'New folder')
                : (uk ? 'Перейменувати папку' : 'Rename folder')}
            </div>
            <input
              autoFocus
              className="np-folder-modal-input"
              value={folderEdit.name}
              placeholder={uk ? 'Назва' : 'Name'}
              onChange={e => setFolderEdit(prev => prev ? { ...prev, name: e.target.value } : null)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); void submitFolderEdit() }
                if (e.key === 'Escape') { e.preventDefault(); setFolderEdit(null) }
              }}
            />
            <div className="np-folder-modal-actions">
              <button className="np-qbtn np-qbtn--ghost" onClick={() => setFolderEdit(null)}>
                {uk ? 'Скасувати' : 'Cancel'}
              </button>
              <button className="np-qbtn np-qbtn--save" onClick={() => void submitFolderEdit()}>
                {uk ? 'OK' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sectioned list with collapsible groups ──────────────────────────────────

function SectionedList({
  activeServerName, activeServerConnected, uk, grouped, NoteItem,
}: {
  activeServerName: string | null
  activeServerConnected: boolean
  uk: boolean
  grouped: { now: Note[]; srv: Note[]; global: Note[] }
  NoteItem: React.FC<{ note: Note }>
}) {
  // Section-collapse persisted across renders; "now" defaults open, others closed.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    now: false, srv: true, global: true,
  })
  const toggle = (k: string) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  // SVG glyphs for section headers (no emoji per the project's icon policy).
  const ICON_BOLT = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/>
    </svg>
  )
  const ICON_SERVER = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="6" rx="1"/>
      <rect x="2" y="15" width="20" height="6" rx="1"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  )
  const ICON_BOOK = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
  const sections: { id: 'now' | 'srv' | 'global'; icon: React.ReactNode; title: string; cls: string }[] = []
  if (grouped.now.length > 0) sections.push({
    id: 'now', icon: ICON_BOLT, cls: 'np-sec--now',
    title: uk ? 'Зараз тут' : 'Right here',
  })
  if (grouped.srv.length > 0) sections.push({
    id: 'srv', icon: ICON_SERVER, cls: 'np-sec--srv',
    title: activeServerName
      ? (uk ? `Цей сервер` : `This server`)
      : (uk ? 'Сервер' : 'Server'),
  })
  if (grouped.global.length > 0) sections.push({
    id: 'global', icon: ICON_BOOK, cls: 'np-sec--global',
    title: uk ? 'Інше' : 'Other',
  })

  return (
    <>
      {!activeServerConnected && (
        <div className="np-loc-hint">
          {uk ? 'Підключіться до сервера, щоб побачити контекстні нотатки' : 'Connect to a server to see contextual notes'}
        </div>
      )}
      {sections.map(sec => {
        const items = grouped[sec.id]
        const open = !collapsed[sec.id]
        return (
          <div key={sec.id} className={`np-section ${sec.cls}${open ? ' open' : ''}`}>
            <button className="np-section-toggle" onClick={() => toggle(sec.id)}>
              <span className="np-sec-icon">{sec.icon}</span>
              <span className="np-sec-title">{sec.title}</span>
              <span className="np-sec-caret">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                     style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
              <span className="np-sec-count">{items.length}</span>
            </button>
            {open && items.map(n => <NoteItem key={n.id} note={n} />)}
          </div>
        )
      })}
    </>
  )
}
