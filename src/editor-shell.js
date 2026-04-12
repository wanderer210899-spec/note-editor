// src/editor-shell.js
// Responsible for: editor shell markup and lightweight DOM field helpers.

import { getUntitledDocumentLabel } from './document-source.js';
import {
    getFormatBarToolDefinition,
    getVisibleFormatBarTools,
    renderFormatBarToolContent,
} from './editor-tool-config.js';
import { t } from './i18n/index.js';

export function renderEditorShell(formatBarTools = []) {
    return `
        <div class="ne-workspace">
            <aside class="ne-sidebar" id="ne-sidebar-root"></aside>

            <section class="ne-editor-shell">
                <div class="ne-format-bar" id="ne-format-bar" aria-label="${t('editorShell.formatBar.aria')}">
                    ${renderFormatBarButtons(formatBarTools)}
                </div>

                <div class="ne-editor-stage">
                    <section class="ne-document-meta" id="ne-document-meta" hidden></section>
                    <div class="ne-document-source-terms" id="ne-document-source-terms" hidden></div>

                    <div class="ne-document-surface">
                        <label class="ne-visually-hidden" for="ne-note-content-input">${t('editorShell.contentLabel')}</label>
                        <textarea
                            id="ne-note-content-input"
                            class="ne-note-content-input"
                            spellcheck="true"
                        ></textarea>

                        <article class="ne-note-preview" id="ne-note-preview"></article>

                        <div class="ne-empty-state" id="ne-empty-state" hidden>
                            <p id="ne-empty-state-message">${t('editor.empty.note.message')}</p>
                            <button class="ne-btn ne-btn--soft" id="ne-empty-state-action" type="button" data-action="new-document">${t('source.note.createLabel')}</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}

export function renderFormatBarButtons(formatBarTools = []) {
    return getVisibleFormatBarTools(formatBarTools)
        .map((tool) => renderFormatBarButton(getFormatBarToolDefinition(tool.id)))
        .join('');
}

function renderFormatBarButton(tool) {
    const label = t(tool.labelKey);
    const shortLabel = tool.shortLabelKey ? t(tool.shortLabelKey) : '';
    const { markup, textOnly } = renderFormatBarToolContent(tool, { label, shortLabel });
    const className = `ne-btn ne-btn--soft ne-btn--format${textOnly ? ' ne-btn--format-text' : ''}`;

    return `
        <button
            class="${className}"
            type="button"
            data-format="${tool.id}"
            title="${label}"
            aria-label="${label}"
        >${markup}</button>
    `;
}

export function getEditorRefs(root) {
    return {
        editorShellEl: root.querySelector('.ne-editor-shell'),
        sidebarRootEl: root.querySelector('#ne-sidebar-root'),
        documentMetaEl: root.querySelector('#ne-document-meta'),
        sourceTermsEl: root.querySelector('#ne-document-source-terms'),
        contentInputEl: root.querySelector('#ne-note-content-input'),
        previewEl: root.querySelector('#ne-note-preview'),
        emptyStateEl: root.querySelector('#ne-empty-state'),
        emptyStateMessageEl: root.querySelector('#ne-empty-state-message'),
        emptyStateActionEl: root.querySelector('#ne-empty-state-action'),
        formatBarEl: root.querySelector('#ne-format-bar'),
    };
}

export function getDisplayTitle(title, source = 'note') {
    const trimmed = String(title ?? '').trim();
    return trimmed || getUntitledDocumentLabel(source);
}

export function syncFieldValue(field, value) {
    const nextValue = String(value ?? '');
    if (field && field.value !== nextValue) {
        field.value = nextValue;
    }
}
