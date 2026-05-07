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

// ── Snippet Pack Types ─────────────────────────────────────────────────────

export interface SnippetOption {
  flag: string
  desc: string
  descUk?: string
}

export interface SnippetExample {
  command: string
  label?: string
  labelUk?: string
}

export interface SnippetItem {
  id: string
  title: string
  titleUk?: string
  command: string
  description?: string
  descriptionUk?: string
  // Documentation fields (shown on detail page)
  syntax?: string
  options?: SnippetOption[]
  examples?: SnippetExample[]
  tags?: string[]
}

export interface SnippetGroup {
  id: string
  name: string
  nameUk?: string
  icon: string
  items: SnippetItem[]
}

export interface SnippetPack {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  builtin?: boolean   // cannot be deleted
  groups: SnippetGroup[]
}

/** Serialized .snpack file format */
export interface SnPackFile {
  type: 'senu-snpack'
  version: '1'
  pack: SnippetPack
}

/** Persisted UI settings for all packs */
export interface PackSettings {
  hiddenGroupKeys: string[]   // `${packId}/${groupId}`
  groupOrder: string[]        // ordered `${packId}/${groupId}` keys
}

/** User's own snippets (legacy nt API compat) */
export interface UserSnippet {
  id: string
  title: string
  command: string
  description?: string
  tags?: string[]
}
