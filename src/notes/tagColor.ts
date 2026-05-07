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

/**
 * Deterministic tag → color-index mapping. Same label always maps to the same
 * index (0..7), so a tag like `frontend` keeps its color across the sidebar,
 * popup, and fullscreen editor without storing the color anywhere.
 *
 * The hash is djb2-style: simple, well-distributed for short ASCII / Cyrillic
 * strings, and stable across JS engines (relies only on charCodeAt + bitwise).
 */
export const TAG_COLOR_COUNT = 24

export function tagColorIndex(label: string): number {
  let h = 5381 >>> 0
  for (let i = 0; i < label.length; i++) {
    h = (((h << 5) + h) + label.charCodeAt(i)) >>> 0
  }
  return h % TAG_COLOR_COUNT
}

/** Returns the CSS class string for a label (e.g. `"tag-c-3"`). */
export function tagClass(label: string): string {
  return `tag-c-${tagColorIndex(label)}`
}

/**
 * Resolves the actual color index for a tag, preferring an explicit user
 * override (`colorIndex` on the NoteLink) over the auto-hashed default.
 * Range-checks the override and falls back to the hash if it's out of bounds.
 */
export function resolveTagColor(label: string, override: number | undefined): number {
  if (typeof override === 'number' && Number.isInteger(override) && override >= 0 && override < TAG_COLOR_COUNT) {
    return override
  }
  return tagColorIndex(label)
}

/** Returns the CSS class for a tag with optional override. */
export function tagClassWithOverride(label: string, override: number | undefined): string {
  return `tag-c-${resolveTagColor(label, override)}`
}

/** Next color in the cycle, given the currently-displayed color. */
export function nextTagColor(currentIndex: number): number {
  return (currentIndex + 1) % TAG_COLOR_COUNT
}
