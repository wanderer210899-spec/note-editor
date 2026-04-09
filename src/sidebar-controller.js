// src/sidebar-controller.js
// Responsible for: sidebar UI coordination, cached sidebar refs, and delegated event flow.

import { normaliseDocumentSource } from './document-source.js';
import { getNotesState } from './state/notes-store.js';
import { buildNoteTransferSettingsModel, buildNoteTransferSummary } from './note-transfer.js';
import { buildLorebookSidebarModel } from './state/lorebook-selectors.js';
import { buildSidebarModel } from './state/notes-selectors.js';
import { buildLorebookTransferSettingsModel, getLorebookState } from './state/lorebook-store.js';
import {
    getSessionState,
    setSessionFiltersOpen,
    setSessionSearch,
    setSessionTagFilter,
} from './state/session-store.js';
import { handleSidebarAction, handleSidebarDocumentSelection, handleSidebarFieldCommit } from './sidebar-actions.js';
import {
    applySidebarSearchTagSuggestion,
    beginSidebarInputComposition,
    clearSidebarSearchUi,
    endSidebarInputComposition,
    getActiveSidebarSearchTagSuggestions,
    handleSidebarSearchKeyDown,
    isSidebarInputComposing,
    restoreSidebarSearchFocus as restoreSidebarSearchFocusState,
    shouldSkipSidebarSearchKeyUp,
    getSidebarInputKey,
    syncSidebarSearchInput,
    syncSidebarSearchValue,
    updateSidebarSearchSelection,
} from './sidebar-search.js';
import { beginSidebarSwipe, updateSidebarSwipe } from './sidebar-touch.js';
import {
    renderDeletePanelLorebookFiles,
    renderLorebookPickerOptions,
    renderSidebarBody,
    renderSidebarFilters,
    renderSidebarShell,
    renderSidebarTagSuggestions,
    renderSidebarToolsShell,
} from './ui/sidebar-view.js';
import { isMobileViewport } from './util.js';
import {
    getSettingsState,
    previewSettingsPanelFontScale,
    setSettingsPanelFontScale,
    subscribeSettings,
    setSettingsLanguage,
    setSettingsDefaultSource,
    setSettingsNewEntryExcludeRecursion,
    setSettingsNewEntryPreventRecursion,
    setSettingsShowLorebookEntryCounters,
    setSettingsTransferOverwriteExisting,
} from './state/settings-store.js';

let rootEl = null;
let sidebarRootEl = null;
let sidebarToolsEl = null;
let sidebarBodyEl = null;
let searchInputEl = null;
let searchSuggestionsEl = null;
let searchFiltersEl = null;
let closeTagsMenu = () => {};
let createNoteFromSidebar = () => {};
let sidebarBodyInputTimer = null;
let uiState = createDefaultSidebarUiState();
let touchSwipeState = null;
let sidebarEventsBound = false;
let renderedSidebarBodyMarkup = '';
let renderedSidebarSuggestionsMarkup = '';
let renderedSidebarFiltersMarkup = '';
let renderedSidebarToolsMarkup = '';
let mountedSidebarSource = 'note';
let currentSidebarModel = null;

export function mountSidebarController({ root, sidebarRoot, onCloseTagsMenu, onCreateNote } = {}) {
    if (!root || !sidebarRoot) {
        return;
    }

    closeTagsMenu = typeof onCloseTagsMenu === 'function' ? onCloseTagsMenu : () => {};
    createNoteFromSidebar = typeof onCreateNote === 'function' ? onCreateNote : () => {};
    if (rootEl === root && sidebarRootEl === sidebarRoot && sidebarBodyEl?.isConnected) {
        return;
    }

    rootEl = root;
    sidebarRootEl = sidebarRoot;
    mountSidebarShell(getSessionState().activeSource);
    bindSidebarEvents();
    subscribeSettings(() => {
        mountSidebarShell(mountedSidebarSource, { preservePanelState: true });
        renderSidebarController();
    });
}

