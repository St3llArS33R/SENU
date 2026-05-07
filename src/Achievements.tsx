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

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import './achievements.css'

// ── Achievement definitions ────────────────────────────────────────────────

export type AchievementId =
  // First Steps (5)
  | 'first-light' | 'hello-world' | 'note-taker' | 'snippet-saver' | 'theme-explorer'
  // Connection (8)
  | 'multi-tasker' | 'squad-goals' | 'session-marathon' | 'comeback-kid'
  | 'jump-master' | 'docker-diver' | 'serial-port' | 'telnet-nostalgic'
  // Security (6)
  | 'key-smith' | 'fingerprint' | 'agent-mode'
  | 'privacy-first' | 'bouncer'
  // Productivity (8)
  | 'command-hero' | 'broadcast-mode' | 'split-brain' | 'tunnel-vision'
  | 'file-surgeon' | 'log-hunter' | 'ssh-import' | 'quick-draw'
  // Streaks (6)
  | 'day-one' | 'week-warrior' | 'fortnight' | 'monthly' | 'season' | 'dedicated'
  // Explorer (8)
  | 'server-farm' | 'snippet-library' | 'prolific' | 'sftp-sailor'
  | 'log-analyst' | 'theme-collector' | 'polyglot' | 'all-types'
  // Power User (9)
  | 'six-panes' | 'marathon-session' | 'night-owl' | 'early-bird'
  | 'speed-run' | 'log-master' | 'obsessed' | 'veteran' | 'legend'

