// src/panel.js
// Responsible for: the outer panel shell, toolbar mount point, and high-level
// panel state wiring. Bounds math and pointer interactions live in helpers.

import { getSidebarLabel, normaliseDocumentSource } from './document-source.js';
import { EDITOR_MODE_PREVIEW } from './editor-tool-config.js';
import {
    closeToolbarTermsMenu,
    flushEditorState,
    mountEditor,
    requestTitleEditing,
    refreshEditorView,
    toggleToolbarTermsMenu,
} from './editor.js';
import {
    applyDefaultWindowBounds,
    applyFullscreenBounds,
    getClampedBounds,
    keepPanelReachable,
    rememberWindowedBounds,
} from './panel-bounds.js';
import {
    getTrackedTouch,
    initPanelDrag,
    initPanelResize,
    initPanelWheelResize,
    shouldUseMobileTouchFallback,
    shouldUseMobileTouchFallbackForPointer,
} from './panel-pointer.js';
import { t } from './i18n/index.js';
import { setLorebookSyncActive } from './state/lorebook-store.js';
import { getSettingsState, subscribePanelFontScale, subscribeSettings, syncSettingsViewport } from './state/settings-store.js';
import { getSessionState, setActiveSource, subscribeSession } from './state/session-store.js';
import { renderSidebarController } from './sidebar-controller.js';
import { mountToolbar, renderToolbarOverflowMenu } from './ui/toolbar-view.js';
import {
    getPanelRect,
    getViewportMetrics,
    isMobileViewport,
    MOBILE_MARGIN,
    setElementStyleProperty,
    setPanelBounds,
} from './util.js';

const CLASS_OPEN = 'ne-panel--open';
const CLASS_FULLSCREEN = 'ne-panel--fullscreen';
const CLASS_PREVIEW = 'ne-panel--preview';
const CLASS_MENU = 'ne-panel--menu-open';
const CLASS_SMALL_WINDOW = 'ne-panel--small-window';
const STORAGE_WINDOW_BOUNDS = 'note-editor.windowed-bounds.v1';
const TOOLBAR_TITLE_MIN_WIDTH = 140;
const TOOLBAR_COMPACT_TITLE_MIN_WIDTH = 168;
const TOOLBAR_OPTIONAL_ACTIONS = ['tags', 'preview', 'source'];
const MOBILE_SIDEBAR_CLOSE_ZONE_MIN = 72;
const MOBILE_SIDEBAR_CLOSE_ZONE_MAX = 144;
const MOBILE_SIDEBAR_GESTURE_START_DISTANCE = 8;
const MOBILE_SIDEBAR_GESTURE_TRIGGER_DISTANCE = 36;
const MOBILE_NATIVE_EDGE_EXCLUSION = 20;

const panelState = {
    panelEl: null,
    toolbarRefs: null,
    toolbarSource: '',
    hasPositionedPanel: false,
    windowedBounds: null,
    toolbar: {
        preview: false,
        menu: false,
        compact: false,
        overflowOpen: false,
        hiddenActions: [],
    },
    unsubscribeSession: null,
    unsubscribeSettings: null,
    unsubscribePanelFontScale: null,
    toolbarLayoutFrame: 0,
    toolbarLayoutObserver: null,
    toolbarHealthObserver: null,
    toolbarHealthFrame: 0,
    lastSettingsState: null,
    lastViewportMobile: isMobileViewport(),
    mobileSidebarGesture: null,
    mobileEditingRestoreBounds: null,
};

let viewportEventsBound = false;
let hasAppliedDefaultSource = false;

export function createPanel() {
    if (panelState.panelEl?.isConnected) {
        return panelState.panelEl;
    }

    const host = document.getElementById('movingDivs');
    if (!host) {
        console.error('[NoteEditor] Could not find #movingDivs - panel not created.');
        return null;
    }

    panelState.panelEl = document.createElement('div');
    panelState.panelEl.id = 'ne-panel';
    panelState.panelEl.classList.add('ne-panel');
    panelState.panelEl.innerHTML = `
        <div class="drawer-content">
            <div id="ne-toolbar-host"></div>
            <div class="ne-canvas" id="ne-canvas"></div>
        </div>
        <div class="ne-panel__resize-handle ne-panel__resize-handle--bottom-left" aria-hidden="true"></div>
        <div class="ne-panel__resize-handle ne-panel__resize-handle--bottom-right" aria-hidden="true"></div>
        <div class="ne-panel__resize-handle ne-panel__resize-handle--bottom" aria-hidden="true"></div>
    `;

    host.appendChild(panelState.panelEl);

    bindPanelEvents();
    syncToolbarSource(getSessionState());
    updateToolbarState();
    bindViewportEvents();
    bindSessionEvents();
    bindSettingsEvents();
    scheduleToolbarHealthRepair();
    return panelState.panelEl;
}

