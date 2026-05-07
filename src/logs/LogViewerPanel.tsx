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

import { useEffect, useMemo, useRef, useState, memo, useCallback, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { open } from '@tauri-apps/plugin-dialog'
import { useLanguage, type Lang } from '../i18n'

import './log-viewer.css'

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain'
type LogSource = 'local' | 'sftp'

type LogLine = {
  index: number
  text: string
  level: LogLevel
}

type LogSnapshot = {
  path: string
  fileSize: number
  lineCount: number
  truncated: boolean
  lines: string[]
}

type AccessLogMatch = {
  ip: string
  timestamp: string
  request: string
  method: string | null
  path: string | null
  protocol: string | null
  status: string
  bytes: string
  referrer: string
  userAgent: string
}

type Annotation = {
  label: string
  tone: 'neutral' | 'warn' | 'danger' | 'info'
  description: string
}

type PluginAvailability = 'ready' | 'beta' | 'planned' | 'manifest'

type LogPluginManifest = {
  id: string
  name: string
  nameUk?: string
  nameDe?: string
  description: string
  descriptionUk?: string
  descriptionDe?: string
  version?: string
  capabilities?: string[]
  availability?: PluginAvailability
}

const BUILTIN_PLUGINS: LogPluginManifest[] = [
  {
    id: 'nginx-parser',
    name: 'nginx-parser',
    description: 'Structures access logs into a table with status badges and quick signals.',
    descriptionUk: 'Структурує access log у таблицю, додає статус-бейджі й швидкі сигнали.',
    descriptionDe: 'Strukturiert Access-Logs in eine Tabelle mit Status-Badges und schnellen Signalen.',
    version: '1.0',
    capabilities: ['access-log', 'annotations', 'stats'],
    availability: 'ready',
  },
  {
    id: 'laravel-parser',
    name: 'laravel-parser',
    description: 'Recognizes Laravel stack traces and production.ERROR lines.',
    descriptionUk: 'Розпізнає Laravel stack traces і production.ERROR рядки.',
    descriptionDe: 'Erkennt Laravel-Stacktraces und production.ERROR-Zeilen.',
    version: '0.2',
    capabilities: ['exceptions', 'stacktrace'],
    availability: 'beta',
  },
  {
    id: 'docker-logs',
    name: 'docker-logs',
    description: 'Reserved adapter for direct container log access.',
    descriptionUk: 'Зарезервований адаптер для прямого читання логів контейнерів.',
    descriptionDe: 'Reservierter Adapter für direktes Lesen von Container-Logs.',
    capabilities: ['container-source'],
    availability: 'planned',
  },
  {
    id: 'k8s-parser',
    name: 'k8s-parser',
    description: 'Reserved adapter for pod logs via kubectl.',
    descriptionUk: 'Зарезервований адаптер для pod logs через kubectl.',
    descriptionDe: 'Reservierter Adapter für Pod-Logs via kubectl.',
    capabilities: ['kubernetes', 'remote-source'],
    availability: 'planned',
  },
  {
    id: 'json-pretty',
    name: 'json-pretty',
    description: 'Expands JSON lines into a readable block.',
    descriptionUk: 'Розгортає JSON-рядки у читабельний блок.',
    descriptionDe: 'Formatiert JSON-Zeilen in einen lesbaren Block.',
    version: '1.0',
    capabilities: ['json', 'formatting'],
    availability: 'ready',
  },
  {
    id: 'timeline-view',
    name: 'timeline-view',
    description: 'Builds a compact timeline from timestamps in the current tail.',
    descriptionUk: 'Будує коротку timeline по часових мітках у поточному tail.',
    descriptionDe: 'Erstellt eine kurze Timeline aus Zeitstempeln im aktuellen Tail.',
    version: '0.1',
    capabilities: ['timeline', 'events'],
    availability: 'beta',
  },
  {
    id: 'alert-rules',
    name: 'alert-rules',
    description: 'Highlights lines with risky patterns and alarming statuses.',
    descriptionUk: 'Підсвічує рядки з небезпечними патернами та тривожними статусами.',
    descriptionDe: 'Hebt Zeilen mit riskanten Mustern und alarmierenden Statuswerten hervor.',
    version: '1.0',
    capabilities: ['alerts', 'suspicious-patterns'],
    availability: 'ready',
  },
]

const DEFAULT_ACTIVE_PLUGINS = ['nginx-parser', 'json-pretty', 'alert-rules']
const REMOTE_PRESETS = [
  '/var/log/nginx/access.log',
  '/var/log/nginx/error.log',
  '/var/www/current/storage/logs/laravel.log',
  '/var/log/syslog',
]

const IMPORTED_PLUGINS_KEY = 'senu-log-viewer.imported-plugins'
const ACTIVE_PLUGINS_KEY = 'senu-log-viewer.active-plugins'
const RECENT_LOGS_KEY = 'senu-log-viewer.recent-logs'
const MAX_RECENT = 10

interface LogTabEntry {
  id: string
  source: LogSource
  path: string
  sessionId: string | null
  snapshot: LogSnapshot | null
}

interface RecentLog {
  source: LogSource
  path: string
  sessionId: string | null
  openedAt: number
}

const LOGS_COPY: Record<Lang, Record<string, string>> = {
  en: {
    logs: 'Logs',
    openViewer: 'Open viewer',
    openManifest: 'Open plugin manifest',
    source: 'Source',
    local: 'Local',
    sftp: 'SFTP',
    openFile: 'Open…',
    load: 'Load',
    loadSftp: 'Load SFTP',
    filter: 'Filter',
    searchOrRegex: 'Search or regex',
    regex: 'Regex',
    tail: 'Tail',
    lines: 'Lines',
    refresh: 'Refresh',
    meta: 'Meta',
    chooseLocal: 'Choose a local log file',
    chooseRemote: 'Select a remote log path',
    noPath: 'No log path selected.',
    noSession: 'Remote log source requires an active SSH session.',
    openSession: 'Open an SSH session to read remote logs.',
    loading: 'Loading latest lines...',
    ready: 'Ready',
    readyToLoad: 'Ready to load',
    unavailable: 'Viewer backend is unavailable.',
    imported: 'Imported {count} plugin manifest{suffix}.',
    importFailed: 'Plugin manifest import failed.',
    plugins: 'Plugins',
    importManifest: 'Import manifest',
    currentSession: 'Session: {server}',
    noMatchingLines: 'No matching lines',
    adjustFilter: 'Adjust filters or load another source.',
    idle: 'Ready to load',
    lineCount: '{count} lines',
    showingLast: 'showing last {count}',
    showingCount: 'showing {count}',
    logViewer: 'Log Viewer',
    reload: 'Reload',
    close: 'Close',
    pipeline: 'Pipeline',
    timeline: 'Timeline',
    sourceInfo: 'Source',
    mode: 'Mode',
    session: 'Session',
    tailMode: 'Tail',
    localFile: 'Local file',
    detached: 'Detached',
    manual: 'manual',
    planned: 'planned',
    readyState: 'ready',
    beta: 'beta',
    manifest: 'manifest',
    scanner: 'Known internet-wide scanner user-agent.',
    probe: 'Malformed or non-HTTP probe payload.',
    recon: 'Looks like reconnaissance for exposed configs or admin paths.',
    malformedStatus: 'Bad request or probe rejected by the server.',
  },
  uk: {
    logs: 'Логи',
    openViewer: 'Відкрити viewer',
    openManifest: 'Відкрити manifest плагіна',
    source: 'Джерело',
    local: 'Локально',
    sftp: 'SFTP',
    openFile: 'Відкрити…',
    load: 'Завантажити',
    loadSftp: 'Завантажити через SFTP',
    filter: 'Фільтр',
    searchOrRegex: 'Пошук або regex',
    regex: 'Regex',
    tail: 'Tail',
    lines: 'Рядків',
    refresh: 'Оновлення',
    meta: 'Мета',
    chooseLocal: 'Оберіть локальний лог-файл',
    chooseRemote: 'Оберіть віддалений шлях до логу',
    noPath: 'Не вибрано шлях до логу.',
    noSession: 'Для віддаленого логу потрібна активна SSH-сесія.',
    openSession: 'Відкрий SSH-сесію, щоб читати віддалені логи.',
    loading: 'Завантажую останні рядки...',
    ready: 'Готово',
    readyToLoad: 'Готово до завантаження',
    unavailable: 'Backend log viewer недоступний.',
    imported: 'Імпортовано {count} plugin manifest{suffix}.',
    importFailed: 'Не вдалося імпортувати plugin manifest.',
    plugins: 'Плагіни',
    importManifest: 'Імпорт manifest',
    currentSession: 'Сесія: {server}',
    noMatchingLines: 'Немає рядків за фільтром',
    adjustFilter: 'Зміни фільтр або завантаж інше джерело.',
    idle: 'Готово до завантаження',
    lineCount: '{count} рядків',
    showingLast: 'показано останні {count}',
    showingCount: 'показано {count}',
    logViewer: 'Log Viewer',
    reload: 'Оновити',
    close: 'Закрити',
    pipeline: 'Пайплайн',
    timeline: 'Timeline',
    sourceInfo: 'Джерело',
    mode: 'Режим',
    session: 'Сесія',
    tailMode: 'Tail',
    localFile: 'Локальний файл',
    detached: 'Без сесії',
    manual: 'вручну',
    planned: 'planned',
    readyState: 'ready',
    beta: 'beta',
    manifest: 'manifest',
    scanner: 'Відомий user-agent інтернет-сканера.',
    probe: 'Некоректний або не-HTTP probe payload.',
    recon: 'Схоже на розвідку секретних файлів або адмін-шляхів.',
    malformedStatus: 'Поганий запит або probe був відхилений сервером.',
  },
  de: {
    logs: 'Logs',
    openViewer: 'Viewer öffnen',
    openManifest: 'Plugin-Manifest öffnen',
    source: 'Quelle',
    local: 'Lokal',
    sftp: 'SFTP',
    openFile: 'Öffnen…',
    load: 'Laden',
    loadSftp: 'Per SFTP laden',
    filter: 'Filter',
    searchOrRegex: 'Suche oder Regex',
    regex: 'Regex',
    tail: 'Tail',
    lines: 'Zeilen',
    refresh: 'Aktualisierung',
    meta: 'Meta',
    chooseLocal: 'Lokale Log-Datei wählen',
    chooseRemote: 'Remote-Logpfad wählen',
    noPath: 'Kein Logpfad ausgewählt.',
    noSession: 'Für Remote-Logs ist eine aktive SSH-Sitzung nötig.',
    openSession: 'Öffne eine SSH-Sitzung, um Remote-Logs zu lesen.',
    loading: 'Letzte Zeilen werden geladen...',
    ready: 'Bereit',
    readyToLoad: 'Bereit zum Laden',
    unavailable: 'Log-Viewer-Backend ist nicht verfügbar.',
    imported: '{count} Plugin-Manifest{suffix} importiert.',
    importFailed: 'Plugin-Manifest konnte nicht importiert werden.',
    plugins: 'Plugins',
    importManifest: 'Manifest importieren',
    currentSession: 'Sitzung: {server}',
    noMatchingLines: 'Keine passenden Zeilen',
    adjustFilter: 'Filter anpassen oder andere Quelle laden.',
    idle: 'Bereit zum Laden',
    lineCount: '{count} Zeilen',
    showingLast: 'zeige letzte {count}',
    showingCount: 'zeige {count}',
    logViewer: 'Log Viewer',
    reload: 'Neu laden',
    close: 'Schließen',
    pipeline: 'Pipeline',
    timeline: 'Timeline',
    sourceInfo: 'Quelle',
    mode: 'Modus',
    session: 'Sitzung',
    tailMode: 'Tail',
    localFile: 'Lokale Datei',
    detached: 'Getrennt',
    manual: 'manuell',
    planned: 'geplant',
    readyState: 'bereit',
    beta: 'beta',
    manifest: 'manifest',
    scanner: 'Bekannter User-Agent eines Internet-Scanners.',
    probe: 'Fehlerhafte oder nicht-HTTP Probe-Payload.',
    recon: 'Sieht nach Aufklärung für geheime Dateien oder Admin-Pfade aus.',
    malformedStatus: 'Ungültige Anfrage oder Probe wurde vom Server abgewiesen.',
  },
}

function resolvePluginText(plugin: LogPluginManifest, lang: Lang) {
  return {
    name: lang === 'uk' ? (plugin.nameUk ?? plugin.name) : lang === 'de' ? (plugin.nameDe ?? plugin.name) : plugin.name,
    description: lang === 'uk'
      ? (plugin.descriptionUk ?? plugin.description)
      : lang === 'de'
        ? (plugin.descriptionDe ?? plugin.description)
        : plugin.description,
  }
}

function copyFor(lang: Lang, key: keyof typeof LOGS_COPY.en) {
  return LOGS_COPY[lang][key] ?? LOGS_COPY.en[key]
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  )
}

