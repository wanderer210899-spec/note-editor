// src/panel-bounds.js
// Responsible for: panel bounds persistence, default sizing, fullscreen sizing,
// and keeping the windowed panel inside the viewport.

import {
    DESKTOP_MARGIN,
    DESKTOP_MIN_HEIGHT,
    DESKTOP_MIN_WIDTH,
    MOBILE_DEFAULT_HEIGHT_RATIO,
    MOBILE_DEFAULT_WIDTH,
    MOBILE_MARGIN,
    clampPanelBounds,
    getPanelRect,
    getViewportMetrics,
    isMobileViewport,
    readJsonStorage,
    setElementStyleProperty,
    setPanelBounds,
    writeJsonStorage,
} from './util.js';

const CLASS_FULLSCREEN = 'ne-panel--fullscreen';

export function getClampedBounds(state, bounds) {
    return clampPanelBounds(bounds, state.toolbarRefs);
}

export function applyDefaultWindowBounds(state, storageKey, force = false) {
    if (!state.panelEl) {
        return;
    }

    if (!force && state.hasPositionedPanel) {
        return;
    }

    const storedBounds = readJsonStorage(storageKey);
    if (storedBounds && !force) {
        const nextBounds = getClampedBounds(state, storedBounds);
        setPanelBounds(state.panelEl, nextBounds);
        state.windowedBounds = nextBounds;
        state.hasPositionedPanel = true;
        return;
    }

    const mobile = isMobileViewport();
    const viewport = getViewportMetrics();
    const margin = mobile ? MOBILE_MARGIN : DESKTOP_MARGIN;

    let width;
    let height;
    let left;
    let top;

    if (mobile) {
        width = Math.min(
            viewport.width - (margin * 2),
            Math.max(MOBILE_DEFAULT_WIDTH * 0.78, Math.min(MOBILE_DEFAULT_WIDTH, viewport.width * 0.72))
        );
        height = Math.min(
            viewport.height - (margin * 2),
            Math.max(260, viewport.height * MOBILE_DEFAULT_HEIGHT_RATIO)
        );
        left = viewport.offsetLeft + viewport.width - width - margin;
        top = viewport.offsetTop + margin;
    } else {
        width = Math.min(
            Math.max(viewport.width * 0.45, DESKTOP_MIN_WIDTH),
            viewport.width - (margin * 2)
        );
        height = Math.min(
            Math.max(viewport.height * 0.62, DESKTOP_MIN_HEIGHT),
            viewport.height - (margin * 2)
        );
        left = Math.max(viewport.offsetLeft + margin, Math.round(viewport.offsetLeft + ((viewport.width - width) / 2)));
        top = Math.max(viewport.offsetTop + margin, Math.round(viewport.offsetTop + ((viewport.height - height) / 2)));
    }

    const nextBounds = getClampedBounds(state, { width, height, left, top });
    setPanelBounds(state.panelEl, nextBounds);
    state.hasPositionedPanel = true;
    rememberWindowedBounds(state, storageKey);
}

export function applyFullscreenBounds(state) {
    if (!state.panelEl) {
        return;
    }

    const viewport = getViewportMetrics();
    setElementStyleProperty(state.panelEl, 'min-width', '0px');
    setElementStyleProperty(state.panelEl, 'min-height', '0px');
    setElementStyleProperty(state.panelEl, 'max-width', `${Math.round(viewport.width)}px`);
    setElementStyleProperty(state.panelEl, 'max-height', `${Math.round(viewport.height)}px`);
    setElementStyleProperty(state.panelEl, 'left', `${Math.round(viewport.offsetLeft)}px`);
    setElementStyleProperty(state.panelEl, 'top', `${Math.round(viewport.offsetTop)}px`);
    setElementStyleProperty(state.panelEl, 'right', 'auto');
    setElementStyleProperty(state.panelEl, 'bottom', 'auto');
    setElementStyleProperty(state.panelEl, 'width', `${Math.round(viewport.width)}px`);
    setElementStyleProperty(state.panelEl, 'height', `${Math.round(viewport.height)}px`);
}

export function rememberWindowedBounds(state, storageKey) {
    if (!state.panelEl || state.panelEl.classList.contains(CLASS_FULLSCREEN)) {
        return;
    }

    const rect = getPanelRect(state.panelEl);
    if (!rect) {
        return;
    }

    state.windowedBounds = {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
    };
    writeJsonStorage(storageKey, state.windowedBounds);
}

export function keepPanelReachable(state, storageKey) {
    if (!state.panelEl || state.panelEl.classList.contains(CLASS_FULLSCREEN)) {
        return;
    }

    const rect = getPanelRect(state.panelEl);
    if (!rect) {
        return;
    }

    const nextBounds = getClampedBounds(state, {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
    });

    if (nextBounds.left !== rect.left) {
        setElementStyleProperty(state.panelEl, 'left', `${Math.round(nextBounds.left)}px`);
    }

    if (nextBounds.top !== rect.top) {
        setElementStyleProperty(state.panelEl, 'top', `${Math.round(nextBounds.top)}px`);
    }

    if (nextBounds.width !== rect.width) {
        setElementStyleProperty(state.panelEl, 'width', `${Math.round(nextBounds.width)}px`);
    }

    if (nextBounds.height !== rect.height) {
        setElementStyleProperty(state.panelEl, 'height', `${Math.round(nextBounds.height)}px`);
    }

    rememberWindowedBounds(state, storageKey);
}
