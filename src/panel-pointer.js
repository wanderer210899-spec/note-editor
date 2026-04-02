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
const CLASS_INTERACTING = 'ne-panel--interacting';
const RESIZE_EDGE_POINTER = 12;
const RESIZE_EDGE_TOUCH = 30;
const RESIZE_CORNER_POINTER = 34;
const RESIZE_CORNER_TOUCH = 56;
const RESIZE_MOVE_THRESHOLD = 6;
const WHEEL_RESIZE_SCALE_FACTOR = 1.08;

let activeInteractionCount = 0;

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
    let interactionLocked = false;

    refs.root.addEventListener('pointerdown', (event) => {
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        const titleButton = target?.closest('.ne-toolbar__title');
        const blockedTarget = getToolbarInteractiveTarget(target);
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

        try {
            refs.root.setPointerCapture?.(event.pointerId);
        } catch (error) {
            if (error?.name !== 'NotFoundError') {
                console.warn('[NoteEditor] Pointer capture failed on toolbar drag pointerdown.', error);
            }
        }
    });

    refs.root.addEventListener('pointermove', (event) => {
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

        if (event.pointerId !== dragPointerId) {
            return;
        }

        const movedEnough = Math.hypot(event.clientX - startX, event.clientY - startY) >= RESIZE_MOVE_THRESHOLD;
        if (pendingDrag && !movedEnough) {
            return;
        }

        if (pendingDrag) {
            pendingDrag = false;
            if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
                onExitFullscreen?.();
            }

            if (draggingFromTitle && refs.titleButton) {
                refs.titleButton.dataset.skipClick = 'true';
            }

            beginPointerInteraction(state.panelEl, 'grabbing');
            interactionLocked = true;
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
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

        if (event.pointerId !== dragPointerId) {
            return;
        }

        try {
            refs.root.releasePointerCapture?.(event.pointerId);
        } catch (error) {
            console.warn('[NoteEditor] Pointer capture release failed on toolbar drag end.', error);
        }

        if (draggingFromTitle) {
            clearDeferredTitleSkipClick(refs.titleButton);
        }

        dragPointerId = null;
        pendingDrag = false;
        draggingFromTitle = false;
        if (interactionLocked) {
            endPointerInteraction(state.panelEl);
            interactionLocked = false;
        }
    };

    refs.root.addEventListener('pointerup', endDrag);
    refs.root.addEventListener('pointercancel', endDrag);

    refs.root.addEventListener('touchstart', (event) => {
        if (!shouldUseMobileTouchFallback() || event.touches.length !== 1) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        const titleButton = target?.closest('.ne-toolbar__title');
        const blockedTarget = getToolbarInteractiveTarget(target);
        if (blockedTarget && !titleButton) {
            return;
        }

        const rect = getPanelRect(state.panelEl);
        const touch = getTrackedTouch(event);
        if (!rect || !touch) {
            return;
        }

        let activeTouchId = touch.identifier;
        let touchGrabX = touch.clientX - rect.left;
        let touchGrabY = touch.clientY - rect.top;
        let touchStartX = touch.clientX;
        let touchStartY = touch.clientY;
        let touchPendingDrag = true;
        let touchDraggingFromTitle = Boolean(titleButton);
        let touchInteractionLocked = false;

        const endTouchDrag = (endEvent) => {
            const activeTouch = getTrackedTouch(endEvent, activeTouchId, { includeChangedTouches: true });
            if (!activeTouch) {
                return;
            }

            if (touchDraggingFromTitle) {
                clearDeferredTitleSkipClick(refs.titleButton);
            }

            activeTouchId = null;
            touchPendingDrag = false;
            touchDraggingFromTitle = false;
            if (touchInteractionLocked) {
                endPointerInteraction(state.panelEl);
                touchInteractionLocked = false;
            }

            document.removeEventListener('touchmove', moveTouchDrag);
            document.removeEventListener('touchend', endTouchDrag);
            document.removeEventListener('touchcancel', endTouchDrag);
        };

        const moveTouchDrag = (moveEvent) => {
            const activeTouch = getTrackedTouch(moveEvent, activeTouchId);
            if (!activeTouch) {
                return;
            }

            const movedEnough = Math.hypot(
                activeTouch.clientX - touchStartX,
                activeTouch.clientY - touchStartY,
            ) >= RESIZE_MOVE_THRESHOLD;
            if (touchPendingDrag && !movedEnough) {
                return;
            }

            if (touchPendingDrag) {
                touchPendingDrag = false;
                if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
                    onExitFullscreen?.();
                }

                if (touchDraggingFromTitle && refs.titleButton) {
                    refs.titleButton.dataset.skipClick = 'true';
                }

                beginPointerInteraction(state.panelEl, 'grabbing');
                touchInteractionLocked = true;
            }

            const panelRect = getPanelRect(state.panelEl);
            if (!panelRect) {
                return;
            }

            if (moveEvent.cancelable) {
                moveEvent.preventDefault();
            }

            const nextBounds = getClampedBounds(state, {
                width: panelRect.width,
                height: panelRect.height,
                left: activeTouch.clientX - touchGrabX,
                top: activeTouch.clientY - touchGrabY,
            });

            setElementStyleProperty(state.panelEl, 'left', `${Math.round(nextBounds.left)}px`);
            setElementStyleProperty(state.panelEl, 'top', `${Math.round(nextBounds.top)}px`);
            rememberWindowedBounds?.();
        };

        if (event.cancelable) {
            event.preventDefault();
        }

        document.addEventListener('touchmove', moveTouchDrag, { passive: false });
        document.addEventListener('touchend', endTouchDrag);
        document.addEventListener('touchcancel', endTouchDrag);
    }, { passive: false });
}

