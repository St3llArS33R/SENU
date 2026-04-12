# Progress Log — SSH Terminal App

> Назва ще не вибрана. Кандидати: `voidsh`, `rawsh`, `cryoterm`.
> GitHub репо ще не створено — чекає на фінальну назву.

---

## Стек

| Шар | Технологія |
|---|---|
| Framework | Electron 30 |
| UI | React 18 + TypeScript |
| Bundler | Vite + vite-plugin-electron |
| Terminal | xterm.js 6 (@xterm/xterm) |
| Editor | Monaco Editor (@monaco-editor/react) |
| SSH | ssh2 |
| Storage | JSON-файли в Electron userData |
| Build | electron-builder → NSIS installer (Windows) |

---

## Що зроблено

### v0.1 — Base (вихідна точка)
- SSH підключення: password, private key (auto-detect типу), SSH agent / Pageant
- Термінальний емулятор: xterm-256color, Catppuccin тема
- Менеджер серверів: збереження, кольорові мітки, редагування, видалення
- Вкладки сесій з індикацією статусу (connecting / connected / error)
- Нотатник прив'язаний до SSH-сесії
- Monaco-редактор з SFTP read/write одного файлу
- Виявлення зашифрованих ключів і SSH agent
- Кастомний titlebar (frameless window)

### v0.2 — Stability
- **PTY resize** — `stream.setWindow(rows, cols)` через ResizeObserver, термінал тепер правильно підлаштовується під розмір вікна
- **Notes → serverId** — нотатки тепер прив'язані до сервера, а не до сесії. Не губляться після reconnect
- **Reconnect button** — кнопка ↻ на вкладці + клавіша `r` в терміналі коли з'єднання закрите
- **Monaco language autodetect** — `detectLanguage()` визначає мову по розширенню файлу (30+ розширень)
- **SFTP channel caching** — `getSftp()` кешує SFTP канал, фіксить "Channel open failure"
- **Ctrl+Shift+C/V** — copy/paste в терміналі + правий клік
- **Виправлено подвійну вставку** Ctrl+Shift+V через `preventDefault + stopPropagation`
- **Виправлено taskbar overlap** — `height: 100%` замість `100vh`
- **Темні confirm dialogs** — замість браузерного `window.confirm`
- **Toast notifications** — збереження файлу, помилки
- **Ctrl+S** в Monaco редакторі
- **electron-builder конфіг** — NSIS installer, desktop shortcut, `sign: null` для Windows без підпису

### v0.3 — Activity Bar + SFTP Browser
- **Activity bar** — 48px sidebar з іконками: Servers | SFTP | Snippets
- **SFTP File Browser** — навігація по директоріях, редагування шляху кліком, кнопка копіювання шляху, refresh, кольорове маркування файлів по типу (код, конфіги, архіви, env, бази даних тощо)
- **SFTP state preservation** — при переключенні панелей шлях не скидається (CSS hide замість unmount)

### v0.3 — Command Snippets
- **My Snippets** — особисті команди, зберігаються в `snippets.json`
  - Insert — вставляє без Enter
  - ▶ Run — вставляє з Enter (виконує)
  - Редагування і видалення через модальне вікно
  - Пошук по назві, команді, опису
- **Library** — 60+ вбудованих команд по категоріях:
  - 🖥 System, 🌐 Network, 🐳 Docker, ⚡ Nginx, 🔀 Git, 🗄 MySQL, 🛡 Firewall, 🐘 PHP/Laravel
  - Категорії розкриваються кліком
  - "Save" зберігає команду в My Snippets

### v0.4 — UX Polish
- **Пошук по нотатках** — фільтрація по заголовку і вмісту, підсвічування збігів жовтим, авто-розкриття нотаток при пошуку
- **Export нотаток у Markdown** — кнопка ↓ в хедері нотаток, системний save dialog, всі нотатки сервера в одному `.md` файлі
- **Shortcuts cheatsheet** — кнопка `?` в тайтлбарі або `F1`, модалка з усіма хоткеями по секціях
- **Вкладки в редакторі** — кілька файлів одночасно у Monaco:
  - Якщо файл вже відкритий — просто переключається
  - Несохранені зміни позначені `●` на вкладці
  - `Ctrl+S` зберігає активну вкладку
  - Повний шлях до файлу під вкладками
- **Auto-update** — `electron-updater` + GitHub Releases:
  - Перевірка через 3 сек після старту і кожні 4 год
  - Update bar між тайтлбаром і таббаром
  - Стани: available → downloading (прогрес-бар) → ready → error
  - "Restart & Update" встановлює без зайвих кліків
  - У dev-режимі повністю мовчить

---

## Що залишилось

### Середнє
- [ ] **SSH Tunnel / Port Forwarding** — UI для `-L port:host:port`

### v1.0
- [ ] **License key system** — перевірка ключа для Pro-фічей (монетизація)
- [ ] **Split panes** — два термінали поруч
- [ ] **GitHub репо + публічний реліз** — після вибору назви
- [ ] **Product Hunt launch**

---

## Файлова структура (ключові файли)

```
electron/
  main.ts        — SSH, SFTP, Notes, Snippets, Updater IPC handlers
  preload.ts     — contextBridge API для renderer
  electron-env.d.ts — типи для ssh2

src/
  App.tsx        — весь UI (1500+ рядків)
  App.css        — всі стилі

electron-builder.json5  — конфіг збірки (NSIS, publish до GitHub)
package.json            — скрипти: build:win, build:win:dir, release:win
```

---

## Хоткеї

| Клавіша | Дія |
|---|---|
| Ctrl+Shift+C | Копіювати виділення в терміналі |
| Ctrl+Shift+V | Вставити з буферу в термінал |
| Правий клік | Копіювати / Вставити |
| R | Reconnect (коли з'єднання закрите) |
| Ctrl+S | Зберегти файл в Monaco редакторі |
| F1 / ? | Shortcuts cheatsheet |

---

## Збірка

```bash
# Швидкий тест (без installer)
npm run build:win:dir

# Повний installer
npm run build:win

# Публікація на GitHub Releases (потрібен GH_TOKEN)
$env:GH_TOKEN = "ghp_xxxxxxx"
npm run release:win
```

> Перед `release:win` треба вказати свій GitHub username в `electron-builder.json5` → `publish.owner`
