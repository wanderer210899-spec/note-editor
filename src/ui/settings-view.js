// src/ui/settings-view.js
// Responsible for: rendering the plugin settings panel inside the sidebar body.

import { escapeHtml } from '../util.js';
import { t } from '../i18n/index.js';

export function renderSettingsPanel(settingsState, transferModel = {}, settingsUiState = {}) {
    const {
        language = 'en',
        defaultSource = 'note',
        newEntryExcludeRecursion = false,
        newEntryPreventRecursion = false,
        showLorebookEntryCounters = true,
        panelFontScale = 1,
        transferOverwriteExisting = false,
        integrations = {},
    } = settingsState ?? {};
    const {
        activeShortcutCaptureField = '',
        activeShortcutCaptureValue = null,
        openSettingsSection = '',
    } = settingsUiState ?? {};
    const {
        wandMenu = {},
        desktopShortcuts = {},
        worldInfoButton = {},
        quickReply = {},
    } = integrations;
    const fontScalePercent = Math.round(Number(panelFontScale) * 100);

    return `
        <div class="ne-settings-panel">
            <div class="ne-lorebook-picker__header">
                <p class="ne-lorebook-picker__title">${escapeHtml(t('settings.title'))}</p>
            </div>

            ${renderSettingsSection({
                key: 'ui-display',
                title: t('settings.section.uiDisplay'),
                isOpen: openSettingsSection === 'ui-display',
                body: `
                    <div class="ne-settings-panel__group">
                        <div class="ne-settings-panel__section-head">
                            <label class="ne-settings-panel__range-label" for="ne-settings-font-scale">
                                <span>${escapeHtml(t('settings.appearance.fontScale'))}</span>
                                <strong data-settings-preview-value="panelFontScale">${escapeHtml(t('settings.appearance.fontScaleValue', { percent: fontScalePercent }))}</strong>
                            </label>
                            <button
                                class="ne-btn ne-btn--soft ne-settings-panel__reset"
                                type="button"
                                data-action="reset-panel-font-scale"
                            >
                                ${escapeHtml(t('settings.appearance.reset'))}
                            </button>
                        </div>
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
                    </div>
                    <label class="ne-settings-panel__field">
                        <span class="ne-settings-panel__field-label">${escapeHtml(t('settings.section.language'))}</span>
                        <select class="ne-input" data-settings-field="language">
                            <option value="en"${language === 'en' ? ' selected' : ''}>${escapeHtml(t('settings.language.en'))}</option>
                            <option value="zh"${language === 'zh' ? ' selected' : ''}>${escapeHtml(t('settings.language.zh'))}</option>
                        </select>
                    </label>
                    <label class="ne-settings-panel__field">
                        <span class="ne-settings-panel__field-label">${escapeHtml(t('settings.section.defaultSource'))}</span>
                        <select class="ne-input" data-settings-field="defaultSource">
                            <option value="note"${defaultSource === 'note' ? ' selected' : ''}>${escapeHtml(t('settings.source.note'))}</option>
                            <option value="lorebook"${defaultSource === 'lorebook' ? ' selected' : ''}>${escapeHtml(t('settings.source.lorebook'))}</option>
                        </select>
                    </label>
                    <label class="ne-settings-panel__checkbox-row">
                        <input
                            type="checkbox"
                            data-settings-field="showLorebookEntryCounters"
                            ${showLorebookEntryCounters ? 'checked' : ''}
                        />
                        <span>${escapeHtml(t('settings.lorebook.showEntryCounters'))}</span>
                    </label>
                `,
            })}

            ${renderSettingsSection({
                key: 'functionality',
                title: t('settings.section.functionality'),
                isOpen: openSettingsSection === 'functionality',
                body: `
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
                `,
            })}

            ${renderSettingsSection({
                key: 'opening',
                title: t('settings.section.opening'),
                isOpen: openSettingsSection === 'opening',
                body: renderIntegrationsSection({
                    wandMenu,
                    desktopShortcuts,
                    worldInfoButton,
                    quickReply,
                    activeShortcutCaptureField,
                    activeShortcutCaptureValue,
                }),
            })}

            ${renderSettingsSection({
                key: 'import-export',
                title: t('settings.section.transfer'),
                isOpen: openSettingsSection === 'import-export',
                body: renderTransferSection(transferModel, transferOverwriteExisting),
            })}
        </div>
    `;
}

