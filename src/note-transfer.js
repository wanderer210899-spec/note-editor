// src/note-transfer.js
// Responsible for: note import/export file handling, Markdown path mapping, and transfer UI models.

import { t } from './i18n/index.js';
import { exportTextFiles } from './transfer-export.js';

const IMPORT_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const IMPORT_FILE_ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';
const INVALID_FILE_SEGMENT_RE = /[<>:"/\\|?*\u0000-\u001f]/g;
const PATH_SEPARATOR_RE = /[\\/]+/;
const NOTE_EXPORT_EXTENSION = '.md';
const TEXT_EXPORT_EXTENSION = '.txt';
const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';
const TEXT_MIME_TYPE = 'text/plain;charset=utf-8';

export function normalizeTransferFolderPath(value) {
    return String(value ?? '')
        .split(PATH_SEPARATOR_RE)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
}

export function normalizeTransferTitle(value, fallback = t('source.note.untitled')) {
    const trimmed = String(value ?? '').trim();
    return trimmed || fallback;
}

export function buildTransferMatchKey(folderPath, title) {
    return `${normalizeTransferFolderPath(folderPath).normalize('NFKC').toLowerCase()}::${normalizeTransferTitle(title).normalize('NFKC').toLowerCase()}`;
}

export function buildNoteTransferSettingsModel(noteSettings, selectionState = {}) {
    const summary = buildNoteTransferSummary(noteSettings, selectionState);
    const folders = Array.isArray(noteSettings?.folders) ? noteSettings.folders : [];
    const notes = Array.isArray(noteSettings?.notes) ? noteSettings.notes : [];
    const selectedFolderIds = selectionState.selectedFolderIds instanceof Set ? selectionState.selectedFolderIds : new Set();
    const selectedNoteIds = selectionState.selectedNoteIds instanceof Set ? selectionState.selectedNoteIds : new Set();
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const notesByFolderId = new Map();
    const unfiledNotes = [];

    notes.forEach((note) => {
        if (!note?.folderId || !folderMap.has(note.folderId)) {
            unfiledNotes.push(buildNoteSelectionEntry(note, selectedNoteIds.has(note.id)));
            return;
        }

        const bucket = notesByFolderId.get(note.folderId) ?? [];
        bucket.push(buildNoteSelectionEntry(note, selectedNoteIds.has(note.id)));
        notesByFolderId.set(note.folderId, bucket);
    });

    const folderSections = folders.map((folder) => {
        const folderNotes = notesByFolderId.get(folder.id) ?? [];
        return {
            id: folder.id,
            name: folder.name,
            selected: selectedFolderIds.has(folder.id),
            noteCount: folderNotes.length,
            notes: folderNotes,
        };
    }).filter((section) => section.noteCount > 0);

    return {
        ...summary,
        folderSections,
        unfiledNotes,
    };
}

export function buildNoteTransferSummary(noteSettings, selectionState = {}) {
    const notes = Array.isArray(noteSettings?.notes) ? noteSettings.notes : [];
    const selectedFolderIds = selectionState.selectedFolderIds instanceof Set ? selectionState.selectedFolderIds : new Set();
    const selectedNoteIds = selectionState.selectedNoteIds instanceof Set ? selectionState.selectedNoteIds : new Set();
    const effectiveNoteIds = collectSelectedNoteIds(noteSettings, selectionState);

    return {
        hasNotes: notes.length > 0,
        selectedFolderCount: selectedFolderIds.size,
        selectedNoteCount: selectedNoteIds.size,
        effectiveExportCount: effectiveNoteIds.size,
    };
}

export function collectSelectedNoteExportEntries(noteSettings, selectionState = {}) {
    const notes = Array.isArray(noteSettings?.notes) ? noteSettings.notes : [];
    const folders = Array.isArray(noteSettings?.folders) ? noteSettings.folders : [];
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const noteMap = new Map(notes.map((note) => [note.id, note]));
    const selectedNoteIds = collectSelectedNoteIds(noteSettings, selectionState);

    return [...selectedNoteIds]
        .map((noteId) => noteMap.get(noteId))
        .filter(Boolean)
        .map((note) => {
            const folderPath = note.folderId
                ? normalizeTransferFolderPath(buildFolderFullPath(note.folderId, folderMap))
                : '';
            const fileName = `${sanitizePathSegment(normalizeTransferTitle(note.title), t('source.note.untitled'))}${NOTE_EXPORT_EXTENSION}`;
            return {
                noteId: note.id,
                title: normalizeTransferTitle(note.title),
                content: normalizeImportedMarkdown(note.content),
                folderPath,
                fileName,
                relativePath: [...splitFolderPath(folderPath), fileName].join('/'),
            };
        });
}

export async function exportNotesToDirectory(noteSettings, selectionState, {
    overwriteExisting = true,
    exportFormat = 'md',
} = {}) {
    const entries = collectSelectedNoteExportEntries(noteSettings, selectionState);
    const resolvedFormat = normalizeTransferExportFormat(exportFormat);
    const fileExtension = resolvedFormat === 'txt' ? TEXT_EXPORT_EXTENSION : NOTE_EXPORT_EXTENSION;
    const mimeType = resolvedFormat === 'txt' ? TEXT_MIME_TYPE : MARKDOWN_MIME_TYPE;
    const exportEntries = entries.map((entry) => ({
        ...entry,
        fileName: replaceFileExtension(entry.fileName, fileExtension),
        relativePath: replaceFileExtension(entry.relativePath, fileExtension),
        mimeType,
    }));
    return exportTextFiles(exportEntries, {
        overwriteExisting,
        shareTitle: 'Note Editor Notes Export',
        archiveFileName: resolvedFormat === 'txt'
            ? 'note-editor-notes-text-export.zip'
            : 'note-editor-notes-markdown-export.zip',
    });
}

export async function pickImportedNoteFiles() {
    const pickedFiles = await pickLocalFiles({ accept: IMPORT_FILE_ACCEPT, multiple: true, directory: false });
    return buildImportedNoteRecords(pickedFiles);
}

export async function pickImportedNoteFolder() {
    const pickedFiles = typeof window.showDirectoryPicker === 'function'
        ? await pickDirectoryFiles()
        : await pickLocalFiles({ accept: IMPORT_FILE_ACCEPT, multiple: true, directory: true });
    return buildImportedNoteRecords(pickedFiles);
}

function buildNoteSelectionEntry(note, selected) {
    return {
        id: note.id,
        title: normalizeTransferTitle(note.title),
        selected,
    };
}

// Walks up the folder parent chain to build a full slash-separated path.
function buildFolderFullPath(folderId, folderMap) {
    const segments = [];
    let currentId = folderId;
    while (currentId) {
        const folder = folderMap.get(currentId);
        if (!folder) break;
        segments.unshift(folder.name);
        currentId = folder.parentFolderId ?? null;
    }
    return segments.join('/');
}

function collectSelectedNoteIds(noteSettings, selectionState = {}) {
    const notes = Array.isArray(noteSettings?.notes) ? noteSettings.notes : [];
    const selectedFolderIds = selectionState.selectedFolderIds instanceof Set ? selectionState.selectedFolderIds : new Set();
    const selectedNoteIds = selectionState.selectedNoteIds instanceof Set ? selectionState.selectedNoteIds : new Set();
    const effectiveNoteIds = new Set(selectedNoteIds);

    notes.forEach((note) => {
        if (note?.folderId && selectedFolderIds.has(note.folderId)) {
            effectiveNoteIds.add(note.id);
        }
    });

    return effectiveNoteIds;
}

async function pickDirectoryFiles() {
    try {
        const directoryHandle = await window.showDirectoryPicker();
        const files = [];
        await walkDirectoryHandle(directoryHandle, [directoryHandle.name], files);
        return files;
    } catch (error) {
        if (error?.name === 'AbortError') {
            return [];
        }
        throw error;
    }
}

async function walkDirectoryHandle(directoryHandle, pathParts, files) {
    for await (const [name, handle] of directoryHandle.entries()) {
        if (handle.kind === 'directory') {
            await walkDirectoryHandle(handle, [...pathParts, name], files);
            continue;
        }

        const file = await handle.getFile();
        files.push({
            file,
            relativePath: [...pathParts, name].join('/'),
        });
    }
}

function pickLocalFiles({ accept = '', multiple = true, directory = false } = {}) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        if (directory) {
            input.setAttribute('webkitdirectory', '');
            input.setAttribute('directory', '');
        }

        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.opacity = '0';
        document.body.appendChild(input);

        const cleanup = () => {
            input.remove();
        };

        input.addEventListener('change', () => {
            const files = [...(input.files ?? [])].map((file) => ({
                file,
                relativePath: directory
                    ? String(file.webkitRelativePath || file.name)
                    : file.name,
            }));
            cleanup();
            resolve(files);
        }, { once: true });

        input.addEventListener('cancel', () => {
            cleanup();
            resolve([]);
        }, { once: true });

        input.click();
    });
}

