// src/editor.js
// Responsible for: composing the writing surface, syncing active document state,
// and handling source-aware editor interactions.

import {
    addCurrentDocumentTerm,
    addCurrentDocumentTerms,
    addCurrentDocumentSecondaryTerm,
    createCurrentSourceDocument,
    removeCurrentDocumentTerm,
    removeCurrentDocumentSecondaryTerm,
    setCurrentDocumentSecondaryTermLogic,
    updateCurrentDocument,
} from './document-actions.js';
import {
    DOCUMENT_SOURCE_LOREBOOK,
    getDefaultDocumentTitle,
    getSuggestedDocumentTerm,
    normaliseDocumentSource,
} from './document-source.js';
import { t } from './i18n/index.js';
import { getActiveCharacterSummary, runWithSuppressedToasts } from './services/st-context.js';
import {
    flushActiveDocumentAutosave,
    getActiveDocumentState,
    subscribeActiveDocumentState,
} from './state/document-store.js';
import { getSessionState, subscribeSession } from './state/session-store.js';
import { subscribeSettings } from './state/settings-store.js';
import {
    activateSidebarTagFilter,
    handleSidebarDocumentPointerDown,
    mountSidebarController,
    openLoreEntryCreationDialog,
    renderSidebarController,
    resetSidebarControllerState,
} from './sidebar-controller.js';
import {
    createMarkdownConverter,
    getFormattedEditorState,
    getInlineTermCommitState,
    renderDocumentPreview,
} from './editor-document.js';
import { getDisplayTitle, getEditorRefs, renderEditorShell, syncFieldValue } from './editor-shell.js';
import {
    handleTitleButtonActivation,
    startTitleEditingUi,
    stopTitleEditingUi,
    syncTagsMenuState as syncTagsMenuUiState,
    updateDocumentTermsButtonState as updateTermsButtonUiState,
    updateLoreOverflowPanelPlacement,
    updateTagsMenuPlacement,
} from './editor-toolbar.js';
import { renderDocumentTermsMenu, renderLorebookMetadataTable } from './ui/editor-view.js';

const editorState = {
    rootEl: null,
    editorShellEl: null,
    sidebarRootEl: null,
    documentMetaEl: null,
    contentInputEl: null,
    previewEl: null,
    emptyStateEl: null,
    emptyStateMessageEl: null,
    emptyStateActionEl: null,
    formatBarEl: null,
    toolbarRefs: null,
    toolbarTitleEl: null,
    toolbarTitleInputEl: null,
    tagsButtonEl: null,
    tagsButtonLabelEl: null,
    tagsMenuEl: null,
    tagsWrapEl: null,
    tagsMenuAnchorEl: null,
    unsubscribeDocumentState: null,
    unsubscribeSession: null,
    unsubscribeSettings: null,
    documentState: null,
    sessionState: getSessionState(),
    tagsMenuOpen: false,
    markdownConverter: null,
    globalEventsBound: false,
    previewState: null,
    lastSidebarRenderKey: null,
    titleEditingDocumentId: null,
    pendingTitleEditDocumentId: null,
    pendingTitleEditActivationId: null,
    loreMetadataExpanded: false,
    loreOverflowOpen: false,
    lastLoreMetaDocumentId: null,
};

const boundToolbarButtons = new WeakSet();
const boundToolbarInputs = new WeakSet();
const boundToolbarMenus = new WeakSet();

// Singleton lifetime is intentional: the editor mounts once and lives for the page session.
export function mountEditor(root, { toolbar } = {}) {
    if (!root) {
        return;
    }

    if (editorState.rootEl === root) {
        syncToolbarRefs(toolbar);
        return;
    }

    editorState.rootEl = root;
    editorState.tagsMenuOpen = false;
    editorState.lastSidebarRenderKey = null;
    syncToolbarRefs(toolbar);
    editorState.markdownConverter ??= createMarkdownConverter();

    editorState.rootEl.innerHTML = renderEditorShell();
    Object.assign(editorState, getEditorRefs(editorState.rootEl));

    mountSidebarController({
        root: editorState.rootEl,
        sidebarRoot: editorState.sidebarRootEl,
        onCloseTagsMenu: closeTagsMenu,
        onCreateNote: createAndFocusCurrentDocument,
    });

    bindEditorEvents();
    subscribeEditorState();
    bindGlobalEvents();
}

