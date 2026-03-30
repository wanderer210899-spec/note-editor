// src/state/notes-store.js
// Responsible for: note data, subscriptions, autosave scheduling, and store mutations.

import {
    makeFolder,
    makeNote,
    normaliseFolderName,
    normaliseSettings,
    normaliseTagForStorage,
} from './notes-model.js';
import { reconcileNoteAnalysisCache } from './notes-selectors.js';
import { getDocumentSourceUi, DOCUMENT_SOURCE_NOTE } from '../document-source.js';
import { persistSettingsNow, readStoredSettings } from './notes-persistence.js';
import { normalizeTagForSearch } from '../tag-utils.js';

const AUTOSAVE_DELAY_MS = 450;

const listeners = new Set();

let autosaveTimer = null;
let saveStatus = 'saved';
let settings = normaliseSettings(readStoredSettings());
let stateRevision = 0;
let noteLookup = buildLookup(settings.notes);
let folderLookup = buildLookup(settings.folders);
let settingsSnapshotCache = null;
let currentDocumentCache = null;
const sourceUi = getDocumentSourceUi(DOCUMENT_SOURCE_NOTE);
let tagIndex = new Map();
let tagIndexRevision = 0;
buildTagIndex(settings.notes);

export function subscribeNotes(listener) {
    listeners.add(listener);
    listener(getNotesState());
    return () => listeners.delete(listener);
}

export function getNotesState() {
    return {
        settings: getSettingsSnapshot(),
        currentDocument: getCurrentDocumentSnapshot(),
        saveStatus,
        sourceUi,
        tagIndex,
        tagIndexRevision,
    };
}

export function getFolderById(folderId) {
    return typeof folderId === 'string' && folderId ? (folderLookup.get(folderId) ?? null) : null;
}

export function createNote(overrides = {}) {
    const note = makeNote(overrides);
    noteLookup.set(note.id, note);
    addToTagIndex(note.tags);

    commit((draft) => {
        draft.notes.unshift(note);
        draft.currentNoteId = note.id;
        return true;
    });

    return note;
}

export function openNote(noteId) {
    if (!noteLookup.has(noteId)) {
        return;
    }

    commit((draft) => {
        if (draft.currentNoteId === noteId) {
            return false;
        }

        draft.currentNoteId = noteId;
        return true;
    }, { persist: false });
}

