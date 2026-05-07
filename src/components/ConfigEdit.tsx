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
 * Generic CodeMirror 6 wrapper for config-style editing.
 *
 * Domain-agnostic by design: this component knows about *text*, *language*,
 * and *save callback* — nothing about SFTP, snippets, or any caller domain.
 * Wrap it (e.g. SftpEditor) to add domain logic.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, Compartment, Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { StreamLanguage } from '@codemirror/language'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'

import { ConfigLanguage, indentFor } from './configLanguage'

export interface ConfigEditProps {
  value: string
  onChange: (next: string) => void
  language: ConfigLanguage
  /** Called when the user hits Ctrl/Cmd+S inside the editor. */
  onSave?: () => void
  readOnly?: boolean
  /** Persist line-wrap toggle under this key in localStorage. Optional. */
  wrapStorageKey?: string
  /** Optional inline className for the host element. */
  className?: string
}

function langExtensionFor(lang: ConfigLanguage): Extension | null {
  switch (lang) {
    case 'yaml':       return yaml()
    case 'json':       return json()
    case 'nginx':
    case 'apache':
    case 'sshd':
    case 'systemd':
    case 'ini':
    case 'toml':
    case 'env':
    case 'conf':
    case 'hosts':
    case 'fstab':
    case 'dockerfile':
    case 'bash':
      // Legacy stream modes — pick the closest match.
      if (lang === 'bash')       return StreamLanguage.define(shell)
      if (lang === 'dockerfile') return StreamLanguage.define(dockerFile)
      if (lang === 'toml')       return StreamLanguage.define(toml)
      if (lang === 'nginx')      return StreamLanguage.define(nginx)
      // ini / env / conf / sshd / systemd / apache / hosts / fstab → properties is a sane base.
      return StreamLanguage.define(properties)
    case 'plain':
    default:
      return null
  }
}

const senuTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      backgroundColor: 'var(--bg, #0c0c0c)',
      color: 'var(--text, #c8c8c8)',
    },
    '.cm-scroller': { fontFamily: 'inherit' },
    '.cm-content': { caretColor: 'var(--accent-h, #4aba8a)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-h, #4aba8a)' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg2, #101010)',
      color: 'var(--text3, #5e5e5e)',
      border: 'none',
      borderRight: '1px solid var(--border, #1e1e1e)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg3, #141414)',
      color: 'var(--text, #c8c8c8)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection':
      { backgroundColor: 'rgba(74,158,255,0.25)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(201,162,39,0.25)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(201,162,39,0.5)' },
    '.cm-panels': {
      backgroundColor: 'var(--bg2, #101010)',
      color: 'var(--text, #c8c8c8)',
      borderTop: '1px solid var(--border, #1e1e1e)',
    },
    '.cm-panels input': {
      backgroundColor: 'var(--bg3, #141414)',
      color: 'var(--text, #c8c8c8)',
      border: '1px solid var(--border2, #282828)',
      padding: '2px 6px',
    },
    '.cm-panels button': {
      backgroundColor: 'var(--bg3, #141414)',
      color: 'var(--text, #c8c8c8)',
      border: '1px solid var(--border2, #282828)',
    },
  },
  { dark: true }
)

export default function ConfigEdit({
  value,
  onChange,
  language,
  onSave,
  readOnly = false,
  wrapStorageKey,
  className,
}: ConfigEditProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Compartments allow swapping language / readOnly / wrap without rebuilding state.
  const langCompartment = useMemo(() => new Compartment(), [])
  const roCompartment   = useMemo(() => new Compartment(), [])
  const wrapCompartment = useMemo(() => new Compartment(), [])

  // Keep latest onChange/onSave in refs so the editor closure is stable.
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  const initialWrap = useMemo(() => {
    if (!wrapStorageKey) return false
    try { return localStorage.getItem(wrapStorageKey) === '1' } catch { return false }
  }, [wrapStorageKey])
  const [wrap, setWrap] = useState<boolean>(initialWrap)

  // Mount editor once.
  useEffect(() => {
    if (!hostRef.current) return

    const indent = indentFor(language)
    const langExt = langExtensionFor(language)

    const saveBinding = {
      key: 'Mod-s',
      preventDefault: true,
      run: () => { onSaveRef.current?.(); return true },
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([
          saveBinding,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorState.tabSize.of(indent.size),
        EditorState.readOnly.of(readOnly),
        roCompartment.of(EditorView.editable.of(!readOnly)),
        langCompartment.of(langExt ? [langExt] : []),
        wrapCompartment.of(wrap ? [EditorView.lineWrapping] : []),
        senuTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // Mount-once: subsequent prop changes are handled via dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value → editor (only when it differs, to avoid cursor reset on local typing).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  // Reconfigure language when prop changes.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const langExt = langExtensionFor(language)
    view.dispatch({
      effects: langCompartment.reconfigure(langExt ? [langExt] : []),
    })
  }, [language, langCompartment])

  // Reconfigure readOnly when prop changes.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: roCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    })
  }, [readOnly, roCompartment])

  // Reconfigure wrap when toggled.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? [EditorView.lineWrapping] : []),
    })
    if (wrapStorageKey) {
      try { localStorage.setItem(wrapStorageKey, wrap ? '1' : '0') } catch { /* ignore */ }
    }
  }, [wrap, wrapCompartment, wrapStorageKey])

  return (
    <div
      className={className}
      style={{ position: 'relative', height: '100%', width: '100%' }}
    >
      <button
        type="button"
        onClick={() => setWrap((w) => !w)}
        title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
        style={{
          position: 'absolute',
          top: 4,
          right: 8,
          zIndex: 5,
          fontSize: 11,
          padding: '2px 8px',
          background: 'var(--bg3, #141414)',
          color: wrap ? 'var(--accent-h, #4aba8a)' : 'var(--text2, #888)',
          border: '1px solid var(--border2, #282828)',
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
        }}
      >
        wrap: {wrap ? 'on' : 'off'}
      </button>
      <div ref={hostRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