export function openPanel({ source = null } = {}) {
    const panelEl = ensurePanelElement();
    if (!panelEl) {
        return;
    }

    applyDefaultWindowBounds(panelState, STORAGE_WINDOW_BOUNDS);
    panelState.toolbar.menu = false;
    panelEl.classList.add(CLASS_OPEN);
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    syncPanelLayoutState();
    panelEl.dispatchEvent(new CustomEvent('ne:panel-visibility-change', {
        bubbles: true,
        detail: { open: true },
    }));
    const requestedSource = source ? normaliseDocumentSource(source) : '';
    if (requestedSource) {
        hasAppliedDefaultSource = true;
        if (requestedSource !== getSessionState().activeSource) {
            setActiveSource(requestedSource);
        }
    } else if (!hasAppliedDefaultSource) {
        hasAppliedDefaultSource = true;
        const { defaultSource } = getSettingsState();
        if (defaultSource !== getSessionState().activeSource) {
            setActiveSource(defaultSource);
        }
    }

    const sessionState = getSessionState();
    syncToolbarSource(sessionState, { forceRemount: shouldRemountPanelInternals() });
    syncLorebookRuntimeState(sessionState.activeSource, { refresh: true });
    refreshEditorView();
    updateToolbarState();
}

export function closePanel() {
    const panelEl = ensurePanelElement();
    if (!panelEl) {
        return;
    }

    flushEditorState();
    syncLorebookRuntimeState(getSessionState().activeSource, { open: false });
    panelState.toolbar.menu = false;
    setToolbarOverflowOpen(false);
    panelEl.classList.remove(CLASS_OPEN);
    syncPanelLayoutState();
    panelEl.dispatchEvent(new CustomEvent('ne:panel-visibility-change', {
        bubbles: true,
        detail: { open: false },
    }));
    updateToolbarState();
}

export function togglePanel() {
    const panelEl = ensurePanelElement();
    if (!panelEl) {
        return;
    }

    if (panelEl.classList.contains(CLASS_OPEN)) {
        closePanel();
        return;
    }

    openPanel();
}

function ensurePanelElement() {
    if (panelState.panelEl?.isConnected) {
        return panelState.panelEl;
    }

    return createPanel();
}

function shouldRemountPanelInternals() {
    const toolbarHost = panelState.panelEl?.querySelector('#ne-toolbar-host');
    const canvas = panelState.panelEl?.querySelector('#ne-canvas');
    return !panelState.toolbarRefs?.root?.isConnected
        || !toolbarHost?.firstElementChild
        || !canvas?.firstElementChild;
}

function bindPanelEvents() {
    panelState.panelEl?.addEventListener('ne:set-menu-open', (event) => {
        setMenuOpen(Boolean(event.detail?.open));
    });
    panelState.panelEl?.addEventListener('ne:mobile-editing-state-change', handleMobileEditingStateChange);
    panelState.panelEl?.addEventListener('ne:toolbar-layout-update', scheduleToolbarLayout);
    panelState.panelEl?.addEventListener('pointerdown', handlePanelPointerDown);
    panelState.panelEl?.addEventListener('pointermove', handlePanelPointerMove);
    panelState.panelEl?.addEventListener('pointerup', handlePanelPointerUp);
    panelState.panelEl?.addEventListener('pointercancel', handlePanelPointerCancel);
    panelState.panelEl?.addEventListener('touchstart', handlePanelTouchStart, { passive: false });

    initPanelResize(panelState, {
        onExitFullscreen: exitFullscreen,
        onResizeEnd: handleResizeEnd,
        rememberWindowedBounds: rememberCurrentWindowBounds,
    });
}

function bindViewportEvents() {
    if (viewportEventsBound) {
        return;
    }

    viewportEventsBound = true;
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', handleViewportResize);
}

function bindSessionEvents() {
    if (panelState.unsubscribeSession) {
        return;
    }

    panelState.unsubscribeSession = subscribeSession((sessionState) => {
        syncToolbarSource(sessionState);
    });
}

function bindSettingsEvents() {
    if (panelState.unsubscribeSettings) {
        return;
    }

    panelState.unsubscribeSettings = subscribeSettings((nextSettings) => {
        const previousSettings = panelState.lastSettingsState;
        panelState.lastSettingsState = nextSettings;

        if (!previousSettings) {
            return;
        }

        if (previousSettings.language !== nextSettings.language) {
            syncToolbarSource(getSessionState(), { forceRemount: true });
            updateToolbarState();
            refreshEditorView();
            return;
        }

        if (previousSettings.editorMode !== nextSettings.editorMode) {
            if (nextSettings.editorMode !== EDITOR_MODE_PREVIEW) {
                panelState.toolbar.preview = false;
            }
            updateToolbarState();
            refreshEditorView();
        }
    });

    panelState.unsubscribePanelFontScale = subscribePanelFontScale(({ value }) => {
        applyPanelFontScale(value);
        scheduleToolbarLayout();
    });
}

function syncToolbarSource(sessionState, { forceRemount = false } = {}) {
    const nextSource = sessionState.activeSource;
    if (!forceRemount && panelState.toolbarSource === nextSource && panelState.toolbarRefs?.root?.isConnected) {
        return;
    }

    panelState.toolbarRefs = mountToolbar(panelState.panelEl?.querySelector('#ne-toolbar-host'), {
        source: nextSource,
    });
    panelState.toolbarSource = nextSource;
    syncLorebookRuntimeState(nextSource, { refresh: nextSource === 'lorebook' });
    panelState.toolbar.hiddenActions = [];
    panelState.toolbar.compact = false;
    panelState.toolbar.overflowOpen = false;
    bindToolbarEvents();
    observeToolbarLayout();
    observeToolbarHealth();
    mountEditor(panelState.panelEl?.querySelector('#ne-canvas'), { toolbar: panelState.toolbarRefs });
    updateToolbarState();
    refreshEditorView();
    scheduleToolbarLayout();
    scheduleToolbarHealthRepair();
}

