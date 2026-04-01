// src/ui/sidebar-view.js
// Responsible for: rendering sidebar organization from a prepared sidebar view-model.

import { normaliseDocumentSource } from '../document-source.js';
import { getDisplayTitle } from '../editor-shell.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '../util.js';
import { renderSettingsPanel } from './settings-view.js';

export function renderSidebarShell({ source = 'note', noteBulkSelectMode = false } = {}) {
    const normalizedSource = normaliseDocumentSource(source);
    const isNoteSource = normalizedSource === 'note';
    const createLabel = isNoteSource ? t('sidebar.btn.newNote') : t('sidebar.btn.newLoreEntry');
    const closeBtnLabel = isNoteSource ? t('sidebar.btn.closeNotes') : t('sidebar.btn.closeLorebook');
    const createIcon = isNoteSource ? 'fa-note-sticky' : 'fa-book';
    const settingsLabel = t('sidebar.btn.settings');
    const selectActiveClass = noteBulkSelectMode ? ' ne-btn--active' : '';

    return `
        <div class="ne-sidebar__topbar">
            <div class="ne-sidebar__topbar-actions">
                <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="new-document" aria-label="${escapeHtml(createLabel)}" title="${escapeHtml(createLabel)}">
                    <i class="fa-solid ${escapeHtml(createIcon)}"></i>
                </button>
                ${isNoteSource ? `
                    <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="new-folder" aria-label="${escapeHtml(t('sidebar.btn.newFolder'))}" title="${escapeHtml(t('sidebar.btn.newFolder'))}">
                        <i class="fa-solid fa-folder-plus"></i>
                    </button>
                    <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="toggle-filters" aria-label="${escapeHtml(t('sidebar.btn.toggleFilters'))}" title="${escapeHtml(t('sidebar.btn.toggleFilters'))}">
                        <i class="fa-solid fa-filter"></i>
                    </button>
                    <button class="ne-btn ne-btn--soft ne-btn--icon${selectActiveClass}" type="button" data-action="toggle-note-bulk-select-mode" aria-label="${escapeHtml(t('notes.bulk.select'))}" title="${escapeHtml(t('notes.bulk.select'))}">
                        <i class="fa-solid fa-list-check"></i>
                    </button>
                ` : `
                    <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="refresh-lorebook-workspace" aria-label="${escapeHtml(t('sidebar.btn.refreshLorebooks'))}" title="${escapeHtml(t('sidebar.btn.refreshLorebooks'))}">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                    <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="open-add-workspace-lorebook-picker" aria-label="${escapeHtml(t('sidebar.btn.addLorebook'))}" title="${escapeHtml(t('sidebar.btn.addLorebook'))}">
                        <i class="fa-solid fa-folder-plus"></i>
                    </button>
                    <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="toggle-filters" aria-label="${escapeHtml(t('sidebar.btn.toggleFilters'))}" title="${escapeHtml(t('sidebar.btn.toggleFilters'))}">
                        <i class="fa-solid fa-filter"></i>
                    </button>
                    <button class="ne-btn ne-btn--soft ne-btn--icon ne-btn--danger" type="button" data-action="open-delete-panel" aria-label="${escapeHtml(t('sidebar.btn.deleteLorebook'))}" title="${escapeHtml(t('sidebar.btn.deleteLorebook'))}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `}
            </div>
            <div class="ne-sidebar__topbar-actions">
                <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="open-settings-panel" aria-label="${escapeHtml(settingsLabel)}" title="${escapeHtml(settingsLabel)}">
                    <i class="fa-solid fa-gear"></i>
                </button>
                <button class="ne-btn ne-btn--soft ne-btn--icon" type="button" data-action="close-sidebar" aria-label="${escapeHtml(closeBtnLabel)}" title="${escapeHtml(closeBtnLabel)}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="ne-sidebar__tools" data-sidebar-region="tools" hidden></div>
        <div class="ne-sidebar__body" data-sidebar-region="body"></div>
    `;
}

export function renderSidebarToolsShell({ source = 'note', searchPlaceholder = '' } = {}) {
    const normalizedSource = normaliseDocumentSource(source);
    const isNoteSource = normalizedSource === 'note';
    const inputLabel = isNoteSource ? t('search.label.notes') : t('search.label.lorebook');
    const placeholder = searchPlaceholder || (isNoteSource ? t('search.placeholder.notes') : t('search.placeholder.lorebook'));
    const suggestionLabel = isNoteSource ? t('search.suggestions.notes') : t('search.suggestions.lorebook');

    return `
        <div class="ne-sidebar__search" data-sidebar-region="search">
            <label class="ne-visually-hidden" for="ne-note-search">${escapeHtml(inputLabel)}</label>
            <input
                id="ne-note-search"
                class="ne-input"
                type="text"
                placeholder="${escapeHtml(placeholder)}"
                autocomplete="off"
                spellcheck="false"
                aria-autocomplete="none"
                aria-expanded="false"
                data-sidebar-input-key="sidebar-search"
            />
            <div
                class="ne-sidebar__tag-suggestions"
                id="ne-search-tag-suggestions"
                data-sidebar-region="suggestions"
                role="listbox"
                aria-label="${escapeHtml(suggestionLabel)}"
                hidden
            ></div>
        </div>
        <div class="ne-sidebar__filters" data-sidebar-region="filters" hidden></div>
    `;
}

export function renderSidebarTagSuggestions(model) {
    return model.tagSuggestions
        .map((tag, index) => `
            <button
                class="ne-sidebar__tag-suggestion${index === model.activeTagSuggestionIndex ? ' ne-sidebar__tag-suggestion--active' : ''}"
                type="button"
                role="option"
                aria-selected="${index === model.activeTagSuggestionIndex ? 'true' : 'false'}"
                data-action="apply-search-tag-suggestion"
                data-tag="${escapeHtml(tag)}"
                data-index="${index}"
            >
                <span class="ne-sidebar__tag-suggestion-hash">#</span>${escapeHtml(tag)}
            </button>
        `)
        .join('');
}

export function renderSidebarFilters(model) {
    if (!model.activeTag) {
        return '';
    }

    return `
        <button class="ne-sidebar__filter-chip" type="button" data-action="clear-tag-filter" title="${escapeHtml(t('search.filter.clear'))}">
            #${escapeHtml(model.activeTag)}
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
}

