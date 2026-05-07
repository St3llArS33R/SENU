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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLanguage } from '../i18n'
import { useTheme } from '../themes'
import { BUILTIN_PACK } from './builtinPack'
import type { SnippetItem, SnippetPack, SnPackFile, PackSettings, UserSnippet } from './types'
import './snip.css'

// ─── Storage ─────────────────────────────────────────────────────────────────
const PACKS_KEY    = 'senu_custom_packs'
const SETTINGS_KEY = 'senu_pack_settings'

function loadCustomPacks(): SnippetPack[] {
  try { return JSON.parse(localStorage.getItem(PACKS_KEY) || '[]') } catch { return [] }
}
function saveCustomPacks(packs: SnippetPack[]) {
  try { localStorage.setItem(PACKS_KEY, JSON.stringify(packs)) } catch {}
}
function loadPackSettings(): PackSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { hiddenGroupKeys: raw.hiddenGroupKeys || [], groupOrder: raw.groupOrder || [] }
  } catch { return { hiddenGroupKeys: [], groupOrder: [] } }
}
function savePackSettings(s: PackSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

function gkey(packId: string, groupId: string) { return `${packId}/${groupId}` }

const nt = window.nextterm

type Tab = 'mine' | 'library' | 'packs'

// ─── Public type for detail state (used in App.tsx) ───────────────────────────
export interface SnipDocState {
  item: SnippetItem
  groupName: string
  groupIcon: string
  relatedItems: SnippetItem[]
}

interface EditingSnippet extends UserSnippet {
  syntax?: string
  options?: { flag: string; desc: string }[]
  examples?: { command: string; label: string }[]
}

// ─── SnipDocView — rendered in the CENTRAL terminal area by App.tsx ───────────
export function SnipDocView({
  doc, onClose, onInsert, onRun,
}: {
  doc: SnipDocState
  onClose: () => void
  onInsert: (cmd: string) => void
  onRun: (cmd: string) => void
}) {
  const { lang } = useLanguage()
  const { theme } = useTheme()
  const termBg    = theme?.xterm?.background ?? '#0c0c0c'
  const termGreen = theme?.xterm?.green      ?? '#4caf77'

  const { item, groupName, groupIcon, relatedItems } = doc
  const title = (lang === 'uk' && item.titleUk)       ? item.titleUk       : item.title
  const desc  = (lang === 'uk' && item.descriptionUk) ? item.descriptionUk : (item.description ?? '')
  const L     = (uk: string, en: string) => lang === 'uk' ? uk : lang === 'de' ? en : en

  return (
    <div className="snip-doc-stage">
      {/* Top bar */}
      <div className="snip-doc-topbar">
        <button className="snip-doc-back" onClick={onClose}>
          ‹ {L('Назад', 'Back')}
        </button>
        <span className="snip-doc-topbar-title">
          {groupIcon} {groupName} — {title}
        </span>
      </div>

      <div className="snip-doc-body">
        {/* Description */}
        {desc && <p className="snip-doc-desc">{desc}</p>}

        {/* Syntax */}
        {item.syntax && (
          <section className="snip-doc-block">
            <div className="snip-doc-block-label">{L('Синтаксис', 'Syntax')}</div>
            <div className="snip-doc-syntax-box" style={{ background: termBg }}>
              <span style={{ color: termGreen, fontFamily: 'var(--mono)', fontSize: 13 }}>{item.syntax}</span>
            </div>
          </section>
        )}

        {/* Options */}
        {item.options && item.options.length > 0 && (
          <section className="snip-doc-block">
            <div className="snip-doc-block-label">{L('Опції', 'Options')}</div>
            <div className="snip-doc-opts-table">
              {item.options.map((opt, i) => (
                <div key={i} className="snip-doc-opt-row">
                  <code className="snip-doc-opt-flag">{opt.flag}</code>
                  <span className="snip-doc-opt-desc">
                    {lang === 'uk' && opt.descUk ? opt.descUk : opt.desc}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Examples */}
        {item.examples && item.examples.length > 0 && (
          <section className="snip-doc-block">
            <div className="snip-doc-block-label">{L('Приклади', 'Examples')}</div>
            <div className="snip-doc-examples-list">
              {item.examples.map((ex, i) => (
                <div key={i} className="snip-doc-ex-card" style={{ background: termBg }}>
                  <div className="snip-doc-ex-cmd" style={{ color: termGreen }}>{ex.command}</div>
                  <div className="snip-doc-ex-row">
                    <button className="snip-btn snip-insert" onClick={() => onInsert(ex.command)}>Insert</button>
                    <button className="snip-btn snip-run"    onClick={() => onRun(ex.command)}>▶ Run</button>
                    {(ex.labelUk || ex.label) && (
                      <span className="snip-doc-ex-label">
                        {lang === 'uk' && ex.labelUk ? ex.labelUk : ex.label}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main command */}
        <section className="snip-doc-block snip-doc-block--main">
          <div className="snip-doc-block-label">{L('Команда', 'Command')}</div>
          <div className="snip-doc-ex-card" style={{ background: termBg }}>
            <div className="snip-doc-ex-cmd" style={{ color: termGreen }}>{item.command}</div>
            <div className="snip-doc-ex-row">
              <button className="snip-btn snip-insert" onClick={() => onInsert(item.command)}>Insert</button>
              <button className="snip-btn snip-run"    onClick={() => onRun(item.command)}>▶ Run</button>
            </div>
          </div>
        </section>

        {/* Related commands */}
        {relatedItems.length > 0 && (
          <section className="snip-doc-block">
            <div className="snip-doc-block-label">{L('Пов\'язані команди', 'Related commands')}</div>
            <div className="snip-doc-related">
              {relatedItems.map(rel => (
                <button
                  key={rel.id}
                  className="snip-doc-related-btn"
                  style={{ fontFamily: 'var(--mono)' }}
                  onClick={() => onInsert(rel.command)}
                  title={rel.command}
                >
                  {(lang === 'uk' && rel.titleUk) ? rel.titleUk : rel.title}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── Catalog Packs (sidebar section with stubs) ───────────────────────────────
interface CatalogPack {
  id: string; name: string; version: string; desc: string
  status: 'installed' | 'available' | 'update'
  tags: string[]
}

const CATALOG_STUBS: CatalogPack[] = [
  { id: 'metasploit-pack', name: 'metasploit-pack', version: '1.2', desc: 'Metasploit & penetration testing commands', status: 'installed', tags: ['security'] },
  { id: 'kubernetes-pack', name: 'kubernetes-pack', version: '2.0', desc: 'kubectl, helm, k9s and Kubernetes management', status: 'available', tags: ['devops'] },
  { id: 'nginx-pack',      name: 'nginx-pack',      version: '1.0', desc: 'Extended Nginx configuration and tuning', status: 'available', tags: ['web'] },
  { id: 'mysql-pack',      name: 'mysql-pack',      version: '1.1', desc: 'MySQL/MariaDB administration commands', status: 'installed', tags: ['db'] },
  { id: 'ansible-pack',    name: 'ansible-pack',    version: '1.3', desc: 'Ansible playbooks and ad-hoc commands', status: 'available', tags: ['devops'] },
  { id: 'postgres-pack',   name: 'postgres-pack',   version: '1.0', desc: 'PostgreSQL administration and queries', status: 'available', tags: ['db'] },
]

function CatalogPacksSection({ lang, onOpenCatalog }: {
  lang: string
  onOpenCatalog: (doc: SnipDocState) => void
}) {
  const L = (uk: string, en: string) => lang === 'uk' ? uk : en

  // stub catalog item for center view
  const openCatalog = () => {
    onOpenCatalog({
      item: {
        id: '__catalog__',
        title: L('Каталог паків', 'Pack Catalog'),
        command: '',
        description: L(
          'Каталог завантажуваних паків сніпетів. Функціонал завантаження буде доступний у наступних версіях SENU.',
          'Downloadable snippet packs catalog. Download functionality will be available in future versions of SENU.'
        ),
      },
      groupName: L('Пакети', 'Packs'),
      groupIcon: '📦',
      relatedItems: [],
    })
  }

  return (
    <div className="snip-catalog-section">
      <div className="snip-catalog-header">
        <span className="snip-catalog-label">{L('ПАКЕТИ', 'PACKS')}</span>
        <button className="snip-catalog-browse-btn" onClick={openCatalog} title={L('Переглянути каталог', 'Browse catalog')}>
          {L('Каталог', 'Catalog')} →
        </button>
      </div>

      {CATALOG_STUBS.map(pack => (
        <div key={pack.id} className={`snip-catalog-item status-${pack.status}`}>
          <span className="snip-catalog-status">
            {pack.status === 'installed' ? '✓' : pack.status === 'update' ? '↑' : '↓'}
          </span>
          <div className="snip-catalog-info">
            <span className="snip-catalog-name">{pack.name}</span>
            <span className="snip-catalog-ver">v{pack.version}</span>
          </div>
          <button
            className={`snip-catalog-btn snip-catalog-btn--${pack.status}`}
            title={L('Недоступно до завантаження', 'Unavailable for download')}
            onClick={() => alert(L(
              'Завантаження паків буде доступне в наступній версії SENU.',
              'Pack downloads will be available in the next version of SENU.'
            ))}
            disabled={pack.status === 'installed'}
          >
            {pack.status === 'installed'
              ? L('Встановлено', 'Installed')
              : pack.status === 'update'
              ? L('Оновити', 'Update')
              : L('Завантажити', 'Download')}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Pack Manager ─────────────────────────────────────────────────────────────
function PackManager({
  packs, settings, onSettingsChange, onImport, onDeletePack, lang,
}: {
  packs: SnippetPack[]
  settings: PackSettings
  onSettingsChange: (s: PackSettings) => void
  onImport: () => void
  onDeletePack: (id: string) => void
  lang: string
}) {
  const L = (uk: string, en: string) => lang === 'uk' ? uk : en

  const toggleGroup = (packId: string, groupId: string) => {
    const key = gkey(packId, groupId)
    const hidden = settings.hiddenGroupKeys.includes(key)
      ? settings.hiddenGroupKeys.filter(k => k !== key)
      : [...settings.hiddenGroupKeys, key]
    onSettingsChange({ ...settings, hiddenGroupKeys: hidden })
  }

  const moveGroup = (packId: string, groupId: string, dir: -1 | 1) => {
    const allKeys = packs.flatMap(p => p.groups.map(g => gkey(p.id, g.id)))
    const ordered = settings.groupOrder.length > 0 ? settings.groupOrder : allKeys
    const full    = [...new Set([...ordered, ...allKeys])]
    const idx     = full.indexOf(gkey(packId, groupId))
    if (idx === -1) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= full.length) return
    const updated = [...full];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    onSettingsChange({ ...settings, groupOrder: updated })
  }

  return (
    <div className="snip-pack-manager">
      <div className="snip-pack-toolbar">
        <button className="snip-pack-import-btn" onClick={onImport}>
          ↑ {L('Імпортувати пак', 'Import Pack')}
        </button>
      </div>

      {packs.map(pack => (
        <div key={pack.id} className="snip-pack-card">
          <div className="snip-pack-card-header">
            <div className="snip-pack-card-info">
              <span className="snip-pack-name">{pack.name}</span>
              <span className="snip-pack-meta">v{pack.version}{pack.author ? ` · ${pack.author}` : ''}</span>
            </div>
            <div className="snip-pack-card-actions">
              <button className="snip-pack-export-btn" title={L('Експортувати', 'Export')}
                onClick={() => exportPack(pack)}>↓</button>
              {!pack.builtin && (
                <button className="snip-pack-delete-btn" title={L('Видалити пак', 'Delete pack')}
                  onClick={() => onDeletePack(pack.id)}>✕</button>
              )}
            </div>
          </div>

          <div className="snip-pack-groups">
            {pack.groups.map((group, idx) => {
              const key     = gkey(pack.id, group.id)
              const hidden  = settings.hiddenGroupKeys.includes(key)
              const gName   = lang === 'uk' && group.nameUk ? group.nameUk : group.name
              return (
                <div key={group.id} className={`snip-pack-group-row ${hidden ? 'is-hidden' : ''}`}>
                  <span className="snip-pack-group-icon">{group.icon}</span>
                  <span className="snip-pack-group-name">{gName}</span>
                  <span className="snip-pack-group-count">{group.items.length}</span>
                  <div className="snip-pack-group-ctrl">
                    <button className="snip-pack-ctrl-btn" title={L('Вгору','Move up')}
                      onClick={() => moveGroup(pack.id, group.id, -1)} disabled={idx === 0}>↑</button>
                    <button className="snip-pack-ctrl-btn" title={L('Вниз','Move down')}
                      onClick={() => moveGroup(pack.id, group.id, 1)} disabled={idx === pack.groups.length - 1}>↓</button>
                    <button
                      className={`snip-pack-ctrl-btn snip-pack-visibility-btn ${hidden ? 'is-off' : ''}`}
                      title={hidden ? L('Показати','Show') : L('Сховати','Hide')}
                      onClick={() => toggleGroup(pack.id, group.id)}
                    >{hidden ? '👁' : '◉'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function exportPack(pack: SnippetPack) {
  const file: SnPackFile = { type: 'senu-snpack', version: '1', pack }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${pack.id}-${pack.version}.snpack`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Edit Snippet Modal ───────────────────────────────────────────────────────
function EditSnippetModal({
  editing, isNew, onClose, onSave, lang,
}: {
  editing: EditingSnippet; isNew: boolean
  onClose: () => void; onSave: (sn: EditingSnippet) => void; lang: string
}) {
  const [sn, setSn] = useState<EditingSnippet>(editing)
  const L = (uk: string, en: string) => lang === 'uk' ? uk : en
  const [optRow, setOptRow] = useState({ flag: '', desc: '' })
  const [exRow,  setExRow]  = useState({ command: '', label: '' })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal snip-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{isNew ? L('Новий сніпет','New Snippet') : L('Редагувати сніпет','Edit Snippet')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body snip-edit-body">
          <label>{L('Назва','Title')}</label>
          <input placeholder={L('напр. Перезапустити Nginx','e.g. Restart Nginx')}
            value={sn.title} onChange={e => setSn({ ...sn, title: e.target.value })} />
          <label>{L('Команда','Command')}</label>
          <textarea rows={3} className="snip-cmd-input" placeholder="systemctl restart nginx"
            value={sn.command} onChange={e => setSn({ ...sn, command: e.target.value })} />
          <label>{L('Опис','Description')} <span style={{ opacity: 0.4, fontWeight: 400 }}>({L("необов'язково",'optional')})</span></label>
          <input placeholder={L('Короткий опис команди','Short description')}
            value={sn.description || ''} onChange={e => setSn({ ...sn, description: e.target.value })} />

          <div className="snip-edit-divider">{L('Документація (для сторінки Докладніше)','Documentation (for Details page)')}</div>

          <label>{L('Синтаксис','Syntax')} <span style={{ opacity: 0.4, fontWeight: 400 }}>({L("необов'язково",'optional')})</span></label>
          <input placeholder="command [OPTIONS] [ARGS...]"
            value={sn.syntax || ''} onChange={e => setSn({ ...sn, syntax: e.target.value })} />

          <label>{L('Опції','Options')}</label>
          {(sn.options || []).map((opt, i) => (
            <div key={i} className="snip-edit-row">
              <input className="snip-edit-row-flag" placeholder="--flag" value={opt.flag}
                onChange={e => { const o=[...(sn.options||[])]; o[i]={...o[i],flag:e.target.value}; setSn({...sn,options:o}) }} />
              <input className="snip-edit-row-desc" placeholder={L('Опис','Description')} value={opt.desc}
                onChange={e => { const o=[...(sn.options||[])]; o[i]={...o[i],desc:e.target.value}; setSn({...sn,options:o}) }} />
              <button className="snip-edit-row-del"
                onClick={() => setSn({...sn, options:(sn.options||[]).filter((_,j)=>j!==i)})}>✕</button>
            </div>
          ))}
          <div className="snip-edit-row snip-edit-row-add">
            <input className="snip-edit-row-flag" placeholder="--flag" value={optRow.flag} onChange={e=>setOptRow(r=>({...r,flag:e.target.value}))} />
            <input className="snip-edit-row-desc" placeholder={L('Опис','Description')} value={optRow.desc} onChange={e=>setOptRow(r=>({...r,desc:e.target.value}))} />
            <button className="snip-edit-row-add-btn" onClick={() => { if(!optRow.flag)return; setSn({...sn,options:[...(sn.options||[]),{flag:optRow.flag,desc:optRow.desc}]}); setOptRow({flag:'',desc:''}) }}>+</button>
          </div>

          <label>{L('Приклади','Examples')}</label>
          {(sn.examples || []).map((ex, i) => (
            <div key={i} className="snip-edit-row">
              <input className="snip-edit-row-cmd" placeholder="command" value={ex.command}
                onChange={e => { const exs=[...(sn.examples||[])]; exs[i]={...exs[i],command:e.target.value}; setSn({...sn,examples:exs}) }} />
              <input className="snip-edit-row-label" placeholder={L('Мітка','Label')} value={ex.label}
                onChange={e => { const exs=[...(sn.examples||[])]; exs[i]={...exs[i],label:e.target.value}; setSn({...sn,examples:exs}) }} />
              <button className="snip-edit-row-del"
                onClick={() => setSn({...sn, examples:(sn.examples||[]).filter((_,j)=>j!==i)})}>✕</button>
            </div>
          ))}
          <div className="snip-edit-row snip-edit-row-add">
            <input className="snip-edit-row-cmd" placeholder="command" value={exRow.command} onChange={e=>setExRow(r=>({...r,command:e.target.value}))} />
            <input className="snip-edit-row-label" placeholder={L('Мітка','Label')} value={exRow.label} onChange={e=>setExRow(r=>({...r,label:e.target.value}))} />
            <button className="snip-edit-row-add-btn" onClick={() => { if(!exRow.command)return; setSn({...sn,examples:[...(sn.examples||[]),{command:exRow.command,label:exRow.label}]}); setExRow({command:'',label:''}) }}>+</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>{L('Скасувати','Cancel')}</button>
          <button className="btn-primary" onClick={() => { if(sn.title&&sn.command) onSave(sn) }}>{L('Зберегти','Save')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Snippets Panel ───────────────────────────────────────────────────────────
export default function SnippetsPanel({
  onInsert, onRun, onOpenDoc,
}: {
  onInsert:  (cmd: string) => void
  onRun:     (cmd: string) => void
  onOpenDoc: (doc: SnipDocState) => void
}) {
  const { t, lang } = useLanguage()
  const { theme }   = useTheme()
  const termBg      = theme?.xterm?.background ?? '#0c0c0c'
  const termGreen   = theme?.xterm?.green      ?? '#4caf77'

  const [tab,           setTab]           = useState<Tab>('mine')
  const [search,        setSearch]        = useState('')
  const [userSnips,     setUserSnips]     = useState<UserSnippet[]>([])
  const [editing,       setEditing]       = useState<EditingSnippet | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [customPacks,   setCustomPacks]   = useState<SnippetPack[]>(loadCustomPacks)
  const [packSettings,  setPackSettings]  = useState<PackSettings>(loadPackSettings)
  const importRef = useRef<HTMLInputElement>(null)

  const L = useCallback((uk: string, en: string) => lang === 'uk' ? uk : en, [lang])

  const allPacks = [BUILTIN_PACK, ...customPacks]

  useEffect(() => { savePackSettings(packSettings) }, [packSettings])
  useEffect(() => { saveCustomPacks(customPacks)   }, [customPacks])
  useEffect(() => { nt?.getSnippets().then((s: UserSnippet[]) => setUserSnips(s || [])) }, [])

  // Resolve ordered, visible groups
  const orderedGroups = (() => {
    const allGroupKeys = allPacks.flatMap(p => p.groups.map(g => ({ key: gkey(p.id, g.id), pack: p, group: g })))
    const order = packSettings.groupOrder
    if (order.length === 0) return allGroupKeys
    const keyed   = Object.fromEntries(allGroupKeys.map(x => [x.key, x]))
    const ordered = order.map(k => keyed[k]).filter(Boolean)
    const inOrder = new Set(order)
    const extra   = allGroupKeys.filter(x => !inOrder.has(x.key))
    return [...ordered, ...extra]
  })().filter(x => !packSettings.hiddenGroupKeys.includes(x.key))

  const saveSnippet = async (sn: EditingSnippet) => {
    await nt?.saveSnippet(sn)
    setUserSnips(prev => {
      const idx = prev.findIndex(x => x.id === sn.id)
      if (idx >= 0) { const a = [...prev]; a[idx] = sn; return a }
      return [...prev, sn]
    })
    setEditing(null)
  }

  const deleteSnippet = async (id: string) => {
    await nt?.deleteSnippet(id)
    setUserSnips(prev => prev.filter(s => s.id !== id))
  }

  const newSnippet = (): EditingSnippet => ({
    id: Date.now().toString(), title: '', command: '', description: '', options: [], examples: [],
  })

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json: SnPackFile = JSON.parse(ev.target?.result as string)
        if (json.type !== 'senu-snpack' || !json.pack?.id) { alert(L('Невалідний формат файлу .snpack','Invalid .snpack file format')); return }
        setCustomPacks(prev => [...prev.filter(p => p.id !== json.pack.id), { ...json.pack, builtin: false }])
      } catch { alert(L('Помилка читання файлу','Failed to read file')) }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const saveFromLibrary = (item: SnippetItem) => {
    saveSnippet({
      id: Date.now().toString(),
      title: (lang === 'uk' && item.titleUk) ? item.titleUk : item.title,
      command: item.command,
      description: (lang === 'uk' && item.descriptionUk) ? item.descriptionUk : item.description,
    })
  }

  const q = search.toLowerCase()
  const filteredUserSnips = userSnips.filter(s =>
    !q || s.title.toLowerCase().includes(q) || s.command.toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q)
  )
  const filteredGroups = orderedGroups.map(({ pack, group }) => ({
    pack, group,
    items: group.items.filter(it =>
      !q || it.title.toLowerCase().includes(q) || (it.titleUk||'').toLowerCase().includes(q) || it.command.toLowerCase().includes(q)
    ),
  })).filter(x => x.items.length > 0)

  return (
    <div className="snippets-panel">
      {/* Tabs */}
      <div className="snippets-tabs">
        <button className={`snip-tab ${tab==='mine'?'active':''}`} onClick={() => setTab('mine')}>{t('mySnippets')}</button>
        <button className={`snip-tab ${tab==='library'?'active':''}`} onClick={() => setTab('library')}>{t('library')}</button>
        <button className={`snip-tab ${tab==='packs'?'active':''}`} onClick={() => setTab('packs')}>{L('Пакети','Packs')}</button>
      </div>

      {tab !== 'packs' && (
        <div className="snippets-search">
          <input placeholder={t('searchSnippets')} value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="snip-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
      )}

      {/* ── Mine ── */}
      {tab === 'mine' && (
        <div className="snippets-list">
          {filteredUserSnips.length === 0 && (
            <div className="snip-empty">
              {search ? t('noMatches') : t('noSnippets').split('\n').map((ln,i) => <span key={i}>{ln}{i===0?<br/>:''}</span>)}
            </div>
          )}
          {filteredUserSnips.map(sn => (
            <div key={sn.id} className="snip-item">
              <div className="snip-title">{sn.title || <em>Untitled</em>}</div>
              <div className="snip-command" style={{ background: termBg, color: termGreen }}>{sn.command}</div>
              {sn.description && <div className="snip-desc">{sn.description}</div>}
              <div className="snip-actions">
                <button className="snip-btn snip-insert" onClick={() => onInsert(sn.command)}>Insert</button>
                <button className="snip-btn snip-run"    onClick={() => onRun(sn.command)}>▶ Run</button>
                <button className="snip-btn snip-edit"   onClick={() => setEditing({ ...sn, options: [], examples: [] })}>✏</button>
                <button className="snip-btn snip-del"    onClick={() => deleteSnippet(sn.id)}>🗑</button>
              </div>
            </div>
          ))}
          <button className="snip-add-btn" onClick={() => setEditing(newSnippet())}>+ {L('Новий сніпет','New Snippet')}</button>
        </div>
      )}

      {/* ── Library ── */}
      {tab === 'library' && (
        <div className="snippets-list">
          {filteredGroups.map(({ pack, group, items }) => {
            const groupKey  = gkey(pack.id, group.id)
            const groupName = lang === 'uk' && group.nameUk ? group.nameUk : group.name
            const isExpanded = expandedGroup === groupKey
            return (
              <div key={groupKey} className="snip-category">
                <div
                  className={`snip-cat-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedGroup(prev => prev === groupKey ? null : groupKey)}
                >
                  <span>{groupName}</span>
                  <span className="snip-cat-count">{items.length}</span>
                  <span className="snip-cat-arrow">{isExpanded ? '▾' : '▸'}</span>
                </div>
                {isExpanded && items.map(it => {
                  const title  = lang === 'uk' && it.titleUk ? it.titleUk : it.title
                  const hasDoc = it.description || it.syntax || it.options?.length || it.examples?.length
                  return (
                    <div key={it.id} className="snip-item snip-lib-item">
                      <div className="snip-title">{title}</div>
                      <div className="snip-command" style={{ background: termBg, color: termGreen }}>{it.command}</div>
                      <div className="snip-actions">
                        <button className="snip-btn snip-insert" onClick={() => onInsert(it.command)}>Insert</button>
                        <button className="snip-btn snip-run"    onClick={() => onRun(it.command)}>▶ Run</button>
                        <button className="snip-btn snip-save-lib" onClick={() => saveFromLibrary(it)}>+ {L('Зберегти',t('save'))}</button>
                        {hasDoc && (
                          <button
                            className="snip-btn snip-details-btn"
                            onClick={() => onOpenDoc({
                              item: it,
                              groupName,
                              groupIcon: group.icon,
                              relatedItems: group.items.filter(x => x.id !== it.id).slice(0, 8),
                            })}
                          >{L('Докладніше','Details')} →</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {filteredGroups.length === 0 && <div className="snip-empty">{t('noMatches')}</div>}

          {/* ── Catalog packs section ── */}
          {!search && <CatalogPacksSection lang={lang} onOpenCatalog={onOpenDoc} />}
        </div>
      )}

      {/* ── Packs ── */}
      {tab === 'packs' && (
        <>
          <input ref={importRef} type="file" accept=".snpack,.json" style={{ display: 'none' }} onChange={handleImportFile} />
          <div className="snippets-list">
            <PackManager
              packs={allPacks} settings={packSettings}
              onSettingsChange={setPackSettings}
              onImport={() => importRef.current?.click()}
              onDeletePack={id => setCustomPacks(prev => prev.filter(p => p.id !== id))}
              lang={lang}
            />
          </div>
        </>
      )}

      {editing && (
        <EditSnippetModal
          editing={editing} isNew={!userSnips.some(s => s.id === editing.id)}
          onClose={() => setEditing(null)} onSave={saveSnippet} lang={lang}
        />
      )}
    </div>
  )
}
