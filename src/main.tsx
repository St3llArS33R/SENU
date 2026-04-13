import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { injectBridge } from './bridge.ts'

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