function renderSettingsSection({ key = '', title = '', body = '', isOpen = false } = {}) {
    return `
        <section class="ne-settings-panel__section${isOpen ? ' ne-settings-panel__section--open' : ''}">
            <button
                class="ne-settings-panel__section-toggle"
                type="button"
                data-action="toggle-settings-section"
                data-settings-section="${escapeHtml(key)}"
                aria-expanded="${isOpen ? 'true' : 'false'}"
            >
                <span class="ne-settings-panel__section-label">${escapeHtml(title)}</span>
            </button>
            ${isOpen ? `<div class="ne-settings-panel__section-body">${body}</div>` : ''}
        </section>
    `;
}

function renderIntegrationsSection({
    wandMenu = {},
    desktopShortcuts = {},
    worldInfoButton = {},
    quickReply = {},
    activeShortcutCaptureField = '',
    activeShortcutCaptureValue = null,
} = {}) {
    return `
        <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.integrations.hint'))}</p>

        <div class="ne-settings-panel__group">
            <label class="ne-settings-panel__checkbox-row">
                <input
                    type="checkbox"
                    data-settings-field="integrationWandMenuEnabled"
                    ${wandMenu.enabled !== false ? 'checked' : ''}
                />
                <span>${escapeHtml(t('settings.integrations.wandMenu'))}</span>
            </label>
            <p class="ne-sidebar-panel__support ne-helper-text">${escapeHtml(t('settings.integrations.slashCommands'))}</p>
            <label class="ne-settings-panel__checkbox-row">
                <input
                    type="checkbox"
                    data-settings-field="integrationWorldInfoButtonEnabled"
                    ${worldInfoButton.enabled !== false ? 'checked' : ''}
                />
                <span>${escapeHtml(t('settings.integrations.worldInfoButton'))}</span>
            </label>
        </div>

        <div class="ne-settings-panel__group">
            <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.integrations.shortcuts.title'))}</p>
            <label class="ne-settings-panel__checkbox-row">
                <input
                    type="checkbox"
                    data-settings-field="integrationDesktopShortcutsEnabled"
                    ${desktopShortcuts.enabled ? 'checked' : ''}
                />
                <span>${escapeHtml(t('settings.integrations.shortcuts.enabled'))}</span>
            </label>
            <div class="ne-settings-panel__field-grid">
                ${renderShortcutCaptureField({
                    field: 'integrationDesktopShortcutOpenNotes',
                    captureField: 'openNotes',
                    label: t('settings.integrations.shortcuts.openNotes'),
                    value: desktopShortcuts.openNotes,
                    placeholder: t('settings.integrations.shortcuts.placeholder.notes'),
                    isActive: activeShortcutCaptureField === 'openNotes',
                    draftValue: activeShortcutCaptureField === 'openNotes' ? activeShortcutCaptureValue : null,
                })}
                ${renderShortcutCaptureField({
                    field: 'integrationDesktopShortcutOpenLorebook',
                    captureField: 'openLorebook',
                    label: t('settings.integrations.shortcuts.openLorebook'),
                    value: desktopShortcuts.openLorebook,
                    placeholder: t('settings.integrations.shortcuts.placeholder.lorebook'),
                    isActive: activeShortcutCaptureField === 'openLorebook',
                    draftValue: activeShortcutCaptureField === 'openLorebook' ? activeShortcutCaptureValue : null,
                })}
                ${renderShortcutCaptureField({
                    field: 'integrationDesktopShortcutCreateCurrent',
                    captureField: 'createCurrent',
                    label: t('settings.integrations.shortcuts.createCurrent'),
                    value: desktopShortcuts.createCurrent,
                    placeholder: t('settings.integrations.shortcuts.placeholder.createCurrent'),
                    isActive: activeShortcutCaptureField === 'createCurrent',
                    draftValue: activeShortcutCaptureField === 'createCurrent' ? activeShortcutCaptureValue : null,
                })}
            </div>
        </div>

        <div class="ne-settings-panel__group">
            <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.integrations.quickReply.title'))}</p>
            <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.integrations.quickReply.hint'))}</p>
            <label class="ne-settings-panel__checkbox-row">
                <input
                    type="checkbox"
                    data-settings-field="integrationQuickReplyEnabled"
                    ${quickReply.enabled ? 'checked' : ''}
                />
                <span>${escapeHtml(t('settings.integrations.quickReply.enabled'))}</span>
            </label>
            <div class="ne-settings-panel__group ne-settings-panel__group--tight">
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="integrationQuickReplyIncludeNotes"
                        ${quickReply.includeNotes !== false ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.integrations.quickReply.includeNotebook'))}</span>
                </label>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="integrationQuickReplyIncludeLore"
                        ${quickReply.includeLore !== false ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.integrations.quickReply.includeLorebook'))}</span>
                </label>
                <label class="ne-settings-panel__checkbox-row">
                    <input
                        type="checkbox"
                        data-settings-field="integrationQuickReplyIncludeNew"
                        ${quickReply.includeNew !== false ? 'checked' : ''}
                    />
                    <span>${escapeHtml(t('settings.integrations.quickReply.includeNew'))}</span>
                </label>
            </div>
        </div>
    `;
}

