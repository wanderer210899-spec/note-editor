// src/state/settings-store.js
// Responsible for: plugin-level settings and launcher integration preferences.

import { normalizeLocale, setLocale } from '../i18n/index.js';
import {
    createDefaultFormatBarTools,
    EDITOR_MODE_HYBRID,
    EDITOR_MODE_PREVIEW,
    moveFormatBarTool,
    normalizeFormatBarTools,
    setFormatBarToolVisibility,
} from '../editor-tool-config.js';
import { flushExtensionSettings, readExtensionSetting, writeExtensionSetting } from '../services/st-context.js';
import { cloneData, isMobileViewport, readJsonStorage, writeJsonStorage } from '../util.js';

const STORAGE_KEY = 'note-editor.settings.v1';
const DESKTOP_SHORTCUTS_EXTENSION_KEY = 'noteEditorDesktopShortcuts';
const FORMAT_BAR_VIEWPORT_DESKTOP = 'desktop';
const FORMAT_BAR_VIEWPORT_MOBILE = 'mobile';
const PANEL_FONT_SCALE_DEFAULT = 1;
const PANEL_FONT_SCALE_MIN = 0.8;
const PANEL_FONT_SCALE_MAX = 1.4;
const PANEL_FONT_SCALE_STEP = 0.01;
const listeners = new Set();
const panelFontScaleListeners = new Set();

function createDefaultSettings() {
    return {
        language: detectDefaultLanguage(),
        defaultSource: 'note',
        editorMode: EDITOR_MODE_HYBRID,
        editorHotkeysEnabled: true,
        newEntryExcludeRecursion: false,
        newEntryPreventRecursion: false,
        showLorebookEntryCounters: true,
        panelFontScale: PANEL_FONT_SCALE_DEFAULT,
        formatBarToolsByViewport: createDefaultFormatBarToolsByViewport(),
        transferOverwriteExisting: false,
        integrations: createDefaultIntegrations(),
    };
}

function createDefaultFormatBarToolsByViewport() {
    const defaults = createDefaultFormatBarTools();
    return {
        desktop: defaults.map((tool) => ({ ...tool })),
        mobile: defaults.map((tool) => ({ ...tool })),
    };
}

function createDefaultIntegrations() {
    return {
        wandMenu: {
            enabled: true,
        },
        desktopShortcuts: {
            enabled: false,
            openNotes: 'Alt+N',
            openLorebook: 'Alt+L',
            createCurrent: '',
        },
        worldInfoButton: {
            enabled: true,
        },
        quickReply: {
            enabled: false,
            includeNotes: true,
            includeLore: true,
            includeNew: true,
        },
    };
}

function readPersistedSettings() {
    const stored = readJsonStorage(STORAGE_KEY);
    const defaults = createDefaultSettings();
    const syncedDesktopShortcuts = readSyncedDesktopShortcuts();

    if (!stored || typeof stored !== 'object') {
        return {
            ...defaults,
            integrations: normalizeIntegrations({
                ...defaults.integrations,
                desktopShortcuts: syncedDesktopShortcuts ?? defaults.integrations.desktopShortcuts,
            }),
        };
    }

    return {
        language: normalizeLocale(stored.language),
        defaultSource: stored.defaultSource === 'lorebook' ? 'lorebook' : 'note',
        editorMode: normalizeEditorMode(stored.editorMode),
        editorHotkeysEnabled: stored.editorHotkeysEnabled !== false,
        newEntryExcludeRecursion: Boolean(stored.newEntryExcludeRecursion),
        newEntryPreventRecursion: Boolean(stored.newEntryPreventRecursion),
        showLorebookEntryCounters: stored.showLorebookEntryCounters !== false,
        panelFontScale: normalizePanelFontScale(stored.panelFontScale),
        formatBarToolsByViewport: normalizeFormatBarToolsByViewport(
            stored.formatBarToolsByViewport,
            stored.formatBarTools,
        ),
        transferOverwriteExisting: Boolean(stored.transferOverwriteExisting),
        integrations: normalizeIntegrations({
            ...stored.integrations,
            desktopShortcuts: syncedDesktopShortcuts ?? stored?.integrations?.desktopShortcuts,
        }),
    };
}

