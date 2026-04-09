// src/transfer-export.js
// Responsible for: shared export strategies for directory APIs and single-archive export fallbacks.

import { t } from './i18n/index.js';

const PATH_SEPARATOR_RE = /[\\/]+/;
const INVALID_FILE_SEGMENT_RE = /[<>:"/\\|?*\u0000-\u001f]/g;
const DOWNLOAD_NAME_SEPARATOR = ' - ';
const DOWNLOAD_DELAY_MS = 75;
const DEFAULT_MIME_TYPE = 'text/markdown;charset=utf-8';
const ZIP_MIME_TYPE = 'application/zip';
const ZIP_EXTENSION = '.zip';
const ZIP_VERSION = 20;
const ZIP_UTF8_FLAG = 0x0800;
const CRC32_TABLE = buildCrc32Table();

export async function exportTextFiles(entries, {
    overwriteExisting = true,
    shareTitle = 'Note Editor Export',
    archiveFileName = 'note-editor-export.zip',
    archiveHandle = null,
    archiveWritable = null,
    debugLabel = 'export',
} = {}) {
    const normalizedEntries = (Array.isArray(entries) ? entries : [])
        .map(normalizeTextExportEntry)
        .filter(Boolean);
    if (normalizedEntries.length === 0) {
        return { status: 'empty', written: 0, skipped: 0, overwritten: 0 };
    }

    const preferArchiveExport = shouldPreferArchiveExportOnPlatform();

    if (typeof window.showDirectoryPicker === 'function' && !preferArchiveExport && !archiveHandle && !archiveWritable) {
        return exportToDirectory(normalizedEntries, { overwriteExisting, debugLabel });
    }

    const archiveBlob = buildZipBlob(normalizedEntries);

    if (archiveHandle || archiveWritable || canUseArchiveSavePicker({ allowWithDirectoryPicker: preferArchiveExport })) {
        return exportToArchiveFile(normalizedEntries, {
            archiveFileName,
            archiveHandle,
            archiveWritable,
            archiveBlob,
            allowWithDirectoryPicker: preferArchiveExport,
        });
    }

    const shared = await tryShareExport(archiveBlob, { shareTitle, archiveFileName });
    if (shared) {
        return shared;
    }

    return downloadExportArchive(archiveBlob, normalizedEntries.length, { archiveFileName });
}

export function canUseArchiveSavePicker({ allowWithDirectoryPicker = false } = {}) {
    return typeof window.showSaveFilePicker === 'function'
        && (allowWithDirectoryPicker || typeof window.showDirectoryPicker !== 'function');
}

export async function prepareArchiveSaveHandle(suggestedName = 'note-editor-export.zip', {
    allowWithDirectoryPicker = false,
} = {}) {
    if (!canUseArchiveSavePicker({ allowWithDirectoryPicker })) {
        return null;
    }

    const safeName = ensureZipFileName(suggestedName);
    try {
        return await window.showSaveFilePicker({
            suggestedName: safeName,
            types: [{
                description: 'ZIP Archive',
                accept: {
                    [ZIP_MIME_TYPE]: [ZIP_EXTENSION],
                },
            }],
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            return null;
        }
        throw error;
    }
}

export async function prepareArchiveSaveWritable(suggestedName = 'note-editor-export.zip', {
    allowWithDirectoryPicker = false,
} = {}) {
    const handle = await prepareArchiveSaveHandle(suggestedName, { allowWithDirectoryPicker });
    if (!handle) {
        return null;
    }

    return handle.createWritable();
}
function normalizeTextExportEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const rawRelativePath = String(entry.relativePath || entry.fileName || '').trim();
    const relativePathSegments = normalizeRelativePath(rawRelativePath)
        .split('/')
        .map((segment) => sanitizePathSegment(segment))
        .filter(Boolean);
    const fallbackFileName = sanitizePathSegment(String(entry.fileName || 'export.md').trim(), 'export.md');
    const fileName = sanitizePathSegment(relativePathSegments[relativePathSegments.length - 1] || fallbackFileName, fallbackFileName);
    if (!fileName) {
        return null;
    }

    const directorySegments = relativePathSegments.length > 1
        ? relativePathSegments.slice(0, -1)
        : [];
    const relativePath = [...directorySegments, fileName].join('/');

    return {
        relativePath,
        directorySegments,
        fileName,
        content: String(entry.content ?? ''),
        mimeType: String(entry.mimeType || DEFAULT_MIME_TYPE),
    };
}

async function exportToDirectory(entries, { overwriteExisting = true } = {}) {
    const directoryHandle = await chooseExportDirectory();
    if (!directoryHandle) {
        return { status: 'cancelled', written: 0, skipped: 0, overwritten: 0 };
    }

    const seenPaths = new Set();
    let written = 0;
    let skipped = 0;
    let overwritten = 0;

    for (const entry of entries) {
        const pathKey = entry.relativePath.normalize('NFKC').toLowerCase();
        const targetDirectory = await ensureDirectoryPath(directoryHandle, entry.directorySegments);
        const duplicateInBatch = seenPaths.has(pathKey);
        const existsOnDisk = duplicateInBatch ? true : await fileExists(targetDirectory, entry.fileName);

        if ((duplicateInBatch || existsOnDisk) && !overwriteExisting) {
            skipped += 1;
            continue;
        }

        if (duplicateInBatch || existsOnDisk) {
            overwritten += 1;
        }

        const fileHandle = await targetDirectory.getFileHandle(entry.fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(entry.content);
        await writable.close();
        seenPaths.add(pathKey);
        written += 1;
    }

    return { status: 'success', written, skipped, overwritten, method: 'directory' };
}

async function exportToArchiveFile(entries, {
    archiveFileName = 'note-editor-export.zip',
    archiveHandle = null,
    archiveWritable = null,
    archiveBlob = null,
    allowWithDirectoryPicker = false,
} = {}) {
    const handle = archiveWritable
        ? null
        : (archiveHandle || await prepareArchiveSaveHandle(archiveFileName, { allowWithDirectoryPicker }));
    if (!archiveWritable && !handle) {
        return { status: 'cancelled', written: 0, skipped: 0, overwritten: 0 };
    }

    const writable = archiveWritable || await handle.createWritable();
    await writable.write(archiveBlob || buildZipBlob(entries));
    await writable.close();
    return {
        status: 'success',
        written: entries.length,
        skipped: 0,
        overwritten: 0,
        method: 'save-picker',
    };
}

async function tryShareExport(archiveBlob, {
    shareTitle,
    archiveFileName = 'note-editor-export.zip',
} = {}) {
    const share = globalThis.navigator?.share;
    if (typeof share !== 'function' || typeof File !== 'function') {
        return null;
    }

    const archiveFile = buildArchiveFile(archiveBlob, archiveFileName);
    if (!archiveFile) {
        return { status: 'empty', written: 0, skipped: 0, overwritten: 0 };
    }

    try {
        if (typeof globalThis.navigator?.canShare === 'function' && !globalThis.navigator.canShare({ files: [archiveFile] })) {
            return null;
        }
    } catch {
        return null;
    }

    try {
        await share.call(globalThis.navigator, { files: [archiveFile], title: shareTitle });
        return {
            status: 'success',
            written: 1,
            skipped: 0,
            overwritten: 0,
            method: 'share',
        };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { status: 'cancelled', written: 0, skipped: 0, overwritten: 0 };
        }
        throw error;
    }
}

async function downloadExportArchive(archiveBlob, entryCount, { archiveFileName = 'note-editor-export.zip' } = {}) {
    if (typeof globalThis.document?.createElement !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') {
        throw new Error(t('settings.transfer.export.unsupported'));
    }

    const archiveFile = buildArchiveFile(archiveBlob, archiveFileName);
    if (!archiveFile) {
        return { status: 'empty', written: 0, skipped: 0, overwritten: 0 };
    }

    const url = globalThis.URL.createObjectURL(archiveFile);
    try {
        const anchor = globalThis.document.createElement('a');
        anchor.href = url;
        anchor.download = archiveFile.name;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        globalThis.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        await delay(DOWNLOAD_DELAY_MS);
    } finally {
        window.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
    }

    return {
        status: 'success',
        written: entryCount,
        skipped: 0,
        overwritten: 0,
        method: 'download',
    };
}

function buildFallbackFiles(entries) {
    const usedNames = new Set();
    return entries.map((entry) => {
        const baseName = flattenRelativePath(entry.relativePath);
        const fileName = buildUniqueFileName(baseName, usedNames);
        return new File([entry.content], fileName, { type: entry.mimeType });
    });
}

function buildArchiveFile(archiveBlob, archiveFileName) {
    if (!(archiveBlob instanceof Blob) || typeof File !== 'function') {
        return null;
    }

    return new File([archiveBlob], ensureZipFileName(archiveFileName), { type: ZIP_MIME_TYPE });
}

export function shouldPreferArchiveExportOnPlatform() {
    const userAgentData = globalThis.navigator?.userAgentData;
    if (typeof userAgentData?.platform === 'string' && /android/i.test(userAgentData.platform)) {
        return true;
    }

    const userAgent = String(globalThis.navigator?.userAgent || '').toLowerCase();
    return /android/.test(userAgent);
}

function buildZipBlob(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
        const pathBytes = encoder.encode(entry.relativePath);
        const contentBytes = encoder.encode(entry.content);
        const crc = crc32(contentBytes);
        const localHeader = createZipLocalHeader({
            fileNameLength: pathBytes.length,
            crc,
            size: contentBytes.length,
        });
        localParts.push(localHeader, pathBytes, contentBytes);

        const centralHeader = createZipCentralHeader({
            fileNameLength: pathBytes.length,
            crc,
            size: contentBytes.length,
            localHeaderOffset: offset,
        });
        centralParts.push(centralHeader, pathBytes);
        offset += localHeader.length + pathBytes.length + contentBytes.length;
    });

    const centralDirectoryOffset = offset;
    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
    const endRecord = createZipEndRecord({
        entryCount: entries.length,
        centralDirectorySize,
        centralDirectoryOffset,
    });

    return new Blob([...localParts, ...centralParts, endRecord], { type: ZIP_MIME_TYPE });
}

