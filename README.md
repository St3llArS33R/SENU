# SENU

> Modern SSH terminal built with Tauri 2 + React + TypeScript

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
![Stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20Rust%20%2B%20React-purple)

## Features

- **SSH connections** — password, private key, SSH agent
- **ProxyJump** — connect through jump hosts
- **Split pane** — 2, 4, 6 or 8 terminals side by side
- **SFTP** — browse, upload and download files
- **Groups** — organize connections by color-coded groups
- **Quick Connect** — `⚡` button or `Ctrl+L` for instant connections
- **SSH key generation** — Ed25519 and RSA 4096 directly in the app
- **Session logging** — record terminal output to a file
- **Credential vault** — passwords stored in system keychain (Windows Credential Manager / macOS Keychain / libsecret)
- **Known hosts** — host key verification with fingerprint display
- **Auto-reconnect** — exponential backoff with up to 5 retry attempts
- **Fuzzy search** — command palette for quick server lookup
- **Snippets & Notes** — per-server notes and reusable command snippets
- **128K scrollback** — never lose terminal history

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Rust + [russh](https://github.com/warp-tech/russh) |
| UI | React + TypeScript + xterm.js |
| Desktop | Tauri 2 |
| Storage | tauri-plugin-store |
| Vault | keyring crate |

## Building

```bash
# Install dependencies
npm install

# Dev mode
npm run tauri dev

# Production build
npm run tauri build
```

**Requirements:** Rust 1.75+, Node 18+, platform build tools (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

## License

Copyright (c) 2026 St3llArS33R. All rights reserved. Proprietary software.