function bindToolbarEvents() {
    panelState.toolbarRefs?.menuButton?.addEventListener('click', toggleMenuState);
    panelState.toolbarRefs?.previewButton?.addEventListener('click', togglePreviewState);
    panelState.toolbarRefs?.closeButton?.addEventListener('click', closePanel);
    panelState.toolbarRefs?.windowButton?.addEventListener('click', toggleWindowMode);
    panelState.toolbarRefs?.sourceToggleButton?.addEventListener('click', handleSourceSwitch);
    panelState.toolbarRefs?.overflowButton?.addEventListener('click', toggleToolbarOverflowMenu);
    panelState.toolbarRefs?.overflowMenu?.addEventListener('click', handleToolbarOverflowMenuClick);
    panelState.toolbarRefs?.sourceButtons?.forEach((button) => {
        button.addEventListener('click', handleSourceSwitch);
    });

    initPanelDrag(panelState, {
        onExitFullscreen: exitFullscreen,
        onTitleTap: requestTitleEditing,
        rememberWindowedBounds: rememberCurrentWindowBounds,
    });
    initPanelWheelResize(panelState, {
        onResizeEnd: handleResizeEnd,
        rememberWindowedBounds: rememberCurrentWindowBounds,
    });
}

function rememberCurrentWindowBounds() {
    rememberWindowedBounds(panelState, STORAGE_WINDOW_BOUNDS);
}

function applyPanelFontScale(value) {
    if (!panelState.panelEl) {
        return;
    }

    setElementStyleProperty(panelState.panelEl, '--ne-font-scale', String(value), '');
}

function handleResizeEnd() {
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    syncPanelLayoutState();
    scheduleToolbarLayout();
}

function updateToggleButton(button, pressed, activeTitle, inactiveTitle) {
    if (!button) {
        return;
    }

    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('ne-btn--active', pressed);
    button.title = pressed ? activeTitle : inactiveTitle;
}

function updateToolbarState() {
    if (!panelState.panelEl) {
        return;
    }

    const previewWorkflowActive = getSettingsState().editorMode === EDITOR_MODE_PREVIEW;
    if (!previewWorkflowActive && panelState.toolbar.preview) {
        panelState.toolbar.preview = false;
    }

    panelState.panelEl.classList.toggle(CLASS_PREVIEW, previewWorkflowActive && panelState.toolbar.preview);
    panelState.panelEl.classList.toggle(CLASS_MENU, panelState.toolbar.menu);

    const fullscreen = panelState.panelEl.classList.contains(CLASS_FULLSCREEN);
    const sidebarLabel = getSidebarLabel(panelState.toolbarSource || getSessionState().activeSource);
    if (previewWorkflowActive) {
        updateToggleButton(
            panelState.toolbarRefs?.previewButton,
            panelState.toolbar.preview,
            t('panel.preview.exit'),
            t('panel.preview.toggle'),
        );
    }
    updateToggleButton(
        panelState.toolbarRefs?.menuButton,
        panelState.toolbar.menu,
        t('panel.sidebar.hide', { label: sidebarLabel }),
        t('panel.sidebar.show', { label: sidebarLabel }),
    );
    updateToggleButton(
        panelState.toolbarRefs?.windowButton,
        fullscreen,
        t('panel.window.exit'),
        t('panel.window.toggle'),
    );
    scheduleToolbarLayout();
}

function togglePreviewState() {
    if (getSettingsState().editorMode !== EDITOR_MODE_PREVIEW) {
        return;
    }

    flushEditorState();
    panelState.toolbar.preview = !panelState.toolbar.preview;
    updateToolbarState();
    refreshEditorView();
}

function toggleMenuState() {
    setMenuOpen(!panelState.toolbar.menu);
}

function setMenuOpen(open) {
    const nextValue = Boolean(open);
    if (panelState.toolbar.menu === nextValue) {
        return;
    }

    panelState.toolbar.menu = nextValue;
    updateToolbarState();
}

function enterFullscreen() {
    if (!panelState.panelEl) {
        return;
    }

    rememberCurrentWindowBounds();
    panelState.panelEl.classList.add(CLASS_FULLSCREEN);
    applyFullscreenBounds(panelState);
    syncPanelLayoutState();
    updateToolbarState();
}

function exitFullscreen() {
    if (!panelState.panelEl) {
        return;
    }

    panelState.panelEl.classList.remove(CLASS_FULLSCREEN);
    if (panelState.windowedBounds) {
        setPanelBounds(panelState.panelEl, getClampedBounds(panelState, panelState.windowedBounds));
    }

    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    syncPanelLayoutState();
    updateToolbarState();
}

function toggleWindowMode() {
    if (!panelState.panelEl) {
        return;
    }

    if (panelState.panelEl.classList.contains(CLASS_FULLSCREEN)) {
        exitFullscreen();
        return;
    }

    enterFullscreen();
}

