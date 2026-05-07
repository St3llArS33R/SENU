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

// IMPORTANT: bridge.ts MUST be imported first — it sets `window.nextterm` at
// module-eval time. Other components capture `const nt = window.nextterm` at
// their module load, so the bridge has to be in place before they evaluate.
import { injectBridge } from './bridge.ts'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Inject the Tauri IPC bridge as window.nextterm before React renders.
// App.tsx uses window.nextterm — this keeps the interface identical
// to the old Electron preload without touching any component code.
injectBridge()

// Block browser DevTools shortcuts — they interfere with terminal shortcuts
// (Ctrl+Shift+C is terminal copy but also "Inspect Element" in WebView2).
// In release builds DevTools are compiled out anyway; this just fixes dev mode.
window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey, shift = e.shiftKey, k = e.key
  if (k === 'F12') { e.preventDefault(); return }
  if (ctrl && shift && (k === 'I' || k === 'i')) { e.preventDefault(); return }
  if (ctrl && shift && (k === 'J' || k === 'j')) { e.preventDefault(); return }
  if (ctrl && shift && (k === 'C' || k === 'c')) {
    // Prevent Inspect Element, but let xterm handle copy via its own listener
    e.preventDefault()
    // Manually trigger copy from terminal selection if any text is selected
    const sel = window.getSelection()?.toString()
    if (sel) navigator.clipboard.writeText(sel).catch(() => {})
  }
}, true) // capture phase — fires before any other handler

// Suppress the WebView2 / Edge native page context menu (Back / Refresh /
// Save as / Print / Inspect). Our app provides custom menus where they make
// sense — anywhere else right-click should do nothing rather than expose
// browser chrome to the user. Component-level onContextMenu handlers still
// fire first (capture phase listener below runs after them in bubble order),
// so they keep working — this just stops the residual native menu from
// appearing when no component handled the event.
//
// Note: input/textarea/contenteditable elements DO get their own native menu
// (cut/copy/paste). We let those through so basic text editing UX isn't lost.
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  const editable =
    t?.tagName === 'INPUT' ||
    t?.tagName === 'TEXTAREA' ||
    t?.isContentEditable === true
  if (!editable) e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
