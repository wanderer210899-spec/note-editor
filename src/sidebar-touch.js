// src/sidebar-touch.js
// Responsible for: swipe gesture state for sidebar folder and note rows.

export function beginSidebarSwipe(event) {
    if (!event.isPrimary || event.pointerType !== 'touch') {
        return null;
    }

    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest('[data-swipe-row-key]');
    const swipeHandle = target?.closest('[data-swipe-handle="true"]');
    if (!row || !swipeHandle || !row.contains(swipeHandle)) {
        return null;
    }

    return {
        pointerId: event.pointerId,
        rowKey: row.dataset.swipeRowKey,
        startX: event.clientX,
        startY: event.clientY,
        axis: '',
        handled: false,
    };
}

export function updateSidebarSwipe(event, touchSwipeState, uiState) {
    if (
        !touchSwipeState
        || touchSwipeState.handled
        || event.pointerType !== 'touch'
        || event.pointerId !== touchSwipeState.pointerId
    ) {
        return {
            nextTouchSwipeState: touchSwipeState,
            shouldRender: false,
        };
    }

    const deltaX = event.clientX - touchSwipeState.startX;
    const deltaY = event.clientY - touchSwipeState.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (!touchSwipeState.axis) {
        if (distance < 10) {
            return {
                nextTouchSwipeState: touchSwipeState,
                shouldRender: false,
            };
        }

        const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        return {
            nextTouchSwipeState: {
                ...touchSwipeState,
                axis,
                handled: axis === 'y',
            },
            shouldRender: false,
        };
    }

    if (touchSwipeState.axis !== 'x' || Math.abs(deltaX) < 36) {
        return {
            nextTouchSwipeState: touchSwipeState,
            shouldRender: false,
        };
    }

    if (event.cancelable) {
        event.preventDefault();
    }

    const nextTouchSwipeState = {
        ...touchSwipeState,
        handled: true,
    };

    const nextRevealedRowKey = deltaX < 0 ? touchSwipeState.rowKey : '';
    const previousRevealedRowKey = uiState.revealedRowKey;
    uiState.revealedRowKey = nextRevealedRowKey;
    if (previousRevealedRowKey !== nextRevealedRowKey) {
        uiState.moveMenuNoteId = null;
    }

    return {
        nextTouchSwipeState,
        shouldRender: previousRevealedRowKey !== nextRevealedRowKey,
    };
}
