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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from './i18n'
import { loadHistory, fuzzyScore, type CmdHistEntry } from './commandHistory'

interface Props {
  serverId: string
  serverName: string
  /** Called when user picks a command. Pass without newline so user can review/edit. */
  onPick: (cmd: string) => void
  onClose: () => void
}

export function CommandHistoryOverlay({ serverId, serverName, onPick, onClose }: Props) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<CmdHistEntry[]>(() => loadHistory(serverId), [serverId])

  const ranked = useMemo(() => {
    const q = query.trim()
    if (!q) {
      return [...entries].sort((a, b) => b.ts - a.ts)
    }
    return entries
      .map(e => ({ e, score: fuzzyScore(e.cmd, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.e.count - a.e.count || b.e.ts - a.e.ts)
      .map(x => x.e)
  }, [entries, query])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setIdx(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-ch-idx="${idx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const clamped = Math.min(idx, Math.max(0, ranked.length - 1))

  const pick = (cmd: string) => { onPick(cmd); onClose() }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, ranked.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const c = ranked[clamped]; if (c) pick(c.cmd) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" onKeyDown={onKey}>
        <div className="palette-input-wrap">
          <span className="palette-icon">⌕</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={t('cmdHistPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span style={{ color: 'var(--text3)', fontSize: 11, whiteSpace: 'nowrap' }}>
            {serverName} · {ranked.length}
          </span>
        </div>
        <div className="palette-results" ref={listRef}>
          {ranked.length === 0 && (
            <div className="palette-empty">
              {entries.length === 0 ? t('cmdHistEmpty') : t('paletteNoResults') + (query ? `"${query}"` : '')}
            </div>
          )}
          {ranked.length > 0 && (
            <div>
              <div className="palette-section">{t('cmdHistSection')}</div>
              {ranked.slice(0, 200).map((e, i) => (
                <button
                  key={e.cmd}
                  data-ch-idx={i}
                  className={`palette-item ${i === clamped ? 'palette-item--selected' : ''}`}
                  onClick={() => pick(e.cmd)}
                  onMouseEnter={() => setIdx(i)}
                >
                  <div className="palette-item-main">
                    <div className="palette-item-name" style={{ fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {e.cmd}
                    </div>
                    <div className="palette-item-sub">
                      ×{e.count} · {new Date(e.ts).toLocaleString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)', display: 'flex', gap: 12 }}>
          <span>↑↓ {t('cmdHistNavigate')}</span>
          <span>↵ {t('cmdHistInsert')}</span>
          <span>Esc {t('cmdHistClose')}</span>
        </div>
      </div>
    </>
  )
}
