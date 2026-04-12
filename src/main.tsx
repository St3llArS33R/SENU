import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { injectBridge } from './bridge.ts'

// Inject the Tauri IPC bridge as window.nextterm before React renders.
// App.tsx uses window.nextterm — this keeps the interface identical
// to the old Electron preload without touching any component code.
injectBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
