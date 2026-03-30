// src/document-actions.js
// Responsible for: source-aware document mutations so editor and sidebar code stay source-agnostic.

import { normaliseDocumentSource } from './document-source.js';
import { getSessionState } from './state/session-store.js';
import {
    addCurrentLorebookKeyword,
    addCurrentLorebookKeywords,
    addCurrentLorebookSecondaryKeyword,
    addCurrentLorebookSecondaryKeywords,
    createLorebookEntry,
    openLorebookEntry,
    removeCurrentLorebookKeyword,
    removeCurrentLorebookSecondaryKeyword,
    setCurrentLorebookSecondaryKeywordLogic,
    updateCurrentLorebookEntry,
} from './state/lorebook-store.js';
import {
    addCurrentNoteTag,
    addCurrentNoteTags,
    createNote,
    openNote,
    removeCurrentNoteTag,
    updateCurrentNote,
} from './state/notes-store.js';

const actionRouters = {
    note: {
        createDocument: createNote,
        openDocument: openNote,
        updateCurrentDocument: updateCurrentNote,
        addCurrentDocumentTerm: addCurrentNoteTag,
        addCurrentDocumentTerms: addCurrentNoteTags,
        removeCurrentDocumentTerm: removeCurrentNoteTag,
        addCurrentDocumentSecondaryTerm: () => false,
        addCurrentDocumentSecondaryTerms: () => false,
        removeCurrentDocumentSecondaryTerm: () => false,
        setCurrentDocumentSecondaryTermLogic: () => false,
    },
    lorebook: {
        createDocument: createLorebookEntry,
        openDocument: openLorebookEntry,
        updateCurrentDocument: updateCurrentLorebookEntry,
        addCurrentDocumentTerm: addCurrentLorebookKeyword,
        addCurrentDocumentTerms: addCurrentLorebookKeywords,
        removeCurrentDocumentTerm: removeCurrentLorebookKeyword,
        addCurrentDocumentSecondaryTerm: addCurrentLorebookSecondaryKeyword,
        addCurrentDocumentSecondaryTerms: addCurrentLorebookSecondaryKeywords,
        removeCurrentDocumentSecondaryTerm: removeCurrentLorebookSecondaryKeyword,
        setCurrentDocumentSecondaryTermLogic: setCurrentLorebookSecondaryKeywordLogic,
    },
};

export function createCurrentSourceDocument(overrides = {}, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].createDocument(overrides);
}

export function openDocumentInSource(documentId, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].openDocument(documentId);
}

export function updateCurrentDocument(changes, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].updateCurrentDocument(changes);
}

export function addCurrentDocumentTerm(term, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].addCurrentDocumentTerm(term);
}

export function addCurrentDocumentTerms(terms, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].addCurrentDocumentTerms(terms);
}

export function removeCurrentDocumentTerm(term, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].removeCurrentDocumentTerm(term);
}

export function addCurrentDocumentSecondaryTerm(term, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].addCurrentDocumentSecondaryTerm(term);
}

export function addCurrentDocumentSecondaryTerms(terms, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].addCurrentDocumentSecondaryTerms(terms);
}

export function removeCurrentDocumentSecondaryTerm(term, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].removeCurrentDocumentSecondaryTerm(term);
}

export function setCurrentDocumentSecondaryTermLogic(logic, source = getSessionState().activeSource) {
    return actionRouters[normaliseDocumentSource(source)].setCurrentDocumentSecondaryTermLogic(logic);
}