function getBridge() {
  return (window as Window & { nextterm?: {
    readLocalLogTail?: (path: string, maxLines: number) => Promise<LogSnapshot>
    readRemoteLogTail?: (sessionId: string, path: string, maxLines: number) => Promise<LogSnapshot>
  } }).nextterm
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapRegex(input: string, pattern: RegExp, className: string) {
  return input.replace(pattern, `<span class="${className}">$1</span>`)
}

function parseAccessLog(text: string): AccessLogMatch | null {
  const match = text.match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"$/
  )

  if (!match) return null

  const request = match[3]
  const requestParts = request.match(/^([A-Z]+)\s+(.+?)\s+(HTTP\/[0-9.]+)$/)

  return {
    ip: match[1],
    timestamp: match[2],
    request,
    method: requestParts?.[1] ?? null,
    path: requestParts?.[2] ?? null,
    protocol: requestParts?.[3] ?? null,
    status: match[4],
    bytes: match[5],
    referrer: match[6],
    userAgent: match[7],
  }
}

function isSuspiciousLine(text: string) {
  return /(\.env(?:\.[\w-]+)?|wp-admin|wp-login\.php|phpmyadmin|boaform|vendor\/phpunit|\$\(pwd\)|\/login\b|\/admin\b)/i.test(text)
}

