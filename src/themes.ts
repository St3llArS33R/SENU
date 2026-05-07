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

// ── SENU Theme System ──────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect } from 'react'

export type ThemeId =
  | 'tokyo-night'
  | 'catppuccin'
  | 'dracula'
  | 'matrix'
  | 'neon'
  | 'one-dark'
  | 'forest'
  | 'crt'
  | 'jade'
  | 'nord'
  | 'solarized'
  | 'high-contrast'
  | 'light'
  | 'forest'
  | 'crt'
  | 'jade'

export interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string; red: string; green: string; yellow: string
  blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string
}

export type ThemeGroup = 'Dark' | 'Green' | 'Light'

export interface Theme {
  id: ThemeId
  name: string
  nameUk: string
  nameDe?: string
  swatch: [string, string]
  dark: boolean
  group: ThemeGroup
  xterm: XtermTheme
  /** Themes flagged unstable are hidden from the topbar quick picker but still
   *  selectable from Settings (with a BETA badge). Polishing is ongoing —
   *  contrast tuning, terminal palette, etc. — so we don't promote them as
   *  fully ready yet. Only `tokyo-night` (SENU) and `nord` are stable today. */
  stable?: boolean
}

export const THEME_GROUPS: { id: ThemeGroup; label: string; labelUk: string; labelDe: string }[] = [
  { id: 'Dark',  label: 'Dark',  labelUk: 'Темні',  labelDe: 'Dunkel' },
  { id: 'Green', label: 'Green', labelUk: 'Зелені', labelDe: 'Grün' },
  { id: 'Light', label: 'Light', labelUk: 'Світлі', labelDe: 'Hell' },
]