let settings = readPersistedSettings();
let panelFontScalePreview = null;
let lastSettingsViewport = getActiveFormatBarViewport();

setLocale(settings.language);
syncExtensionDesktopShortcuts(settings.integrations?.desktopShortcuts);

export function getSettingsState() {
    const activeFormatBarViewport = getActiveFormatBarViewport();
    lastSettingsViewport = activeFormatBarViewport;
    const snapshot = cloneData(settings);

    return {
        ...snapshot,
        panelFontScale: getEffectivePanelFontScale(),
        activeFormatBarViewport,
        formatBarTools: cloneData(
            snapshot.formatBarToolsByViewport?.[activeFormatBarViewport] ?? createDefaultFormatBarTools(),
        ),
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
    updateSettings({ defaultSource: source === 'lorebook' ? 'lorebook' : 'note' });
}

export function setSettingsEditorMode(mode) {
    updateSettings({ editorMode: normalizeEditorMode(mode) });
}

export function setSettingsEditorHotkeysEnabled(value) {
    updateSettings({ editorHotkeysEnabled: Boolean(value) });
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

export function setSettingsFormatBarToolVisible(toolId, visible) {
    const normalizedToolId = String(toolId ?? '').trim();
    if (!normalizedToolId) {
        return;
    }

    updateActiveFormatBarTools((formatBarTools) => (
        setFormatBarToolVisibility(formatBarTools, normalizedToolId, visible)
    ));
}

export function moveSettingsFormatBarTool(toolId, direction) {
    const normalizedToolId = String(toolId ?? '').trim();
    if (!normalizedToolId) {
        return;
    }

    updateActiveFormatBarTools((formatBarTools) => (
        moveFormatBarTool(formatBarTools, normalizedToolId, direction)
    ));
}

export function setSettingsWandMenuEnabled(value) {
    updateIntegrationSetting('wandMenu', {
        enabled: Boolean(value),
    });
}

export function setSettingsDesktopShortcutsEnabled(value) {
    updateIntegrationSetting('desktopShortcuts', {
        enabled: Boolean(value),
    });
}

export function setSettingsDesktopShortcutOpenNotes(value) {
    updateIntegrationSetting('desktopShortcuts', {
        openNotes: normalizeShortcutSetting(value),
    });
}

export function setSettingsDesktopShortcutOpenLorebook(value) {
    updateIntegrationSetting('desktopShortcuts', {
        openLorebook: normalizeShortcutSetting(value),
    });
}

export function setSettingsDesktopShortcutCreateCurrent(value) {
    updateIntegrationSetting('desktopShortcuts', {
        createCurrent: normalizeShortcutSetting(value),
    });
}

export function setSettingsWorldInfoButtonEnabled(value) {
    updateIntegrationSetting('worldInfoButton', {
        enabled: Boolean(value),
    });
}

export function setSettingsQuickReplyEnabled(value) {
    updateIntegrationSetting('quickReply', {
        enabled: Boolean(value),
    });
}

export function setSettingsQuickReplyIncludeNotes(value) {
    updateIntegrationSetting('quickReply', {
        includeNotes: Boolean(value),
    });
}

export function setSettingsQuickReplyIncludeLore(value) {
    updateIntegrationSetting('quickReply', {
        includeLore: Boolean(value),
    });
}

export function setSettingsQuickReplyIncludeNew(value) {
    updateIntegrationSetting('quickReply', {
        includeNew: Boolean(value),
    });
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

export function syncSettingsViewport() {
    const nextViewport = getActiveFormatBarViewport();
    if (lastSettingsViewport === nextViewport) {
        return false;
    }

    lastSettingsViewport = nextViewport;
    emitChange();
    return true;
}

function updateIntegrationSetting(sectionKey, changes) {
    const defaults = createDefaultIntegrations();
    const nextIntegrations = normalizeIntegrations({
        ...settings.integrations,
        [sectionKey]: {
            ...(settings.integrations?.[sectionKey] ?? defaults[sectionKey] ?? {}),
            ...changes,
        },
    });
    updateSettings({ integrations: nextIntegrations });
}

function updateActiveFormatBarTools(mutator) {
    if (typeof mutator !== 'function') {
        return;
    }

    const activeViewport = getActiveFormatBarViewport();
    const currentTools = settings.formatBarToolsByViewport?.[activeViewport] ?? createDefaultFormatBarTools();
    updateSettings({
        formatBarToolsByViewport: {
            ...settings.formatBarToolsByViewport,
            [activeViewport]: mutator(currentTools),
        },
    });
}

function updateSettings(changes) {
    const previous = settings;
    const next = normalizeSettingsSnapshot({
        ...settings,
        ...changes,
    });

    if (isSameSettings(previous, next)) {
        return;
    }

    settings = next;
    writeJsonStorage(STORAGE_KEY, settings);
    syncExtensionDesktopShortcuts(next.integrations?.desktopShortcuts);
    if (previous.panelFontScale !== next.panelFontScale) {
        emitPanelFontScaleChange();
    }
    emitChange();
}

function normalizeSettingsSnapshot(candidate) {
    return {
        language: normalizeLocale(candidate?.language),
        defaultSource: candidate?.defaultSource === 'lorebook' ? 'lorebook' : 'note',
        editorMode: normalizeEditorMode(candidate?.editorMode),
        editorHotkeysEnabled: candidate?.editorHotkeysEnabled !== false,
        newEntryExcludeRecursion: Boolean(candidate?.newEntryExcludeRecursion),
        newEntryPreventRecursion: Boolean(candidate?.newEntryPreventRecursion),
        showLorebookEntryCounters: candidate?.showLorebookEntryCounters !== false,
        panelFontScale: normalizePanelFontScale(candidate?.panelFontScale),
        formatBarToolsByViewport: normalizeFormatBarToolsByViewport(
            candidate?.formatBarToolsByViewport,
            candidate?.formatBarTools,
        ),
        transferOverwriteExisting: Boolean(candidate?.transferOverwriteExisting),
        integrations: normalizeIntegrations(candidate?.integrations),
    };
}

function normalizeFormatBarToolsByViewport(stored, legacyTools = null) {
    const normalizedLegacyTools = normalizeFormatBarTools(legacyTools);

    return {
        desktop: normalizeFormatBarTools(stored?.desktop ?? normalizedLegacyTools),
        mobile: normalizeFormatBarTools(stored?.mobile ?? normalizedLegacyTools),
    };
}

function normalizeIntegrations(stored) {
    const defaults = createDefaultIntegrations();
    const desktopShortcuts = {
        enabled: Boolean(stored?.desktopShortcuts?.enabled),
        openNotes: normalizeShortcutSetting(stored?.desktopShortcuts?.openNotes ?? defaults.desktopShortcuts.openNotes),
        openLorebook: normalizeShortcutSetting(stored?.desktopShortcuts?.openLorebook ?? defaults.desktopShortcuts.openLorebook),
        createCurrent: normalizeShortcutSetting(stored?.desktopShortcuts?.createCurrent ?? defaults.desktopShortcuts.createCurrent),
    };
    const nextIntegrations = {
        wandMenu: {
            enabled: stored?.wandMenu?.enabled !== false,
        },
        desktopShortcuts,
        worldInfoButton: {
            enabled: stored?.worldInfoButton?.enabled !== false,
        },
        quickReply: {
            enabled: Boolean(stored?.quickReply?.enabled),
            includeNotes: stored?.quickReply?.includeNotes !== false,
            includeLore: stored?.quickReply?.includeLore !== false,
            includeNew: stored?.quickReply?.includeNew !== false,
        },
    };

    if (hasEnabledLauncher(nextIntegrations)) {
        return nextIntegrations;
    }

    return {
        ...nextIntegrations,
        wandMenu: {
            enabled: true,
        },
    };
}

function getActiveFormatBarViewport() {
    return isMobileViewport() ? FORMAT_BAR_VIEWPORT_MOBILE : FORMAT_BAR_VIEWPORT_DESKTOP;
}

function hasEnabledLauncher(integrations) {
    return Boolean(
        integrations?.wandMenu?.enabled
        || integrations?.worldInfoButton?.enabled
        || integrations?.quickReply?.enabled
        || (
            integrations?.desktopShortcuts?.enabled
            && hasDesktopShortcutBinding(integrations.desktopShortcuts)
        )
    );
}

function hasDesktopShortcutBinding(shortcuts) {
    return Boolean(
        normalizeShortcutSetting(shortcuts?.openNotes)
        || normalizeShortcutSetting(shortcuts?.openLorebook)
        || normalizeShortcutSetting(shortcuts?.createCurrent)
    );
}

function isSameSettings(left, right) {
    return left.language === right.language
        && left.defaultSource === right.defaultSource
        && left.editorMode === right.editorMode
        && left.editorHotkeysEnabled === right.editorHotkeysEnabled
        && left.newEntryExcludeRecursion === right.newEntryExcludeRecursion
        && left.newEntryPreventRecursion === right.newEntryPreventRecursion
        && left.showLorebookEntryCounters === right.showLorebookEntryCounters
        && left.panelFontScale === right.panelFontScale
        && JSON.stringify(left.formatBarToolsByViewport) === JSON.stringify(right.formatBarToolsByViewport)
        && left.transferOverwriteExisting === right.transferOverwriteExisting
        && JSON.stringify(left.integrations) === JSON.stringify(right.integrations);
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

function normalizeEditorMode(value) {
    return String(value ?? '').trim() === EDITOR_MODE_PREVIEW
        ? EDITOR_MODE_PREVIEW
        : EDITOR_MODE_HYBRID;
}

function normalizeShortcutSetting(value) {
    const trimmedValue = String(value ?? '').trim();
    return trimmedValue.replace(/\s*\+\s*/g, '+');
}

function readSyncedDesktopShortcuts() {
    const defaults = createDefaultIntegrations().desktopShortcuts;
    const stored = readExtensionSetting(DESKTOP_SHORTCUTS_EXTENSION_KEY);
    if (!stored || typeof stored !== 'object') {
        return null;
    }

    return {
        enabled: Boolean(stored.enabled),
        openNotes: normalizeShortcutSetting(stored.openNotes ?? defaults.openNotes),
        openLorebook: normalizeShortcutSetting(stored.openLorebook ?? defaults.openLorebook),
        createCurrent: normalizeShortcutSetting(stored.createCurrent ?? defaults.createCurrent),
    };
}

function syncExtensionDesktopShortcuts(shortcuts) {
    const normalizedShortcuts = normalizeIntegrations({
        desktopShortcuts: shortcuts,
    }).desktopShortcuts;
    const currentSyncedShortcuts = readSyncedDesktopShortcuts();
    if (isSameDesktopShortcuts(currentSyncedShortcuts, normalizedShortcuts)) {
        return;
    }

    if (!writeExtensionSetting(DESKTOP_SHORTCUTS_EXTENSION_KEY, cloneData(normalizedShortcuts))) {
        return;
    }

    flushExtensionSettings();
}

function isSameDesktopShortcuts(left, right) {
    return Boolean(left)
        && Boolean(right)
        && Boolean(left.enabled) === Boolean(right.enabled)
        && normalizeShortcutSetting(left.openNotes) === normalizeShortcutSetting(right.openNotes)
        && normalizeShortcutSetting(left.openLorebook) === normalizeShortcutSetting(right.openLorebook)
        && normalizeShortcutSetting(left.createCurrent) === normalizeShortcutSetting(right.createCurrent);
}

function detectDefaultLanguage() {
    const browserLanguage = typeof navigator !== 'undefined'
        ? (navigator.language || navigator.languages?.[0] || '')
        : '';
    return normalizeLocale(browserLanguage);
}