export function renderSidebarController() {
    if (!sidebarRootEl) {
        return;
    }

    const sessionState = getSessionState();
    if (!sidebarBodyEl?.isConnected) {
        mountSidebarShell(sessionState.activeSource);
    }

    const activeSource = normaliseDocumentSource(sessionState.activeSource);
    if (activeSource !== mountedSidebarSource) {
        mountSidebarShell(activeSource);
    }
    if (activeSource === 'lorebook' && uiState.lastLorebookSearch !== sessionState.search) {
        uiState.lastLorebookSearch = sessionState.search;
        uiState.lorebookPageById = {};
    }

    const rawModel = activeSource === 'note'
        ? buildSidebarModel(getNotesState(), sessionState, uiState)
        : buildLorebookSidebarModel(getLorebookState(), sessionState, uiState);
    const transferModel = uiState.settingsPanelOpen
        ? (() => {
            if (activeSource === 'lorebook') {
                return buildLorebookTransferSettingsModel({
                    ...uiState.lorebookTransferSelection,
                    exportOptionsOpen: uiState.lorebookExportOptionsOpen,
                    exportPickerOpen: uiState.lorebookExportPickerOpen,
                    exportFormat: uiState.lorebookTransferExportFormat,
                });
            }

            const notesSettings = getNotesState().settings;
            const noteTransferModel = uiState.noteExportPickerOpen
                ? buildNoteTransferSettingsModel(notesSettings, uiState.noteTransferSelection)
                : buildNoteTransferSummary(notesSettings, uiState.noteTransferSelection);
            return {
                ...noteTransferModel,
                source: 'note',
                exportPickerOpen: uiState.noteExportPickerOpen,
                exportFormat: uiState.noteTransferExportFormat,
            };
        })()
        : null;
    const model = {
        ...rawModel,
        isMobile: isMobileViewport(),
        settingsPanelOpen: uiState.settingsPanelOpen,
        settingsState: getSettingsState(),
        transferModel,
    };
    currentSidebarModel = model;

    renderSidebarTools(model, activeSource);

    const bodyMarkup = renderSidebarBody(model, activeSource);
    if (renderedSidebarBodyMarkup !== bodyMarkup) {
        sidebarBodyEl.innerHTML = bodyMarkup;
        renderedSidebarBodyMarkup = bodyMarkup;
    }

    const selectBtn = sidebarRootEl?.querySelector('[data-action="toggle-note-bulk-select-mode"]');
    if (selectBtn) {
        selectBtn.classList.toggle('ne-btn--active', Boolean(uiState.noteBulkSelectMode));
    }

    const restoredBodyInputFocus = restorePendingSidebarBodyInputFocus();
    if (!restoredBodyInputFocus) {
        restoreSidebarSearchFocus();
    }
}

export function resetSidebarControllerState() {
    clearTimeout(sidebarBodyInputTimer);
    sidebarBodyInputTimer = null;
    uiState = createDefaultSidebarUiState();
    touchSwipeState = null;
    currentSidebarModel = null;
}

export function openLoreEntryCreationDialog(options = {}) {
    const activeSource = normaliseDocumentSource(getSessionState().activeSource);
    if (activeSource !== 'lorebook') {
        return false;
    }

    const settings = getLorebookState()?.settings ?? {};
    const workspaceLorebooks = Array.isArray(settings.workspaceLorebooks) ? settings.workspaceLorebooks : [];
    const positionList = (Array.isArray(settings.positionOrder) ? settings.positionOrder : [])
        .filter((positionKey) => positionKey !== 'other')
        .map((positionKey) => ({
            key: positionKey,
            value: settings.positionMeta?.[positionKey]?.value ?? null,
        }))
        .filter((position) => position.value !== null);
    const selectedLorebookId = workspaceLorebooks.some((lorebook) => lorebook.id === options.lorebookId)
        ? String(options.lorebookId)
        : workspaceLorebooks.find((lorebook) => lorebook.id === settings.activeLorebookId)?.id
            ?? workspaceLorebooks[0]?.id
            ?? '';
    const selectedPositionKey = positionList.some((position) => position.key === options.positionKey)
        ? String(options.positionKey)
        : positionList.find((position) => position.key === 'before_char')?.key
            ?? positionList[0]?.key
            ?? '';
    const orderValue = Number.isFinite(Number(options.order))
        ? String(Math.trunc(Number(options.order)))
        : '100';

    uiState.lorebookPickerMode = null;
    uiState.lorebookPickerSlotId = null;
    uiState.lorebookPickerSearch = '';
    uiState.settingsPanelOpen = false;
    uiState.deletePanelOpen = false;
    uiState.loreEntryCreationOpen = true;
    uiState.loreEntryCreationMode = 'entry';
    uiState.loreEntryCreationLorebookId = selectedLorebookId;
    uiState.loreEntryCreationPositionKey = selectedPositionKey;
    uiState.loreEntryCreationOrder = orderValue;
    uiState.loreEntryCreationLorebookName = '';
    uiState.revealedRowKey = '';
    openSidebar();
    renderSidebarController();
    return true;
}

