// src/ui/toolbar-view.js
// Responsible for: rendering the toolbar shell and exposing stable DOM refs.

import { getDocumentSourceUi } from '../document-source.js';
import { t } from '../i18n/index.js';

const TOOLBAR_ACTIONS = {
    tags: {
        icon: 'fa-tags',
        getLabel: (_, source) => source === 'note' ? t('toolbar.tags.notes') : t('toolbar.tags.lorebook'),
    },
    preview: {
        icon: 'fa-eye',
        getLabel: () => t('toolbar.preview'),
    },
    source: {
        icon: 'fa-right-left',
        getLabel: (_, source) => source === 'note' ? t('toolbar.switchTo.lorebook') : t('toolbar.switchTo.notes'),
    },
};

export function mountToolbar(host, { source = 'note' } = {}) {
    if (!host) {
        return createEmptyToolbarRefs();
    }

    host.innerHTML = renderToolbarShell({ source });
    return getToolbarRefs(host.querySelector('#ne-toolbar'));
}

export function renderToolbarShell({ source = 'note' } = {}) {
    const sourceUi = getDocumentSourceUi(source);
    const isNoteSource = source === 'note';
    const sourceLabel = isNoteSource ? t('toolbar.source.notes') : t('toolbar.source.lorebook');
    const nextSource = isNoteSource ? 'lorebook' : 'note';
    const menuBtnLabel = isNoteSource ? t('toolbar.menuBtn.notes') : t('toolbar.menuBtn.lorebook');
    const switchToLabel = isNoteSource ? t('toolbar.switchTo.lorebook') : t('toolbar.switchTo.notes');
    const termButtonLabel = isNoteSource ? t('toolbar.tags.notes') : t('toolbar.tags.lorebook');

    return `
        <div class="ne-toolbar" id="ne-toolbar" data-source="${source}">
            <button class="ne-btn ne-btn--icon" id="ne-btn-menu" type="button" title="${menuBtnLabel}" aria-label="${menuBtnLabel}">
                <i class="fa-solid fa-bars"></i>
            </button>

            <button
                class="ne-btn ne-btn--soft ne-toolbar__source-toggle"
                id="ne-source-switch"
                type="button"
                data-source="${nextSource}"
                aria-label="${switchToLabel}"
                title="${switchToLabel}"
            >
                ${sourceLabel}
            </button>

            <div class="ne-toolbar__title-wrap">
                <button class="ne-toolbar__title" id="ne-title" type="button" title="${t('toolbar.title.edit')}">
                    ${sourceUi.editorTitle}
                </button>
                <label class="ne-visually-hidden" for="ne-title-input">${t('toolbar.title.label')}</label>
                <input
                    class="ne-toolbar__title-input"
                    id="ne-title-input"
                    type="text"
                    autocomplete="off"
                    hidden
                />
            </div>

            <div class="ne-toolbar__actions">
                <div class="ne-toolbar__menu-wrap" id="ne-tags-wrap">
                    <button class="ne-btn ne-btn--soft ne-btn--toolbar-chip" id="ne-btn-tags" type="button" title="${termButtonLabel}" aria-label="${termButtonLabel}" aria-haspopup="true" aria-expanded="false">
                        <i class="fa-solid fa-tags"></i>
                        <span id="ne-btn-tags-label">${termButtonLabel}</span>
                    </button>
                </div>
                <button class="ne-btn ne-btn--icon ne-toolbar__preview-button" id="ne-btn-preview" type="button" title="${t('toolbar.preview')}" aria-label="${t('toolbar.preview')}">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <div class="ne-toolbar__overflow-wrap" id="ne-toolbar-overflow-wrap" hidden>
                    <button class="ne-btn ne-btn--soft ne-btn--icon ne-btn--overflow-trigger" id="ne-btn-toolbar-overflow" type="button" title="${t('toolbar.overflow')}" aria-label="${t('toolbar.overflow')}" aria-haspopup="true" aria-expanded="false">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div class="ne-toolbar__overflow-menu" id="ne-toolbar-overflow-menu" hidden></div>
                </div>
                <button class="ne-btn ne-btn--icon" id="ne-btn-window" type="button" title="${t('toolbar.fullscreen')}" aria-label="${t('toolbar.fullscreen')}">
                    <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
                </button>
                <button class="ne-btn ne-btn--icon" id="ne-btn-close" type="button" title="${t('toolbar.close')}" aria-label="${t('toolbar.close')}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="ne-tags-menu" id="ne-tags-menu" hidden></div>
        </div>
    `;
}

export function getToolbarRefs(toolbarRoot) {
    if (!toolbarRoot) {
        return createEmptyToolbarRefs();
    }

    return {
        root: toolbarRoot,
        menuButton: toolbarRoot.querySelector('#ne-btn-menu'),
        titleButton: toolbarRoot.querySelector('#ne-title'),
        titleInput: toolbarRoot.querySelector('#ne-title-input'),
        tagsButton: toolbarRoot.querySelector('#ne-btn-tags'),
        tagsButtonLabel: toolbarRoot.querySelector('#ne-btn-tags-label'),
        tagsMenu: toolbarRoot.querySelector('#ne-tags-menu'),
        tagsWrap: toolbarRoot.querySelector('#ne-tags-wrap'),
        overflowWrap: toolbarRoot.querySelector('#ne-toolbar-overflow-wrap'),
        overflowButton: toolbarRoot.querySelector('#ne-btn-toolbar-overflow'),
        overflowMenu: toolbarRoot.querySelector('#ne-toolbar-overflow-menu'),
        sourceSwitch: toolbarRoot.querySelector('#ne-source-switch'),
        sourceButtons: [...toolbarRoot.querySelectorAll('.ne-toolbar__source-button')],
        sourceToggleButton: toolbarRoot.querySelector('#ne-source-switch'),
        previewButton: toolbarRoot.querySelector('#ne-btn-preview'),
        windowButton: toolbarRoot.querySelector('#ne-btn-window'),
        closeButton: toolbarRoot.querySelector('#ne-btn-close'),
        actions: toolbarRoot.querySelector('.ne-toolbar__actions'),
    };
}

function createEmptyToolbarRefs() {
    return {
        root: null,
        menuButton: null,
        titleButton: null,
        titleInput: null,
        tagsButton: null,
        tagsButtonLabel: null,
        tagsMenu: null,
        tagsWrap: null,
        overflowWrap: null,
        overflowButton: null,
        overflowMenu: null,
        sourceSwitch: null,
        sourceButtons: [],
        sourceToggleButton: null,
        previewButton: null,
        windowButton: null,
        closeButton: null,
        actions: null,
    };
}

export function renderToolbarOverflowMenu(hiddenActions = [], source = 'note') {
    const sourceUi = getDocumentSourceUi(source);
    return hiddenActions
        .map((actionKey) => {
            const action = TOOLBAR_ACTIONS[actionKey];
            if (!action) {
                return '';
            }

            const label = action.getLabel(sourceUi, source);
            return `
                <button
                    class="ne-menu__button"
                    type="button"
                    data-toolbar-overflow-action="${actionKey}"
                >
                    <i class="fa-solid ${action.icon}" aria-hidden="true"></i>
                    <span>${label}</span>
                </button>
            `;
        })
        .join('');
}