function buildUniqueFileName(baseName, usedNames) {
    const normalizedBaseName = sanitizePathSegment(baseName, 'export.md');
    const extensionMatch = normalizedBaseName.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? '';
    const stem = extension ? normalizedBaseName.slice(0, -extension.length) : normalizedBaseName;

    let candidate = normalizedBaseName;
    let suffix = 2;
    while (usedNames.has(candidate.normalize('NFKC').toLowerCase())) {
        candidate = `${stem} ${suffix}${extension}`;
        suffix += 1;
    }

    usedNames.add(candidate.normalize('NFKC').toLowerCase());
    return candidate;
}

function flattenRelativePath(relativePath) {
    const segments = normalizeRelativePath(relativePath)
        .split('/')
        .map((segment) => sanitizePathSegment(segment))
        .filter(Boolean);
    return segments.join(DOWNLOAD_NAME_SEPARATOR) || 'export.md';
}

function ensureZipFileName(value) {
    const normalized = sanitizePathSegment(value, `note-editor-export${ZIP_EXTENSION}`);
    return normalized.toLowerCase().endsWith(ZIP_EXTENSION)
        ? normalized
        : `${normalized}${ZIP_EXTENSION}`;
}

async function chooseExportDirectory() {
    try {
        return await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (error) {
        if (error?.name === 'AbortError') {
            return null;
        }
        throw error;
    }
}

async function ensureDirectoryPath(rootHandle, pathSegments) {
    let directoryHandle = rootHandle;
    for (const segment of pathSegments) {
        directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create: true });
    }
    return directoryHandle;
}