export function updateCurrentNote(changes) {
    ensureCurrentNote();

    commit((draft) => {
        const note = getCurrentNote();
        if (!note) {
            return false;
        }

        let changed = false;

        if (typeof changes.title === 'string' && note.title !== changes.title) {
            note.title = changes.title;
            changed = true;
        }

        if (typeof changes.content === 'string' && note.content !== changes.content) {
            note.content = changes.content;
            changed = true;
        }

        if (
            (typeof changes.folderId === 'string' || changes.folderId === null)
            && note.folderId !== changes.folderId
        ) {
            note.folderId = changes.folderId;
            changed = true;
        }

        if (!changed) {
            return false;
        }

        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function toggleNotePinned(noteId) {
    if (!noteId) {
        return;
    }

    commit((draft) => {
        const note = noteLookup.get(noteId);
        if (!note) {
            return false;
        }

        note.pinned = !note.pinned;
        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function moveNoteToFolder(noteId, folderId) {
    if (!noteId) {
        return;
    }

    const nextFolderId = folderId || null;

    commit((draft) => {
        const note = noteLookup.get(noteId);
        if (!note || note.folderId === nextFolderId) {
            return false;
        }

        note.folderId = nextFolderId;
        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function addCurrentNoteTag(tag) {
    const storedTag = normaliseTagForStorage(tag);
    if (!storedTag) {
        return;
    }

    ensureCurrentNote();
    commit((draft) => {
        const note = getCurrentNote();
        if (!note || note.tags.includes(storedTag)) {
            return false;
        }

        note.tags.push(storedTag);
        addToTagIndex([storedTag]);
        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function addCurrentNoteTags(tags) {
    const storedTags = [...new Set((Array.isArray(tags) ? tags : []).map(normaliseTagForStorage).filter(Boolean))];
    if (storedTags.length === 0) {
        return;
    }

    ensureCurrentNote();
    commit((draft) => {
        const note = getCurrentNote();
        if (!note) {
            return false;
        }

        const existing = new Set(note.tags);
        const toAdd = storedTags.filter((tag) => !existing.has(tag));
        if (toAdd.length === 0) {
            return false;
        }

        note.tags.push(...toAdd);
        addToTagIndex(toAdd);
        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function removeCurrentNoteTag(tag) {
    ensureCurrentNote();
    commit((draft) => {
        const note = getCurrentNote();
        if (!note) {
            return false;
        }

        const nextTags = note.tags.filter((item) => item !== tag);
        if (nextTags.length === note.tags.length) {
            return false;
        }

        note.tags = nextTags;
        removeFromTagIndex([tag]);
        note.updatedAt = new Date().toISOString();
        return true;
    });
}

export function createFolder(name) {
    const folder = makeFolder({ name: normaliseFolderName(name) });
    folderLookup.set(folder.id, folder);

    commit((draft) => {
        draft.folders.push(folder);
        return true;
    });

    return folder;
}

export function renameFolder(folderId, name) {
    const trimmedName = normaliseFolderName(name);
    if (!trimmedName) {
        return;
    }

    commit((draft) => {
        const folder = folderLookup.get(folderId);
        if (!folder || folder.name === trimmedName) {
            return false;
        }

        folder.name = trimmedName;
        return true;
    });
}

export function deleteFolder(folderId) {
    if (!folderId) {
        return;
    }

    const deleted = commit((draft) => {
        if (!folderLookup.has(folderId)) {
            return false;
        }

        draft.folders = draft.folders.filter((folder) => folder.id !== folderId);
        let changed = true;
        draft.notes.forEach((note) => {
            if (note.folderId === folderId) {
                note.folderId = null;
                note.updatedAt = new Date().toISOString();
                changed = true;
            }
        });

        return changed;
    });
    if (deleted) {
        folderLookup.delete(folderId);
    }
}

export function deleteNote(noteId) {
    if (!noteId) {
        return;
    }

    const deletedNote = noteLookup.get(noteId) ?? null;
    const deleted = commit((draft) => {
        const currentIndex = draft.notes.findIndex((note) => note.id === noteId);
        if (currentIndex === -1) {
            return false;
        }

        draft.notes.splice(currentIndex, 1);

        if (draft.currentNoteId !== noteId) {
            return;
        }

        if (draft.notes.length === 0) {
            draft.currentNoteId = null;
            return true;
        }

        const nextIndex = Math.max(0, currentIndex - 1);
        draft.currentNoteId = draft.notes[nextIndex]?.id ?? draft.notes[0]?.id ?? null;
        return true;
    });
    if (deleted) {
        noteLookup.delete(noteId);
        if (deletedNote) {
            removeFromTagIndex(deletedNote.tags);
        }
        reconcileNoteAnalysisCache(settings.notes);
    }
}

export function flushAutosave() {
    if (autosaveTimer === null && saveStatus === 'saved') {
        return;
    }

    if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }

    persistSettingsNow(settings);
    saveStatus = 'saved';
    emitChange();
}

function ensureCurrentNote() {
    if (!settings.currentNoteId) {
        createNote();
    }
}

function getCurrentNote() {
    return settings.currentNoteId ? (noteLookup.get(settings.currentNoteId) ?? null) : null;
}

function getSettingsSnapshot() {
    if (settingsSnapshotCache?.revision === stateRevision) {
        return settingsSnapshotCache.value;
    }

    settingsSnapshotCache = {
        revision: stateRevision,
        value: {
            version: settings.version,
            folders: settings.folders,
            notes: settings.notes,
            currentNoteId: settings.currentNoteId,
        },
    };

    return settingsSnapshotCache.value;
}

function getCurrentDocumentSnapshot() {
    const currentNote = getCurrentNote();
    if (!currentNote) {
        currentDocumentCache = null;
        return null;
    }

    if (
        currentDocumentCache
        && currentDocumentCache.noteId === currentNote.id
        && currentDocumentCache.updatedAt === currentNote.updatedAt
        && currentDocumentCache.saveStatus === saveStatus
    ) {
        return currentDocumentCache.value;
    }

    currentDocumentCache = {
        noteId: currentNote.id,
        updatedAt: currentNote.updatedAt,
        saveStatus,
        value: buildCurrentDocumentModel(currentNote),
    };

    return currentDocumentCache.value;
}

function buildCurrentDocumentModel(currentNote) {
    if (!currentNote) {
        return null;
    }

    return {
        id: currentNote.id,
        source: DOCUMENT_SOURCE_NOTE,
        title: currentNote.title,
        content: currentNote.content,
        editable: true,
        saveStatus,
        meta: {
            folderId: currentNote.folderId,
            pinned: currentNote.pinned,
            tags: [...currentNote.tags],
            termState: {
                key: 'tags',
                buttonLabel: sourceUi.termButtonLabel,
                singularLabel: sourceUi.singularTermLabel,
                pluralLabel: sourceUi.pluralTermLabel,
                emptyHint: sourceUi.emptyTermsHint,
                unavailableHint: sourceUi.unavailableTermsHint,
                activationMode: sourceUi.previewTermAction,
                items: [...currentNote.tags],
            },
            createdAt: currentNote.createdAt,
            updatedAt: currentNote.updatedAt,
        },
    };
}

function commit(mutator, { persist = true } = {}) {
    if (mutator(settings) === false) {
        return false;
    }

    stateRevision += 1;
    settingsSnapshotCache = null;
    currentDocumentCache = null;

    if (persist) {
        scheduleAutosave();
    } else {
        emitChange();
    }

    return true;
}

function scheduleAutosave() {
    saveStatus = 'saving';
    emitChange();
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(flushAutosave, AUTOSAVE_DELAY_MS);
}

function emitChange() {
    const snapshot = getNotesState();
    listeners.forEach((listener) => listener(snapshot));
}

function buildLookup(items) {
    return new Map(items.map((item) => [item.id, item]));
}

// Rebuilds tagIndex from scratch. Called once on module load and can be used for recovery.
// storedTag is the case-preserving model form; the index key is the search-normalised (lowercased) form.
function buildTagIndex(notes) {
    tagIndex.clear();
    notes.forEach((note) => addToTagIndex(note.tags));
    tagIndexRevision += 1;
}

function addToTagIndex(storedTags) {
    storedTags.forEach((storedTag) => {
        const key = normalizeTagForSearch(storedTag);
        if (!key) {
            return;
        }
        const entry = tagIndex.get(key);
        if (entry) {
            entry.count += 1;
        } else {
            tagIndex.set(key, { original: storedTag, count: 1 });
            tagIndexRevision += 1;
        }
    });
}

function removeFromTagIndex(storedTags) {
    storedTags.forEach((storedTag) => {
        const key = normalizeTagForSearch(storedTag);
        if (!key) {
            return;
        }
        const entry = tagIndex.get(key);
        if (!entry) {
            return;
        }
        entry.count -= 1;
        if (entry.count <= 0) {
            tagIndex.delete(key);
            tagIndexRevision += 1;
        }
    });
}
