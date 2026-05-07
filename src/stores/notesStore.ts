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

import { useSyncExternalStore } from 'react'
import type { Note } from '../types'

/**
 * Shape of an in-flight edit. Shallow merge: top-level fields replace wholesale,
 * including arrays — `links: NoteLink[]` is replaced, never merged element-by-element.
 * Callers that need to add a single link must build the new array themselves.
 */
export type NotePatch = Partial<Note>

/**
 * Singleton in-memory store for notes shared by every editor surface (sidebar
 * inline edit, expand popup, fullscreen NoteEditor). Persistence is unchanged
 * — App.tsx still drives bridge.saveNote — but the store is the single source
 * of truth for what each surface renders, so unsaved edits in one surface are
 * visible to the others.
 *
 * Concurrency note (`setAll` vs in-flight edits):
 *   `setAll` is called on cold load from disk. If a note has already been
 *   `patchDraft`-ed before that load resolves (race on slow disk), we skip
 *   replacing that entry — the user's edit wins. The dirty flag is cleared by
 *   `upsert` (post-save) and by `remove`.
 */
class NotesStore {
  private map = new Map<string, Note>()
  private dirty = new Set<string>()
  private listeners = new Set<() => void>()
  private snapshot: Note[] = []

  // ── Read ──────────────────────────────────────────────────────────────────

  getAll(): Note[] {
    return this.snapshot
  }

  getDraft(id: string): Note | undefined {
    return this.map.get(id)
  }

  isDirty(id: string): boolean {
    return this.dirty.has(id)
  }

  // ── Mutate ────────────────────────────────────────────────────────────────

  /** Bulk-replace from disk. Skips entries currently being edited (dirty set). */
  setAll(notes: Note[]): void {
    const next = new Map<string, Note>()
    for (const n of notes) {
      if (this.dirty.has(n.id)) {
        const live = this.map.get(n.id)
        if (live) { next.set(n.id, live); continue }
      }
      next.set(n.id, n)
    }
    // Preserve dirty entries that aren't in the incoming list (e.g. brand-new
    // unsaved drafts the disk doesn't know about yet).
    for (const id of this.dirty) {
      if (!next.has(id)) {
        const live = this.map.get(id)
        if (live) next.set(id, live)
      }
    }
    this.map = next
    this.recomputeSnapshot()
    this.emit()
  }

  /** Replace one entry (typically called after a successful save). Clears dirty. */
  upsert(note: Note): void {
    this.map.set(note.id, note)
    this.dirty.delete(note.id)
    this.recomputeSnapshot()
    this.emit()
  }

  remove(id: string): void {
    const had = this.map.delete(id)
    this.dirty.delete(id)
    if (had) {
      this.recomputeSnapshot()
      this.emit()
    }
  }

  /** Apply an in-flight edit. Marks the entry dirty so a concurrent setAll won't clobber it. */
  patchDraft(id: string, patch: NotePatch): void {
    const cur = this.map.get(id)
    if (!cur) return
    this.map.set(id, { ...cur, ...patch })
    this.dirty.add(id)
    this.recomputeSnapshot()
    this.emit()
  }

  /**
   * Auto-save acknowledgement. Clears dirty + bumps `updatedAt` ONLY if the
   * stored entry still matches `snapshot` (no concurrent patchDraft happened
   * during the disk write). Otherwise leaves dirty so the next debounce cycle
   * can pick up the newer edit.
   *
   * Compared fields: title, content, folder, links (deep). The intent is "did
   * the user type anything between snapshot and now?"
   */
  clearDirtyIfUnchanged(id: string, snapshot: Note, newUpdatedAt: string): boolean {
    const cur = this.map.get(id)
    if (!cur) return false
    const same =
      cur.title === snapshot.title &&
      cur.content === snapshot.content &&
      cur.folder === snapshot.folder &&
      cur.serverId === snapshot.serverId &&
      cur.folderId === snapshot.folderId &&
      JSON.stringify(cur.links ?? []) === JSON.stringify(snapshot.links ?? [])
    if (!same) return false
    this.map.set(id, { ...cur, updatedAt: newUpdatedAt })
    this.dirty.delete(id)
    this.recomputeSnapshot()
    this.emit()
    return true
  }

  /** Iterate dirty ids without exposing the internal Set. */
  dirtyIds(): string[] {
    return Array.from(this.dirty)
  }

  // ── Subscribe (useSyncExternalStore) ─────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /** Reset state. Test-only — do not call from app code. */
  _reset(): void {
    this.map.clear()
    this.dirty.clear()
    this.snapshot = []
    this.emit()
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private recomputeSnapshot(): void {
    this.snapshot = Array.from(this.map.values())
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }
}

export const notesStore = new NotesStore()

// ─── React hooks ──────────────────────────────────────────────────────────────

export function useNotes(): Note[] {
  return useSyncExternalStore(
    notesStore.subscribe,
    () => notesStore.getAll(),
    () => notesStore.getAll(),
  )
}

export function useNote(id: string | null | undefined): Note | undefined {
  return useSyncExternalStore(
    notesStore.subscribe,
    () => (id ? notesStore.getDraft(id) : undefined),
    () => (id ? notesStore.getDraft(id) : undefined),
  )
}

export function useIsDirty(id: string | null | undefined): boolean {
  return useSyncExternalStore(
    notesStore.subscribe,
    () => (id ? notesStore.isDirty(id) : false),
    () => (id ? notesStore.isDirty(id) : false),
  )
}
