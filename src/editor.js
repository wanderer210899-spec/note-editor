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
import { getActiveCharacterSummary } from './services/st-context.js';
import { runWithSuppressedToasts } from './ui-feedback.js';
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
import {
    renderDocumentSourceTerms,
    renderDocumentTermsMenu,
    renderLorebookMetadataTable,
} from './ui/editor-view.js';

const CONTENT_SYNC_DELAY_MS = 180;

const editorState = {
    rootEl: null,
    editorShellEl: null,
    sidebarRootEl: null,
    documentMetaEl: null,
    sourceTermsEl: null,
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
    lastLoreMetaRenderKey: '',
    pendingContentTimer: 0,
    pendingContentValue: null,
    pendingContentDocumentId: null,
    pendingContentSource: null,
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
    flushPendingContentSync();
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
        const shouldRender = shouldRenderDocumentState(documentState);
        editorState.documentState = documentState;
        if (shouldRender) {
            renderEditor(documentState, editorState.sessionState);
        }
    });

    editorState.unsubscribeSession = subscribeSession((sessionState) => {
        const sourceChanged = sessionState.activeSource !== editorState.sessionState.activeSource;
        editorState.sessionState = sessionState;
        if (!editorState.documentState) {
            return;
        }

        if (sourceChanged) {
            flushPendingContentSync();
            editorState.titleEditingDocumentId = null;
            editorState.pendingTitleEditDocumentId = null;
            editorState.pendingTitleEditActivationId = null;
            editorState.loreMetadataExpanded = false;
            editorState.loreOverflowOpen = false;
            editorState.lastLoreMetaRenderKey = '';
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
    window.addEventListener('beforeunload', flushEditorState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    window.addEventListener('ne:flush-editor-state', handleExternalEditorFlushRequest);
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
            schedulePendingContentSync(editorState.contentInputEl.value);
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
    editorState.documentMetaEl?.addEventListener('beforeinput', (event) => {
        handleLoreMetadataBeforeInput(event);
    });
    editorState.documentMetaEl?.addEventListener('focusout', (event) => {
        handleLoreMetadataFocusOut(event);
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
    flushPendingContentSync();
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
    if (editorState.sourceTermsEl) {
        const showSourceTerms = Boolean(currentDocument)
            && !previewMode
            && normaliseDocumentSource(currentDocument?.source) !== DOCUMENT_SOURCE_LOREBOOK;
        editorState.sourceTermsEl.innerHTML = showSourceTerms
            ? renderDocumentSourceTerms(currentDocument)
            : '';
        editorState.sourceTermsEl.hidden = !editorState.sourceTermsEl.innerHTML;
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
        syncFieldValue(editorState.contentInputEl, getRenderedContentValue(currentDocument));
        syncFieldValue(editorState.toolbarTitleInputEl, currentDocument.title);
        syncPreviewContent(getPreviewDocument(currentDocument), previewMode);
    } else {
        clearPendingContentSyncState();
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

function shouldRenderDocumentState(nextDocumentState) {
    const previousDocumentState = editorState.documentState;
    if (!previousDocumentState) {
        return true;
    }

    return !canApplyDocumentStateSilently(previousDocumentState, nextDocumentState);
}

function canApplyDocumentStateSilently(previousDocumentState, nextDocumentState) {
    // If the live textarea already shows the correct text, background sync/save churn
    // should not redraw the whole editor and risk interrupting mobile editing.
    const contentInputEl = editorState.contentInputEl;
    const previousDocument = previousDocumentState?.currentDocument ?? null;
    const nextDocument = nextDocumentState?.currentDocument ?? null;
    if (
        !contentInputEl
        || contentInputEl.hidden
        || document.activeElement !== contentInputEl
        || isPreviewMode()
        || !previousDocument
        || !nextDocument
    ) {
        return false;
    }

    if (
        previousDocument.id !== nextDocument.id
        || previousDocument.source !== nextDocument.source
        || (previousDocumentState?.sidebarStateKey ?? null) !== (nextDocumentState?.sidebarStateKey ?? null)
        || buildDocumentChromeRenderKey(previousDocument) !== buildDocumentChromeRenderKey(nextDocument)
    ) {
        return false;
    }

    return contentInputEl.value === getRenderedContentValue(nextDocument);
}

function buildDocumentChromeRenderKey(currentDocument) {
    const meta = currentDocument?.meta ?? {};
    const nativeTraits = meta.nativeTraits ?? {};
    const position = meta.position ?? {};
    const syncState = meta.syncState ?? {};
    const termState = meta.termState ?? {};

    return [
        currentDocument?.id ?? '',
        currentDocument?.source ?? '',
        currentDocument?.title ?? '',
        String(Boolean(currentDocument?.editable)),
        String(meta.folderId ?? ''),
        String(Boolean(meta.pinned)),
        String(Boolean(meta.enabled)),
        String(meta.activationMode ?? ''),
        String(position.key ?? ''),
        String(position.value ?? ''),
        String(position.label ?? ''),
        (Array.isArray(meta.tags) ? meta.tags : []).join('\u0001'),
        (Array.isArray(meta.keywords) ? meta.keywords : []).join('\u0001'),
        (Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : []).join('\u0001'),
        String(meta.secondaryKeywordLogic ?? ''),
        String(Boolean(nativeTraits.excludeRecursion)),
        String(Boolean(nativeTraits.preventRecursion)),
        String(Number.isFinite(Number(nativeTraits.probability)) ? Number(nativeTraits.probability) : ''),
        String(Number.isFinite(Number(nativeTraits.order)) ? Number(nativeTraits.order) : ''),
        String(nativeTraits.displayIndex ?? ''),
        String(Boolean(syncState.hasExternalChange)),
        String(syncState.lastLoadSource ?? ''),
        String(Boolean(syncState.hasTrustedFreshLoad)),
        String(termState.key ?? ''),
        String(termState.buttonLabel ?? ''),
        String(termState.singularLabel ?? ''),
        String(termState.pluralLabel ?? ''),
        String(termState.emptyHint ?? ''),
        String(termState.unavailableHint ?? ''),
        String(termState.activationMode ?? ''),
        (Array.isArray(termState.items) ? termState.items : []).join('\u0001'),
    ].join('|');
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

    if (!target.closest('#ne-panel')) {
        flushEditorState();
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
        editorState.lastLoreMetaRenderKey = '';
        return;
    }

    if (editorState.lastLoreMetaDocumentId !== currentDocument.id) {
        editorState.loreMetadataExpanded = false;
        editorState.loreOverflowOpen = false;
        editorState.lastLoreMetaDocumentId = currentDocument.id;
        editorState.lastLoreMetaRenderKey = '';
    }

    const nextLoreMetaRenderKey = buildLoreMetadataRenderKey(currentDocument, {
        isExpanded: editorState.loreMetadataExpanded,
        isOverflowOpen: editorState.loreOverflowOpen,
    });

    editorState.documentMetaEl.hidden = false;
    if (editorState.lastLoreMetaRenderKey !== nextLoreMetaRenderKey) {
        editorState.documentMetaEl.innerHTML = renderLorebookMetadataTable(currentDocument, {
            isExpanded: editorState.loreMetadataExpanded,
            isOverflowOpen: editorState.loreOverflowOpen,
        });
        editorState.lastLoreMetaRenderKey = nextLoreMetaRenderKey;
    }

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

function getRenderedContentValue(currentDocument) {
    if (
        currentDocument
        && hasPendingContentSync()
        && currentDocument.id === editorState.pendingContentDocumentId
        && currentDocument.source === editorState.pendingContentSource
    ) {
        return editorState.pendingContentValue;
    }

    return currentDocument?.content ?? '';
}

function getPreviewDocument(currentDocument) {
    if (!currentDocument) {
        return null;
    }

    const content = getRenderedContentValue(currentDocument);
    if (content === currentDocument.content) {
        return currentDocument;
    }

    return {
        ...currentDocument,
        content,
    };
}

function applyFormat(type) {
    if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return;
    }

    flushPendingContentSync();

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
    flushEditorState();
}

function setCanvasFocusState(isFocused) {
    editorState.editorShellEl?.classList.toggle('ne-editor-shell--canvas-focused', Boolean(isFocused));
}

function commitCurrentTermLine() {
    if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return false;
    }

    flushPendingContentSync();

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
    if (commitLoreMetadataKeywordInput(event.target)) {
        return;
    }

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
    commitLoreMetadataKeywordInput(event.target);
    return true;
}

function handleLoreMetadataBeforeInput(event) {
    if (!isLoreMetadataKeywordInput(event.target) || event.inputType !== 'insertLineBreak') {
        return false;
    }

    event.preventDefault();
    commitLoreMetadataKeywordInput(event.target);
    return true;
}

function handleLoreMetadataFocusOut(event) {
    commitLoreMetadataKeywordInput(event.target);
}

function commitLoreMetadataKeywordInput(input) {
    if (!isLoreMetadataKeywordInput(input)) {
        return false;
    }

    const action = String(input.dataset.action ?? '').trim();
    const value = String(input.value ?? '').trim();
    if (!value) {
        return false;
    }

    if (action === 'add-document-primary-keyword') {
        runQuietMutation(() => addCurrentDocumentTerm(value, editorState.documentState?.currentDocument?.source));
    } else {
        runQuietMutation(() => addCurrentDocumentSecondaryTerm(value, editorState.documentState?.currentDocument?.source));
    }

    editorState.loreMetadataExpanded = true;
    input.value = '';
    renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
    return true;
}

function isLoreMetadataKeywordInput(target) {
    if (!(target instanceof HTMLInputElement)) {
        return false;
    }

    const action = String(target.dataset.action ?? '').trim();
    return action === 'add-document-primary-keyword' || action === 'add-document-secondary-keyword';
}

function buildLoreMetadataRenderKey(currentDocument, {
    isExpanded = false,
    isOverflowOpen = false,
} = {}) {
    const meta = currentDocument?.meta ?? {};
    const nativeTraits = meta.nativeTraits ?? {};

    return [
        currentDocument?.id ?? '',
        isExpanded ? 'expanded' : 'collapsed',
        isOverflowOpen ? 'overflow-open' : 'overflow-closed',
        (Array.isArray(meta.keywords) ? meta.keywords : []).join('\u0001'),
        (Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : []).join('\u0001'),
        String(meta.secondaryKeywordLogic ?? ''),
        String(Boolean(nativeTraits.excludeRecursion)),
        String(Boolean(nativeTraits.preventRecursion)),
        String(Number.isFinite(Number(nativeTraits.probability)) ? Number(nativeTraits.probability) : 100),
    ].join('|');
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
        flushEditorState();
    }
}

function schedulePendingContentSync(value) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (!currentDocument || !editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return;
    }

    editorState.pendingContentValue = String(value ?? '');
    editorState.pendingContentDocumentId = currentDocument.id;
    editorState.pendingContentSource = currentDocument.source;

    if (editorState.pendingContentTimer) {
        clearTimeout(editorState.pendingContentTimer);
    }

    editorState.pendingContentTimer = window.setTimeout(() => {
        editorState.pendingContentTimer = 0;
        flushPendingContentSync();
    }, CONTENT_SYNC_DELAY_MS);
}

function flushPendingContentSync() {
    if (!hasPendingContentSync()) {
        clearPendingContentSyncState();
        return false;
    }

    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (
        !currentDocument
        || currentDocument.id !== editorState.pendingContentDocumentId
        || currentDocument.source !== editorState.pendingContentSource
    ) {
        clearPendingContentSyncState();
        return false;
    }

    const nextContent = editorState.pendingContentValue ?? '';
    const changed = currentDocument.content !== nextContent;
    clearPendingContentSyncState();
    if (!changed) {
        return false;
    }

    updateCurrentDocument({ content: nextContent }, currentDocument.source);
    return true;
}

function clearPendingContentSyncState() {
    if (editorState.pendingContentTimer) {
        clearTimeout(editorState.pendingContentTimer);
        editorState.pendingContentTimer = 0;
    }

    editorState.pendingContentValue = null;
    editorState.pendingContentDocumentId = null;
    editorState.pendingContentSource = null;
}

function hasPendingContentSync() {
    return Boolean(
        editorState.pendingContentDocumentId
        && editorState.pendingContentSource
        && editorState.pendingContentValue !== null
    );
}

function handleExternalEditorFlushRequest() {
    flushEditorState();
}
