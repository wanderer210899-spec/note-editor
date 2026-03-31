// src/ui/settings-view.js
// Responsible for: rendering the plugin settings panel inside the sidebar body.

import { escapeHtml } from '../util.js';
import { t } from '../i18n/index.js';

export function renderSettingsPanel(settingsState, transferModel = {}) {
    const {
        language = 'en',
        defaultSource = 'note',
        newEntryExcludeRecursion = false,
        newEntryPreventRecursion = false,
        showLorebookEntryCounters = true,
        panelFontScale = 1,
        transferOverwriteExisting = false,
    } = settingsState ?? {};
    const fontScalePercent = Math.round(Number(panelFontScale) * 100);
    const {
        hasNotes = false,
        selectedFolderCount = 0,
        selectedNoteCount = 0,
        effectiveExportCount = 0,
        folderSections = [],
        unfiledNotes = [],
        exportPickerOpen = false,
    } = transferModel ?? {};

    return `
        <div class="ne-settings-panel">
            <div class="ne-lorebook-picker__header">
                <p class="ne-lorebook-picker__title">${escapeHtml(t('settings.title'))}</p>
            </div>

            <section class="ne-settings-panel__section">
                <div class="ne-settings-panel__section-head">
                    <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.appearance'))}</p>
                    <button
                        class="ne-btn ne-btn--soft ne-settings-panel__reset"
                        type="button"
                        data-action="reset-panel-font-scale"
                    >
                        ${escapeHtml(t('settings.appearance.reset'))}
                    </button>
                </div>
                <label class="ne-settings-panel__range-label" for="ne-settings-font-scale">
                    <span>${escapeHtml(t('settings.appearance.fontScale'))}</span>
                    <strong data-settings-preview-value="panelFontScale">${escapeHtml(t('settings.appearance.fontScaleValue', { percent: fontScalePercent }))}</strong>
                </label>
                <input
                    id="ne-settings-font-scale"
                    class="ne-settings-panel__range"
                    type="range"
                    min="0.8"
                    max="1.4"
                    step="0.01"
                    value="${escapeHtml(String(panelFontScale))}"
                    data-settings-field="panelFontScale"
                    data-settings-preview-field="panelFontScale"
                />
            </section>

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

            <section class="ne-settings-panel__section">
                <p class="ne-settings-panel__section-label">${escapeHtml(t('settings.section.transfer'))}</p>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="transferOverwriteExisting"
                        ${transferOverwriteExisting ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.transfer.overwriteExisting'))}</span>
                </label>
                <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.importTitle'))}</p>
                <div class="ne-settings-panel__transfer-actions">
                    <button class="ne-btn ne-btn--soft" type="button" data-action="import-note-files">
                        ${escapeHtml(t('settings.transfer.importFiles'))}
                    </button>
                    <button class="ne-btn ne-btn--soft" type="button" data-action="import-note-folder">
                        ${escapeHtml(t('settings.transfer.importFolder'))}
                    </button>
                </div>
                <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.transfer.importHint'))}</p>
                <div class="ne-settings-panel__section-head">
                    <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.exportSelection'))}</p>
                    <span class="ne-settings-panel__section-meta">${escapeHtml(t('settings.transfer.selectionSummary', { folders: selectedFolderCount, notes: selectedNoteCount, files: effectiveExportCount }))}</span>
                </div>
                ${exportPickerOpen ? `
                    <div class="ne-settings-panel__mini-actions">
                        <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="select-all-note-exports">
                            ${escapeHtml(t('settings.transfer.selectAll'))}
                        </button>
                        <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="clear-note-exports">
                            ${escapeHtml(t('settings.transfer.clearSelection'))}
                        </button>
                        <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="close-note-export-picker">
                            ${escapeHtml(t('settings.transfer.hideExportPicker'))}
                        </button>
                    </div>
                    ${hasNotes ? `
                        <div class="ne-settings-panel__transfer-list">
                            ${folderSections.map((section) => `
                                <div class="ne-settings-panel__transfer-group">
                                    <label
                                        class="ne-settings-panel__transfer-row ne-settings-panel__transfer-row--folder"
                                        data-action="toggle-note-export-folder"
                                        data-folder-id="${escapeHtml(section.id)}"
                                    >
                                        <input
                                            type="checkbox"
                                            ${section.selected ? 'checked' : ''}
                                        />
                                        <span class="ne-settings-panel__transfer-text">${escapeHtml(section.name)}</span>
                                        <span class="ne-settings-panel__transfer-meta">${escapeHtml(t('settings.transfer.folderMeta', { count: section.noteCount }))}</span>
                                    </label>
                                    <div class="ne-settings-panel__transfer-children">
                                        ${section.notes.map((note) => `
                                            <label
                                                class="ne-settings-panel__transfer-row"
                                                data-action="toggle-note-export-note"
                                                data-note-id="${escapeHtml(note.id)}"
                                            >
                                                <input
                                                    type="checkbox"
                                                    ${note.selected ? 'checked' : ''}
                                                />
                                                <span class="ne-settings-panel__transfer-text">${escapeHtml(note.title)}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                            ${unfiledNotes.length ? `
                                <div class="ne-settings-panel__transfer-group">
                                    <p class="ne-settings-panel__subsection-label">${escapeHtml(t('notes.section.unfiled'))}</p>
                                    <div class="ne-settings-panel__transfer-children">
                                        ${unfiledNotes.map((note) => `
                                            <label
                                                class="ne-settings-panel__transfer-row"
                                                data-action="toggle-note-export-note"
                                                data-note-id="${escapeHtml(note.id)}"
                                            >
                                                <input
                                                    type="checkbox"
                                                    ${note.selected ? 'checked' : ''}
                                                />
                                                <span class="ne-settings-panel__transfer-text">${escapeHtml(note.title)}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.empty'))}</p>
                    `}
                    <button
                        class="ne-btn ne-btn--soft ne-settings-panel__export-button"
                        type="button"
                        data-action="export-selected-notes"
                        ${effectiveExportCount === 0 ? 'disabled' : ''}
                    >
                        ${escapeHtml(t('settings.transfer.exportSelected', { count: effectiveExportCount }))}
                    </button>
                ` : `
                    <button
                        class="ne-btn ne-btn--soft ne-settings-panel__export-button"
                        type="button"
                        data-action="open-note-export-picker"
                        ${!hasNotes ? 'disabled' : ''}
                    >
                        ${escapeHtml(t('settings.transfer.openExportPicker'))}
                    </button>
                    ${!hasNotes ? `<p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.empty'))}</p>` : ''}
                `}
            </section>
        </div>
    `;
}