function handleSourceSwitch(event) {
    const nextSource = event.currentTarget?.dataset?.source;
    if (!nextSource || nextSource === getSessionState().activeSource) {
        return;
    }

    flushEditorState();
    setActiveSource(nextSource);
    syncLorebookRuntimeState(nextSource, { refresh: nextSource === 'lorebook' });
}

function syncLorebookRuntimeState(source, { open = panelState.panelEl?.classList.contains(CLASS_OPEN) ?? false, refresh = false } = {}) {
    const lorebookActive = Boolean(open) && source === 'lorebook';
    setLorebookSyncActive(lorebookActive, { refresh: lorebookActive && refresh });
}

function handleViewportResize() {
    const viewportWasMobile = panelState.lastViewportMobile;
    const viewportIsMobile = isMobileViewport();
    panelState.lastViewportMobile = viewportIsMobile;

    if (!panelState.panelEl?.classList.contains(CLASS_OPEN)) {
        if (viewportWasMobile !== viewportIsMobile) {
            syncSettingsViewport();
        }
        return;
    }

    const toolbarViewportChanged = syncSettingsViewport();
    if (toolbarViewportChanged) {
        renderSidebarController();
    }

    if (!panelState.hasPositionedPanel) {
        applyDefaultWindowBounds(panelState, STORAGE_WINDOW_BOUNDS, true);
        syncPanelLayoutState();
        return;
    }

    if (panelState.panelEl.classList.contains(CLASS_FULLSCREEN)) {
        releaseMobileEditingViewportLock({ restoreBounds: false });
        applyFullscreenBounds(panelState);
        syncPanelLayoutState();
        scheduleToolbarLayout();
        return;
    }

    if (isMobileEditingViewportLocked()) {
        syncMobileEditingViewportLock();
        syncPanelLayoutState();
        scheduleToolbarLayout();
        return;
    }

    releaseMobileEditingViewportLock();
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    syncPanelLayoutState();
    scheduleToolbarLayout();
}

function isMobileEditingViewportLocked() {
    return Boolean(
        panelState.panelEl?.classList.contains('ne-panel--mobile-editing')
        && isMobileViewport()
        && window.visualViewport
    );
}

function handleMobileEditingStateChange(event) {
    if (Boolean(event.detail?.active)) {
        syncMobileEditingViewportLock();
        scheduleToolbarLayout();
        return;
    }

    releaseMobileEditingViewportLock();
    scheduleToolbarLayout();
}

function syncMobileEditingViewportLock() {
    if (
        !panelState.panelEl
        || !panelState.panelEl.classList.contains(CLASS_OPEN)
        || panelState.panelEl.classList.contains(CLASS_FULLSCREEN)
        || !isMobileEditingViewportLocked()
    ) {
        releaseMobileEditingViewportLock({ restoreBounds: false });
        return;
    }

    const rect = getPanelRect(panelState.panelEl);
    if (!rect) {
        return;
    }

    if (!panelState.mobileEditingRestoreBounds) {
        panelState.mobileEditingRestoreBounds = {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
        };
    }

    const sourceBounds = panelState.mobileEditingRestoreBounds;
    const viewport = getViewportMetrics();
    const margin = MOBILE_MARGIN;
    const availableWidth = Math.max(0, viewport.width - (margin * 2));
    const availableHeight = Math.max(0, viewport.height - (margin * 2));
    if (availableWidth <= 0 || availableHeight <= 0) {
        return;
    }

    const width = Math.min(sourceBounds.width, availableWidth);
    const height = Math.min(sourceBounds.height, availableHeight);
    const minLeft = viewport.offsetLeft + margin;
    const maxLeft = viewport.offsetLeft + viewport.width - width - margin;
    const minTop = viewport.offsetTop + margin;
    const maxTop = viewport.offsetTop + viewport.height - height - margin;
    const nextBounds = {
        width,
        height,
        left: clampNumber(sourceBounds.left, minLeft, Math.max(minLeft, maxLeft)),
        top: clampNumber(sourceBounds.top, minTop, Math.max(minTop, maxTop)),
    };

    setPanelBounds(panelState.panelEl, nextBounds);
}

function releaseMobileEditingViewportLock({ restoreBounds = true } = {}) {
    const restoreBoundsSnapshot = panelState.mobileEditingRestoreBounds;
    panelState.mobileEditingRestoreBounds = null;

    if (
        !restoreBounds
        || !restoreBoundsSnapshot
        || !panelState.panelEl
        || !panelState.panelEl.classList.contains(CLASS_OPEN)
        || panelState.panelEl.classList.contains(CLASS_FULLSCREEN)
    ) {
        return;
    }

    setPanelBounds(panelState.panelEl, getClampedBounds(panelState, restoreBoundsSnapshot));
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    syncPanelLayoutState();
}

