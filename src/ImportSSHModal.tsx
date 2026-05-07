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

import { useState, useEffect } from 'react'
import { useLanguage } from './i18n'

const nt = window.nextterm

export interface SshConfigEntry {
  name: string
  host: string
  port: number
  username: string
  key_path: string | null
}

interface Props {
  onImport: (entries: SshConfigEntry[]) => void
  onClose: () => void
}

export function ImportSSHModal({ onImport, onClose }: Props) {
  const { t } = useLanguage()
  const [entries, setEntries] = useState<SshConfigEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    nt?.parseSSHConfig().then((res: SshConfigEntry[]) => {
      setEntries(res)
      setSelected(new Set(res.map((_, i) => i)))
    }).catch((e: unknown) => setError(String(e))).finally(() => setLoading(false))
  }, [])

  const toggle = (i: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-header">
          <span className="modal-title">{t('importSshConfig')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <div className="import-ssh-loading">Reading ~/.ssh/config…</div>}
          {error  && <div className="import-ssh-error">⚠ {error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div className="import-ssh-empty">No hosts found in ~/.ssh/config</div>
          )}
          {!loading && entries.length > 0 && (
            <>
              <div className="import-ssh-hint">Select hosts to import:</div>
              <div className="import-ssh-list">
                {entries.map((e, i) => (
                  <label key={i} className="import-ssh-row">
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    <span className="import-ssh-name">{e.name}</span>
                    <span className="import-ssh-host">{e.username}@{e.host}:{e.port}</span>
                    {e.key_path && <span className="import-ssh-key">🔑</span>}
                  </label>
                ))}
              </div>
              <div className="import-ssh-actions">
                <button className="btn-secondary" onClick={() => setSelected(new Set(entries.map((_, i) => i)))}>All</button>
                <button className="btn-secondary" onClick={() => setSelected(new Set())}>None</button>
                <div style={{ flex: 1 }} />
                <button className="btn-primary" disabled={selected.size === 0}
                  onClick={() => { onImport(entries.filter((_, i) => selected.has(i))); onClose() }}>
                  {t('importAction')} {selected.size} server{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
