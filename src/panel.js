// src/panel.js
// Responsible for: the outer panel shell, toolbar mount point, and high-level
// panel state wiring. Bounds math and pointer interactions live in helpers.

import { getSidebarLabel } from './document-source.js';
import {
    closeToolbarTermsMenu,
    flushEditorState,
    mountEditor,
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
import { initPanelDrag, initPanelResize } from './panel-pointer.js';
import { t } from './i18n/index.js';
import { refreshLorebookWorkspace } from './state/lorebook-store.js';
import { getSettingsState, subscribeSettings } from './state/settings-store.js';
import { getSessionState, setActiveSource, subscribeSession } from './state/session-store.js';
import { mountToolbar, renderToolbarOverflowMenu } from './ui/toolbar-view.js';
import { setPanelBounds } from './util.js';

const CLASS_OPEN = 'ne-panel--open';
const CLASS_FULLSCREEN = 'ne-panel--fullscreen';
const CLASS_PREVIEW = 'ne-panel--preview';
const CLASS_MENU = 'ne-panel--menu-open';
const STORAGE_WINDOW_BOUNDS = 'note-editor.windowed-bounds.v1';
const TOOLBAR_TITLE_MIN_WIDTH = 140;
const TOOLBAR_COMPACT_TITLE_MIN_WIDTH = 168;
const TOOLBAR_OPTIONAL_ACTIONS = ['tags', 'preview', 'source'];

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
    toolbarLayoutFrame: 0,
    toolbarLayoutObserver: null,
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
    `;

    host.appendChild(panelState.panelEl);

    bindPanelEvents();
    syncToolbarSource(getSessionState());
    updateToolbarState();
    bindViewportEvents();
    bindSessionEvents();
    bindSettingsEvents();
    return panelState.panelEl;
}

export function openPanel() {
    if (!panelState.panelEl) {
        return;
    }

    applyDefaultWindowBounds(panelState, STORAGE_WINDOW_BOUNDS);
    panelState.toolbar.menu = false;
    panelState.panelEl.classList.add(CLASS_OPEN);
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    if (!hasAppliedDefaultSource) {
        hasAppliedDefaultSource = true;
        const { defaultSource } = getSettingsState();
        if (defaultSource !== getSessionState().activeSource) {
            setActiveSource(defaultSource);
        }
    }
    if (getSessionState().activeSource === 'lorebook') {
        void refreshLorebookWorkspace();
    }
    updateToolbarState();
}

export function closePanel() {
    if (!panelState.panelEl) {
        return;
    }

    flushEditorState();
    panelState.toolbar.menu = false;
    setToolbarOverflowOpen(false);
    panelState.panelEl.classList.remove(CLASS_OPEN);
    updateToolbarState();
}

export function togglePanel() {
    if (!panelState.panelEl) {
        return;
    }

    if (panelState.panelEl.classList.contains(CLASS_OPEN)) {
        closePanel();
        return;
    }

    openPanel();
}

function bindPanelEvents() {
    panelState.panelEl?.addEventListener('ne:set-menu-open', (event) => {
        setMenuOpen(Boolean(event.detail?.open));
    });
    panelState.panelEl?.addEventListener('ne:toolbar-layout-update', scheduleToolbarLayout);
    panelState.panelEl?.addEventListener('pointerdown', handlePanelPointerDown);

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

    panelState.unsubscribeSettings = subscribeSettings(() => {
        syncToolbarSource(getSessionState(), { forceRemount: true });
        updateToolbarState();
        refreshEditorView();
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
    panelState.toolbar.hiddenActions = [];
    panelState.toolbar.compact = false;
    panelState.toolbar.overflowOpen = false;
    bindToolbarEvents();
    observeToolbarLayout();
    mountEditor(panelState.panelEl?.querySelector('#ne-canvas'), { toolbar: panelState.toolbarRefs });
    updateToolbarState();
    refreshEditorView();
    scheduleToolbarLayout();
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
        rememberWindowedBounds: rememberCurrentWindowBounds,
    });
}

function rememberCurrentWindowBounds() {
    rememberWindowedBounds(panelState, STORAGE_WINDOW_BOUNDS);
}

function handleResizeEnd() {
    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
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

    panelState.panelEl.classList.toggle(CLASS_PREVIEW, panelState.toolbar.preview);
    panelState.panelEl.classList.toggle(CLASS_MENU, panelState.toolbar.menu);

    const fullscreen = panelState.panelEl.classList.contains(CLASS_FULLSCREEN);
    const sidebarLabel = getSidebarLabel(panelState.toolbarSource || getSessionState().activeSource);
    updateToggleButton(
        panelState.toolbarRefs?.previewButton,
        panelState.toolbar.preview,
        t('panel.preview.exit'),
        t('panel.preview.toggle'),
    );
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
    if (nextSource === 'lorebook') {
        void refreshLorebookWorkspace();
    }
}

function handleViewportResize() {
    if (!panelState.panelEl?.classList.contains(CLASS_OPEN)) {
        return;
    }

    if (!panelState.hasPositionedPanel) {
        applyDefaultWindowBounds(panelState, STORAGE_WINDOW_BOUNDS, true);
        return;
    }

    if (panelState.panelEl.classList.contains(CLASS_FULLSCREEN)) {
        applyFullscreenBounds(panelState);
        scheduleToolbarLayout();
        return;
    }

    keepPanelReachable(panelState, STORAGE_WINDOW_BOUNDS);
    scheduleToolbarLayout();
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

function scheduleToolbarLayout() {
    if (panelState.toolbarLayoutFrame) {
        cancelAnimationFrame(panelState.toolbarLayoutFrame);
    }

    panelState.toolbarLayoutFrame = requestAnimationFrame(() => {
        panelState.toolbarLayoutFrame = 0;
        applyToolbarLayout();
    });
}

function applyToolbarLayout() {
    const refs = panelState.toolbarRefs;
    if (!refs?.root?.isConnected) {
        return;
    }

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
}

function getAvailableToolbarOptionalActions(refs) {
    const available = [];
    if (refs?.tagsButton && !refs.tagsButton.hidden) {
        available.push('tags');
    }
    if (refs?.previewButton) {
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
        refs.previewButton.hidden = hiddenSet.has('preview');
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
            if (nextSource === 'lorebook') {
                void refreshLorebookWorkspace();
            }
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