function syncPanelLayoutState() {
    if (!panelState.panelEl) {
        return;
    }

    const rect = panelState.panelEl.classList.contains(CLASS_OPEN)
        ? getPanelRect(panelState.panelEl)
        : null;
    if (rect) {
        setElementStyleProperty(panelState.panelEl, '--ne-panel-current-height', `${Math.round(rect.height)}px`, '');
    } else {
        panelState.panelEl.style.removeProperty('--ne-panel-current-height');
    }
    const fullscreen = panelState.panelEl.classList.contains(CLASS_FULLSCREEN);
    const smallWindow = Boolean(
        rect
        && !fullscreen
        && (
            isMobileViewport()
            || rect.height <= 620
            || rect.width <= 560
        )
    );

    panelState.panelEl.classList.toggle(CLASS_SMALL_WINDOW, smallWindow);
    panelState.panelEl.dispatchEvent(new CustomEvent('ne:panel-layout-state-change', {
        bubbles: true,
        detail: {
            open: panelState.panelEl.classList.contains(CLASS_OPEN),
            fullscreen,
            smallWindow,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
        },
    }));
}


function handlePanelPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const overflowWrap = panelState.toolbarRefs?.overflowWrap;
    if (panelState.toolbar.overflowOpen && overflowWrap && !overflowWrap.contains(target)) {
        setToolbarOverflowOpen(false);
    }

    if (shouldUseMobileTouchFallbackForPointer(event)) {
        return;
    }

    beginMobileSidebarGesture(event, target);
}

function handlePanelPointerMove(event) {
    const gesture = panelState.mobileSidebarGesture;
    if (
        !gesture
        || gesture.handled
        || gesture.inputType !== 'pointer'
        || event.pointerId !== gesture.pointerId
    ) {
        return;
    }

    updateMobileSidebarGesture(gesture, event.clientX, event.clientY, event);
}

function handlePanelPointerUp(event) {
    clearMobileSidebarGesture(event);
}

function handlePanelPointerCancel(event) {
    clearMobileSidebarGesture(event);
}

function beginMobileSidebarGesture(event, target) {
    clearMobileSidebarGesture();

    if (!shouldUseMobileSidebarGesture(event)) {
        return;
    }

    const gestureMode = getMobileSidebarGestureMode(event, target);
    if (!gestureMode) {
        return;
    }

    panelState.mobileSidebarGesture = {
        inputType: 'pointer',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: '',
        handled: false,
        mode: gestureMode,
    };

    try {
        panelState.panelEl?.setPointerCapture?.(event.pointerId);
    } catch (error) {
        if (error?.name !== 'NotFoundError') {
            console.warn('[NoteEditor] Pointer capture failed on panel sidebar gesture start.', error);
        }
    }
}

function handlePanelTouchStart(event) {
    if (!shouldUseMobileSidebarTouchGesture(event)) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const touch = getTrackedTouch(event);
    if (!touch) {
        return;
    }

    clearMobileSidebarGesture();

    const gestureMode = getMobileSidebarGestureMode(touch, target);
    if (!gestureMode) {
        return;
    }

    let activeTouchId = touch.identifier;
    const moveTouchGesture = (moveEvent) => {
        const activeTouch = getTrackedTouch(moveEvent, activeTouchId);
        if (!activeTouch) {
            return;
        }

        const gesture = panelState.mobileSidebarGesture;
        if (!gesture || gesture.inputType !== 'touch' || gesture.touchId !== activeTouchId) {
            return;
        }

        updateMobileSidebarGesture(gesture, activeTouch.clientX, activeTouch.clientY, moveEvent);
    };
    const endTouchGesture = (endEvent) => {
        const activeTouch = getTrackedTouch(endEvent, activeTouchId, { includeChangedTouches: true });
        if (!activeTouch) {
            return;
        }

        activeTouchId = null;
        document.removeEventListener('touchmove', moveTouchGesture);
        document.removeEventListener('touchend', endTouchGesture);
        document.removeEventListener('touchcancel', endTouchGesture);
        clearMobileSidebarGesture();
    };

    panelState.mobileSidebarGesture = {
        inputType: 'touch',
        touchId: activeTouchId,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: '',
        handled: false,
        mode: gestureMode,
    };

    document.addEventListener('touchmove', moveTouchGesture, { passive: false });
    document.addEventListener('touchend', endTouchGesture);
    document.addEventListener('touchcancel', endTouchGesture);
}

function clearMobileSidebarGesture(event = null) {
    if (!panelState.mobileSidebarGesture) {
        return;
    }

    const gesture = panelState.mobileSidebarGesture;
    if (gesture.inputType === 'pointer') {
        const pointerId = event?.pointerId ?? gesture.pointerId;
        try {
            panelState.panelEl?.releasePointerCapture?.(pointerId);
        } catch (error) {
            if (error?.name !== 'NotFoundError') {
                console.warn('[NoteEditor] Pointer capture release failed on panel sidebar gesture end.', error);
            }
        }
    }

    panelState.mobileSidebarGesture = null;
}

function shouldUseMobileSidebarGesture(event) {
    return Boolean(
        panelState.panelEl?.classList.contains(CLASS_OPEN)
        && isMobileViewport()
        && event.isPrimary
        && event.pointerType === 'touch'
        && !shouldUseMobileTouchFallbackForPointer(event)
    );
}

function shouldUseMobileSidebarTouchGesture(event) {
    return Boolean(
        panelState.panelEl?.classList.contains(CLASS_OPEN)
        && isMobileViewport()
        && shouldUseMobileTouchFallback()
        && event.touches.length === 1
    );
}