function detectLevel(text: string): LogLevel {
  const access = parseAccessLog(text)
  if (access) {
    const statusCode = Number(access.status)
    if (statusCode >= 500) return 'error'
    if (statusCode >= 400) return 'warn'
    if (statusCode >= 300) return 'info'
  }

  const upper = text.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('FATAL') || upper.includes('PANIC')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  if (upper.includes('INFO')) return 'info'
  if (upper.includes('DEBUG') || upper.includes('TRACE')) return 'debug'
  return 'plain'
}

function getStatusMeaning(statusCode: number) {
  const explanations: Record<number, string> = {
    200: '200 OK',
    301: '301 Moved Permanently',
    302: '302 Found',
    304: '304 Not Modified',
    400: '400 Bad Request',
    401: '401 Unauthorized',
    403: '403 Forbidden',
    404: '404 Not Found',
    429: '429 Too Many Requests',
    444: '444 No Response',
    500: '500 Internal Server Error',
    502: '502 Bad Gateway',
    503: '503 Service Unavailable',
    504: '504 Gateway Timeout',
  }
  return explanations[statusCode] ?? `${statusCode}`
}

function compactTimestamp(timestamp: string) {
  const match = timestamp.match(/:(\d{2}:\d{2}:\d{2})\s/)
  return match?.[1] ?? timestamp
}

function containsNonPrintable(text: string) {
  return /\\x[0-9a-f]{2}/i.test(text) || /[^\x20-\x7E\t]/.test(text)
}