function renderShortcutCaptureField({
    field = '',
    captureField = '',
    label = '',
    value = '',
    placeholder = '',
    isActive = false,
    draftValue = null,
} = {}) {
    const normalizedValue = String(value ?? '');
    const hasDraftValue = isActive && draftValue !== null;
    const displayValue = isActive
        ? (hasDraftValue ? String(draftValue ?? '') : '')
        : normalizedValue;
    const displayPlaceholder = isActive
        ? (hasDraftValue && String(draftValue ?? '') === ''
            ? t('settings.integrations.shortcuts.pendingClear')
            : t('settings.integrations.shortcuts.listening'))
        : placeholder;

    return `
        <label class="ne-settings-panel__field">
            <span class="ne-settings-panel__field-label">${escapeHtml(label)}</span>
            <div class="ne-settings-panel__shortcut-wrap${isActive ? ' ne-settings-panel__shortcut-wrap--active' : ''}">
                <input
                    class="ne-input ne-settings-panel__shortcut-input"
                    type="text"
                    data-settings-field="${escapeHtml(field)}"
                    data-shortcut-capture-field="${escapeHtml(captureField)}"
                    data-sidebar-input-key="settings-shortcut:${escapeHtml(captureField)}"
                    value="${escapeHtml(displayValue)}"
                    placeholder="${escapeHtml(displayPlaceholder)}"
                    spellcheck="false"
                    readonly
                />
                <div class="ne-settings-panel__shortcut-actions">
                    ${isActive ? `
                        <button
                            class="ne-btn ne-btn--soft ne-settings-panel__shortcut-btn"
                            type="button"
                            data-action="stop-shortcut-capture"
                            data-shortcut-capture-field="${escapeHtml(captureField)}"
                            aria-label="${escapeHtml(t('settings.integrations.shortcuts.stopCapture'))}"
                            title="${escapeHtml(t('settings.integrations.shortcuts.stopCapture'))}"
                        >
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                    ` : `
                        <button
                            class="ne-btn ne-btn--soft ne-settings-panel__shortcut-btn"
                            type="button"
                            data-action="start-shortcut-capture"
                            data-shortcut-capture-field="${escapeHtml(captureField)}"
                            aria-label="${escapeHtml(t('settings.integrations.shortcuts.capture'))}"
                            title="${escapeHtml(t('settings.integrations.shortcuts.capture'))}"
                        >
                            <i class="fa-solid fa-keyboard" aria-hidden="true"></i>
                        </button>
                    `}
                </div>
            </div>
        </label>
    `;
}

function renderTransferSection(transferModel = {}, transferOverwriteExisting = false) {
    return `
        <label class="ne-settings-panel__checkbox-row">
            <input
                type="checkbox"
                data-settings-field="transferOverwriteExisting"
                ${transferOverwriteExisting ? 'checked' : ''}
            />
            <span>${escapeHtml(t('settings.transfer.overwriteExisting'))}</span>
        </label>
        ${transferModel?.source === 'lorebook'
            ? renderLorebookTransferControls(transferModel)
            : renderNoteTransferControls(transferModel)}
    `;
}

function renderNoteTransferControls(transferModel = {}) {
    const {
        hasNotes = false,
        selectedFolderCount = 0,
        selectedNoteCount = 0,
        effectiveExportCount = 0,
        folderSections = [],
        unfiledNotes = [],
        exportPickerOpen = false,
        exportFormat = 'md',
    } = transferModel ?? {};

    return `
        <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.notes.importTitle'))}</p>
        <div class="ne-settings-panel__transfer-actions">
            <button class="ne-btn ne-btn--soft" type="button" data-action="import-note-files">
                ${escapeHtml(t('settings.transfer.notes.importFiles'))}
            </button>
            <button class="ne-btn ne-btn--soft" type="button" data-action="import-note-folder">
                ${escapeHtml(t('settings.transfer.notes.importFolder'))}
            </button>
        </div>
        <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.transfer.notes.importHint'))}</p>
        <div class="ne-settings-panel__section-head">
            <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.notes.exportTitle'))}</p>
            <span class="ne-settings-panel__section-meta">${escapeHtml(t('settings.transfer.notes.selectionSummary', { folders: selectedFolderCount, notes: selectedNoteCount, files: effectiveExportCount }))}</span>
        </div>
        ${renderExportFormatSelector({
            exportFormat,
            actionPrefix: 'set-note-export-format',
        })}
        ${exportPickerOpen ? renderNoteExportPicker({ hasNotes, folderSections, unfiledNotes, effectiveExportCount }) : `
            <button
                class="ne-btn ne-btn--soft ne-settings-panel__export-button"
                type="button"
                data-action="open-note-export-picker"
                ${!hasNotes ? 'disabled' : ''}
            >
                ${escapeHtml(t('settings.transfer.notes.openExportPicker'))}
            </button>
            ${!hasNotes ? `<p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.notes.empty'))}</p>` : ''}
        `}
    `;
}