export function activateSidebarTagFilter(tag) {
    setSessionFiltersOpen(true);
    openSidebar();
    closeTagsMenu();
    setSessionTagFilter(tag);
}

export function handleSidebarDocumentPointerDown(target) {
    if (!rootEl?.isConnected || !(target instanceof Element)) {
        return;
    }

    const sidebarButton = document.getElementById('ne-btn-menu');
    const panel = document.getElementById('ne-panel');

    if (
        panel?.classList.contains('ne-panel--menu-open')
        && sidebarRootEl
        && !sidebarRootEl.contains(target)
        && !sidebarButton?.contains(target)
    ) {
        closeSidebar();
        return;
    }

    if (!target.closest('[data-swipe-row-key]') && uiState.revealedRowKey) {
        resetSidebarControllerState();
        renderSidebarController();
    }
}

function mountSidebarShell(source = 'note', { preservePanelState = false } = {}) {
    if (!sidebarRootEl) {
        return;
    }

    mountedSidebarSource = normaliseDocumentSource(source);
    clearTimeout(sidebarBodyInputTimer);
    sidebarBodyInputTimer = null;
    if (!preservePanelState) {
        uiState.lorebookPickerMode = null;
        uiState.lorebookPickerSlotId = null;
        uiState.lorebookPickerSearch = '';
        uiState.deletePanelOpen = false;
        uiState.loreEntryCreationOpen = false;
        uiState.loreEntryCreationMode = 'entry';
        uiState.loreEntryCreationLorebookId = '';
        uiState.loreEntryCreationPositionKey = '';
        uiState.loreEntryCreationOrder = '100';
        uiState.loreEntryCreationLorebookName = '';
        uiState.bulkSelectedEntryKeys = new Set();
        uiState.bulkDeleteLorebookSearch = '';
        uiState.bulkSelectedLorebookNames = new Set();
        uiState.lorebookExportOptionsOpen = false;
        uiState.lorebookExportPickerOpen = false;
    }
    sidebarRootEl.innerHTML = renderSidebarShell({ source: mountedSidebarSource });
    sidebarToolsEl = sidebarRootEl.querySelector('[data-sidebar-region="tools"]');
    sidebarBodyEl = sidebarRootEl.querySelector('[data-sidebar-region="body"]');
    searchInputEl = null;
    searchSuggestionsEl = null;
    searchFiltersEl = null;
    renderedSidebarBodyMarkup = '';
    renderedSidebarSuggestionsMarkup = '';
    renderedSidebarFiltersMarkup = '';
    renderedSidebarToolsMarkup = '';
}

function bindSidebarEvents() {
    if (sidebarEventsBound) {
        return;
    }

    sidebarEventsBound = true;
    rootEl.addEventListener('click', handleSidebarClick);
    rootEl.addEventListener('pointerdown', handleSidebarPointerDown);
    rootEl.addEventListener('pointermove', handleSidebarSwipeMove);
    rootEl.addEventListener('pointerup', handleSidebarPointerUp);
    rootEl.addEventListener('pointercancel', handleSidebarSwipeEnd);
    rootEl.addEventListener('input', handleSidebarInput);
    rootEl.addEventListener('change', handleSidebarChange);
    rootEl.addEventListener('blur', handleSidebarBlur, true);
    rootEl.addEventListener('focusin', handleSidebarFocusIn);
    rootEl.addEventListener('focusout', handleSidebarFocusOut);
    rootEl.addEventListener('compositionstart', handleSidebarCompositionStart);
    rootEl.addEventListener('compositionend', handleSidebarCompositionEnd);
    rootEl.addEventListener('keydown', handleSidebarKeyDown);
    rootEl.addEventListener('keyup', handleSidebarKeyUp);
}

