import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://v2.tauri.app/start/frontend/vite/
// @ts-expect-error — TAURI_ENV_* injected by Tauri CLI at build time
const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // prevent vite from obscuring rust errors
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5183,
        }
      : undefined,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    // produce ES modules for Tauri
    target: 'esnext',
    // don't minify for easier debugging in dev
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // Make env variables available
  envPrefix: ['VITE_', 'TAURI_ENV_'],
}))
