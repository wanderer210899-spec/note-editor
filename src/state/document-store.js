// src/state/document-store.js
// Responsible for: active-source document state routing across notes and future lorebook editing.

import { normaliseDocumentSource } from '../document-source.js';
import { getSessionState, subscribeSession } from './session-store.js';
import { flushLorebookAutosave, getLorebookState, subscribeLorebook } from './lorebook-store.js';
import { flushAutosave as flushNotesAutosave, getNotesState, subscribeNotes } from './notes-store.js';

const stateRouters = {
    note: {
        getState: getNotesState,
        subscribe: subscribeNotes,
        flushAutosave: flushNotesAutosave,
    },
    lorebook: {
        getState: getLorebookState,
        subscribe: subscribeLorebook,
        flushAutosave: flushLorebookAutosave,
    },
};

export function getActiveDocumentState(sessionState = getSessionState()) {
    return getDocumentStateForSource(sessionState.activeSource);
}

export function subscribeActiveDocumentState(listener) {
    let activeSource = normaliseDocumentSource(getSessionState().activeSource);
    let unsubscribeSourceState = stateRouters[activeSource].subscribe(emitChange);

    const unsubscribeSession = subscribeSession((sessionState) => {
        const nextSource = normaliseDocumentSource(sessionState.activeSource);
        if (nextSource !== activeSource) {
            unsubscribeSourceState?.();
            activeSource = nextSource;
            unsubscribeSourceState = stateRouters[activeSource].subscribe(emitChange);
        }

        emitChange();
    });

    function emitChange() {
        listener(getDocumentStateForSource(activeSource));
    }

    emitChange();

    return () => {
        unsubscribeSourceState?.();
        unsubscribeSession?.();
    };
}

export function flushActiveDocumentAutosave(sessionState = getSessionState()) {
    return stateRouters[normaliseDocumentSource(sessionState.activeSource)].flushAutosave();
}

function getDocumentStateForSource(source) {
    return stateRouters[normaliseDocumentSource(source)].getState();
}
