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

// Per-server command history. Stored in localStorage.
// Keyed by serverId so each host has its own list.
// Entries are deduplicated: typing the same command again bumps ts + count.

export interface CmdHistEntry {
  cmd: string
  ts: number    // last-used timestamp
  count: number // usage count
}

const KEY = (serverId: string) => `senu_cmdhist_${serverId}`
const LIMIT = 500

export function loadHistory(serverId: string): CmdHistEntry[] {
  try {
    const raw = localStorage.getItem(KEY(serverId))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function saveHistory(serverId: string, entries: CmdHistEntry[]): void {
  try { localStorage.setItem(KEY(serverId), JSON.stringify(entries.slice(-LIMIT))) } catch {}
}

export function addCommand(serverId: string, cmd: string): void {
  const trimmed = cmd.trim()
  if (!trimmed || trimmed.length > 2000) return
  const list = loadHistory(serverId)
  const idx = list.findIndex(e => e.cmd === trimmed)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ts: Date.now(), count: list[idx].count + 1 }
  } else {
    list.push({ cmd: trimmed, ts: Date.now(), count: 1 })
  }
  saveHistory(serverId, list)
}

/** Fuzzy score: higher is better; 0 means no match. */
export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 1
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  // Fast path: substring match ranks highest
  const sub = h.indexOf(n)
  if (sub >= 0) return 1000 - sub
  // Char-by-char fuzzy
  let score = 0
  let hi = 0
  for (let ni = 0; ni < n.length; ni++) {
    const c = n[ni]
    const found = h.indexOf(c, hi)
    if (found < 0) return 0
    score += 100 - (found - hi)
    hi = found + 1
  }
  return score
}