async function buildImportedNoteRecords(fileDescriptors) {
    const records = [];
    let skippedUnsupported = 0;

    for (const descriptor of fileDescriptors) {
        const file = descriptor?.file;
        if (!(file instanceof File)) {
            continue;
        }

        const relativePath = String(descriptor.relativePath || file.name || '').trim();
        if (!isSupportedImportFile(relativePath)) {
            skippedUnsupported += 1;
            continue;
        }

        const normalizedPath = normalizeImportRelativePath(relativePath);
        const pathParts = normalizedPath.split('/');
        const fileName = pathParts[pathParts.length - 1] ?? '';
        const folderPath = normalizeTransferFolderPath(pathParts.slice(0, -1).join('/'));
        const content = normalizeImportedMarkdown(await file.text());
        records.push({
            folderPath,
            title: normalizeTransferTitle(stripFileExtension(fileName)),
            content,
            sourcePath: normalizedPath,
        });
    }

    return {
        records,
        skippedUnsupported,
        totalPicked: fileDescriptors.length,
    };
}

function isSupportedImportFile(relativePath) {
    const extension = `.${String(relativePath).split('.').pop() || ''}`.toLowerCase();
    return IMPORT_FILE_EXTENSIONS.has(extension);
}

function normalizeImportRelativePath(value) {
    return String(value ?? '')
        .replace(/^\.\//, '')
        .split(PATH_SEPARATOR_RE)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
}

function stripFileExtension(fileName) {
    return String(fileName ?? '').replace(/\.[^.]+$/, '');
}

function replaceFileExtension(fileName, extension) {
    return `${stripFileExtension(fileName)}${extension}`;
}

export function normalizeImportedMarkdown(value) {
    return String(value ?? '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n');
}

function normalizeTransferExportFormat(value) {
    return String(value ?? '').trim().toLowerCase() === 'txt' ? 'txt' : 'md';
}

function sanitizePathSegment(value, fallback = 'untitled') {
    const normalized = String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(INVALID_FILE_SEGMENT_RE, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '');
    return normalized || fallback;
}

function splitFolderPath(folderPath) {
    return normalizeTransferFolderPath(folderPath)
        .split('/')
        .map((segment) => sanitizePathSegment(segment))
        .filter(Boolean);
}
