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

import { useMemo } from 'react'
import type { Folder, Note } from '../types'

interface Props {
  folders: Folder[]
  notes: Note[]
  /** Set of folder ids that are currently expanded. */
  expanded: Set<string>
  /**
   * Optional explicit sibling ordering. Folder ids in this array sort first
   * in their listed order; everything else falls back to createdAt desc.
   */
  sortOrder?: string[]
  onToggleExpand: (id: string) => void
  /** Right-click on a folder header. */
  onFolderContextMenu: (folder: Folder, x: number, y: number) => void
  /** Right-click anywhere on the empty tree background or unfiled bucket. */
  onRootContextMenu: (x: number, y: number) => void
  /** Right-click on a note row (covers the padding area, not just the inner row). */
  onNoteContextMenu: (note: Note, x: number, y: number) => void
  /** Drag-drop targets — see Steps 4.5 / 4.6. Optional in v1. */
  onDropNoteIntoFolder?: (noteId: string, folderId: string | undefined) => void
  onDropFolderIntoFolder?: (folderId: string, parentId: string | undefined) => void
  /** Render callback for a single note row — keeps badge/selection logic in caller. */
  renderNote: (note: Note) => React.ReactNode
  lang: 'uk' | 'en' | string
}

interface TreeNode {
  folder: Folder
  children: TreeNode[]
  notes: Note[]
}

function buildTree(
  folders: Folder[],
  notes: Note[],
  sortOrder?: string[],
): { roots: TreeNode[]; unfiled: Note[] } {
  const byParent = new Map<string | undefined, Folder[]>()
  for (const f of folders) {
    const key = f.parentFolderId ?? undefined
    const arr = byParent.get(key) ?? []
    arr.push(f)
    byParent.set(key, arr)
  }
  const notesByFolder = new Map<string, Note[]>()
  const unfiled: Note[] = []
  for (const n of notes) {
    if (n.folderId) {
      const arr = notesByFolder.get(n.folderId) ?? []
      arr.push(n)
      notesByFolder.set(n.folderId, arr)
    } else {
      unfiled.push(n)
    }
  }

  // Folders sort newest-first by createdAt — matches the user expectation that
  // recently created folders surface at the top. A user-controlled override
  // map (passed in via `sortOrder`) takes precedence, so manual reorders win.
  const orderOf = (id: string) => {
    const i = sortOrder?.indexOf(id) ?? -1
    return i >= 0 ? i : Number.MAX_SAFE_INTEGER
  }
  const sortFolders = (a: Folder, b: Folder) => {
    const oa = orderOf(a.id), ob = orderOf(b.id)
    if (oa !== ob) return oa - ob
    return (b.createdAt || '').localeCompare(a.createdAt || '') // desc
  }
  const sortByTitle = (a: Note, b: Note) =>
    (a.title || '').localeCompare(b.title || '')

  const buildNode = (folder: Folder): TreeNode => ({
    folder,
    children: (byParent.get(folder.id) ?? []).slice().sort(sortFolders).map(buildNode),
    notes: (notesByFolder.get(folder.id) ?? []).slice().sort(sortByTitle),
  })

  const roots = (byParent.get(undefined) ?? []).slice().sort(sortFolders).map(buildNode)
  unfiled.sort(sortByTitle)
  return { roots, unfiled }
}