export function flushEditorState() {
    flushActiveDocumentAutosave();
}

export function toggleToolbarTermsMenu(anchorEl = null) {
    toggleTagsMenu(anchorEl);
}

export function closeToolbarTermsMenu() {
    closeTagsMenu();
}

export function refreshEditorView() {
    if (!editorState.rootEl?.isConnected || !editorState.documentState) {
        return;
    }

    renderEditor(editorState.documentState, editorState.sessionState);
}

function syncToolbarRefs(nextToolbarRefs) {
    editorState.toolbarRefs = nextToolbarRefs ?? null;
    editorState.toolbarTitleEl = editorState.toolbarRefs?.titleButton ?? null;
    editorState.toolbarTitleInputEl = editorState.toolbarRefs?.titleInput ?? null;
    editorState.tagsButtonEl = editorState.toolbarRefs?.tagsButton ?? null;
    editorState.tagsButtonLabelEl = editorState.toolbarRefs?.tagsButtonLabel ?? null;
    editorState.tagsMenuEl = editorState.toolbarRefs?.tagsMenu ?? null;
    editorState.tagsWrapEl = editorState.toolbarRefs?.tagsWrap ?? null;
    editorState.tagsMenuAnchorEl = editorState.tagsWrapEl ?? null;
    bindToolbarRefEvents();
}

function subscribeEditorState() {
    editorState.unsubscribeDocumentState?.();
    editorState.unsubscribeSession?.();
    editorState.unsubscribeSettings?.();

    editorState.unsubscribeDocumentState = subscribeActiveDocumentState((documentState) => {
        editorState.documentState = documentState;
        renderEditor(documentState, editorState.sessionState);
    });

    editorState.unsubscribeSession = subscribeSession((sessionState) => {
        const sourceChanged = sessionState.activeSource !== editorState.sessionState.activeSource;
        editorState.sessionState = sessionState;
        if (!editorState.documentState) {
            return;
        }

        if (sourceChanged) {
            editorState.titleEditingDocumentId = null;
            editorState.pendingTitleEditDocumentId = null;
            editorState.pendingTitleEditActivationId = null;
            editorState.loreMetadataExpanded = false;
            editorState.loreOverflowOpen = false;
            editorState.documentState = getActiveDocumentState(sessionState);
            editorState.lastSidebarRenderKey = null;
            renderEditor(editorState.documentState, sessionState);
            return;
        }

        renderSidebarController(editorState.documentState, sessionState);
    });

    editorState.unsubscribeSettings = subscribeSettings(() => {
        editorState.sessionState = getSessionState();
        editorState.documentState = getActiveDocumentState(editorState.sessionState);
        renderEditor(editorState.documentState, editorState.sessionState);
    });
}

function bindGlobalEvents() {
    if (editorState.globalEventsBound) {
        return;
    }

    editorState.globalEventsBound = true;
    window.addEventListener('beforeunload', flushActiveDocumentAutosave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointerdown', handleDocumentPointerDown);
}

function bindEditorEvents() {
    editorState.rootEl.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (actionButton && handleEditorAction(actionButton.dataset.action, actionButton)) {
            return;
        }

        const formatButton = event.target.closest('[data-format]');
        if (formatButton) {
            applyFormat(formatButton.dataset.format);
        }
    });

    editorState.rootEl.addEventListener('input', (event) => {
        if (event.target === editorState.contentInputEl) {
            updateCurrentDocument({ content: editorState.contentInputEl.value });
        }
    });
    editorState.rootEl.addEventListener('change', handleEditorChange);

    editorState.contentInputEl?.addEventListener('keydown', handleContentKeyDown);
    editorState.contentInputEl?.addEventListener('focus', handleContentFocus);
    editorState.contentInputEl?.addEventListener('blur', handleContentBlur);
    editorState.formatBarEl?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
    });

    editorState.documentMetaEl?.addEventListener('keydown', (event) => {
        handleLoreMetadataInputKeyDown(event);
    });
}