export type AchievementCategory = 'first-steps' | 'connection' | 'security' | 'productivity' | 'streaks' | 'explorer' | 'power'
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface Achievement {
  id: AchievementId
  category: AchievementCategory
  rarity: AchievementRarity
  icon: string
  name: string
  nameUk: string
  nameDe: string
  desc: string
  descUk: string
  descDe: string
  hidden?: boolean  // secret achievement
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── First Steps ───────────────────────────────────────────────────────────
  { id: 'first-light', category: 'first-steps', rarity: 'common', icon: '✦',
    name: 'First Light', nameUk: 'Перший запуск', nameDe: 'Erstes Licht',
    desc: 'Launch SENU for the first time', descUk: 'Запусти SENU вперше', descDe: 'SENU zum ersten Mal starten' },
  { id: 'hello-world', category: 'first-steps', rarity: 'common', icon: '⚡',
    name: 'Hello World', nameUk: 'Hello World', nameDe: 'Hello World',
    desc: 'Establish your first SSH connection', descUk: 'Встановити перше SSH-підключення', descDe: 'Erste SSH-Verbindung herstellen' },
  { id: 'note-taker', category: 'first-steps', rarity: 'common', icon: '✍',
    name: 'Note Taker', nameUk: 'Нотатник', nameDe: 'Notizbuch',
    desc: 'Create your first note', descUk: 'Створи першу нотатку', descDe: 'Erste Notiz erstellen' },
  { id: 'snippet-saver', category: 'first-steps', rarity: 'common', icon: '📎',
    name: 'Snippet Saver', nameUk: 'Сніпет', nameDe: 'Snippet',
    desc: 'Save your first command snippet', descUk: 'Зберегти перший сніпет команди', descDe: 'Ersten Befehls-Snippet speichern' },
  { id: 'theme-explorer', category: 'first-steps', rarity: 'common', icon: '🎨',
    name: 'Theme Explorer', nameUk: 'Оглядач тем', nameDe: 'Themen-Entdecker',
    desc: 'Switch to a different theme', descUk: 'Змінити тему', descDe: 'Zu einem anderen Theme wechseln' },

  // ── Connection ────────────────────────────────────────────────────────────
  { id: 'multi-tasker', category: 'connection', rarity: 'common', icon: '⊞',
    name: 'Multi-Tasker', nameUk: 'Багатозадачність', nameDe: 'Multitasking',
    desc: 'Have 2 active sessions simultaneously', descUk: 'Мати 2 активні сесії одночасно', descDe: '2 gleichzeitige Sitzungen haben' },
  { id: 'squad-goals', category: 'connection', rarity: 'uncommon', icon: '⊟',
    name: 'Squad Goals', nameUk: 'Командна гра', nameDe: 'Team-Ziele',
    desc: 'Have 5 active sessions simultaneously', descUk: 'Мати 5 активних сесій одночасно', descDe: '5 gleichzeitige Sitzungen haben' },
  { id: 'session-marathon', category: 'connection', rarity: 'uncommon', icon: '⏱',
    name: 'Session Marathon', nameUk: 'Марафон сесій', nameDe: 'Sitzungs-Marathon',
    desc: 'Stay connected for 1 hour straight', descUk: 'Залишатися підключеним 1 годину', descDe: '1 Stunde lang verbunden bleiben' },
  { id: 'comeback-kid', category: 'connection', rarity: 'common', icon: '↩',
    name: 'Comeback Kid', nameUk: 'Повернення', nameDe: 'Comeback',
    desc: 'Reconnect after a disconnection', descUk: 'Перепідключитися після розриву', descDe: 'Nach einem Disconnect neu verbinden' },
  { id: 'jump-master', category: 'connection', rarity: 'rare', icon: '⤵',
    name: 'Jump Master', nameUk: 'Майстер ProxyJump', nameDe: 'Jump Master',
    desc: 'Connect through a jump host (ProxyJump)', descUk: "Підключитися через jump host", descDe: 'Verbindung über Jump Host herstellen' },
  { id: 'docker-diver', category: 'connection', rarity: 'uncommon', icon: '🐳',
    name: 'Docker Diver', nameUk: 'Докер-дайвер', nameDe: 'Docker-Taucher',
    desc: 'Open a shell in a Docker container', descUk: 'Відкрити shell у Docker-контейнері', descDe: 'Shell in Docker-Container öffnen' },
  { id: 'serial-port', category: 'connection', rarity: 'rare', icon: '⌁',
    name: 'Serial Hacker', nameUk: 'Серійний хакер', nameDe: 'Serieller Hacker',
    desc: 'Connect to a serial/COM port device', descUk: 'Підключитися до серійного пристрою', descDe: 'Verbindung zu einem Seriell-Gerät' },
  { id: 'telnet-nostalgic', category: 'connection', rarity: 'uncommon', icon: '📡',
    name: 'Telnet Nostalgic', nameUk: 'Ностальгія по Telnet', nameDe: 'Telnet-Nostalgiker',
    desc: 'Use a Telnet connection', descUk: 'Використати Telnet-підключення', descDe: 'Telnet-Verbindung nutzen' },

  // ── Security ──────────────────────────────────────────────────────────────
  { id: 'key-smith', category: 'security', rarity: 'uncommon', icon: '🔑',
    name: 'Key Smith', nameUk: 'Ключар', nameDe: 'Schlüsselschmied',
    desc: 'Generate an SSH key pair', descUk: 'Згенерувати пару SSH-ключів', descDe: 'SSH-Schlüsselpaar generieren' },
  { id: 'fingerprint', category: 'security', rarity: 'uncommon', icon: '☞',
    name: 'Fingerprint', nameUk: 'Відбиток', nameDe: 'Fingerabdruck',
    desc: 'Verify a host key fingerprint', descUk: 'Перевірити fingerprint ключа хоста', descDe: 'Host-Key-Fingerprint verifizieren' },
  { id: 'agent-mode', category: 'security', rarity: 'uncommon', icon: '🤖',
    name: 'Agent Mode', nameUk: 'Режим агента', nameDe: 'Agenten-Modus',
    desc: 'Connect using SSH agent forwarding', descUk: 'Підключитися через SSH-агент', descDe: 'Mit SSH-Agent-Weiterleitung verbinden' },
  { id: 'privacy-first', category: 'security', rarity: 'common', icon: '🔒',
    name: 'Privacy First', nameUk: 'Спочатку приватність', nameDe: 'Privatsphäre zuerst',
    desc: 'Activate the Boss Key (panic mode)', descUk: 'Активувати Boss Key (panic mode)', descDe: 'Boss-Key (Panik-Modus) aktivieren' },
  { id: 'bouncer', category: 'security', rarity: 'rare', icon: '🚫',
    name: 'Bouncer', nameUk: 'Охоронець', nameDe: 'Türsteher',
    desc: 'Reject a suspicious changed host key', descUk: 'Відхилити підозрілий ключ хоста', descDe: 'Verdächtigen Host-Key ablehnen' },

  // ── Productivity ──────────────────────────────────────────────────────────
  { id: 'command-hero', category: 'productivity', rarity: 'uncommon', icon: '▶',
    name: 'Command Hero', nameUk: 'Командний герой', nameDe: 'Befehls-Held',
    desc: 'Execute 10 snippets', descUk: 'Виконати 10 сніпетів', descDe: '10 Snippets ausführen' },
  { id: 'broadcast-mode', category: 'productivity', rarity: 'rare', icon: '📢',
    name: 'Broadcast Mode', nameUk: 'Режим мовлення', nameDe: 'Broadcast-Modus',
    desc: 'Send input to all sessions at once', descUk: 'Надіслати ввід у всі сесії одночасно', descDe: 'Eingabe an alle Sitzungen senden' },
  { id: 'split-brain', category: 'productivity', rarity: 'uncommon', icon: '⊞',
    name: 'Split Brain', nameUk: 'Розщеплений екран', nameDe: 'Split-Ansicht',
    desc: 'Use any split pane layout', descUk: 'Використати будь-який split-layout', descDe: 'Einen geteilten Bereich verwenden' },
  { id: 'tunnel-vision', category: 'productivity', rarity: 'rare', icon: '⟶',
    name: 'Tunnel Vision', nameUk: 'Тунельне бачення', nameDe: 'Tunnel-Sicht',
    desc: 'Create a port forwarding tunnel', descUk: 'Створити тунель port forwarding', descDe: 'Port-Forwarding-Tunnel erstellen' },
  { id: 'file-surgeon', category: 'productivity', rarity: 'uncommon', icon: '✂',
    name: 'File Surgeon', nameUk: 'Файловий хірург', nameDe: 'Datei-Chirurg',
    desc: 'Edit a remote file in Monaco editor', descUk: 'Редагувати віддалений файл у Monaco', descDe: 'Remote-Datei im Monaco-Editor bearbeiten' },
  { id: 'log-hunter', category: 'productivity', rarity: 'common', icon: '🔍',
    name: 'Log Hunter', nameUk: 'Мисливець за логами', nameDe: 'Log-Jäger',
    desc: 'Open the log viewer', descUk: 'Відкрити Log Viewer', descDe: 'Log-Viewer öffnen' },
  { id: 'ssh-import', category: 'productivity', rarity: 'uncommon', icon: '↓',
    name: 'SSH Importer', nameUk: 'Імпортер SSH', nameDe: 'SSH-Importer',
    desc: 'Import hosts from ~/.ssh/config', descUk: 'Імпортувати хости з ~/.ssh/config', descDe: 'Hosts aus ~/.ssh/config importieren' },
  { id: 'quick-draw', category: 'productivity', rarity: 'common', icon: '⚡',
    name: 'Quick Draw', nameUk: 'Швидке підключення', nameDe: 'Schnellverbindung',
    desc: 'Use Quick Connect to connect instantly', descUk: 'Використати Quick Connect', descDe: 'Quick Connect verwenden' },

  // ── Streaks ───────────────────────────────────────────────────────────────
  { id: 'day-one', category: 'streaks', rarity: 'common', icon: '①',
    name: 'Day One', nameUk: 'День перший', nameDe: 'Tag Eins',
    desc: 'Launch SENU on 2 consecutive days', descUk: 'Запустити SENU 2 дні поспіль', descDe: 'SENU an 2 aufeinanderfolgenden Tagen starten' },
  { id: 'week-warrior', category: 'streaks', rarity: 'uncommon', icon: '7',
    name: 'Week Warrior', nameUk: 'Тижневий воїн', nameDe: 'Wochen-Krieger',
    desc: 'Launch SENU 7 days in a row', descUk: 'Запустити SENU 7 днів поспіль', descDe: 'SENU 7 Tage in Folge starten' },
  { id: 'fortnight', category: 'streaks', rarity: 'rare', icon: '14',
    name: 'Fortnight', nameUk: 'Два тижні', nameDe: 'Zwei Wochen',
    desc: 'Launch SENU 14 days in a row', descUk: 'Запустити SENU 14 днів поспіль', descDe: 'SENU 14 Tage in Folge starten' },
  { id: 'monthly', category: 'streaks', rarity: 'epic', icon: '30',
    name: 'Monthly', nameUk: 'Місяць', nameDe: 'Monatlich',
    desc: 'Launch SENU 30 days in a row', descUk: 'Запустити SENU 30 днів поспіль', descDe: 'SENU 30 Tage in Folge starten' },
  { id: 'season', category: 'streaks', rarity: 'epic', icon: '90',
    name: 'Season', nameUk: 'Сезон', nameDe: 'Saison',
    desc: 'Launch SENU 90 days in a row', descUk: 'Запустити SENU 90 днів поспіль', descDe: 'SENU 90 Tage in Folge starten' },
  { id: 'dedicated', category: 'streaks', rarity: 'legendary', icon: '365',
    name: 'Dedicated', nameUk: 'Відданість', nameDe: 'Hingabe',
    desc: 'Launch SENU 365 days in a row', descUk: 'Запустити SENU 365 днів поспіль', descDe: 'SENU 365 Tage in Folge starten' },

  // ── Explorer ──────────────────────────────────────────────────────────────
  { id: 'server-farm', category: 'explorer', rarity: 'uncommon', icon: '🖧',
    name: 'Server Farm', nameUk: 'Серверна ферма', nameDe: 'Server-Farm',
    desc: 'Add 10 servers', descUk: 'Додати 10 серверів', descDe: '10 Server hinzufügen' },
  { id: 'snippet-library', category: 'explorer', rarity: 'uncommon', icon: '📚',
    name: 'Snippet Library', nameUk: 'Бібліотека сніпетів', nameDe: 'Snippet-Bibliothek',
    desc: 'Create 20 command snippets', descUk: 'Створити 20 сніпетів команд', descDe: '20 Befehls-Snippets erstellen' },
  { id: 'prolific', category: 'explorer', rarity: 'uncommon', icon: '✦',
    name: 'Prolific', nameUk: 'Плодовитий', nameDe: 'Produktiv',
    desc: 'Write 20 notes', descUk: 'Написати 20 нотаток', descDe: '20 Notizen schreiben' },
  { id: 'sftp-sailor', category: 'explorer', rarity: 'common', icon: '⚓',
    name: 'SFTP Sailor', nameUk: 'SFTP-моряк', nameDe: 'SFTP-Seemann',
    desc: 'Browse files with SFTP browser', descUk: 'Переглянути файли через SFTP-браузер', descDe: 'Dateien im SFTP-Browser durchsuchen' },
  { id: 'log-analyst', category: 'explorer', rarity: 'rare', icon: '📊',
    name: 'Log Analyst', nameUk: 'Аналітик логів', nameDe: 'Log-Analyst',
    desc: 'Read 1,000 log lines in log viewer', descUk: 'Прочитати 1000 рядків логів', descDe: '1.000 Log-Zeilen im Viewer lesen' },
  { id: 'theme-collector', category: 'explorer', rarity: 'rare', icon: '🎭',
    name: 'Theme Collector', nameUk: 'Колекціонер тем', nameDe: 'Themen-Sammler',
    desc: 'Try all 13 themes', descUk: 'Спробувати всі 13 тем', descDe: 'Alle 13 Themes ausprobieren' },
  { id: 'polyglot', category: 'explorer', rarity: 'uncommon', icon: '🌐',
    name: 'Polyglot', nameUk: 'Поліглот', nameDe: 'Vielsprachig',
    desc: 'Switch to all 3 interface languages', descUk: 'Перемикнутися на всі 3 мови', descDe: 'Alle 3 Sprachen verwenden' },
  { id: 'all-types', category: 'explorer', rarity: 'rare', icon: '⊕',
    name: 'Connection Master', nameUk: 'Майстер підключень', nameDe: 'Verbindungs-Meister',
    desc: 'Use all 5 connection types', descUk: 'Використати всі 5 типів підключень', descDe: 'Alle 5 Verbindungstypen nutzen' },

  // ── Power User ────────────────────────────────────────────────────────────
  { id: 'six-panes', category: 'power', rarity: 'rare', icon: '⊟',
    name: 'Six Panes', nameUk: 'Шість панелей', nameDe: 'Sechs Bereiche',
    desc: 'Use the 6-pane split layout', descUk: 'Використати макет з 6 панелями', descDe: '6-Bereich-Layout verwenden' },
  { id: 'marathon-session', category: 'power', rarity: 'epic', icon: '⏲',
    name: 'Marathon Session', nameUk: 'Марафон', nameDe: 'Marathon-Sitzung',
    desc: 'Stay connected for 8 hours straight', descUk: 'Залишатися підключеним 8 годин', descDe: '8 Stunden lang verbunden bleiben' },
  { id: 'night-owl', category: 'power', rarity: 'rare', icon: '🌙',
    name: 'Night Owl', nameUk: 'Нічна сова', nameDe: 'Nachteule',
    desc: 'Use SENU between midnight and 5 AM', descUk: 'Використовувати SENU між опівніччю і 5 ранку', descDe: 'SENU zwischen Mitternacht und 5 Uhr nutzen' },
  { id: 'early-bird', category: 'power', rarity: 'rare', icon: '🌅',
    name: 'Early Bird', nameUk: 'Ранній пташок', nameDe: 'Frühaufsteher',
    desc: 'Connect to a server before 6 AM', descUk: "Підключитися до сервера до 6 ранку", descDe: 'Vor 6 Uhr morgens verbinden' },
  { id: 'speed-run', category: 'power', rarity: 'epic', icon: '🏎',
    name: 'Speed Run', nameUk: 'Спідран', nameDe: 'Speed-Run',
    desc: 'Connect within 1 second of clicking', descUk: 'Підключитися за 1 секунду після кліку', descDe: 'In 1 Sekunde nach dem Klick verbinden' },
  { id: 'log-master', category: 'power', rarity: 'epic', icon: '📜',
    name: 'Log Master', nameUk: 'Майстер логів', nameDe: 'Log-Meister',
    desc: 'Read 10,000 log lines total', descUk: 'Прочитати 10 000 рядків логів загалом', descDe: 'Insgesamt 10.000 Log-Zeilen lesen' },
  { id: 'obsessed', category: 'power', rarity: 'epic', icon: '∞',
    name: 'Obsessed', nameUk: 'Одержимий', nameDe: 'Besessen',
    desc: 'Open SENU 100 times', descUk: 'Відкрити SENU 100 разів', descDe: 'SENU 100 Mal öffnen' },
  { id: 'veteran', category: 'power', rarity: 'legendary', icon: '★',
    name: 'Veteran', nameUk: 'Ветеран', nameDe: 'Veteran',
    desc: 'Use SENU for 6 months (180 days total)', descUk: 'Використовувати SENU 6 місяців', descDe: 'SENU 6 Monate lang nutzen' },
  { id: 'legend', category: 'power', rarity: 'legendary', icon: '◈', hidden: true,
    name: 'Legend', nameUk: 'Легенда', nameDe: 'Legende',
    desc: 'Unlock 40 other achievements', descUk: 'Відкрити 40 інших досягнень', descDe: '40 andere Erfolge freischalten' },
]