function dedupeAnnotations(items: Annotation[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.label}:${item.description}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getAnnotations(match: AccessLogMatch, lang: Lang) {
  const annotations: Annotation[] = []
  const agent = match.userAgent.toLowerCase()
  const request = match.request
  const path = match.path ?? request

  if (/censys|shodan|zgrab|masscan|binaryedge/.test(agent)) {
    annotations.push({
      label: 'scanner',
      tone: 'warn',
      description: copyFor(lang, 'scanner'),
    })
  }

  if (!match.method || containsNonPrintable(request)) {
    annotations.push({
      label: 'probe',
      tone: 'danger',
      description: copyFor(lang, 'probe'),
    })
  } else if (isSuspiciousLine(path)) {
    annotations.push({
      label: 'recon',
      tone: 'warn',
      description: copyFor(lang, 'recon'),
    })
  }

  const statusCode = Number(match.status)
  if (statusCode === 444 || statusCode === 400) {
    annotations.push({
      label: `status ${match.status}`,
      tone: statusCode === 444 ? 'info' : 'neutral',
      description: statusCode === 444 || statusCode === 400 ? copyFor(lang, 'malformedStatus') : getStatusMeaning(statusCode),
    })
  }

  return dedupeAnnotations(annotations)
}

function tryFormatJson(text: string) {
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

function collectTimeline(lines: LogLine[]) {
  const events = lines
    .map((line) => {
      const match = line.text.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\])/)
      return match ? { stamp: match[1], level: line.level } : null
    })
    .filter((item): item is { stamp: string; level: LogLevel } => Boolean(item))

  const unique: { stamp: string; level: LogLevel }[] = []
  const seen = new Set<string>()
  for (const item of events) {
    if (seen.has(item.stamp)) continue
    seen.add(item.stamp)
    unique.push(item)
    if (unique.length >= 8) break
  }
  return unique
}

const LogLineContent = memo(function LogLineContent({
  line,
  plugins,
  lang,
}: {
  line: LogLine
  plugins: Set<string>
  lang: Lang
}) {
  const access = plugins.has('nginx-parser') ? parseAccessLog(line.text) : null
  if (access) {
    const statusCode = Number(access.status)
    const annotations = plugins.has('alert-rules') ? getAnnotations(access, lang) : []
    return (
      <div className="logv-access-line">
        <span className="logv-token-time logv-tip-anchor" data-logv-tip={access.timestamp}>{escapeHtml(compactTimestamp(access.timestamp))}</span>
        <span className="logv-token-ip">{escapeHtml(access.ip)}</span>
        <span
          className={`logv-token-status logv-tip-anchor logv-token-status-${statusCode >= 500 ? '5xx' : statusCode >= 400 ? '4xx' : statusCode >= 300 ? '3xx' : '2xx'}`}
          data-logv-tip={getStatusMeaning(statusCode)}
        >
          {escapeHtml(access.status)}
        </span>
        {access.method && <span className="logv-token-method">{escapeHtml(access.method)}</span>}
        <span className={`logv-token-path ${plugins.has('alert-rules') && isSuspiciousLine(access.path ?? access.request) ? 'logv-token-suspicious' : ''}`}>
          {escapeHtml(access.path ?? access.request)}
        </span>
        {access.protocol && <span className="logv-token-protocol">{escapeHtml(access.protocol)}</span>}
        <span className="logv-token-bytes">{escapeHtml(access.bytes)} B</span>
        {annotations.map((annotation) => (
          <span
            key={`${annotation.label}-${annotation.description}`}
            className={`logv-annotation logv-tip-anchor logv-annotation-${annotation.tone}`}
            data-logv-tip={annotation.description}
          >
            {annotation.label}
          </span>
        ))}
        <span className="logv-token-agent logv-tip-anchor" data-logv-tip={access.userAgent}>{escapeHtml(access.userAgent.length > 52 ? access.userAgent.slice(0, 52) + '…' : access.userAgent)}</span>
      </div>
    )
  }

  const prettyJson = plugins.has('json-pretty') ? tryFormatJson(line.text) : null
  const sourceText = prettyJson ?? line.text

  let html = escapeHtml(sourceText)
  html = wrapRegex(html, /(\b(?:\d{1,3}\.){3}\d{1,3}\b)/g, 'logv-token-ip')
  html = wrapRegex(html, /\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g, 'logv-token-method')
  html = wrapRegex(html, /(\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b|\[\d{2}\/[A-Za-z]{3}\/\d{4}:[^\]]+\])/g, 'logv-token-time')
  html = wrapRegex(html, /\b([45]\d{2}|[123]\d{2})\b/g, 'logv-token-status-inline')
  if (plugins.has('alert-rules')) {
    html = wrapRegex(html, /(\.env(?:\.[\w-]+)?|wp-admin|wp-login\.php|phpmyadmin|boaform|vendor\/phpunit)/gi, 'logv-token-suspicious')
  }
  if (plugins.has('laravel-parser')) {
    html = wrapRegex(html, /(production\.ERROR|local\.ERROR|Stack trace:|PDOException|QueryException|FatalThrowableError)/g, 'logv-token-laravel')
  }

  return <pre className="logv-log-text" dangerouslySetInnerHTML={{ __html: html }} />
})

// ── Progressive log list ───────────────────────────────────────────────────
const PAGE = 300  // rows rendered per page load
const NEAR_BOTTOM_PX = 400  // px from bottom to trigger next page

const VirtualLogList = memo(function VirtualLogList({
  lines,
  plugins,
  lang,
  isSuspicious,
  resetKey,
}: {
  lines: LogLine[]
  plugins: Set<string>
  lang: Lang
  isSuspicious: (text: string) => boolean
  resetKey: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef       = useRef<number>(0)
  const [rendered, setRendered] = useState(PAGE)

  // Reset only when file/filter changes (not on tail updates)
  const prevResetKeyRef = useRef(resetKey)
  if (prevResetKeyRef.current !== resetKey) {
    prevResetKeyRef.current = resetKey
    Promise.resolve().then(() => setRendered(PAGE))
  }

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distToBottom < NEAR_BOTTOM_PX) {
        setRendered(prev => Math.min(prev + PAGE, lines.length))
      }
    })
  }, [lines.length])

  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  const slice = lines.slice(0, rendered)

  return (
    <div ref={containerRef} className="logv-list" onScroll={onScroll}>
      {slice.map((line) => (
        <article
          key={line.index}
          className={`logv-row level-${line.level}${plugins.has('alert-rules') && isSuspicious(line.text) ? ' is-suspicious' : ''}`}
        >
          <div className="logv-line-number">{formatNumber(line.index)}</div>
          <div className="logv-line-body">
            <LogLineContent line={line} plugins={plugins} lang={lang} />
          </div>
        </article>
      ))}
      {rendered < lines.length && (
        <div className="logv-load-more" aria-hidden>
          ↓ {lines.length - rendered} more lines — scroll to load
        </div>
      )}
    </div>
  )
})

