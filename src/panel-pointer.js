// src/panel-pointer.js
// Responsible for: toolbar dragging and edge/corner resize interactions.

import {
    clampPanelBounds,
    DESKTOP_MARGIN,
    MOBILE_MARGIN,
    getPanelRect,
    getViewportMetrics,
    getWindowedMinimumSize,
    isMobileViewport,
    setElementStyleProperty,
} from './util.js';
import { getClampedBounds } from './panel-bounds.js';

const CLASS_FULLSCREEN = 'ne-panel--fullscreen';
const RESIZE_EDGE_POINTER = 12;
const RESIZE_EDGE_TOUCH = 24;
const RESIZE_CORNER_POINTER = 28;
const RESIZE_CORNER_TOUCH = 40;

export function initPanelDrag(state, { onExitFullscreen, rememberWindowedBounds } = {}) {
    const refs = state.toolbarRefs;
    if (!refs?.root) {
        return;
    }

    let dragPointerId = null;
    let grabX = 0;
    let grabY = 0;
    let startX = 0;
    let startY = 0;
    let pendingDrag = false;
    let draggingFromTitle = false;

    refs.root.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        const titleButton = target?.closest('.ne-toolbar__title');
        const blockedTarget = target?.closest('.ne-tags-menu, .ne-toolbar__title-input, .ne-btn');
        if (blockedTarget && !titleButton) {
            return;
        }

        const rect = getPanelRect(state.panelEl);
        if (!rect) {
            return;
        }

        dragPointerId = event.pointerId;
        grabX = event.clientX - rect.left;
        grabY = event.clientY - rect.top;
        startX = event.clientX;
        startY = event.clientY;
        pendingDrag = true;
        draggingFromTitle = Boolean(titleButton);
    });

    refs.root.addEventListener('pointermove', (event) => {
        if (event.pointerId !== dragPointerId) {
            return;
        }

        const movedEnough = Math.hypot(event.clientX - startX, event.clientY - startY) >= 6;
        if (pendingDrag && !movedEnough) {
            return;
        }

        if (pendingDrag) {
            pendingDrag = false;
            if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
                onExitFullscreen?.();
            }

            try {
                refs.root.setPointerCapture?.(event.pointerId);
            } catch (error) {
                console.warn('[NoteEditor] Pointer capture failed on toolbar drag start.', error);
            }

            if (draggingFromTitle && refs.titleButton) {
                refs.titleButton.dataset.skipClick = 'true';
            }
        }

        const rect = getPanelRect(state.panelEl);
        if (!rect) {
            return;
        }

        event.preventDefault();
        const nextBounds = getClampedBounds(state, {
            width: rect.width,
            height: rect.height,
            left: event.clientX - grabX,
            top: event.clientY - grabY,
        });

        setElementStyleProperty(state.panelEl, 'left', `${Math.round(nextBounds.left)}px`);
        setElementStyleProperty(state.panelEl, 'top', `${Math.round(nextBounds.top)}px`);
        rememberWindowedBounds?.();
    });

    const endDrag = (event) => {
        if (event.pointerId !== dragPointerId) {
            return;
        }

        try {
            refs.root.releasePointerCapture?.(event.pointerId);
        } catch (error) {
            console.warn('[NoteEditor] Pointer capture release failed on toolbar drag end.', error);
        }

        if (draggingFromTitle) {
            window.setTimeout(() => {
                if (refs.titleButton?.dataset.skipClick === 'true') {
                    delete refs.titleButton.dataset.skipClick;
                }
            }, 0);
        }

        dragPointerId = null;
        pendingDrag = false;
        draggingFromTitle = false;
    };

    refs.root.addEventListener('pointerup', endDrag);
    refs.root.addEventListener('pointercancel', endDrag);
}

