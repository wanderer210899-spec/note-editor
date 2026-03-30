// src/state/session-store.js
// Responsible for: UI-only browsing state such as active source, search, and filters.

import { DOCUMENT_SOURCE_LOREBOOK, DOCUMENT_SOURCE_NOTE, normaliseDocumentSource } from '../document-source.js';

const listeners = new Set();

const defaultSourceState = {
    search: '',
    tag: '',
    filtersOpen: false,
};

const defaultState = {
    activeSource: DOCUMENT_SOURCE_NOTE,
    bySource: {
        [DOCUMENT_SOURCE_NOTE]: { ...defaultSourceState },
        [DOCUMENT_SOURCE_LOREBOOK]: { ...defaultSourceState },
    },
};

let sessionState = { ...defaultState };

export const NOTE_SEARCH_THRESHOLD = 8;

export function subscribeSession(listener) {
    listeners.add(listener);
    listener(getSessionState());
    return () => listeners.delete(listener);
}

export function getSessionState() {
    const activeSource = normaliseDocumentSource(sessionState.activeSource);
    const activeSourceState = sessionState.bySource[activeSource] ?? defaultSourceState;

    return {
        activeSource,
        search: activeSourceState.search,
        tag: activeSourceState.tag,
        termFilter: activeSourceState.tag,
        filtersOpen: activeSourceState.filtersOpen,
        bySource: {
            [DOCUMENT_SOURCE_NOTE]: { ...sessionState.bySource[DOCUMENT_SOURCE_NOTE] },
            [DOCUMENT_SOURCE_LOREBOOK]: { ...sessionState.bySource[DOCUMENT_SOURCE_LOREBOOK] },
        },
    };
}

export function setActiveSource(source) {
    updateSessionState({ activeSource: normaliseDocumentSource(source) });
}

export function setSessionSearch(search) {
    updateActiveSourceState({ search: String(search ?? '') });
}

export function setSessionTagFilter(tag) {
    updateActiveSourceState({ tag: String(tag ?? '') });
}

export function clearSessionTagFilter() {
    updateActiveSourceState({ tag: '' });
}

export function setSessionFiltersOpen(filtersOpen) {
    updateActiveSourceState({ filtersOpen: Boolean(filtersOpen) });
}

function updateSessionState(changes) {
    const nextState = {
        ...sessionState,
        ...changes,
    };
    if (isSameSessionState(sessionState, nextState)) {
        return;
    }

    sessionState = nextState;
    emitChange();
}

function updateActiveSourceState(changes) {
    const activeSource = normaliseDocumentSource(sessionState.activeSource);
    updateSessionState({
        bySource: {
            ...sessionState.bySource,
            [activeSource]: {
                ...(sessionState.bySource[activeSource] ?? defaultSourceState),
                ...changes,
            },
        },
    });
}

function isSameSessionState(left, right) {
    return left.activeSource === right.activeSource
        && isSameSourceState(left.bySource.note, right.bySource.note)
        && isSameSourceState(left.bySource.lorebook, right.bySource.lorebook);
}

function isSameSourceState(left = defaultSourceState, right = defaultSourceState) {
    return left.search === right.search
        && left.tag === right.tag
        && left.filtersOpen === right.filtersOpen;
}

function emitChange() {
    const snapshot = getSessionState();
    listeners.forEach((listener) => listener(snapshot));
}