export function renderSidebarBody(model, source = 'note') {
    if (model.settingsPanelOpen) {
        return renderSettingsPanel(model.settingsState, model.noteTransferModel);
    }

    const normalizedSource = normaliseDocumentSource(source);
    return normalizedSource === 'lorebook'
        ? renderLorebookSidebarBody(model)
        : renderNotesSidebarBody(model, source);
}

function renderNotesSidebarBody(model, source) {
    const sectionsMarkup = model.sections.map((section) => renderNoteSection(section, model, source)).join('');
    const emptyMarkup = model.hasAnyNotes
        ? `
            <div class="ne-sidebar__empty">
                <p>${escapeHtml(t('notes.empty.noMatch'))}</p>
            </div>
        `
        : `
            <div class="ne-sidebar__empty">
                <p>${escapeHtml(t('notes.empty.none'))}</p>
                <button class="ne-btn ne-btn--soft" type="button" data-action="new-note">${escapeHtml(t('notes.empty.create'))}</button>
            </div>
        `;

    const body = sectionsMarkup || emptyMarkup;

    if (!model.noteBulkSelectMode) {
        return body;
    }

    const totalSelected = (model.bulkSelectedNoteIds?.size ?? 0) + (model.bulkSelectedFolderIds?.size ?? 0);
    const deleteLabel = totalSelected === 0
        ? t('notes.bulk.delete.none')
        : totalSelected === 1
            ? t('notes.bulk.delete.one')
            : t('notes.bulk.delete.many', { count: totalSelected });

    return `
        ${body}
        <div class="ne-bulk-delete-bar">
            <button class="ne-btn ne-btn--soft" type="button" data-action="toggle-note-bulk-select-mode">
                ${escapeHtml(t('notes.bulk.cancel'))}
            </button>
            <button class="ne-btn ne-btn--danger" type="button" data-action="bulk-delete-notes-and-folders"${totalSelected === 0 ? ' disabled' : ''}>
                ${escapeHtml(deleteLabel)}
            </button>
        </div>
    `;
}

function renderNoteSection(section, model, source) {
    const subfoldersMarkup = (section.subfolders ?? [])
        .map((sub) => renderNoteSection(sub, model, source))
        .join('');
    const notesMarkup = section.notes.length
        ? section.notes.map((note) => renderNoteRow(note, section, model, source)).join('')
        : (subfoldersMarkup ? '' : `<p class="ne-sidebar__section-empty">${escapeHtml(t('notes.section.empty'))}</p>`);

    const depthStyle = section.depth > 0 ? ` style="--ne-section-depth:${section.depth}"` : '';

    return `
        <section class="ne-sidebar__section" data-folder-id="${escapeHtml(section.folderId ?? '')}"${depthStyle}>
            ${renderNoteSectionHeader(section, model)}
            ${section.isCollapsed ? '' : `<div class="ne-note-list">${subfoldersMarkup}${notesMarkup}</div>`}
        </section>
    `;
}

function renderNoteSectionHeader(section, model) {
    if (section.isUnfiled) {
        return `
            <header class="ne-sidebar__section-header">
                <h3 class="ne-sidebar__section-title">${escapeHtml(t('notes.section.unfiled'))}</h3>
            </header>
        `;
    }

    const rowKey = `folder:${section.folderId}`;
    const revealedClass = model.revealedRowKey === rowKey ? ' ne-swipe-row--revealed' : '';
    const expandedClass = section.isCollapsed ? '' : ' ne-folder-row--expanded';

    if (model.noteBulkSelectMode) {
        const isChecked = model.bulkSelectedFolderIds?.has(section.folderId) ?? false;
        return `
            <header class="ne-sidebar__section-header ne-folder-row ne-bulk-row${expandedClass}" data-action="toggle-bulk-folder-select" data-folder-id="${escapeHtml(section.folderId)}" role="checkbox" aria-checked="${isChecked ? 'true' : 'false'}">
                <i class="fa-${isChecked ? 'solid fa-square-check' : 'regular fa-square'} ne-bulk-row__check"></i>
                <h3 class="ne-sidebar__section-title">${escapeHtml(section.title)}</h3>
            </header>
        `;
    }

    return `
        <header class="ne-sidebar__section-header ne-folder-row ne-reveal-actions-row${revealedClass}${expandedClass}" data-swipe-row-key="${escapeHtml(rowKey)}">
            <div class="ne-folder-row__main"
                    data-swipe-handle="true"
                    data-action="toggle-note-folder-collapse"
                    data-folder-id="${escapeHtml(section.folderId)}">
                <h3 class="ne-sidebar__section-title">${escapeHtml(section.title)}</h3>
            </div>
            ${renderActionGroup(t('notes.folder.actions'), `
                ${renderIconActionButton('new-note-in-folder', 'fa-note-sticky', t('notes.folder.newNote'), { folderId: section.folderId })}
                ${renderIconActionButton('new-subfolder', 'fa-folder-plus', t('notes.folder.newSub'), { folderId: section.folderId })}
                ${renderIconActionButton('rename-folder-row', 'fa-pen', t('notes.folder.rename'), { folderId: section.folderId })}
                ${renderIconActionButton('delete-folder-row', 'fa-trash', t('notes.folder.delete'), { folderId: section.folderId, tone: 'danger' })}
            `)}
        </header>
    `;
}

