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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { notesStore } from './notesStore'
import type { Note } from '../types'

const mk = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content: `c-${id}`,
  updatedAt: '2026-04-27T00:00:00Z',
  links: [],
  ...over,
})

describe('notesStore', () => {
  beforeEach(() => notesStore._reset())

  it('setAll populates entries and emits once', () => {
    const cb = vi.fn()
    notesStore.subscribe(cb)
    notesStore.setAll([mk('a'), mk('b')])
    expect(notesStore.getAll()).toHaveLength(2)
    expect(notesStore.getDraft('a')?.title).toBe('a')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('upsert replaces an existing entry and clears dirty', () => {
    notesStore.setAll([mk('a')])
    notesStore.patchDraft('a', { title: 'edited' })
    expect(notesStore.isDirty('a')).toBe(true)
    notesStore.upsert(mk('a', { title: 'saved' }))
    expect(notesStore.getDraft('a')?.title).toBe('saved')
    expect(notesStore.isDirty('a')).toBe(false)
  })

  it('patchDraft is shallow merge — arrays replace wholesale', () => {
    notesStore.setAll([mk('a', { links: [{ type: 'tag', label: 'old' }] })])
    notesStore.patchDraft('a', { links: [{ type: 'tag', label: 'new' }] })
    const n = notesStore.getDraft('a')
    expect(n?.links).toEqual([{ type: 'tag', label: 'new' }])
    expect(n?.links).toHaveLength(1)
  })

  it('patchDraft on unknown id is a no-op', () => {
    notesStore.patchDraft('ghost', { title: 'x' })
    expect(notesStore.getDraft('ghost')).toBeUndefined()
    expect(notesStore.isDirty('ghost')).toBe(false)
  })

  it('setAll preserves dirty entries even if disk has older data', () => {
    notesStore.setAll([mk('a', { title: 'disk-v1' })])
    notesStore.patchDraft('a', { title: 'user-edit' })
    // Slow disk reload arrives later with original data
    notesStore.setAll([mk('a', { title: 'disk-v1' })])
    expect(notesStore.getDraft('a')?.title).toBe('user-edit')
    expect(notesStore.isDirty('a')).toBe(true)
  })

  it('setAll preserves dirty entry that is not in incoming list (new unsaved draft)', () => {
    notesStore.setAll([mk('a')])
    // Simulate a new draft created in memory that disk hasn't seen
    notesStore.upsert(mk('z', { title: 'fresh' }))
    notesStore.patchDraft('z', { title: 'still-fresh' })
    notesStore.setAll([mk('a'), mk('b')]) // disk reload, no z
    expect(notesStore.getDraft('z')?.title).toBe('still-fresh')
    expect(notesStore.getAll().map(n => n.id).sort()).toEqual(['a', 'b', 'z'])
  })

  it('remove deletes the entry and clears dirty', () => {
    notesStore.setAll([mk('a')])
    notesStore.patchDraft('a', { title: 't' })
    notesStore.remove('a')
    expect(notesStore.getDraft('a')).toBeUndefined()
    expect(notesStore.isDirty('a')).toBe(false)
  })

  it('subscribe returns an unsubscribe fn', () => {
    const cb = vi.fn()
    const off = notesStore.subscribe(cb)
    notesStore.setAll([mk('a')])
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    notesStore.setAll([mk('b')])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('upsert clears dirty even if entry was not previously known', () => {
    notesStore.upsert(mk('new'))
    expect(notesStore.isDirty('new')).toBe(false)
    expect(notesStore.getDraft('new')?.id).toBe('new')
  })

  it('dirtyIds returns currently-dirty entries', () => {
    notesStore.setAll([mk('a'), mk('b'), mk('c')])
    notesStore.patchDraft('a', { title: 'A!' })
    notesStore.patchDraft('c', { title: 'C!' })
    expect(notesStore.dirtyIds().sort()).toEqual(['a', 'c'])
  })

  describe('clearDirtyIfUnchanged', () => {
    it('clears dirty + bumps updatedAt when nothing changed since snapshot', () => {
      notesStore.setAll([mk('a', { title: 'orig' })])
      notesStore.patchDraft('a', { title: 'edited' })
      const snap = notesStore.getDraft('a')!
      const ok = notesStore.clearDirtyIfUnchanged('a', snap, '2030-01-01T00:00:00Z')
      expect(ok).toBe(true)
      expect(notesStore.isDirty('a')).toBe(false)
      expect(notesStore.getDraft('a')?.updatedAt).toBe('2030-01-01T00:00:00Z')
      expect(notesStore.getDraft('a')?.title).toBe('edited')
    })

    it('leaves dirty when user typed during persist (concurrent edit)', () => {
      notesStore.setAll([mk('a', { title: 'orig' })])
      notesStore.patchDraft('a', { title: 'snapshot' })
      const snap = notesStore.getDraft('a')!
      // Simulate concurrent edit during disk write
      notesStore.patchDraft('a', { title: 'racy' })
      const ok = notesStore.clearDirtyIfUnchanged('a', snap, '2030-01-01T00:00:00Z')
      expect(ok).toBe(false)
      expect(notesStore.isDirty('a')).toBe(true)
      expect(notesStore.getDraft('a')?.title).toBe('racy')
    })

    it('detects link changes (deep compare via JSON)', () => {
      notesStore.setAll([mk('a')])
      notesStore.patchDraft('a', { links: [{ type: 'tag', label: 'x' }] })
      const snap = notesStore.getDraft('a')!
      notesStore.patchDraft('a', { links: [{ type: 'tag', label: 'y' }] })
      const ok = notesStore.clearDirtyIfUnchanged('a', snap, '2030-01-01T00:00:00Z')
      expect(ok).toBe(false)
      expect(notesStore.isDirty('a')).toBe(true)
    })

    it('returns false for unknown id', () => {
      const ok = notesStore.clearDirtyIfUnchanged('ghost', mk('ghost'), '2030-01-01T00:00:00Z')
      expect(ok).toBe(false)
    })
  })
})