function bindToolbarRefEvents() {
    if (editorState.toolbarTitleEl && !boundToolbarButtons.has(editorState.toolbarTitleEl)) {
        boundToolbarButtons.add(editorState.toolbarTitleEl);
        editorState.toolbarTitleEl.addEventListener('pointerup', handleTitleActivation);
        editorState.toolbarTitleEl.addEventListener('click', handleTitleActivation);
        editorState.toolbarTitleEl.addEventListener('keydown', handleToolbarTitleButtonKeyDown);
    }

    if (editorState.toolbarTitleInputEl && !boundToolbarInputs.has(editorState.toolbarTitleInputEl)) {
        boundToolbarInputs.add(editorState.toolbarTitleInputEl);
        editorState.toolbarTitleInputEl.addEventListener('input', handleToolbarTitleInput);
        editorState.toolbarTitleInputEl.addEventListener('blur', handleToolbarTitleBlur);
        editorState.toolbarTitleInputEl.addEventListener('keydown', handleToolbarTitleInputKeyDown);
    }

    if (editorState.tagsButtonEl && !boundToolbarButtons.has(editorState.tagsButtonEl)) {
        boundToolbarButtons.add(editorState.tagsButtonEl);
        editorState.tagsButtonEl.addEventListener('click', handleTagsButtonClick);
    }

    if (editorState.tagsMenuEl && !boundToolbarMenus.has(editorState.tagsMenuEl)) {
        boundToolbarMenus.add(editorState.tagsMenuEl);
        editorState.tagsMenuEl.addEventListener('click', handleTagsMenuClick);
    }
}

function handleToolbarTitleButtonKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    event.preventDefault();
    startTitleEditing();
}

function handleToolbarTitleInput() {
    updateCurrentDocument({ title: editorState.toolbarTitleInputEl?.value ?? '' });
}

function handleToolbarTitleBlur() {
    commitToolbarTitleValue();
    stopTitleEditing(true);
}

function handleToolbarTitleInputKeyDown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        commitToolbarTitleValue();
        editorState.toolbarTitleInputEl?.blur();
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        if (editorState.toolbarTitleInputEl) {
            editorState.toolbarTitleInputEl.value = editorState.documentState?.currentDocument?.title ?? '';
        }
        stopTitleEditing();
    }
}

function handleTagsButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    toggleTagsMenu(editorState.tagsWrapEl);
}

function handleTagsMenuClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
        return;
    }

    handleEditorAction(actionButton.dataset.action, actionButton);
}

