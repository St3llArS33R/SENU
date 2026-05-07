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
import type { Folder } from '../types'

/**
 * Singleton in-memory store for folders. Mirrors the notesStore pattern but
 * simpler — folders are small, infrequent metadata. Rename happens through
 * an explicit "Rename" context-menu action (input → submit → saveFolder), not
 * cross-surface live editing, so no dirty tracking / debounced auto-save is
 * needed for folders. Persistence flows through bridge.saveFolder /
 * bridge.deleteFolder driven by NotesPanel.
 */
class FoldersStore {
  private map = new Map<string, Folder>()
  private listeners = new Set<() => void>()
  private snapshot: Folder[] = []

  // ── Read ──────────────────────────────────────────────────────────────────

  getAll(): Folder[] {
    return this.snapshot
  }

  getOne(id: string): Folder | undefined {
    return this.map.get(id)
  }

  /** Children of `parentId` (root level when undefined). Sorted by name asc. */
  getChildrenOf(parentId: string | undefined): Folder[] {
    return this.snapshot
      .filter(f => (f.parentFolderId ?? undefined) === (parentId ?? undefined))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // ── Mutate ────────────────────────────────────────────────────────────────

  /** Bulk-replace from disk. */
  setAll(folders: Folder[]): void {
    this.map = new Map(folders.map(f => [f.id, f]))
    this.recomputeSnapshot()
    this.emit()
  }

  /** Insert or replace one folder. */
  upsert(folder: Folder): void {
    this.map.set(folder.id, folder)
    this.recomputeSnapshot()
    this.emit()
  }

  /**
   * Remove a folder. Children are NOT recursively removed — caller decides
   * whether to detach (re-parent to undefined) or cascade. Notes referencing
   * this folder via `folderId` are similarly the caller's responsibility
   * (typically detached via notesStore.patchDraft on each).
   */
  remove(id: string): void {
    const had = this.map.delete(id)
    if (had) {
      this.recomputeSnapshot()
      this.emit()
    }
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /** Reset state. Test-only. */
  _reset(): void {
    this.map.clear()
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

export const foldersStore = new FoldersStore()

// ─── React hooks ──────────────────────────────────────────────────────────────

export function useFolders(): Folder[] {
  return useSyncExternalStore(
    foldersStore.subscribe,
    () => foldersStore.getAll(),
    () => foldersStore.getAll(),
  )
}

export function useFolder(id: string | null | undefined): Folder | undefined {
  return useSyncExternalStore(
    foldersStore.subscribe,
    () => (id ? foldersStore.getOne(id) : undefined),
    () => (id ? foldersStore.getOne(id) : undefined),
  )
}
