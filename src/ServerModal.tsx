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
import { useAchievements } from './Achievements'
import { Ico } from './icons'
import { CONN_TYPES, type DockerContainer, type Server } from './types'

const nt = window.nextterm

// --- SSH Key Picker ---
const KEY_TYPE_LABEL: Record<string, string> = {
  openssh: 'OpenSSH', pem: 'PEM', ppk: 'PPK',
  ed25519: 'Ed25519', ecdsa: 'ECDSA', rsa: 'RSA', dsa: 'DSA',
  private: 'Private key',
  public: '⚠ Public key', unknown: '⚠ Unknown',
}

interface SshKey { name: string; path: string; keyType: string; encrypted: boolean }

function SshKeyPicker({
  value, onChange, onEncryptedChange,
}: {
  value: string
  onChange: (path: string) => void
  onEncryptedChange?: (encrypted: boolean) => void
}) {
  const { t } = useLanguage()
  const achCtx = useAchievements()
  const [keys, setKeys] = useState<SshKey[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genForm, setGenForm] = useState({ type: 'ed25519' as 'ed25519' | 'rsa', name: 'id_ed25519', passphrase: '' })
  const [genResult, setGenResult] = useState<string | null>(null)

  const reloadKeys = () => {
    nt?.listSshKeys().then((list: SshKey[]) => setKeys(list || []))
  }

  useEffect(() => {
    nt?.listSshKeys().then((list: SshKey[]) => { setKeys(list || []); setLoading(false) })
  }, [])

  const browse = async () => {
    console.log('[ServerModal] browse: opening SSH key picker…')
    let result: { path: string; keyType: string; encrypted: boolean } | null | undefined
    try {
      result = await nt?.selectSshKey()
    } catch (e) {
      console.error('[ServerModal] browse threw:', e)
      setWarning(`Не вдалося відкрити файловий діалог: ${e}`)
      return
    }
    console.log('[ServerModal] browse result:', result)
    if (!result) return
    const { path: filePath, keyType, encrypted } = result
    if (keyType === 'public') {
      setWarning(`"${filePath.split(/[/\\]/).pop()}" — це ПУБЛІЧНИЙ ключ, він не підходить для входу. Оберіть приватний ключ (без .pub).`)
      return
    }
    if (keyType === 'unknown') {
      setWarning(`Не вдалося визначити тип ключа. Переконайтесь що це OpenSSH або PEM приватний ключ.`)
    } else {
      setWarning('')
    }
    onChange(filePath)
    onEncryptedChange?.(encrypted)
  }

  const selectKey = (k: SshKey) => {
    if (value === k.path) { onChange(''); setWarning(''); onEncryptedChange?.(false); return }
    setWarning('')
    onChange(k.path)
    onEncryptedChange?.(k.encrypted)
  }

  const filename = value ? value.split(/[/\\]/).pop() : ''
  const selectedKey = keys.find(k => k.path === value)

  return (
    <div className="key-picker">
      {!loading && keys.length > 0 && (
        <div className="key-list">
          {keys.map(k => (
            <div key={k.path} className={`key-item ${value === k.path ? 'active' : ''}`} onClick={() => selectKey(k)}>
              <span className="key-icon">{Ico.key(14)}</span>
              <span className="key-name">{k.name}</span>
              <span className="key-type-badge">{KEY_TYPE_LABEL[k.keyType] || k.keyType}</span>
              {k.encrypted && <span className="key-enc-badge">passphrase</span>}
              {value === k.path && <span className="key-check">✓</span>}
            </div>
          ))}
        </div>
      )}
      {!loading && keys.length === 0 && <div className="key-empty">{t('noKeysFound')}</div>}

      <div className="key-browse-row">
        <button type="button" className="btn-secondary btn-key-browse" onClick={(e) => { e.preventDefault(); e.stopPropagation(); browse() }}>
          {Ico.folder(13)} {value
            ? `${filename}${selectedKey?.encrypted ? ' (passphrase)' : ''}`
            : t('chooseKeyFile')}
        </button>
        {value && <button className="btn-clear-key" onClick={() => { onChange(''); setWarning(''); onEncryptedChange?.(false) }}>✕</button>}
        <button className="btn-secondary btn-genkey" onClick={() => { setGenerating(v => !v); setGenResult(null) }}>
          {t('generateKey')}
        </button>
      </div>

      {/* Key generation panel */}
      {generating && (
        <div className="keygen-panel">
          <div className="keygen-row">
            <label>{t('keyType')}</label>
            <select value={genForm.type} onChange={e => {
              const t = e.target.value as 'ed25519' | 'rsa'
              setGenForm(f => ({ ...f, type: t, name: t === 'rsa' ? 'id_rsa' : 'id_ed25519' }))
            }}>
              <option value="ed25519">{t('keyTypeEd25519')}</option>
              <option value="rsa">{t('keyTypeRsa')}</option>
            </select>
          </div>
          <div className="keygen-row">
            <label>{t('keyFilename')}</label>
            <input value={genForm.name} onChange={e => setGenForm(f => ({ ...f, name: e.target.value }))} placeholder="id_ed25519" />
          </div>
          <div className="keygen-row">
            <label>{t('keyPassphrase')}</label>
            <input type="password" value={genForm.passphrase} onChange={e => setGenForm(f => ({ ...f, passphrase: e.target.value }))} placeholder={t('optional')} />
          </div>
          <button className="btn-primary btn-genkey-run" onClick={async () => {
            try {
              const res = await nt?.generateSshKey(genForm.type, genForm.name, genForm.passphrase || undefined)
              if (res) {
                achCtx?.trackEvent({ type: 'keygen' })
                setGenResult(`${t('keyGenerated')}${res.private_path}`)
                onChange(res.private_path)
                onEncryptedChange?.(!!genForm.passphrase)
                reloadKeys()
                setGenerating(false)
              }
            } catch (e: unknown) {
              setGenResult(`${t('keyGenError')}${e instanceof Error ? e.message : String(e)}`)
            }
          }}>{t('generateKeyPair')}</button>
          {genResult && <div className={`keygen-result ${genResult.startsWith('✓') ? 'ok' : 'err'}`}>{genResult}</div>}
        </div>
      )}

      {warning && <div className="key-warning">⚠ {warning}</div>}
    </div>
  )
}