// ── Stats that drive achievements ─────────────────────────────────────────

export interface AchievementStats {
  totalLaunches: number
  totalConnections: number
  snippetsExecuted: number
  themesUsed: string[]
  languagesUsed: string[]
  connTypesUsed: string[]  // 'ssh' | 'local' | 'docker' | 'telnet' | 'serial'
  splitLayoutsUsed: string[]
  usedBroadcast: boolean
  usedPortForward: boolean
  usedEditor: boolean
  usedLogViewer: boolean
  usedSftp: boolean
  usedQuickConnect: boolean
  usedSshImport: boolean
  usedAgent: boolean
  usedJumpHost: boolean
  generatedKey: boolean
  verifiedHostKey: boolean
  rejectedHostKey: boolean
  usedBossKey: boolean
  maxConcurrentTabs: number
  maxSessionSeconds: number
  logLinesRead: number
  notesCreated: number
  serversAdded: number
  snippetsCreated: number
  streak: { current: number; longest: number; lastDate: string }
  firstLaunchDate: string
  uniqueDaysActive: number
}

const DEFAULT_STATS: AchievementStats = {
  totalLaunches: 0, totalConnections: 0, snippetsExecuted: 0,
  themesUsed: [], languagesUsed: [], connTypesUsed: [],
  splitLayoutsUsed: [], usedBroadcast: false, usedPortForward: false,
  usedEditor: false, usedLogViewer: false, usedSftp: false,
  usedQuickConnect: false, usedSshImport: false, usedAgent: false,
  usedJumpHost: false, generatedKey: false,
  verifiedHostKey: false, rejectedHostKey: false, usedBossKey: false,
  maxConcurrentTabs: 0, maxSessionSeconds: 0, logLinesRead: 0,
  notesCreated: 0, serversAdded: 0, snippetsCreated: 0,
  streak: { current: 0, longest: 0, lastDate: '' },
  firstLaunchDate: '', uniqueDaysActive: 0,
}

