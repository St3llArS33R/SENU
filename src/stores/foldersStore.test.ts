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
import { foldersStore } from './foldersStore'
import type { Folder } from '../types'

const mk = (id: string, over: Partial<Folder> = {}): Folder => ({
  id,
  name: id,
  createdAt: '2026-04-30T00:00:00Z',
  ...over,
})

describe('foldersStore', () => {
  beforeEach(() => foldersStore._reset())

  it('setAll populates entries and emits once', () => {
    const cb = vi.fn()
    foldersStore.subscribe(cb)
    foldersStore.setAll([mk('a'), mk('b')])
    expect(foldersStore.getAll()).toHaveLength(2)
    expect(foldersStore.getOne('a')?.name).toBe('a')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('upsert replaces an existing entry', () => {
    foldersStore.setAll([mk('a', { name: 'old' })])
    foldersStore.upsert(mk('a', { name: 'new' }))
    expect(foldersStore.getOne('a')?.name).toBe('new')
  })

  it('upsert adds a new entry', () => {
    foldersStore.setAll([mk('a')])
    foldersStore.upsert(mk('b'))
    expect(foldersStore.getAll()).toHaveLength(2)
  })

  it('remove drops the entry', () => {
    foldersStore.setAll([mk('a'), mk('b')])
    foldersStore.remove('a')
    expect(foldersStore.getOne('a')).toBeUndefined()
    expect(foldersStore.getAll()).toHaveLength(1)
  })

  it('remove of unknown id does not emit', () => {
    foldersStore.setAll([mk('a')])
    const cb = vi.fn()
    foldersStore.subscribe(cb)
    foldersStore.remove('ghost')
    expect(cb).not.toHaveBeenCalled()
  })

  it('subscribe returns an unsubscribe fn', () => {
    const cb = vi.fn()
    const off = foldersStore.subscribe(cb)
    foldersStore.setAll([mk('a')])
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    foldersStore.setAll([mk('b')])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  describe('getChildrenOf', () => {
    it('returns root-level folders when parentId is undefined', () => {
      foldersStore.setAll([
        mk('a'),
        mk('b'),
        mk('a-child', { parentFolderId: 'a' }),
      ])
      expect(foldersStore.getChildrenOf(undefined).map(f => f.id).sort())
        .toEqual(['a', 'b'])
    })

    it('returns children of a given parent', () => {
      foldersStore.setAll([
        mk('a'),
        mk('a-1', { parentFolderId: 'a' }),
        mk('a-2', { parentFolderId: 'a' }),
        mk('b-1', { parentFolderId: 'b' }),
      ])
      expect(foldersStore.getChildrenOf('a').map(f => f.id).sort())
        .toEqual(['a-1', 'a-2'])
    })

    it('sorts children by name (case-aware locale)', () => {
      foldersStore.setAll([
        mk('z', { name: 'Zebra' }),
        mk('a', { name: 'apple' }),
        mk('m', { name: 'Mango' }),
      ])
      expect(foldersStore.getChildrenOf(undefined).map(f => f.name))
        .toEqual(['apple', 'Mango', 'Zebra'])
    })

    it('treats null parentFolderId as root', () => {
      foldersStore.setAll([
        mk('a', { parentFolderId: undefined }),
        mk('b', { parentFolderId: undefined }),
      ])
      expect(foldersStore.getChildrenOf(undefined)).toHaveLength(2)
    })
  })
})