// --- Server Modal (Add + Edit) ---
export function ServerModal({
  existing, onSave, onClose,
}: {
  existing?: Server
  onSave: (s: Server, connect: boolean) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const isEdit = !!existing
  const initMode = existing?.useAgent ? 'agent' : existing?.privateKeyPath ? 'key' : 'password'
  const [form, setForm] = useState({
    name: existing?.name || '',
    host: existing?.host || '',
    port: String(existing?.port || '22'),
    username: existing?.username || '',
    password: existing?.password || '',
    privateKeyPath: existing?.privateKeyPath || '',
    passphrase: existing?.passphrase || '',
    color: existing?.color || '#00d4aa',
  })
  const [authMode, setAuthMode] = useState<'password' | 'key' | 'agent'>(initMode)
  const [keyEncrypted, setKeyEncrypted] = useState(false)
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null)
  const [forwardAgent, setForwardAgent] = useState(!!existing?.forwardAgent)
  const [useJump, setUseJump] = useState(!!existing?.jumpHost)
  const [jump, setJump] = useState({
    host: existing?.jumpHost?.host || '',
    port: String(existing?.jumpHost?.port || '22'),
    username: existing?.jumpHost?.username || '',
    password: existing?.jumpHost?.password || '',
    privateKeyPath: existing?.jumpHost?.privateKeyPath || '',
    authMode: existing?.jumpHost?.useAgent ? 'agent' : existing?.jumpHost?.privateKeyPath ? 'key' : 'password' as 'password' | 'key' | 'agent',
  })
  const colors = ['#00d4aa', '#7c6af7', '#f7706a', '#f0a500', '#4fc3f7', '#e91e8c']

  // ── New connection types ─────────────────────────────────────────────────
  const [connType, setConnType] = useState<NonNullable<Server['connType']>>(existing?.connType ?? 'ssh')
  const [availableShells, setAvailableShells] = useState<string[]>([])
  const [serialPorts, setSerialPorts] = useState<string[]>([])
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([])
  const [serialPort, setSerialPort] = useState(existing?.serialPort ?? '')
  const [baudRate, setBaudRate] = useState(String(existing?.baudRate ?? 9600))
  const [localShell, setLocalShell] = useState(existing?.localShell ?? '')
  const [asAdmin, setAsAdmin] = useState(existing?.asAdmin ?? false)
  const [dockerContainer, setDockerContainer] = useState(existing?.dockerContainer ?? '')
  const [dockerShell, setDockerShell] = useState(existing?.dockerShell ?? 'sh')

  // Перевіряємо SSH agent при відкритті
  useEffect(() => {
    nt?.detectSshAgent().then((r: { available: boolean }) => setAgentAvailable(r?.available ?? false))
  }, [])

  // Fetch available shells / ports / containers
  useEffect(() => {
    nt?.listShells().then((shells: string[]) => {
      setAvailableShells(shells)
      if (!localShell && shells.length > 0) setLocalShell(shells[0])
    }).catch(() => {})
    nt?.serialListPorts().then(setSerialPorts).catch(() => {})
    nt?.dockerListContainers().then(setDockerContainers).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildServer = (): Server => ({
    id: existing?.id || Date.now().toString(),
    name: form.name || (connType === 'local' ? 'Local Shell' : connType === 'docker' ? dockerContainer : connType === 'serial' ? serialPort : form.host),
    host: form.host,
    port: parseInt(form.port) || 22,
    username: form.username,
    useAgent: connType === 'ssh' && authMode === 'agent' || undefined,
    forwardAgent: connType === 'ssh' && forwardAgent || undefined,
    password: connType === 'ssh' && authMode === 'password' ? (form.password || undefined) : undefined,
    privateKeyPath: connType === 'ssh' && authMode === 'key' ? (form.privateKeyPath || undefined) : undefined,
    passphrase: connType === 'ssh' && authMode === 'key' ? (form.passphrase || undefined) : undefined,
    color: form.color,
    jumpHost: connType === 'ssh' && useJump && jump.host && jump.username ? {
      host: jump.host,
      port: parseInt(jump.port) || 22,
      username: jump.username,
      useAgent: jump.authMode === 'agent' || undefined,
      password: jump.authMode === 'password' ? (jump.password || undefined) : undefined,
      privateKeyPath: jump.authMode === 'key' ? (jump.privateKeyPath || undefined) : undefined,
    } : undefined,
    connType,
    serialPort: connType === 'serial' ? serialPort : undefined,
    baudRate: connType === 'serial' ? (parseInt(baudRate) || 9600) : undefined,
    localShell: connType === 'local' ? localShell : undefined,
    asAdmin: connType === 'local' ? asAdmin : undefined,
    dockerContainer: connType === 'docker' ? dockerContainer : undefined,
    dockerShell: connType === 'docker' ? dockerShell : undefined,
  })

  const valid = connType === 'ssh' ? (!!form.host && !!form.username) :
                connType === 'telnet' ? !!form.host :
                connType === 'serial' ? !!serialPort :
                connType === 'local' ? true :
                connType === 'docker' ? !!dockerContainer : false

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{isEdit ? t('editConnection') : t('newConnection2')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* ── Connection type selector ─────────────────────────── */}
          <div className="conn-type-tabs">
            {CONN_TYPES.map(ct => (
              <button key={ct} type="button"
                className={`conn-type-tab ${connType === ct ? 'active' : ''}`}
                onClick={() => setConnType(ct)}>
                {ct === 'ssh'    && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> SSH</>}
                {ct === 'telnet' && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> Telnet</>}
                {ct === 'serial' && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Serial</>}
                {ct === 'local'  && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> Local</>}
                {ct === 'docker' && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12.5c0 .8-.7 1.5-1.5 1.5H3.5A1.5 1.5 0 0 1 2 12.5v0A1.5 1.5 0 0 1 3.5 11h17a1.5 1.5 0 0 1 1.5 1.5v0z"/><rect x="5" y="7" width="3" height="3" rx=".5"/><rect x="9" y="7" width="3" height="3" rx=".5"/><rect x="13" y="7" width="3" height="3" rx=".5"/><rect x="9" y="3" width="3" height="3" rx=".5"/><path d="M21.5 11A7.5 7.5 0 0 0 22 8.5"/></svg> Docker</>}
              </button>
            ))}
          </div>

          <label>{t('fieldName')}</label>
          <input placeholder={t('placeholderName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />

          {/* ── SSH + Telnet: host & port ─────────────────────────── */}
          {(connType === 'ssh' || connType === 'telnet') && (<>
          <label>{t('fieldHost')}</label>
          <input placeholder={t('placeholderHost')} value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} /></>)}
          {/* Port row: SSH shows port+username; Telnet shows port only */}
          {(connType === 'ssh' || connType === 'telnet') && (
          <div className="form-row">
            <div>
              <label>{t('fieldPort')}</label>
              <input placeholder="22" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
            </div>
            {connType === 'ssh' && (
            <div>
              <label>{t('fieldUsername')}</label>
              <input placeholder={t('placeholderUsername')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            )}
          </div>
          )}

          {/* ── SSH-only: auth + jump host ───────────────────────── */}
          {connType === 'ssh' && (<>
          <div className="auth-tabs">
            <button className={`auth-tab ${authMode === 'password' ? 'active' : ''}`} onClick={() => setAuthMode('password')}>{Ico.lock(13)} {t('authPassword')}</button>
            <button className={`auth-tab ${authMode === 'key' ? 'active' : ''}`} onClick={() => setAuthMode('key')}>{Ico.key(13)} {t('authKey')}</button>
            {/* Agent tab — shown only when agent is available (Pageant/OpenSSH running) */}
            {agentAvailable === true && (
              <button className={`auth-tab ${authMode === 'agent' ? 'active' : ''}`} onClick={() => setAuthMode('agent')}>
                {Ico.agent(13)} {t('authAgent')} ✓
              </button>
            )}
          </div>

          {authMode === 'password' && (
            <>
              <label>{t('fieldPassword')}</label>
              <input type="password" placeholder={t('placeholderPassword')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </>
          )}

          {authMode === 'key' && (
            <>
              <label>{t('fieldSshKey')}</label>
              <SshKeyPicker
                value={form.privateKeyPath}
                onChange={p => setForm({ ...form, privateKeyPath: p })}
                onEncryptedChange={setKeyEncrypted}
              />
              {keyEncrypted && (
                <div className="key-warning" style={{ marginBottom: 6 }}>
                  🔐 {t('encryptedKeyWarning')}
                </div>
              )}
              <label style={{ marginTop: 6 }}>
                {t('fieldPassphrase')}
                {keyEncrypted
                  ? <span style={{ color: 'var(--red)', marginLeft: 4 }}>{t('passphraseRequired')}</span>
                  : <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>{t('passphraseIfEncrypted')}</span>}
              </label>
              <input
                type="password"
                placeholder={t('placeholderPassphrase')}
                value={form.passphrase}
                onChange={e => setForm({ ...form, passphrase: e.target.value })}
                style={keyEncrypted && !form.passphrase ? { borderColor: 'var(--red)' } : {}}
              />
            </>
          )}

          {authMode === 'agent' && (
            <div className={`agent-info ${agentAvailable ? 'agent-ok' : 'agent-err'}`}>
              {agentAvailable === true && <>
                <span>✓</span>
                <div>
                  <strong>{t('agentFound')}</strong>
                  <div>{t('agentKeys')}</div>
                </div>
              </>}
              {agentAvailable === false && <>
                <span>✗</span>
                <div>
                  <strong>{t('agentNotFound')}</strong>
                  <div>{t('agentInstructions')}</div>
                </div>
              </>}
              {agentAvailable === null && <div>{t('checkingAgent')}</div>}
            </div>
          )}

          {/* ── Forward agent ─────────────────────────────────────── */}
          <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 2px' }}>
            <input type="checkbox" checked={forwardAgent} onChange={e => setForwardAgent(e.target.checked)} />
            <span>
              <strong>{t('forwardAgentLabel')}</strong>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t('forwardAgentHint')}</div>
            </span>
          </label>

          {/* ── Jump Host ─────────────────────────────────────────── */}
          <div className="jump-host-toggle" onClick={() => setUseJump(v => !v)}>
            <span className="jump-host-chevron" style={{ transform: useJump ? 'rotate(90deg)' : 'none' }}>›</span>
            <span>{t('proxyJump')}</span>
            {useJump && <span className="jump-host-badge">ON</span>}
          </div>

          {useJump && (
            <div className="jump-host-body">
              <div className="form-row">
                <div>
                  <label>{t('jumpHostLabel')}</label>
                  <input placeholder="bastion.company.com" value={jump.host}
                    onChange={e => setJump({ ...jump, host: e.target.value })} />
                </div>
                <div>
                  <label>{t('fieldPort')}</label>
                  <input placeholder="22" value={jump.port}
                    onChange={e => setJump({ ...jump, port: e.target.value })} />
                </div>
              </div>
              <label>{t('fieldUsername')}</label>
              <input placeholder="ubuntu" value={jump.username}
                onChange={e => setJump({ ...jump, username: e.target.value })} />

              <div className="auth-tabs" style={{ marginTop: 8 }}>
                <button className={`auth-tab ${jump.authMode === 'password' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'password' })}>{Ico.lock(12)} {t('authPassword')}</button>
                <button className={`auth-tab ${jump.authMode === 'key' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'key' })}>{Ico.key(12)} {t('authKey')}</button>
                <button className={`auth-tab ${jump.authMode === 'agent' ? 'active' : ''}`}
                  onClick={() => setJump({ ...jump, authMode: 'agent' })}>{Ico.agent(12)} {t('authAgent')}</button>
              </div>

              {jump.authMode === 'password' && (
                <>
                  <label>{t('fieldPassword')}</label>
                  <input type="password" placeholder={t('placeholderPassword')} value={jump.password}
                    onChange={e => setJump({ ...jump, password: e.target.value })} />
                </>
              )}
              {jump.authMode === 'key' && (
                <>
                  <label>{t('fieldSshKey')}</label>
                  <input placeholder={t('placeholderKeyPath')} value={jump.privateKeyPath}
                    onChange={e => setJump({ ...jump, privateKeyPath: e.target.value })} />
                </>
              )}
              {jump.authMode === 'agent' && (
                <div className={`agent-info ${agentAvailable ? 'agent-ok' : 'agent-err'}`}
                  style={{ margin: '6px 0 0' }}>
                  <span>{agentAvailable ? '✓' : '✗'}</span>
                  <div>{agentAvailable ? t('agentFound') : t('agentNotFound')}</div>
                </div>
              )}
            </div>
          )}

          {/* end SSH-only block */}
          </>)}

          {/* ── Serial fields ─────────────────────────────────────── */}
          {connType === 'serial' && (
            <div>
              <label>{t('serialPortLabel')}</label>
              {serialPorts.length > 0 ? (
                <select value={serialPort} onChange={e => setSerialPort(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', outline: 'none' }}>
                  <option value="">Select port…</option>
                  {serialPorts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input placeholder={t('noSerialPorts')} value={serialPort} onChange={e => setSerialPort(e.target.value)} />
              )}
              <label style={{ marginTop: 8 }}>{t('baudRateLabel')}</label>
              <select value={baudRate} onChange={e => setBaudRate(e.target.value)}
                style={{ width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', outline: 'none' }}>
                {['1200','2400','4800','9600','19200','38400','57600','115200','230400'].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Local shell fields ────────────────────────────────── */}
          {connType === 'local' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label>{t('localShellLabel')}</label>
                {availableShells.length > 0 ? (
                  <select value={localShell} onChange={e => setLocalShell(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', outline: 'none' }}>
                    {availableShells.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input placeholder="/bin/bash" value={localShell} onChange={e => setLocalShell(e.target.value)} />
                )}
              </div>
              <label className="admin-checkbox-row">
                <input type="checkbox" checked={asAdmin} onChange={e => setAsAdmin(e.target.checked)} />
                <span>🛡 {t('runAsAdmin')}</span>
                <span className="admin-checkbox-hint">{t('runAsAdminHint')}</span>
              </label>
            </div>
          )}

          {/* ── Docker fields ─────────────────────────────────────── */}
          {connType === 'docker' && (
            <div>
              <label>{t('dockerContainerLabel')}</label>
              {dockerContainers.length > 0 ? (
                <select value={dockerContainer} onChange={e => setDockerContainer(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', outline: 'none' }}>
                  <option value="">Select container…</option>
                  {dockerContainers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.image})</option>
                  ))}
                </select>
              ) : (
                <input placeholder={t('noContainers')} value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} />
              )}
              <label style={{ marginTop: 8 }}>{t('dockerShellLabel')}</label>
              <input placeholder="sh" value={dockerShell} onChange={e => setDockerShell(e.target.value)} />
            </div>
          )}

          <label>{t('fieldColor')}</label>
          <div className="color-row">
            {colors.map(c => (
              <div key={c} className={`color-dot ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          {isEdit ? (
            <>
              <button className="btn-secondary" disabled={!valid} onClick={() => valid && onSave(buildServer(), false)}>{t('save')}</button>
              <button className="btn-primary" disabled={!valid} onClick={() => valid && onSave(buildServer(), true)}>{t('saveAndConnect')}</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" disabled={!valid} onClick={() => valid && onSave(buildServer(), false)}>{t('saveOnly')}</button>
              <button className="btn-primary" disabled={!valid} onClick={() => valid && onSave(buildServer(), true)}>{t('connect')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
