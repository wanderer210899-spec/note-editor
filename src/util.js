// src/util.js
// Shared helpers used by the panel shell, note store, and editor UI.

export const MOBILE_BREAKPOINT = 768;
export const MOBILE_MARGIN = 12;
export const DESKTOP_MARGIN = 0;
export const DESKTOP_MIN_WIDTH = 220;
export const DESKTOP_MIN_HEIGHT = 200;
export const MOBILE_MIN_WIDTH = 220;
export const MOBILE_MIN_HEIGHT = 260;
export const MOBILE_DEFAULT_WIDTH = 360;
export const MOBILE_DEFAULT_HEIGHT_RATIO = 0.42;
export const PANEL_STYLE_PRIORITY = 'important';

export function isMobileViewport() {
    return window.innerWidth <= MOBILE_BREAKPOINT || window.matchMedia('(pointer: coarse)').matches;
}

export function getViewportMetrics() {
    const viewport = window.visualViewport;

    if (viewport) {
        return {
            width: viewport.width,
            height: viewport.height,
            offsetLeft: viewport.offsetLeft,
            offsetTop: viewport.offsetTop,
        };
    }

    return {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
    };
}

export function getPanelRect(panelEl) {
    return panelEl?.getBoundingClientRect() ?? null;
}

export function setElementStyleProperty(element, name, value, priority = PANEL_STYLE_PRIORITY) {
    element?.style.setProperty(name, value, priority);
}

export function setPanelBounds(panelEl, { width, height, left, top }) {
    setElementStyleProperty(panelEl, 'min-width', '0px');
    setElementStyleProperty(panelEl, 'min-height', '0px');
    setElementStyleProperty(panelEl, 'max-width', 'none');
    setElementStyleProperty(panelEl, 'max-height', 'none');
    setElementStyleProperty(panelEl, 'width', `${Math.round(width)}px`);
    setElementStyleProperty(panelEl, 'height', `${Math.round(height)}px`);
    setElementStyleProperty(panelEl, 'left', `${Math.round(left)}px`);
    setElementStyleProperty(panelEl, 'top', `${Math.round(top)}px`);
    setElementStyleProperty(panelEl, 'right', 'auto');
    setElementStyleProperty(panelEl, 'bottom', 'auto');
}

export function getToolbarMinimumWidth({ toolbar, menuButton, sourceSwitch, actions }) {
    const mobile = isMobileViewport();
    const baseMinimum = mobile ? MOBILE_MIN_WIDTH : DESKTOP_MIN_WIDTH;

    if (!toolbar) {
        return baseMinimum;
    }

    const toolbarStyle = getComputedStyle(toolbar);
    const menuWidth = menuButton?.getBoundingClientRect().width ?? 0;
    const sourceWidth = sourceSwitch?.getBoundingClientRect().width ?? 0;
    const actionsWidth = actions?.getBoundingClientRect().width ?? 0;
    const gap = parseFloat(toolbarStyle.columnGap || toolbarStyle.gap || '0') || 0;
    const paddingX = (parseFloat(toolbarStyle.paddingLeft) || 0) + (parseFloat(toolbarStyle.paddingRight) || 0);
    const minimumTitleWidth = mobile ? 72 : 140;
    const measuredMinimum = menuWidth + sourceWidth + actionsWidth + paddingX + (gap * 3) + minimumTitleWidth;

    return Math.ceil(Math.max(baseMinimum, measuredMinimum));
}

export function getWindowedMinimumSize(toolbarRefs) {
    const minimumWidth = getToolbarMinimumWidth(toolbarRefs);

    if (isMobileViewport()) {
        return {
            width: Math.max(MOBILE_MIN_WIDTH, minimumWidth),
            height: MOBILE_MIN_HEIGHT,
        };
    }

    return {
        width: Math.max(DESKTOP_MIN_WIDTH, minimumWidth),
        height: DESKTOP_MIN_HEIGHT,
    };
}

export function clampPanelBounds(bounds, toolbarRefs) {
    const viewport = getViewportMetrics();
    const margin = isMobileViewport() ? MOBILE_MARGIN : DESKTOP_MARGIN;
    const minimum = getWindowedMinimumSize(toolbarRefs);
    const maxWidth = Math.max(minimum.width, viewport.width - (margin * 2));
    const maxHeight = Math.max(minimum.height, viewport.height - (margin * 2));
    const clampedWidth = Math.min(Math.max(bounds.width, minimum.width), maxWidth);
    const clampedHeight = Math.min(Math.max(bounds.height, minimum.height), maxHeight);
    const minLeft = viewport.offsetLeft + margin;
    const maxLeft = viewport.offsetLeft + viewport.width - clampedWidth - margin;
    const minTop = viewport.offsetTop + margin;
    const maxTop = viewport.offsetTop + viewport.height - clampedHeight - margin;

    return {
        width: clampedWidth,
        height: clampedHeight,
        left: Math.min(maxLeft, Math.max(minLeft, bounds.left)),
        top: Math.min(maxTop, Math.max(minTop, bounds.top)),
    };
}

export function readJsonStorage(key) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn(`[NoteEditor] Failed to read storage key "${key}".`, error);
        return null;
    }
}

export function writeJsonStorage(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`[NoteEditor] Failed to write storage key "${key}".`, error);
    }
}

export function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

export function scheduleIdleTask(callback, { timeout = 120 } = {}) {
    if (typeof callback !== 'function') {
        return null;
    }

    if (typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(callback, { timeout });
    }

    return window.setTimeout(() => {
        callback({
            didTimeout: true,
            timeRemaining: () => 0,
        });
    }, 0);
}

export function cancelIdleTask(handle) {
    if (handle === null || handle === undefined) {
        return;
    }

    if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle);
        return;
    }

    window.clearTimeout(handle);
}

export function createId(prefix = 'note') {
    if (window.crypto?.randomUUID) {
        return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}
