// src/state/notes-model.js
// Responsible for: note data normalization and note/folder model shaping.

import { createId, isIsoDate } from '../util.js';

const SETTINGS_VERSION = 2;

export function normaliseSettings(candidate) {
    const shouldSeedInitialNote = !candidate || !Array.isArray(candidate.notes);

    const folders = deduplicateById(
        Array.isArray(candidate?.folders) ? candidate.folders.map(makeFolder) : [],
    );
    const folderIds = new Set(folders.map((folder) => folder.id));

    const notes = deduplicateById(
        Array.isArray(candidate?.notes) ? candidate.notes.map(makeNote) : [],
    ).map((note) => ({
        ...note,
        folderId: note.folderId && folderIds.has(note.folderId) ? note.folderId : null,
    }));

    if (notes.length === 0 && shouldSeedInitialNote) {
        notes.push(makeNote());
    }

    let currentNoteId = typeof candidate?.currentNoteId === 'string' ? candidate.currentNoteId : null;
    if (!currentNoteId || !notes.some((note) => note.id === currentNoteId)) {
        currentNoteId = notes[0]?.id ?? null;
    }

    return {
        version: SETTINGS_VERSION,
        folders: folders.sort((left, right) => left.order - right.order),
        notes,
        currentNoteId,
    };
}

export function makeFolder(folder = {}) {
    return {
        id: typeof folder.id === 'string' && folder.id ? folder.id : createId('folder'),
        name: normaliseFolderName(folder.name),
        createdAt: isIsoDate(folder.createdAt) ? folder.createdAt : new Date().toISOString(),
        order: Number.isFinite(folder.order) ? folder.order : Date.now(),
    };
}

export function makeNote(note = {}) {
    const now = new Date().toISOString();

    return {
        id: typeof note.id === 'string' && note.id ? note.id : createId('note'),
        title: typeof note.title === 'string' ? note.title : '',
        content: typeof note.content === 'string' ? note.content : '',
        folderId: typeof note.folderId === 'string' && note.folderId ? note.folderId : null,
        pinned: Boolean(note.pinned),
        tags: normaliseStringArray(note.tags).map(normaliseTagForStorage).filter(Boolean),
        createdAt: isIsoDate(note.createdAt) ? note.createdAt : now,
        updatedAt: isIsoDate(note.updatedAt) ? note.updatedAt : now,
    };
}

// Normalises a tag for STORAGE: canonical Unicode form, trimmed, whitespace collapsed, 32-char cap.
// Preserves the user's original casing — case-folding is the responsibility of normalizeTagForSearch()
// in tag-utils.js, which is used at comparison/search time.
export function normaliseTagForStorage(tag) {
    return String(tag ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 32);
}

export function normaliseFolderName(name) {
    const trimmed = String(name ?? '').trim();
    return trimmed || 'New folder';
}

function deduplicateById(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
}

function normaliseStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}
