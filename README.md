<!--
  SENU README
  Apache 2.0 — Copyright 2026 Borys Zaitsev
-->

<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" alt="SENU" />

# SENU

### The terminal that remembers.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: pre-1.0](https://img.shields.io/badge/status-pre--1.0-orange)](#status)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#install)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24c8db)](https://tauri.app)

</div>

---

## Why SENU exists

I used MobaXterm for years. When my VPS had 5 projects, it was fine.
At 30+ projects, things broke down.

I kept notes in Notion. Then in Notepad++. Then in both. After six months
I had **30 Notion pages and 87 Notepad++ tabs**, most of them titled
`new 94` or `new 112`, each containing critical commands for projects
I'd half-forgotten. Every time I came back to a project, I'd start over:
re-search Docker commands, re-search tmux, re-look up the same Nginx
config snippets. When I needed to share an API key with another admin
on the server, I'd send it through Telegram — knowing a copy would sit
on Telegram's servers forever. When I parsed access logs at 3am wondering
if `45.148.10.21` requesting `/.env` was an actual attack, I'd Google
every status code one by one.

So I built SENU. One terminal that fixes all of it at once.

It's not done. Some features are rough. But it solves my problem.
Maybe it solves yours too.

---

## What it is

SENU is a native cross-platform desktop terminal for sysadmins, DevOps,
and anyone who manages many servers. It bundles SSH, Telnet, Serial,
Local, and Docker connections into a single window — plus an SFTP file
browser over SSH — with two unusual additions:

- **Notes that pin to specific servers, directories, or files** — so when
  you come back to a project after two weeks, you know what you did and why.
- **A plugin-aware Log Viewer** — runs your access logs through parsers
  that detect attack patterns, structure raw text into tables, and surface
  what matters.

The whole app is a **~13 MB native binary** (Tauri 2 + Rust), not a 200 MB
Electron wrapper. Memory footprint, install size, and startup time are
materially lower than Tabby, Termius, or Warp.

---

## Three pillars

### 1. Server-bound notes

Right-click any file in the SFTP browser → "Create note about this file."
The note carries the server name and full path. Find it later by tag,
folder, or by opening the same server. The flow runs both ways — you
can also push any note back to the server as a markdown file (defaults
to overwriting the bound file's path, so a note IS your living
documentation).

Folders are real (with drag-and-drop). Tags get deterministic colors from
a 24-hue HSL palette so `#prod` always looks the same, and a click on a
tag pill cycles to a new color if you want manual control. Auto-save
runs at 1 second debounce. Three editing surfaces — sidebar quick-edit,
popup, full-screen — all sync through a single source of truth, so
switching between them never loses your work.

### 2. Plugin-aware Log Viewer (BETA)

Tail any local file or remote log over SFTP. Pipe through plugins:

- **`nginx-parser`** — turns access logs into a structured table with
  status badges (E/W/I/D)
- **`json-pretty`** — formats JSON log lines inline
- **`alert-rules`** — flags suspicious patterns (e.g. recon attempts hitting
  `/.env`, `/admin`, `/.git/config`)
- Plus `laravel-parser` and `timeline-view` in beta; `docker-logs` and
  `k8s-parser` planned

Plugins are declarative and composable. Future versions will let you
write your own.

### 3. Multi-protocol shell

Five connection types in one tab system:

- **SSH** — password, public key, agent forwarding, ProxyJump, ssh config import
- **Telnet** — for legacy gear
- **Serial / COM** — for switches, routers, embedded devices
- **Docker exec** — into running containers
- **Local shell** — bash/zsh/PowerShell as a tab

Plus an **SFTP file browser** with built-in editor for config files
(nginx, sshd, systemd, yaml, json, etc.) attached to every SSH session.

Plus split-pane (1/2/3/4 panes), broadcast input, manual reconnect,
session timer, port forwarding, OSC 52 clipboard sync, command history,
tab groups, **Boss Key** (`Ctrl+Shift+H` instantly hides the UI behind
a decoy), and a **Command Palette** (`Ctrl+K`) for fuzzy launching
servers / panels / settings.

---

## Status

This is **pre-1.0 software**. Some features are stable, some are in beta,
some are coming. Honest list:

### Stable

- SSH / SFTP / Telnet / Serial / Local / Docker connections
- Multi-pane terminal with split layouts and broadcast input
- Tabs, tab groups, drag-and-drop reordering, horizontal scroll for many tabs
- SFTP browser with built-in config editor (CodeMirror 6)
- Snippets library with categorization
- Workspaces with auto-restore
- Frameless window with custom controls
- **Themes (stable):** SENU, Nord — both promoted in the topbar quick picker.
  11 additional themes (Catppuccin, Dracula, Matrix, Neon, One Dark,
  Solarized Dark, High Contrast, Light, Forest, CRT, Jade) are available
  in `Settings → Themes` with a `BETA` badge while contrast and palette
  tuning continue.
- Languages: English, Ukrainian
- Boss Key, Command Palette, OSC 52 clipboard, host-key TOFU verification
- Achievements (a small fun touch — 50 unlocks across 5 categories)

### Beta

- **Notes** — works reliably; folder hierarchy, file binding, tags, and
  auto-save fully functional.
