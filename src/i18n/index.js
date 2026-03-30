// src/i18n/index.js
// Provides the t() translation function and locale switching.
// Language is set by settings-store.js calling setLocale() at startup and on change.

import en from './en.js';
import zh from './zh.js';

const LOCALES = { en, zh };

let activeLocale = 'en';
let activeStrings = en;

export function normalizeLocale(lang) {
    const trimmed = String(lang ?? '').trim().toLowerCase();
    if (!trimmed) {
        return 'en';
    }

    if (trimmed === 'zh' || trimmed.startsWith('zh-') || trimmed.startsWith('zh_') || trimmed === 'cn') {
        return 'zh';
    }

    return 'en';
}

// Switch the active locale. Called by settings-store.js when language changes.
export function setLocale(lang) {
    const validLang = normalizeLocale(lang);
    if (validLang === activeLocale) {
        return;
    }

    activeLocale = validLang;
    activeStrings = LOCALES[validLang];
}

// Look up a translation string by key.
// Optionally pass vars to replace {placeholder} tokens in the string.
// Falls back to English if the key is missing in the active locale.
// Falls back to the key itself if missing everywhere.
export function t(key, vars = {}) {
    let str = activeStrings[key] ?? en[key] ?? key;

    const hasVars = vars && typeof vars === 'object' && Object.keys(vars).length > 0;
    if (!hasVars) {
        return str;
    }

    for (const [placeholder, value] of Object.entries(vars)) {
        str = str.split(`{${placeholder}}`).join(String(value));
    }

    return str;
}