export function initPanelResize(state, { onExitFullscreen, onResizeEnd, rememberWindowedBounds } = {}) {
    const panel = state.panelEl;
    if (!panel) {
        return;
    }

    let resizePointerId = null;
    let resizeMode = '';
    let startX = 0;
    let startY = 0;
    let startBounds = null;

    panel.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        const rect = getPanelRect(state.panelEl);
        if (!rect) {
            return;
        }

        const nextResizeMode = getResizeHitZone(rect, event, state.toolbarRefs?.root);
        if (!nextResizeMode) {
            return;
        }

        if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
            onExitFullscreen?.();
        }

        const nextRect = getPanelRect(state.panelEl);
        if (!nextRect) {
            return;
        }

        event.preventDefault();
        resizePointerId = event.pointerId;
        resizeMode = nextResizeMode;
        startX = event.clientX;
        startY = event.clientY;
        startBounds = {
            width: nextRect.width,
            height: nextRect.height,
            left: nextRect.left,
            top: nextRect.top,
        };
        panel.style.cursor = getResizeCursor(resizeMode);

        try {
            panel.setPointerCapture?.(event.pointerId);
        } catch (error) {
            if (error?.name === 'NotFoundError') {
                return;
            }
            console.warn('[NoteEditor] Pointer capture failed on resize start.', error);
        }
    });

    panel.addEventListener('pointermove', (event) => {
        const rect = getPanelRect(state.panelEl);
        if (!rect) {
            panel.style.cursor = '';
            return;
        }

        if (resizePointerId === null) {
            panel.style.cursor = getResizeCursor(getResizeHitZone(rect, event, state.toolbarRefs?.root));
            return;
        }

        if (event.pointerId !== resizePointerId) {
            return;
        }

        event.preventDefault();
        const nextBounds = getResizedBounds(
            resizeMode,
            event.clientX - startX,
            event.clientY - startY,
            startBounds ?? {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
            },
            state.toolbarRefs,
        );

        setElementStyleProperty(state.panelEl, 'left', `${Math.round(nextBounds.left)}px`);
        setElementStyleProperty(state.panelEl, 'height', `${Math.round(nextBounds.height)}px`);
        setElementStyleProperty(state.panelEl, 'width', `${Math.round(nextBounds.width)}px`);
        rememberWindowedBounds?.();
    });

    const endResize = (event) => {
        if (event.pointerId !== resizePointerId) {
            return;
        }

        try {
            panel.releasePointerCapture?.(event.pointerId);
        } catch (error) {
            if (error?.name === 'NotFoundError') {
                return;
            }
            console.warn('[NoteEditor] Pointer capture release failed on resize end.', error);
        }

        resizePointerId = null;
        resizeMode = '';
        startBounds = null;
        panel.style.cursor = '';
        onResizeEnd?.();
    };

    panel.addEventListener('pointerleave', () => {
        if (resizePointerId !== null) {
            return;
        }

        panel.style.cursor = '';
    });

    panel.addEventListener('pointerup', endResize);
    panel.addEventListener('pointercancel', endResize);
}

function getResizeHitZone(rect, event, toolbarRoot) {
    const touchLike = event.pointerType === 'touch' || isMobileViewport();
    const edgeSize = touchLike ? RESIZE_EDGE_TOUCH : RESIZE_EDGE_POINTER;
    const cornerSize = touchLike ? RESIZE_CORNER_TOUCH : RESIZE_CORNER_POINTER;
    const toolbarBottom = toolbarRoot?.getBoundingClientRect().bottom ?? rect.top;
    const withinLeft = event.clientX >= rect.left - edgeSize && event.clientX <= rect.left + edgeSize;
    const withinRight = event.clientX >= rect.right - edgeSize && event.clientX <= rect.right + edgeSize;
    const withinBottom = event.clientY >= rect.bottom - edgeSize && event.clientY <= rect.bottom + edgeSize;
    const belowHeader = event.clientY >= toolbarBottom;

    if (withinBottom && event.clientX <= rect.left + cornerSize) {
        return 'bottom-left';
    }

    if (withinBottom && event.clientX >= rect.right - cornerSize) {
        return 'bottom-right';
    }

    if (belowHeader && withinLeft) {
        return 'left';
    }

    if (belowHeader && withinRight) {
        return 'right';
    }

    if (withinBottom) {
        return 'bottom';
    }

    return '';
}

function getResizeCursor(axis) {
    if (axis === 'bottom-left') {
        return 'nesw-resize';
    }

    if (axis === 'bottom-right') {
        return 'nwse-resize';
    }

    if (axis === 'left' || axis === 'right') {
        return 'ew-resize';
    }

    if (axis === 'bottom') {
        return 'ns-resize';
    }

    return '';
}

function getResizedBounds(mode, deltaX, deltaY, startBounds, toolbarRefs) {
    const viewport = getViewportMetrics();
    const margin = isMobileViewport() ? MOBILE_MARGIN : DESKTOP_MARGIN;
    const minimum = getWindowedMinimumSize(toolbarRefs);
    const maxWidth = Math.max(minimum.width, viewport.width - (margin * 2));
    const maxHeight = Math.max(minimum.height, viewport.height - (margin * 2));

    let width = startBounds.width;
    let height = startBounds.height;
    let left = startBounds.left;

    if (mode === 'left' || mode === 'bottom-left') {
        width = Math.min(Math.max(startBounds.width - deltaX, minimum.width), maxWidth);
        left = startBounds.left + (startBounds.width - width);
    }

    if (mode === 'right' || mode === 'bottom-right') {
        width = Math.min(Math.max(startBounds.width + deltaX, minimum.width), maxWidth);
    }

    if (mode === 'bottom' || mode === 'bottom-left' || mode === 'bottom-right') {
        height = Math.min(Math.max(startBounds.height + deltaY, minimum.height), maxHeight);
    }

    return clampPanelBounds({
        width,
        height,
        left,
        top: startBounds.top,
    }, toolbarRefs);
}