function updateMobileSidebarGesture(gesture, clientX, clientY, event) {
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (!gesture.axis) {
        if (distance < MOBILE_SIDEBAR_GESTURE_START_DISTANCE) {
            return;
        }

        gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        if (gesture.axis !== 'x') {
            gesture.handled = true;
            return;
        }
        // axis is 'x' — fall through to process this frame immediately
    }

    if (gesture.axis !== 'x') {
        return;
    }

    const movingTowardToggle = gesture.mode === 'open' ? deltaX > 0 : deltaX < 0;
    if (!movingTowardToggle) {
        return;
    }

    // Prevent native scroll / back-swipe as soon as we know we own this horizontal gesture.
    // This must happen before the threshold check so the browser doesn't take over mid-swipe.
    if (event?.cancelable) {
        event.preventDefault();
    }

    const passedThreshold = gesture.mode === 'open'
        ? deltaX >= MOBILE_SIDEBAR_GESTURE_TRIGGER_DISTANCE
        : deltaX <= -MOBILE_SIDEBAR_GESTURE_TRIGGER_DISTANCE;

    if (!passedThreshold) {
        return;
    }

    gesture.handled = true;
    setMenuOpen(gesture.mode === 'open');
}

function getMobileSidebarGestureMode(event, target) {
    if (panelState.toolbar.menu) {
        return shouldStartSidebarCloseGesture(event, target) ? 'close' : '';
    }

    return shouldStartSidebarOpenGesture(event, target) ? 'open' : '';
}

function shouldStartSidebarOpenGesture(event, target) {
    const swipeArea = target.closest('.ne-editor-shell, .ne-editor-stage, #ne-canvas');
    if (!swipeArea) {
        return false;
    }

    // Do not start over the OS-reserved back-gesture strip at the viewport left edge.
    if (event.clientX < MOBILE_NATIVE_EDGE_EXCLUSION) {
        return false;
    }

    if (
        target.closest('.ne-sidebar')
        || target.closest('.ne-toolbar')
        || target.closest('.ne-panel__resize-handle')
    ) {
        return false;
    }

    if (isSidebarGestureInteractiveTarget(target) && !target.closest('.ne-note-content-input')) {
        return false;
    }

    return true;
}

function shouldStartSidebarCloseGesture(event, target) {
    const sidebar = target.closest('.ne-sidebar');
    if (!sidebar) {
        return false;
    }

    const sidebarRect = sidebar.getBoundingClientRect();
    const closeZoneWidth = getMobileSidebarGestureZoneWidth(
        sidebarRect.width,
        MOBILE_SIDEBAR_CLOSE_ZONE_MIN,
        MOBILE_SIDEBAR_CLOSE_ZONE_MAX,
        0.26,
    );
    const startsFromEdge = event.clientX >= sidebarRect.right - closeZoneWidth;
    if (!startsFromEdge) {
        return false;
    }

    return !isSidebarGestureCloseBlockedTarget(target);
}

function isSidebarGestureInteractiveTarget(target) {
    return Boolean(target.closest([
        'button',
        'a',
        'input',
        'textarea',
        'select',
        'label',
        '[role="button"]',
        '[contenteditable="true"]',
        '.ne-tags-menu',
        '.ne-toolbar__overflow-menu',
        '.ne-lore-meta__overflow-panel',
    ].join(', ')));
}

function isSidebarGestureCloseBlockedTarget(target) {
    return Boolean(target.closest([
        '.ne-sidebar__topbar',
        '.ne-sidebar__tools',
        '.ne-sidebar__search',
        '.ne-sidebar__filters',
        '.ne-row-actions',
        '.ne-delete-panel',
        '.ne-settings-panel',
        '.ne-sidebar-dialog',
        '.ne-lore-entry-dialog',
        '.ne-tags-menu',
        '.ne-toolbar__overflow-menu',
        '.ne-lore-meta__overflow-panel',
        'input',
        'textarea',
        'select',
        'label',
        '[contenteditable="true"]',
    ].join(', ')));
}

function getMobileSidebarGestureZoneWidth(width, min, max, ratio) {
    return Math.min(Math.max(width * ratio, min), max);
}

function observeToolbarLayout() {
    panelState.toolbarLayoutObserver?.disconnect?.();
    const root = panelState.toolbarRefs?.root;
    if (!root || typeof ResizeObserver !== 'function') {
        panelState.toolbarLayoutObserver = null;
        return;
    }

    panelState.toolbarLayoutObserver = new ResizeObserver(() => {
        scheduleToolbarLayout();
    });
    panelState.toolbarLayoutObserver.observe(root);
}

function observeToolbarHealth() {
    panelState.toolbarHealthObserver?.disconnect?.();

    const toolbarHost = panelState.panelEl?.querySelector('#ne-toolbar-host');
    if (!toolbarHost || typeof MutationObserver !== 'function') {
        panelState.toolbarHealthObserver = null;
        return;
    }

    panelState.toolbarHealthObserver = new MutationObserver(() => {
        scheduleToolbarHealthRepair();
    });
    panelState.toolbarHealthObserver.observe(toolbarHost, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'hidden', 'class'],
    });
}