function renderNoteRow(note, section, model, source) {
    const rowKey = `note:${note.id}`;
    const activeClass = note.id === model.currentNoteId ? ' ne-note-row--active' : '';
    const excerpt = getNoteExcerpt(note.content);

    if (model.noteBulkSelectMode) {
        const isChecked = model.bulkSelectedNoteIds?.has(note.id) ?? false;
        return `
            <article class="ne-note-row ne-bulk-row${activeClass}" data-action="toggle-bulk-note-select" data-note-id="${escapeHtml(note.id)}" role="checkbox" aria-checked="${isChecked ? 'true' : 'false'}">
                <i class="fa-${isChecked ? 'solid fa-square-check' : 'regular fa-square'} ne-bulk-row__check"></i>
                <span class="ne-note-row__title-line">
                    <span class="ne-note-row__title">${escapeHtml(getDisplayTitle(note.title, source))}</span>
                    ${note.pinned ? `<span class="ne-note-row__pin" aria-label="${escapeHtml(t('notes.row.pinned'))}" title="${escapeHtml(t('notes.row.pinned'))}"><i class="fa-solid fa-thumbtack"></i></span>` : ''}
                </span>
            </article>
        `;
    }

    const revealedClass = model.revealedRowKey === rowKey ? ' ne-swipe-row--revealed' : '';
    const moveMenuOpen = note.id === model.moveMenuNoteId;

    return `
        <article class="ne-note-row${activeClass}${revealedClass}" data-swipe-row-key="${escapeHtml(rowKey)}">
            <button class="ne-note-row__main" type="button" data-swipe-handle="true" data-document-id="${escapeHtml(note.id)}" data-note-id="${escapeHtml(note.id)}">
                <span class="ne-note-row__title-line">
                    <span class="ne-note-row__title">${escapeHtml(getDisplayTitle(note.title, source))}</span>
                    ${note.pinned ? `<span class="ne-note-row__pin" aria-label="${escapeHtml(t('notes.row.pinned'))}" title="${escapeHtml(t('notes.row.pinned'))}"><i class="fa-solid fa-thumbtack"></i></span>` : ''}
                </span>
                ${excerpt ? `<span class="ne-note-row__excerpt">${escapeHtml(excerpt)}</span>` : ''}
            </button>

            <div class="ne-row-actions" aria-label="${escapeHtml(t('notes.row.actions'))}">
                ${renderIconActionButton('toggle-note-pin', 'fa-thumbtack', note.pinned ? t('notes.row.unpin') : t('notes.row.pin'), { noteId: note.id })}
                ${renderIconActionButton('toggle-move-menu', 'fa-folder-tree', t('notes.row.move'), { noteId: note.id })}
                ${renderIconActionButton('delete-note-row', 'fa-trash', t('notes.row.delete'), { noteId: note.id, tone: 'danger' })}
            </div>

            ${moveMenuOpen ? renderMoveMenu(note.id, section.folderId, model.folderOptions) : ''}
        </article>
    `;
}

function renderLorebookSidebarBody(model) {
    if (model.deletePanelOpen) {
        return renderDeletePanel(model);
    }

    const createDialogMarkup = model.loreEntryCreationDialog
        ? renderLoreEntryCreationDialog(model.loreEntryCreationDialog)
        : '';
    const pickerMarkup = model.picker?.mode === 'add'
        ? renderLorebookPickerPanel(model.picker)
        : '';
    const lorebookMarkup = (model.workspaceLorebooks ?? []).map((lorebook) => renderLorebookSection(lorebook, model)).join('');
    if (pickerMarkup || lorebookMarkup) {
        return `${pickerMarkup}${lorebookMarkup}${createDialogMarkup}`;
    }

    return `
        <div class="ne-sidebar__empty">
            <p>${escapeHtml(t('lorebook.empty.none'))}</p>
            <button class="ne-btn ne-btn--soft" type="button" data-action="refresh-lorebook-workspace">${escapeHtml(t('lorebook.empty.refresh'))}</button>
        </div>
        ${createDialogMarkup}
    `;
}

