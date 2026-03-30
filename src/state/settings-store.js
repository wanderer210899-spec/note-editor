// src/state/settings-store.js
// Responsible for: plugin-level settings — language, default source, and new-entry defaults.
// Persists to localStorage. Mirrors the session-store.js listener pattern.

import { normalizeLocale, setLocale } from '../i18n/index.js';
import { readJsonStorage, writeJsonStorage } from '../util.js';

const STORAGE_KEY = 'note-editor.settings.v1';

const listeners = new Set();

function createDefaultSettings() {
    return {
        language: detectDefaultLanguage(), // 'en' | 'zh'
        defaultSource: 'note',  // 'note' | 'lorebook'
        newEntryExcludeRecursion: false,
        newEntryPreventRecursion: false,
    };
}

function readPersistedSettings() {
    const stored = readJsonStorage(STORAGE_KEY);
    const defaults = createDefaultSettings();

    if (!stored || typeof stored !== 'object') {
        return defaults;
    }

    return {
        language: normalizeLocale(stored.language),
        defaultSource: stored.defaultSource === 'lorebook' ? 'lorebook' : 'note',
        newEntryExcludeRecursion: Boolean(stored.newEntryExcludeRecursion),
        newEntryPreventRecursion: Boolean(stored.newEntryPreventRecursion),
    };
}

let settings = readPersistedSettings();

// Apply the persisted language immediately at module load so t() works before any UI renders.
setLocale(settings.language);

export function getSettingsState() {
    return { ...settings };
}

export function subscribeSettings(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    listeners.add(listener);
    listener(getSettingsState());
    return () => listeners.delete(listener);
}

export function setSettingsLanguage(lang) {
    const validated = normalizeLocale(lang);
    setLocale(validated);
    updateSettings({ language: validated });
}

export function setSettingsDefaultSource(source) {
    const validated = source === 'lorebook' ? 'lorebook' : 'note';
    updateSettings({ defaultSource: validated });
}

export function setSettingsNewEntryExcludeRecursion(value) {
    updateSettings({ newEntryExcludeRecursion: Boolean(value) });
}

export function setSettingsNewEntryPreventRecursion(value) {
    updateSettings({ newEntryPreventRecursion: Boolean(value) });
}

function updateSettings(changes) {
    const next = { ...settings, ...changes };

    if (isSameSettings(settings, next)) {
        return;
    }

    settings = next;
    writeJsonStorage(STORAGE_KEY, settings);
    emitChange();
}

function isSameSettings(left, right) {
    return left.language === right.language
        && left.defaultSource === right.defaultSource
        && left.newEntryExcludeRecursion === right.newEntryExcludeRecursion
        && left.newEntryPreventRecursion === right.newEntryPreventRecursion;
}

function emitChange() {
    const snapshot = getSettingsState();
    listeners.forEach((listener) => listener(snapshot));
}

function detectDefaultLanguage() {
    const browserLanguage = typeof navigator !== 'undefined'
        ? (navigator.language || navigator.languages?.[0] || '')
        : '';
    return normalizeLocale(browserLanguage);
}