function handleEditorAction(action, actionButton) {
    switch (action) {
        case 'new-document':
        case 'new-note':
            if (actionButton.closest('.ne-sidebar')) {
                return false;
            }

            if (normaliseDocumentSource(editorState.sessionState?.activeSource) === DOCUMENT_SOURCE_LOREBOOK) {
                openLoreEntryCreationDialog();
                return true;
            }

            createAndFocusCurrentDocument();
            return true;
        case 'add-document-suggested-term': {
            const currentDocument = editorState.documentState?.currentDocument ?? null;
            const suggestedTerm = getSuggestedDocumentTerm(currentDocument, getActiveCharacterSummary());
            if (suggestedTerm) {
                runQuietMutation(() => addCurrentDocumentTerm(suggestedTerm, currentDocument?.source));
            }
            return true;
        }
        case 'remove-document-term':
            runQuietMutation(() => removeCurrentDocumentTerm(actionButton.dataset.term, editorState.documentState?.currentDocument?.source));
            if (normaliseDocumentSource(editorState.documentState?.currentDocument?.source) === DOCUMENT_SOURCE_LOREBOOK) {
                editorState.loreMetadataExpanded = true;
            }
            return true;
        case 'remove-document-secondary-term':
            runQuietMutation(() => removeCurrentDocumentSecondaryTerm(actionButton.dataset.term, editorState.documentState?.currentDocument?.source));
            if (normaliseDocumentSource(editorState.documentState?.currentDocument?.source) === DOCUMENT_SOURCE_LOREBOOK) {
                editorState.loreMetadataExpanded = true;
            }
            return true;
        case 'activate-document-term':
            if (editorState.documentState?.currentDocument?.meta.termState?.activationMode === 'sidebar-filter') {
                activateSidebarTagFilter(actionButton.dataset.term || '');
            }
            return true;
        case 'toggle-lore-metadata':
            editorState.loreMetadataExpanded = String(actionButton.dataset.expanded ?? 'false') !== 'true';
            if (!editorState.loreMetadataExpanded) {
                editorState.loreOverflowOpen = false;
            }
            renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
            return true;
        case 'toggle-lore-overflow':
            editorState.loreOverflowOpen = String(actionButton.dataset.expanded ?? 'false') !== 'true';
            renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
            return true;
        default:
            return false;
    }
}

function createAndFocusCurrentDocument(overrides = {}) {
    const currentDocumentId = editorState.documentState?.currentDocument?.id ?? null;
    const createdDocument = createCurrentSourceDocument(overrides);
    if (!createdDocument) {
        return;
    }

    closeTagsMenu();
    editorState.titleEditingDocumentId = currentDocumentId === createdDocument.id
        ? currentDocumentId
        : null;
    editorState.pendingTitleEditDocumentId = createdDocument.id;
    editorState.pendingTitleEditActivationId = null;
    schedulePendingTitleEdit(editorState.documentState?.currentDocument ?? createdDocument);
}

function renderEditor(documentState, sessionState) {
    const currentDocument = documentState?.currentDocument ?? null;
    const hasCurrentNote = Boolean(currentDocument);
    const activeCharacter = getActiveCharacterSummary();
    const previewMode = isPreviewMode();
    const activeSource = sessionState.activeSource;
    const currentDocumentId = currentDocument?.id ?? null;

    syncEditorChromeLabels();

    if (
        editorState.titleEditingDocumentId
        && editorState.titleEditingDocumentId !== currentDocumentId
        && !editorState.toolbarTitleInputEl?.hidden
    ) {
        stopTitleEditing(false);
    }

    if (!hasCurrentNote) {
        resetSidebarControllerState();
    }

    const nextSidebarRenderKey = documentState?.sidebarStateKey ?? documentState?.settings ?? null;
    if (editorState.lastSidebarRenderKey !== nextSidebarRenderKey) {
        renderSidebarController(documentState, sessionState);
        editorState.lastSidebarRenderKey = nextSidebarRenderKey;
    }
    if (editorState.tagsMenuEl && (editorState.tagsMenuOpen || !hasCurrentNote)) {
        renderTermsMenuContent(currentDocument, activeCharacter);
    }

    editorState.emptyStateEl.hidden = hasCurrentNote;
    if (editorState.documentMetaEl) {
        editorState.documentMetaEl.hidden = !currentDocument || normaliseDocumentSource(currentDocument.source) !== DOCUMENT_SOURCE_LOREBOOK;
    }
    editorState.contentInputEl.hidden = !hasCurrentNote;
    editorState.previewEl.hidden = !hasCurrentNote;
    editorState.formatBarEl.hidden = !hasCurrentNote;
    if (!hasCurrentNote) {
        setCanvasFocusState(false);
    }
    updateTermsButtonState(currentDocument);
    syncEmptyState(activeSource);

    if (hasCurrentNote) {
        renderDocumentMeta(currentDocument);
        syncFieldValue(editorState.contentInputEl, currentDocument.content);
        syncFieldValue(editorState.toolbarTitleInputEl, currentDocument.title);
        syncPreviewContent(currentDocument, previewMode);
    } else {
        renderDocumentMeta(null);
        editorState.contentInputEl.value = '';
        editorState.toolbarTitleInputEl.value = '';
        editorState.pendingTitleEditDocumentId = null;
        editorState.pendingTitleEditActivationId = null;
        stopTitleEditing(false);
        closeTagsMenu();
        syncPreviewContent(null, previewMode);
    }

    if (editorState.toolbarTitleEl) {
        editorState.toolbarTitleEl.disabled = !hasCurrentNote;
        const defaultTitle = getDefaultDocumentTitle(activeSource);
        editorState.toolbarTitleEl.textContent = currentDocument
            ? getDisplayTitle(currentDocument.title, currentDocument.source)
            : defaultTitle;
        editorState.toolbarTitleEl.title = currentDocument
            ? t('editor.title.currentHint', { title: getDisplayTitle(currentDocument.title, currentDocument.source) })
            : t('editor.title.emptyHint', { label: getDocumentSourceLabel(activeSource) });
    }

    notifyToolbarLayoutUpdate();
    schedulePendingTitleEdit(currentDocument);
}

