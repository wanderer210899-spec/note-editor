// src/integrations/launcher-actions.js
// Responsible for: mapping launcher surfaces onto existing panel/source/document actions.

import { createCurrentSourceDocument } from '../document-actions.js';
import {
    DOCUMENT_SOURCE_LOREBOOK,
    DOCUMENT_SOURCE_NOTE,
    normaliseDocumentSource,
} from '../document-source.js';
import { openPanel, togglePanel } from '../panel.js';
import { refreshLorebookWorkspace } from '../state/lorebook-store.js';
import { getSessionState, setActiveSource } from '../state/session-store.js';

export const LAUNCHER_ACTION_OPEN = 'open';
export const LAUNCHER_ACTION_OPEN_NOTE = 'open-note';
export const LAUNCHER_ACTION_OPEN_LOREBOOK = 'open-lorebook';
export const LAUNCHER_ACTION_TOGGLE = 'toggle';
export const LAUNCHER_ACTION_CREATE_CURRENT = 'create-current';
export const LAUNCHER_ACTION_CREATE_NOTE = 'create-note';
export const LAUNCHER_ACTION_CREATE_LOREBOOK = 'create-lorebook';

export async function runLauncherAction(actionId) {
    switch (String(actionId ?? '').trim()) {
        case LAUNCHER_ACTION_OPEN_NOTE:
            return openLauncherSource(DOCUMENT_SOURCE_NOTE);
        case LAUNCHER_ACTION_OPEN_LOREBOOK:
            return openLauncherSource(DOCUMENT_SOURCE_LOREBOOK);
        case LAUNCHER_ACTION_TOGGLE:
            togglePanel();
            return true;
        case LAUNCHER_ACTION_CREATE_CURRENT:
            return createLauncherDocument(getSessionState().activeSource);
        case LAUNCHER_ACTION_CREATE_NOTE:
            return createLauncherDocument(DOCUMENT_SOURCE_NOTE);
        case LAUNCHER_ACTION_CREATE_LOREBOOK:
            return createLauncherDocument(DOCUMENT_SOURCE_LOREBOOK);
        case LAUNCHER_ACTION_OPEN:
        default:
            openPanel();
            return true;
    }
}

async function openLauncherSource(source) {
    const nextSource = normaliseDocumentSource(source);
    if (nextSource !== getSessionState().activeSource) {
        setActiveSource(nextSource);
    }

    openPanel({ source: nextSource });
    return true;
}

async function createLauncherDocument(source) {
    const nextSource = normaliseDocumentSource(source);
    if (nextSource !== getSessionState().activeSource) {
        setActiveSource(nextSource);
    }

    openPanel({ source: nextSource });

    const immediateCreate = createCurrentSourceDocument({}, nextSource);
    if (immediateCreate) {
        return true;
    }

    if (nextSource === DOCUMENT_SOURCE_LOREBOOK) {
        await refreshLorebookWorkspace();
        return Boolean(createCurrentSourceDocument({}, nextSource));
    }

    return false;
}
