// src/ui/settings-view.js
// Responsible for: rendering the plugin settings panel inside the sidebar body.

import { escapeHtml } from '../util.js';
import { t } from '../i18n/index.js';

export function renderSettingsPanel(settingsState) {
    const {
        language = 'en',
        defaultSource = 'note',
        newEntryExcludeRecursion = false,
        newEntryPreventRecursion = false,
        showLorebookEntryCounters = true,
    } = settingsState ?? {};

    return `
        <div class="ne-settings-panel">
            <div class="ne-lorebook-picker__header">
                <p class="ne-lorebook-picker__title">${escapeHtml(t('settings.title'))}</p>
                <button
                    class="ne-btn ne-btn--soft ne-btn--icon"
                    type="button"
                    data-action="close-settings-panel"
                    aria-label="${escapeHtml(t('settings.close'))}"
                    title="${escapeHtml(t('settings.close'))}"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <section class="ne-settings-panel__section">
                <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.language'))}</p>
                <select class="ne-input" data-settings-field="language">
                    <option value="en"${language === 'en' ? ' selected' : ''}>${escapeHtml(t('settings.language.en'))}</option>
                    <option value="zh"${language === 'zh' ? ' selected' : ''}>${escapeHtml(t('settings.language.zh'))}</option>
                </select>
            </section>

            <section class="ne-settings-panel__section">
                <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.defaultSource'))}</p>
                <select class="ne-input" data-settings-field="defaultSource">
                    <option value="note"${defaultSource === 'note' ? ' selected' : ''}>${escapeHtml(t('settings.source.note'))}</option>
                    <option value="lorebook"${defaultSource === 'lorebook' ? ' selected' : ''}>${escapeHtml(t('settings.source.lorebook'))}</option>
                </select>
            </section>

            <section class="ne-settings-panel__section">
                <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.newEntry'))}</p>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="newEntryExcludeRecursion"
                        ${newEntryExcludeRecursion ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.newEntry.excludeRecursion'))}</span>
                </label>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="newEntryPreventRecursion"
                        ${newEntryPreventRecursion ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.newEntry.preventRecursion'))}</span>
                </label>
            </section>

            <section class="ne-settings-panel__section">
                <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.lorebookSidebar'))}</p>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="showLorebookEntryCounters"
                        ${showLorebookEntryCounters ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.lorebook.showEntryCounters'))}</span>
                </label>
            </section>
        </div>
    `;
}
