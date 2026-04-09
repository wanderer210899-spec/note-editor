// src/lorebook-transfer.js
// Responsible for: lorebook entry Markdown import/export file handling.

import { t } from './i18n/index.js';
import { normalizeImportedMarkdown, normalizeTransferTitle } from './note-transfer.js';
import { exportTextFiles } from './transfer-export.js';

const IMPORT_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const IMPORT_FILE_ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';
const INVALID_FILE_SEGMENT_RE = /[<>:"/\\|?*\u0000-\u001f]/g;
const PATH_SEPARATOR_RE = /[\\/]+/;
const MARKDOWN_EXPORT_EXTENSION = '.md';
const TEXT_EXPORT_EXTENSION = '.txt';
const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';
const TEXT_MIME_TYPE = 'text/plain;charset=utf-8';
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export async function exportLorebookEntriesToDirectory(entries, {
    overwriteExisting = true,
    archiveHandle = null,
    exportFormat = 'md',
} = {}) {
    const exportEntries = Array.isArray(entries) ? entries : [];
    const resolvedFormat = normalizeTransferExportFormat(exportFormat);
    const fileExtension = resolvedFormat === 'txt' ? TEXT_EXPORT_EXTENSION : MARKDOWN_EXPORT_EXTENSION;
    const mimeType = resolvedFormat === 'txt' ? TEXT_MIME_TYPE : MARKDOWN_MIME_TYPE;
    return exportTextFiles(exportEntries.map((entry) => {
        const lorebookFolder = sanitizePathSegment(entry.lorebookName || entry.lorebookId, 'lorebook');
        const fileName = `${sanitizePathSegment(entry.title || entry.entryId, t('source.lorebook.untitled'))}${fileExtension}`;
        return {
            relativePath: `${lorebookFolder}/${fileName}`,
            fileName,
            content: buildLorebookMarkdown(entry),
            mimeType,
        };
    }), {
        overwriteExisting,
        shareTitle: 'Note Editor Lorebook Export',
        archiveFileName: resolvedFormat === 'txt'
            ? 'note-editor-lorebook-text-export.zip'
            : 'note-editor-lorebook-markdown-export.zip',
        archiveHandle,
    });
}

export async function pickImportedLorebookFiles() {
    const pickedFiles = await pickLocalFiles({ accept: IMPORT_FILE_ACCEPT, multiple: true, directory: false });
    return buildImportedLorebookRecords(pickedFiles, { importSource: 'files' });
}

export async function pickImportedLorebookFolder() {
    const pickedFiles = typeof window.showDirectoryPicker === 'function'
        ? await pickDirectoryFiles()
        : await pickLocalFiles({ accept: IMPORT_FILE_ACCEPT, multiple: true, directory: true });
    return buildImportedLorebookRecords(pickedFiles, { importSource: 'folder' });
}

function buildLorebookMarkdown(entry) {
    const metadata = {
        noteEditorLorebookEntry: 1,
        ...(entry.metadata ?? {}),
        lorebookName: entry.lorebookName || entry.lorebookId || entry.metadata?.lorebookName || '',
        entryId: String(entry.entryId ?? entry.metadata?.entryId ?? ''),
        title: normalizeTransferTitle(entry.title, t('source.lorebook.untitled')),
    };

    return [
        '---',
        JSON.stringify(metadata, null, 2),
        '---',
        normalizeImportedMarkdown(entry.content),
    ].join('\n');
}

async function buildImportedLorebookRecords(fileDescriptors, { importSource = 'files' } = {}) {
    const records = [];
    let skippedUnsupported = 0;
    const rootFolderName = importSource === 'folder'
        ? detectImportedLorebookFolderName(fileDescriptors)
        : '';

    for (const descriptor of fileDescriptors) {
        const file = descriptor?.file;
        if (!(file instanceof File)) {
            continue;
        }

        const relativePath = normalizeImportRelativePath(descriptor.relativePath || file.name || '');
        if (!isSupportedImportFile(relativePath)) {
            skippedUnsupported += 1;
            continue;
        }

        const text = normalizeImportedMarkdown(await file.text());
        const parsed = parseLorebookMarkdown(text);
        const pathParts = relativePath.split('/');
        const fileName = pathParts[pathParts.length - 1] ?? '';
        const fallbackTitle = normalizeTransferTitle(stripFileExtension(fileName), t('source.lorebook.untitled'));

        records.push({
            title: normalizeTransferTitle(parsed.metadata?.title, fallbackTitle),
            content: parsed.content,
            metadata: parsed.metadata,
            sourcePath: relativePath,
        });
    }

    return {
        records,
        skippedUnsupported,
        totalPicked: fileDescriptors.length,
        importSource,
        rootFolderName,
    };
}

function parseLorebookMarkdown(text) {
    const source = normalizeImportedMarkdown(text);
    const match = source.match(FRONTMATTER_RE);
    if (!match) {
        return {
            metadata: {},
            content: source,
        };
    }

    try {
        const metadata = JSON.parse(match[1]);
        return {
            metadata: metadata && typeof metadata === 'object' ? metadata : {},
            content: source.slice(match[0].length),
        };
    } catch (error) {
        console.warn('[NoteEditor] Failed to parse lorebook Markdown frontmatter.', error);
        return {
            metadata: {},
            content: source,
        };
    }
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

function detectImportedLorebookFolderName(fileDescriptors) {
    const firstRelativePath = (Array.isArray(fileDescriptors) ? fileDescriptors : [])
        .map((descriptor) => normalizeImportRelativePath(descriptor?.relativePath || descriptor?.file?.name || ''))
        .find(Boolean);
    if (!firstRelativePath) {
        return '';
    }

    return firstRelativePath.split('/')[0] ?? '';
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

function normalizeTransferExportFormat(value) {
    return String(value ?? '').trim().toLowerCase() === 'txt' ? 'txt' : 'md';
}