function handleTitleActivation(event) {
    handleTitleButtonActivation(event, editorState.toolbarTitleEl, startTitleEditing);
}

function startTitleEditing() {
    const currentDocumentId = editorState.documentState?.currentDocument?.id ?? null;
    if (!currentDocumentId) {
        return;
    }

    editorState.titleEditingDocumentId = currentDocumentId;
    if (editorState.pendingTitleEditDocumentId === currentDocumentId) {
        editorState.pendingTitleEditDocumentId = null;
        editorState.pendingTitleEditActivationId = null;
    }
    startTitleEditingUi(
        editorState.documentState?.currentDocument,
        editorState.toolbarTitleEl,
        editorState.toolbarTitleInputEl,
        closeTagsMenu,
    );
}

function stopTitleEditing(shouldFlush = true) {
    editorState.titleEditingDocumentId = null;
    editorState.pendingTitleEditActivationId = null;
    stopTitleEditingUi(
        editorState.toolbarTitleEl,
        editorState.toolbarTitleInputEl,
        flushActiveDocumentAutosave,
        shouldFlush,
    );
}

function commitToolbarTitleValue() {
    if (!editorState.toolbarTitleInputEl || editorState.toolbarTitleInputEl.hidden) {
        return;
    }

    updateCurrentDocument({ title: editorState.toolbarTitleInputEl.value });
}

function toggleTagsMenu(anchorEl = null) {
    if (editorState.tagsButtonEl?.hidden && !anchorEl) {
        return;
    }

    editorState.tagsMenuAnchorEl = anchorEl ?? editorState.tagsWrapEl ?? editorState.tagsButtonEl ?? null;
    editorState.tagsMenuOpen = !editorState.tagsMenuOpen;
    if (editorState.tagsMenuOpen) {
        renderTermsMenuContent();
    }
    syncTagsMenuState();
}

function closeTagsMenu() {
    editorState.tagsMenuOpen = false;
    editorState.tagsMenuAnchorEl = editorState.tagsWrapEl ?? null;
    syncTagsMenuState();
}

function syncTagsMenuState() {
    syncTagsMenuUiState(
        editorState.tagsButtonEl,
        editorState.tagsMenuEl,
        editorState.tagsMenuOpen,
        updateEditorTagsMenuPlacement,
        editorState.tagsMenuAnchorEl,
    );
}