// ── Inline SVG icons ──────────────────────────────────────────────────────
function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l2-3h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <path d="M3 10h18" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l2-3h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 80ms ease' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Folder row ─────────────────────────────────────────────────────────────
function FolderRow(props: Props & { node: TreeNode; depth: number }) {
  const {
    node, depth, expanded, onToggleExpand, onFolderContextMenu,
    onDropNoteIntoFolder, onDropFolderIntoFolder, renderNote, onNoteContextMenu,
  } = props
  const isOpen = expanded.has(node.folder.id)
  const hasChildren = node.children.length > 0 || node.notes.length > 0
  const isEmpty = !hasChildren

  const onDragOver = (e: React.DragEvent) => {
    if (!onDropNoteIntoFolder && !onDropFolderIntoFolder) return
    if (!e.dataTransfer.types.includes('application/x-senu-note') &&
        !e.dataTransfer.types.includes('application/x-senu-folder')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLDivElement).classList.add('np-tree-row--drop')
  }
  const onDragLeave = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLDivElement).classList.remove('np-tree-row--drop')
  }
  const onDrop = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLDivElement).classList.remove('np-tree-row--drop')
    const noteId = e.dataTransfer.getData('application/x-senu-note')
    const folderId = e.dataTransfer.getData('application/x-senu-folder')
    if (noteId) { onDropNoteIntoFolder?.(noteId, node.folder.id); e.preventDefault(); return }
    if (folderId && folderId !== node.folder.id) {
      onDropFolderIntoFolder?.(folderId, node.folder.id); e.preventDefault()
    }
  }

  return (
    <>
      <div
        className={`np-tree-row np-tree-folder${isEmpty ? ' np-tree-folder--empty' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!!onDropFolderIntoFolder}
        onDragStart={e => {
          e.dataTransfer.setData('application/x-senu-folder', node.folder.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => hasChildren && onToggleExpand(node.folder.id)}
        onContextMenu={e => {
          e.preventDefault()
          e.stopPropagation()
          onFolderContextMenu(node.folder, e.clientX, e.clientY)
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <span className="np-tree-chev">
          {hasChildren ? <ChevronIcon open={isOpen} /> : <span style={{ width: 10, display: 'inline-block' }} />}
        </span>
        <span className="np-tree-icon"><FolderIcon open={isOpen} /></span>
        <span className="np-tree-name">{node.folder.name}</span>
      </div>
      {isOpen && (
        <>
          {node.children.map(child => (
            <FolderRow key={child.folder.id} {...props} node={child} depth={depth + 1} />
          ))}
          {node.notes.map(note => (
            <div
              key={note.id}
              className="np-tree-note-wrap"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
              draggable={!!onDropNoteIntoFolder}
              onDragStart={e => {
                e.dataTransfer.setData('application/x-senu-note', note.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                onNoteContextMenu(note, e.clientX, e.clientY)
              }}
            >
              {renderNote(note)}
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ── Tree root ──────────────────────────────────────────────────────────────
export function FolderTree(props: Props) {
  const { folders, notes, onRootContextMenu, onNoteContextMenu, onDropNoteIntoFolder, renderNote, lang } = props
  const { sortOrder } = props
  const { roots, unfiled } = useMemo(
    () => buildTree(folders, notes, sortOrder),
    [folders, notes, sortOrder],
  )
  const uk = lang === 'uk'
  const isEmpty = roots.length === 0 && unfiled.length === 0

  // Unfiled bucket — drop target for "remove from folder" (folderId = undefined)
  const onUnfiledDragOver = (e: React.DragEvent) => {
    if (!onDropNoteIntoFolder) return
    if (!e.dataTransfer.types.includes('application/x-senu-note')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLDivElement).classList.add('np-tree-row--drop')
  }
  const onUnfiledDragLeave = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLDivElement).classList.remove('np-tree-row--drop')
  }
  const onUnfiledDrop = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLDivElement).classList.remove('np-tree-row--drop')
    const noteId = e.dataTransfer.getData('application/x-senu-note')
    if (noteId) { onDropNoteIntoFolder?.(noteId, undefined); e.preventDefault() }
  }

  return (
    <div
      className="np-tree"
      onContextMenu={e => {
        // Folder rows / note wrappers / unfiled header all stopPropagation
        // when they handle the click themselves. Anything that reaches here
        // is bare tree background (or padding inside the tree container) and
        // should open the root "New folder" menu.
        e.preventDefault()
        onRootContextMenu(e.clientX, e.clientY)
      }}
    >
      {roots.map(node => (
        <FolderRow key={node.folder.id} {...props} node={node} depth={0} />
      ))}

      {unfiled.length > 0 && (
        <div className="np-tree-unfiled-block">
          <div
            className="np-tree-row np-tree-unfiled-header"
            onDragOver={onUnfiledDragOver}
            onDragLeave={onUnfiledDragLeave}
            onDrop={onUnfiledDrop}
            onContextMenu={e => {
              e.preventDefault()
              e.stopPropagation()
              onRootContextMenu(e.clientX, e.clientY)
            }}
          >
            <span className="np-tree-chev"><span style={{ width: 10, display: 'inline-block' }} /></span>
            <span className="np-tree-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </span>
            <span className="np-tree-name np-tree-name--muted">{uk ? 'Без папки' : 'Unfiled'}</span>
            <span className="np-tree-count">{unfiled.length}</span>
          </div>
          {unfiled.map(note => (
            <div
              key={note.id}
              className="np-tree-note-wrap"
              style={{ paddingLeft: 8 + 14 }}
              draggable={!!onDropNoteIntoFolder}
              onDragStart={e => {
                e.dataTransfer.setData('application/x-senu-note', note.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                onNoteContextMenu(note, e.clientX, e.clientY)
              }}
            >
              {renderNote(note)}
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="np-tree-empty">
          {uk ? 'Натисни ПКМ для створення папки' : 'Right-click to create a folder'}
        </div>
      )}
    </div>
  )
}
