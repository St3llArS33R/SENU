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

import { describe, it, expect } from 'vitest'
import {
  tagColorIndex, tagClass, TAG_COLOR_COUNT,
  resolveTagColor, tagClassWithOverride, nextTagColor,
} from './tagColor'

describe('tagColor', () => {
  it('is deterministic — same label always maps to same index', () => {
    const inputs = ['frontend', 'bug', 'wip', 'tokyo-night', 'фронтенд', '', 'a']
    for (const s of inputs) {
      const a = tagColorIndex(s)
      const b = tagColorIndex(s)
      expect(a).toBe(b)
    }
  })

  it('always returns an integer in [0, TAG_COLOR_COUNT)', () => {
    const inputs = ['x', 'longer-label', 'a'.repeat(200), 'кирилиця', '0', '!!!']
    for (const s of inputs) {
      const i = tagColorIndex(s)
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(TAG_COLOR_COUNT)
    }
  })

  it('distributes a mixed set across many buckets', () => {
    const labels = [
      'frontend', 'backend', 'bug', 'wip', 'docs', 'refactor', 'perf', 'security',
      'idea', 'todo', 'meeting', 'question', 'release', 'ci', 'urgent', 'design',
    ]
    const buckets = new Set(labels.map(tagColorIndex))
    // 16 distinct labels into TAG_COLOR_COUNT buckets — expect at least 8
    // distinct outputs so users see real visual variety, not stripes.
    expect(buckets.size).toBeGreaterThanOrEqual(Math.min(8, labels.length))
  })

  it('tagClass returns the right string', () => {
    expect(tagClass('any')).toBe(`tag-c-${tagColorIndex('any')}`)
    expect(tagClass('').startsWith('tag-c-')).toBe(true)
  })

  it('handles empty string without throwing', () => {
    expect(() => tagColorIndex('')).not.toThrow()
    expect(tagColorIndex('')).toBe(5381 % TAG_COLOR_COUNT)
  })

  describe('resolveTagColor (with override)', () => {
    it('returns the override when valid', () => {
      expect(resolveTagColor('any', 3)).toBe(3)
      expect(resolveTagColor('any', 0)).toBe(0)
      expect(resolveTagColor('any', TAG_COLOR_COUNT - 1)).toBe(TAG_COLOR_COUNT - 1)
    })

    it('falls back to hash when override is undefined', () => {
      expect(resolveTagColor('frontend', undefined)).toBe(tagColorIndex('frontend'))
    })

    it('falls back to hash when override is out of range', () => {
      expect(resolveTagColor('x', -1)).toBe(tagColorIndex('x'))
      expect(resolveTagColor('x', TAG_COLOR_COUNT)).toBe(tagColorIndex('x'))
      expect(resolveTagColor('x', 999)).toBe(tagColorIndex('x'))
    })

    it('falls back to hash for non-integer overrides', () => {
      expect(resolveTagColor('x', 1.5)).toBe(tagColorIndex('x'))
      expect(resolveTagColor('x', NaN)).toBe(tagColorIndex('x'))
    })

    it('tagClassWithOverride threads override through', () => {
      expect(tagClassWithOverride('x', 5)).toBe('tag-c-5')
      expect(tagClassWithOverride('x', undefined)).toBe(tagClass('x'))
    })
  })

  describe('nextTagColor', () => {
    it('advances by one within range', () => {
      expect(nextTagColor(0)).toBe(1)
      expect(nextTagColor(3)).toBe(4)
      expect(nextTagColor(TAG_COLOR_COUNT - 2)).toBe(TAG_COLOR_COUNT - 1)
    })
    it('wraps from the last index back to 0', () => {
      expect(nextTagColor(TAG_COLOR_COUNT - 1)).toBe(0)
    })
  })
})
