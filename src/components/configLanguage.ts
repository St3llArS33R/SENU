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
 * Path-based config language detection for ConfigEdit.
 *
 * Pure module — no React, no CodeMirror. The detection result is fed to
 * ConfigEdit which maps it to a CM extension. Keeping detection separate
 * makes it cheap to unit-test and reusable in non-editor contexts (e.g.
 * snippet auto-tagging).
 */

export type ConfigLanguage =
  | 'nginx'
  | 'apache'
  | 'sshd'
  | 'systemd'
  | 'yaml'
  | 'toml'
  | 'ini'
  | 'json'
  | 'env'
  | 'conf'
  | 'hosts'
  | 'fstab'
  | 'dockerfile'
  | 'bash'
  | 'plain'

const FILENAME_RULES: Array<[RegExp, ConfigLanguage]> = [
  // Filename matches first — they're more specific than extensions.
  [/(^|\/)nginx\.conf$/i,                  'nginx'],
  [/(^|\/)nginx\/.*\.conf$/i,              'nginx'],
  [/(^|\/)(httpd|apache2)\.conf$/i,        'apache'],
  [/(^|\/)apache2\//i,                     'apache'],
  [/(^|\/)nginx\/sites-(available|enabled)\//i, 'nginx'],
  [/(^|\/)sites-(available|enabled)\//i,   'nginx'],
  [/(^|\/)sshd_config$/i,                  'sshd'],
  [/(^|\/)ssh_config$/i,                   'sshd'],
  [/(^|\/)Dockerfile(\..+)?$/,             'dockerfile'],
  [/(^|\/)Containerfile$/,                 'dockerfile'],
  [/(^|\/)hosts$/i,                        'hosts'],
  [/(^|\/)fstab$/i,                        'fstab'],
  [/\.service$/i,                          'systemd'],
  [/\.socket$/i,                           'systemd'],
  [/\.timer$/i,                            'systemd'],
  [/\.target$/i,                           'systemd'],
  [/\.mount$/i,                            'systemd'],
]

const EXTENSION_RULES: Record<string, ConfigLanguage> = {
  yaml: 'yaml',
  yml:  'yaml',
  toml: 'toml',
  ini:  'ini',
  json: 'json',
  env:  'env',
  sh:   'bash',
  bash: 'bash',
  conf: 'conf',
  cfg:  'ini',
}

/**
 * Detect a config language for a given file path.
 *
 * Strategy:
 *   1. Match by filename / well-known location (most specific).
 *   2. Fall back to extension.
 *   3. Default to 'plain'.
 */
export function detectLanguage(path: string | undefined | null): ConfigLanguage {
  if (!path) return 'plain'

  // Normalize: strip query/fragment-like suffixes, keep slashes intact.
  const p = path.trim()
  if (!p) return 'plain'

  for (const [pattern, lang] of FILENAME_RULES) {
    if (pattern.test(p)) return lang
  }

  // Extension lookup (lowercase, last dot)
  const dot = p.lastIndexOf('.')
  if (dot > -1 && dot < p.length - 1) {
    const ext = p.slice(dot + 1).toLowerCase()
    if (ext in EXTENSION_RULES) return EXTENSION_RULES[ext]
  }

  return 'plain'
}

/**
 * Recommended indent for a language.
 * fstab uses tabs by convention; bash/python use 4 spaces; everything else 2.
 *
 * Indent is reported as { unit: '  ' | '    ' | '\t', size: number }.
 * size is for display only — the unit is what gets inserted on Tab.
 */
export interface IndentSpec {
  unit: string
  size: number
}

export function indentFor(lang: ConfigLanguage): IndentSpec {
  if (lang === 'fstab' || lang === 'hosts') return { unit: '\t', size: 4 }
  if (lang === 'bash')                       return { unit: '    ', size: 4 }
  return { unit: '  ', size: 2 }
}
