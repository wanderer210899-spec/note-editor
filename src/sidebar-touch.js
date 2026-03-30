// src/sidebar-touch.js
// Responsible for: swipe gesture state for sidebar folder and note rows.

export function beginSidebarSwipe(event) {
    if (event.pointerType !== 'touch') {
        return null;
    }

    const row = event.target.closest('[data-swipe-row-key]');
    if (!row) {
        return null;
    }

    return {
        rowKey: row.dataset.swipeRowKey,
        startX: event.clientX,
        startY: event.clientY,
        handled: false,
    };
}

export function updateSidebarSwipe(event, touchSwipeState, uiState) {
    if (!touchSwipeState || touchSwipeState.handled || event.pointerType !== 'touch') {
        return {
            nextTouchSwipeState: touchSwipeState,
            shouldRender: false,
        };
    }

    const deltaX = event.clientX - touchSwipeState.startX;
    const deltaY = event.clientY - touchSwipeState.startY;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return {
            nextTouchSwipeState: touchSwipeState,
            shouldRender: false,
        };
    }

    const nextTouchSwipeState = {
        ...touchSwipeState,
        handled: true,
    };

    uiState.revealedRowKey = deltaX < 0 ? touchSwipeState.rowKey : '';
    if (uiState.revealedRowKey !== touchSwipeState.rowKey) {
        uiState.moveMenuNoteId = null;
    }

    return {
        nextTouchSwipeState,
        shouldRender: true,
    };
}
