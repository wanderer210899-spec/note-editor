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
import { extractTagsFromText, stripInlineTags } from './tag-utils.js';
import { runWithSuppressedToasts } from './ui-feedback.js';
import {
    flushActiveDocumentAutosave,
    getActiveDocumentState,
    subscribeActiveDocumentState,
} from './state/document-store.js';
import { getSessionState, subscribeSession } from './state/session-store.js';
import { getSettingsState, subscribeSettings } from './state/settings-store.js';
import {
    activateSidebarTagFilter,
    handleSidebarDocumentPointerDown,
    mountSidebarController,
    openLoreEntryCreationDialog,
    renderSidebarController,
    resetSidebarControllerState,
} from './sidebar-controller.js';
import {
    applyEditorCommand,
    getSmartEnterState,
    getInlineTermCommitState,
    getSmartListDeletionState,
    stripMarkdownToPlainText,
    syncXmlMirrorSession,
    toggleTaskLineByIndex,
} from './editor-commands.js';
import {
    createMarkdownConverter,
    renderDocumentPreview,
    renderHybridDisplay,
} from './editor-display.js';
import {
    EDITOR_MODE_HYBRID,
    EDITOR_MODE_PREVIEW,
    FORMAT_BAR_TOOL_DEFINITIONS,
} from './editor-tool-config.js';
import {
    getDisplayTitle,
    getEditorRefs,
    renderEditorShell,
    renderFormatBarButtons,
    syncFieldValue,
} from './editor-shell.js';
import {
    handleTitleButtonActivation,
    startTitleEditingUi,
    stopTitleEditingUi,
    syncTagsMenuState as syncTagsMenuUiState,
    updateLoreOverflowPanelPlacement,
    updateDocumentTermsButtonState as updateTermsButtonUiState,
    updateTagsMenuPlacement,
} from './editor-toolbar.js';
import {
    renderDocumentSourceTerms,
    renderDocumentTermsMenu,
    renderLorebookMetadataTable,
} from './ui/editor-view.js';
import { escapeHtml, isMobileViewport } from './util.js';

const CONTENT_SYNC_DELAY_MS = 180;
const CONTENT_HISTORY_LIMIT = 100;


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
    settingsState: getSettingsState(),
    tagsMenuOpen: false,
    markdownConverter: null,
    globalEventsBound: false,
    previewState: null,
    lastSidebarRenderKey: null,
    titleEditingDocumentId: null,
    pendingTitleEditDocumentId: null,
    pendingTitleEditActivationId: null,
    loreMetadataExpanded: false,
    loreMetadataHasManualToggle: false,
    loreMetadataAutoCollapsed: false,
    loreMetadataSummaryLayout: null,
    loreMetadataSessionState: new Map(),
    loreOverflowOpen: false,
    lastLoreMetaDocumentId: null,
    lastLoreMetaRenderKey: '',
    loreMetaResizeObserver: null,
    loreMetaFontProbeEl: null,
    pendingLoreMetaLayoutFrame: 0,
    pendingLoreMetaSummaryFrame: 0,
    pendingContentTimer: 0,
    pendingContentValue: null,
    pendingContentDocumentId: null,
    pendingContentSource: null,
    contentHistoryByDocument: new Map(),
    hybridEditing: false,
    xmlMirrorSession: null,
    lastContentSelection: null,
    pendingHybridActivation: null,
    formatBarInteractionActive: false,
    pendingFormatBarInteractionClearTimer: 0,
    lastHandledFormatCommandId: null,
    lastHandledFormatTimestamp: 0,
    pendingHybridBlurExitTimer: 0,
};

const boundToolbarButtons = new WeakSet();
const boundToolbarInputs = new WeakSet();
const boundToolbarMenus = new WeakSet();

