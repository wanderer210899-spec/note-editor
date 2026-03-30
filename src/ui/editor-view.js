// src/ui/editor-view.js
// Responsible for: rendering shared document-term controls for notes and future lore entries.

import { getDocumentSourceUi, normaliseDocumentSource } from '../document-source.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '../util.js';

export function renderDocumentTermsMenu(documentModel, { suggestedTerm = '', source = documentModel?.source } = {}) {
    const termState = documentModel?.meta?.termState ?? null;
    if (!documentModel || !termState) {
        const unavailableHint = getDocumentSourceUi(normaliseDocumentSource(source)).unavailableTermsHint;
        return `
            <div class="ne-menu__section">
                <p class="ne-menu__hint">${escapeHtml(unavailableHint)}</p>
            </div>
        `;
    }

    const terms = getSortedTerms(termState);
    const termPrefix = getDocumentTermPrefix(source);
    const termMarkup = terms.length
        ? terms.map((term) => {
            const canActivate = termState.activationMode === 'sidebar-filter';
            return `
                <span class="ne-tag-pill">
                    <button
                        class="ne-tag-chip"
                        type="button"
                        ${canActivate ? `data-action="activate-document-term"` : ''}
                        data-term="${escapeHtml(term)}"
                    >
                        ${escapeHtml(`${termPrefix}${term}`)}
                    </button>
                    <button
                        class="ne-tag-chip__remove"
                        type="button"
                        data-action="remove-document-term"
                        data-term="${escapeHtml(term)}"
                        aria-label="${escapeHtml(t('editor.terms.remove', { label: termState.singularLabel, term }))}"
                        title="${escapeHtml(t('editor.terms.removeTitle', { label: termState.singularLabel }))}"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </span>
            `;
        }).join('')
        : `<p class="ne-menu__hint">${escapeHtml(termState.emptyHint ?? t('editor.terms.empty'))}</p>`;

    return `
        <div class="ne-menu__section">
            <p class="ne-menu__label">${escapeHtml(termState.pluralLabel ?? termState.buttonLabel ?? t('toolbar.tags.notes'))}</p>
            <div class="ne-tag-list ne-tag-list--menu">
                ${termMarkup}
                ${suggestedTerm ? `
                    <button class="ne-tag-chip ne-tag-chip--suggested" type="button" data-action="add-document-suggested-term">
                        ${escapeHtml(t('editor.terms.suggestAdd', { term: suggestedTerm }))}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

export function renderDocumentPreviewTerms(documentModel) {
    if (normaliseDocumentSource(documentModel?.source) === 'lorebook') {
        return '';
    }

    const termState = documentModel?.meta?.termState ?? null;
    const terms = getSortedTerms(termState);
    const termPrefix = getDocumentTermPrefix(documentModel?.source);
    if (terms.length === 0) {
        return '';
    }

    return `
        <div class="ne-note-preview__tags">
            ${terms.map((term) => {
                const canActivate = termState.activationMode === 'sidebar-filter';
                return `
                    <button
                        class="ne-tag-chip"
                        type="button"
                        ${canActivate ? `data-action="activate-document-term"` : ''}
                        data-term="${escapeHtml(term)}"
                    >
                        ${escapeHtml(`${termPrefix}${term}`)}
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

export function renderLorebookMetadataTable(documentModel, {
    isExpanded = false,
    isOverflowOpen = false,
} = {}) {
    const meta = documentModel?.meta ?? null;
    if (!documentModel || normaliseDocumentSource(documentModel.source) !== 'lorebook' || !meta) {
        return '';
    }

    const primaryKeywords = Array.isArray(meta.keywords) ? meta.keywords : [];
    const secondaryKeywords = Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : [];
    const logicOptions = Array.isArray(meta.secondaryKeywordLogicOptions) ? meta.secondaryKeywordLogicOptions : [];
    const selectedLogic = String(meta.secondaryKeywordLogic ?? '').trim();
    const summaryText = buildLoreMetadataSummary(primaryKeywords, secondaryKeywords, selectedLogic, logicOptions);
    const toggleLabel = isExpanded ? t('editor.lore.keywords.hide') : t('editor.lore.keywords.show');
    const advancedTraits = {
        excludeRecursion: Boolean(meta.nativeTraits?.excludeRecursion),
        preventRecursion: Boolean(meta.nativeTraits?.preventRecursion),
        probability: Number.isFinite(Number(meta.nativeTraits?.probability)) ? Number(meta.nativeTraits.probability) : 100,
    };

    return `
        <section class="ne-lore-meta${isExpanded ? ' ne-lore-meta--expanded' : ' ne-lore-meta--collapsed'}" aria-label="${escapeHtml(t('editor.lore.section'))}">
            <div class="ne-lore-meta__header">
                <div class="ne-lore-meta__summary">
                    <span class="ne-lore-meta__summary-title">${escapeHtml(t('editor.lore.keywords.title'))}</span>
                    <span class="ne-lore-meta__summary-text">${escapeHtml(summaryText)}</span>
                </div>
                <div class="ne-lore-meta__header-actions">
                    <button
                        class="ne-btn ne-btn--soft ne-btn--icon ne-btn--meta-toggle"
                        type="button"
                        data-action="toggle-lore-metadata"
                        data-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${escapeHtml(toggleLabel)}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        title="${escapeHtml(toggleLabel)}"
                    >
                        <i class="fa-solid fa-tags" aria-hidden="true"></i>
                    </button>
                    <div class="ne-lore-meta__overflow-wrap">
                        <button
                            class="ne-btn ne-btn--soft ne-btn--icon ne-btn--overflow-trigger ne-btn--meta-overflow"
                            type="button"
                            data-action="toggle-lore-overflow"
                            data-expanded="${isOverflowOpen ? 'true' : 'false'}"
                            aria-label="${escapeHtml(t('editor.lore.overflow.open'))}"
                            aria-expanded="${isOverflowOpen ? 'true' : 'false'}"
                            title="${escapeHtml(t('editor.lore.overflow.open'))}"
                        >
                            <i class="fa-solid fa-ellipsis"></i>
                        </button>
                        ${isOverflowOpen ? renderLorebookAdvancedSettings(advancedTraits) : ''}
                    </div>
                </div>
            </div>
            ${isExpanded ? `
                <div class="ne-lore-meta__body">
                    ${renderLorebookMetadataRow(t('editor.lore.primaryKeywords.label'), primaryKeywords, {
                        emptyHint: t('editor.lore.primaryKeywords.hint'),
                        inputAction: 'add-document-primary-keyword',
                        removeAction: 'remove-document-term',
                    })}
                    <div class="ne-lore-meta__row ne-lore-meta__row--logic">
                        <div class="ne-lore-meta__label-wrap">
                            <span class="ne-lore-meta__label">${escapeHtml(t('editor.lore.logic.label'))}</span>
                        </div>
                        <div class="ne-lore-meta__value">
                            <select class="ne-input ne-lore-meta__select" data-action="set-document-secondary-logic">
                                ${logicOptions.map((option) => `
                                    <option value="${escapeHtml(option.key)}"${option.key === selectedLogic ? ' selected' : ''}>
                                        ${escapeHtml(option.label)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    ${renderLorebookMetadataRow(t('editor.lore.secondaryKeywords.label'), secondaryKeywords, {
                        emptyHint: t('editor.lore.secondaryKeywords.hint'),
                        inputAction: 'add-document-secondary-keyword',
                        removeAction: 'remove-document-secondary-term',
                    })}
                </div>
            ` : ''}
        </section>
    `;
}

function renderLorebookMetadataRow(label, keywords, {
    emptyHint = '',
    inputAction = '',
    removeAction = '',
} = {}) {
    const chipsMarkup = keywords.length
        ? keywords.map((keyword) => `
            <span class="ne-tag-pill">
                <span class="ne-tag-chip">${escapeHtml(keyword)}</span>
                <button
                    class="ne-tag-chip__remove"
                    type="button"
                    data-action="${escapeHtml(removeAction)}"
                    data-term="${escapeHtml(keyword)}"
                    aria-label="${escapeHtml(t('editor.lore.remove', { label, term: keyword }))}"
                    title="${escapeHtml(t('editor.lore.removeTitle', { label }))}"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>
        `).join('')
        : `<span class="ne-lore-meta__hint">${escapeHtml(emptyHint)}</span>`;

    return `
        <div class="ne-lore-meta__row">
            <div class="ne-lore-meta__label-wrap">
                <span class="ne-lore-meta__label">${escapeHtml(label)}</span>
            </div>
            <div class="ne-lore-meta__value">
                <div class="ne-tag-list ne-lore-meta__chips">${chipsMarkup}</div>
                <input
                    class="ne-input ne-lore-meta__input"
                    type="text"
                    data-action="${escapeHtml(inputAction)}"
                    placeholder="${escapeHtml(emptyHint)}"
                    autocomplete="off"
                    spellcheck="false"
                />
            </div>
        </div>
    `;
}

function getSortedTerms(termState) {
    return [...(termState?.items ?? [])].sort((left, right) => left.localeCompare(right));
}

function getDocumentTermPrefix(source) {
    return normaliseDocumentSource(source) === 'lorebook' ? '' : '#';
}

function buildLoreMetadataSummary(primaryKeywords, secondaryKeywords, selectedLogic, logicOptions) {
    const parts = [
        buildKeywordPreview(t('keywords.preview.primary'), primaryKeywords),
        buildKeywordPreview(t('keywords.preview.secondary'), secondaryKeywords),
    ];

    if (selectedLogic) {
        const logicLabel = logicOptions.find((option) => option.key === selectedLogic)?.label ?? selectedLogic;
        parts.push(t('keywords.preview.logic', { label: logicLabel }));
    }

    return parts.join(' | ');
}

function renderLorebookAdvancedSettings({ excludeRecursion = false, preventRecursion = false, probability = 100 } = {}) {
    return `
        <div class="ne-lore-meta__overflow-panel" data-lore-overflow-panel="true" data-positioning="true">
            <label class="ne-lore-meta__checkbox">
                <input
                    type="checkbox"
                    data-action="set-lore-entry-exclude-recursion"
                    ${excludeRecursion ? 'checked' : ''}
                />
                <span>${escapeHtml(t('editor.lore.excludeRecursion'))}</span>
            </label>
            <label class="ne-lore-meta__checkbox">
                <input
                    type="checkbox"
                    data-action="set-lore-entry-prevent-recursion"
                    ${preventRecursion ? 'checked' : ''}
                />
                <span>${escapeHtml(t('editor.lore.preventRecursion'))}</span>
            </label>
            <label class="ne-lore-meta__overflow-field">
                <span class="ne-lore-meta__label">${escapeHtml(t('editor.lore.probability'))}</span>
                <input
                    class="ne-input ne-lore-meta__probability"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value="${escapeHtml(String(probability))}"
                    data-action="set-lore-entry-probability"
                />
            </label>
        </div>
    `;
}

function buildKeywordPreview(label, keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
        return `${label}: ${t('keywords.preview.none')}`;
    }

    const preview = keywords.slice(0, 2).join(', ');
    const remainingCount = keywords.length - 2;
    return `${label}: ${preview}${remainingCount > 0 ? ` +${remainingCount}` : ''}`;
}
