// src/document-source.js
// Responsible for: source-level UI defaults shared by the editor, toolbar, and future lorebook work.

import { t } from './i18n/index.js';

export const DOCUMENT_SOURCE_NOTE = 'note';
export const DOCUMENT_SOURCE_LOREBOOK = 'lorebook';

export function normaliseDocumentSource(source) {
    return source === DOCUMENT_SOURCE_LOREBOOK ? DOCUMENT_SOURCE_LOREBOOK : DOCUMENT_SOURCE_NOTE;
}

export function getDocumentSourceUi(source) {
    if (normaliseDocumentSource(source) === DOCUMENT_SOURCE_LOREBOOK) {
        return {
            editorTitle: t('source.lorebook.editorTitle'),
            untitledDocumentLabel: t('source.lorebook.untitled'),
            documentLabel: t('source.lorebook.documentLabel'),
            createDocumentLabel: t('source.lorebook.createLabel'),
            sidebarLabel: t('source.lorebook.sidebarLabel'),
            termButtonLabel: t('source.lorebook.termButton'),
            singularTermLabel: t('source.lorebook.singularTerm'),
            pluralTermLabel: t('source.lorebook.termButton'),
            emptyTermsHint: t('source.lorebook.emptyTerms'),
            unavailableTermsHint: t('source.lorebook.unavailableTerms'),
            previewTermAction: 'none',
        };
    }

    return {
        editorTitle: t('source.note.editorTitle'),
        untitledDocumentLabel: t('source.note.untitled'),
        documentLabel: t('source.note.documentLabel'),
        createDocumentLabel: t('source.note.createLabel'),
        sidebarLabel: t('source.note.sidebarLabel'),
        termButtonLabel: t('source.note.termButton'),
        singularTermLabel: t('source.note.singularTerm'),
        pluralTermLabel: t('source.note.termButton'),
        emptyTermsHint: t('source.note.emptyTerms'),
        unavailableTermsHint: t('source.note.unavailableTerms'),
        previewTermAction: 'sidebar-filter',
    };
}

export function getDefaultDocumentTitle(source) {
    return getDocumentSourceUi(source).editorTitle;
}

export function getUntitledDocumentLabel(source) {
    return getDocumentSourceUi(source).untitledDocumentLabel;
}

export function getDocumentLabel(source) {
    return getDocumentSourceUi(source).documentLabel;
}

export function getCreateDocumentLabel(source) {
    return getDocumentSourceUi(source).createDocumentLabel;
}

export function getSidebarLabel(source) {
    return getDocumentSourceUi(source).sidebarLabel;
}

export function getSuggestedDocumentTerm(documentModel, activeCharacter) {
    if (normaliseDocumentSource(documentModel?.source) !== DOCUMENT_SOURCE_NOTE) {
        return '';
    }

    const name = String(activeCharacter?.name ?? '').trim();
    if (!name || /^\{\{[^}]+\}\}$/.test(name) || name === 'SillyTavern System') {
        return '';
    }

    const existingTerms = Array.isArray(documentModel?.meta?.termState?.items)
        ? documentModel.meta.termState.items
        : [];

    return existingTerms.some((term) => term.toLowerCase() === name.toLowerCase()) ? '' : name;
}