function handleDocumentPointerDown(event) {
    if (!editorState.rootEl?.isConnected) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    if (
        editorState.toolbarTitleInputEl
        && !editorState.toolbarTitleInputEl.hidden
        && target !== editorState.toolbarTitleInputEl
        && !editorState.toolbarTitleInputEl.contains(target)
        && (!editorState.toolbarTitleEl || (target !== editorState.toolbarTitleEl && !editorState.toolbarTitleEl.contains(target)))
    ) {
        commitToolbarTitleValue();
        stopTitleEditing(true);
    }

    if (
        editorState.tagsMenuOpen
        && editorState.tagsMenuEl
        && !editorState.tagsMenuEl.contains(target)
        && !editorState.tagsMenuAnchorEl?.contains?.(target)
    ) {
        closeTagsMenu();
    }

    if (editorState.loreOverflowOpen && editorState.documentMetaEl && !editorState.documentMetaEl.contains(target)) {
        editorState.loreOverflowOpen = false;
        renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
    }

    handleSidebarDocumentPointerDown(target);
}

function updateTermsButtonState(currentDocument) {
    updateTermsButtonUiState(
        editorState.tagsButtonEl,
        editorState.tagsButtonLabelEl,
        currentDocument,
        isPreviewMode(),
        closeTagsMenu,
    );
}

function isPreviewMode() {
    return document.getElementById('ne-panel')?.classList.contains('ne-panel--preview') ?? false;
}

function updateEditorTagsMenuPlacement() {
    updateTagsMenuPlacement(editorState.tagsMenuEl, editorState.tagsMenuAnchorEl);
}

function renderTermsMenuContent(
    currentDocument = editorState.documentState?.currentDocument ?? null,
    activeCharacter = getActiveCharacterSummary(),
) {
    if (!editorState.tagsMenuEl) {
        return;
    }

    editorState.tagsMenuEl.innerHTML = renderDocumentTermsMenu(currentDocument, {
        source: editorState.sessionState.activeSource,
        suggestedTerm: getSuggestedDocumentTerm(currentDocument, activeCharacter),
    });
}

function renderDocumentMeta(currentDocument = editorState.documentState?.currentDocument ?? null) {
    if (!editorState.documentMetaEl) {
        return;
    }

    const isLorebookDocument = normaliseDocumentSource(currentDocument?.source) === DOCUMENT_SOURCE_LOREBOOK;
    if (!currentDocument || !isLorebookDocument || isPreviewMode()) {
        editorState.documentMetaEl.innerHTML = '';
        editorState.documentMetaEl.hidden = true;
        editorState.loreOverflowOpen = false;
        return;
    }

    if (editorState.lastLoreMetaDocumentId !== currentDocument.id) {
        editorState.loreMetadataExpanded = false;
        editorState.loreOverflowOpen = false;
        editorState.lastLoreMetaDocumentId = currentDocument.id;
    }

    editorState.documentMetaEl.hidden = false;
    editorState.documentMetaEl.innerHTML = renderLorebookMetadataTable(currentDocument, {
        isExpanded: editorState.loreMetadataExpanded,
        isOverflowOpen: editorState.loreOverflowOpen,
    });

    if (editorState.loreOverflowOpen) {
        requestAnimationFrame(() => {
            const overflowPanelEl = editorState.documentMetaEl?.querySelector('[data-lore-overflow-panel]');
            const overflowAnchorEl = editorState.documentMetaEl?.querySelector('.ne-lore-meta__overflow-wrap');
            updateLoreOverflowPanelPlacement(overflowPanelEl, overflowAnchorEl);
        });
    }
}

function syncEmptyState(activeSource) {
    if (editorState.emptyStateMessageEl) {
        editorState.emptyStateMessageEl.textContent = activeSource === 'lorebook'
            ? t('editor.empty.lorebook.message')
            : t('editor.empty.note.message');
    }

    if (editorState.emptyStateActionEl) {
        editorState.emptyStateActionEl.textContent = activeSource === 'lorebook'
            ? t('source.lorebook.createLabel')
            : t('source.note.createLabel');
    }
}