const STORAGE_KEY = 'senu-achievements'

interface AchievementStore {
  unlocked: Record<string, string>  // id → ISO date
  stats: AchievementStats
}

function loadStore(): AchievementStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { unlocked: {}, stats: { ...DEFAULT_STATS } }
}

function saveStore(store: AchievementStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

// ── Check which achievements are earned ───────────────────────────────────

function checkAchievements(stats: AchievementStats, unlocked: Record<string, string>): AchievementId[] {
  const earned: AchievementId[] = []
  const has = (id: AchievementId) => !!unlocked[id]
  const earn = (id: AchievementId) => { if (!has(id)) earned.push(id) }

  if (stats.totalLaunches >= 1) earn('first-light')
  if (stats.totalConnections >= 1) earn('hello-world')
  if (stats.notesCreated >= 1) earn('note-taker')
  if (stats.snippetsCreated >= 1) earn('snippet-saver')
  if (stats.themesUsed.length >= 2) earn('theme-explorer')

  if (stats.maxConcurrentTabs >= 2) earn('multi-tasker')
  if (stats.maxConcurrentTabs >= 5) earn('squad-goals')
  if (stats.maxSessionSeconds >= 3600) earn('session-marathon')
  if (stats.maxSessionSeconds >= 28800) earn('marathon-session')
  if (stats.totalConnections >= 2) earn('comeback-kid')
  if (stats.usedJumpHost) earn('jump-master')
  if (stats.connTypesUsed.includes('docker')) earn('docker-diver')
  if (stats.connTypesUsed.includes('serial')) earn('serial-port')
  if (stats.connTypesUsed.includes('telnet')) earn('telnet-nostalgic')

  if (stats.generatedKey) earn('key-smith')
  if (stats.verifiedHostKey) earn('fingerprint')
  if (stats.usedAgent) earn('agent-mode')
  if (stats.usedBossKey) earn('privacy-first')
  if (stats.rejectedHostKey) earn('bouncer')

  if (stats.snippetsExecuted >= 10) earn('command-hero')
  if (stats.usedBroadcast) earn('broadcast-mode')
  if (stats.splitLayoutsUsed.length >= 1) earn('split-brain')
  if (stats.usedPortForward) earn('tunnel-vision')
  if (stats.usedEditor) earn('file-surgeon')
  if (stats.usedLogViewer) earn('log-hunter')
  if (stats.usedSshImport) earn('ssh-import')
  if (stats.usedQuickConnect) earn('quick-draw')

  if (stats.streak.current >= 2) earn('day-one')
  if (stats.streak.current >= 7) earn('week-warrior')
  if (stats.streak.current >= 14) earn('fortnight')
  if (stats.streak.current >= 30) earn('monthly')
  if (stats.streak.current >= 90) earn('season')
  if (stats.streak.current >= 365) earn('dedicated')

  if (stats.serversAdded >= 10) earn('server-farm')
  if (stats.snippetsCreated >= 20) earn('snippet-library')
  if (stats.notesCreated >= 20) earn('prolific')
  if (stats.usedSftp) earn('sftp-sailor')
  if (stats.logLinesRead >= 1000) earn('log-analyst')
  if (stats.logLinesRead >= 10000) earn('log-master')
  if (stats.themesUsed.length >= 13) earn('theme-collector')
  if (stats.languagesUsed.length >= 3) earn('polyglot')
  if (stats.connTypesUsed.length >= 5) earn('all-types')

  if (stats.splitLayoutsUsed.includes('3×2') || stats.splitLayoutsUsed.includes('4×2')) earn('six-panes')
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 5) earn('night-owl')
  if (hour < 6 && stats.totalConnections >= 1) earn('early-bird')
  if (stats.totalLaunches >= 100) earn('obsessed')
  if (stats.uniqueDaysActive >= 180) earn('veteran')

  // Legend: 40 achievements unlocked (not counting legend itself)
  const unlockedCount = Object.keys(unlocked).filter(id => id !== 'legend').length + earned.filter(id => id !== 'legend').length
  if (unlockedCount >= 40) earn('legend')

  return earned
}