function renderNoteExportPicker({
    hasNotes = false,
    folderSections = [],
    unfiledNotes = [],
    effectiveExportCount = 0,
} = {}) {
    return `
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
                        <label class="ne-settings-panel__transfer-row ne-settings-panel__transfer-row--folder" data-action="toggle-note-export-folder" data-folder-id="${escapeHtml(section.id)}">
                            <input type="checkbox" ${section.selected ? 'checked' : ''} />
                            <span class="ne-settings-panel__transfer-text">${escapeHtml(section.name)}</span>
                            <span class="ne-settings-panel__transfer-meta">${escapeHtml(t('settings.transfer.folderMeta', { count: section.noteCount }))}</span>
                        </label>
                        <div class="ne-settings-panel__transfer-children">
                            ${section.notes.map((note) => `
                                <label class="ne-settings-panel__transfer-row" data-action="toggle-note-export-note" data-note-id="${escapeHtml(note.id)}">
                                    <input type="checkbox" ${note.selected ? 'checked' : ''} />
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
                                <label class="ne-settings-panel__transfer-row" data-action="toggle-note-export-note" data-note-id="${escapeHtml(note.id)}">
                                    <input type="checkbox" ${note.selected ? 'checked' : ''} />
                                    <span class="ne-settings-panel__transfer-text">${escapeHtml(note.title)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : `
            <p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.notes.empty'))}</p>
        `}
        <button class="ne-btn ne-btn--soft ne-settings-panel__export-button" type="button" data-action="export-selected-notes" ${effectiveExportCount === 0 ? 'disabled' : ''}>
            ${escapeHtml(t('settings.transfer.exportSelected', { count: effectiveExportCount }))}
        </button>
    `;
}

function renderLorebookTransferControls(transferModel = {}) {
    const {
        hasEntries = false,
        activeLorebookId = '',
        activeLorebookName = '',
        activeLorebookEntryCount = 0,
        selectedLorebookCount = 0,
        selectedEntryCount = 0,
        effectiveExportCount = 0,
        lorebookSections = [],
        exportOptionsOpen = false,
        exportPickerOpen = false,
        exportFormat = 'md',
    } = transferModel ?? {};
    const hasActiveLorebook = Boolean(String(activeLorebookId || activeLorebookName).trim());

    return `
        <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.lorebook.importTitle'))}</p>
        <div class="ne-settings-panel__transfer-actions">
            <button class="ne-btn ne-btn--soft" type="button" data-action="import-lorebook-files">
                ${escapeHtml(t('settings.transfer.lorebook.importFiles'))}
            </button>
            <button class="ne-btn ne-btn--soft" type="button" data-action="import-lorebook-folder">
                ${escapeHtml(t('settings.transfer.lorebook.importFolder'))}
            </button>
        </div>
        <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.transfer.lorebook.importHint'))}</p>
        <div class="ne-settings-panel__section-head">
            <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.lorebook.exportTitle'))}</p>
            <span class="ne-settings-panel__section-meta">${escapeHtml(t('settings.transfer.lorebook.selectionSummary', { lorebooks: selectedLorebookCount, entries: selectedEntryCount, files: effectiveExportCount }))}</span>
        </div>
        ${renderExportFormatSelector({
            exportFormat,
            actionPrefix: 'set-lorebook-export-format',
        })}
        ${exportOptionsOpen ? `
            <div class="ne-settings-panel__mini-actions">
                <button
                    class="ne-btn ne-btn--soft ne-settings-panel__mini-button"
                    type="button"
                    data-action="export-active-lorebook"
                    ${!hasActiveLorebook ? 'disabled' : ''}
                >
                    ${escapeHtml(t('settings.transfer.lorebook.exportActive', {
                        name: activeLorebookName || t('settings.transfer.lorebook.current'),
                        count: activeLorebookEntryCount,
                    }))}
                </button>
                <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="open-lorebook-export-picker" ${!hasEntries ? 'disabled' : ''}>
                    ${escapeHtml(t('settings.transfer.lorebook.openExportPicker'))}
                </button>
                <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="close-lorebook-export-options">
                    ${escapeHtml(t('settings.transfer.lorebook.hideExportOptions'))}
                </button>
            </div>
            <p class="ne-settings-panel__transfer-hint">${escapeHtml(t('settings.transfer.lorebook.exportHint'))}</p>
            ${exportPickerOpen ? renderLorebookExportPicker({ hasEntries, lorebookSections, effectiveExportCount }) : ''}
            ${!hasEntries ? `<p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.lorebook.empty'))}</p>` : ''}
        ` : `
            <button class="ne-btn ne-btn--soft ne-settings-panel__export-button" type="button" data-action="open-lorebook-export-options" ${!hasActiveLorebook && !hasEntries ? 'disabled' : ''}>
                ${escapeHtml(t('settings.transfer.lorebook.openExportOptions'))}
            </button>
            ${!hasEntries ? `<p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.lorebook.empty'))}</p>` : ''}
        `}
    `;
}

function renderLorebookExportPicker({
    hasEntries = false,
    lorebookSections = [],
    effectiveExportCount = 0,
} = {}) {
    return `
        <div class="ne-settings-panel__mini-actions">
            <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="select-all-lorebook-exports">
                ${escapeHtml(t('settings.transfer.selectAll'))}
            </button>
            <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="clear-lorebook-exports">
                ${escapeHtml(t('settings.transfer.clearSelection'))}
            </button>
            <button class="ne-btn ne-btn--soft ne-settings-panel__mini-button" type="button" data-action="close-lorebook-export-picker">
                ${escapeHtml(t('settings.transfer.hideExportPicker'))}
            </button>
        </div>
        ${hasEntries ? `
            <div class="ne-settings-panel__transfer-list">
                ${lorebookSections.map((section) => `
                    <div class="ne-settings-panel__transfer-group">
                        <label class="ne-settings-panel__transfer-row ne-settings-panel__transfer-row--folder" data-action="toggle-lorebook-export-lorebook" data-lorebook-id="${escapeHtml(section.id)}">
                            <input type="checkbox" ${section.selected ? 'checked' : ''} />
                            <span class="ne-settings-panel__transfer-text">${escapeHtml(section.name)}</span>
                            <span class="ne-settings-panel__transfer-meta">${escapeHtml(t('settings.transfer.lorebook.lorebookMeta', { count: section.entryCount }))}</span>
                        </label>
                        <div class="ne-settings-panel__transfer-children">
                            ${section.entries.map((entry) => `
                                <label class="ne-settings-panel__transfer-row" data-action="toggle-lorebook-export-entry" data-entry-key="${escapeHtml(`${encodeURIComponent(section.id)}:${encodeURIComponent(entry.id)}`)}">
                                    <input type="checkbox" ${entry.selected || section.selected ? 'checked' : ''} />
                                    <span class="ne-settings-panel__transfer-text">${escapeHtml(entry.title)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : `
            <p class="ne-settings-panel__empty">${escapeHtml(t('settings.transfer.lorebook.empty'))}</p>
        `}
        <button class="ne-btn ne-btn--soft ne-settings-panel__export-button" type="button" data-action="export-selected-lorebook-entries" ${effectiveExportCount === 0 ? 'disabled' : ''}>
            ${escapeHtml(t('settings.transfer.exportSelected', { count: effectiveExportCount }))}
        </button>
    `;
}

function renderExportFormatSelector({ exportFormat = 'md', actionPrefix = '' } = {}) {
    return `
        <div class="ne-settings-panel__section-head">
            <p class="ne-settings-panel__subsection-label">${escapeHtml(t('settings.transfer.exportFormat'))}</p>
        </div>
        <div class="ne-settings-panel__mini-actions">
            <button
                class="ne-btn ne-btn--soft ne-settings-panel__mini-button ${exportFormat === 'md' ? 'ne-btn--active' : ''}"
                type="button"
                data-action="${escapeHtml(actionPrefix)}"
                data-export-format="md"
                aria-pressed="${exportFormat === 'md' ? 'true' : 'false'}"
            >
                ${escapeHtml(t('settings.transfer.format.md'))}
            </button>
            <button
                class="ne-btn ne-btn--soft ne-settings-panel__mini-button ${exportFormat === 'txt' ? 'ne-btn--active' : ''}"
                type="button"
                data-action="${escapeHtml(actionPrefix)}"
                data-export-format="txt"
                aria-pressed="${exportFormat === 'txt' ? 'true' : 'false'}"
            >
                ${escapeHtml(t('settings.transfer.format.txt'))}
            </button>
        </div>
    `;
}