function renderSidebarTools(model, activeSource) {
    if (!sidebarToolsEl) {
        return;
    }

    const showTools = Boolean(model.showTools);
    sidebarToolsEl.hidden = !showTools;
    if (!showTools) {
        clearSidebarSearchUi(uiState, searchSuggestionsEl, searchFiltersEl);
        renderedSidebarSuggestionsMarkup = '';
        renderedSidebarFiltersMarkup = '';
        renderedSidebarToolsMarkup = '';
        return;
    }

    const toolsMarkup = renderSidebarToolsShell({
        source: activeSource,
        searchPlaceholder: model.searchPlaceholder,
    });
    if (renderedSidebarToolsMarkup !== toolsMarkup) {
        sidebarToolsEl.innerHTML = toolsMarkup;
        renderedSidebarToolsMarkup = toolsMarkup;
        searchInputEl = sidebarRootEl.querySelector('#ne-note-search');
        searchSuggestionsEl = sidebarRootEl.querySelector('[data-sidebar-region="suggestions"]');
        searchFiltersEl = sidebarRootEl.querySelector('[data-sidebar-region="filters"]');
    }

    syncSidebarSearchInput(searchInputEl, model, uiState);

    const suggestionsMarkup = renderSidebarTagSuggestions(model);
    if (renderedSidebarSuggestionsMarkup !== suggestionsMarkup) {
        searchSuggestionsEl.innerHTML = suggestionsMarkup;
        renderedSidebarSuggestionsMarkup = suggestionsMarkup;
    }
    searchSuggestionsEl.hidden = model.tagSuggestions.length === 0;

    if (activeSource === 'note') {
        const filtersMarkup = renderSidebarFilters(model);
        if (renderedSidebarFiltersMarkup !== filtersMarkup) {
            searchFiltersEl.innerHTML = filtersMarkup;
            renderedSidebarFiltersMarkup = filtersMarkup;
        }
        searchFiltersEl.hidden = !model.activeTag;
        return;
    }

    if (searchFiltersEl) {
        searchFiltersEl.hidden = true;
        searchFiltersEl.innerHTML = '';
    }
    renderedSidebarFiltersMarkup = '';
}

function handleSidebarClick(event) {
    const swipeRow = event.target.closest('[data-swipe-row-key]');
    if (
        swipeRow
        && uiState.swipeConsumedRowKey
        && swipeRow.dataset.swipeRowKey === uiState.swipeConsumedRowKey
    ) {
        uiState.swipeConsumedRowKey = '';
        event.preventDefault();
        return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton && handleSidebarAction(actionButton.dataset.action, actionButton, {
        createNote: createNoteFromSidebar,
        getUiState: () => uiState,
        renderSidebarController,
        resetSidebarControllerState,
        closeSidebar,
        applySearchTagSuggestion,
    })) {
        return;
    }

    const documentButton = event.target.closest('[data-document-id]');
    if (event.target.closest('[data-field-action]')) {
        return;
    }
    handleSidebarDocumentSelection(documentButton, { closeSidebarAfterDocumentSelection, closeTagsMenu });
}

function handleSidebarPointerDown(event) {
    uiState.swipeConsumedRowKey = '';

    if (event.target.closest('[data-field-action]')) {
        clearTouchSwipeState();
        return;
    }

    const suggestionButton = event.target.closest('[data-action="apply-search-tag-suggestion"]');
    if (suggestionButton) {
        event.preventDefault();
    }

    clearTouchSwipeState();
    touchSwipeState = beginSidebarSwipe(event);
    if (!touchSwipeState || !rootEl) {
        return;
    }

    try {
        rootEl.setPointerCapture?.(event.pointerId);
    } catch (error) {
        if (error?.name !== 'NotFoundError') {
            console.warn('[NoteEditor] Pointer capture failed on sidebar swipe start.', error);
        }
    }
}