// ── Context ───────────────────────────────────────────────────────────────

interface AchievementsCtx {
  store: AchievementStore
  notify: (newIds: AchievementId[]) => void
  updateStats: (patch: Partial<AchievementStats> | ((prev: AchievementStats) => Partial<AchievementStats>)) => void
  trackEvent: (event: AchievementEvent) => void
  totalUnlocked: number
}

type AchievementEvent =
  | { type: 'launch' }
  | { type: 'connection'; connType: string; usedJump?: boolean; usedAgent?: boolean; connectMs?: number }
  | { type: 'disconnect' }
  | { type: 'tabs-changed'; count: number }
  | { type: 'theme-changed'; themeId: string }
  | { type: 'language-changed'; lang: string }
  | { type: 'split-layout'; layout: string }
  | { type: 'broadcast' }
  | { type: 'port-forward' }
  | { type: 'editor-open' }
  | { type: 'log-viewer-open'; linesRead?: number }
  | { type: 'sftp-open' }
  | { type: 'quick-connect' }
  | { type: 'ssh-import' }
  | { type: 'keygen' }
  | { type: 'host-key-verify' }
  | { type: 'host-key-reject' }
  | { type: 'boss-key' }
  | { type: 'snippet-run' }
  | { type: 'snippet-create' }
  | { type: 'note-create' }
  | { type: 'server-add' }
  | { type: 'session-tick'; seconds: number }

