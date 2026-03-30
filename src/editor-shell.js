// src/editor-shell.js
// Responsible for: editor shell markup and lightweight DOM field helpers.

import { getUntitledDocumentLabel } from './document-source.js';
import { t } from './i18n/index.js';

export function renderEditorShell() {
    return `
        <div class="ne-workspace">
            <aside class="ne-sidebar" id="ne-sidebar-root"></aside>

            <section class="ne-editor-shell">
                <div class="ne-format-bar" id="ne-format-bar" aria-label="${t('editorShell.formatBar.aria')}">
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="bold" title="${t('editorShell.format.bold')}" aria-label="${t('editorShell.format.bold')}"><strong>B</strong></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="italic" title="${t('editorShell.format.italic')}" aria-label="${t('editorShell.format.italic')}"><em>I</em></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="heading" title="${t('editorShell.format.heading')}" aria-label="${t('editorShell.format.heading')}">H</button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="quote" title="${t('editorShell.format.quote')}" aria-label="${t('editorShell.format.quote')}"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="unordered" title="${t('editorShell.format.unordered')}" aria-label="${t('editorShell.format.unordered')}"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="ordered" title="${t('editorShell.format.ordered')}" aria-label="${t('editorShell.format.ordered')}"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="indent" title="${t('editorShell.format.indent')}" aria-label="${t('editorShell.format.indent')}"><i class="fa-solid fa-indent" aria-hidden="true"></i></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="outdent" title="${t('editorShell.format.outdent')}" aria-label="${t('editorShell.format.outdent')}"><i class="fa-solid fa-outdent" aria-hidden="true"></i></button>
                    <button class="ne-btn ne-btn--soft ne-btn--format" type="button" data-format="clear" title="${t('editorShell.format.clear')}" aria-label="${t('editorShell.format.clear')}">${t('editorShell.format.clearShort')}</button>
                </div>

                <div class="ne-editor-stage">
                    <section class="ne-document-meta" id="ne-document-meta" hidden></section>

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
            </section>
        </div>
    `;
}

export function getEditorRefs(root) {
    return {
        editorShellEl: root.querySelector('.ne-editor-shell'),
        sidebarRootEl: root.querySelector('#ne-sidebar-root'),
        documentMetaEl: root.querySelector('#ne-document-meta'),
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