function syncEditorChromeLabels() {
    if (editorState.formatBarEl) {
        editorState.formatBarEl.setAttribute('aria-label', t('editorShell.formatBar.aria'));
    }

    syncFormatButtonLabel('bold', t('editorShell.format.bold'));
    syncFormatButtonLabel('italic', t('editorShell.format.italic'));
    syncFormatButtonLabel('heading', t('editorShell.format.heading'));
    syncFormatButtonLabel('quote', t('editorShell.format.quote'));
    syncFormatButtonLabel('unordered', t('editorShell.format.unordered'));
    syncFormatButtonLabel('ordered', t('editorShell.format.ordered'));
    syncFormatButtonLabel('indent', t('editorShell.format.indent'));
    syncFormatButtonLabel('outdent', t('editorShell.format.outdent'));
    syncFormatButtonLabel('clear', t('editorShell.format.clear'), t('editorShell.format.clearShort'));

    const contentLabelEl = editorState.rootEl?.querySelector('label[for="ne-note-content-input"]');
    if (contentLabelEl) {
        contentLabelEl.textContent = t('editorShell.contentLabel');
    }
}

function syncFormatButtonLabel(format, label, text = null) {
    const button = editorState.formatBarEl?.querySelector(`[data-format="${CSS.escape(format)}"]`);
    if (!button) {
        return;
    }

    button.title = label;
    button.setAttribute('aria-label', label);
    if (text !== null) {
        button.textContent = text;
    }
}

function getDocumentSourceLabel(source) {
    return source === 'lorebook'
        ? t('source.lorebook.documentLabel')
        : t('source.note.documentLabel');
}

function notifyToolbarLayoutUpdate() {
    editorState.toolbarRefs?.root?.dispatchEvent(new CustomEvent('ne:toolbar-layout-update', {
        bubbles: true,
    }));
}

function syncPreviewContent(currentDocument, previewMode) {
    if (!editorState.previewEl) {
        return;
    }

    if (!currentDocument || !previewMode) {
        if (editorState.previewEl.innerHTML) {
            editorState.previewEl.innerHTML = '';
        }

        editorState.previewState = null;
        return;
    }

    const nextPreviewState = {
        documentId: currentDocument.id,
        source: currentDocument.source,
        content: currentDocument.content,
        termsKey: (currentDocument.meta.termState?.items ?? []).join('\u0001'),
    };
    if (
        editorState.previewState
        && editorState.previewState.documentId === nextPreviewState.documentId
        && editorState.previewState.source === nextPreviewState.source
        && editorState.previewState.content === nextPreviewState.content
        && editorState.previewState.termsKey === nextPreviewState.termsKey
    ) {
        return;
    }

    editorState.previewEl.innerHTML = renderDocumentPreview(currentDocument, editorState.markdownConverter);
    editorState.previewState = nextPreviewState;
}

function applyFormat(type) {
    if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return;
    }

    const nextEditorState = getFormattedEditorState(
        editorState.contentInputEl.value,
        editorState.contentInputEl.selectionStart ?? 0,
        editorState.contentInputEl.selectionEnd ?? 0,
        type,
    );

    editorState.contentInputEl.value = nextEditorState.value;
    editorState.contentInputEl.focus();
    editorState.contentInputEl.setSelectionRange(nextEditorState.selectionStart, nextEditorState.selectionEnd);
    updateCurrentDocument({ content: nextEditorState.value });
}

function handleContentKeyDown(event) {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        applyFormat(event.shiftKey ? 'outdent' : 'indent');
        return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    // Terms should commit only from a dedicated #line so regular writing stays predictable.
    if (commitCurrentTermLine()) {
        event.preventDefault();
    }
}

function handleContentFocus() {
    setCanvasFocusState(true);
}

function handleContentBlur() {
    setCanvasFocusState(false);
    flushActiveDocumentAutosave();
}