export const AchievementsContext = createContext<AchievementsCtx | null>(null)

export function useAchievements() {
  return useContext(AchievementsContext)
}

// ── Provider ──────────────────────────────────────────────────────────────

interface AchievementToast {
  id: AchievementId
  timestamp: number
}

export function AchievementsProvider({ children, lang = 'en' }: { children: React.ReactNode; lang?: string }) {
  const [store, setStore] = useState<AchievementStore>(() => loadStore())
  const [toasts, setToasts] = useState<AchievementToast[]>([])

  // Persist on change
  useEffect(() => { saveStore(store) }, [store])

  // On mount: record launch + update streak
  useEffect(() => {
    setStore(prev => {
      const stats = { ...prev.stats }
      const today = new Date().toISOString().slice(0, 10)

      // Streak logic
      if (stats.streak.lastDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        if (stats.streak.lastDate === yesterday) {
          stats.streak = { ...stats.streak, current: stats.streak.current + 1, lastDate: today }
        } else if (stats.streak.lastDate !== today) {
          stats.streak = { ...stats.streak, current: 1, lastDate: today }
        }
        stats.streak.longest = Math.max(stats.streak.longest, stats.streak.current)
        stats.uniqueDaysActive = (stats.uniqueDaysActive || 0) + 1
      }

      stats.totalLaunches = (stats.totalLaunches || 0) + 1
      if (!stats.firstLaunchDate) stats.firstLaunchDate = new Date().toISOString()

      const newIds = checkAchievements(stats, prev.unlocked)
      const unlocked = { ...prev.unlocked }
      for (const id of newIds) unlocked[id] = new Date().toISOString()

      if (newIds.length > 0) {
        setTimeout(() => setToasts(t => [...t, ...newIds.map(id => ({ id, timestamp: Date.now() }))]), 500)
      }

      return { stats, unlocked }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notify = useCallback((newIds: AchievementId[]) => {
    setToasts(t => [...t, ...newIds.map(id => ({ id, timestamp: Date.now() }))])
  }, [])

  const updateStats = useCallback((patch: Partial<AchievementStats> | ((prev: AchievementStats) => Partial<AchievementStats>)) => {
    setStore(prev => {
      const stats = { ...prev.stats, ...(typeof patch === 'function' ? patch(prev.stats) : patch) }
      const newIds = checkAchievements(stats, prev.unlocked)
      const unlocked = { ...prev.unlocked }
      for (const id of newIds) unlocked[id] = new Date().toISOString()
      if (newIds.length > 0) setToasts(t => [...t, ...newIds.map(id => ({ id, timestamp: Date.now() }))])
      return { stats, unlocked }
    })
  }, [])

  const trackEvent = useCallback((event: AchievementEvent) => {
    updateStats(prev => {
      const patch: Partial<AchievementStats> = {}
      switch (event.type) {
        case 'connection':
          patch.totalConnections = (prev.totalConnections || 0) + 1
          if (event.connType && !prev.connTypesUsed.includes(event.connType))
            patch.connTypesUsed = [...prev.connTypesUsed, event.connType]
          if (event.usedJump) patch.usedJumpHost = true
          if (event.usedAgent) patch.usedAgent = true
          break
        case 'tabs-changed':
          patch.maxConcurrentTabs = Math.max(prev.maxConcurrentTabs || 0, event.count)
          break
        case 'theme-changed':
          if (!prev.themesUsed.includes(event.themeId))
            patch.themesUsed = [...prev.themesUsed, event.themeId]
          break
        case 'language-changed':
          if (!prev.languagesUsed.includes(event.lang))
            patch.languagesUsed = [...prev.languagesUsed, event.lang]
          break
        case 'split-layout':
          if (!prev.splitLayoutsUsed.includes(event.layout))
            patch.splitLayoutsUsed = [...prev.splitLayoutsUsed, event.layout]
          break
        case 'broadcast': patch.usedBroadcast = true; break
        case 'port-forward': patch.usedPortForward = true; break
        case 'editor-open': patch.usedEditor = true; break
        case 'log-viewer-open':
          patch.usedLogViewer = true
          if (event.linesRead) patch.logLinesRead = (prev.logLinesRead || 0) + event.linesRead
          break
        case 'sftp-open': patch.usedSftp = true; break
        case 'quick-connect': patch.usedQuickConnect = true; break
        case 'ssh-import': patch.usedSshImport = true; break
        case 'keygen': patch.generatedKey = true; break
        case 'host-key-verify': patch.verifiedHostKey = true; break
        case 'host-key-reject': patch.rejectedHostKey = true; break
        case 'boss-key': patch.usedBossKey = true; break
        case 'snippet-run': patch.snippetsExecuted = (prev.snippetsExecuted || 0) + 1; break
        case 'snippet-create': patch.snippetsCreated = (prev.snippetsCreated || 0) + 1; break
        case 'note-create': patch.notesCreated = (prev.notesCreated || 0) + 1; break
        case 'server-add': patch.serversAdded = (prev.serversAdded || 0) + 1; break
        case 'session-tick':
          patch.maxSessionSeconds = Math.max(prev.maxSessionSeconds || 0, event.seconds)
          break
      }
      return patch
    })
  }, [updateStats])

  const totalUnlocked = Object.keys(store.unlocked).length

  // Dismiss toasts after 5s
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => setToasts(t => t.slice(1)), 5000)
    return () => clearTimeout(timer)
  }, [toasts])

  return (
    <AchievementsContext.Provider value={{ store, notify, updateStats, trackEvent, totalUnlocked }}>
      {children}
      {/* Toast notifications */}
      {toasts.slice(0, 3).map((toast, i) => (
        <AchievementToastEl key={`${toast.id}-${toast.timestamp}`} id={toast.id} index={i} lang={lang} onClose={() => setToasts(t => t.filter(x => x.id !== toast.id || x.timestamp !== toast.timestamp))} />
      ))}
    </AchievementsContext.Provider>
  )
}

function AchievementToastEl({ id, index, lang, onClose }: { id: AchievementId; index: number; lang: string; onClose: () => void }) {
  const ach = ACHIEVEMENTS.find(a => a.id === id)
  if (!ach) return null
  const name = lang === 'uk' ? ach.nameUk : lang === 'de' ? ach.nameDe : ach.name
  const desc = lang === 'uk' ? ach.descUk : lang === 'de' ? ach.descDe : ach.desc
  return (
    <div className={`ach-toast ach-toast--${ach.rarity}`} style={{ bottom: `${24 + index * 72}px` }} onClick={onClose}>
      <div className="ach-toast-icon">{ach.icon}</div>
      <div className="ach-toast-body">
        <div className="ach-toast-label">{lang === 'uk' ? 'Досягнення розблоковано!' : lang === 'de' ? 'Erfolg freigeschaltet!' : 'Achievement unlocked!'}</div>
        <div className="ach-toast-name">{name}</div>
        <div className="ach-toast-desc">{desc}</div>
      </div>
      <div className={`ach-toast-rarity ach-rarity--${ach.rarity}`}>{ach.rarity}</div>
    </div>
  )
}

// ── Achievement Panel ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AchievementCategory, { en: string; uk: string; de: string }> = {
  'first-steps': { en: 'First Steps', uk: 'Перші кроки', de: 'Erste Schritte' },
  'connection':  { en: 'Connection', uk: 'Підключення', de: 'Verbindung' },
  'security':    { en: 'Security', uk: 'Безпека', de: 'Sicherheit' },
  'productivity':{ en: 'Productivity', uk: 'Продуктивність', de: 'Produktivität' },
  'streaks':     { en: 'Streaks', uk: 'Серії', de: 'Serien' },
  'explorer':    { en: 'Explorer', uk: 'Дослідник', de: 'Entdecker' },
  'power':       { en: 'Power User', uk: 'Просунутий', de: 'Power-User' },
}