function scheduleToolbarLayout() {
    if (panelState.toolbarLayoutFrame) {
        cancelAnimationFrame(panelState.toolbarLayoutFrame);
    }

    panelState.toolbarLayoutFrame = requestAnimationFrame(() => {
        panelState.toolbarLayoutFrame = 0;
        applyToolbarLayout();
    });
}

function scheduleToolbarHealthRepair() {
    if (panelState.toolbarHealthFrame) {
        cancelAnimationFrame(panelState.toolbarHealthFrame);
    }

    panelState.toolbarHealthFrame = requestAnimationFrame(() => {
        panelState.toolbarHealthFrame = 0;
        repairToolbarHealth();
    });
}

function repairToolbarHealth() {
    const panelEl = panelState.panelEl;
    const toolbarHost = panelEl?.querySelector('#ne-toolbar-host');
    if (!panelEl || !toolbarHost) {
        return;
    }

    const toolbarRoot = panelState.toolbarRefs?.root ?? toolbarHost.querySelector('#ne-toolbar');
    if (!(toolbarRoot instanceof HTMLElement) || !toolbarRoot.isConnected) {
        if (panelEl.classList.contains(CLASS_OPEN)) {
            syncToolbarSource(getSessionState(), { forceRemount: true });
        }
        return;
    }

    const repairedNodes = [];
    clearUnexpectedToolbarDisplay(toolbarHost, repairedNodes);
    clearUnexpectedToolbarDisplay(toolbarRoot, repairedNodes);
    clearUnexpectedToolbarDisplay(toolbarRoot.querySelector('.ne-toolbar__title-wrap'), repairedNodes);
    clearUnexpectedToolbarDisplay(toolbarRoot.querySelector('.ne-toolbar__actions'), repairedNodes);

    toolbarRoot.querySelectorAll('*').forEach((element) => {
        clearUnexpectedToolbarDisplay(element, repairedNodes);
    });

    if (repairedNodes.length > 0) {
        scheduleToolbarLayout();
        console.warn('[NoteEditor] Repaired unexpected toolbar visibility mutation.', repairedNodes);
    }
}

function clearUnexpectedToolbarDisplay(element, repairedNodes) {
    if (!(element instanceof HTMLElement) || element.hidden) {
        return;
    }

    if (String(element.style.display ?? '').trim().toLowerCase() !== 'none') {
        return;
    }

    element.style.removeProperty('display');
    repairedNodes.push(describeToolbarNode(element));
}

function describeToolbarNode(element) {
    if (!(element instanceof HTMLElement)) {
        return '';
    }

    if (element.id) {
        return `#${element.id}`;
    }

    const className = String(element.className ?? '').trim().replace(/\s+/g, '.');
    return className ? `.${className}` : element.tagName.toLowerCase();
}

function applyToolbarLayout() {
    const refs = panelState.toolbarRefs;
    if (!refs?.root?.isConnected) {
        return;
    }

    refs.root.dataset.layouting = 'true';
    const availableActions = getAvailableToolbarOptionalActions(refs);
    let compact = false;
    let hiddenActions = [];

    applyToolbarLayoutState(refs, { compact, hiddenActions, availableActions });

    if (measureToolbarTitleWidth(refs) < TOOLBAR_COMPACT_TITLE_MIN_WIDTH) {
        compact = true;
        applyToolbarLayoutState(refs, { compact, hiddenActions, availableActions });
    }

    for (const actionKey of TOOLBAR_OPTIONAL_ACTIONS) {
        if (!availableActions.includes(actionKey) || measureToolbarTitleWidth(refs) >= TOOLBAR_TITLE_MIN_WIDTH) {
            continue;
        }

        hiddenActions = [...hiddenActions, actionKey];
        applyToolbarLayoutState(refs, { compact, hiddenActions, availableActions });
    }

    const nextHiddenKey = hiddenActions.join('|');
    const previousHiddenKey = panelState.toolbar.hiddenActions.join('|');
    panelState.toolbar.compact = compact;
    panelState.toolbar.hiddenActions = hiddenActions;
    if (nextHiddenKey !== previousHiddenKey && hiddenActions.includes('tags')) {
        closeToolbarTermsMenu();
    }

    renderToolbarOverflowMenuContent();
    delete refs.root.dataset.layouting;
}

function getAvailableToolbarOptionalActions(refs) {
    const available = [];
    if (refs?.tagsButton && !refs.tagsButton.hidden) {
        available.push('tags');
    }
    if (refs?.previewButton && getSettingsState().editorMode === EDITOR_MODE_PREVIEW) {
        available.push('preview');
    }
    if (refs?.sourceToggleButton) {
        available.push('source');
    }
    return available;
}

function applyToolbarLayoutState(refs, { compact = false, hiddenActions = [], availableActions = [] } = {}) {
    refs.root?.classList.toggle('ne-toolbar--compact', compact);

    const hiddenSet = new Set(hiddenActions);
    if (refs.tagsWrap) {
        refs.tagsWrap.hidden = !availableActions.includes('tags') || hiddenSet.has('tags');
    }
    if (refs.previewButton) {
        refs.previewButton.hidden = !availableActions.includes('preview') || hiddenSet.has('preview');
    }
    if (refs.sourceToggleButton) {
        refs.sourceToggleButton.hidden = hiddenSet.has('source');
    }
    if (refs.overflowWrap) {
        refs.overflowWrap.hidden = hiddenActions.length === 0;
    }
    if (hiddenActions.length === 0) {
        setToolbarOverflowOpen(false);
    }
}

