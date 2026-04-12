// ─── SENU Internationalization ────────────────────────────────────────────────
// Two languages: English (default) and Ukrainian.
// Usage:
//   const { t, lang, setLang } = useLanguage()
//   t('save')  →  "Save" | "Зберегти"

import { createContext, useContext, useState, useCallback } from 'react'

export type Lang = 'en' | 'uk'

// ─── Translation dictionary ────────────────────────────────────────────────────
const T = {
  en: {
    // ── Window controls ──────────────────────────────────────────────────────
    minimize: 'Minimize',
    maximize: 'Maximize',
    close: 'Close',
    keyboardShortcuts: 'Keyboard shortcuts (F1)',

    // ── Common ───────────────────────────────────────────────────────────────
    save: 'Save',
    cancel: 'Cancel',
    connect: 'Connect',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search…',
    clearSearch: 'Clear search',
    noMatches: 'No matches',
    loading: 'Loading…',
    optional: '(optional)',
    error: 'Error',

    // ── Server list / side panel ──────────────────────────────────────────────
    servers: 'Servers',
    noServers: 'No servers.\nClick + to add.',
    addServer: '+ Add Server',
    sftpBrowser: 'SFTP Browser',
    commandSnippets: 'Command Snippets',

    // ── Tab bar ───────────────────────────────────────────────────────────────
    newConnection: 'New connection (saved profile)',
    quickConnectPlaceholder: 'user@host:port',
    quickConnectTitle: 'Quick Connect (user@host:port)',
    commandPaletteTitle: 'Command palette (Ctrl+K)',
    showAllTabs: 'Show all tabs',
    reconnect: 'Reconnect',
    toggleNotes: 'Toggle notes',
    splitLayout: 'Split layout',
    lockSplitter: 'Lock splitter',
    unlockSplitter: 'Unlock splitter (drag to resize)',

    // ── Empty state ───────────────────────────────────────────────────────────
    appTagline: 'SSH workspace for those who see further',
    quickConnect: 'Quick Connect',
    newConnectionBtn: '+ New Connection',

    // ── Split pane ────────────────────────────────────────────────────────────
    pane: 'Pane',
    clickToConnect: 'Click a server to connect here',
    connectBtn: '+ Connect',

    // ── Server modal ──────────────────────────────────────────────────────────
    editConnection: 'Edit Connection',
    newConnection2: 'New Connection',
    fieldName: 'Name',
    fieldHost: 'Host',
    fieldPort: 'Port',
    fieldUsername: 'Username',
    fieldPassword: 'Password',
    fieldSshKey: 'SSH Private Key',
    fieldPassphrase: 'Passphrase',
    fieldColor: 'Color',
    authPassword: 'Password',
    authKey: 'SSH Key',
    authAgent: 'Agent',
    placeholderName: 'My Server',
    placeholderHost: '192.168.1.1',
    placeholderUsername: 'root',
    placeholderPassword: '••••••••',
    placeholderKeyPath: '~/.ssh/id_ed25519',
    placeholderPassphrase: 'Key passphrase',
    passphraseOptional: 'Leave empty if none',
    encryptedKeyWarning: 'This key is encrypted — enter passphrase below, or switch to Agent mode.',
    passphraseRequired: '* required',
    passphraseIfEncrypted: '(if key is encrypted)',
    agentFound: '✓ SSH Agent found',
    agentNotFound: '✗ SSH Agent not found',
    agentKeys: 'Keys already added to Pageant or OpenSSH agent will be used automatically.',
    agentInstructions: 'Start OpenSSH Authentication Agent in services.msc, or open Pageant…',
    checkingAgent: 'Checking agent…',
    saveAndConnect: 'Save & Connect',
    saveOnly: 'Save Only',
    proxyJump: 'ProxyJump (Jump Host)',
    jumpHostLabel: 'Jump Host',
    useProxyJump: 'Use ProxyJump',

    // ── SSH Key picker ────────────────────────────────────────────────────────
    chooseKeyFile: 'Choose key file…',
    generateKey: '✦ Generate',
    noKeysFound: 'No private keys found in ~/.ssh',
    keyType: 'Type',
    keyFilename: 'Filename',
    keyPassphrase: 'Passphrase',
    keyPassphrasePlaceholder: 'e.g. id_ed25519',
    keyTypeEd25519: 'Ed25519 (recommended)',
    keyTypeRsa: 'RSA 4096',
    generateKeyPair: 'Generate key pair',
    keyGenerated: '✓ Generated: ',
    keyGenError: '✗ Error: ',

    // ── Notes panel ───────────────────────────────────────────────────────────
    notes: 'Notes',
    exportNotes: 'Export all notes as Markdown',
    newNote: 'New note',
    searchNotes: 'Search notes…',
    noNotes: 'No notes yet.\nClick + to add one.',
    noNotesMatch: 'No notes match\n"',
    editNote: 'Edit Note',
    newNoteTitle: 'New Note',
    noteTitle: 'Title',
    noteContent: 'Content',

    // ── Snippets panel ────────────────────────────────────────────────────────
    mySnippets: 'My Snippets',
    library: 'Library',
    searchSnippets: 'Search…',
    noSnippets: 'No snippets yet.\nClick + to add your first.',
    insertSnippet: 'Insert (no newline)',
    runSnippet: 'Run (with Enter)',
    editSnippet: 'Edit',
    deleteSnippet: 'Delete',
    editSnippetTitle: 'Edit Snippet',
    newSnippetTitle: 'New Snippet',
    snippetTitle: 'Title',
    snippetCommand: 'Command',
    snippetDescription: 'Description',
    snippetTitlePlaceholder: 'e.g. Restart Nginx',
    snippetCommandPlaceholder: 'e.g. systemctl restart nginx',
    snippetDescPlaceholder: 'Short note about what it does',
    saveToSnippets: 'Save to My Snippets',
    newSnippetBtn: '+ New Snippet',

    // ── SFTP browser ──────────────────────────────────────────────────────────
    sftpEmpty: 'Connect to a server\nto browse files',
    goUp: 'Go up',
    copyPath: 'Copy path',
    refresh: 'Refresh',
    upload: '↑ Upload',
    uploadTitle: 'Upload file to current directory',
    emptyDirectory: 'Empty directory',
    download: 'Download ',
    downloading: '⇅ Downloading ',
    uploading: '⇅ Uploading…',

    // ── Terminal ──────────────────────────────────────────────────────────────
    searchTerminal: 'Search in terminal…',
    prevMatch: 'Previous (Shift+Enter)',
    nextMatch: 'Next (Enter)',
    closeSearch: 'Close search',
    stopLogging: 'Stop logging',
    startLogging: '⏺ Start Logging',
    stopLoggingMenu: '■ Stop Logging',
    copyText: '⎘ Copy',
    pasteText: '⏎ Paste',
    findInTerminal: '🔍 Find',
    clearTerminal: '✕ Clear Terminal',

    // ── Terminal inline messages ───────────────────────────────────────────────
    connecting: 'Connecting to ',
    stillConnecting: '⏳ Still connecting... (check server auth.log for errors)',
    connectionClosed: 'Connection closed.',
    pressRToReconnect: 'Press r to reconnect',
    connectionError: '✗ Error: ',
    closeTryAgain: 'Close this tab and try again.',
    reconnecting: '↻ Reconnecting to ',
    reconnectingIn: '↻ Connection lost. Reconnecting in ',
    reconnectAttempt: ' (attempt ',
    reconnectGaveUp: '✗ Auto-reconnect gave up after 5 attempts. Press ↻ to retry manually.',
    pressXToClose: 'Press the × button on the tab to close.',

    // ── Status bar ────────────────────────────────────────────────────────────
    noActiveConnection: 'No active connection',
    statusConnected: 'CONNECTED',
    statusConnecting: 'CONNECTING',
    statusDisconnected: 'DISCONNECTED',
    statusError: 'ERROR',
    langToggle: 'UK',

    // ── Host key modal ────────────────────────────────────────────────────────
    hostKeyChanged: '⚠ Host Key Changed!',
    unknownHost: '🔐 Unknown Host',
    hostKeyChangedWarning: 'WARNING: The host key for ',
    hostKeyChangedWarning2: ' has changed!',
    hostKeyChangedDetail: 'This could indicate a man-in-the-middle attack or the server was reinstalled. Verify with the system administrator before connecting.',
    hostKeyNewInfo: 'Connecting to ',
    hostKeyNewInfo2: ' for the first time.',
    hostKeyType: 'Key type',
    hostKeyFingerprint: 'Fingerprint',
    hostKeyRemember: 'Add to ~/.ssh/known_hosts',
    hostKeyReject: 'Reject',
    hostKeyTrust: 'Trust & Connect',

    // ── Command palette ───────────────────────────────────────────────────────
    palettePlaceholder: 'Search servers, actions, layouts…',
    paletteNoResults: 'No results for "',
    paletteSectionSessions: 'Open sessions',
    paletteSectionConnect: 'Connect to',
    paletteSectionLayout: 'Layout',
    paletteSectionActions: 'Actions',
    layoutSingle: 'Single pane',
    layout2col: '2 columns',
    layout2row: '2 rows',
    layout2x2: '2×2 grid',
    layout3x2: '3×2 grid',
    layout4x2: '4×2 grid',
    actionToggleNotes: 'Toggle notes panel',
    actionToggleNotesDesc: 'Show / hide right panel',
    actionToggleSidebar: 'Toggle server panel',
    actionToggleSidebarDesc: 'Show / hide left panel',
    actionNewConnection: 'New connection…',
    actionNewConnectionDesc: 'Open connection dialog',

    // ── Update bar ────────────────────────────────────────────────────────────
    updateAvailable: '⬆ Update available: v',
    updateDownload: 'Download',
    updateDownloading: '⬇ Downloading update… ',
    updateReady: '✓ Update v',
    updateReadySuffix: ' ready — restart to apply',
    updateRestart: 'Restart & Update',
    updateLater: 'Later',
    updateError: '⚠ Update error: ',

    // ── Group modal ───────────────────────────────────────────────────────────
    newGroup: 'New Group',
    groupName: 'Group name',
    groupNamePlaceholder: 'e.g. Production, Recon, Client A',
    groupColor: 'Color',
    groupCreate: 'Create',

    // ── Tab context menu ──────────────────────────────────────────────────────
    groups: 'Groups',
    newGroupMenu: 'New group…',
    removeFromGroup: 'Remove from group',
    closeTab: 'Close tab',

    // ── Keyboard shortcuts modal ──────────────────────────────────────────────
    shortcutsTitle: '⌨ Keyboard Shortcuts',
    shortcutSectionTerminal: 'Terminal',
    shortcutCopy: 'Copy selected text',
    shortcutPaste: 'Paste from clipboard',
    shortcutRightClick: 'Copy selection / Paste',
    shortcutReconnect: 'Reconnect (when disconnected)',
    shortcutSectionEditor: 'Editor',
    shortcutSave: 'Save file to server',
    shortcutSectionSnippets: 'Snippets',
    shortcutInsert: 'Send command without Enter',
    shortcutRun: 'Send command + Enter (execute)',
    shortcutSectionNotes: 'Notes',
    shortcutNewNote: 'New note',
    shortcutEditNote: 'Edit note',
    shortcutSearchNotes: 'Filter notes by title or content',
    shortcutSectionGeneral: 'General',
    shortcutShowShortcuts: 'Show this shortcuts reference',
  },

  uk: {
    // ── Керування вікном ─────────────────────────────────────────────────────
    minimize: 'Згорнути',
    maximize: 'На весь екран',
    close: 'Закрити',
    keyboardShortcuts: 'Гарячі клавіші (F1)',

    // ── Загальне ─────────────────────────────────────────────────────────────
    save: 'Зберегти',
    cancel: 'Скасувати',
    connect: "З'єднати",
    delete: 'Видалити',
    edit: 'Редагувати',
    search: 'Пошук…',
    clearSearch: 'Очистити пошук',
    noMatches: 'Нічого не знайдено',
    loading: 'Завантаження…',
    optional: '(необов\'язково)',
    error: 'Помилка',

    // ── Список серверів ───────────────────────────────────────────────────────
    servers: 'Сервери',
    noServers: 'Серверів немає.\nНатисни + щоб додати.',
    addServer: '+ Додати сервер',
    sftpBrowser: 'SFTP Браузер',
    commandSnippets: 'Сніпети команд',

    // ── Панель вкладок ────────────────────────────────────────────────────────
    newConnection: 'Нове підключення (збережений профіль)',
    quickConnectPlaceholder: 'user@host:port',
    quickConnectTitle: 'Швидке підключення (user@host:port)',
    commandPaletteTitle: 'Палітра команд (Ctrl+K)',
    showAllTabs: 'Показати всі вкладки',
    reconnect: 'Перепідключитись',
    toggleNotes: 'Нотатки',
    splitLayout: 'Розподіл екрану',
    lockSplitter: 'Зафіксувати роздільник',
    unlockSplitter: 'Розблокувати роздільник (тягни мишею)',

    // ── Порожній стан ─────────────────────────────────────────────────────────
    appTagline: 'SSH-термінал для тих, хто бачить далі',
    quickConnect: 'Швидке підключення',
    newConnectionBtn: '+ Нове підключення',

    // ── Розділені панелі ──────────────────────────────────────────────────────
    pane: 'Панель',
    clickToConnect: 'Клікни на сервер щоб підключитись',
    connectBtn: '+ Підключитись',

    // ── Модальне вікно сервера ────────────────────────────────────────────────
    editConnection: 'Редагувати підключення',
    newConnection2: 'Нове підключення',
    fieldName: "Ім'я",
    fieldHost: 'Хост',
    fieldPort: 'Порт',
    fieldUsername: "Ім'я користувача",
    fieldPassword: 'Пароль',
    fieldSshKey: 'Приватний SSH ключ',
    fieldPassphrase: 'Пароль ключа',
    fieldColor: 'Колір',
    authPassword: 'Пароль',
    authKey: 'SSH ключ',
    authAgent: 'Агент',
    placeholderName: 'Мій сервер',
    placeholderHost: '192.168.1.1',
    placeholderUsername: 'root',
    placeholderPassword: '••••••••',
    placeholderKeyPath: '~/.ssh/id_ed25519',
    placeholderPassphrase: 'Пароль від ключа',
    passphraseOptional: 'Залиште порожнім якщо немає',
    encryptedKeyWarning: 'Цей ключ зашифрований — введіть пароль нижче, або перейдіть на режим Агент.',
    passphraseRequired: '* обов\'язково',
    passphraseIfEncrypted: '(якщо ключ зашифрований)',
    agentFound: '✓ SSH Агент знайдено',
    agentNotFound: '✗ SSH Агент не знайдено',
    agentKeys: 'Ключі вже додані в Pageant або OpenSSH agent і будуть використані автоматично.',
    agentInstructions: 'Запустіть OpenSSH Authentication Agent в services.msc, або відкрийте Pageant…',
    checkingAgent: 'Перевірка агента…',
    saveAndConnect: 'Зберегти і підключитись',
    saveOnly: 'Тільки зберегти',
    proxyJump: 'ProxyJump (стрибковий хост)',
    jumpHostLabel: 'Стрибковий хост',
    useProxyJump: 'Використати ProxyJump',

    // ── Вибір SSH ключа ───────────────────────────────────────────────────────
    chooseKeyFile: 'Обрати файл ключа…',
    generateKey: '✦ Генерувати',
    noKeysFound: 'Приватних ключів в ~/.ssh не знайдено',
    keyType: 'Тип',
    keyFilename: 'Файл',
    keyPassphrase: 'Пароль',
    keyPassphrasePlaceholder: 'напр. id_ed25519',
    keyTypeEd25519: 'Ed25519 (рекомендовано)',
    keyTypeRsa: 'RSA 4096',
    generateKeyPair: 'Згенерувати пару ключів',
    keyGenerated: '✓ Створено: ',
    keyGenError: '✗ Помилка: ',

    // ── Панель нотаток ────────────────────────────────────────────────────────
    notes: 'Нотатки',
    exportNotes: 'Експортувати нотатки як Markdown',
    newNote: 'Нова нотатка',
    searchNotes: 'Пошук нотаток…',
    noNotes: 'Нотаток ще немає.\nНатисни + щоб додати.',
    noNotesMatch: 'Нічого не знайдено за запитом\n"',
    editNote: 'Редагувати нотатку',
    newNoteTitle: 'Нова нотатка',
    noteTitle: 'Заголовок',
    noteContent: 'Зміст',

    // ── Панель сніпетів ───────────────────────────────────────────────────────
    mySnippets: 'Мої сніпети',
    library: 'Бібліотека',
    searchSnippets: 'Пошук…',
    noSnippets: 'Сніпетів ще немає.\nНатисни + щоб додати перший.',
    insertSnippet: 'Вставити (без Enter)',
    runSnippet: 'Виконати (з Enter)',
    editSnippet: 'Редагувати',
    deleteSnippet: 'Видалити',
    editSnippetTitle: 'Редагувати сніпет',
    newSnippetTitle: 'Новий сніпет',
    snippetTitle: 'Назва',
    snippetCommand: 'Команда',
    snippetDescription: 'Опис',
    snippetTitlePlaceholder: 'напр. Перезапустити Nginx',
    snippetCommandPlaceholder: 'напр. systemctl restart nginx',
    snippetDescPlaceholder: 'Короткий опис що робить команда',
    saveToSnippets: 'Зберегти в Мої сніпети',
    newSnippetBtn: '+ Новий сніпет',

    // ── SFTP браузер ──────────────────────────────────────────────────────────
    sftpEmpty: 'Підключись до сервера\nщоб переглядати файли',
    goUp: 'Вгору',
    copyPath: 'Копіювати шлях',
    refresh: 'Оновити',
    upload: '↑ Завантажити',
    uploadTitle: 'Завантажити файл в поточну директорію',
    emptyDirectory: 'Порожня директорія',
    download: 'Завантажити ',
    downloading: '⇅ Завантаження ',
    uploading: '⇅ Вивантаження…',

    // ── Термінал ─────────────────────────────────────────────────────────────
    searchTerminal: 'Пошук у терміналі…',
    prevMatch: 'Попереднє (Shift+Enter)',
    nextMatch: 'Наступне (Enter)',
    closeSearch: 'Закрити пошук',
    stopLogging: 'Зупинити запис',
    startLogging: '⏺ Почати запис',
    stopLoggingMenu: '■ Зупинити запис',
    copyText: '⎘ Копіювати',
    pasteText: '⏎ Вставити',
    findInTerminal: '🔍 Знайти',
    clearTerminal: '✕ Очистити термінал',

    // ── Inline повідомлення терміналу ─────────────────────────────────────────
    connecting: "Підключення до ",
    stillConnecting: '⏳ Все ще підключаємось... (перевір auth.log на сервері)',
    connectionClosed: "З'єднання закрито.",
    pressRToReconnect: 'Натисни r щоб перепідключитись',
    connectionError: '✗ Помилка: ',
    closeTryAgain: 'Закрий цю вкладку і спробуй знову.',
    reconnecting: '↻ Перепідключення до ',
    reconnectingIn: "↻ З'єднання перервано. Перепідключення через ",
    reconnectAttempt: ' (спроба ',
    reconnectGaveUp: '✗ Перепідключення не вдалось після 5 спроб. Натисни ↻ щоб спробувати вручну.',
    pressXToClose: 'Натисни кнопку × на вкладці щоб закрити.',

    // ── Статус бар ───────────────────────────────────────────────────────────
    noActiveConnection: "Немає активного з'єднання",
    statusConnected: "З'ЄДНАНО",
    statusConnecting: 'ПІДКЛЮЧЕННЯ',
    statusDisconnected: 'ВІДКЛЮЧЕНО',
    statusError: 'ПОМИЛКА',
    langToggle: 'EN',

    // ── Модальне вікно ключа хоста ────────────────────────────────────────────
    hostKeyChanged: '⚠ Ключ хоста змінився!',
    unknownHost: '🔐 Невідомий хост',
    hostKeyChangedWarning: 'УВАГА: Ключ хоста для ',
    hostKeyChangedWarning2: ' змінився!',
    hostKeyChangedDetail: 'Це може свідчити про атаку "людина посередині" або сервер перевстановлено. Перевірте з системним адміністратором перш ніж підключатись.',
    hostKeyNewInfo: 'Підключення до ',
    hostKeyNewInfo2: ' вперше.',
    hostKeyType: 'Тип ключа',
    hostKeyFingerprint: 'Відбиток',
    hostKeyRemember: 'Додати до ~/.ssh/known_hosts',
    hostKeyReject: 'Відхилити',
    hostKeyTrust: 'Довіряти і підключитись',

    // ── Палітра команд ────────────────────────────────────────────────────────
    palettePlaceholder: 'Пошук серверів, дій, розмарів…',
    paletteNoResults: 'Нічого не знайдено для "',
    paletteSectionSessions: 'Відкриті сесії',
    paletteSectionConnect: 'Підключитись до',
    paletteSectionLayout: 'Розмітка',
    paletteSectionActions: 'Дії',
    layoutSingle: 'Одна панель',
    layout2col: '2 колонки',
    layout2row: '2 рядки',
    layout2x2: 'Сітка 2×2',
    layout3x2: 'Сітка 3×2',
    layout4x2: 'Сітка 4×2',
    actionToggleNotes: 'Панель нотаток',
    actionToggleNotesDesc: 'Показати / приховати праву панель',
    actionToggleSidebar: 'Панель серверів',
    actionToggleSidebarDesc: 'Показати / приховати ліву панель',
    actionNewConnection: 'Нове підключення…',
    actionNewConnectionDesc: 'Відкрити діалог підключення',

    // ── Панель оновлень ───────────────────────────────────────────────────────
    updateAvailable: '⬆ Доступне оновлення: v',
    updateDownload: 'Завантажити',
    updateDownloading: '⬇ Завантаження оновлення… ',
    updateReady: '✓ Оновлення v',
    updateReadySuffix: ' готове — перезапусти щоб застосувати',
    updateRestart: 'Перезапустити і оновити',
    updateLater: 'Пізніше',
    updateError: '⚠ Помилка оновлення: ',

    // ── Модальне вікно групи ──────────────────────────────────────────────────
    newGroup: 'Нова група',
    groupName: 'Назва групи',
    groupNamePlaceholder: 'напр. Прод, Клієнт А, Реконінг',
    groupColor: 'Колір',
    groupCreate: 'Створити',

    // ── Контекстне меню вкладки ───────────────────────────────────────────────
    groups: 'Групи',
    newGroupMenu: 'Нова група…',
    removeFromGroup: 'Видалити з групи',
    closeTab: 'Закрити вкладку',

    // ── Модальне вікно гарячих клавіш ────────────────────────────────────────
    shortcutsTitle: '⌨ Гарячі клавіші',
    shortcutSectionTerminal: 'Термінал',
    shortcutCopy: 'Копіювати виділений текст',
    shortcutPaste: 'Вставити з буфера обміну',
    shortcutRightClick: 'Копіювати / Вставити',
    shortcutReconnect: 'Перепідключитись (при відключенні)',
    shortcutSectionEditor: 'Редактор',
    shortcutSave: 'Зберегти файл на сервер',
    shortcutSectionSnippets: 'Сніпети',
    shortcutInsert: 'Надіслати команду без Enter',
    shortcutRun: 'Надіслати команду + Enter (виконати)',
    shortcutSectionNotes: 'Нотатки',
    shortcutNewNote: 'Нова нотатка',
    shortcutEditNote: 'Редагувати нотатку',
    shortcutSearchNotes: 'Фільтрувати нотатки за заголовком або змістом',
    shortcutSectionGeneral: 'Загальне',
    shortcutShowShortcuts: 'Показати цей список гарячих клавіш',
  },
} as const

export type TKey = keyof typeof T.en

// ─── Context ───────────────────────────────────────────────────────────────────
export interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}

// eslint-disable-next-line react-refresh/only-export-components
export const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => T.en[key] as string,
})

// ─── Hook ──────────────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage(): LangContextValue {
  return useContext(LangContext)
}

// ─── Provider factory (call in App root) ──────────────────────────────────────
const STORAGE_KEY = 'senu_lang'

export function useLangState(): LangContextValue {
  const saved = (localStorage.getItem(STORAGE_KEY) ?? 'en') as Lang
  const [lang, setLangState] = useState<Lang>(saved)

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }, [])

  const t = useCallback((key: TKey): string => {
    return (T[lang][key] ?? T.en[key]) as string
  }, [lang])

  return { lang, setLang, t }
}