// Singleton lifetime is intentional: the editor mounts once and lives for the page session.
export function mountEditor(root, { toolbar } = {}) {
    if (!root) {
        return;
    }

    if (editorState.rootEl === root && hasMountedEditorShell(root)) {
        syncToolbarRefs(toolbar);
        syncFormatBarMarkup();
        return;
    }

    editorState.rootEl = root;
    editorState.tagsMenuOpen = false;
    editorState.lastSidebarRenderKey = null;
    editorState.settingsState = getSettingsState();
    syncToolbarRefs(toolbar);
    editorState.markdownConverter ??= createMarkdownConverter();

    editorState.rootEl.innerHTML = renderEditorShell(editorState.settingsState.formatBarTools);
    Object.assign(editorState, getEditorRefs(editorState.rootEl));
    syncFormatBarMarkup();
    observeLoreMetadataContainer();

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

function hasMountedEditorShell(root) {
    return Boolean(
        root?.firstElementChild
        && editorState.editorShellEl?.isConnected
        && editorState.sidebarRootEl?.isConnected
        && editorState.contentInputEl?.isConnected
    );
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

export function requestTitleEditing() {
    startTitleEditing();
}

export function refreshEditorView() {
    if (!editorState.rootEl?.isConnected) {
        return;
    }

    editorState.settingsState = getSettingsState();
    syncFormatBarMarkup();
    if (!editorState.documentState) {
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

function syncFormatBarMarkup() {
    if (!editorState.formatBarEl) {
        return;
    }

    const nextMarkup = renderFormatBarButtons(editorState.settingsState?.formatBarTools ?? []);
    if (editorState.formatBarEl.innerHTML !== nextMarkup) {
        editorState.formatBarEl.innerHTML = nextMarkup;
    }
    syncEditorChromeLabels();
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
            cancelPendingHybridBlurExit();
            flushPendingContentSync();
            editorState.titleEditingDocumentId = null;
            editorState.pendingTitleEditDocumentId = null;
            editorState.pendingTitleEditActivationId = null;
            editorState.loreMetadataExpanded = false;
            editorState.loreMetadataHasManualToggle = false;
            editorState.loreMetadataAutoCollapsed = false;
            editorState.loreMetadataSummaryLayout = null;
            editorState.loreOverflowOpen = false;
            editorState.lastLoreMetaRenderKey = '';
            editorState.hybridEditing = false;
            editorState.pendingHybridActivation = null;
            editorState.lastContentSelection = null;
            editorState.documentState = getActiveDocumentState(sessionState);
            editorState.lastSidebarRenderKey = null;
            renderEditor(editorState.documentState, sessionState);
            return;
        }

        renderSidebarController(editorState.documentState, sessionState);
    });

    editorState.unsubscribeSettings = subscribeSettings((settingsState) => {
        cancelPendingHybridBlurExit();
        editorState.settingsState = settingsState;
        if (settingsState.editorMode !== EDITOR_MODE_HYBRID) {
            editorState.hybridEditing = false;
            editorState.pendingHybridActivation = null;
        }
        syncFormatBarMarkup();
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
    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    document.addEventListener('ne:panel-layout-state-change', handlePanelLayoutStateChange);
    document.addEventListener('ne:panel-visibility-change', handlePanelVisibilityChange);
    window.addEventListener('ne:flush-editor-state', handleExternalEditorFlushRequest);
}

function observeLoreMetadataContainer() {
    editorState.loreMetaResizeObserver?.disconnect?.();

    if (!editorState.documentMetaEl || typeof ResizeObserver !== 'function') {
        editorState.loreMetaResizeObserver = null;
        return;
    }

    editorState.loreMetaResizeObserver = new ResizeObserver(() => {
        scheduleLoreMetadataLayoutSync();
    });
    editorState.loreMetaResizeObserver.observe(editorState.documentMetaEl);
    const fontProbeEl = ensureLoreMetadataFontProbe();
    if (fontProbeEl) {
        editorState.loreMetaResizeObserver.observe(fontProbeEl);
    }
}

function ensureLoreMetadataFontProbe() {
    if (!editorState.rootEl) {
        return null;
    }

    if (editorState.loreMetaFontProbeEl?.isConnected) {
        return editorState.loreMetaFontProbeEl;
    }

    const probeEl = document.createElement('div');
    probeEl.className = 'ne-lore-meta__font-probe';
    probeEl.setAttribute('aria-hidden', 'true');
    probeEl.innerHTML = `
        <span class="ne-lore-meta__summary-panel">
            <span class="ne-lore-meta__summary-group">
                <span class="ne-lore-meta__summary-label-wrap">
                    <span class="ne-lore-meta__summary-label ne-lore-meta__summary-label--full">AaPrimary keywords:</span>
                    <span class="ne-lore-meta__summary-label ne-lore-meta__summary-label--short">AaPrimary:</span>
                </span>
                <span class="ne-lore-meta__summary-value">
                    <span class="ne-lore-meta__summary-keywords">sample, keyword</span>
                    <span class="ne-lore-meta__summary-more">+99</span>
                </span>
            </span>
            <span class="ne-lore-meta__summary-separator">|</span>
            <span class="ne-lore-meta__summary-group">
                <span class="ne-lore-meta__summary-label-wrap">
                    <span class="ne-lore-meta__summary-label ne-lore-meta__summary-label--full">AaSecondary keywords:</span>
                    <span class="ne-lore-meta__summary-label ne-lore-meta__summary-label--short">AaSecondary:</span>
                </span>
                <span class="ne-lore-meta__summary-value">
                    <span class="ne-lore-meta__summary-keywords">sample</span>
                    <span class="ne-lore-meta__summary-more">+99</span>
                </span>
            </span>
        </span>
    `;
    editorState.rootEl.appendChild(probeEl);
    editorState.loreMetaFontProbeEl = probeEl;
    return probeEl;
}

function bindEditorEvents() {
    editorState.rootEl.addEventListener('click', (event) => {
        const actionButton = getClosestEventTarget(event, '[data-action]');
        if (actionButton && handleEditorAction(actionButton.dataset.action, actionButton)) {
            return;
        }

        const formatButton = getClosestEventTarget(event, '[data-format]');
        if (formatButton) {
            if (wasFormatBarCommandHandledRecently(formatButton.dataset.format)) {
                clearRecentFormatBarCommand();
                return;
            }
            applyFormat(formatButton.dataset.format);
        }
    });

    editorState.rootEl.addEventListener('input', handleEditorInput);
    editorState.rootEl.addEventListener('change', handleEditorChange);

    editorState.contentInputEl?.addEventListener('keydown', handleContentKeyDown);
    editorState.contentInputEl?.addEventListener('focus', handleContentFocus);
    editorState.contentInputEl?.addEventListener('blur', handleContentBlur);
    editorState.contentInputEl?.addEventListener('select', handleContentSelectionChange);
    editorState.contentInputEl?.addEventListener('click', handleContentSelectionChange);
    editorState.contentInputEl?.addEventListener('pointerup', handleContentSelectionChange);
    editorState.contentInputEl?.addEventListener('keyup', handleContentSelectionChange);
    editorState.contentInputEl?.addEventListener('touchend', handleContentSelectionChange);
    editorState.previewEl?.addEventListener('pointerdown', handlePreviewPointerDown);
    editorState.previewEl?.addEventListener('click', handlePreviewClick);
    editorState.previewEl?.addEventListener('keydown', handlePreviewKeyDown);
    editorState.formatBarEl?.addEventListener('click', handleFormatBarClick, true);
    editorState.formatBarEl?.addEventListener('pointerdown', handleFormatBarPointerDown, true);
    editorState.formatBarEl?.addEventListener('mousedown', handleFormatBarMouseDown, true);
    editorState.formatBarEl?.addEventListener('touchstart', handleFormatBarTouchStart, { passive: false, capture: true });
    editorState.formatBarEl?.addEventListener('pointerup', scheduleFormatBarInteractionClear);
    editorState.formatBarEl?.addEventListener('mouseup', scheduleFormatBarInteractionClear);
    editorState.formatBarEl?.addEventListener('touchend', scheduleFormatBarInteractionClear);
    editorState.formatBarEl?.addEventListener('pointercancel', clearFormatBarInteractionState);
    editorState.formatBarEl?.addEventListener('touchcancel', clearFormatBarInteractionState);

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

function handleEditorInput(event) {
    if (event.target !== editorState.contentInputEl) {
        return;
    }

    const syncedXmlSession = syncXmlMirrorSession(
        editorState.contentInputEl.value,
        editorState.xmlMirrorSession,
        editorState.contentInputEl.selectionStart ?? 0,
        editorState.contentInputEl.selectionEnd ?? 0,
    );
    if (syncedXmlSession) {
        if (syncedXmlSession.value !== editorState.contentInputEl.value) {
            editorState.contentInputEl.value = syncedXmlSession.value;
            editorState.contentInputEl.setSelectionRange(
                syncedXmlSession.selectionStart,
                syncedXmlSession.selectionEnd,
            );
        }
        editorState.xmlMirrorSession = syncedXmlSession.session;
    } else {
        editorState.xmlMirrorSession = null;
    }

    schedulePendingContentSync(editorState.contentInputEl.value);
}

function handlePreviewPointerDown(event) {
    if (!isHybridMode() || !editorState.previewEl || editorState.previewEl.hidden) {
        return;
    }

    const target = getEventTargetElement(event);
    if (!target || target.closest('[data-action]')) {
        return;
    }

    editorState.pendingHybridActivation = buildHybridRestoreStateFromTarget(target);
}

function handlePreviewClick(event) {
    if (!isHybridMode() || !editorState.previewEl || editorState.previewEl.hidden) {
        return;
    }

    const target = getEventTargetElement(event);
    if (!target || target.closest('[data-action]')) {
        return;
    }

    enterHybridEditMode(editorState.pendingHybridActivation ?? buildHybridRestoreStateFromTarget(target));
}

function handlePreviewKeyDown(event) {
    if (!isHybridMode() || event.target !== editorState.previewEl) {
        return;
    }

    if (handleStandardEditorHotkeys(event)) {
        return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    event.preventDefault();
    enterHybridEditMode(buildHybridRestoreStateFromSelection());
}

function enterHybridEditMode(restoreState = null) {
    if (!isHybridMode() || !editorState.documentState?.currentDocument) {
        return;
    }

    const nextRestoreState = normalizeHybridRestoreState(restoreState ?? buildHybridRestoreStateFromSelection());
    editorState.hybridEditing = true;
    editorState.pendingHybridActivation = null;
    refreshEditorView();
    requestAnimationFrame(() => {
        restoreHybridEditorViewport(nextRestoreState);
    });
}

function exitHybridEditMode() {
    if (!editorState.hybridEditing) {
        return;
    }

    const nextRestoreState = captureCurrentEditorViewportState();
    editorState.hybridEditing = false;
    editorState.xmlMirrorSession = null;
    editorState.pendingHybridActivation = null;
    refreshEditorView();
    if (nextRestoreState && editorState.previewEl) {
        requestAnimationFrame(() => {
            restoreHybridPreviewViewport(nextRestoreState);
        });
    }
}

function handleFormatBarPointerDown(event) {
    handleFormatBarCommandTrigger(event);
}

function handleFormatBarClick(event) {
    handleFormatBarCommandTrigger(event);
}

function handleFormatBarMouseDown(event) {
    if (window.PointerEvent) {
        return;
    }

    handleFormatBarCommandTrigger(event);
}

function handleFormatBarTouchStart(event) {
    if (window.PointerEvent) {
        return;
    }

    handleFormatBarCommandTrigger(event);
}

function beginFormatBarInteraction() {
    cancelPendingHybridBlurExit();
    cancelPendingFormatBarInteractionClear();
    editorState.formatBarInteractionActive = true;
    syncMobileEditingInteractionState();
}

function clearFormatBarInteractionState() {
    cancelPendingFormatBarInteractionClear();
    editorState.formatBarInteractionActive = false;
    syncMobileEditingInteractionState();
}

function scheduleFormatBarInteractionClear() {
    cancelPendingFormatBarInteractionClear();
    editorState.pendingFormatBarInteractionClearTimer = window.setTimeout(() => {
        editorState.pendingFormatBarInteractionClearTimer = 0;
        editorState.formatBarInteractionActive = false;
        syncMobileEditingInteractionState();
    }, 420);
}

function cancelPendingFormatBarInteractionClear() {
    if (!editorState.pendingFormatBarInteractionClearTimer) {
        return;
    }

    clearTimeout(editorState.pendingFormatBarInteractionClearTimer);
    editorState.pendingFormatBarInteractionClearTimer = 0;
}

function markFormatBarCommandHandled(formatId) {
    editorState.lastHandledFormatCommandId = String(formatId ?? '').trim() || null;
    editorState.lastHandledFormatTimestamp = Date.now();
}

function wasFormatBarCommandHandledRecently(formatId) {
    if (!editorState.lastHandledFormatCommandId || !formatId) {
        return false;
    }

    return editorState.lastHandledFormatCommandId === formatId
        && (Date.now() - editorState.lastHandledFormatTimestamp) < 450;
}

function clearRecentFormatBarCommand() {
    editorState.lastHandledFormatCommandId = null;
    editorState.lastHandledFormatTimestamp = 0;
}

function handleFormatBarCommandTrigger(event) {
    const formatButton = getClosestEventTarget(event, '[data-format]');
    if (!formatButton) {
        return;
    }

    beginFormatBarInteraction();
    event.preventDefault();
    event.stopPropagation();

    const formatId = String(formatButton.dataset.format ?? '').trim();
    if (!formatId) {
        scheduleFormatBarInteractionClear();
        return;
    }

    if (wasFormatBarCommandHandledRecently(formatId)) {
        if (event.type === 'click') {
            clearRecentFormatBarCommand();
        }
        scheduleFormatBarInteractionClear();
        return;
    }

    markFormatBarCommandHandled(formatId);
    applyFormat(formatId);
    if (event.type === 'click') {
        clearRecentFormatBarCommand();
    }
    scheduleFormatBarInteractionClear();
}

function bindToolbarRefEvents() {
    if (editorState.toolbarTitleEl && !boundToolbarButtons.has(editorState.toolbarTitleEl)) {
        boundToolbarButtons.add(editorState.toolbarTitleEl);
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
    // Keep title typing local until commit so store-level untitled/unique-name rules
    // do not rewrite the user's text mid-edit.
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
    const actionButton = getClosestEventTarget(event, '[data-action]');
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
                openLoreMetadataPanel();
            }
            return true;
        case 'remove-document-secondary-term':
            runQuietMutation(() => removeCurrentDocumentSecondaryTerm(actionButton.dataset.term, editorState.documentState?.currentDocument?.source));
            if (normaliseDocumentSource(editorState.documentState?.currentDocument?.source) === DOCUMENT_SOURCE_LOREBOOK) {
                openLoreMetadataPanel();
            }
            return true;
        case 'activate-document-term':
            if (editorState.documentState?.currentDocument?.meta.termState?.activationMode === 'sidebar-filter') {
                activateSidebarTagFilter(actionButton.dataset.term || '');
            }
            return true;
        case 'toggle-lore-metadata':
            editorState.loreOverflowOpen = false;
            setLoreMetadataManualState(editorState.documentState?.currentDocument ?? null, !getResolvedLoreMetadataExpanded(editorState.documentState?.currentDocument ?? null));
            renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
            return true;
        case 'toggle-lore-overflow':
            editorState.loreOverflowOpen = String(actionButton?.dataset.expanded ?? 'false') !== 'true';
            renderDocumentMeta(editorState.documentState?.currentDocument ?? null);
            return true;
        case 'toggle-hybrid-task':
            toggleHybridTask(actionButton.dataset.lineIndex);
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
    const fullPreviewMode = isFullPreviewMode();
    const activeSource = currentDocument?.source ?? sessionState.activeSource;
    const currentDocumentSource = currentDocument?.source ?? activeSource;
    const isLorebookDocument = normaliseDocumentSource(currentDocumentSource) === DOCUMENT_SOURCE_LOREBOOK;
    const hybridMode = isHybridMode();
    const hybridDisplayActive = hybridMode && hasCurrentNote && !editorState.hybridEditing;
    const showRawEditor = hasCurrentNote && (!hybridMode || editorState.hybridEditing) && !fullPreviewMode;
    const showDisplay = hasCurrentNote && (hybridDisplayActive || (fullPreviewMode && !editorState.hybridEditing));
    const currentDocumentId = currentDocument?.id ?? null;
    const titleInputVisible = Boolean(editorState.toolbarTitleInputEl && !editorState.toolbarTitleInputEl.hidden);
    const editingCurrentTitle = titleInputVisible && editorState.titleEditingDocumentId === currentDocumentId;

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
        editorState.documentMetaEl.hidden = !currentDocument || !isLorebookDocument;
    }
    if (editorState.sourceTermsEl) {
        const showSourceTerms = Boolean(currentDocument)
            && !fullPreviewMode
            && !isLorebookDocument;
        editorState.sourceTermsEl.innerHTML = showSourceTerms
            ? renderDocumentSourceTerms(currentDocument)
            : '';
        editorState.sourceTermsEl.hidden = !editorState.sourceTermsEl.innerHTML;
    }
    editorState.contentInputEl.hidden = !showRawEditor;
    editorState.previewEl.hidden = !showDisplay;
    editorState.previewEl.dataset.displayMode = showDisplay
        ? (hybridDisplayActive ? 'hybrid' : 'preview')
        : '';
    editorState.previewEl.tabIndex = hybridDisplayActive ? 0 : -1;
    editorState.formatBarEl.hidden = !showRawEditor;
    if (!hasCurrentNote) {
        setCanvasFocusState(false);
        editorState.hybridEditing = false;
    }
    updateTermsButtonState(currentDocument, fullPreviewMode);
    syncEmptyState(activeSource);

    if (hasCurrentNote) {
        renderDocumentMeta(currentDocument);
        if (showRawEditor) {
            syncFieldValue(editorState.contentInputEl, getRenderedContentValue(currentDocument));
        }
        if (!editingCurrentTitle) {
            syncFieldValue(editorState.toolbarTitleInputEl, currentDocument.title);
        }
        syncPreviewContent(showDisplay ? getPreviewDocument(currentDocument) : null, {
            hybridDisplayActive,
            fullPreviewMode,
        });
        syncCurrentDocumentContentHistory(currentDocument);
    } else {
        clearPendingContentSyncState();
        renderDocumentMeta(null);
        editorState.contentInputEl.value = '';
        editorState.toolbarTitleInputEl.value = '';
        editorState.pendingTitleEditDocumentId = null;
        editorState.pendingTitleEditActivationId = null;
        editorState.xmlMirrorSession = null;
        stopTitleEditing(false);
        closeTagsMenu();
        syncPreviewContent(null, {
            hybridDisplayActive: false,
            fullPreviewMode: false,
        });
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
    syncMobileEditingInteractionState();
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
    const hybridModeActive = isHybridMode();
    if (
        !contentInputEl
        || contentInputEl.hidden
        || document.activeElement !== contentInputEl
        || isFullPreviewMode()
        || (hybridModeActive && !editorState.hybridEditing)
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

    const target = getEventTargetElement(event);
    if (!target) {
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

function buildHybridRestoreStateFromTarget(target) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    const currentDocumentId = currentDocument?.id ?? null;
    const previewScrollTop = editorState.previewEl?.scrollTop ?? 0;
    const selectionStart = getHybridSelectionOffsetFromTarget(target);
    if (selectionStart === null) {
        return buildHybridRestoreStateFromSelection(previewScrollTop);
    }

    return {
        documentId: currentDocumentId,
        source: currentDocument?.source ?? null,
        selectionStart,
        selectionEnd: selectionStart,
        scrollTop: previewScrollTop,
    };
}

function buildHybridRestoreStateFromSelection(scrollTop = editorState.previewEl?.scrollTop ?? 0) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    const storedSelection = editorState.lastContentSelection;
    const currentDocumentId = currentDocument?.id ?? null;
    if (
        currentDocument
        && storedSelection
        && storedSelection.documentId === currentDocumentId
        && storedSelection.source === currentDocument.source
    ) {
        return {
            ...storedSelection,
            scrollTop,
        };
    }

    const currentLength = getRenderedContentValue(currentDocument).length;
    return {
        documentId: currentDocumentId,
        source: currentDocument?.source ?? null,
        selectionStart: currentLength,
        selectionEnd: currentLength,
        scrollTop,
    };
}

function getHybridSelectionOffsetFromTarget(target) {
    if (!(target instanceof Element)) {
        return null;
    }

    const lineElement = target.closest('[data-line-start-offset]');
    if (lineElement) {
        const lineOffset = Number(lineElement.getAttribute('data-line-start-offset'));
        if (Number.isFinite(lineOffset)) {
            return lineOffset;
        }
    }

    const blockElement = target.closest('[data-block-start-offset]');
    if (!blockElement) {
        return null;
    }

    const blockOffset = Number(blockElement.getAttribute('data-block-start-offset'));
    return Number.isFinite(blockOffset) ? blockOffset : null;
}

function normalizeHybridRestoreState(restoreState) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    const contentLength = getRenderedContentValue(currentDocument).length;
    const fallback = buildHybridRestoreStateFromSelection();
    const sourceState = restoreState ?? fallback;
    const nextSelectionStart = clampSelectionOffset(sourceState.selectionStart, contentLength);
    const nextSelectionEnd = clampSelectionOffset(sourceState.selectionEnd ?? nextSelectionStart, contentLength);
    return {
        documentId: currentDocument?.id ?? null,
        source: currentDocument?.source ?? null,
        selectionStart: Math.min(nextSelectionStart, nextSelectionEnd),
        selectionEnd: Math.max(nextSelectionStart, nextSelectionEnd),
        scrollTop: Math.max(0, Number(sourceState.scrollTop) || 0),
    };
}

function restoreHybridEditorViewport(restoreState) {
    const input = editorState.contentInputEl;
    if (!input) {
        return;
    }

    const nextRestoreState = normalizeHybridRestoreState(restoreState);
    const nextScrollTop = getEditorScrollTopForSelection(input, nextRestoreState.selectionStart);
    focusContentInput(input, nextScrollTop);
    input.setSelectionRange(nextRestoreState.selectionStart, nextRestoreState.selectionEnd);
    input.scrollTop = nextScrollTop;
    requestAnimationFrame(() => {
        if (!editorState.contentInputEl || editorState.contentInputEl !== input) {
            return;
        }

        input.scrollTop = nextScrollTop;
    });
    editorState.lastContentSelection = nextRestoreState;
}

function captureCurrentEditorViewportState() {
    const input = editorState.contentInputEl;
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (!input || !currentDocument) {
        return null;
    }

    const nextState = {
        documentId: currentDocument.id,
        source: currentDocument.source,
        selectionStart: clampSelectionOffset(input.selectionStart ?? 0, input.value.length),
        selectionEnd: clampSelectionOffset(input.selectionEnd ?? 0, input.value.length),
        scrollTop: Math.max(0, input.scrollTop ?? 0),
    };
    editorState.lastContentSelection = nextState;
    return nextState;
}

function clampSelectionOffset(value, max) {
    const nextValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return Math.max(0, Math.min(Math.max(0, Number(max) || 0), nextValue));
}

function restoreHybridPreviewViewport(restoreState) {
    if (!editorState.previewEl) {
        return;
    }

    const targetElement = findHybridPreviewAnchorElement(restoreState?.selectionStart ?? 0);
    if (!targetElement) {
        editorState.previewEl.scrollTop = Math.max(0, Number(restoreState?.scrollTop) || 0);
        return;
    }

    const previewRect = editorState.previewEl.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const offsetWithinPreview = targetRect.top - previewRect.top + editorState.previewEl.scrollTop;
    const targetScrollTop = Math.max(0, offsetWithinPreview - 56);
    editorState.previewEl.scrollTop = targetScrollTop;
}

function findHybridPreviewAnchorElement(selectionStart) {
    if (!editorState.previewEl) {
        return null;
    }

    const sourceSelectionStart = clampSelectionOffset(selectionStart, Number.MAX_SAFE_INTEGER);
    const previewAnchors = Array.from(editorState.previewEl.querySelectorAll('[data-line-start-offset]'));
    if (previewAnchors.length === 0) {
        return null;
    }

    let fallbackElement = previewAnchors[0];
    previewAnchors.forEach((element) => {
        const lineOffset = Number(element.getAttribute('data-line-start-offset'));
        if (!Number.isFinite(lineOffset) || lineOffset > sourceSelectionStart) {
            return;
        }

        fallbackElement = element;
    });

    return fallbackElement;
}

function getEditorScrollTopForSelection(input, selectionStart) {
    if (!input) {
        return 0;
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(input).lineHeight) || 28;
    const lineIndex = getLineIndexForOffset(input.value, selectionStart);
    const requested = Math.max(0, (lineIndex * lineHeight) - (lineHeight * 2));
    const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
    return Math.min(requested, maxScrollTop);
}

function getLineIndexForOffset(value, selectionStart) {
    const nextOffset = clampSelectionOffset(selectionStart, String(value ?? '').length);
    let lineIndex = 0;
    for (let index = 0; index < nextOffset; index += 1) {
        if (value[index] === '\n') {
            lineIndex += 1;
        }
    }

    return lineIndex;
}

function updateTermsButtonState(currentDocument, fullPreviewMode = isFullPreviewMode()) {
    updateTermsButtonUiState(
        editorState.tagsButtonEl,
        editorState.tagsButtonLabelEl,
        currentDocument,
        fullPreviewMode,
        closeTagsMenu,
    );
}

function isFullPreviewMode() {
    return isEditorPreviewWorkflow()
        && (document.getElementById('ne-panel')?.classList.contains('ne-panel--preview') ?? false);
}

function isEditorPreviewWorkflow() {
    return editorState.settingsState?.editorMode === EDITOR_MODE_PREVIEW;
}

function isHybridMode() {
    return editorState.settingsState?.editorMode !== EDITOR_MODE_PREVIEW;
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
    if (!currentDocument || !isLorebookDocument) {
        cancelPendingLoreMetadataLayoutSync();
        cancelPendingLoreMetadataSummarySync();
        editorState.documentMetaEl.innerHTML = '';
        editorState.documentMetaEl.hidden = true;
        editorState.loreOverflowOpen = false;
        editorState.loreMetadataSummaryLayout = null;
        editorState.lastLoreMetaRenderKey = '';
        return;
    }

    if (editorState.lastLoreMetaDocumentId !== currentDocument.id) {
        loadLoreMetadataSessionState(currentDocument);
        editorState.loreMetadataAutoCollapsed = false;
        editorState.loreOverflowOpen = false;
        editorState.lastLoreMetaDocumentId = currentDocument.id;
        editorState.lastLoreMetaRenderKey = '';
    }

    const loreMetadataExpanded = getResolvedLoreMetadataExpanded(currentDocument);

    const nextLoreMetaRenderKey = buildLoreMetadataRenderKey(currentDocument, {
        isExpanded: loreMetadataExpanded,
        isOverflowOpen: editorState.loreOverflowOpen,
        summaryLayout: editorState.loreMetadataSummaryLayout,
    });

    editorState.documentMetaEl.hidden = false;
    if (editorState.lastLoreMetaRenderKey !== nextLoreMetaRenderKey) {
        editorState.documentMetaEl.innerHTML = renderLorebookMetadataTable(currentDocument, {
            isExpanded: loreMetadataExpanded,
            isOverflowOpen: editorState.loreOverflowOpen,
            summaryLayout: editorState.loreMetadataSummaryLayout,
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

    scheduleLoreMetadataLayoutSync(currentDocument);
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

    FORMAT_BAR_TOOL_DEFINITIONS.forEach((tool) => {
        syncFormatButtonLabel(tool.id, t(tool.labelKey), tool.shortLabelKey ? t(tool.shortLabelKey) : null);
    });

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
    if (text !== null && !button.querySelector('i') && !button.querySelector('strong') && !button.querySelector('em')) {
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

function syncPreviewContent(currentDocument, {
    hybridDisplayActive = false,
    fullPreviewMode = false,
} = {}) {
    if (!editorState.previewEl) {
        return;
    }

    if (!currentDocument || (!hybridDisplayActive && !fullPreviewMode)) {
        if (editorState.previewEl.innerHTML) {
            editorState.previewEl.innerHTML = '';
        }

        editorState.previewState = null;
        return;
    }

    const nextPreviewState = {
        mode: hybridDisplayActive ? 'hybrid' : 'preview',
        documentId: currentDocument.id,
        source: currentDocument.source,
        content: currentDocument.content,
        termsKey: (currentDocument.meta.termState?.items ?? []).join('\u0001'),
    };
    if (
        editorState.previewState
        && editorState.previewState.mode === nextPreviewState.mode
        && editorState.previewState.documentId === nextPreviewState.documentId
        && editorState.previewState.source === nextPreviewState.source
        && editorState.previewState.content === nextPreviewState.content
        && editorState.previewState.termsKey === nextPreviewState.termsKey
    ) {
        return;
    }

    editorState.previewEl.innerHTML = hybridDisplayActive
        ? renderHybridDisplay(currentDocument)
        : renderDocumentPreview(currentDocument, editorState.markdownConverter);
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

function syncCurrentDocumentContentHistory(currentDocument) {
    if (!currentDocument) {
        return;
    }

    const nextSnapshot = buildContentSnapshot(currentDocument, getRenderedContentValue(currentDocument));
    const historyKey = getContentHistoryKey(currentDocument);
    const existingHistory = editorState.contentHistoryByDocument.get(historyKey);
    if (!existingHistory) {
        editorState.contentHistoryByDocument.set(historyKey, {
            undoStack: [],
            redoStack: [],
            current: nextSnapshot,
        });
        return;
    }

    if (areContentSnapshotsEqual(existingHistory.current, nextSnapshot)) {
        return;
    }

    existingHistory.undoStack = [];
    existingHistory.redoStack = [];
    existingHistory.current = nextSnapshot;
}

function applyContentMutation(nextEditorState, {
    updateInput = true,
    focus = true,
    scrollTop = null,
    recordHistory = true,
} = {}) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    const input = editorState.contentInputEl;
    if (!currentDocument || !nextEditorState) {
        return false;
    }

    const nextValue = String(nextEditorState.value ?? '');
    const previousValue = getRenderedContentValue(currentDocument);
    const previousSnapshot = buildContentSnapshot(currentDocument, previousValue);
    const nextSnapshot = buildContentSnapshot(currentDocument, nextValue, {
        selectionStart: nextEditorState.selectionStart,
        selectionEnd: nextEditorState.selectionEnd,
    });
    const contentChanged = previousSnapshot.value !== nextSnapshot.value;

    if (recordHistory && contentChanged) {
        recordContentHistoryChange(currentDocument, previousSnapshot, nextSnapshot);
    }

    if (updateInput && input) {
        if (input.value !== nextSnapshot.value) {
            input.value = nextSnapshot.value;
        }

        if (focus) {
            focusContentInput(input, scrollTop);
        }

        input.setSelectionRange(nextSnapshot.selectionStart, nextSnapshot.selectionEnd);
        if (scrollTop !== null && Number.isFinite(Number(scrollTop))) {
            input.scrollTop = Math.max(0, Number(scrollTop));
        }
    }

    editorState.xmlMirrorSession = nextEditorState.session ?? null;
    editorState.lastContentSelection = {
        documentId: currentDocument.id,
        source: currentDocument.source,
        selectionStart: nextSnapshot.selectionStart,
        selectionEnd: nextSnapshot.selectionEnd,
        scrollTop: Math.max(0, Number(scrollTop ?? input?.scrollTop ?? 0) || 0),
    };

    if (!contentChanged) {
        return false;
    }

    updateCurrentDocument({ content: nextSnapshot.value }, currentDocument.source);
    return true;
}

function performContentHistoryStep(direction) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (!currentDocument) {
        return false;
    }

    const history = getContentHistory(currentDocument);
    if (!history) {
        return false;
    }

    const sourceStack = direction === 'redo' ? history.redoStack : history.undoStack;
    if (!Array.isArray(sourceStack) || sourceStack.length === 0) {
        return false;
    }

    const targetSnapshot = sourceStack.pop();
    if (!targetSnapshot) {
        return false;
    }
    const currentSnapshot = history.current ?? buildContentSnapshot(currentDocument, getRenderedContentValue(currentDocument));
    const destinationStack = direction === 'redo' ? history.undoStack : history.redoStack;

    destinationStack.push(currentSnapshot);
    if (destinationStack.length > CONTENT_HISTORY_LIMIT) {
        destinationStack.splice(0, destinationStack.length - CONTENT_HISTORY_LIMIT);
    }

    history.current = targetSnapshot;
    applyContentMutation({
        value: targetSnapshot.value,
        selectionStart: targetSnapshot.selectionStart,
        selectionEnd: targetSnapshot.selectionEnd,
    }, {
        recordHistory: false,
        scrollTop: editorState.contentInputEl?.scrollTop ?? 0,
    });
    return true;
}

function recordContentHistoryChange(currentDocument, previousSnapshot, nextSnapshot) {
    const history = getOrCreateContentHistory(currentDocument, previousSnapshot);
    history.undoStack.push(history.current ?? previousSnapshot);
    if (history.undoStack.length > CONTENT_HISTORY_LIMIT) {
        history.undoStack.splice(0, history.undoStack.length - CONTENT_HISTORY_LIMIT);
    }
    history.redoStack = [];
    history.current = nextSnapshot;
}

function getOrCreateContentHistory(currentDocument, fallbackSnapshot = null) {
    const historyKey = getContentHistoryKey(currentDocument);
    const existingHistory = editorState.contentHistoryByDocument.get(historyKey);
    if (existingHistory) {
        if (!existingHistory.current && fallbackSnapshot) {
            existingHistory.current = fallbackSnapshot;
        }
        return existingHistory;
    }

    const nextHistory = {
        undoStack: [],
        redoStack: [],
        current: fallbackSnapshot,
    };
    editorState.contentHistoryByDocument.set(historyKey, nextHistory);
    return nextHistory;
}

function getContentHistory(currentDocument) {
    return editorState.contentHistoryByDocument.get(getContentHistoryKey(currentDocument)) ?? null;
}

function getContentHistoryKey(currentDocument) {
    return `${currentDocument?.source ?? ''}:${currentDocument?.id ?? ''}`;
}

function buildContentSnapshot(currentDocument, value, {
    selectionStart = null,
    selectionEnd = null,
} = {}) {
    const normalizedValue = String(value ?? '');
    const selectionState = (
        selectionStart !== null || selectionEnd !== null
    )
        ? {
            selectionStart,
            selectionEnd: selectionEnd ?? selectionStart,
        }
        : getSelectionSnapshotForDocument(currentDocument, normalizedValue.length);

    return {
        value: normalizedValue,
        selectionStart: clampSelectionOffset(selectionState?.selectionStart ?? 0, normalizedValue.length),
        selectionEnd: clampSelectionOffset(selectionState?.selectionEnd ?? selectionState?.selectionStart ?? 0, normalizedValue.length),
    };
}

function getSelectionSnapshotForDocument(currentDocument, contentLength) {
    const input = editorState.contentInputEl;
    const preferredSelection = getPreferredContentSelectionState();
    if (input && preferredSelection && currentDocument) {
        return {
            selectionStart: clampSelectionOffset(preferredSelection.selectionStart, contentLength),
            selectionEnd: clampSelectionOffset(preferredSelection.selectionEnd, contentLength),
        };
    }

    const storedSelection = editorState.lastContentSelection;
    if (
        currentDocument
        && storedSelection
        && storedSelection.documentId === currentDocument.id
        && storedSelection.source === currentDocument.source
    ) {
        return {
            selectionStart: clampSelectionOffset(storedSelection.selectionStart, contentLength),
            selectionEnd: clampSelectionOffset(storedSelection.selectionEnd, contentLength),
        };
    }

    return {
        selectionStart: 0,
        selectionEnd: 0,
    };
}

function areContentSnapshotsEqual(left, right) {
    return (left?.value ?? '') === (right?.value ?? '')
        && (left?.selectionStart ?? 0) === (right?.selectionStart ?? 0)
        && (left?.selectionEnd ?? 0) === (right?.selectionEnd ?? 0);
}

function toggleHybridTask(lineIndex) {
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (!currentDocument) {
        return;
    }

    flushPendingContentSync();
    const nextEditorState = toggleTaskLineByIndex(getRenderedContentValue(currentDocument), Number(lineIndex));
    if (!nextEditorState) {
        return;
    }

    applyContentMutation(nextEditorState);
}

function copyCurrentDocumentPlainText() {
    const currentDocument = getPreviewDocument(editorState.documentState?.currentDocument ?? null);
    if (!currentDocument) {
        return;
    }

    const plainText = stripMarkdownToPlainText(currentDocument.content);
    void copyPlainTextToClipboard(plainText);
}

function applyFormat(type) {
    cancelPendingHybridBlurExit();

    if (type === 'copyPlain') {
        copyCurrentDocumentPlainText();
        return;
    }

    if ((!editorState.contentInputEl || editorState.contentInputEl.hidden) && isHybridMode()) {
        enterHybridEditMode(buildHybridRestoreStateFromSelection());
        requestAnimationFrame(() => {
            applyFormat(type);
        });
        return;
    }

    if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
        return;
    }

    flushPendingContentSync();

    if (type === 'undo') {
        performContentHistoryStep('undo');
        return;
    }

    if (type === 'redo') {
        performContentHistoryStep('redo');
        return;
    }

    const previousScrollTop = editorState.contentInputEl.scrollTop;
    const selectionState = getPreferredContentSelectionState();
    if (selectionState) {
        editorState.contentInputEl.setSelectionRange(selectionState.selectionStart, selectionState.selectionEnd);
    }

    const nextEditorState = applyEditorCommand(
        editorState.contentInputEl.value,
        selectionState?.selectionStart ?? editorState.contentInputEl.selectionStart ?? 0,
        selectionState?.selectionEnd ?? editorState.contentInputEl.selectionEnd ?? 0,
        type,
    );

    applyContentMutation(nextEditorState, {
        scrollTop: previousScrollTop,
    });
}

function handleStandardEditorHotkeys(event) {
    if (!editorState.settingsState?.editorHotkeysEnabled || !isPrimaryEditorShortcut(event)) {
        return false;
    }

    const normalizedKey = String(event.key ?? '').toLowerCase();
    let format = '';

    if (normalizedKey === 'b' && !event.shiftKey) {
        format = 'bold';
    } else if (normalizedKey === 'i' && !event.shiftKey) {
        format = 'italic';
    } else if (normalizedKey === 'z') {
        format = event.shiftKey ? 'redo' : 'undo';
    }

    if (!format) {
        return false;
    }

    event.preventDefault();
    applyFormat(format);
    return true;
}

function isPrimaryEditorShortcut(event) {
    return Boolean(
        event
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
    );
}

function handleContentKeyDown(event) {
    if (handleStandardEditorHotkeys(event)) {
        return;
    }

    if (
        (event.key === 'Backspace' || event.key === 'Delete')
        && !event.shiftKey
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
    ) {
        const deletionState = getSmartListDeletionState(
            editorState.contentInputEl.value,
            editorState.contentInputEl.selectionStart ?? 0,
            editorState.contentInputEl.selectionEnd ?? 0,
            event.key === 'Delete' ? 'forward' : 'backward',
        );
        if (deletionState) {
            event.preventDefault();
            applyTransientContentState(deletionState);
            return;
        }
    }

    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        applyFormat(event.shiftKey ? 'outdent' : 'indent');
        return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    const enterState = getSmartEnterState(
        editorState.contentInputEl.value,
        editorState.contentInputEl.selectionStart ?? 0,
        editorState.contentInputEl.selectionEnd ?? 0,
    );
    if (enterState) {
        event.preventDefault();
        applyTransientContentState(enterState);
        return;
    }

    // Terms should commit only from a dedicated #line so regular writing stays predictable.
    if (commitCurrentTermLine()) {
        event.preventDefault();
    }
}

function handleContentFocus() {
    cancelPendingHybridBlurExit();
    setCanvasFocusState(true);
    if (isHybridMode()) {
        editorState.hybridEditing = true;
    }
    syncMobileEditingInteractionState();
    captureCurrentEditorViewportState();
}

function handleContentBlur(event) {
    if (shouldKeepHybridEditorOpenOnBlur(event)) {
        requestAnimationFrame(() => {
            if (!editorState.contentInputEl || editorState.contentInputEl.hidden) {
                clearFormatBarInteractionState();
                return;
            }

            focusContentInput(editorState.contentInputEl, editorState.contentInputEl.scrollTop);
            scheduleFormatBarInteractionClear();
        });
        return;
    }

    captureCurrentEditorViewportState();
    if (isHybridMode() && editorState.hybridEditing) {
        schedulePendingHybridBlurExit();
        return;
    }

    setCanvasFocusState(false);
    flushEditorState();
    clearFormatBarInteractionState();
    exitHybridEditMode();
}

function handleContentSelectionChange() {
    captureCurrentEditorViewportState();
}

function handleDocumentSelectionChange() {
    const input = editorState.contentInputEl;
    if (!input || document.activeElement !== input) {
        return;
    }
    captureCurrentEditorViewportState();
}

function shouldKeepHybridEditorOpenOnBlur(event) {
    if (!isHybridMode() || !editorState.hybridEditing) {
        return false;
    }

    const relatedTarget = event?.relatedTarget;
    if (relatedTarget instanceof Element && editorState.formatBarEl?.contains(relatedTarget)) {
        return true;
    }

    return editorState.formatBarInteractionActive;
}

function setCanvasFocusState(isFocused) {
    editorState.editorShellEl?.classList.toggle('ne-editor-shell--canvas-focused', Boolean(isFocused));
    syncMobileEditingInteractionState();
}

function getPreferredContentSelectionState() {
    const input = editorState.contentInputEl;
    const currentDocument = editorState.documentState?.currentDocument ?? null;
    if (!input || !currentDocument) {
        return null;
    }

    const storedSelection = editorState.lastContentSelection;
    if (
        storedSelection
        && storedSelection.documentId === currentDocument.id
        && storedSelection.source === currentDocument.source
    ) {
        return {
            selectionStart: clampSelectionOffset(storedSelection.selectionStart, input.value.length),
            selectionEnd: clampSelectionOffset(storedSelection.selectionEnd, input.value.length),
        };
    }

    return {
        selectionStart: clampSelectionOffset(input.selectionStart ?? 0, input.value.length),
        selectionEnd: clampSelectionOffset(input.selectionEnd ?? 0, input.value.length),
    };
}

function getEventTargetElement(event) {
    const rawTarget = event?.target ?? null;
    if (rawTarget instanceof Element) {
        return rawTarget;
    }

    return rawTarget instanceof Node ? rawTarget.parentElement : null;
}

function getClosestEventTarget(event, selector) {
    const target = getEventTargetElement(event);
    return target?.closest(selector) ?? null;
}

function schedulePendingHybridBlurExit() {
    cancelPendingHybridBlurExit();
    editorState.pendingHybridBlurExitTimer = window.setTimeout(() => {
        editorState.pendingHybridBlurExitTimer = 0;
        setCanvasFocusState(false);
        flushEditorState();
        clearFormatBarInteractionState();
        exitHybridEditMode();
    }, 180);
}

function cancelPendingHybridBlurExit() {
    if (!editorState.pendingHybridBlurExitTimer) {
        return;
    }

    clearTimeout(editorState.pendingHybridBlurExitTimer);
    editorState.pendingHybridBlurExitTimer = 0;
}

function syncMobileEditingInteractionState() {
    const panelEl = document.getElementById('ne-panel');
    if (!panelEl) {
        return;
    }

    const mobileEditingActive = Boolean(
        isMobileViewport()
        && editorState.contentInputEl
        && !editorState.contentInputEl.hidden
        && (
            document.activeElement === editorState.contentInputEl
            || editorState.hybridEditing
            || editorState.formatBarInteractionActive
        )
    );

    panelEl.classList.toggle('ne-panel--mobile-editing', mobileEditingActive);

    if (!mobileEditingActive || !editorState.formatBarEl || editorState.formatBarEl.hidden) {
        panelEl.style.removeProperty('--ne-mobile-format-bar-height');
        notifyMobileEditingStateChange(panelEl, mobileEditingActive);
        return;
    }

    const formatBarHeight = Math.ceil(editorState.formatBarEl.getBoundingClientRect().height || 0);
    panelEl.style.setProperty('--ne-mobile-format-bar-height', `${Math.max(0, formatBarHeight)}px`);
    notifyMobileEditingStateChange(panelEl, mobileEditingActive, formatBarHeight);
}

function handlePanelLayoutStateChange() {
    scheduleLoreMetadataLayoutSync();
}

function notifyMobileEditingStateChange(panelEl, active, formatBarHeight = 0) {
    panelEl.dispatchEvent(new CustomEvent('ne:mobile-editing-state-change', {
        detail: {
            active: Boolean(active),
            formatBarHeight: Math.max(0, Number(formatBarHeight) || 0),
        },
    }));
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
        {
            extractTagsFromText,
            stripInlineTags,
        },
    );
    if (!nextEditorState) {
        return false;
    }

    runQuietMutation(() => addCurrentDocumentTerms(nextEditorState.terms, editorState.documentState?.currentDocument?.source));
    applyContentMutation(nextEditorState, {
        focus: false,
        scrollTop: editorState.contentInputEl.scrollTop,
    });
    return true;
}

function handleEditorChange(event) {
    if (commitLoreMetadataKeywordInput(event.target)) {
        return;
    }

    if (event.target?.dataset?.action === 'set-document-secondary-logic') {
        runQuietMutation(() => setCurrentDocumentSecondaryTermLogic(event.target.value, editorState.documentState?.currentDocument?.source));
        openLoreMetadataPanel();
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

    openLoreMetadataPanel();
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
    summaryLayout = null,
} = {}) {
    const meta = currentDocument?.meta ?? {};
    const nativeTraits = meta.nativeTraits ?? {};

    return [
        currentDocument?.id ?? '',
        isExpanded ? 'expanded' : 'collapsed',
        isOverflowOpen ? 'overflow-open' : 'overflow-closed',
        String(summaryLayout?.primaryVisibleCount ?? ''),
        String(summaryLayout?.secondaryVisibleCount ?? ''),
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

async function copyPlainTextToClipboard(text) {
    const nextText = String(text ?? '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextText);
        return true;
    }

    const helper = document.createElement('textarea');
    helper.value = nextText;
    helper.setAttribute('readonly', 'true');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    helper.style.pointerEvents = 'none';
    document.body.appendChild(helper);
    helper.select();

    try {
        return document.execCommand('copy');
    } finally {
        document.body.removeChild(helper);
    }
}

function applyTransientContentState(nextEditorState) {
    applyContentMutation(nextEditorState, {
        scrollTop: editorState.contentInputEl?.scrollTop ?? 0,
    });
}

function focusContentInput(input, scrollTop = null) {
    if (!input) {
        return;
    }

    try {
        input.focus({ preventScroll: true });
    } catch {
        input.focus();
    }

    if (scrollTop !== null && Number.isFinite(Number(scrollTop))) {
        input.scrollTop = Math.max(0, Number(scrollTop));
    }
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
    const pendingSelection = getPreferredContentSelectionState();
    clearPendingContentSyncState();
    if (!changed) {
        return false;
    }

    applyContentMutation({
        value: nextContent,
        selectionStart: pendingSelection?.selectionStart ?? 0,
        selectionEnd: pendingSelection?.selectionEnd ?? 0,
        session: editorState.xmlMirrorSession,
    }, {
        updateInput: false,
        focus: false,
        scrollTop: editorState.contentInputEl?.scrollTop ?? 0,
    });
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
    cancelPendingHybridBlurExit();
    clearFormatBarInteractionState();
    flushEditorState();
}

function openLoreMetadataPanel() {
    editorState.loreOverflowOpen = false;
    setLoreMetadataManualState(editorState.documentState?.currentDocument ?? null, true);
}

function getResolvedLoreMetadataExpanded(currentDocument = editorState.documentState?.currentDocument ?? null) {
    if (!currentDocument) {
        return false;
    }

    const sessionState = editorState.loreMetadataSessionState.get(getLoreMetadataSessionKey(currentDocument)) ?? null;
    if (typeof sessionState?.manualExpanded === 'boolean') {
        return sessionState.manualExpanded;
    }

    return false;
}

function scheduleLoreMetadataLayoutSync(currentDocument = editorState.documentState?.currentDocument ?? null) {
    cancelPendingLoreMetadataLayoutSync();

    if (
        !editorState.documentMetaEl
        || !currentDocument
        || normaliseDocumentSource(currentDocument.source) !== DOCUMENT_SOURCE_LOREBOOK
    ) {
        return;
    }

    editorState.pendingLoreMetaLayoutFrame = requestAnimationFrame(() => {
        editorState.pendingLoreMetaLayoutFrame = 0;
        syncLoreMetadataLayoutState(currentDocument);
    });
}

function cancelPendingLoreMetadataLayoutSync() {
    if (!editorState.pendingLoreMetaLayoutFrame) {
        return;
    }

    cancelAnimationFrame(editorState.pendingLoreMetaLayoutFrame);
    editorState.pendingLoreMetaLayoutFrame = 0;
}

function syncLoreMetadataLayoutState(currentDocument) {
    const activeDocument = editorState.documentState?.currentDocument ?? null;
    if (
        !activeDocument
        || activeDocument.id !== currentDocument?.id
        || activeDocument.source !== currentDocument?.source
    ) {
        return;
    }

    const panelEl = document.getElementById('ne-panel');
    if (!panelEl?.classList.contains('ne-panel--open')) {
        return;
    }

    const nextSummaryLayout = measureLoreMetadataSummaryLayout(activeDocument);

    if (areLoreMetadataSummaryLayoutsEqual(editorState.loreMetadataSummaryLayout, nextSummaryLayout)) {
        return;
    }

    editorState.loreMetadataSummaryLayout = nextSummaryLayout;
    renderDocumentMeta(activeDocument);
}

function loadLoreMetadataSessionState(currentDocument) {
    const sessionState = editorState.loreMetadataSessionState.get(getLoreMetadataSessionKey(currentDocument)) ?? null;
    editorState.loreMetadataExpanded = Boolean(sessionState?.manualExpanded);
    editorState.loreMetadataHasManualToggle = typeof sessionState?.manualExpanded === 'boolean';
}

function setLoreMetadataManualState(currentDocument, expanded) {
    if (!currentDocument) {
        return;
    }

    const nextExpanded = Boolean(expanded);
    editorState.loreMetadataExpanded = nextExpanded;
    editorState.loreMetadataHasManualToggle = true;
    editorState.loreMetadataSessionState.set(getLoreMetadataSessionKey(currentDocument), {
        manualExpanded: nextExpanded,
    });
}

function getLoreMetadataSessionKey(currentDocument) {
    return `${currentDocument?.source ?? ''}:${currentDocument?.id ?? ''}`;
}

function scheduleLoreMetadataSummarySync(currentDocument = editorState.documentState?.currentDocument ?? null) {
    cancelPendingLoreMetadataSummarySync();

    if (
        !editorState.documentMetaEl
        || !currentDocument
        || normaliseDocumentSource(currentDocument.source) !== DOCUMENT_SOURCE_LOREBOOK
    ) {
        return;
    }

    editorState.pendingLoreMetaSummaryFrame = requestAnimationFrame(() => {
        editorState.pendingLoreMetaSummaryFrame = 0;
        const nextSummaryLayout = measureLoreMetadataSummaryLayout(currentDocument);
        if (areLoreMetadataSummaryLayoutsEqual(editorState.loreMetadataSummaryLayout, nextSummaryLayout)) {
            return;
        }
        editorState.loreMetadataSummaryLayout = nextSummaryLayout;
        renderDocumentMeta(currentDocument);
    });
}

function cancelPendingLoreMetadataSummarySync() {
    if (!editorState.pendingLoreMetaSummaryFrame) {
        return;
    }

    cancelAnimationFrame(editorState.pendingLoreMetaSummaryFrame);
    editorState.pendingLoreMetaSummaryFrame = 0;
}

function measureLoreMetadataSummaryLayout(currentDocument) {
    if (!editorState.documentMetaEl || !currentDocument) {
        return null;
    }

    const primaryKeywords = Array.isArray(currentDocument.meta?.keywords) ? currentDocument.meta.keywords : [];
    const secondaryKeywords = Array.isArray(currentDocument.meta?.secondaryKeywords) ? currentDocument.meta.secondaryKeywords : [];
    const primaryValueEl = editorState.documentMetaEl.querySelector('[data-group="primary"] [data-role="summary-value"]');
    const secondaryValueEl = editorState.documentMetaEl.querySelector('[data-group="secondary"] [data-role="summary-value"]');

    return {
        primaryVisibleCount: getFittingSummaryKeywordCount(
            primaryKeywords,
            primaryValueEl?.clientWidth ?? 0,
            primaryValueEl,
        ),
        secondaryVisibleCount: getFittingSummaryKeywordCount(
            secondaryKeywords,
            secondaryValueEl?.clientWidth ?? 0,
            secondaryValueEl,
        ),
    };
}

function getFittingSummaryKeywordCount(keywords, availableWidth, summaryValueEl) {
    const items = Array.isArray(keywords) ? keywords : [];
    if (!items.length) {
        return 0;
    }

    if (availableWidth <= 0) {
        return 1;
    }

    const gap = getSummaryValueGap(summaryValueEl);
    for (let visibleCount = items.length; visibleCount >= 1; visibleCount -= 1) {
        const remainingCount = items.length - visibleCount;
        const keywordsWidth = measureLoreMetadataSummaryTokenWidth(items.slice(0, visibleCount).join(', '), 'keywords');
        const moreWidth = remainingCount > 0
            ? measureLoreMetadataSummaryTokenWidth(`+${remainingCount}`, 'more') + gap
            : 0;

        if ((keywordsWidth + moreWidth) <= availableWidth) {
            return visibleCount;
        }
    }

    return 1;
}

function getSummaryValueGap(summaryValueEl) {
    if (!summaryValueEl) {
        return 0;
    }

    const styles = window.getComputedStyle(summaryValueEl);
    return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
}

function measureLoreMetadataSummaryTokenWidth(content, variant = 'keywords') {
    const measureHost = document.createElement('div');
    measureHost.className = 'ne-lore-meta__measure-host';
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.innerHTML = variant === 'more'
        ? `<span class="ne-lore-meta__summary-more">${escapeHtml(content)}</span>`
        : `<span class="ne-lore-meta__summary-keywords">${escapeHtml(content)}</span>`;

    editorState.documentMetaEl.appendChild(measureHost);
    const measuredWidth = measureHost.firstElementChild?.getBoundingClientRect().width
        ?? measureHost.getBoundingClientRect().width
        ?? 0;
    editorState.documentMetaEl.removeChild(measureHost);
    return measuredWidth;
}

function areLoreMetadataSummaryLayoutsEqual(left, right) {
    return (left?.primaryVisibleCount ?? null) === (right?.primaryVisibleCount ?? null)
        && (left?.secondaryVisibleCount ?? null) === (right?.secondaryVisibleCount ?? null);
}

function handlePanelVisibilityChange(event) {
    if (Boolean(event.detail?.open)) {
        scheduleLoreMetadataLayoutSync();
        return;
    }

    editorState.loreMetadataSessionState.clear();
    editorState.loreMetadataExpanded = false;
    editorState.loreMetadataHasManualToggle = false;
    editorState.loreMetadataSummaryLayout = null;
    editorState.loreOverflowOpen = false;
    cancelPendingLoreMetadataLayoutSync();
    cancelPendingLoreMetadataSummarySync();
}
