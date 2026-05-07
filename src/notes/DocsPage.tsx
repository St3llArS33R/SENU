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

import { useState, useEffect, useRef } from 'react'
import './docs.css'

interface Props {
  lang: string
  onClose: () => void
}

// ── Section heading ────────────────────────────────────────────────────────
function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="doc-h1">{children}</h1>
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="doc-h2">{children}</h2>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="doc-p">{children}</p>
}
function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="doc-ul">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="doc-kbd">{children}</kbd>
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="doc-code">{children}</code>
}
function CodeBlock({ lang = 'bash', children }: { lang?: string; children: string }) {
  return (
    <div className="doc-code-block">
      <div className="doc-code-header">{lang}</div>
      <pre className="doc-code-pre">{children}</pre>
    </div>
  )
}
function Callout({ icon = '💡', children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="doc-callout">
      <span className="doc-callout-icon">{icon}</span>
      <div className="doc-callout-text">{children}</div>
    </div>
  )
}
function KbdTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="doc-kbd-table">
      <tbody>
        {rows.map(([k, d], i) => (
          <tr key={i}>
            <td><Kbd>{k}</Kbd></td>
            <td>{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function Divider() {
  return <hr className="doc-divider" />
}
function ChapterAnchor({ id }: { id: string }) {
  return <div id={id} style={{ position: 'relative', top: -16 }} />
}

// ── DocsPage ───────────────────────────────────────────────────────────────
export function DocsPage({ lang, onClose }: Props) {
  const [activeId, setActiveId] = useState('overview')
  const scrollRef = useRef<HTMLDivElement>(null)
  const uk = lang === 'uk'

  // Tiny picker — keeps each chapter readable instead of duplicating the
  // surrounding JSX twice. For mixed-content lines we still inline the
  // ternary, but for plain prose this scales better.
  const T = (ukText: string, enText: string) => uk ? ukText : enText

  // ── Table of Contents (bilingual) ───────────────────────────────────────
  const TOC: { id: string; uk: string; en: string }[] = [
    { id: 'overview',     uk: 'Загальний огляд',         en: 'Overview' },
    { id: 'connections',  uk: 'Підключення SSH',         en: 'SSH connections' },
    { id: 'terminal',     uk: 'Термінал',                 en: 'Terminal' },
    { id: 'split',        uk: 'Split-режим',              en: 'Split layout' },
    { id: 'broadcast',    uk: 'Broadcast-режим',          en: 'Broadcast input' },
    { id: 'tunnels',      uk: 'SSH-тунелі',               en: 'SSH tunnels' },
    { id: 'cmdhistory',   uk: 'Історія команд',           en: 'Command history' },
    { id: 'sftp',         uk: 'Файли (SFTP)',             en: 'Files (SFTP)' },
    { id: 'snippets',     uk: 'Сніпети',                  en: 'Snippets' },
    { id: 'notes',        uk: 'Нотатки',                  en: 'Notes' },
    { id: 'chat',         uk: 'Чат',                      en: 'Chat' },
    { id: 'shortcuts',    uk: 'Клавіатурні скорочення',  en: 'Keyboard shortcuts' },
    { id: 'settings',     uk: 'Налаштування',             en: 'Settings' },
  ]

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const els = TOC.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[]

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { root, rootMargin: '0px 0px -60% 0px', threshold: 0 }
    )

    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="docs-overlay">

      {/* Table of contents */}
      <div className="docs-toc">
        <div className="docs-toc-header">{T('Зміст', 'Contents')}</div>
        {TOC.map(item => (
          <a key={item.id}
            className={`docs-toc-item${item.id === activeId ? ' active' : ''}`}
            onClick={e => {
              e.preventDefault()
              document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}>
            {uk ? item.uk : item.en}
          </a>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="docs-page-wrap" ref={scrollRef}>
        <button className="docs-close" onClick={onClose} title={T('Закрити', 'Close')} style={{ display: 'none' }} />

        <div className="docs-content">

            {/* ── Cover ── */}
            <div className="doc-cover">
              <div className="doc-cover-logo">SENU</div>
              <div className="doc-cover-sub">
                {T('Документація', 'Documentation')}
              </div>
              <div className="doc-cover-desc">
                {T(
                  'Посібник користувача — SSH-термінал, файловий менеджер і нотатки в одному вікні.',
                  'User guide — SSH terminal, file manager, and notes in a single window.'
                )}
              </div>
            </div>

            <Divider />

            {/* ── Overview ── */}
            <ChapterAnchor id="overview" />
            <H1>{T('Загальний огляд', 'Overview')}</H1>
            <P>
              {uk ? (
                <>
                  <strong>SENU</strong> — це інтегроване середовище для роботи з серверами. Поєднує
                  SSH-термінал, SFTP-менеджер файлів, бібліотеку сніпетів і систему нотаток в єдиному
                  інтерфейсі.
                </>
              ) : (
                <>
                  <strong>SENU</strong> is an integrated environment for managing servers. It combines
                  an SSH terminal, an SFTP file browser, a snippet library, and a note system into a
                  single interface.
                </>
              )}
            </P>
            <P>{T('Основні зони інтерфейсу:', 'Main interface zones:')}</P>
            <Ul items={uk ? [
              <><strong>Activity bar</strong> (ліворуч) — перемикання між панелями</>,
              <><strong>Side panel</strong> — підключення, файли, сніпети, нотатки, чат</>,
              <><strong>Terminal area</strong> (центр) — одна або декілька вкладок терміналу</>,
              <><strong>Status bar</strong> (знизу) — поточне підключення, шифрування, час відгуку</>,
            ] : [
              <><strong>Activity bar</strong> (left) — switch between panels</>,
              <><strong>Side panel</strong> — servers, files, snippets, notes, chat</>,
              <><strong>Terminal area</strong> (center) — one or several terminal tabs</>,
              <><strong>Status bar</strong> (bottom) — current connection, encryption, latency</>,
            ]} />

            <Divider />

            {/* ── Connections ── */}
            <ChapterAnchor id="connections" />
            <H1>{T('Підключення SSH', 'SSH connections')}</H1>
            <P>
              {uk ? (
                <>Панель <strong>Servers</strong> зберігає й організовує SSH/Telnet/Serial/Local/Docker
                підключення по групах (Production, Staging, Development тощо).</>
              ) : (
                <>The <strong>Servers</strong> panel stores and organizes SSH/Telnet/Serial/Local/Docker
                connections in groups (Production, Staging, Development, etc.).</>
              )}
            </P>

            <H2>{T('Додати новий сервер', 'Add a new server')}</H2>
            <Ul items={uk ? [
              <>Натисни <strong>+</strong> у заголовку панелі підключень</>,
              <>Заповни: назва, хост/IP, порт (типово 22), ім'я користувача</>,
              <>Вибери метод автентифікації: <strong>пароль</strong>, <strong>SSH-ключ</strong> або <strong>Agent</strong></>,
              <>Натисни <strong>Зберегти</strong></>,
            ] : [
              <>Click <strong>+</strong> in the Servers panel header</>,
              <>Fill in: name, host/IP, port (default 22), username</>,
              <>Pick an auth method: <strong>password</strong>, <strong>SSH key</strong>, or <strong>Agent</strong></>,
              <>Click <strong>Save</strong></>,
            ]} />

            <H2>{T('Підключитись до сервера', 'Connect to a server')}</H2>
            <P>
              {uk ? (
                <>Двічі клацни на сервері або натисни <Kbd>Enter</Kbd>, щоб відкрити нову вкладку
                  термінала з SSH-сесією.</>
              ) : (
                <>Double-click a server entry or press <Kbd>Enter</Kbd> to open a new terminal tab
                  with the SSH session.</>
              )}
            </P>

            <H2>{T('Групи серверів', 'Server groups')}</H2>
            <P>
              {T(
                'Сервери організовані по групах. Клікни на назву групи, щоб згорнути/розгорнути список. Щоб змінити групу — відкрий редагування й зміни поле «Група».',
                'Servers are organized into groups. Click a group name to collapse/expand. To change a server\'s group — open its edit modal and change the "Group" field.'
              )}
            </P>

            <H2>{T('Відновлення сесії', 'Session restore')}</H2>
            <P>
              {uk ? (
                <>SENU автоматично запам'ятовує, які сервери були відкриті в попередньому запуску.
                  На головному екрані з'являється кнопка <strong>↻ Відновити сесію (N)</strong> — натиснувши,
                  отримуєш усі ті ж вкладки назад (послідовно, із невеликою затримкою щоб не перевантажити
                  мережу). Адмін-термінали та сервери, які більше не існують, пропускаються.</>
              ) : (
                <>SENU remembers which servers were open in the previous session. The home screen
                  shows a <strong>↻ Restore session (N)</strong> button — clicking it re-opens all those
                  tabs (sequentially with small delays so the network isn't hammered). Admin terminals and
                  servers that no longer exist are skipped.</>
              )}
            </P>

            <H2>{T('Індикатор доступності (health dot)', 'Reachability indicator (health dot)')}</H2>
            <P>
              {uk ? (
                <>Поряд з назвою кожного SSH/Telnet-сервера на головному екрані показується кольоровий
                  кружечок: <strong style={{ color: '#00d4aa' }}>зелений</strong> — порт відповідає,{' '}
                  <strong style={{ color: '#f7706a' }}>червоний</strong> — недоступний, сірий — перевірка
                  ще не завершена або тип підключення без мережі (local/serial/docker). Перевірка — легкий
                  TCP-connect до <Code>host:port</Code> з таймаутом 1.5 с, оновлюється кожні 30 с.</>
              ) : (
                <>Each SSH/Telnet server on the home screen shows a colored dot:{' '}
                  <strong style={{ color: '#00d4aa' }}>green</strong> — the port responds,{' '}
                  <strong style={{ color: '#f7706a' }}>red</strong> — unreachable, gray — probe in flight or
                  network-less connection type (local/serial/docker). The probe is a lightweight TCP-connect
                  to <Code>host:port</Code> with a 1.5 s timeout, refreshed every 30 s.</>
              )}
            </P>

            <H2>Quick Connect</H2>
            <P>
              {uk ? (
                <>Швидке підключення без збереження: натисни <Kbd>Ctrl+Shift+Q</Kbd> або іконку⚡ у топбарі.
                  Введи <Code>user@host</Code> або <Code>user@host:port</Code>.</>
              ) : (
                <>Connect without saving: press <Kbd>Ctrl+Shift+Q</Kbd> or click the bolt icon in the topbar.
                  Type <Code>user@host</Code> or <Code>user@host:port</Code>.</>
              )}
            </P>

            <Callout icon="💡">
              {uk ? (
                <>Використовуй SSH-ключі замість паролів для безпечнішого та зручнішого підключення.
                  Збережені паролі/passphrase лежать в OS keychain (Windows Credential Manager, macOS Keychain,
                  Linux libsecret).</>
              ) : (
                <>Prefer SSH keys over passwords — both safer and more convenient. Saved passwords/passphrases
                  live in the OS keychain (Windows Credential Manager, macOS Keychain, Linux libsecret).</>
              )}
            </Callout>

            <H2>{T('Прокидання SSH-agent (ForwardAgent)', 'SSH agent forwarding')}</H2>
            <P>
              {uk ? (
                <>Чекбокс <strong>«Прокидати SSH-agent»</strong> у модалці сервера вмикає{' '}
                  <Code>ForwardAgent yes</Code> — еквівалент <Code>ssh -A</Code>. Віддалений хост отримує
                  доступ до твого локального ssh-agent, і звідти можна робити <Code>git push</Code> чи{' '}
                  <Code>ssh далі</Code> без копіювання приватних ключів.</>
              ) : (
                <>The <strong>Forward SSH agent</strong> checkbox in the server modal enables{' '}
                  <Code>ForwardAgent yes</Code> — equivalent to <Code>ssh -A</Code>. The remote host gets
                  access to your local ssh-agent, so you can <Code>git push</Code> or <Code>ssh further</Code>{' '}
                  without copying private keys.</>
              )}
            </P>
            <Callout icon="⚠️">
              {uk ? (
                <>ForwardAgent дає <strong>root-овому користувачу віддаленого хоста</strong> змогу
                  використовувати твої ключі поки сесія відкрита (але не скопіювати їх). Не вмикай для
                  ненадійних хостів — тільки для власних dev/jump-серверів.</>
              ) : (
                <>Agent forwarding lets <strong>root on the remote host</strong> use your keys while the
                  session is open (but not copy them). Don't enable for untrusted hosts — only for your own
                  dev/jump boxes.</>
              )}
            </Callout>

            <Divider />

            {/* ── Terminal ── */}
            <ChapterAnchor id="terminal" />
            <H1>{T('Термінал', 'Terminal')}</H1>
            <P>
              {T(
                'Термінал SENU підтримує кілька вкладок одночасно, кожна — окрема сесія. Вкладки можна перейменовувати, кольорово маркувати і перетягувати.',
                'The SENU terminal supports multiple concurrent tabs, each its own session. Tabs can be renamed, color-coded, and reordered by drag-and-drop.'
              )}
            </P>

            <H2>{T('Вкладки', 'Tabs')}</H2>
            <Ul items={uk ? [
              <><Kbd>Ctrl+T</Kbd> або <strong>+</strong> у панелі вкладок — нова вкладка</>,
              <><Kbd>Ctrl+W</Kbd> — закрити поточну вкладку</>,
              <><Kbd>Ctrl+Tab</Kbd> / <Kbd>Ctrl+Shift+Tab</Kbd> — наступна/попередня вкладка</>,
              <>Перетягуй вкладки щоб змінити порядок</>,
              <>Колір вкладки відображає стан: <strong style={{color:'#4caf77'}}>зелений</strong> = підключено, <strong style={{color:'#d95e4b'}}>червоний</strong> = відключено</>,
            ] : [
              <><Kbd>Ctrl+T</Kbd> or <strong>+</strong> in the tab bar — new tab</>,
              <><Kbd>Ctrl+W</Kbd> — close the current tab</>,
              <><Kbd>Ctrl+Tab</Kbd> / <Kbd>Ctrl+Shift+Tab</Kbd> — next / previous tab</>,
              <>Drag tabs to reorder</>,
              <>Tab dot color reflects status: <strong style={{color:'#4caf77'}}>green</strong> = connected, <strong style={{color:'#d95e4b'}}>red</strong> = disconnected</>,
            ]} />

            <H2>{T('Копіювання та вставка', 'Copy and paste')}</H2>
            <Ul items={uk ? [
              <>Виділи текст мишкою → автоматично копіюється в буфер обміну</>,
              <><Kbd>Ctrl+V</Kbd> або права кнопка миші → вставка</>,
              <><Kbd>Ctrl+Shift+C/V</Kbd> теж підтримується</>,
            ] : [
              <>Select text with the mouse → it's auto-copied to the clipboard</>,
              <><Kbd>Ctrl+V</Kbd> or right-click → paste</>,
              <><Kbd>Ctrl+Shift+C/V</Kbd> also work</>,
            ]} />

            <H2>{T('Синхронізація буфера з віддаленої машини (OSC 52)', 'Remote-to-local clipboard sync (OSC 52)')}</H2>
            <P>
              {uk ? (
                <>SENU підтримує стандарт OSC 52: програми на віддаленій машині (tmux, vim, neovim з{' '}
                  <Code>set clipboard=unnamedplus</Code>, <Code>yank</Code> тощо) можуть писати в твій локальний
                  буфер обміну через escape-послідовність.</>
              ) : (
                <>SENU supports OSC 52: programs on the remote host (tmux, vim, neovim with{' '}
                  <Code>set clipboard=unnamedplus</Code>, <Code>yank</Code>, etc.) can write to your local
                  clipboard via an escape sequence.</>
              )}
            </P>
            <Ul items={uk ? [
              <>Налаштуй <Code>tmux</Code>: <Code>set -g set-clipboard on</Code></>,
              <>У vim встав у <Code>.vimrc</Code>: <Code>set clipboard=unnamedplus</Code> або використай <Code>OSCYank</Code></>,
              <>З CLI: <Code>{`printf '\\033]52;c;%s\\a' "$(echo 'hello' | base64)"`}</Code></>,
            ] : [
              <>Configure <Code>tmux</Code>: <Code>set -g set-clipboard on</Code></>,
              <>In vim's <Code>.vimrc</Code>: <Code>set clipboard=unnamedplus</Code> or use <Code>OSCYank</Code></>,
              <>From the CLI: <Code>{`printf '\\033]52;c;%s\\a' "$(echo 'hello' | base64)"`}</Code></>,
            ]} />
            <Callout icon="🔒">
              {uk ? (
                <>З міркувань безпеки SENU підтримує лише <strong>запис</strong> у буфер — віддалені програми
                  не можуть <strong>читати</strong> твій локальний буфер.</>
              ) : (
                <>For security, SENU only supports <strong>write</strong> to clipboard — remote programs cannot
                  <strong> read</strong> your local clipboard.</>
              )}
            </Callout>

            <H2>{T('Очищення екрану', 'Clear screen')}</H2>
            <P>
              {uk ? (
                <>Введи <Code>clear</Code> або натисни <Kbd>Ctrl+L</Kbd> в терміналі.</>
              ) : (
                <>Type <Code>clear</Code> or press <Kbd>Ctrl+L</Kbd> in the terminal.</>
              )}
            </P>

            <H2>{T('Пошук у виводі', 'Search the buffer')}</H2>
            <P>
              {uk ? (
                <><Kbd>Ctrl+F</Kbd> відкриває пошук по буферу терміналу (підсвічує збіги в раніше написаному
                  виводі).</>
              ) : (
                <><Kbd>Ctrl+F</Kbd> opens search across the terminal scrollback buffer (highlights matches in
                  earlier output).</>
              )}
            </P>

            <Divider />

            {/* ── Split ── */}
            <ChapterAnchor id="split" />
            <H1>{T('Split-режим', 'Split layout')}</H1>
            <P>
              {T(
                'Split-режим розбиває термінальну область на 2/3/4 незалежні панелі. Кожна — окрема SSH-сесія.',
                'Split mode divides the terminal area into 2/3/4 independent panes. Each is its own SSH session.'
              )}
            </P>
            <Ul items={uk ? [
              <>Кнопки <strong>1 / ⫶ / ⫶⫶ / ⊞</strong> у топбарі → перемикання макета</>,
              <>Клікни на будь-якій панелі щоб зробити її активною</>,
              <>Щоб вийти — повернись на макет <strong>1</strong></>,
            ] : [
              <>Buttons <strong>1 / ⫶ / ⫶⫶ / ⊞</strong> in the topbar → switch layout</>,
              <>Click any pane to focus it</>,
              <>To exit — switch back to the <strong>1</strong> layout</>,
            ]} />

            <Divider />

            {/* ── Broadcast ── */}
            <ChapterAnchor id="broadcast" />
            <H1>{T('Broadcast-режим', 'Broadcast input')}</H1>
            <P>
              {T(
                'Broadcast дозволяє надсилати команди одночасно на всі відкриті SSH-сесії. Корисно для одночасного оновлення декількох серверів.',
                'Broadcast sends keystrokes to every open SSH session at once. Useful for updating multiple servers simultaneously.'
              )}
            </P>
            <Callout icon="⚠️">
              {T(
                'Використовуй broadcast з обережністю — команда виконується на ВСІХ підключених серверах.',
                'Use broadcast with care — the keystrokes go to EVERY connected server.'
              )}
            </Callout>
            <Ul items={uk ? [
              <>Кнопка <strong>📡</strong> у топбарі → увімкнути Broadcast</>,
              <>Статус-бар підсвічується помаранчевим з написом <strong>BROADCAST</strong></>,
              <>Все що ти вводиш — надсилається на всі сесії одночасно</>,
              <>Натисни кнопку знову → вийти з broadcast-режиму</>,
            ] : [
              <>Button <strong>📡</strong> in the topbar → enable Broadcast</>,
              <>Status bar lights up amber with a <strong>BROADCAST</strong> label</>,
              <>Whatever you type goes to all sessions at once</>,
              <>Press the button again → leave broadcast mode</>,
            ]} />

            <Divider />

            {/* ── Tunnels ── */}
            <ChapterAnchor id="tunnels" />
            <H1>{T('SSH-тунелі (port forwarding)', 'SSH tunnels (port forwarding)')}</H1>
            <P>
              {uk ? (
                <>Локальний форвард портів: з'єднання на <Code>127.0.0.1:localPort</Code> перенаправляється
                  через SSH-сесію на віддалений хост. Корисно для доступу до внутрішніх сервісів (БД, панелі,
                  локальні сервери), які не виставлені назовні.</>
              ) : (
                <>Local port forwarding: a connection to <Code>127.0.0.1:localPort</Code> is tunneled through
                  the SSH session to a remote host. Use this to reach internal services (databases, admin
                  panels, local servers) that aren't exposed publicly.</>
              )}
            </P>
            <H2>{T('Попап активних тунелів', 'Active tunnels popover')}</H2>
            <P>
              {uk ? (
                <>Кнопка тунелю у верхній панелі показує бейдж з кількістю активних тунелів по всіх SSH-сесіях.
                  Натисни — відкриється попап зі списком усіх тунелів, згрупованих по серверах.</>
              ) : (
                <>The tunnel button in the topbar shows a badge with the count of active tunnels across all
                  SSH sessions. Click it — a popover lists every tunnel, grouped by server.</>
              )}
            </P>
            <Ul items={uk ? [
              <>Кнопка <strong>⧉</strong> поруч з тунелем — копіювати <Code>127.0.0.1:port</Code> у буфер</>,
              <>Кнопка <strong>✕</strong> — закрити тунель</>,
              <>Кнопка <strong>+ Add Forward</strong> внизу — додати новий тунель у активну сесію</>,
              <>Список оновлюється автоматично кожні 3 секунди, поки попап відкритий</>,
            ] : [
              <>The <strong>⧉</strong> button next to a tunnel — copy <Code>127.0.0.1:port</Code> to clipboard</>,
              <>The <strong>✕</strong> button — close the tunnel</>,
              <>The <strong>+ Add Forward</strong> button at the bottom — add a new tunnel for the active session</>,
              <>The list refreshes automatically every 3 seconds while the popover is open</>,
            ]} />
            <Callout icon="💡">
              {T(
                'Тунелі прив\'язані до SSH-сесії: при відключенні активного з\'єднання всі його тунелі автоматично закриваються.',
                'Tunnels are scoped to the SSH session: when the underlying connection drops, all its tunnels are closed automatically.'
              )}
            </Callout>

            <Divider />

            {/* ── Command history ── */}
            <ChapterAnchor id="cmdhistory" />
            <H1>{T('Історія команд (Ctrl+Shift+R)', 'Command history (Ctrl+Shift+R)')}</H1>
            <P>
              {uk ? (
                <>SENU веде окрему історію команд для кожного сервера — незалежно від bash/zsh{' '}
                  <Code>~/.bash_history</Code>. Історія зберігається локально і доступна навіть якщо ти
                  підключаєшся з різних машин до одного й того ж хоста в різних сесіях.</>
              ) : (
                <>SENU keeps a per-server command history — independent of bash/zsh{' '}
                  <Code>~/.bash_history</Code>. The history is stored locally and remains available even when
                  you connect to the same host from different machines.</>
              )}
            </P>
            <H2>{T('Як користуватись', 'How to use')}</H2>
            <Ul items={uk ? [
              <>Натисни <Kbd>Ctrl+Shift+R</Kbd> у будь-якому терміналі — відкриється fuzzy-пошук по історії активного сервера</>,
              <>Почни набирати — список ранжується за релевантністю (підрядок → найвищий пріоритет, далі char-by-char)</>,
              <><Kbd>↑</Kbd>/<Kbd>↓</Kbd> — навігація, <Kbd>Enter</Kbd> — вставити команду в термінал (без автоматичного натискання Enter — можна відредагувати), <Kbd>Esc</Kbd> — закрити</>,
              <>Поряд з командою показується скільки разів вона була виконана та коли востаннє</>,
            ] : [
              <>Press <Kbd>Ctrl+Shift+R</Kbd> in any terminal — fuzzy search opens over the active server's history</>,
              <>Start typing — entries rank by relevance (substring matches rank highest, then char-by-char)</>,
              <><Kbd>↑</Kbd>/<Kbd>↓</Kbd> — navigate, <Kbd>Enter</Kbd> — insert the command into the terminal (without auto-pressing Enter, so you can edit), <Kbd>Esc</Kbd> — close</>,
              <>Each entry shows how many times the command has been run and when it was last used</>,
            ]} />
            <H2>{T('Що записується', 'What gets recorded')}</H2>
            <P>
              {uk ? (
                <>Будь-який рядок, який ти набрав у терміналі та завершив натисканням <Kbd>Enter</Kbd>.
                  Дублікати не створюються — повторний ввід тієї ж команди оновлює лічильник і час.
                  Escape-послідовності (стрілки, <Kbd>Ctrl+C</Kbd>, <Kbd>Ctrl+U</Kbd>) скидають буфер захоплення,
                  тож команди, які ти не довів до кінця, не потрапляють в історію.</>
              ) : (
                <>Any line you type in the terminal and submit with <Kbd>Enter</Kbd>. Duplicates aren't created
                  — re-typing the same command updates the counter and timestamp. Escape sequences (arrows,{' '}
                  <Kbd>Ctrl+C</Kbd>, <Kbd>Ctrl+U</Kbd>) reset the capture buffer, so commands you didn't finish
                  don't make it into history.</>
              )}
            </P>
            <Callout icon="🔒">
              {uk ? (
                <>Історія зберігається в <Code>localStorage</Code> на твоїй локальній машині (ключ{' '}
                  <Code>{'senu_cmdhist_<serverId>'}</Code>). Ліміт — 500 команд на сервер. Нічого не передається
                  на віддалений хост.</>
              ) : (
                <>History lives in <Code>localStorage</Code> on your local machine (key{' '}
                  <Code>{'senu_cmdhist_<serverId>'}</Code>). Limit: 500 commands per server. Nothing is sent
                  to the remote host.</>
              )}
            </Callout>

            <Divider />

            {/* ── SFTP ── */}
            <ChapterAnchor id="sftp" />
            <H1>{T('Файли (SFTP)', 'Files (SFTP)')}</H1>
            <P>
              {T(
                'Панель Файли відображає файлову систему поточного SSH-сервера через SFTP-протокол.',
                'The Files panel browses the current SSH server\'s filesystem via the SFTP protocol.'
              )}
            </P>
            <H2>{T('Навігація', 'Navigation')}</H2>
            <Ul items={uk ? [
              <>Клікни на папку щоб зайти всередину</>,
              <>Шлях відображається у верхній частині панелі</>,
              <>Кнопка <strong>↑</strong> — перейти на рівень вище</>,
            ] : [
              <>Click a folder to enter it</>,
              <>The current path is shown at the top of the panel</>,
              <>The <strong>↑</strong> button — go up one level</>,
            ]} />
            <H2>{T('Операції з файлами', 'File operations')}</H2>
            <Ul items={uk ? [
              <>Клікни на файл → відкрити у вбудованому редакторі (CodeMirror 6, підсвітка nginx/yaml/json/bash тощо)</>,
              <>Кнопка <strong>↓</strong> поруч з файлом → завантажити локально</>,
              <>Кнопка <strong>↑ Upload</strong> у топбарі → завантажити локальний файл у поточну директорію</>,
              <>Правий клік на файлі → <strong>Створити нотатку з файлу</strong> (нотатка одразу прив'язана до сервера + шляху)</>,
            ] : [
              <>Click a file → open in the built-in editor (CodeMirror 6, syntax for nginx/yaml/json/bash, etc.)</>,
              <>The <strong>↓</strong> button next to a file → download locally</>,
              <>The <strong>↑ Upload</strong> button in the toolbar → upload a local file into the current directory</>,
              <>Right-click a file → <strong>Create note from file</strong> (the note is pre-bound to server + path)</>,
            ]} />
            <CodeBlock lang="sftp-path">/var/www/shop/</CodeBlock>

            <Divider />

            {/* ── Snippets ── */}
            <ChapterAnchor id="snippets" />
            <H1>{T('Сніпети', 'Snippets')}</H1>
            <P>
              {T(
                'Бібліотека готових команд, організованих по категоріях (Система, Мережа, Процеси, Nginx тощо).',
                'A library of ready-made commands organized into categories (System, Network, Processes, Nginx, etc.).'
              )}
            </P>
            <H2>{T('Використання', 'Usage')}</H2>
            <Ul items={uk ? [
              <><strong>Insert</strong> — вставити команду в активний термінал без виконання</>,
              <><strong>▶ Run</strong> — вставити і одразу виконати</>,
              <>Команди з <Code>{'{{VAR}}'}</Code> — змінні, які підставляються при вставці</>,
            ] : [
              <><strong>Insert</strong> — paste the command into the active terminal without executing</>,
              <><strong>▶ Run</strong> — paste and execute immediately</>,
              <>Commands with <Code>{'{{VAR}}'}</Code> — variables prompted before insertion</>,
            ]} />
            <H2>{T('Шаблонні змінні', 'Template variables')}</H2>
            <P>
              {uk ? (
                <>Використовуй <Code>{'{{назва}}'}</Code> в тексті команди — перед вставкою з'явиться запит на
                  підстановку значення.</>
              ) : (
                <>Use <Code>{'{{name}}'}</Code> in the command text — a prompt asks for the value before
                  inserting.</>
              )}
            </P>
            <CodeBlock>{'mysqldump -u root -p shop > /backup/shop_{{date}}.sql'}</CodeBlock>
            <H2>{T('Пошук сніпетів', 'Search snippets')}</H2>
            <P>
              {T(
                'Поле пошуку вгорі панелі фільтрує команди по назві і тексту в реальному часі.',
                'The search box at the top of the panel filters by name and text in real time.'
              )}
            </P>

            <Divider />

            {/* ── Notes ── */}
            <ChapterAnchor id="notes" />
            <H1>{T('Нотатки', 'Notes')}</H1>
            <P>
              {T(
                'Система нотаток для збереження команд, інструкцій і документації прямо в SENU. Нотатки можуть бути прив\'язані до конкретного сервера, шляху або файлу.',
                'A note system for storing commands, runbooks, and documentation right inside SENU. Notes can be pinned to specific servers, paths, or files.'
              )}
            </P>

            <H2>{T('Три поверхні редагування', 'Three editing surfaces')}</H2>
            <Ul items={uk ? [
              <><strong>Inline edit</strong> у бічній панелі — швидко правити заголовок і теги без відкриття вікна</>,
              <><strong>Expand popup</strong> (↗) — модальне вікно для коротких нотаток</>,
              <><strong>Fullscreen</strong> — повноцінний блочний редактор з форматуванням</>,
              <>Усі три читають з єдиного store — переключаєшся між ними і нічого не втрачаєш</>,
            ] : [
              <><strong>Inline edit</strong> in the sidebar — quickly tweak title and tags without opening a separate window</>,
              <><strong>Expand popup</strong> (↗) — modal for short notes</>,
              <><strong>Fullscreen</strong> — a full block editor with rich formatting</>,
              <>All three read from a single store — switch between them and nothing is lost</>,
            ]} />

            <H2>{T('Авто-збереження', 'Auto-save')}</H2>
            <P>
              {T(
                'Кожна зміна зберігається через 1 секунду після останнього натискання клавіші. Індикатор у топбарі редактора показує «✓ Збережено · 2 хв тому» або «● Зберігаю…».',
                'Every change persists 1 second after the last keystroke. The editor topbar shows "✓ Saved · 2m ago" or "● Saving…".'
              )}
            </P>

            <H2>{T('Папки і теги', 'Folders and tags')}</H2>
            <Ul items={uk ? [
              <><strong>Папки</strong> — деревоподібна структура, drag-and-drop переміщення нотаток і самих папок</>,
              <>Сортування папок: новостворені зверху, ручне впорядкування через ПКМ → «Перемістити вгору/вниз»</>,
              <><strong>Теги</strong> — детермінований колір з 24-відтінкової палітри (один тег = один колір на всіх поверхнях). Клік на чіпсі тегу циклічно міняє колір якщо хочеш свій.</>,
              <>Toggle <strong>Sections / Folders</strong> — переключайся між server-aware групуванням і власним деревом</>,
            ] : [
              <><strong>Folders</strong> — a tree, drag-and-drop reordering of both notes and folders</>,
              <>Folder ordering: newest on top, with manual <strong>Move up/down</strong> via the right-click menu</>,
              <><strong>Tags</strong> — deterministic colors from a 24-hue palette (same tag = same color across all surfaces). Click a tag pill to cycle to a different color manually.</>,
              <><strong>Sections / Folders</strong> toggle — switch between server-aware grouping and your own tree</>,
            ]} />

            <H2>{T('Прив\'язка до файлу і двосторонній потік', 'File binding and bidirectional flow')}</H2>
            <Ul items={uk ? [
              <>ПКМ на файлі в SFTP → <strong>Створити нотатку з файлу</strong> — нотатка з'явиться з прив'язкою сервера й повного шляху</>,
              <>У фулскрін-редакторі видно «pill» <Code>📄 path @ server</Code> прямо під cover'ом</>,
              <>Кнопка <strong>На сервер</strong> у топбарі → завантажити нотатку як markdown-файл на обраний шлях (за замовчуванням — той самий, що в pill)</>,
            ] : [
              <>Right-click a file in SFTP → <strong>Create note from file</strong> — the note opens pre-bound to the server and full path</>,
              <>The fullscreen editor shows a <Code>📄 path @ server</Code> pill right below the cover</>,
              <>The <strong>Push to server</strong> button in the topbar → upload the note as a markdown file at any chosen path (defaults to the bound path)</>,
            ]} />

            <H2>{T('Редактор нотаток (fullscreen)', 'Note editor (fullscreen)')}</H2>
            <P>{T('Підтримує блоки різних типів:', 'Supports several block types:')}</P>
            <Ul items={uk ? [
              <><strong>H1 / H2 / H3</strong> — заголовки трьох рівнів</>,
              <><strong>Параграф</strong> — звичайний текст з **bold**, *italic*, `code`</>,
              <><strong>• Список</strong> та <strong>1. Нумерований</strong> — списки</>,
              <><strong>" Цитата</strong> — виділений блок із зеленою рискою</>,
              <><strong>⚡ Команда/Код</strong> — блок коду з кнопками Insert та Run</>,
              <><strong>— Роздільник</strong> — горизонтальна лінія</>,
            ] : [
              <><strong>H1 / H2 / H3</strong> — three heading levels</>,
              <><strong>Paragraph</strong> — plain text with **bold**, *italic*, `code`</>,
              <><strong>• List</strong> and <strong>1. Numbered</strong> — lists</>,
              <><strong>" Quote</strong> — accented block with a green bar</>,
              <><strong>⚡ Command/Code</strong> — code block with Insert / Run buttons</>,
              <><strong>— Divider</strong> — horizontal rule</>,
            ]} />

            <H2>{T('Slash-меню', 'Slash menu')}</H2>
            <P>
              {uk ? (
                <>В порожньому рядку натисни <Kbd>/</Kbd> — з'явиться меню вибору блоку. Навігація:{' '}
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> + <Kbd>Enter</Kbd> для вибору, <Kbd>Esc</Kbd> для закриття.</>
              ) : (
                <>Type <Kbd>/</Kbd> in an empty line — a block-type menu appears. Navigate with{' '}
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd>, pick with <Kbd>Enter</Kbd>, close with <Kbd>Esc</Kbd>.</>
              )}
            </P>

            <H2>{T('Зберегти локально', 'Save locally')}</H2>
            <P>
              {T(
                'Кнопка Save у топбарі відкриває меню: «Запам\'ятати зараз», «Зберегти локально (.md)» через нативний Save As, або «Завантажити на сервер…».',
                'The Save button in the topbar opens a menu: "Save now", "Save locally (.md)" via the native Save As dialog, or "Push to server…".'
              )}
            </P>

            <Callout>
              {T(
                'Весь вміст нотаток зашифрований AES-256-GCM. Ключ зберігається у файлі notes.key в app_data_dir локально й не передається на сервери.',
                'Note content is encrypted with AES-256-GCM. The key lives in notes.key under app_data_dir locally and is never sent to a server.'
              )}
            </Callout>

            <Divider />

            {/* ── Chat ── */}
            <ChapterAnchor id="chat" />
            <H1>{T('Чат', 'Chat')}</H1>
            <P>
              {T(
                'Зашифрований однорангоновий чат для адмінів, які підключені до спільного SSH-сервера. Повідомлення шифруються end-to-end. Сервер виступає лише як relay — у відкритому вигляді там нічого не зберігається.',
                'End-to-end encrypted peer-to-peer chat for admins connected to a shared SSH server. The server acts only as a relay — nothing is stored in plaintext there.'
              )}
            </P>
            <H2>{T('Криптографія', 'Cryptography')}</H2>
            <Ul items={uk ? [
              <><strong>X25519 ECDH</strong> + <strong>AES-256-GCM</strong> для шифрування — ефемерний ключ на кожне повідомлення (forward secrecy)</>,
              <><strong>Ed25519 підпис</strong> над канонічними полями повідомлення — захист від підробки відправника третьою особою на тому ж сервері</>,
              <>Identity-ключ зберігається у <Code>chat_identity.key</Code> в <Code>app_data_dir</Code> (64 байти: X25519 + Ed25519). Не діліться цим файлом.</>,
              <>Wire format pubkey — <Code>{'<x25519_b64>.<ed25519_b64>'}</Code></>,
            ] : [
              <><strong>X25519 ECDH</strong> + <strong>AES-256-GCM</strong> for encryption — ephemeral key per message (forward secrecy)</>,
              <><strong>Ed25519 signatures</strong> over the canonical message fields — defense against forgery by a third user on the same server</>,
              <>Identity key lives in <Code>chat_identity.key</Code> under <Code>app_data_dir</Code> (64 bytes: X25519 + Ed25519). Don't share this file.</>,
              <>Wire pubkey format — <Code>{'<x25519_b64>.<ed25519_b64>'}</Code></>,
            ]} />
            <H2>{T('Транспорт', 'Transport')}</H2>
            <P>
              {uk ? (
                <>Presence-маяки і повідомлення лежать у <Code>/tmp/.senu/</Code> на спільному SSH-сервері (sticky bit
                  +world-write — кожен користувач пише свої файли, чужі не може видалити). Повідомлення видаляються
                  після прочитання; presence — через 90 с.</>
              ) : (
                <>Presence beacons and messages live in <Code>/tmp/.senu/</Code> on the shared SSH host
                  (sticky-bit + world-write — every user can drop their files, nobody can delete others'
                  files). Messages are deleted after read; presence expires in 90 s.</>
              )}
            </P>
            <H2>{T('Як користуватись', 'Usage')}</H2>
            <Ul items={uk ? [
              <>Скопіюй свій pubkey і дай контакту через інший канал</>,
              <>Додай контакт через <strong>+ Додати контакт</strong> з його pubkey</>,
              <>Вибери контакт у лівій панелі</>,
              <>Введи повідомлення і натисни <Kbd>Enter</Kbd> для відправки. <Kbd>Shift+Enter</Kbd> — перенос рядка.</>,
            ] : [
              <>Copy your pubkey and share it with the other party through some other channel</>,
              <>Add the contact via <strong>+ Add contact</strong> with their pubkey</>,
              <>Pick the contact in the left panel</>,
              <>Type a message and press <Kbd>Enter</Kbd> to send. <Kbd>Shift+Enter</Kbd> for a newline.</>,
            ]} />
            <Callout icon="⚠️">
              {T(
                'Криптографічна реалізація не проходила незалежний аудит. Не використовуйте для повідомлень, компрометація яких була б критичною.',
                'The cryptographic implementation has not been independently audited. Don\'t use it for communications where compromise would matter.'
              )}
            </Callout>

            <Divider />

            {/* ── Shortcuts ── */}
            <ChapterAnchor id="shortcuts" />
            <H1>{T('Клавіатурні скорочення', 'Keyboard shortcuts')}</H1>

            <H2>{T('Глобальні', 'Global')}</H2>
            <KbdTable rows={uk ? [
              ['Ctrl+K',           'Командна палітра (fuzzy launcher)'],
              ['Ctrl+Shift+Q',     'Швидке підключення'],
              ['Ctrl+Shift+H',     'Boss Key — миттєво сховати UI за decoy-оверлеєм'],
              ['Escape',           'Закрити будь-яке вікно/оверлей'],
            ] : [
              ['Ctrl+K',           'Command Palette (fuzzy launcher)'],
              ['Ctrl+Shift+Q',     'Quick Connect'],
              ['Ctrl+Shift+H',     'Boss Key — instantly hide the UI behind a decoy overlay'],
              ['Escape',           'Close any modal / overlay'],
            ]} />

            <H2>{T('Термінал', 'Terminal')}</H2>
            <KbdTable rows={uk ? [
              ['Ctrl+T',           'Нова вкладка'],
              ['Ctrl+W',           'Закрити вкладку'],
              ['Ctrl+Tab',         'Наступна вкладка'],
              ['Ctrl+Shift+Tab',   'Попередня вкладка'],
              ['Ctrl+L',           'Очистити екран'],
              ['Ctrl+F',           'Пошук у буфері'],
              ['Ctrl+Shift+R',     'Історія команд (fuzzy)'],
              ['Ctrl+Shift+C',     'Копіювати вибране'],
              ['Ctrl+Shift+V',     'Вставити'],
            ] : [
              ['Ctrl+T',           'New tab'],
              ['Ctrl+W',           'Close tab'],
              ['Ctrl+Tab',         'Next tab'],
              ['Ctrl+Shift+Tab',   'Previous tab'],
              ['Ctrl+L',           'Clear screen'],
              ['Ctrl+F',           'Search the buffer'],
              ['Ctrl+Shift+R',     'Command history (fuzzy)'],
              ['Ctrl+Shift+C',     'Copy selection'],
              ['Ctrl+Shift+V',     'Paste'],
            ]} />

            <H2>{T('Редактор нотаток', 'Notes editor')}</H2>
            <KbdTable rows={uk ? [
              ['Ctrl+S',    'Зберегти нотатку (форсовано)'],
              ['Escape',    'Закрити редактор'],
              ['/',         'Відкрити slash-меню блоків'],
              ['Enter',     'Новий блок після поточного'],
              ['Backspace', 'Видалити порожній блок'],
            ] : [
              ['Ctrl+S',    'Save note (forced)'],
              ['Escape',    'Close editor'],
              ['/',         'Open block slash menu'],
              ['Enter',     'New block after current'],
              ['Backspace', 'Delete empty block'],
            ]} />

            <Divider />

            {/* ── Settings ── */}
            <ChapterAnchor id="settings" />
            <H1>{T('Налаштування', 'Settings')}</H1>
            <H2>{T('Теми', 'Themes')}</H2>
            <P>
              {uk ? (
                <>Дві стабільні теми — <strong>SENU</strong> і <strong>Nord</strong> — у швидкому пікері топбара.
                  Решта 11 (Catppuccin, Dracula, Matrix, Neon, One Dark, Solarized Dark, High Contrast, Light,
                  Forest, CRT, Jade) доступні в <strong>Settings → Themes</strong> з бейджем <Code>BETA</Code>:
                  працюють, але контраст і палітра ще полірується.</>
              ) : (
                <>Two stable themes — <strong>SENU</strong> and <strong>Nord</strong> — appear in the topbar
                  quick picker. The other 11 (Catppuccin, Dracula, Matrix, Neon, One Dark, Solarized Dark,
                  High Contrast, Light, Forest, CRT, Jade) are available in <strong>Settings → Themes</strong>{' '}
                  with a <Code>BETA</Code> badge — they work, but contrast and palette polish is ongoing.</>
              )}
            </P>
            <H2>{T('Мова інтерфейсу', 'Interface language')}</H2>
            <P>
              {T(
                'Доступні мови: Українська, English. Зміна застосовується миттєво.',
                'Available languages: English, Ukrainian. The change applies immediately.'
              )}
            </P>
            <H2>{T('Документація', 'Documentation')}</H2>
            <P>
              {uk ? (
                <>Ця сторінка відкривається кнопкою <strong>📖 Документація</strong> в панелі Налаштувань.</>
              ) : (
                <>This page opens via the <strong>📖 Documentation</strong> button in the Settings panel.</>
              )}
            </P>

            <Divider />

            {/* Footer */}
            <div className="doc-footer">
              <span>{T('Документація SENU · AES-256 шифрування нотаток', 'SENU Documentation · AES-256 encrypted notes')}</span>
              <span>v1.0 · 2026</span>
            </div>

        </div>
      </div>
    </div>
  )
}