- **Log Viewer** — tail and search work; plugin pipeline shipped with
  `nginx-parser`, `json-pretty`, `alert-rules`. Some log formats not yet
  parsed cleanly.

### Alpha

- **Chat** — encrypted messaging between SENU users on the same SSH server,
  using X25519 ECDH + AES-256-GCM with ephemeral keys per message + Ed25519
  signatures over a canonical signing input. Messages live in `/tmp/.senu/`
  and self-destruct on disconnect.

  ⚠️ **Cryptographic implementation has not been independently audited.**
  Use at your own risk. Not recommended for sensitive communication where
  compromise would matter.

### Coming

Future versions focus on bug fixes, stability, and polishing the existing
features. Concrete additions aren't planned ahead — issues and feedback
drive what lands next. The credential **Vault** was present in earlier
builds and was removed pending a rewrite; whether it returns and when
isn't decided yet.

---

## Install

Pre-built installers are not yet released. The first public release
(`v0.9.0`) is targeted for summer 2026.

For now, **build from source** — see below.

---

## Build from source

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Rust (stable)** — [rustup.rs](https://rustup.rs)
- **Tauri prerequisites** — see [Tauri's setup guide](https://v2.tauri.app/start/prerequisites/)
  - Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`,
    `libayatana-appindicator3-dev`, `librsvg2-dev`
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft C++ Build Tools

### Build

```bash
git clone https://github.com/st3llars33r/senu.git
cd senu
npm install
npm run tauri dev      # development with hot reload
npm run tauri build    # production binary
```

Production output ends up in `src-tauri/target/release/bundle/`:

- Windows → `.msi` and `.exe` installer in `msi/` and `nsis/`
- macOS → `.dmg` in `dmg/` and `.app` in `macos/`
- Linux → `.deb`, `.rpm`, `.AppImage` in respective folders

### Run tests / type-check

```bash
npm test           # vitest (frontend) — 63 unit tests
cargo check        # type-check + lint Rust backend
npm run build      # full production build dry-run (also regenerates THIRD-PARTY-LICENSES.txt)
```

---

## Quick start

After building and running SENU:

1. **Add a server** — sidebar → `+ Server` → enter host, user, port, auth method
2. **Connect** — click the server entry, or use Quick Connect (`Ctrl+Q`) /
   the Command Palette (`Ctrl+K`)
3. **Open SFTP** — switch from the Terminal tab to the Editor tab on the
   same server
4. **Take a note** — sidebar → `Notes` → `+ New` — pin it to the server
   you're on, or right-click any file in SFTP → "Create note from file"
5. **Try the Log Viewer** — sidebar → `Logs` → `Open` a local log file
   or pull one over SFTP
6. **Save a snippet** — when you find a useful command in the terminal,
   right-click → `Save as snippet`

---

## Frequently asked

**Is this an Electron app?**
No. SENU is built with [Tauri 2](https://tauri.app) — Rust backend, system
webview, ~13 MB total. Compare to ~200 MB for typical Electron alternatives.

**Why custom window controls (left-side dots) on Windows?**
Deliberate UX choice. In DevOps workflows you often have many maximized
windows; a left-side close button prevents accidental session closure when
you're sweeping right-side X buttons.

**Does SENU phone home?**
No telemetry. No cloud account. No analytics. The auto-update infrastructure
is wired (signed releases via GitHub) but the user-prompt UI is incomplete in
current builds — updates aren't automatically applied yet.

**Why no Vault in this release?**
Earlier builds had a credential vault. It was removed pending a full
rewrite — the previous implementation had reliability issues that aren't
acceptable for credential storage. Returning in a future release.

**Is the Chat feature secure?**
The cryptography uses standard primitives (X25519 ECDH + AES-256-GCM +
Ed25519 signatures) implemented via well-tested crates. However, **the
overall implementation has not been independently audited**. Don't use
it for anything you couldn't tolerate being read.

**Why are some themes marked BETA?**
Only the SENU and Nord themes have been through a full contrast and
terminal-palette pass. The other 11 themes work and are selectable in
`Settings → Themes`, but small details (badge readability, scrollbar
contrast, syntax highlighting in the editor) may still need polish.

---

## Contributing

Issues and pull requests welcome. SENU is solo-developed today, so response
time depends on what week of the month it is. For substantial changes,
please open an issue first to discuss the approach.

For development setup, see **Build from source** above.
For coding style, follow the existing conventions in the codebase.

---

## License

Licensed under the **Apache License, Version 2.0** — see [`LICENSE`](LICENSE)
for the full text.

Third-party dependency licenses are listed in [`THIRD-PARTY-LICENSES.txt`](THIRD-PARTY-LICENSES.txt)
(generated automatically at build time) and key attributions are in [`NOTICE`](NOTICE).

---

## Acknowledgements

SENU stands on the shoulders of:

- **[Tauri](https://tauri.app)** — for making desktop apps that aren't 200 MB
- **[xterm.js](https://xtermjs.org)** — terminal rendering
- **[CodeMirror 6](https://codemirror.net)** — config editor
- **[russh](https://github.com/Eugeny/russh)** — SSH backend (Rust async)
- **[IBM Plex Sans](https://www.ibm.com/plex/)** and **[JetBrains Mono](https://www.jetbrains.com/mono/)** — typography

And every late-night HN comment that made me realize I wasn't the only one
juggling 87 Notepad++ tabs.
