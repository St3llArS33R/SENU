// Idempotent license-header injector. Run once; safe to re-run.
//
// Walks src/ and src-tauri/src/, finds every .rs / .ts / .tsx file, and
// prepends an SPDX-style Apache-2.0 header if one isn't already present.
// Skips generated dirs (target/, dist/, node_modules/, build outputs).
//
// Usage: node scripts/add-license-headers.mjs [--dry]

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['src', 'src-tauri/src']
const EXTS = new Set(['.rs', '.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', 'build', '.git', 'gen'])
const HEADER_MARKER = 'SPDX-License-Identifier: Apache-2.0'

const HEADER = `// Copyright 2026 Borys Zaitsev
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
`

const DRY = process.argv.includes('--dry')

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile() && EXTS.has(path.extname(e.name))) yield full
  }
}

async function processFile(file) {
  const txt = await fs.readFile(file, 'utf8')
  if (txt.includes(HEADER_MARKER)) return { file, status: 'skip' }
  // Preserve any leading shebang or BOM if present (none expected, but be safe)
  let prefix = ''
  let body = txt
  if (body.startsWith('﻿')) { prefix = '﻿'; body = body.slice(1) }
  const next = `${prefix}${HEADER}\n${body}`
  if (DRY) return { file, status: 'would-add' }
  await fs.writeFile(file, next, 'utf8')
  return { file, status: 'added' }
}

let added = 0, skipped = 0
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir)
  for await (const f of walk(abs)) {
    const r = await processFile(f)
    if (r.status === 'added' || r.status === 'would-add') { added++; console.log(`+ ${path.relative(ROOT, f)}`) }
    else skipped++
  }
}
console.log(`\n${added} ${DRY ? 'would-add' : 'added'}, ${skipped} already had a header.`)
