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

import React, { useState, useEffect, useRef, useCallback } from 'react'
import './chat.css'
import type { ChatContact, ChatIdentity, ChatMessage, OnlineUser } from '../bridge'

declare const window: Window & { nextterm: any }
const nt = () => window.nextterm

// ─── Exported types ───────────────────────────────────────────────────────────

export type { ChatContact, ChatIdentity, ChatMessage, OnlineUser }

export interface ChatThreadState {
  contact: ChatContact
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcoPencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IcoPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IcoTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)
const IcoCopy = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const IcoSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)
const IcoLock = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const IcoTerminal = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatFingerprint(b64: string): string {
  // Group base64 pubkey into 4-char chunks for visual comparison.
  return (b64 || '').replace(/=+$/, '').match(/.{1,4}/g)?.join(' ') ?? ''
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── ChatPanel (sidebar) ──────────────────────────────────────────────────────

interface ChatPanelProps {
  sessionId: string | null
  visible: boolean
  onOpenThread: (state: ChatThreadState) => void
  lang?: string
  /** Confirmation hook for destructive actions (delete contact). */
  onConfirm?: (msg: string) => Promise<boolean>
  /** Emitted whenever total unread count crosses 0 (true = has unread). */
  onUnreadChange?: (hasUnread: boolean) => void
}

export function ChatPanel({ sessionId, visible, onOpenThread, onConfirm, onUnreadChange }: ChatPanelProps) {
  const [identity, setIdentity]         = useState<ChatIdentity | null>(null)
  const [contacts, setContacts]         = useState<ChatContact[]>([])
  const [online, setOnline]             = useState<OnlineUser[]>([])
  const [editingName, setEditingName]   = useState(false)
  const [nameInput, setNameInput]       = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [addPubkey, setAddPubkey]       = useState('')
  const [addName, setAddName]           = useState('')
  const [copied, setCopied]             = useState(false)
  const [unread, setUnread]             = useState<Record<string, number>>({})

  // Notify parent (App → StatusBar) whenever the unread state crosses 0,
  // so the status bar dot lights up / fades. Recompute on every change to
  // the per-contact map; the parent only stores the boolean.
  useEffect(() => {
    const hasUnread = Object.values(unread).some(n => n > 0)
    onUnreadChange?.(hasUnread)
  }, [unread, onUnreadChange])

  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const onlineIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load identity + contacts on mount
  useEffect(() => {
    nt().chatGetIdentity().then((id: ChatIdentity) => {
      setIdentity(id)
      setNameInput(id.display_name)
    }).catch(() => {})
    nt().chatListContacts().then(setContacts).catch(() => {})
  }, [])

  // Presence announcement + message polling when session is active
  useEffect(() => {
    if (!sessionId || !visible) return

    const announcePresence = () => {
      nt().chatAnnouncePresence(sessionId).catch(() => {})
    }
    const pollOnline = () => {
      nt().chatGetOnline(sessionId).then(setOnline).catch(() => {})
    }
    const pollMessages = () => {
      nt().chatPollMessages(sessionId).then((msgs: ChatMessage[]) => {
        if (msgs.length === 0) return
        // Dedup by message id BEFORE bumping the unread counter / writing
        // to sessionStorage. Without this, any backend that returns a
        // message twice (e.g. the inbox `rm` failed due to permissions and
        // the same file gets re-read every 5s) inflates the counter
        // indefinitely. The thread-view poll already does this; mirror it
        // here so the contacts overview is bug-symmetric.
        const fresh: ChatMessage[] = []
        for (const m of msgs) {
          const key = `chat-msgs-${m.from_pubkey_b64}`
          const existing: ChatMessage[] = JSON.parse(sessionStorage.getItem(key) ?? '[]')
          if (existing.some(e => e.id === m.id)) continue
          existing.push(m)
          sessionStorage.setItem(key, JSON.stringify(existing))
          fresh.push(m)
        }
        if (fresh.length === 0) return
        setUnread(prev => {
          const next = { ...prev }
          for (const m of fresh) {
            next[m.from_pubkey_b64] = (next[m.from_pubkey_b64] ?? 0) + 1
          }
          return next
        })
      }).catch(() => {})
    }

    announcePresence()
    pollOnline()
    pollMessages()

    presenceIntervalRef.current = setInterval(announcePresence, 60_000)
    onlineIntervalRef.current   = setInterval(pollOnline,       15_000)
    pollIntervalRef.current     = setInterval(pollMessages,     5_000)

    return () => {
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current)
      if (onlineIntervalRef.current)   clearInterval(onlineIntervalRef.current)
      if (pollIntervalRef.current)     clearInterval(pollIntervalRef.current)
      // Tell the server we're leaving: removes our presence beacon AND
      // wipes our remaining inbox so a third party can't accumulate
      // ciphertexts there indefinitely. Best-effort — fire-and-forget.
      if (sessionId) void nt().chatLeave(sessionId).catch(() => {})
    }
  }, [sessionId, visible])

  const saveName = useCallback(() => {
    const name = nameInput.trim()
    if (!name) return
    nt().chatSetDisplayName(name).then((id: ChatIdentity) => {
      setIdentity(id)
      setEditingName(false)
    }).catch(() => {})
  }, [nameInput])

  const copyId = useCallback(() => {
    if (!identity) return
    navigator.clipboard.writeText(identity.pubkey_b64).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [identity])

  const addContact = useCallback(() => {
    const pk = addPubkey.trim()
    const nm = addName.trim()
    if (!pk || !nm) return
    nt().chatAddContact(pk, nm).then((c: ChatContact) => {
      setContacts(prev => {
        const without = prev.filter(x => x.pubkey_b64 !== c.pubkey_b64)
        return [...without, c]
      })
      setAddPubkey('')
      setAddName('')
      setAddingContact(false)
    }).catch(() => {})
  }, [addPubkey, addName])

  const removeContact = useCallback(async (pubkey_b64: string) => {
    const contact = contacts.find(c => c.pubkey_b64 === pubkey_b64)
    const name = contact?.display_name || contact?.short_id || 'this contact'
    const msg = `Remove "${name}" from contacts? Their messages will stop arriving.`
    const ok = onConfirm ? await onConfirm(msg) : window.confirm(msg)
    if (!ok) return
    nt().chatRemoveContact(pubkey_b64).then(() => {
      setContacts(prev => prev.filter(c => c.pubkey_b64 !== pubkey_b64))
    }).catch(() => {})
  }, [contacts, onConfirm])

  const openThread = useCallback((contact: ChatContact) => {
    setUnread(prev => { const n = { ...prev }; delete n[contact.pubkey_b64]; return n })
    onOpenThread({ contact })
  }, [onOpenThread])

  const isOnline = (pubkey_b64: string) =>
    online.some(u => u.pubkey_b64 === pubkey_b64)

  // Merge online-but-not-in-contacts users so they're visible
  const onlineNotInContacts = online.filter(u =>
    !contacts.some(c => c.pubkey_b64 === u.pubkey_b64) &&
    u.pubkey_b64 !== identity?.pubkey_b64
  )

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-header-title">Чат</span>
        <div className="chat-header-actions">
          <button
            className="chat-icon-btn"
            title="Додати контакт"
            onClick={() => setAddingContact(true)}
          >
            <IcoPlus />
          </button>
        </div>
      </div>

      {/* Identity card */}
      {identity && (
        <div className="chat-identity-card">
          <div className="chat-id-row">
            <div className="chat-avatar">{initials(identity.display_name || '?')}</div>
            <div className="chat-id-info">
              <div className={`chat-id-name${!identity.display_name ? ' chat-id-name--placeholder' : ''}`}>
                {identity.display_name || 'Вкажіть ім\'я…'}
              </div>
              <div className="chat-id-short">ID: {identity.short_id}</div>
            </div>
            <button className="chat-id-edit-btn" title="Змінити ім'я" onClick={() => setEditingName(v => !v)}>
              <IcoPencil />
            </button>
          </div>

          {editingName && (
            <div className="chat-name-edit">
              <input
                className="chat-name-input"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                placeholder="Ваше ім'я…"
                autoFocus
              />
              <button className="chat-name-save" onClick={saveName}>OK</button>
            </div>
          )}

          {/* Share ID */}
          <div className="chat-share-row">
            <span className="chat-share-label">ID</span>
            <span className="chat-share-id" title={identity.pubkey_b64}>
              {identity.pubkey_b64.slice(0, 28)}…
            </span>
            <button className={`chat-copy-btn${copied ? ' copied' : ''}`} onClick={copyId} title="Скопіювати публічний ключ">
              {copied ? '✓' : <IcoCopy />}
            </button>
          </div>
        </div>
      )}

      {!sessionId && (
        <div className="chat-no-session">
          Підключіться до SSH-сервера,<br/>щоб побачити хто онлайн
        </div>
      )}

      {/* Online now */}
      {sessionId && (
        <div className="chat-online-list">
          <div className="chat-section-label">Зараз онлайн</div>
          {online.filter(u => u.pubkey_b64 !== identity?.pubkey_b64).length === 0 ? (
            <div className="chat-online-empty">Поки нікого немає</div>
          ) : (
            <>
              {onlineNotInContacts.map(u => (
                <div
                  key={u.pubkey_b64}
                  className="chat-user-item"
                  onClick={() => {
                    // Auto-add to contacts if not there
                    nt().chatAddContact(u.pubkey_b64, u.display_name).then((c: ChatContact) => {
                      setContacts(prev => {
                        const without = prev.filter(x => x.pubkey_b64 !== c.pubkey_b64)
                        return [...without, c]
                      })
                      openThread(c)
                    }).catch(() => {})
                  }}
                >
                  <div className="chat-user-avatar online">
                    {initials(u.display_name)}
                    <span className="chat-online-dot" />
                  </div>
                  <div className="chat-user-info">
                    <div className="chat-user-name">{u.display_name}</div>
                    <div className="chat-user-short">{u.short_id}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Contacts list */}
      <div className="chat-section-label">Контакти</div>
      <div className="chat-contacts-list">
        {contacts.length === 0 && (
          <div className="chat-no-session" style={{ paddingTop: 10 }}>
            Немає контактів.<br/>Додайте за публічним ключем.
          </div>
        )}
        {contacts.map(c => (
          <div
            key={c.pubkey_b64}
            className="chat-user-item"
            onClick={() => openThread(c)}
          >
            <div className={`chat-user-avatar${isOnline(c.pubkey_b64) ? ' online' : ''}`}>
              {initials(c.display_name)}
              {isOnline(c.pubkey_b64) && <span className="chat-online-dot" />}
            </div>
            <div className="chat-user-info">
              <div className="chat-user-name">{c.display_name}</div>
              <div className="chat-user-short">{c.short_id}</div>
            </div>
            {(unread[c.pubkey_b64] ?? 0) > 0 && (
              <span className="chat-user-badge">{unread[c.pubkey_b64]}</span>
            )}
            <button
              className="chat-icon-btn"
              title="Видалити контакт"
              onClick={e => { e.stopPropagation(); removeContact(c.pubkey_b64) }}
              style={{ opacity: 0.4, fontSize: 11 }}
            >
              <IcoTrash />
            </button>
          </div>
        ))}
      </div>

      {/* Add contact */}
      <div className="chat-add-row">
        {addingContact ? (
          <div className="chat-add-form">
            <input
              className="chat-add-input chat-add-input--mono"
              value={addPubkey}
              onChange={e => setAddPubkey(e.target.value)}
              placeholder="Публічний ключ (base64)…"
              autoFocus
            />
            <input
              className="chat-add-input"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addContact(); if (e.key === 'Escape') setAddingContact(false) }}
              placeholder="Ім'я контакту…"
            />
            <div className="chat-add-actions">
              <button className="chat-add-cancel" onClick={() => { setAddingContact(false); setAddPubkey(''); setAddName('') }}>
                Скасувати
              </button>
              <button className="chat-add-confirm" onClick={addContact}>Додати</button>
            </div>
          </div>
        ) : (
          <button className="chat-add-btn" onClick={() => setAddingContact(true)}>
            <IcoPlus /> Додати контакт
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ChatThreadView (central screen overlay) ──────────────────────────────────

interface ChatThreadViewProps {
  state: ChatThreadState
  sessionId: string | null
  onClose: () => void
}

export function ChatThreadView({ state, sessionId, onClose }: ChatThreadViewProps) {
  const { contact } = state
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [draft, setDraft]         = useState('')
  const [sending, setSending]     = useState(false)
  const [identity, setIdentity]   = useState<ChatIdentity | null>(null)
  const [online, setOnline]       = useState<OnlineUser[]>([])
  const [showVerify, setShowVerify] = useState(false)
  const [copied, setCopied]       = useState<'mine' | 'theirs' | null>(null)
  const messagesEndRef            = useRef<HTMLDivElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)
  const onlineRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const presenceRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load persisted messages from sessionStorage for this contact
  useEffect(() => {
    const key = `chat-msgs-${contact.pubkey_b64}`
    const stored: ChatMessage[] = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    setMessages(stored)
  }, [contact.pubkey_b64])

  // Load identity
  useEffect(() => {
    nt().chatGetIdentity().then(setIdentity).catch(() => {})
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Polling
  useEffect(() => {
    if (!sessionId) return

    const pollMessages = () => {
      nt().chatPollMessages(sessionId).then((msgs: ChatMessage[]) => {
        if (msgs.length === 0) return
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const newMsgs = msgs.filter(m => !ids.has(m.id))
          if (newMsgs.length === 0) return prev
          const updated = [...prev, ...newMsgs]
          // Persist
          for (const m of newMsgs) {
            const key = `chat-msgs-${m.from_pubkey_b64}`
            const existing: ChatMessage[] = JSON.parse(sessionStorage.getItem(key) ?? '[]')
            if (!existing.find(x => x.id === m.id)) {
              existing.push(m)
              sessionStorage.setItem(key, JSON.stringify(existing))
            }
          }
          return updated
        })
      }).catch(() => {})
    }

    const pollOnline = () => nt().chatGetOnline(sessionId).then(setOnline).catch(() => {})
    const announcePresence = () => nt().chatAnnouncePresence(sessionId).catch(() => {})

    pollMessages()
    pollOnline()

    pollRef.current     = setInterval(pollMessages,     5_000)
    onlineRef.current   = setInterval(pollOnline,       15_000)
    presenceRef.current = setInterval(announcePresence, 60_000)

    return () => {
      if (pollRef.current)     clearInterval(pollRef.current)
      if (onlineRef.current)   clearInterval(onlineRef.current)
      if (presenceRef.current) clearInterval(presenceRef.current)
    }
  }, [sessionId])

  const isOnline = online.some(u => u.pubkey_b64 === contact.pubkey_b64)

  const send = useCallback(async () => {
    const content = draft.trim()
    if (!content || !sessionId || sending) return
    setSending(true)
    try {
      await nt().chatSendMessage(sessionId, contact.pubkey_b64, content, false)
      const myId = identity?.pubkey_b64 ?? 'me'
      const outgoing: ChatMessage = {
        id:              crypto.randomUUID(),
        from_pubkey_b64: myId,
        from_name:       identity?.display_name ?? 'Ви',
        content,
        timestamp:       Math.floor(Date.now() / 1000),
        is_snippet:      false,
      }
      setMessages(prev => [...prev, outgoing])
      setDraft('')
    } catch (e) {
      console.error('chat send error', e)
    } finally {
      setSending(false)
    }
  }, [draft, sessionId, sending, contact.pubkey_b64, identity])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Auto-resize textarea
  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const isMine = (m: ChatMessage) =>
    m.from_pubkey_b64 === identity?.pubkey_b64 || m.from_name === (identity?.display_name ?? '')

  return (
    <div className="ct-stage">
      {/* Topbar */}
      <div className="ct-topbar">
        <button className="ct-back-btn" onClick={onClose}>← Назад</button>
        <div className={`ct-topbar-avatar${isOnline ? ' online' : ''}`}>
          {initials(contact.display_name)}
        </div>
        <div className="ct-topbar-info">
          <div className="ct-topbar-name">{contact.display_name}</div>
          <div className={`ct-topbar-status${isOnline ? ' online' : ''}`}>
            {isOnline ? '● онлайн' : '○ офлайн'}
          </div>
        </div>
        {sessionId && (
          <div className="ct-server-tag" title="SSH-сервер як relay">
            via SSH
          </div>
        )}
        <button
          className="ct-e2e-badge"
          onClick={() => setShowVerify(true)}
          title="X25519 ECDH + AES-256-GCM · forward secrecy. Натисніть, щоб звірити відбитки ключів."
        >
          <IcoLock />
          <span>E2E</span>
        </button>
      </div>

      {showVerify && (
        <div className="ct-verify-overlay" onClick={() => setShowVerify(false)}>
          <div className="ct-verify-modal" onClick={e => e.stopPropagation()}>
            <div className="ct-verify-header">
              <div className="ct-verify-title">
                <IcoLock /> Звірка ключів (E2E)
              </div>
              <button className="ct-verify-close" onClick={() => setShowVerify(false)}>×</button>
            </div>
            <div className="ct-verify-desc">
              Звірте відбитки <b>поза цим каналом</b> (телефон, особиста зустріч), щоб переконатись, що між вами немає посередника. Алгоритм: <code>X25519 ECDH + AES-256-GCM</code>, ефемерний ключ на повідомлення (forward secrecy).
            </div>

            <div className="ct-verify-block">
              <div className="ct-verify-label">
                {contact.display_name} <span className="ct-verify-shortid">#{contact.short_id}</span>
              </div>
              <div className="ct-verify-fp">{formatFingerprint(contact.pubkey_b64)}</div>
              <button
                className="ct-verify-copy"
                onClick={() => {
                  navigator.clipboard.writeText(contact.pubkey_b64).catch(() => {})
                  setCopied('theirs'); setTimeout(() => setCopied(null), 1200)
                }}
              >
                <IcoCopy /> {copied === 'theirs' ? 'Скопійовано' : 'Скопіювати'}
              </button>
            </div>

            <div className="ct-verify-block">
              <div className="ct-verify-label">
                Ви {identity?.display_name ? `(${identity.display_name})` : ''}
                {identity?.short_id && <span className="ct-verify-shortid">#{identity.short_id}</span>}
              </div>
              <div className="ct-verify-fp">{formatFingerprint(identity?.pubkey_b64 ?? '')}</div>
              <button
                className="ct-verify-copy"
                onClick={() => {
                  if (identity?.pubkey_b64) {
                    navigator.clipboard.writeText(identity.pubkey_b64).catch(() => {})
                    setCopied('mine'); setTimeout(() => setCopied(null), 1200)
                  }
                }}
              >
                <IcoCopy /> {copied === 'mine' ? 'Скопійовано' : 'Скопіювати'}
              </button>
            </div>

            <div className="ct-verify-foot">
              SENU не має сервера, який міг би зчитати ваші повідомлення. Сервер бачить лише шифротекст і пересилає його через спільний SSH-канал.
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {!sessionId ? (
        <div className="ct-no-session">
          <IcoLock />
          Підключіться до SSH-сервера,<br/>щоб надсилати повідомлення
        </div>
      ) : (
        <div className="ct-messages">
          {messages.length === 0 && (
            <div className="ct-messages-empty">
              Почніть розмову.<br/>
              <span style={{ fontSize: 10 }}>Повідомлення зашифровані та не зберігаються.</span>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`ct-msg ${isMine(m) ? 'ct-msg--mine' : 'ct-msg--theirs'}`}>
              <div className="ct-msg-meta">
                <span className="ct-msg-name">{isMine(m) ? 'Ви' : m.from_name}</span>
                <span className="ct-msg-time">{formatTime(m.timestamp)}</span>
              </div>
              {m.is_snippet ? (
                <div className="ct-snippet">
                  <div className="ct-snippet-header">
                    <IcoTerminal />
                    Terminal output
                  </div>
                  <div className="ct-snippet-body">{m.content}</div>
                </div>
              ) : (
                <div className="ct-bubble">{m.content}</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Encryption notice */}
      <div className="ct-enc-notice">
        <IcoLock />
        End-to-end зашифровано · X25519 + AES-256-GCM · повідомлення не зберігаються
      </div>

      {/* Composer */}
      {sessionId && (
        <div className="ct-composer">
          <div className="ct-composer-inner">
            <textarea
              ref={textareaRef}
              className="ct-composer-textarea"
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={onKeyDown}
              placeholder={`Написати ${contact.display_name}… (Enter — надіслати, Shift+Enter — новий рядок)`}
              rows={1}
            />
            <button
              className="ct-send-btn"
              onClick={send}
              disabled={!draft.trim() || sending}
              title="Надіслати"
            >
              <IcoSend />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