function handleSidebarPointerUp(event) {
    clearTouchSwipeState(event);

    if (event.target?.id === 'ne-note-search') {
        syncSidebarSearch(event.target);
    }
}

function handleSidebarInput(event) {
    const settingsPreviewField = event.target?.dataset?.settingsPreviewField;
    if (settingsPreviewField) {
        handleSettingsPreviewInput(settingsPreviewField, event.target);
        return;
    }

    if (event.target?.dataset?.lorebookPickerSearch === 'true') {
        if (isSidebarInputComposing(uiState, event.target)) {
            uiState.lorebookPickerSearch = event.target.value;
            return;
        }

        queueSidebarBodySearchInputUpdate(event.target, (value) => {
            uiState.lorebookPickerSearch = value;
        }, {
            render: renderLorebookPickerResults,
        });
        return;
    }

    if (event.target?.dataset?.loreEntryCreateField === 'order') {
        uiState.loreEntryCreationOrder = event.target.value;
        return;
    }

    if (event.target?.dataset?.loreEntryCreateField === 'lorebookName') {
        if (isSidebarInputComposing(uiState, event.target)) {
            uiState.loreEntryCreationLorebookName = event.target.value;
            return;
        }

        queueSidebarBodySearchInputUpdate(event.target, (value) => {
            uiState.loreEntryCreationLorebookName = value;
        });
        return;
    }

    if (event.target?.dataset?.deletePanelLorebookSearch === 'true') {
        if (isSidebarInputComposing(uiState, event.target)) {
            uiState.bulkDeleteLorebookSearch = event.target.value;
            return;
        }

        queueSidebarBodySearchInputUpdate(event.target, (value) => {
            uiState.bulkDeleteLorebookSearch = value;
        }, {
            render: renderDeletePanelLorebookResults,
        });
        return;
    }

    if (event.target?.id !== 'ne-note-search') {
        return;
    }

    if (isSidebarInputComposing(uiState, event.target)) {
        updateSidebarSearchSelection(uiState, event.target);
        return;
    }

    syncSidebarSearch(event.target, { resetSuggestionIndex: true });
}

function handleSidebarChange(event) {
    const settingsField = event.target?.dataset?.settingsField;
    if (settingsField) {
        handleSettingsFieldChange(settingsField, event.target);
        return;
    }

    if (event.target?.dataset?.loreEntryCreateField === 'lorebookId') {
        uiState.loreEntryCreationLorebookId = event.target.value;
        return;
    }

    if (event.target?.dataset?.loreEntryCreateField === 'positionKey') {
        uiState.loreEntryCreationPositionKey = event.target.value;
        return;
    }

    const bulkToggleAction = event.target?.dataset?.bulkToggleAction;
    if (bulkToggleAction && handleSidebarAction(bulkToggleAction, event.target, {
        createNote: createNoteFromSidebar,
        getUiState: () => uiState,
        renderSidebarController,
        resetSidebarControllerState,
        closeSidebar,
        applySearchTagSuggestion,
    })) {
        return;
    }

    const field = event.target.closest('[data-field-action]');
    if (!field) {
        return;
    }

    handleSidebarFieldCommit(field, { getUiState: () => uiState });
}

function handleSettingsFieldChange(field, target) {
    if (field === 'panelFontScale') {
        setSettingsPanelFontScale(target.value);
        syncSettingsPreviewValue(field, target.value);
        return;
    }
    if (field === 'language') {
        setSettingsLanguage(target.value);
        return;
    }
    if (field === 'defaultSource') {
        setSettingsDefaultSource(target.value);
        return;
    }
    if (field === 'newEntryExcludeRecursion') {
        setSettingsNewEntryExcludeRecursion(target.checked);
        return;
    }
    if (field === 'newEntryPreventRecursion') {
        setSettingsNewEntryPreventRecursion(target.checked);
        return;
    }
    if (field === 'showLorebookEntryCounters') {
        setSettingsShowLorebookEntryCounters(target.checked);
        return;
    }
    if (field === 'transferOverwriteExisting') {
        setSettingsTransferOverwriteExisting(target.checked);
    }
}

