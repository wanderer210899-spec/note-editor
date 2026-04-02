// src/state/notes-persistence.js
// Responsible for: note settings storage reads, mirrors, and explicit persistence flushes.

import { flushExtensionSettings, readExtensionSetting, writeExtensionSetting } from '../services/st-context.js';
import { cloneData, readJsonStorage, writeJsonStorage } from '../util.js';

const PLUGIN_SETTINGS_KEY = 'noteEditor';
const FALLBACK_STORAGE_KEY = 'note-editor.settings.v2';

export function readStoredSettings() {
    const contextSettings = readExtensionSetting(PLUGIN_SETTINGS_KEY);
    return contextSettings ?? readJsonStorage(FALLBACK_STORAGE_KEY);
}

export function mirrorSettings(settings) {
    writeJsonStorage(FALLBACK_STORAGE_KEY, settings);
    writeExtensionSetting(PLUGIN_SETTINGS_KEY, cloneData(settings));
}

export function persistSettingsNow(settings) {
    mirrorSettings(settings);
    flushExtensionSettings();
}
