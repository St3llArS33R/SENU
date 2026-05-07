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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAutoSaver, type AutoSaver } from './autoSave'
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

describe('createAutoSaver', () => {
  // Track active saver per test so afterEach can guarantee cleanup even when
  // an assertion fails before saver.stop() is reached. Without this, a failed
  // test's stale subscription + pending fake timers leak into the next test.
  let active: AutoSaver | null = null
  const make = (...args: Parameters<typeof createAutoSaver>): AutoSaver => {
    active = createAutoSaver(...args)
    return active
  }

  beforeEach(() => {
    notesStore._reset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    active?.stop()
    active = null
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('debounces a save 1s after the last patchDraft', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('a')])
    const saver = make(notesStore, persist, { debounceMs: 1000 })

    notesStore.patchDraft('a', { title: 'edit-1' })
    await vi.advanceTimersByTimeAsync(500)
    notesStore.patchDraft('a', { title: 'edit-2' }) // resets timer
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).not.toHaveBeenCalled() // only 500ms since last edit
    await vi.advanceTimersByTimeAsync(500) // now 1000ms total
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0].title).toBe('edit-2')
    expect(notesStore.isDirty('a')).toBe(false)
    saver.stop()
  })

  it('skips empty placeholder notes (default skipEmpty)', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('placeholder', { title: '   ', content: '' })])
    const saver = make(notesStore, persist)

    // Even after dirty + 1s, empty entry should not persist
    notesStore.patchDraft('placeholder', { title: '' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(persist).not.toHaveBeenCalled()
    saver.stop()
  })

  it('persists once title or content has any non-whitespace', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('a', { title: '', content: '' })])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { content: 'x' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).toHaveBeenCalledTimes(1)
    saver.stop()
  })

  it('handles independent debounces for multiple ids', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('a'), mk('b')])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { title: 'A' })
    await vi.advanceTimersByTimeAsync(700)
    notesStore.patchDraft('b', { title: 'B' })
    await vi.advanceTimersByTimeAsync(300) // A: 1000ms total; B: 300ms
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0].id).toBe('a')
    await vi.advanceTimersByTimeAsync(700) // B: 1000ms total
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[1][0].id).toBe('b')
    saver.stop()
  })

  it('leaves dirty if user types during persist (concurrent edit race)', async () => {
    let resolvePersist: (() => void) | null = null
    const persist = vi.fn<(n: Note) => Promise<void>>(() => new Promise<void>(res => { resolvePersist = res }))
    notesStore.setAll([mk('a', { title: 'orig' })])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { title: 'snapshot' })
    await vi.advanceTimersByTimeAsync(1000) // fires flush
    expect(persist).toHaveBeenCalledTimes(1)

    // Concurrent edit while disk write in-flight
    notesStore.patchDraft('a', { title: 'racy' })
    expect(notesStore.isDirty('a')).toBe(true)

    resolvePersist!()
    await vi.advanceTimersByTimeAsync(0) // flush microtasks
    expect(notesStore.isDirty('a')).toBe(true) // still dirty (clearDirtyIfUnchanged returned false)
    expect(notesStore.getDraft('a')?.title).toBe('racy')

    // Next debounce should pick up the racy edit
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[1][0].title).toBe('racy')
    saver.stop()
  })

  it('flushAll synchronously drains all pending timers', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('a'), mk('b')])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { title: 'A' })
    notesStore.patchDraft('b', { title: 'B' })
    expect(saver.pendingCount()).toBe(2)

    await saver.flushAll()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(saver.pendingCount()).toBe(0)
    expect(notesStore.isDirty('a')).toBe(false)
    expect(notesStore.isDirty('b')).toBe(false)
    saver.stop()
  })

  it('stop cancels timers without persisting', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockResolvedValue(undefined)
    notesStore.setAll([mk('a')])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { title: 'edit' })
    saver.stop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(persist).not.toHaveBeenCalled()
    expect(notesStore.isDirty('a')).toBe(true) // stop doesn't clear dirty
  })

  it('persist failure leaves dirty for retry', async () => {
    const persist = vi.fn<(n: Note) => Promise<void>>().mockRejectedValue(new Error('disk full'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    notesStore.setAll([mk('a')])
    const saver = make(notesStore, persist)

    notesStore.patchDraft('a', { title: 'edit' })
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(0) // microtasks
    expect(persist).toHaveBeenCalledTimes(1)
    expect(notesStore.isDirty('a')).toBe(true)
    errSpy.mockRestore()
    saver.stop()
  })
})