function handleSettingsPreviewInput(field, target) {
    if (field !== 'panelFontScale') {
        return;
    }

    previewSettingsPanelFontScale(target.value);
    syncSettingsPreviewValue(field, target.value);
}

function handleSidebarBlur(event) {
    const settingsPreviewField = event.target?.dataset?.settingsPreviewField;
    if (settingsPreviewField === 'panelFontScale') {
        setSettingsPanelFontScale(event.target.value);
        syncSettingsPreviewValue(settingsPreviewField, event.target.value);
        return;
    }

    const field = event.target.closest('[data-field-action]');
    if (!field) {
        return;
    }

    if (String(field.value ?? '').trim() === '') {
        field.value = field.dataset.initialValue ?? '0';
    }
}

function handleSidebarFocusIn(event) {
    if (event.target?.id !== 'ne-note-search') {
        return;
    }

    updateSidebarSearchSelection(uiState, event.target);
}

function handleSidebarFocusOut(event) {
    if (event.target?.dataset?.lorebookPickerSearch === 'true') {
        return;
    }

    if (event.target?.id !== 'ne-note-search') {
        return;
    }

    if (uiState.pendingSearchFocus) {
        return;
    }

    uiState.searchSuggestionIndex = 0;
    uiState.pendingSearchFocus = null;

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Element && sidebarRootEl?.contains(nextTarget)) {
        return;
    }

    renderSidebarController();
}

function handleSidebarKeyDown(event) {
    const editableField = event.target.closest('[data-field-action]');
    if (editableField) {
        if (event.key === 'Enter') {
            event.preventDefault();
            editableField.blur();
        }
        return;
    }

    if (event.target?.dataset?.lorebookPickerSearch === 'true') {
        if (event.key === 'Escape') {
            uiState.lorebookPickerMode = null;
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            renderSidebarController();
        }
        return;
    }

    if (event.target?.closest('[data-lore-entry-create-dialog="true"]')) {
        if (event.key === 'Escape') {
            uiState.loreEntryCreationOpen = false;
            uiState.loreEntryCreationMode = 'entry';
            uiState.loreEntryCreationLorebookId = '';
            uiState.loreEntryCreationPositionKey = '';
            uiState.loreEntryCreationOrder = '100';
            uiState.loreEntryCreationLorebookName = '';
            renderSidebarController();
        }
        return;
    }

    if (event.target?.id !== 'ne-note-search') {
        return;
    }

    handleSidebarSearchKeyDown(
        event,
        uiState,
        getActiveSearchTagSuggestions,
        renderSidebarController,
        applySearchTagSuggestion,
    );
}

function handleSidebarKeyUp(event) {
    if (event.target?.id !== 'ne-note-search') {
        return;
    }

    if (isSidebarInputComposing(uiState, event.target) || event.isComposing) {
        return;
    }

    if (shouldSkipSidebarSearchKeyUp(event)) {
        return;
    }

    syncSidebarSearch(event.target);
}

function handleSidebarCompositionStart(event) {
    beginSidebarInputComposition(uiState, event.target);
}

function handleSidebarCompositionEnd(event) {
    const focusKey = endSidebarInputComposition(uiState, event.target);
    if (!focusKey) {
        return;
    }

    if (event.target?.dataset?.deletePanelLorebookSearch === 'true') {
        queueSidebarBodySearchInputUpdate(event.target, (value) => {
            uiState.bulkDeleteLorebookSearch = value;
        }, {
            render: renderDeletePanelLorebookResults,
        });
        return;
    }

    if (event.target?.dataset?.lorebookPickerSearch === 'true') {
        queueSidebarBodySearchInputUpdate(event.target, (value) => {
            uiState.lorebookPickerSearch = value;
        }, {
            render: renderLorebookPickerResults,
        });
        return;
    }

    if (event.target?.id === 'ne-note-search') {
        syncSidebarSearch(event.target, { resetSuggestionIndex: true });
    }
}