export const THEMES: Theme[] = [
  {
    id: 'tokyo-night', group: 'Dark' as const,
    name: 'SENU',
    nameUk: 'SENU',
    stable: true,
    swatch: ['#0c0c0c', '#4aba8a'],
    dark: true,
    xterm: {
      background: '#0c0c0c', foreground: '#c8d0e8', cursor: '#4aba8a',
      selectionBackground: '#1a3a2a',
      black: '#1a1a1a', red: '#f87171', green: '#4aba8a', yellow: '#e5c07b',
      blue: '#7aa2f7', magenta: '#c678dd', cyan: '#56d4c0', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#ff7b7b', brightGreen: '#5dcfa0',
      brightYellow: '#f0c27a', brightBlue: '#88b4f8', brightMagenta: '#d18aec',
      brightCyan: '#6addd0', brightWhite: '#e0e8f0',
    },
  },
  {
    id: 'catppuccin', group: 'Dark' as const,
    name: 'Catppuccin',
    nameUk: 'Катпучіно',
    swatch: ['#1E1E2E', '#CBA6F7'],
    dark: true,
    xterm: {
      background: '#1E1E2E', foreground: '#cdd6f4', cursor: '#cba6f7',
      selectionBackground: '#313244',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#cba6f7', cyan: '#89dceb', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
      brightCyan: '#89dceb', brightWhite: '#a6adc8',
    },
  },
  {
    id: 'dracula', group: 'Dark' as const,
    name: 'Dracula',
    nameUk: 'Дракула',
    swatch: ['#282A36', '#FF79C6'],
    dark: true,
    xterm: {
      background: '#282A36', foreground: '#f8f8f2', cursor: '#ff79c6',
      selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  {
    id: 'matrix', group: 'Dark' as const,
    name: 'Matrix',
    nameUk: 'Матриця',
    swatch: ['#000000', '#00FF41'],
    dark: true,
    xterm: {
      background: '#000000', foreground: '#00ff41', cursor: '#00ff41',
      selectionBackground: '#003b10',
      black: '#0d0d0d', red: '#ff2020', green: '#00ff41', yellow: '#ccff00',
      blue: '#00aaff', magenta: '#00ffcc', cyan: '#00e5cc', white: '#a0ffc0',
      brightBlack: '#1a4a1a', brightRed: '#ff5555', brightGreen: '#39ff6b',
      brightYellow: '#eeff44', brightBlue: '#44ccff', brightMagenta: '#44ffee',
      brightCyan: '#22ffdd', brightWhite: '#ccffdd',
    },
  },
  {
    id: 'neon', group: 'Dark' as const,
    name: 'Neon',
    nameUk: 'Неон',
    swatch: ['#050510', '#00F5FF'],
    dark: true,
    xterm: {
      background: '#050510', foreground: '#e0e8ff', cursor: '#00f5ff',
      selectionBackground: '#1a1a44',
      black: '#0a0a1a', red: '#ff0066', green: '#00ff88', yellow: '#ffee00',
      blue: '#00f5ff', magenta: '#ff00ff', cyan: '#00ccff', white: '#c0d0ff',
      brightBlack: '#2a2a5a', brightRed: '#ff4499', brightGreen: '#44ffaa',
      brightYellow: '#ffff44', brightBlue: '#44ffff', brightMagenta: '#ff44ff',
      brightCyan: '#44eeff', brightWhite: '#e0e8ff',
    },
  },
  {
    id: 'one-dark', group: 'Dark' as const,
    name: 'One Dark',
    nameUk: 'Один Темний',
    swatch: ['#282C34', '#61AFEF'],
    dark: true,
    xterm: {
      background: '#282C34', foreground: '#abb2bf', cursor: '#61afef',
      selectionBackground: '#3e4451',
      black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
  },
  {
    id: 'nord', group: 'Dark' as const,
    name: 'Nord',
    nameUk: 'Норд',
    stable: true,
    swatch: ['#2E3440', '#88C0D0'],
    dark: true,
    xterm: {
      background: '#2E3440', foreground: '#d8dee9', cursor: '#88c0d0',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  {
    id: 'solarized', group: 'Dark' as const,
    name: 'Solarized Dark',
    nameUk: 'Соляризований',
    swatch: ['#002B36', '#268BD2'],
    dark: true,
    xterm: {
      background: '#002B36', foreground: '#839496', cursor: '#2aa198',
      selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'high-contrast', group: 'Dark' as const,
    name: 'High Contrast',
    nameUk: 'Висока Контрастність',
    swatch: ['#000000', '#FFFFFF'],
    dark: true,
    xterm: {
      background: '#000000', foreground: '#ffffff', cursor: '#ffffff',
      selectionBackground: '#444444',
      black: '#000000', red: '#ff4040', green: '#00ff00', yellow: '#ffff00',
      blue: '#4080ff', magenta: '#ff40ff', cyan: '#00ffff', white: '#ffffff',
      brightBlack: '#808080', brightRed: '#ff8080', brightGreen: '#80ff80',
      brightYellow: '#ffff80', brightBlue: '#80a0ff', brightMagenta: '#ff80ff',
      brightCyan: '#80ffff', brightWhite: '#ffffff',
    },
  },
  {
    id: 'light', group: 'Light' as const,
    name: 'Light',
    nameUk: 'Світла',
    swatch: ['#F5F5F8', '#2563EB'],
    dark: false,
    xterm: {
      background: '#f5f5f8', foreground: '#1a1d2e', cursor: '#2563eb',
      selectionBackground: '#c7d4f8',
      black: '#1a1d2e', red: '#dc2626', green: '#16a34a', yellow: '#d97706',
      blue: '#2563eb', magenta: '#7c3aed', cyan: '#0891b2', white: '#f5f5f8',
      brightBlack: '#6b7280', brightRed: '#ef4444', brightGreen: '#22c55e',
      brightYellow: '#f59e0b', brightBlue: '#3b82f6', brightMagenta: '#8b5cf6',
      brightCyan: '#06b6d4', brightWhite: '#ffffff',
    },
  },

  // ── Green themes based on eye research ────────────────────────────────────

  {
    // Forest: H=140° balanced palette from research
    // bg #0B1210 — зелено-тонований, anti-halation; text #7ACC8E — 8.6:1 contrast ("золота зона")
    id: 'forest', group: 'Green' as const,
    name: 'Forest',
    nameUk: 'Ліс',
    swatch: ['#0B1210', '#7ACC8E'],
    dark: true,
    xterm: {
      background: '#0B1210', foreground: '#7ACC8E', cursor: '#5CEBA0',
      selectionBackground: '#1E3D2E',
      black: '#0B1210', red: '#F87171', green: '#5CEBA0', yellow: '#FBBF24',
      blue: '#67E8F9', magenta: '#A8E6C0', cyan: '#5CEBA0', white: '#7ACC8E',
      brightBlack: '#3D7A55', brightRed: '#FCA5A5', brightGreen: '#00FF41',
      brightYellow: '#FDE68A', brightBlue: '#A5F3FC', brightMagenta: '#D4F5E8',
      brightCyan: '#86EFCD', brightWhite: '#E0F5EB',
    },
  },

  {
    // CRT: Matrix film palette done RIGHT — warm-tinted #0D0208 bg (actual Matrix hex),
    // vibrant but not eye-bleeding text; #00FF41 used as accent only, not primary
    id: 'crt', group: 'Green' as const,
    name: 'CRT',
    nameUk: 'ЕПТ',
    swatch: ['#0D0208', '#39C955'],
    dark: true,
    xterm: {
      background: '#0D0208', foreground: '#39C955', cursor: '#00FF41',
      selectionBackground: '#003B10',
      black: '#0D0208', red: '#FF2020', green: '#00FF41', yellow: '#CCFF00',
      blue: '#00AAFF', magenta: '#00FFCC', cyan: '#00E5CC', white: '#39C955',
      brightBlack: '#1A4A1A', brightRed: '#FF5555', brightGreen: '#39FF6B',
      brightYellow: '#EEFF44', brightBlue: '#44CCFF', brightMagenta: '#44FFEE',
      brightCyan: '#22FFDD', brightWhite: '#CCFFDD',
    },
  },

  {
    // Jade: H=152° (teal-shifted "jade stone"), very desaturated — сучасна,
    // спокійна, для 8+ годин роботи без втоми
    id: 'jade', group: 'Green' as const,
    name: 'Jade',
    nameUk: 'Нефрит',
    swatch: ['#111F1C', '#4DC9A0'],
    dark: true,
    xterm: {
      background: '#111F1C', foreground: '#85C9AE', cursor: '#4DC9A0',
      selectionBackground: '#223A33',
      black: '#111F1C', red: '#D96B6B', green: '#4DC9A0', yellow: '#D4A853',
      blue: '#5B9BD5', magenta: '#8B7BD5', cyan: '#4DC9A0', white: '#85C9AE',
      brightBlack: '#4A8A6E', brightRed: '#E88A8A', brightGreen: '#6DD4B0',
      brightYellow: '#E0BC75', brightBlue: '#78ADDB', brightMagenta: '#A898E0',
      brightCyan: '#6DD4B0', brightWhite: '#C2E5D8',
    },
  },
]

// ── Theme persistence ──────────────────────────────────────────────────────
const STORAGE_KEY = 'senu-theme'
const DEFAULT_THEME: ThemeId = 'tokyo-night'

export function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.find(t => t.id === stored)) return stored as ThemeId
  } catch {}
  return DEFAULT_THEME
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
  try { localStorage.setItem(STORAGE_KEY, id) } catch {}
}

export function getXtermTheme(id: ThemeId): XtermTheme {
  return (THEMES.find(t => t.id === id) ?? THEMES[0]).xterm
}

// ── ThemeContext ───────────────────────────────────────────────────────────
interface ThemeCtx {
  themeId: ThemeId
  setThemeId: (id: ThemeId) => void
  theme: Theme
}

export const ThemeContext = createContext<ThemeCtx>({
  themeId: DEFAULT_THEME,
  setThemeId: () => {},
  theme: THEMES[0],
})

export function useThemeState(): ThemeCtx {
  const [themeId, setThemeIdRaw] = useState<ThemeId>(loadTheme)

  // Apply on first mount and on change
  useEffect(() => { applyTheme(themeId) }, [themeId])

  const setThemeId = (id: ThemeId) => {
    setThemeIdRaw(id)
    applyTheme(id)
  }

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]
  return { themeId, setThemeId, theme }
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext)
}