async function fileExists(directoryHandle, fileName) {
    try {
        await directoryHandle.getFileHandle(fileName);
        return true;
    } catch (error) {
        if (error?.name === 'NotFoundError') {
            return false;
        }
        throw error;
    }
}

function normalizeRelativePath(value) {
    return String(value ?? '')
        .replace(/^\.\//, '')
        .split(PATH_SEPARATOR_RE)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join('/');
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

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function crc32(bytes) {
    let crc = 0 ^ -1;
    for (let index = 0; index < bytes.length; index += 1) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

function buildCrc32Table() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
}

function createZipLocalHeader({ fileNameLength, crc, size }) {
    const buffer = new ArrayBuffer(30);
    const view = new DataView(buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, ZIP_VERSION, true);
    view.setUint16(6, ZIP_UTF8_FLAG, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, fileNameLength, true);
    view.setUint16(28, 0, true);
    return new Uint8Array(buffer);
}

function createZipCentralHeader({ fileNameLength, crc, size, localHeaderOffset }) {
    const buffer = new ArrayBuffer(46);
    const view = new DataView(buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, ZIP_VERSION, true);
    view.setUint16(6, ZIP_VERSION, true);
    view.setUint16(8, ZIP_UTF8_FLAG, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, fileNameLength, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, localHeaderOffset, true);
    return new Uint8Array(buffer);
}

function createZipEndRecord({ entryCount, centralDirectorySize, centralDirectoryOffset }) {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralDirectorySize, true);
    view.setUint32(16, centralDirectoryOffset, true);
    view.setUint16(20, 0, true);
    return new Uint8Array(buffer);
}