function createDefaultSidebarUiState() {
    return {
        moveMenuNoteId: null,
        revealedRowKey: '',
        swipeConsumedRowKey: '',
        pendingSearchFocus: null,
        searchSelection: null,
        searchSuggestionIndex: 0,
        pendingBodyInputFocus: null,
        activeCompositionInputKey: '',
        lorebookPickerMode: null,
        lorebookPickerSlotId: null,
        lorebookPickerSearch: '',
        lorebookPageById: {},
        lastLorebookSearch: '',
        deletePanelOpen: false,
        loreEntryCreationOpen: false,
        loreEntryCreationMode: 'entry',
        loreEntryCreationLorebookId: '',
        loreEntryCreationPositionKey: '',
        loreEntryCreationOrder: '100',
        loreEntryCreationLorebookName: '',
        bulkSelectedEntryKeys: new Set(),
        bulkDeleteLorebookSearch: '',
        bulkSelectedLorebookNames: new Set(),
        collapsedFolderIds: new Set(),
        noteBulkSelectMode: false,
        bulkSelectedNoteIds: new Set(),
        bulkSelectedFolderIds: new Set(),
        settingsPanelOpen: false,
        noteExportPickerOpen: false,
        lorebookExportOptionsOpen: false,
        lorebookExportPickerOpen: false,
        noteTransferExportFormat: 'md',
        lorebookTransferExportFormat: 'md',
        noteTransferSelection: {
            selectedFolderIds: new Set(),
            selectedNoteIds: new Set(),
        },
        lorebookTransferSelection: {
            selectedLorebookIds: new Set(),
            selectedEntryKeys: new Set(),
        },
    };
}

function restoreSidebarSearchFocus() {
    restoreSidebarSearchFocusState(uiState, searchInputEl, sidebarToolsEl);
}

function queueSidebarBodySearchInputUpdate(inputEl, applyValue, { render = renderSidebarController } = {}) {
    if (!(inputEl instanceof HTMLInputElement) || typeof applyValue !== 'function') {
        return;
    }

    uiState.pendingSearchFocus = null;
    applyValue(inputEl.value);
    rememberSidebarBodyInputFocus(inputEl);
    clearTimeout(sidebarBodyInputTimer);
    sidebarBodyInputTimer = setTimeout(() => {
        sidebarBodyInputTimer = null;
        render();
    }, 150);
}

function rememberSidebarBodyInputFocus(inputEl) {
    const focusKey = String(inputEl.dataset.sidebarInputKey ?? '').trim();
    if (!focusKey) {
        uiState.pendingBodyInputFocus = null;
        return;
    }

    const caret = inputEl.selectionStart ?? inputEl.value.length;
    uiState.pendingBodyInputFocus = {
        key: focusKey,
        start: caret,
        end: inputEl.selectionEnd ?? caret,
    };
}

function restorePendingSidebarBodyInputFocus() {
    const pendingFocus = uiState.pendingBodyInputFocus;
    if (!pendingFocus) {
        return false;
    }

    uiState.pendingBodyInputFocus = null;
    const tryRestore = (remainingAttempts = 3) => {
        const selector = `[data-sidebar-input-key="${CSS.escape(pendingFocus.key)}"]`;
        const inputEl = sidebarRootEl?.querySelector(selector);
        if (!(inputEl instanceof HTMLInputElement) && !(inputEl instanceof HTMLTextAreaElement)) {
            return;
        }

        if (document.activeElement !== inputEl) {
            inputEl.focus({ preventScroll: true });
        }
        if (typeof inputEl.setSelectionRange !== 'function') {
            return;
        }

        const start = Math.min(pendingFocus.start, inputEl.value.length);
        const end = Math.min(pendingFocus.end, inputEl.value.length);
        inputEl.setSelectionRange(start, end);
        if (document.activeElement === inputEl || remainingAttempts <= 1) {
            return;
        }

        requestAnimationFrame(() => tryRestore(remainingAttempts - 1));
    };

    requestAnimationFrame(() => tryRestore());
    return true;
}

function renderDeletePanelLorebookResults() {
    if (!sidebarBodyEl?.isConnected || !uiState.deletePanelOpen) {
        renderSidebarController();
        return;
    }

    const sessionState = getSessionState();
    if (normaliseDocumentSource(sessionState.activeSource) !== 'lorebook') {
        renderSidebarController();
        return;
    }

    const model = buildLorebookSidebarModel(getLorebookState(), sessionState, uiState);
    currentSidebarModel = model;
    const region = sidebarBodyEl.querySelector('[data-delete-panel-region="lorebook-files"]');
    if (!region) {
        renderSidebarController();
        return;
    }

    region.innerHTML = renderDeletePanelLorebookFiles(model);
}