export function LogViewerPanel({
  sessionId,
  serverName,
  isMinimized,
  onMinimizedChange,
}: {
  sessionId: string | null
  serverName?: string | null
  isMinimized?: boolean
  onMinimizedChange?: (v: boolean) => void
}) {
  const { lang } = useLanguage()
  const [source, setSource] = useState<LogSource>('local')
  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState('/var/log/nginx/access.log')
  const [query, setQuery] = useState('')
  const [regexEnabled, setRegexEnabled] = useState(false)
  const [tailEnabled, setTailEnabled] = useState(true)
  const [refreshMs, setRefreshMs] = useState(1500)
  const [maxLines, setMaxLines] = useState(1500)
  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null)
  const [status, setStatus] = useState(copyFor(lang, 'idle'))
  const [lastError, setLastError] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [importedPlugins, setImportedPlugins] = useState<LogPluginManifest[]>([])
  const [activePluginIds, setActivePluginIds] = useState<string[]>(DEFAULT_ACTIVE_PLUGINS)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // ── Tabs + recent ────────────────────────────────────────────────────────
  const [openTabs, setOpenTabs] = useState<LogTabEntry[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const _minimized = isMinimized ?? false
  const setMinimized = (v: boolean) => onMinimizedChange?.(v)
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_LOGS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  useEffect(() => {
    try {
      const rawImported = localStorage.getItem(IMPORTED_PLUGINS_KEY)
      const rawActive = localStorage.getItem(ACTIVE_PLUGINS_KEY)
      if (rawImported) setImportedPlugins(JSON.parse(rawImported))
      if (rawActive) setActivePluginIds(JSON.parse(rawActive))
    } catch {
      // Ignore malformed local state.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(IMPORTED_PLUGINS_KEY, JSON.stringify(importedPlugins))
  }, [importedPlugins])

  useEffect(() => {
    localStorage.setItem(ACTIVE_PLUGINS_KEY, JSON.stringify(activePluginIds))
  }, [activePluginIds])

  useEffect(() => {
    if (!lastError && !snapshot) {
      setStatus(copyFor(lang, 'idle'))
    }
  }, [lang, lastError, snapshot])

  useEffect(() => {
    localStorage.setItem(RECENT_LOGS_KEY, JSON.stringify(recentLogs))
  }, [recentLogs])

  function switchToTab(id: string) {
    const tab = openTabs.find(t => t.id === id)
    if (!tab) return
    setActiveTabId(id)
    setSource(tab.source)
    if (tab.source === 'local') setLocalPath(tab.path)
    else setRemotePath(tab.path)
    if (tab.snapshot) setSnapshot(tab.snapshot)
    setViewerOpen(true)
    setMinimized(false)
  }

  function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setOpenTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        const newActive = next[next.length - 1] ?? null
        if (newActive) {
          setActiveTabId(newActive.id)
          setSource(newActive.source)
          if (newActive.source === 'local') setLocalPath(newActive.path)
          else setRemotePath(newActive.path)
          if (newActive.snapshot) setSnapshot(newActive.snapshot)
        } else {
          setActiveTabId(null)
          setViewerOpen(false)
        }
      }
      return next
    })
  }

  async function loadSnapshot(targetSource: LogSource, targetPath: string, silent = false) {
    const nt = getBridge()
    const normalizedPath = targetPath.trim()
    if (!normalizedPath) {
      setStatus(copyFor(lang, 'chooseLocal'))
      setLastError(copyFor(lang, 'noPath'))
      return
    }

    if (targetSource === 'sftp' && !sessionId) {
      setStatus(copyFor(lang, 'openSession'))
      setLastError(copyFor(lang, 'noSession'))
      return
    }

    setStatus(copyFor(lang, 'loading'))
    setLastError(null)

    try {
      const nextSnapshot = targetSource === 'local'
        ? await nt?.readLocalLogTail?.(normalizedPath, maxLines)
        : await nt?.readRemoteLogTail?.(sessionId!, normalizedPath, maxLines)

      if (!nextSnapshot) {
        throw new Error(copyFor(lang, 'unavailable'))
      }

      setSnapshot(nextSnapshot)
      setViewerOpen(true)
      if (!silent) setMinimized(false)
      setStatus(copyFor(lang, 'ready'))

      // Update tabs
      setOpenTabs(prev => {
        const existing = prev.find(t => t.source === targetSource && t.path === normalizedPath)
        if (existing) {
          setActiveTabId(existing.id)
          return prev.map(t => t.id === existing.id ? { ...t, snapshot: nextSnapshot } : t)
        }
        const newId = Date.now().toString()
        setActiveTabId(newId)
        return [...prev, { id: newId, source: targetSource, path: normalizedPath, sessionId: sessionId ?? null, snapshot: nextSnapshot }]
      })
      // Track recent
      setRecentLogs(prev => {
        const without = prev.filter(r => !(r.source === targetSource && r.path === normalizedPath))
        return [{ source: targetSource, path: normalizedPath, sessionId: sessionId ?? null, openedAt: Date.now() }, ...without].slice(0, MAX_RECENT)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(message)
      setLastError(message)
    }
  }

  async function refresh() {
    const targetPath = source === 'local' ? localPath : remotePath
    await loadSnapshot(source, targetPath, true)
  }

  useEffect(() => {
    if (!tailEnabled || !viewerOpen || !snapshot?.path) return
    const timer = window.setInterval(() => {
      void refresh()
    }, refreshMs)
    return () => window.clearInterval(timer)
  }, [tailEnabled, viewerOpen, snapshot?.path, refreshMs, source, localPath, remotePath, sessionId, maxLines, lang])

  const allPlugins = [...BUILTIN_PLUGINS, ...importedPlugins]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activePlugins = useMemo(() => new Set(activePluginIds), [activePluginIds.join(',')])

  const rawLines = useMemo(() => {
    if (!snapshot) return [] as LogLine[]
    return snapshot.lines.map((text, index) => ({
      index: snapshot.lineCount - snapshot.lines.length + index + 1,
      text,
      level: detectLevel(text),
    }))
  }, [snapshot])

  const visibleLines = useMemo(() => {
    if (!query.trim()) return rawLines
    try {
      if (regexEnabled) {
        const pattern = new RegExp(query, 'i')
        return rawLines.filter((line) => pattern.test(line.text))
      }
      const lowered = query.toLowerCase()
      return rawLines.filter((line) => line.text.toLowerCase().includes(lowered))
    } catch {
      return rawLines
    }
  }, [rawLines, query, regexEnabled])

  const stats = useMemo(() => visibleLines.reduce((acc, line) => {
    if (line.level === 'error') acc.errors += 1
    if (line.level === 'warn') acc.warns += 1
    if (line.level === 'info') acc.infos += 1
    if (line.level === 'debug') acc.debugs += 1
    return acc
  }, { errors: 0, warns: 0, infos: 0, debugs: 0 }), [visibleLines])

  const timeline = useMemo(() => activePlugins.has('timeline-view') ? collectTimeline(visibleLines) : [], [activePlugins, visibleLines])

  const isSuspiciousLineCb = useCallback(isSuspiciousLine, [])

  function togglePlugin(plugin: LogPluginManifest) {
    if (plugin.availability === 'planned') return
    setActivePluginIds((current) =>
      current.includes(plugin.id)
        ? current.filter((item) => item !== plugin.id)
        : [...current, plugin.id]
    )
  }

  async function openLocalFile() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Log files',
          extensions: ['log', 'txt', 'out', 'json', 'jsonl'],
        },
      ],
    })

    if (typeof selected === 'string') {
      setSource('local')
      setLocalPath(selected)
      void loadSnapshot('local', selected)
    }
  }

  function importPlugins(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text)
        const payload = Array.isArray(parsed) ? parsed : [parsed]
        const manifests = payload.map((item: Partial<LogPluginManifest>, index: number) => ({
          id: item.id ?? `manifest-${Date.now()}-${index}`,
          name: item.name ?? item.id ?? `Plugin ${index + 1}`,
          description: item.description ?? 'Imported plugin manifest',
          version: item.version ?? 'manifest',
          capabilities: Array.isArray(item.capabilities) ? item.capabilities : ['manifest'],
          availability: 'manifest' as PluginAvailability,
        }))

        setImportedPlugins((current) => {
          const next = [...current]
          for (const manifest of manifests) {
            const existingIndex = next.findIndex((item) => item.id === manifest.id)
            if (existingIndex >= 0) next[existingIndex] = manifest
            else next.push(manifest)
          }
          return next
        })
        setStatus(interpolate(copyFor(lang, 'imported'), {
          count: manifests.length,
          suffix: manifests.length > 1 && lang === 'en' ? 's' : '',
        }))
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error))
        setStatus(copyFor(lang, 'importFailed'))
      } finally {
        event.target.value = ''
      }
    })
  }

  const overlayTarget = typeof document === 'undefined' ? null : document.querySelector('.terminal-area')

  const metaText = snapshot
    ? [
        interpolate(copyFor(lang, 'lineCount'), { count: formatNumber(snapshot.lineCount) }),
        formatBytes(snapshot.fileSize),
        interpolate(snapshot.truncated ? copyFor(lang, 'showingLast') : copyFor(lang, 'showingCount'), {
          count: formatNumber(snapshot.lines.length),
        }),
      ].join(' · ')
    : source === 'local'
      ? copyFor(lang, 'chooseLocal')
      : copyFor(lang, 'chooseRemote')

  return (
    <>
      <div className="ph">
        <div className="ph-title">{copyFor(lang, 'logs')}</div>
        <div className="ph-acts">
          <button className="ph-btn" title={copyFor(lang, 'openManifest')} onClick={() => importInputRef.current?.click()}>
            +
          </button>
          <button className="ph-btn" title={copyFor(lang, 'openViewer')} onClick={() => setViewerOpen(true)}>
            □
          </button>
        </div>
      </div>

      <div className="panel-scroll logv-panel">
        <div className="logv-section">
          <div className="logv-section-label">{copyFor(lang, 'source')}</div>
          <div className="logv-source-tabs">
            <button className={`logv-source-tab ${source === 'local' ? 'active' : ''}`} onClick={() => setSource('local')}>{copyFor(lang, 'local')}</button>
            <button className={`logv-source-tab ${source === 'sftp' ? 'active' : ''}`} onClick={() => setSource('sftp')}>{copyFor(lang, 'sftp')}</button>
          </div>

          {source === 'local' ? (
            <>
              <input
                className="logv-input"
                value={localPath}
                onChange={(event) => {
                  setLocalPath(event.target.value)
                  setLastError(null)
                  setStatus(copyFor(lang, 'readyToLoad'))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadSnapshot('local', localPath)
                }}
                placeholder="D:\logs\app.log"
              />
              <div className="logv-row">
                <button className="logv-btn logv-btn-primary" onClick={() => void openLocalFile()}>{copyFor(lang, 'openFile')}</button>
                <button className="logv-btn" onClick={() => void loadSnapshot('local', localPath)}>{copyFor(lang, 'load')}</button>
              </div>
            </>
          ) : (
            <>
              <input
                className="logv-input"
                value={remotePath}
                onChange={(event) => {
                  setRemotePath(event.target.value)
                  setLastError(null)
                  setStatus(copyFor(lang, 'readyToLoad'))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadSnapshot('sftp', remotePath)
                }}
                placeholder="/var/log/nginx/access.log"
              />
              <div className="logv-preset-grid">
                {REMOTE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className="logv-pill"
                    onClick={() => {
                      setRemotePath(preset)
                      setSource('sftp')
                    }}
                  >
                    {preset.split('/').slice(-2).join('/')}
                  </button>
                ))}
              </div>
              <div className="logv-remote-note">
                {sessionId ? copyFor(lang, 'currentSession').replace('{server}', serverName ?? copyFor(lang, 'session').toLowerCase()) : copyFor(lang, 'openSession')}
              </div>
              <div className="logv-row">
                <button className="logv-btn logv-btn-primary" disabled={!sessionId} onClick={() => void loadSnapshot('sftp', remotePath)}>{copyFor(lang, 'loadSftp')}</button>
              </div>
            </>
          )}
        </div>

        <div className="logv-section">
          <div className="logv-section-label">{copyFor(lang, 'filter')}</div>
          <input className="logv-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copyFor(lang, 'searchOrRegex')} />
          <div className="logv-row logv-row-tight">
            <label className="logv-toggle">
              <input type="checkbox" checked={regexEnabled} onChange={(event) => setRegexEnabled(event.target.checked)} />
              <span>{copyFor(lang, 'regex')}</span>
            </label>
            <label className="logv-toggle">
              <input type="checkbox" checked={tailEnabled} onChange={(event) => setTailEnabled(event.target.checked)} />
              <span>{copyFor(lang, 'tail')}</span>
            </label>
          </div>
          <div className="logv-grid-two">
            <label className="logv-field">
              <span>{copyFor(lang, 'lines')}</span>
              <input
                className="logv-input"
                type="number"
                min={100}
                max={5000}
                step={100}
                value={maxLines}
                onChange={(event) => setMaxLines(clampNumber(Number(event.target.value), 100, 5000, 1500))}
              />
            </label>
            <label className="logv-field">
              <span>{copyFor(lang, 'refresh')}</span>
              <input
                className="logv-input"
                type="number"
                min={500}
                max={10000}
                step={100}
                value={refreshMs}
                onChange={(event) => setRefreshMs(clampNumber(Number(event.target.value), 500, 10000, 1500))}
              />
            </label>
          </div>
        </div>

        {recentLogs.length > 0 && (
          <div className="logv-section">
            <div className="logv-section-label">{lang === 'uk' ? 'Останні відкриті' : lang === 'de' ? 'Zuletzt geöffnet' : 'Recent'}</div>
            <div className="logv-recent-list">
              {recentLogs.slice(0, 5).map((r, i) => (
                <button key={i} className="logv-recent-item" onClick={() => {
                  setSource(r.source)
                  if (r.source === 'local') setLocalPath(r.path)
                  else setRemotePath(r.path)
                  void loadSnapshot(r.source, r.path)
                }}>
                  <span className={`logv-recent-badge ${r.source}`}>{r.source === 'sftp' ? 'SFTP' : 'local'}</span>
                  <span className="logv-recent-path">{r.path.split(/[\\/]/).pop()}</span>
                  {openTabs.some(t => t.source === r.source && t.path === r.path) && (
                    <span className="logv-recent-open-dot" title="Open" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="logv-section">
          <div className="logv-section-label">{copyFor(lang, 'meta')}</div>
          <div className="logv-meta-card">{metaText}</div>
          <div className={`logv-status ${lastError ? 'is-error' : ''}`}>{lastError ?? status}</div>
        </div>

        <div className="logv-section">
          <div className="logv-section-head">
            <div className="logv-section-label">{copyFor(lang, 'plugins')}</div>
            <button className="logv-link-btn" onClick={() => importInputRef.current?.click()}>{copyFor(lang, 'importManifest')}</button>
          </div>
          <div className="logv-plugin-list">
            {allPlugins.map((plugin) => {
              const isActive = activePlugins.has(plugin.id)
              const text = resolvePluginText(plugin, lang)
              return (
                <button
                  key={plugin.id}
                  className={`logv-plugin-card ${isActive ? 'is-active' : ''} ${plugin.availability === 'planned' ? 'is-planned' : ''}`}
                  onClick={() => togglePlugin(plugin)}
                  disabled={plugin.availability === 'planned'}
                >
                  <div className="logv-plugin-top">
                    <strong>{text.name}</strong>
                    <span className={`logv-plugin-state state-${plugin.availability ?? 'ready'}`}>{copyFor(lang, plugin.availability === 'planned' ? 'planned' : plugin.availability === 'beta' ? 'beta' : plugin.availability === 'manifest' ? 'manifest' : 'readyState')}</span>
                  </div>
                  <div className="logv-plugin-desc">{text.description}</div>
                  <div className="logv-plugin-caps">
                    {(plugin.capabilities ?? []).slice(0, 3).map((capability) => (
                      <span key={capability}>{capability}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importPlugins} />

      {viewerOpen && !_minimized && overlayTarget && createPortal(
        <div className="logv-overlay">
          {/* Tab bar */}
          {openTabs.length > 0 && (
            <div className="logv-tab-bar">
              {openTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`logv-tab${tab.id === activeTabId ? ' active' : ''}`}
                  onClick={() => switchToTab(tab.id)}
                >
                  <span className={`logv-tab-src ${tab.source}`}>{tab.source === 'sftp' ? 'S' : 'L'}</span>
                  <span className="logv-tab-name">{tab.path.split(/[\\/]/).pop()}</span>
                  <span className="logv-tab-close" onClick={e => closeTab(tab.id, e)}>✕</span>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                className="logv-btn logv-minimize-btn"
                onClick={() => setMinimized(true)}
                title={lang === 'uk' ? 'Згорнути' : lang === 'de' ? 'Minimieren' : 'Minimize'}
              >▼</button>
              <button className="logv-btn" onClick={() => { setViewerOpen(false); setMinimized(false) }} title={copyFor(lang, 'close')}>✕</button>
            </div>
          )}

          {(
          <div className="logv-workspace">
            <div className="logv-toolbar">
              <div className="logv-toolbar-main">
                <div className="logv-title-block">
                  <div className="logv-title">{copyFor(lang, 'logViewer')}</div>
                  <div className="logv-current-path">{snapshot?.path ?? (source === 'local' ? localPath || copyFor(lang, 'chooseLocal') : remotePath || copyFor(lang, 'chooseRemote'))}</div>
                </div>
                <div className="logv-toolbar-actions">
                  <button className="logv-btn" onClick={() => void refresh()}>{copyFor(lang, 'reload')}</button>
                  {openTabs.length === 0 && <button className="logv-btn" onClick={() => setViewerOpen(false)}>{copyFor(lang, 'close')}</button>}
                </div>
              </div>

              <div className="logv-toolbar-sub">
                <input className="logv-input logv-toolbar-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copyFor(lang, 'searchOrRegex')} />
                <label className="logv-toggle">
                  <input type="checkbox" checked={regexEnabled} onChange={(event) => setRegexEnabled(event.target.checked)} />
                  <span>{copyFor(lang, 'regex')}</span>
                </label>
                <label className="logv-toggle">
                  <input type="checkbox" checked={tailEnabled} onChange={(event) => setTailEnabled(event.target.checked)} />
                  <span>{copyFor(lang, 'tail')}</span>
                </label>
                <div className="logv-meta-inline">{metaText}</div>
              </div>
            </div>

            <div className="logv-body">
              <div className="logv-stream">
                <div className="logv-stats">
                  <div className="logv-stat errors">E <strong>{formatNumber(stats.errors)}</strong></div>
                  <div className="logv-stat warns">W <strong>{formatNumber(stats.warns)}</strong></div>
                  <div className="logv-stat infos">I <strong>{formatNumber(stats.infos)}</strong></div>
                  <div className="logv-stat debugs">D <strong>{formatNumber(stats.debugs)}</strong></div>
                </div>

                {!visibleLines.length ? (
                  <div className="logv-empty">
                    <h3>{copyFor(lang, 'noMatchingLines')}</h3>
                    <p>{copyFor(lang, 'adjustFilter')}</p>
                  </div>
                ) : (
                  <VirtualLogList
                    lines={visibleLines}
                    plugins={activePlugins}
                    lang={lang}
                    isSuspicious={isSuspiciousLineCb}
                    resetKey={`${snapshot?.path ?? ''}::${query}::${regexEnabled}`}
                  />
                )}
              </div>

              <aside className="logv-sidecar">
                <div className="logv-sidecar-card">
                  <div className="logv-sidecar-title">{copyFor(lang, 'pipeline')}</div>
                  <div className="logv-sidecar-list">
                    {allPlugins.filter((plugin) => activePlugins.has(plugin.id)).map((plugin) => (
                      <div key={plugin.id} className="logv-sidecar-item">
                        <strong>{plugin.name}</strong>
                        <span>{plugin.version ?? plugin.availability ?? 'ready'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {timeline.length > 0 && (
                  <div className="logv-sidecar-card">
                    <div className="logv-sidecar-title">{copyFor(lang, 'timeline')}</div>
                    <div className="logv-timeline">
                      {timeline.map((item) => (
                        <div key={`${item.stamp}-${item.level}`} className={`logv-timeline-item level-${item.level}`}>
                          <span>{item.stamp}</span>
                          <strong>{item.level}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="logv-sidecar-card">
                  <div className="logv-sidecar-title">{copyFor(lang, 'sourceInfo')}</div>
                  <div className="logv-sidecar-kv">
                    <span>{copyFor(lang, 'mode')}</span>
                    <strong>{source === 'local' ? copyFor(lang, 'localFile') : copyFor(lang, 'sftp')}</strong>
                  </div>
                  <div className="logv-sidecar-kv">
                    <span>{copyFor(lang, 'session')}</span>
                    <strong>{serverName ?? copyFor(lang, 'detached')}</strong>
                  </div>
                  <div className="logv-sidecar-kv">
                    <span>{copyFor(lang, 'tailMode')}</span>
                    <strong>{tailEnabled ? `${refreshMs} ms` : copyFor(lang, 'manual')}</strong>
                  </div>
                </div>
              </aside>
            </div>
          </div>
          )}{/* end workspace */}
        </div>,
        overlayTarget
      )}
    </>
  )
}
