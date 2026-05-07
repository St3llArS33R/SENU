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

import { useEffect, useState, useRef, useCallback } from 'react'
import { useLanguage } from './i18n'

const nt = window.nextterm

export interface TunnelRow {
  id: string
  sessionId: string
  tabId: string
  serverName: string
  localPort: number
  remoteHost: string
  remotePort: number
}

interface Props {
  /** Active SSH tabs: tabs with sessionId and a display name. */
  tabs: { id: string; sessionId: string | null; status: string; label?: string; server: { name: string } }[]
  onClose: () => void
  /** Called when user clicks "+ new tunnel" — parent opens ForwardingModal. */
  onAddNew: () => void
  /** Called after a tunnel is removed so parent can refresh its badge. */
  onChange?: () => void
}

export function TunnelsPopover({ tabs, onClose, onAddNew, onChange }: Props) {
  const { t } = useLanguage()
  const [rows, setRows] = useState<TunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const connected = tabs.filter(tb => tb.sessionId && tb.status === 'connected')
    const results = await Promise.all(connected.map(async tb => {
      try {
        const list = await nt?.sshForwardList(tb.sessionId!) ?? []
        return list.map((f: { id: string; local_port: number; remote_host: string; remote_port: number }) => ({
          id: f.id,
          sessionId: tb.sessionId!,
          tabId: tb.id,
          serverName: tb.label || tb.server.name,
          localPort: f.local_port,
          remoteHost: f.remote_host,
          remotePort: f.remote_port,
        }))
      } catch { return [] }
    }))
    setRows(results.flat())
    setLoading(false)
  }, [tabs])

  useEffect(() => {
    reload()
    const id = setInterval(reload, 3000)
    return () => clearInterval(id)
  }, [reload])

  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const handleRemove = async (id: string) => {
    try {
      await nt?.sshForwardRemove(id)
      await reload()
      onChange?.()
    } catch { /* ignore */ }
  }

  const handleCopy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(addr)
      setTimeout(() => setCopied(null), 1200)
    } catch { /* ignore */ }
  }

  // Group by server name.
  const grouped = new Map<string, TunnelRow[]>()
  for (const r of rows) {
    const arr = grouped.get(r.serverName) ?? []
    arr.push(r)
    grouped.set(r.serverName, arr)
  }

  return (
    <div ref={rootRef} className="tun-pop" onClick={e => e.stopPropagation()}>
      <div className="tun-pop-head">
        <span className="tun-pop-title">{t('activeTunnels')}</span>
        <span className="tun-pop-count">{rows.length}</span>
        <div style={{ flex: 1 }} />
        <button className="tun-pop-refresh" title={t('refresh')} onClick={reload}>↻</button>
      </div>

      {loading && <div className="tun-pop-empty">…</div>}

      {!loading && rows.length === 0 && (
        <div className="tun-pop-empty">{t('noActiveTunnels')}</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="tun-pop-list">
          {[...grouped.entries()].map(([server, list]) => (
            <div key={server} className="tun-pop-group">
              <div className="tun-pop-group-name">{server}</div>
              {list.map(r => {
                const addr = `127.0.0.1:${r.localPort}`
                return (
                  <div key={r.id} className="tun-pop-row">
                    <span className="tun-pop-ports">
                      <strong>:{r.localPort}</strong>
                      <span className="tun-pop-arrow">→</span>
                      {r.remoteHost}:{r.remotePort}
                    </span>
                    <button className="tun-pop-btn" title={copied === addr ? t('copied') : t('copyAddress')}
                      onClick={() => handleCopy(addr)}>
                      {copied === addr ? '✓' : '⧉'}
                    </button>
                    <button className="tun-pop-btn tun-pop-btn--danger" title={t('removeForward')}
                      onClick={() => handleRemove(r.id)}>✕</button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="tun-pop-foot">
        <button className="tun-pop-new" onClick={onAddNew}>+ {t('addForwardBtn')}</button>
      </div>
    </div>
  )
}
