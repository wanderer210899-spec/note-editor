// src/state/settings-store.js
// Responsible for: plugin-level settings — language, default source, and new-entry defaults.
// Persists to localStorage. Mirrors the session-store.js listener pattern.

import { normalizeLocale, setLocale } from '../i18n/index.js';
import { readJsonStorage, writeJsonStorage } from '../util.js';

const STORAGE_KEY = 'note-editor.settings.v1';
const PANEL_FONT_SCALE_DEFAULT = 1;
const PANEL_FONT_SCALE_MIN = 0.8;
const PANEL_FONT_SCALE_MAX = 1.4;
const PANEL_FONT_SCALE_STEP = 0.01;

const listeners = new Set();
const panelFontScaleListeners = new Set();

function createDefaultSettings() {
    return {
        language: detectDefaultLanguage(), // 'en' | 'zh'
        defaultSource: 'note',  // 'note' | 'lorebook'
        newEntryExcludeRecursion: false,
        newEntryPreventRecursion: false,
        showLorebookEntryCounters: true,
        panelFontScale: PANEL_FONT_SCALE_DEFAULT,
        transferOverwriteExisting: false,
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
        showLorebookEntryCounters: stored.showLorebookEntryCounters !== false,
        panelFontScale: normalizePanelFontScale(stored.panelFontScale),
        transferOverwriteExisting: Boolean(stored.transferOverwriteExisting),
    };
}

let settings = readPersistedSettings();
let panelFontScalePreview = null;

// Apply the persisted language immediately at module load so t() works before any UI renders.
setLocale(settings.language);

export function getSettingsState() {
    return {
        ...settings,
        panelFontScale: getEffectivePanelFontScale(),
    };
}

export function subscribeSettings(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    listeners.add(listener);
    listener(getSettingsState());
    return () => listeners.delete(listener);
}

export function subscribePanelFontScale(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    panelFontScaleListeners.add(listener);
    listener(getPanelFontScaleSnapshot());
    return () => panelFontScaleListeners.delete(listener);
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

export function setSettingsShowLorebookEntryCounters(value) {
    updateSettings({ showLorebookEntryCounters: Boolean(value) });
}

export function setSettingsTransferOverwriteExisting(value) {
    updateSettings({ transferOverwriteExisting: Boolean(value) });
}

export function previewSettingsPanelFontScale(value) {
    const nextScale = normalizePanelFontScale(value);
    if (panelFontScalePreview === nextScale) {
        return;
    }

    panelFontScalePreview = nextScale;
    emitPanelFontScaleChange();
}

export function setSettingsPanelFontScale(value) {
    const nextScale = normalizePanelFontScale(value);
    const hadPreview = panelFontScalePreview !== null;

    panelFontScalePreview = null;
    if (settings.panelFontScale === nextScale) {
        if (hadPreview) {
            emitPanelFontScaleChange();
        }
        return;
    }

    updateSettings({ panelFontScale: nextScale });
}

export function clearSettingsPanelFontScalePreview() {
    if (panelFontScalePreview === null) {
        return;
    }

    panelFontScalePreview = null;
    emitPanelFontScaleChange();
}

export function getSettingsPanelFontScaleDefault() {
    return PANEL_FONT_SCALE_DEFAULT;
}

function updateSettings(changes) {
    const previous = settings;
    const next = { ...settings, ...changes };

    if (isSameSettings(previous, next)) {
        return;
    }

    settings = next;
    writeJsonStorage(STORAGE_KEY, settings);
    if (previous.panelFontScale !== next.panelFontScale) {
        emitPanelFontScaleChange();
    }
    emitChange();
}

function isSameSettings(left, right) {
    return left.language === right.language
        && left.defaultSource === right.defaultSource
        && left.newEntryExcludeRecursion === right.newEntryExcludeRecursion
        && left.newEntryPreventRecursion === right.newEntryPreventRecursion
        && left.showLorebookEntryCounters === right.showLorebookEntryCounters
        && left.panelFontScale === right.panelFontScale
        && left.transferOverwriteExisting === right.transferOverwriteExisting;
}

function emitChange() {
    const snapshot = getSettingsState();
    listeners.forEach((listener) => listener(snapshot));
}

function emitPanelFontScaleChange() {
    const snapshot = getPanelFontScaleSnapshot();
    panelFontScaleListeners.forEach((listener) => listener(snapshot));
}

function getPanelFontScaleSnapshot() {
    return {
        value: getEffectivePanelFontScale(),
        persistedValue: settings.panelFontScale,
        previewing: panelFontScalePreview !== null,
    };
}

function getEffectivePanelFontScale() {
    return panelFontScalePreview ?? settings.panelFontScale;
}

function normalizePanelFontScale(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return PANEL_FONT_SCALE_DEFAULT;
    }

    const steppedValue = Math.round(numericValue / PANEL_FONT_SCALE_STEP) * PANEL_FONT_SCALE_STEP;
    const clampedValue = Math.min(PANEL_FONT_SCALE_MAX, Math.max(PANEL_FONT_SCALE_MIN, steppedValue));
    return Number(clampedValue.toFixed(2));
}

function detectDefaultLanguage() {
    const browserLanguage = typeof navigator !== 'undefined'
        ? (navigator.language || navigator.languages?.[0] || '')
        : '';
    return normalizeLocale(browserLanguage);
}
