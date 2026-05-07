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

import type { Note } from '../types'
import type { notesStore as NotesStoreSingleton } from './notesStore'

/**
 * Disk-write callback. Receives the note already enriched with the new
 * `updatedAt` timestamp so the implementation only has to forward to the
 * bridge / backend. Auto-save does NOT call this concurrently for the same id.
 */
export type PersistFn = (note: Note) => Promise<void>

export interface AutoSaver {
  /** Synchronously cancels timers and writes everything still dirty. Awaits all pending writes. */
  flushAll: () => Promise<void>
  /** Disconnects from the store and cancels all pending timers without flushing. */
  stop: () => void
  /** Number of pending debounce timers — useful for tests/debugging. */
  pendingCount: () => number
}

interface AutoSaveOpts {
  debounceMs?: number
  /**
   * Skip auto-saving notes whose content + title are both empty (whitespace
   * only). Default true. Prevents persisting throwaway "↗ expand" placeholders
   * that were never meaningfully edited before Cancel.
   */
  skipEmpty?: boolean
}

type StoreLike = Pick<typeof NotesStoreSingleton,
  'subscribe' | 'getDraft' | 'isDirty' | 'dirtyIds' | 'clearDirtyIfUnchanged'>

/**
 * Debounced auto-saver bound to a notesStore-shaped object. Each dirty id
 * gets an independent timer; the timer resets on every patchDraft for that
 * id (because the store emits on each mutation). When the timer fires we
 * snapshot the draft, persist it, then clear-dirty *only if* the store still
 * matches the snapshot — that way a concurrent edit during disk write isn't
 * lost (the next subscribe tick reschedules a fresh save).
 */
export function createAutoSaver(
  store: StoreLike,
  persist: PersistFn,
  opts: AutoSaveOpts = {},
): AutoSaver {
  const debounceMs = opts.debounceMs ?? 1000
  const skipEmpty  = opts.skipEmpty  ?? true
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const inflight = new Set<string>() // ids whose disk write is in progress
  // Last Note reference we saw for each dirty id. patchDraft creates a new
  // object via spread, so reference inequality means "this id was just edited"
  // — which is the only signal that should reset the debounce timer for that
  // id. Without this, any patchDraft anywhere would reset every dirty id's
  // timer, defeating per-id independent debounces.
  const lastSeenRef = new Map<string, Note>()

  const isMeaningful = (n: Note): boolean => {
    if (!skipEmpty) return true
    return Boolean((n.title ?? '').trim() || (n.content ?? '').trim())
  }

  const flush = async (id: string): Promise<void> => {
    timers.delete(id)
    if (!store.isDirty(id)) return
    if (inflight.has(id)) return // a previous flush is still running
    const snap = store.getDraft(id)
    if (!snap || !isMeaningful(snap)) return
    inflight.add(id)
    const newAt = new Date().toISOString()
    const persisted: Note = { ...snap, updatedAt: newAt }
    try {
      await persist(persisted)
      store.clearDirtyIfUnchanged(id, snap, newAt)
    } catch (err) {
      console.error('[autoSave] failed for', id, err)
      // Leave dirty so the next subscribe tick reschedules a retry.
    } finally {
      inflight.delete(id)
      // If the user typed during the in-flight write, dirty is still set and
      // reschedule was a no-op while inflight blocked it. Fire one now so the
      // racy edit gets its own debounced save.
      if (store.isDirty(id)) reschedule()
    }
  }

  const reschedule = () => {
    for (const id of store.dirtyIds()) {
      if (inflight.has(id)) continue
      const cur = store.getDraft(id)
      if (!cur) continue
      const prev = lastSeenRef.get(id)
      if (prev === cur) continue // no patchDraft for this id since last reschedule
      lastSeenRef.set(id, cur)
      const t = timers.get(id)
      if (t) clearTimeout(t)
      timers.set(id, setTimeout(() => { void flush(id) }, debounceMs))
    }
  }

  const unsub = store.subscribe(reschedule)

  return {
    flushAll: async () => {
      const ids = Array.from(timers.keys())
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      await Promise.all(ids.map(id => flush(id)))
      // Catch anything that became dirty while flushing.
      const stillDirty = store.dirtyIds().filter(id => !inflight.has(id))
      await Promise.all(stillDirty.map(id => flush(id)))
    },
    stop: () => {
      unsub()
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      lastSeenRef.clear()
    },
    pendingCount: () => timers.size,
  }
}