function renderLorebookPickerResults() {
    if (!sidebarBodyEl?.isConnected) {
        renderSidebarController();
        return;
    }

    const sessionState = getSessionState();
    if (normaliseDocumentSource(sessionState.activeSource) !== 'lorebook') {
        renderSidebarController();
        return;
    }

    const model = buildLorebookSidebarModel(getLorebookState(), sessionState, uiState);
    currentSidebarModel = model;
    if (!model.picker) {
        renderSidebarController();
        return;
    }

    const inputKey = getSidebarInputKey(sidebarRootEl.querySelector('[data-lorebook-picker-search="true"]'));
    const expectedInputKey = `lorebook-picker-search:${model.picker.mode}${model.picker.slotId ? `:${model.picker.slotId}` : ''}`;
    if (inputKey && inputKey !== expectedInputKey) {
        renderSidebarController();
        return;
    }

    const region = sidebarBodyEl.querySelector('[data-lorebook-picker-region="options"]');
    if (!region) {
        renderSidebarController();
        return;
    }

    region.innerHTML = renderLorebookPickerOptions(model.picker);
}

function closeSidebar() {
    const panel = document.getElementById('ne-panel');
    if (!panel?.classList.contains('ne-panel--menu-open')) {
        return;
    }

    resetSidebarControllerState();
    panel.dispatchEvent(new CustomEvent('ne:set-menu-open', { detail: { open: false } }));
}

function closeSidebarAfterDocumentSelection() {
    if (!isMobileViewport()) {
        return;
    }

    closeSidebar();
}

function openSidebar() {
    const panel = document.getElementById('ne-panel');
    if (panel?.classList.contains('ne-panel--menu-open')) {
        return;
    }

    panel?.dispatchEvent(new CustomEvent('ne:set-menu-open', { detail: { open: true } }));
}

function syncSidebarSearch(searchInput, { resetSuggestionIndex = false } = {}) {
    syncSidebarSearchValue(searchInput, uiState, getSessionState, setSessionSearch, renderSidebarController, {
        resetSuggestionIndex,
    });
}

function applySearchTagSuggestion(tag) {
    applySidebarSearchTagSuggestion(tag, uiState, searchInputEl, getSessionState, setSessionSearch);
}

function getActiveSearchTagSuggestions() {
    return getActiveSidebarSearchTagSuggestions(() => currentSidebarModel);
}

function handleSidebarSwipeMove(event) {
    const previousTouchSwipeState = touchSwipeState;
    const { nextTouchSwipeState, shouldRender } = updateSidebarSwipe(event, touchSwipeState, uiState);
    touchSwipeState = nextTouchSwipeState;
    if (
        previousTouchSwipeState
        && !previousTouchSwipeState.handled
        && nextTouchSwipeState?.handled
        && nextTouchSwipeState.axis === 'x'
    ) {
        uiState.swipeConsumedRowKey = previousTouchSwipeState.rowKey;
    }
    if (shouldRender) {
        renderSidebarController();
    }
}

function handleSidebarSwipeEnd() {
    clearTouchSwipeState();
}

function clearTouchSwipeState(event = null) {
    if (!touchSwipeState) {
        return;
    }

    const pointerId = event?.pointerId ?? touchSwipeState.pointerId;
    try {
        rootEl?.releasePointerCapture?.(pointerId);
    } catch (error) {
        if (error?.name !== 'NotFoundError') {
            console.warn('[NoteEditor] Pointer capture release failed on sidebar swipe end.', error);
        }
    }

    touchSwipeState = null;
}

function syncSettingsPreviewValue(field, value) {
    if (field !== 'panelFontScale') {
        return;
    }

    const labelEl = sidebarRootEl?.querySelector('[data-settings-preview-value="panelFontScale"]');
    if (!labelEl) {
        return;
    }

    const percent = Math.round(Number(value) * 100);
    labelEl.textContent = `${percent}%`;
}