function renderDeletePanel(model) {
    const allEntries = (model.workspaceLorebooks ?? [])
        .flatMap((lorebook) => (lorebook.sections ?? [])
            .flatMap((section) => (section.entries ?? [])
                .map((entry) => ({
                    key: `${lorebook.id}:${entry.id}`,
                    title: entry.title || entry.id,
                    lorebookName: lorebook.name,
                    sectionTitle: section.title,
                    colorClass: section.colorClass,
                }))));

    const entryRowsMarkup = allEntries.map((entry) => {
        const checked = model.bulkSelectedEntryKeys.has(entry.key);
        return `
            <label class="ne-delete-panel__entry-row">
                <input type="checkbox" class="ne-delete-panel__checkbox"
                    data-action="toggle-bulk-entry-select"
                    data-entry-key="${escapeHtml(entry.key)}"
                    ${checked ? 'checked' : ''}
                />
                <span class="ne-delete-panel__entry-info">
                    <span class="ne-delete-panel__entry-title">${escapeHtml(entry.title)}</span>
                    <span class="ne-delete-panel__entry-meta">
                        <span class="ne-lore-position-chip ${escapeHtml(entry.colorClass)}" aria-hidden="true"></span>
                        ${escapeHtml(entry.lorebookName)} &rsaquo; ${escapeHtml(entry.sectionTitle)}
                    </span>
                </span>
            </label>
        `;
    }).join('');

    const selectedEntryCount = model.bulkSelectedEntryKeys.size;

    return `
        <div class="ne-delete-panel">
            <div class="ne-lorebook-picker__header">
                <p class="ne-lorebook-picker__title">${escapeHtml(t('delete.title'))}</p>
                <button class="ne-btn ne-btn--soft ne-btn--icon" type="button"
                    data-action="close-delete-panel"
                    aria-label="${escapeHtml(t('delete.close'))}" title="${escapeHtml(t('delete.close'))}"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <section class="ne-delete-panel__section">
                <p class="ne-delete-panel__section-label">${escapeHtml(t('delete.entries.section'))}</p>
                ${allEntries.length > 0 ? `
                    <div class="ne-delete-panel__list">${entryRowsMarkup}</div>
                    <button class="ne-btn ne-btn--danger ne-delete-panel__submit"
                        type="button"
                        data-action="bulk-delete-entries"
                        ${selectedEntryCount === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                        ${selectedEntryCount === 0
                            ? escapeHtml(t('delete.entries.btn.none'))
                            : selectedEntryCount === 1
                                ? escapeHtml(t('delete.entries.btn.one'))
                                : escapeHtml(t('delete.entries.btn.many', { count: selectedEntryCount }))}
                    </button>
                ` : `<p class="ne-lorebook-picker__empty">${escapeHtml(t('delete.entries.empty'))}</p>`}
            </section>

            <hr class="ne-delete-panel__divider" />

            <section class="ne-delete-panel__section">
                <p class="ne-delete-panel__section-label">${escapeHtml(t('delete.files.section'))}</p>
                <p class="ne-delete-panel__warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${escapeHtml(t('delete.files.warning'))}</p>
                <input
                    class="ne-input ne-lorebook-picker__search"
                    type="text"
                    value="${escapeHtml(model.bulkDeleteLorebookSearch ?? '')}"
                    placeholder="${escapeHtml(t('delete.files.searchPlaceholder'))}"
                    autocomplete="off"
                    spellcheck="false"
                    data-delete-panel-lorebook-search="true"
                    data-sidebar-input-key="delete-lorebook-search"
                />
                <div data-delete-panel-region="lorebook-files">
                    ${renderDeletePanelLorebookFiles(model)}
                </div>
            </section>
        </div>
    `;
}

export function renderDeletePanelLorebookFiles(model) {
    const normalizedDeleteSearch = String(model.bulkDeleteLorebookSearch ?? '').trim().toLowerCase();
    const filteredLorebookNames = (model.availableLorebookNames ?? [])
        .filter((name) => !normalizedDeleteSearch || name.toLowerCase().includes(normalizedDeleteSearch));

    const lorebookRowsMarkup = filteredLorebookNames.map((name) => {
        const checked = model.bulkSelectedLorebookNames.has(name);
        return `
            <label class="ne-delete-panel__entry-row">
                <input type="checkbox" class="ne-delete-panel__checkbox"
                    data-action="toggle-bulk-lorebook-select"
                    data-lorebook-name="${escapeHtml(name)}"
                    ${checked ? 'checked' : ''}
                />
                <span class="ne-delete-panel__entry-info">
                    <span class="ne-delete-panel__entry-title">${escapeHtml(name)}</span>
                </span>
            </label>
        `;
    }).join('');

    const selectedLorebookCount = model.bulkSelectedLorebookNames.size;

    return `
        ${filteredLorebookNames.length > 0 ? `
            <div class="ne-delete-panel__list">${lorebookRowsMarkup}</div>
        ` : `<p class="ne-lorebook-picker__empty">${escapeHtml(t('delete.files.noMatch'))}</p>`}
        <button class="ne-btn ne-btn--danger ne-delete-panel__submit"
            type="button"
            data-action="bulk-delete-lorebooks"
            ${selectedLorebookCount === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
            ${selectedLorebookCount === 0
                ? escapeHtml(t('delete.files.btn.none'))
                : selectedLorebookCount === 1
                    ? escapeHtml(t('delete.files.btn.one'))
                    : escapeHtml(t('delete.files.btn.many', { count: selectedLorebookCount }))}
        </button>
    `;
}

export function renderLorebookPickerOptions(picker) {
    const optionsMarkup = (picker?.options ?? [])
        .map((option) => `
            <button
                class="ne-lorebook-picker__option${option.isCurrent ? ' ne-lorebook-picker__option--current' : ''}"
                type="button"
                data-action="${picker.mode === 'replace' ? 'replace-workspace-lorebook-option' : 'add-workspace-lorebook-option'}"
                data-lorebook-id="${escapeHtml(option.id)}"
                ${picker.slotId ? `data-slot-id="${escapeHtml(picker.slotId)}"` : ''}
            >
                <span class="ne-lorebook-picker__option-name">${escapeHtml(option.id)}</span>
                ${option.isCurrent ? `<span class="ne-lorebook-picker__option-meta">${escapeHtml(t('picker.optionCurrent'))}</span>` : ''}
            </button>
        `)
        .join('');

    return `
        ${optionsMarkup || `<p class="ne-lorebook-picker__empty">${escapeHtml(picker?.emptyMessage || t('picker.empty'))}</p>`}
        ${picker?.canCreate ? `
            <button
                class="ne-btn ne-btn--soft ne-lorebook-picker__create"
                type="button"
                data-action="create-new-lorebook"
                data-lorebook-name="${escapeHtml(picker.createName)}"
            >
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                ${escapeHtml(t('picker.create', { name: picker.createName }))}
            </button>
        ` : ''}
    `;
}

function renderLorebookSection(lorebook, model) {
    const rowKey = `lorebook:${lorebook.slotId}`;
    const revealedClass = model.revealedRowKey === rowKey ? ' ne-swipe-row--revealed' : '';
    const showEntryCounters = model.settingsState?.showLorebookEntryCounters !== false;
    const countLabel = Number.isFinite(Number(lorebook.entryCount)) && Number(lorebook.entryCount) > 0
        ? `${lorebook.entryCount}`
        : '';
    const replacePickerMarkup = model.picker?.mode === 'replace' && model.picker.slotId === lorebook.slotId
        ? renderLorebookPickerPanel(model.picker, lorebook)
        : '';
    const bodyMarkup = lorebook.isExpanded ? renderExpandedLorebookBody(lorebook, model) : '';

    const activeSlotClass = lorebook.isActive ? ' ne-lorebook-section--has-active' : '';

    return `
        <section class="ne-sidebar__section ne-lorebook-section${activeSlotClass}" data-lorebook-id="${escapeHtml(lorebook.id)}" data-slot-id="${escapeHtml(lorebook.slotId)}">
            <header class="ne-sidebar__section-header ne-folder-row ne-reveal-actions-row ne-lorebook-folder${revealedClass}" data-swipe-row-key="${escapeHtml(rowKey)}">
                <button
                    class="ne-folder-row__main ne-lorebook-folder__main"
                    type="button"
                    data-swipe-handle="true"
                    data-action="toggle-workspace-lorebook-expansion"
                    data-slot-id="${escapeHtml(lorebook.slotId)}"
                    aria-label="${escapeHtml(lorebook.isExpanded ? t('lorebook.row.collapse', { name: lorebook.name }) : t('lorebook.row.expand', { name: lorebook.name }))}"
                    title="${escapeHtml(lorebook.isExpanded ? t('lorebook.row.collapse', { name: lorebook.name }) : t('lorebook.row.expand', { name: lorebook.name }))}"
                >
                    <span class="ne-lorebook-folder__title-line">
                        <span class="ne-lorebook-folder__title">${escapeHtml(lorebook.name)}</span>
                        <span class="ne-lorebook-folder__badges">
                            ${showEntryCounters && countLabel ? `<span class="ne-lorebook-count">${escapeHtml(countLabel)}</span>` : ''}
                        </span>
                    </span>
                </button>
                ${renderActionGroup(t('lorebook.row.actions'), `
                    ${renderIconActionButton('open-replace-workspace-lorebook-picker', 'fa-right-left', t('lorebook.row.replaceSlot', { name: lorebook.name }), {
                        lorebookId: lorebook.id,
                        slotId: lorebook.slotId,
                    })}
                    ${renderIconActionButton('remove-workspace-lorebook', 'fa-xmark', t('lorebook.row.hide'), {
                        lorebookId: lorebook.id,
                        slotId: lorebook.slotId,
                    })}
                `)}
            </header>
            ${replacePickerMarkup}
            ${bodyMarkup}
        </section>
    `;
}

function renderLoreEntryCreationDialog(dialog) {
    const lorebookOptionsMarkup = dialog.lorebooks.length > 0
        ? dialog.lorebooks.map((lorebook) => `
            <option value="${escapeHtml(lorebook.id)}"${lorebook.id === dialog.selectedLorebookId ? ' selected' : ''}>
                ${escapeHtml(lorebook.name)}${lorebook.isPrimary ? ` ${escapeHtml(t('dialog.createEntry.optionSuffix.primary'))}` : ''}${lorebook.isActive ? ` ${escapeHtml(t('dialog.createEntry.optionSuffix.active'))}` : ''}
            </option>
        `).join('')
        : '';
    const positionOptionsMarkup = dialog.positions.length > 0
        ? dialog.positions.map((position) => `
            <option value="${escapeHtml(position.key)}"${position.key === dialog.selectedPositionKey ? ' selected' : ''}>
                ${escapeHtml(position.label)}
            </option>
        `).join('')
        : '';
    const isLorebookMode = dialog.mode === 'lorebook';
    const canConfirm = isLorebookMode ? dialog.canConfirmLorebook : dialog.canConfirmEntry;
    const confirmLabel = isLorebookMode
        ? t('dialog.createLorebook.confirm')
        : t('dialog.createEntry.confirm');

    return `
        <div class="ne-sidebar__modal" data-lore-entry-create-dialog="true">
            <button
                class="ne-sidebar__modal-backdrop"
                type="button"
                data-action="close-lore-entry-create-dialog"
                aria-label="${escapeHtml(t('dialog.createEntry.close'))}"
                title="${escapeHtml(t('dialog.createEntry.close'))}"
            ></button>
            <div class="ne-lore-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="ne-lore-entry-dialog-title" data-lore-entry-create-dialog="true">
                <div class="ne-lorebook-picker__header">
                    <p class="ne-lorebook-picker__title" id="ne-lore-entry-dialog-title">${escapeHtml(dialog.title)}</p>
                    <button
                        class="ne-btn ne-btn--soft ne-btn--icon"
                        type="button"
                        data-action="close-lore-entry-create-dialog"
                        aria-label="${escapeHtml(t('dialog.createEntry.close'))}"
                        title="${escapeHtml(t('dialog.createEntry.close'))}"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="ne-lore-entry-dialog__tabs" role="tablist" aria-label="${escapeHtml(t('dialog.createEntry.tabList'))}">
                    <button
                        class="ne-btn ne-btn--soft ne-lore-entry-dialog__tab${!isLorebookMode ? ' ne-lore-entry-dialog__tab--active' : ''}"
                        type="button"
                        role="tab"
                        aria-selected="${!isLorebookMode ? 'true' : 'false'}"
                        data-action="switch-lore-entry-create-mode"
                        data-mode="entry"
                    >${escapeHtml(t('dialog.createEntry.tab.entry'))}</button>
                    <button
                        class="ne-btn ne-btn--soft ne-lore-entry-dialog__tab${isLorebookMode ? ' ne-lore-entry-dialog__tab--active' : ''}"
                        type="button"
                        role="tab"
                        aria-selected="${isLorebookMode ? 'true' : 'false'}"
                        data-action="switch-lore-entry-create-mode"
                        data-mode="lorebook"
                    >${escapeHtml(t('dialog.createEntry.tab.lorebook'))}</button>
                </div>

                ${isLorebookMode ? `
                    <div class="ne-lore-entry-dialog__fields">
                        <label class="ne-lore-entry-dialog__field">
                            <span class="ne-lore-entry-dialog__label">${escapeHtml(t('dialog.createLorebook.field.name'))}</span>
                            <input
                                class="ne-input"
                                type="text"
                                value="${escapeHtml(dialog.lorebookName)}"
                                placeholder="${escapeHtml(t('dialog.createLorebook.field.placeholder'))}"
                                data-lore-entry-create-field="lorebookName"
                                data-sidebar-input-key="lorebook-create-name"
                            />
                        </label>
                    </div>
                    ${dialog.hasExactLorebookMatch ? `<p class="ne-lorebook-picker__empty">${escapeHtml(t('dialog.createLorebook.exists'))}</p>` : ''}
                ` : `
                <div class="ne-lore-entry-dialog__fields">
                    <label class="ne-lore-entry-dialog__field">
                        <span class="ne-lore-entry-dialog__label">${escapeHtml(t('dialog.createEntry.field.lorebook'))}</span>
                        <select
                            class="ne-input"
                            data-lore-entry-create-field="lorebookId"
                            ${dialog.lorebooks.length === 0 ? 'disabled' : ''}
                        >
                            ${lorebookOptionsMarkup}
                        </select>
                    </label>

                    <label class="ne-lore-entry-dialog__field">
                        <span class="ne-lore-entry-dialog__label">${escapeHtml(t('dialog.createEntry.field.position'))}</span>
                        <select
                            class="ne-input"
                            data-lore-entry-create-field="positionKey"
                            ${dialog.positions.length === 0 ? 'disabled' : ''}
                        >
                            ${positionOptionsMarkup}
                        </select>
                    </label>

                    <label class="ne-lore-entry-dialog__field">
                        <span class="ne-lore-entry-dialog__label">${escapeHtml(t('dialog.createEntry.field.order'))}</span>
                        <input
                            class="ne-input"
                            type="number"
                            step="1"
                            value="${escapeHtml(dialog.orderValue)}"
                            data-lore-entry-create-field="order"
                        />
                    </label>
                </div>
                `}

                ${isLorebookMode || dialog.canConfirmEntry ? '' : `<p class="ne-lorebook-picker__empty">${escapeHtml(t('dialog.createEntry.noLorebook'))}</p>`}

                <div class="ne-lore-entry-dialog__actions">
                    <button class="ne-btn ne-btn--soft" type="button" data-action="close-lore-entry-create-dialog">${escapeHtml(t('dialog.createEntry.cancel'))}</button>
                    <button class="ne-btn" type="button" data-action="confirm-lore-entry-create-dialog"${canConfirm ? '' : ' disabled'}>${escapeHtml(confirmLabel)}</button>
                </div>
            </div>
        </div>
    `;
}

function renderExpandedLorebookBody(lorebook, model) {
    if (lorebook.isLoading || lorebook.summaryStatus === 'loading') {
        return `
            <div class="ne-lorebook-loading">
                <span class="ne-lorebook-loading__spinner" aria-hidden="true"></span>
                <p>${escapeHtml(t('lorebook.loading', { name: lorebook.name }))}</p>
            </div>
        `;
    }

    if (lorebook.hasLoadError) {
        return `
            <div class="ne-sidebar__empty">
                <p>${escapeHtml(lorebook.errorMessage || t('lorebook.error.load', { name: lorebook.name }))}</p>
                <button class="ne-btn ne-btn--soft" type="button" data-action="refresh-active-lorebook" data-lorebook-id="${escapeHtml(lorebook.id)}">${escapeHtml(t('lorebook.error.tryAgain'))}</button>
            </div>
        `;
    }

    const sectionsMarkup = (lorebook.sections ?? []).map((section) => renderLorePositionSection(section, lorebook, model)).join('');
    const emptyMarkup = lorebook.hasAnyEntries
        ? `
            <div class="ne-sidebar__empty">
                <p>${escapeHtml(t('lore.empty.noMatch'))}</p>
            </div>
        `
        : `
            <div class="ne-sidebar__empty">
                <p class="ne-sidebar__empty-hint">${escapeHtml(t('lore.empty.none'))}</p>
                <button
                    class="ne-btn ne-btn--soft"
                    type="button"
                    data-action="create-lore-entry-in-lorebook"
                    data-lorebook-id="${escapeHtml(lorebook.id)}"
                >
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    ${escapeHtml(t('lore.empty.create'))}
                </button>
            </div>
        `;

    return `
        ${sectionsMarkup || emptyMarkup}
        ${renderLorebookPager(lorebook)}
    `;
}

function renderLorebookPager(lorebook) {
    const paging = lorebook.paging ?? null;
    if (!paging || paging.totalEntries <= paging.pageSize) {
        return '';
    }

    const summary = paging.visibleCount > 0
        ? t('pager.showing', { start: paging.visibleStart, end: paging.visibleEnd, total: paging.totalEntries })
        : t('pager.empty', { total: paging.totalEntries });

    return `
        <div class="ne-lorebook-page-nav" aria-label="${escapeHtml(t('pager.aria', { name: lorebook.name }))}">
            <div class="ne-lorebook-page-nav__meta">
                <span class="ne-lorebook-page-nav__summary">${escapeHtml(summary)}</span>
                <span class="ne-lorebook-page-nav__index">${escapeHtml(t('pager.page', { current: paging.currentPage, total: paging.totalPages }))}</span>
            </div>
            <div class="ne-lorebook-page-nav__actions">
                <button
                    class="ne-btn ne-btn--soft"
                    type="button"
                    data-action="go-to-lorebook-page"
                    data-lorebook-id="${escapeHtml(lorebook.id)}"
                    data-page="${escapeHtml(String(paging.currentPage - 1))}"
                    ${paging.hasPreviousPage ? '' : 'disabled'}
                >
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                    ${escapeHtml(t('pager.previous', { count: paging.previousCount }))}
                </button>
                <button
                    class="ne-btn ne-btn--soft"
                    type="button"
                    data-action="go-to-lorebook-page"
                    data-lorebook-id="${escapeHtml(lorebook.id)}"
                    data-page="${escapeHtml(String(paging.currentPage + 1))}"
                    ${paging.hasNextPage ? '' : 'disabled'}
                >
                    ${escapeHtml(t('pager.next', { count: paging.nextCount }))}
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </button>
            </div>
        </div>
    `;
}

function renderLorePositionSection(section, lorebook, model) {
    const rowsMarkup = section.isCollapsed
        ? ''
        : section.entries.map((entry) => renderLoreEntryRow(entry, lorebook, model)).join('');
    const showEntryCounters = model.settingsState?.showLorebookEntryCounters !== false;
    const rowKey = `lore-position:${lorebook.id}:${section.key}`;
    const revealedClass = model.revealedRowKey === rowKey ? ' ne-swipe-row--revealed' : '';

    const activePositionClass = section.hasActiveEntry ? ' ne-lore-position-section--has-active' : '';

    return `
        <section class="ne-sidebar__section ne-lore-position-section${activePositionClass}" data-position-key="${escapeHtml(section.key)}">
            <header class="ne-sidebar__section-header ne-folder-row ne-reveal-actions-row ne-lore-position-header ${escapeHtml(section.colorClass)}${revealedClass}" data-swipe-row-key="${escapeHtml(rowKey)}">
                <button class="ne-lore-position-header__button" type="button" data-swipe-handle="true" data-action="toggle-lorebook-position" data-lorebook-id="${escapeHtml(lorebook.id)}" data-position-key="${escapeHtml(section.key)}">
                    <span class="ne-lore-position-header__title">
                        <span class="ne-lore-position-header__title-text ${escapeHtml(section.colorClass)}">${escapeHtml(section.title)}</span>
                    </span>
                    ${showEntryCounters ? `
                        <span class="ne-lore-position-header__meta">
                            <span class="ne-lorebook-count">${escapeHtml(String(section.entries.length))}</span>
                        </span>
                    ` : ''}
                </button>
                <div class="ne-lore-position-header__actions">
                    ${renderActionGroup(t('lore.section.actions', { title: section.title }), `
                        ${renderIconActionButton('create-lore-entry-in-position', 'fa-plus', t('lore.section.createIn', { title: section.title }), {
                        lorebookId: lorebook.id,
                        positionKey: section.key,
                    })}
                    `)}
                </div>
            </header>
            ${section.isCollapsed ? '' : `<div class="ne-note-list">${rowsMarkup}</div>`}
        </section>
    `;
}

function renderLoreEntryRow(entry, lorebook, model) {
    const rowKey = `lore:${lorebook.id}:${entry.id}`;
    const activeClass = entry.isCurrent ? ' ne-note-row--active' : '';
    const revealedClass = model.revealedRowKey === rowKey ? ' ne-swipe-row--revealed' : '';
    const disabledClass = entry.enabled ? '' : ' ne-lore-row--disabled';
    const activationClass = `ne-lore-activation--${entry.activationMode}`;
    const activationLabel = entry.activationMode === 'constant'
        ? t('lore.activation.constant')
        : entry.activationMode === 'vectorized'
            ? t('lore.activation.vectorized')
            : t('lore.activation.keyword');
    const keywordPreview = buildLoreEntryKeywordPreview(entry.primaryKeywords, entry.secondaryKeywords);

    return `
        <article class="ne-note-row ne-lore-row${activeClass}${revealedClass}${disabledClass}" data-swipe-row-key="${escapeHtml(rowKey)}">
            <div class="ne-lore-row__body">
                <button class="ne-note-row__main ne-lore-row__main" type="button" data-swipe-handle="true" data-document-id="${escapeHtml(entry.id)}" data-lorebook-id="${escapeHtml(lorebook.id)}">
                    <span class="ne-note-row__title-line">
                        <span class="ne-lore-row__title-wrap">
                            <span class="ne-lore-row__activation ${escapeHtml(activationClass)}" title="${escapeHtml(activationLabel)}" aria-label="${escapeHtml(activationLabel)}"></span>
                            <span class="ne-note-row__title">${escapeHtml(getDisplayTitle(entry.title, 'lorebook'))}</span>
                        </span>
                    </span>
                    <span class="ne-lore-row__meta">
                        ${escapeHtml(keywordPreview || activationLabel)}
                    </span>
                </button>
                <label class="ne-lore-row__order-field" title="${escapeHtml(t('lore.row.order'))}" aria-label="${escapeHtml(t('lore.row.order'))}">
                    <span class="ne-visually-hidden">${escapeHtml(t('lore.row.order'))}</span>
                    <input
                        class="ne-input ne-lore-row__order-input"
                        type="number"
                        step="1"
                        value="${escapeHtml(String(entry.order ?? 0))}"
                        data-field-action="set-lore-entry-order"
                        data-lorebook-id="${escapeHtml(lorebook.id)}"
                        data-entry-id="${escapeHtml(entry.id)}"
                        data-initial-value="${escapeHtml(String(entry.order ?? 0))}"
                    />
                </label>
            </div>

            ${entry.isCurrent ? renderLoreEntryActiveControls(entry, lorebook) : ''}

            <div class="ne-row-actions" aria-label="${escapeHtml(t('lore.row.actions'))}">
                ${renderIconActionButton('toggle-lore-entry-enabled', entry.enabled ? 'fa-toggle-on' : 'fa-toggle-off', entry.enabled ? t('lore.row.disable') : t('lore.row.enable'), {
                    lorebookId: lorebook.id,
                    entryId: entry.id,
                })}
                ${renderIconActionButton('toggle-lore-entry-activation', 'fa-bolt', entry.activationMode === 'constant' ? t('lore.row.setKeyword') : t('lore.row.setConstant'), {
                    lorebookId: lorebook.id,
                    entryId: entry.id,
                    disabled: entry.activationMode === 'vectorized',
                })}
                ${renderIconActionButton('delete-lore-entry', 'fa-trash', t('lore.row.delete'), {
                    lorebookId: lorebook.id,
                    entryId: entry.id,
                    tone: 'danger',
                })}
            </div>
        </article>
    `;
}

function renderLoreEntryActiveControls(entry, lorebook) {
    const positionOptionsMarkup = (entry.positionOptions ?? [])
        .map((option) => `
            <option value="${escapeHtml(String(option.value))}"${Number(option.value) === Number(entry.positionValue) ? ' selected' : ''}>
                ${escapeHtml(option.label)}
            </option>
        `)
        .join('');

    return `
        <div class="ne-lore-row__controls">
            <label class="ne-lore-row__control">
                <span class="ne-lore-row__control-label">${escapeHtml(t('lore.control.position'))}</span>
                <select
                    class="ne-input ne-lore-row__select"
                    data-field-action="set-lore-entry-position"
                    data-lorebook-id="${escapeHtml(lorebook.id)}"
                    data-entry-id="${escapeHtml(entry.id)}"
                >
                    ${positionOptionsMarkup}
                </select>
            </label>
            ${entry.isAtDepth ? `
                <label class="ne-lore-row__control ne-lore-row__control--depth">
                    <span class="ne-lore-row__control-label">${escapeHtml(t('lore.control.depth'))}</span>
                    <input
                        class="ne-input ne-lore-row__depth-input"
                        type="number"
                        min="0"
                        step="1"
                        value="${escapeHtml(String(entry.depth ?? 0))}"
                        data-field-action="set-lore-entry-depth"
                        data-lorebook-id="${escapeHtml(lorebook.id)}"
                        data-entry-id="${escapeHtml(entry.id)}"
                        data-initial-value="${escapeHtml(String(entry.depth ?? 0))}"
                    />
                </label>
            ` : ''}
        </div>
    `;
}

function renderLorebookPickerPanel(picker, lorebook = null) {
    const title = picker.title || (picker.mode === 'replace' && lorebook
        ? t('picker.replaceTitle', { name: lorebook.name })
        : t('picker.addTitle'));
    const inputKey = `lorebook-picker-search:${picker.mode}${picker.slotId ? `:${picker.slotId}` : ''}`;

    return `
        <div class="ne-lorebook-picker" data-lorebook-picker="${escapeHtml(picker.mode)}">
            <div class="ne-lorebook-picker__header">
                <p class="ne-lorebook-picker__title">${escapeHtml(title)}</p>
                <button
                    class="ne-btn ne-btn--soft ne-btn--icon"
                    type="button"
                    data-action="close-workspace-lorebook-picker"
                    aria-label="${escapeHtml(t('picker.close'))}"
                    title="${escapeHtml(t('picker.close'))}"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <label class="ne-visually-hidden" for="ne-lorebook-picker-search-${escapeHtml(picker.mode)}">${escapeHtml(t('picker.searchLabel'))}</label>
            <input
                id="ne-lorebook-picker-search-${escapeHtml(picker.mode)}"
                class="ne-input ne-lorebook-picker__search"
                type="text"
                value="${escapeHtml(picker.search ?? '')}"
                placeholder="${escapeHtml(t('picker.searchPlaceholder'))}"
                autocomplete="off"
                spellcheck="false"
                data-lorebook-picker-search="true"
                data-sidebar-input-key="${escapeHtml(inputKey)}"
            />
            <div class="ne-lorebook-picker__options" data-lorebook-picker-region="options">
                ${renderLorebookPickerOptions(picker)}
            </div>
        </div>
    `;
}

function renderMoveMenu(noteId, currentFolderId, folderOptions) {
    const buttons = [
        renderMoveButton(noteId, t('notes.section.unfiled'), '', currentFolderId === null, 0),
        ...folderOptions.map((folder) => renderMoveButton(noteId, folder.name, folder.id, folder.id === currentFolderId, folder.depth)),
    ].join('');

    return `
        <div class="ne-note-row__move-menu">
            <p class="ne-note-row__move-label">${escapeHtml(t('notes.row.moveMenu.label'))}</p>
            ${buttons}
        </div>
    `;
}

function renderMoveButton(noteId, label, folderId, active, depth = 0) {
    const depthStyle = depth > 0 ? ` style="padding-left:calc(${depth} * 1rem + 0.6rem)"` : '';
    return `
        <button
            class="ne-note-row__move-option${active ? ' ne-note-row__move-option--active' : ''}"
            type="button"
            data-action="move-note-row"
            data-note-id="${escapeHtml(noteId)}"
            data-folder-id="${escapeHtml(folderId)}"${depthStyle}
        >
            ${escapeHtml(label)}
        </button>
    `;
}

function buildLoreEntryKeywordPreview(primaryKeywords = [], secondaryKeywords = []) {
    const primary = buildKeywordPreviewLabel(t('keywords.preview.primary'), primaryKeywords);
    const secondary = buildKeywordPreviewLabel(t('keywords.preview.secondary'), secondaryKeywords);
    return [primary, secondary].filter(Boolean).join(' | ');
}

function buildKeywordPreviewLabel(label, keywords = []) {
    const list = Array.isArray(keywords)
        ? keywords.map((keyword) => String(keyword ?? '').trim()).filter(Boolean)
        : [];
    if (list.length === 0) {
        return `${label}: ${t('keywords.preview.none')}`;
    }

    const preview = list.slice(0, 2).join(', ');
    const remainingCount = list.length - 2;
    return `${label}: ${preview}${remainingCount > 0 ? ` +${remainingCount}` : ''}`;
}

function renderIconActionButton(action, icon, label, options = {}) {
    const toneClass = options.tone === 'danger' ? ' ne-btn--danger' : '';
    const disabledAttr = options.disabled ? ' disabled aria-disabled="true"' : '';

    return `
        <button
            class="ne-btn ne-btn--soft ne-btn--icon${toneClass}"
            type="button"
            data-action="${action}"
            ${options.noteId ? `data-note-id="${escapeHtml(options.noteId)}"` : ''}
            ${options.folderId ? `data-folder-id="${escapeHtml(options.folderId)}"` : ''}
            ${options.lorebookId ? `data-lorebook-id="${escapeHtml(options.lorebookId)}"` : ''}
            ${options.entryId ? `data-entry-id="${escapeHtml(options.entryId)}"` : ''}
            ${options.positionKey ? `data-position-key="${escapeHtml(options.positionKey)}"` : ''}
            ${options.slotId ? `data-slot-id="${escapeHtml(options.slotId)}"` : ''}
            aria-label="${escapeHtml(label)}"
            title="${escapeHtml(label)}"${disabledAttr}
        >
            <i class="fa-solid ${escapeHtml(icon)}"></i>
        </button>
    `;
}

function renderActionGroup(label, buttonsMarkup) {
    return `
        <div class="ne-row-actions" aria-label="${escapeHtml(label)}">
            ${buttonsMarkup}
        </div>
    `;
}

function getNoteExcerpt(content) {
    const source = String(content ?? '');
    const trimmed = source.replace(/\s+/g, ' ').trim();
    return trimmed ? trimmed.slice(0, 72) : '';
}