function measureToolbarTitleWidth(refs) {
    const titleEl = refs?.titleInput && !refs.titleInput.hidden
        ? refs.titleInput
        : refs?.titleButton;
    return titleEl?.getBoundingClientRect?.().width ?? 0;
}

function renderToolbarOverflowMenuContent() {
    const refs = panelState.toolbarRefs;
    if (!refs?.overflowMenu) {
        return;
    }

    refs.overflowMenu.innerHTML = renderToolbarOverflowMenu(panelState.toolbar.hiddenActions, panelState.toolbarSource || getSessionState().activeSource);
}

function toggleToolbarOverflowMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setToolbarOverflowOpen(!panelState.toolbar.overflowOpen);
}

function setToolbarOverflowOpen(open) {
    const refs = panelState.toolbarRefs;
    const nextValue = Boolean(open) && panelState.toolbar.hiddenActions.length > 0;
    panelState.toolbar.overflowOpen = nextValue;
    if (refs?.overflowButton) {
        refs.overflowButton.setAttribute('aria-expanded', String(nextValue));
    }
    if (refs?.overflowMenu) {
        refs.overflowMenu.hidden = !nextValue;
        if (nextValue) {
            requestAnimationFrame(() => positionToolbarOverflowMenu(refs));
        } else {
            refs.overflowMenu.style.position = '';
            refs.overflowMenu.style.left = '';
            refs.overflowMenu.style.top = '';
            refs.overflowMenu.style.right = '';
            refs.overflowMenu.style.bottom = '';
            refs.overflowMenu.style.maxWidth = '';
            refs.overflowMenu.style.maxHeight = '';
        }
    }
}

function handleToolbarOverflowMenuClick(event) {
    const actionButton = event.target.closest('[data-toolbar-overflow-action]');
    if (!actionButton) {
        return;
    }

    const action = String(actionButton.dataset.toolbarOverflowAction ?? '').trim();
    setToolbarOverflowOpen(false);

    switch (action) {
        case 'tags':
            toggleToolbarTermsMenu(panelState.toolbarRefs?.overflowButton ?? null);
            break;
        case 'preview':
            togglePreviewState();
            break;
        case 'source': {
            const nextSource = panelState.toolbarRefs?.sourceToggleButton?.dataset?.source;
            if (!nextSource || nextSource === getSessionState().activeSource) {
                break;
            }
            flushEditorState();
            setActiveSource(nextSource);
            syncLorebookRuntimeState(nextSource, { refresh: nextSource === 'lorebook' });
            break;
        }
        default:
            break;
    }
}

function positionToolbarOverflowMenu(refs) {
    const overflowMenu = refs?.overflowMenu;
    const overflowButton = refs?.overflowButton;
    if (!overflowMenu || overflowMenu.hidden) {
        return;
    }

    const anchorRect = overflowButton?.getBoundingClientRect?.() ?? null;
    const viewportBounds = {
        left: 8,
        top: 8,
        right: Math.max(8, window.innerWidth - 8),
        bottom: Math.max(8, window.innerHeight - 8),
    };
    const horizontalBounds = {
        left: viewportBounds.left,
        right: viewportBounds.right,
    };
    const availableWidth = Math.max(176, horizontalBounds.right - horizontalBounds.left);
    const availableHeight = Math.max(140, viewportBounds.bottom - viewportBounds.top);

    overflowMenu.style.position = 'fixed';
    overflowMenu.style.left = '8px';
    overflowMenu.style.top = '8px';
    overflowMenu.style.right = 'auto';
    overflowMenu.style.bottom = 'auto';
    overflowMenu.style.maxWidth = `${availableWidth}px`;
    overflowMenu.style.maxHeight = `${availableHeight}px`;

    const measuredRect = overflowMenu.getBoundingClientRect();
    const menuWidth = measuredRect.width || Math.min(220, availableWidth);
    const menuHeight = measuredRect.height || Math.min(240, availableHeight);
    const preferredLeft = anchorRect
        ? anchorRect.right - menuWidth
        : horizontalBounds.right - menuWidth;
    const nextLeft = clampNumber(preferredLeft, horizontalBounds.left, Math.max(horizontalBounds.left, horizontalBounds.right - menuWidth));
    const belowTop = anchorRect ? anchorRect.bottom + 6 : viewportBounds.top;
    const aboveTop = anchorRect ? anchorRect.top - menuHeight - 6 : viewportBounds.top;
    const nextTop = anchorRect && belowTop + menuHeight > viewportBounds.bottom && aboveTop >= viewportBounds.top
        ? aboveTop
        : clampNumber(belowTop, viewportBounds.top, Math.max(viewportBounds.top, viewportBounds.bottom - menuHeight));

    overflowMenu.style.left = `${Math.round(nextLeft)}px`;
    overflowMenu.style.top = `${Math.round(nextTop)}px`;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