function getToolbarInteractiveTarget(target) {
    if (!(target instanceof Element)) {
        return null;
    }

    return target.closest([
        '.ne-tags-menu',
        '.ne-toolbar__overflow-menu',
        '.ne-toolbar__title-input',
        'button',
        'input',
        'select',
        'textarea',
        'a[href]',
        '[role="button"]',
    ].join(', '));
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
    let resizeHint = '';

    panel.addEventListener('pointerdown', (event) => {
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

        if (!event.isPrimary || event.button !== 0) {
            return;
        }

        if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
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

        event.preventDefault();
        event.stopPropagation();
        resizePointerId = event.pointerId;
        resizeMode = nextResizeMode;
        startX = event.clientX;
        startY = event.clientY;
        startBounds = {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
        };
        resizeHint = resizeMode;
        setResizeHint(panel, resizeHint);
        beginPointerInteraction(panel, getResizeCursor(resizeMode));

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
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

        const rect = getPanelRect(state.panelEl);
        if (!rect) {
            setResizeHint(panel, '');
            panel.style.cursor = '';
            return;
        }

        if (resizePointerId === null) {
            resizeHint = getResizeHitZone(rect, event, state.toolbarRefs?.root);
            setResizeHint(panel, resizeHint);
            panel.style.cursor = getResizeCursor(resizeHint);
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
        setElementStyleProperty(state.panelEl, 'top', `${Math.round(nextBounds.top)}px`);
        setElementStyleProperty(state.panelEl, 'height', `${Math.round(nextBounds.height)}px`);
        setElementStyleProperty(state.panelEl, 'width', `${Math.round(nextBounds.width)}px`);
        rememberWindowedBounds?.();
    });

    const endResize = (event) => {
        if (shouldUseMobileTouchFallbackForPointer(event)) {
            return;
        }

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
        resizeHint = '';
        setResizeHint(panel, '');
        panel.style.cursor = '';
        endPointerInteraction(panel);
        onResizeEnd?.();
    };

    panel.addEventListener('pointerleave', () => {
        if (shouldUseMobileTouchFallback()) {
            return;
        }

        if (resizePointerId !== null) {
            return;
        }

        resizeHint = '';
        setResizeHint(panel, '');
        panel.style.cursor = '';
    });

    panel.addEventListener('pointerup', endResize);
    panel.addEventListener('pointercancel', endResize);

    panel.querySelectorAll('.ne-panel__resize-handle').forEach((handle) => {
        handle.addEventListener('touchstart', (event) => {
            if (!shouldUseMobileTouchFallback() || event.touches.length !== 1) {
                return;
            }

            if (state.panelEl?.classList.contains(CLASS_FULLSCREEN)) {
                return;
            }

            const resizeHandle = event.currentTarget instanceof Element ? event.currentTarget : null;
            const nextResizeMode = getResizeHandleMode(resizeHandle);
            const rect = getPanelRect(state.panelEl);
            const touch = getTrackedTouch(event);
            if (!nextResizeMode || !rect || !touch) {
                return;
            }

            let activeTouchId = touch.identifier;
            const touchStartX = touch.clientX;
            const touchStartY = touch.clientY;
            const touchStartBounds = {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
            };

            resizeHint = nextResizeMode;
            setResizeHint(panel, resizeHint);
            beginPointerInteraction(panel, getResizeCursor(nextResizeMode));

            const endTouchResize = (endEvent) => {
                const activeTouch = getTrackedTouch(endEvent, activeTouchId, { includeChangedTouches: true });
                if (!activeTouch) {
                    return;
                }

                activeTouchId = null;
                resizeHint = '';
                setResizeHint(panel, '');
                panel.style.cursor = '';
                endPointerInteraction(panel);
                onResizeEnd?.();

                document.removeEventListener('touchmove', moveTouchResize);
                document.removeEventListener('touchend', endTouchResize);
                document.removeEventListener('touchcancel', endTouchResize);
            };

            const moveTouchResize = (moveEvent) => {
                const activeTouch = getTrackedTouch(moveEvent, activeTouchId);
                if (!activeTouch) {
                    return;
                }

                if (moveEvent.cancelable) {
                    moveEvent.preventDefault();
                }

                const nextBounds = getResizedBounds(
                    nextResizeMode,
                    activeTouch.clientX - touchStartX,
                    activeTouch.clientY - touchStartY,
                    touchStartBounds,
                    state.toolbarRefs,
                );

                setElementStyleProperty(state.panelEl, 'left', `${Math.round(nextBounds.left)}px`);
                setElementStyleProperty(state.panelEl, 'top', `${Math.round(nextBounds.top)}px`);
                setElementStyleProperty(state.panelEl, 'height', `${Math.round(nextBounds.height)}px`);
                setElementStyleProperty(state.panelEl, 'width', `${Math.round(nextBounds.width)}px`);
                rememberWindowedBounds?.();
            };

            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();

            document.addEventListener('touchmove', moveTouchResize, { passive: false });
            document.addEventListener('touchend', endTouchResize);
            document.addEventListener('touchcancel', endTouchResize);
        }, { passive: false });
    });
}

export function initPanelWheelResize(state, { onResizeEnd, rememberWindowedBounds } = {}) {
    const panel = state.panelEl;
    if (!panel) {
        return;
    }

    panel.addEventListener('wheel', (event) => {
        if ((!event.ctrlKey && !event.metaKey) || isMobileViewport()) {
            return;
        }

        if (panel.classList.contains(CLASS_FULLSCREEN) || !panel.classList.contains('ne-panel--open')) {
            return;
        }

        if (
            !event.cancelable
            || (state.toolbarRefs?.titleInput && !state.toolbarRefs.titleInput.hidden)
        ) {
            return;
        }

        const rect = getPanelRect(panel);
        if (!rect || !event.deltaY) {
            return;
        }

        event.preventDefault();
        const resizeScale = event.deltaY < 0
            ? WHEEL_RESIZE_SCALE_FACTOR
            : (1 / WHEEL_RESIZE_SCALE_FACTOR);
        const nextBounds = getClampedBounds(state, {
            width: rect.width * resizeScale,
            height: rect.height * resizeScale,
            left: rect.left,
            top: rect.top,
        });

        setElementStyleProperty(panel, 'left', `${Math.round(nextBounds.left)}px`);
        setElementStyleProperty(panel, 'top', `${Math.round(nextBounds.top)}px`);
        setElementStyleProperty(panel, 'height', `${Math.round(nextBounds.height)}px`);
        setElementStyleProperty(panel, 'width', `${Math.round(nextBounds.width)}px`);
        rememberWindowedBounds?.();
        onResizeEnd?.();
    }, { passive: false });
}

function getResizeHitZone(rect, event, toolbarRoot) {
    if (event.currentTarget instanceof Element && event.currentTarget.classList.contains(CLASS_FULLSCREEN)) {
        return '';
    }

    const touchLike = event.pointerType === 'touch' || isMobileViewport();
    const edgeSize = touchLike ? RESIZE_EDGE_TOUCH : RESIZE_EDGE_POINTER;
    const cornerSize = touchLike ? RESIZE_CORNER_TOUCH : RESIZE_CORNER_POINTER;
    const toolbarBottom = toolbarRoot?.getBoundingClientRect().bottom ?? rect.top;
    const withinLeft = event.clientX >= rect.left - edgeSize && event.clientX <= rect.left + edgeSize;
    const withinRight = event.clientX >= rect.right - edgeSize && event.clientX <= rect.right + edgeSize;
    const withinBottom = event.clientY >= rect.bottom - edgeSize && event.clientY <= rect.bottom + edgeSize;
    const belowHeader = event.clientY >= toolbarBottom;
    const leftDistance = Math.abs(event.clientX - rect.left);
    const rightDistance = Math.abs(event.clientX - rect.right);
    const bottomDistance = Math.abs(event.clientY - rect.bottom);
    const bottomLeftDistance = Math.hypot(leftDistance, bottomDistance);
    const bottomRightDistance = Math.hypot(rightDistance, bottomDistance);

    if (
        belowHeader
        && event.clientX >= rect.left - edgeSize
        && event.clientX <= rect.left + cornerSize
        && event.clientY >= rect.bottom - cornerSize
        && event.clientY <= rect.bottom + edgeSize
        && bottomLeftDistance <= cornerSize
    ) {
        return 'bottom-left';
    }

    if (
        belowHeader
        && event.clientX >= rect.right - cornerSize
        && event.clientX <= rect.right + edgeSize
        && event.clientY >= rect.bottom - cornerSize
        && event.clientY <= rect.bottom + edgeSize
        && bottomRightDistance <= cornerSize
    ) {
        return 'bottom-right';
    }

    if (withinBottom && belowHeader && withinLeft) {
        return bottomDistance <= leftDistance ? 'bottom' : 'left';
    }

    if (withinBottom && belowHeader && withinRight) {
        return bottomDistance <= rightDistance ? 'bottom' : 'right';
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

function getResizeHandleMode(handle) {
    if (!(handle instanceof Element)) {
        return '';
    }

    if (handle.classList.contains('ne-panel__resize-handle--bottom-left')) {
        return 'bottom-left';
    }

    if (handle.classList.contains('ne-panel__resize-handle--bottom-right')) {
        return 'bottom-right';
    }

    if (handle.classList.contains('ne-panel__resize-handle--bottom')) {
        return 'bottom';
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
    let top = startBounds.top;

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
        top,
    }, toolbarRefs);
}

function setResizeHint(panel, zone = '') {
    if (!panel) {
        return;
    }

    if (!zone || isMobileViewport() || panel.classList.contains(CLASS_FULLSCREEN)) {
        delete panel.dataset.resizeZone;
        return;
    }

    panel.dataset.resizeZone = zone;
}

export function shouldUseMobileTouchFallback() {
    return window.matchMedia('(pointer: coarse)').matches || (supportsTouchInput() && isMobileViewport());
}

export function shouldUseMobileTouchFallbackForPointer(event) {
    return event?.pointerType === 'touch' || shouldUseMobileTouchFallback();
}

function supportsTouchInput() {
    return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

export function getTrackedTouch(event, identifier = null, { includeChangedTouches = false } = {}) {
    const touchLists = [];
    if (event?.touches) {
        touchLists.push(event.touches);
    }
    if (includeChangedTouches && event?.changedTouches) {
        touchLists.push(event.changedTouches);
    }

    for (const touchList of touchLists) {
        for (const touch of touchList) {
            if (identifier === null || touch.identifier === identifier) {
                return touch;
            }
        }
    }

    return null;
}

function clearDeferredTitleSkipClick(titleButton) {
    window.setTimeout(() => {
        if (titleButton?.dataset.skipClick === 'true') {
            delete titleButton.dataset.skipClick;
        }
    }, 0);
}

function beginPointerInteraction(panel, cursor = '') {
    if (activeInteractionCount === 0) {
        document.addEventListener('selectstart', preventInteractionSelection, true);
        document.addEventListener('dragstart', preventInteractionSelection, true);
    }

    activeInteractionCount += 1;
    panel?.classList.add(CLASS_INTERACTING);
    if (panel) {
        panel.style.touchAction = 'none';
    }
    document.documentElement.style.userSelect = 'none';
    document.documentElement.style.webkitUserSelect = 'none';
    document.documentElement.style.touchAction = 'none';
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.cursor = cursor;
    document.documentElement.style.cursor = cursor;
}

function endPointerInteraction(panel) {
    if (activeInteractionCount > 0) {
        activeInteractionCount -= 1;
    }

    if (activeInteractionCount > 0) {
        return;
    }

    panel?.classList.remove(CLASS_INTERACTING);
    if (panel) {
        panel.style.touchAction = '';
    }
    document.removeEventListener('selectstart', preventInteractionSelection, true);
    document.removeEventListener('dragstart', preventInteractionSelection, true);
    document.documentElement.style.userSelect = '';
    document.documentElement.style.webkitUserSelect = '';
    document.documentElement.style.touchAction = '';
    document.documentElement.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.body.style.touchAction = '';
    document.body.style.cursor = '';
}

function preventInteractionSelection(event) {
    if (event.cancelable) {
        event.preventDefault();
    }
}
