// Copyright 2026 Borys Zaitsev
// SPDX-License-Identifier: Apache-2.0
//
// Wraps `cargo about generate` so THIRD-PARTY-LICENSES.txt is rebuilt every
// time we run `npm run build` (which is what `tauri build` invokes via
// beforeBuildCommand). Keeping the attribution file fresh on every release
// satisfies Apache-2.0 §4.d, MPL-2.0 §3.3, and OFL-1.1 attribution clauses.
//
// If cargo-about isn't installed we print a warning and exit 0 so dev
// rebuilds don't break for contributors who haven't installed it. Releases
// pull the binary into the GH Actions runner via `cargo install cargo-about`
// before running this script.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAURI = path.join(ROOT, 'src-tauri')
const TEMPLATE = path.join(TAURI, 'third-party-licenses.hbs')
const OUTPUT = path.join(ROOT, 'THIRD-PARTY-LICENSES.txt')

if (!existsSync(TEMPLATE)) {
  console.error(`[licenses] template not found: ${TEMPLATE}`)
  process.exit(1)
}

console.log('[licenses] regenerating THIRD-PARTY-LICENSES.txt …')
const child = spawn(
  'cargo',
  ['about', 'generate', 'third-party-licenses.hbs', '-o', OUTPUT],
  { cwd: TAURI, stdio: 'inherit', shell: true },
)
child.on('close', code => {
  if (code === 0) {
    console.log('[licenses] OK')
    process.exit(0)
  }
  // cargo-about not installed (typical on fresh clones) — warn but don't
  // block dev builds. CI/release pipelines must install cargo-about first.
  console.warn(`[licenses] cargo-about exited ${code}.`)
  console.warn('[licenses] Skipping. To install: cargo install cargo-about --features cli')
  process.exit(0)
})
child.on('error', err => {
  console.warn(`[licenses] spawn failed: ${err.message}`)
  console.warn('[licenses] Skipping (cargo-about likely not installed).')
  process.exit(0)
})
