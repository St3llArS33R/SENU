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

import { useState, useMemo, useCallback, useEffect } from 'react'
import type { TKey } from './i18n'
import type { Server, HomeGroup } from './types'

const nt = window.nextterm
type Health = 'up' | 'down' | 'unknown'

const LAST_CONN_KEY = 'senu_srv_last'

function getLastConn(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LAST_CONN_KEY) || '{}') } catch { return {} }
}

export function markServerConnected(id: string) {
  try {
    const data = getLastConn()
    data[id] = Date.now()
    localStorage.setItem(LAST_CONN_KEY, JSON.stringify(data))
  } catch {}
}

function relativeTime(ts: number, lang: string): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const uk = lang === 'uk'
  if (mins < 2)  return uk ? 'Тільки що' : 'Just now'
  if (mins < 60) return uk ? `${mins} хв тому` : `${mins}m ago`
  if (hrs < 24) {
    const today = new Date().toDateString() === new Date(ts).toDateString()
    if (today) return uk ? `Сьогодні ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Today ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (days === 1) return uk ? 'Вчора' : 'Yesterday'
  if (days < 7)  return uk ? `${days} дні тому` : `${days}d ago`
  return new Date(ts).toLocaleDateString(uk ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })
}

interface HomeScreenProps {
  servers: Server[]
  groups: HomeGroup[]
  lang: string
  t: (k: TKey) => string
  onConnect: (s: Server) => void
  onAddServer: () => void
  restorableIds?: string[]
  onRestoreSession?: () => void
}

export function HomeScreen({ servers, groups, lang, t, onConnect, onAddServer, restorableIds, onRestoreSession }: HomeScreenProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [health, setHealth] = useState<Map<string, Health>>(new Map())
  const lastConn = getLastConn()

  // TCP probe each reachable server (ssh/telnet) every 30s. Serial/local/docker
  // have no network endpoint, so they stay 'unknown'. Probes run with a small
  // concurrency cap so we don't flood the network on a big server list.
  useEffect(() => {
    let cancelled = false
    const probeAll = async () => {
      const probable = servers.filter(s => {
        const ct = s.connType ?? 'ssh'
        return (ct === 'ssh' || ct === 'telnet') && !!s.host
      })
      const CONCURRENCY = 6
      const results = new Map<string, Health>()
      for (let i = 0; i < probable.length; i += CONCURRENCY) {
        if (cancelled) return
        const slice = probable.slice(i, i + CONCURRENCY)
        await Promise.all(slice.map(async s => {
          const ok = await nt?.netProbe(s.host, s.port, 1500).catch(() => false)
          results.set(s.id, ok ? 'up' : 'down')
        }))
      }
      if (!cancelled) setHealth(results)
    }
    probeAll()
    const id = setInterval(probeAll, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [servers])

  const grouped = useMemo<{ id: string; name: string; color: string; servers: Server[] }[]>(
    () => groups.length > 0
      ? groups.map(g => ({ ...g, servers: servers.filter(s => s.groupId === g.id) })).filter(g => g.servers.length > 0)
      : [],
    [groups, servers]
  )
  const ungrouped = useMemo(
    () => grouped.length > 0
      ? servers.filter(s => !groups.some(g => g.id === s.groupId))
      : servers,
    [grouped, servers, groups]
  )

  const toggleGroup = useCallback((id: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }), [])

  const renderCard = useCallback((s: Server) => {
    const lc = lastConn[s.id]
    const h = health.get(s.id) ?? 'unknown'
    const healthColor = h === 'up' ? '#00d4aa' : h === 'down' ? '#f7706a' : '#6b7280'
    const healthTitle = h === 'up' ? (lang === 'uk' ? 'Доступний' : 'Reachable')
                      : h === 'down' ? (lang === 'uk' ? 'Недоступний' : 'Unreachable')
                      : (lang === 'uk' ? 'Невідомо' : 'Unknown')
    return (
      <div key={s.id} className="hs-card" onClick={() => onConnect(s)}>
        <div className="hs-card-dot" style={{ background: s.color || 'var(--accent)' }} />
        <div className="hs-card-body">
          <div className="hs-card-name">
            {s.name}
            <span title={healthTitle}
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: healthColor, marginLeft: 8, verticalAlign: 'middle',
                boxShadow: h === 'up' ? `0 0 6px ${healthColor}` : 'none',
              }} />
          </div>
          <div className="hs-card-host">{s.username}@{s.host}</div>
          {lc && <div className="hs-card-time">{relativeTime(lc, lang)}</div>}
        </div>
      </div>
    )
  }, [lastConn, lang, onConnect, health])

  return (
    <div className="hs-root">
      <div className="hs-hero">
        <div className="hs-logo">S E N U</div>
        <div className="hs-tagline">{t('appTagline')}</div>
      </div>

      {(grouped.length > 0 || ungrouped.length > 0) && (
        <div className="hs-section">
          <div className="hs-section-label">{t('quickConnect')}</div>

          {grouped.map(g => (
            <div key={g.id} className="hs-group">
              <button className="hs-group-header" onClick={() => toggleGroup(g.id)}>
                <span className="hs-group-arrow">{collapsed.has(g.id) ? '›' : '⌄'}</span>
                <span className="hs-group-dot" style={{ background: g.color }} />
                <span className="hs-group-name">{g.name}</span>
                <span className="hs-group-count">{g.servers.length}</span>
              </button>
              {!collapsed.has(g.id) && (
                <div className="hs-card-grid">
                  {g.servers.map(renderCard)}
                </div>
              )}
            </div>
          ))}

          {ungrouped.length > 0 && (
            <div className="hs-card-grid">
              {ungrouped.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {restorableIds && restorableIds.length > 0 && onRestoreSession && (
        <button
          className="hs-add-btn"
          onClick={onRestoreSession}
          style={{ marginTop: 12, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)' }}
          title={lang === 'uk' ? 'Відновити попередню сесію' : 'Restore previous session'}
        >
          {lang === 'uk'
            ? `↻ Відновити сесію (${restorableIds.length})`
            : `↻ Restore session (${restorableIds.length})`}
        </button>
      )}

      <button className="hs-add-btn" onClick={onAddServer}>+ {t('newConnectionBtn').replace('+ ', '')}</button>
    </div>
  )
}