export function AchievementsPanel({ onClose, lang = 'en' }: { onClose: () => void; lang?: string }) {
  const ctx = useAchievements()
  const [filter, setFilter] = useState<AchievementCategory | 'all'>('all')
  const store = ctx?.store

  const categories: AchievementCategory[] = ['first-steps', 'connection', 'security', 'productivity', 'streaks', 'explorer', 'power']

  const visibleAchs = ACHIEVEMENTS.filter(a => {
    if (filter !== 'all' && a.category !== filter) return false
    if (a.hidden && !store?.unlocked[a.id]) return false
    return true
  })

  const totalAchs = ACHIEVEMENTS.filter(a => !a.hidden).length
  const unlockedCount = Object.keys(store?.unlocked ?? {}).length
  const streakCurrent = store?.stats.streak.current ?? 0
  const streakLongest = store?.stats.streak.longest ?? 0

  return (
    <div className="ach-panel-overlay" onClick={onClose}>
      <div className="ach-panel" onClick={e => e.stopPropagation()}>
        <div className="ach-panel-header">
          <div className="ach-panel-title-block">
            <div className="ach-panel-title">{lang === 'uk' ? 'Досягнення' : lang === 'de' ? 'Erfolge' : 'Achievements'}</div>
            <div className="ach-panel-progress">
              <div className="ach-progress-bar">
                <div className="ach-progress-fill" style={{ width: `${(unlockedCount / totalAchs) * 100}%` }} />
              </div>
              <span>{unlockedCount} / {totalAchs}</span>
            </div>
          </div>
          <div className="ach-panel-meta">
            <div className="ach-meta-item">
              <span className="ach-meta-val">{streakCurrent}</span>
              <span className="ach-meta-label">{lang === 'uk' ? 'поточна серія' : lang === 'de' ? 'aktuell' : 'streak'}</span>
            </div>
            <div className="ach-meta-item">
              <span className="ach-meta-val">{streakLongest}</span>
              <span className="ach-meta-label">{lang === 'uk' ? 'найдовша' : lang === 'de' ? 'längste' : 'longest'}</span>
            </div>
            <div className="ach-meta-item">
              <span className="ach-meta-val">{store?.stats.totalLaunches ?? 0}</span>
              <span className="ach-meta-label">{lang === 'uk' ? 'запусків' : lang === 'de' ? 'Starts' : 'launches'}</span>
            </div>
          </div>
          <button className="ach-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ach-panel-filters">
          <button className={`ach-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            {lang === 'uk' ? 'Всі' : lang === 'de' ? 'Alle' : 'All'} ({ACHIEVEMENTS.filter(a => !a.hidden || store?.unlocked[a.id]).length})
          </button>
          {categories.map(cat => {
            const count = ACHIEVEMENTS.filter(a => a.category === cat && (!a.hidden || store?.unlocked[a.id])).length
            const earned = ACHIEVEMENTS.filter(a => a.category === cat && store?.unlocked[a.id]).length
            return (
              <button key={cat} className={`ach-filter ${filter === cat ? 'active' : ''}`} onClick={() => setFilter(cat)}>
                {CATEGORY_LABELS[cat][lang as 'en'|'uk'|'de'] ?? CATEGORY_LABELS[cat].en} ({earned}/{count})
              </button>
            )
          })}
        </div>

        <div className="ach-grid">
          {visibleAchs.map(ach => {
            const isUnlocked = !!store?.unlocked[ach.id]
            const name = lang === 'uk' ? ach.nameUk : lang === 'de' ? ach.nameDe : ach.name
            const desc = lang === 'uk' ? ach.descUk : lang === 'de' ? ach.descDe : ach.desc
            const unlockedDate = store?.unlocked[ach.id]
            const rarityLabel =
              ach.rarity === 'common'    ? (lang === 'uk' ? 'звич' : ach.rarity) :
              ach.rarity === 'uncommon'  ? (lang === 'uk' ? 'нечаст' : ach.rarity) :
              ach.rarity === 'rare'      ? (lang === 'uk' ? 'рідкіс' : ach.rarity) :
              ach.rarity === 'epic'      ? (lang === 'uk' ? 'епік' : ach.rarity) :
                                           (lang === 'uk' ? 'леген' : ach.rarity)
            return (
              <div key={ach.id} className={`ach-card ach-rarity--${ach.rarity} ${isUnlocked ? 'is-unlocked' : 'is-locked'}`}>
                <div className="ach-card-icon">{isUnlocked ? ach.icon : '🔒'}</div>
                <div className="ach-card-body">
                  <div className="ach-card-name">{ach.hidden && !isUnlocked ? '???' : name}</div>
                  <div className="ach-card-desc">{ach.hidden && !isUnlocked ? '???' : desc}</div>
                  {isUnlocked && unlockedDate && (
                    <div className="ach-card-date">✓ {new Date(unlockedDate).toLocaleDateString(lang === 'uk' ? 'uk-UA' : lang === 'de' ? 'de-DE' : 'en-US')}</div>
                  )}
                </div>
                <div className={`ach-card-rarity ach-rarity--${ach.rarity}`}>{rarityLabel}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