function setCanvasFocusState(isFocused) {
    editorState.editorShellEl?.classList.toggle('ne-editor-shell--canvas-focused', Boolean(isFocused));
}

function commitCurrentTermLine() {
    if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return false;
    }

    const nextEditorState = getInlineTermCommitState(
        editorState.contentInputEl.value,
        editorState.contentInputEl.selectionStart ?? 0,
        editorState.contentInputEl.selectionEnd ?? 0,
    );
    if (!nextEditorState) {
        return false;
    }

    editorState.contentInputEl.value = nextEditorState.value;
    editorState.contentInputEl.setSelectionRange(nextEditorState.selectionStart, nextEditorState.selectionEnd);
    runQuietMutation(() => addCurrentDocumentTerms(nextEditorState.terms, editorState.documentState?.currentDocument?.source));
    updateCurrentDocument({ content: nextEditorState.value });
    return true;
}

function handleEditorChange(event) {
    if (event.target?.dataset?.action === 'set-document-secondary-logic') {
        runQuietMutation(() => setCurrentDocumentSecondaryTermLogic(event.target.value, editorState.documentState?.currentDocument?.source));
        editorState.loreMetadataExpanded = true;
        return;
    }

    if (event.target?.dataset?.action === 'set-lore-entry-exclude-recursion') {
        editorState.loreOverflowOpen = true;
        runQuietMutation(() => updateCurrentDocument({
            excludeRecursion: Boolean(event.target.checked),
        }, editorState.documentState?.currentDocument?.source));
        return;
    }

    if (event.target?.dataset?.action === 'set-lore-entry-prevent-recursion') {
        editorState.loreOverflowOpen = true;
        runQuietMutation(() => updateCurrentDocument({
            preventRecursion: Boolean(event.target.checked),
        }, editorState.documentState?.currentDocument?.source));
        return;
    }

    if (event.target?.dataset?.action === 'set-lore-entry-probability') {
        editorState.loreOverflowOpen = true;
        runQuietMutation(() => updateCurrentDocument({
            probability: event.target.value,
        }, editorState.documentState?.currentDocument?.source));
    }
}

function handleLoreMetadataInputKeyDown(event) {
    const action = event.target?.dataset?.action;
    if (action === 'set-lore-entry-probability' && event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
        return true;
    }

    if (action !== 'add-document-primary-keyword' && action !== 'add-document-secondary-keyword') {
        return false;
    }

    if (event.key !== 'Enter') {
        return false;
    }

    event.preventDefault();
    const value = String(event.target.value ?? '').trim();
    if (!value) {
        return true;
    }

    if (action === 'add-document-primary-keyword') {
        runQuietMutation(() => addCurrentDocumentTerm(value, editorState.documentState?.currentDocument?.source));
    } else {
        runQuietMutation(() => addCurrentDocumentSecondaryTerm(value, editorState.documentState?.currentDocument?.source));
    }

    editorState.loreMetadataExpanded = true;
    event.target.value = '';
    renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
    return true;
}

function schedulePendingTitleEdit(currentDocument) {
    const currentDocumentId = currentDocument?.id ?? null;
    if (!currentDocumentId || editorState.pendingTitleEditDocumentId !== currentDocumentId) {
        return;
    }

    if (editorState.pendingTitleEditActivationId === currentDocumentId) {
        return;
    }

    editorState.pendingTitleEditActivationId = currentDocumentId;
    requestAnimationFrame(() => {
        if (editorState.pendingTitleEditActivationId === currentDocumentId) {
            editorState.pendingTitleEditActivationId = null;
        }

        if (
            editorState.pendingTitleEditDocumentId !== currentDocumentId
            || editorState.documentState?.currentDocument?.id !== currentDocumentId
        ) {
            return;
        }

        startTitleEditing();
    });
}

function runQuietMutation(mutator) {
    return runWithSuppressedToasts(mutator);
}

function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        flushActiveDocumentAutosave();
    }
}
