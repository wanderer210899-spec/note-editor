// src/editor-toolbar.js
// Responsible for: title editing state and source-aware terms button/menu UI.

import { t } from './i18n/index.js';

export function handleTitleButtonActivation(event, titleButtonEl, startTitleEditing) {
    if (!titleButtonEl) {
        return;
    }

    if (titleButtonEl.dataset.skipClick === 'true') {
        delete titleButtonEl.dataset.skipClick;
        return;
    }

    event.preventDefault();
    startTitleEditing();
}

export function startTitleEditingUi(currentDocument, titleButtonEl, titleInputEl, closeTagsMenu) {
    if (!currentDocument || !titleButtonEl || !titleInputEl) {
        return;
    }

    closeTagsMenu();
    titleButtonEl.hidden = true;
    titleInputEl.hidden = false;
    titleInputEl.focus();
    titleInputEl.select();
}

export function stopTitleEditingUi(titleButtonEl, titleInputEl, flushAutosave, shouldFlush = true) {
    if (!titleButtonEl || !titleInputEl) {
        return;
    }

    titleButtonEl.hidden = false;
    titleInputEl.hidden = true;
    if (shouldFlush) {
        flushAutosave();
    }
}

export function updateDocumentTermsButtonState(tagsButtonEl, tagsButtonLabelEl, currentDocument, isPreviewMode, closeTermsMenu) {
    if (!tagsButtonEl) {
        return;
    }

    const termState = currentDocument?.meta.termState ?? null;
    const showButton = Boolean(currentDocument) && !isPreviewMode && currentDocument?.source !== 'lorebook';
    const termCount = termState?.items.length ?? 0;
    const buttonLabel = termState?.buttonLabel ?? t('toolbar.tags.notes');
    const singularLabel = termState?.singularLabel ?? t('source.note.singularTerm');
    tagsButtonEl.hidden = !showButton;

    if (!showButton) {
        closeTermsMenu();
        return;
    }

    if (tagsButtonLabelEl) {
        tagsButtonLabelEl.textContent = termCount ? `${buttonLabel} ${termCount}` : buttonLabel;
    }

    const countLabel = termCount === 1 ? `1 ${singularLabel}` : `${termCount} ${buttonLabel}`;
    tagsButtonEl.title = termCount ? countLabel : buttonLabel;
    tagsButtonEl.setAttribute('aria-label', termCount ? countLabel : buttonLabel);
}

export function syncTagsMenuState(tagsButtonEl, tagsMenuEl, tagsMenuOpen, updateTagsMenuPlacement, anchorEl = null) {
    if (!tagsMenuEl) {
        return;
    }

    if (tagsButtonEl) {
        tagsButtonEl.setAttribute('aria-expanded', String(tagsMenuOpen));
    }
    tagsMenuEl.hidden = !tagsMenuOpen;

    if (tagsMenuOpen) {
        requestAnimationFrame(() => updateTagsMenuPlacement(anchorEl));
    } else {
        tagsMenuEl.classList.remove('ne-tags-menu--flip');
        tagsMenuEl.style.position = '';
        tagsMenuEl.style.top = '';
        tagsMenuEl.style.right = '';
        tagsMenuEl.style.left = '';
        tagsMenuEl.style.bottom = '';
        tagsMenuEl.style.transform = '';
        tagsMenuEl.style.maxWidth = '';
        tagsMenuEl.style.maxHeight = '';
    }
}

export function updateTagsMenuPlacement(tagsMenuEl, anchorEl = null) {
    if (!tagsMenuEl || tagsMenuEl.hidden) {
        return;
    }

    prepareFloatingPanelPlacement(tagsMenuEl);
    tagsMenuEl.classList.remove('ne-tags-menu--flip');

    requestAnimationFrame(() => {
        if (tagsMenuEl.hidden) {
            return;
        }

        const anchorRect = anchorEl?.getBoundingClientRect?.() ?? null;
        const viewportBounds = {
            left: 8,
            top: 8,
            right: Math.max(8, window.innerWidth - 8),
            bottom: Math.max(8, window.innerHeight - 8),
        };
        const horizontalBounds = {
            left: viewportBounds.left,
            right: viewportBounds.right,
        };
        const availableWidth = Math.max(120, horizontalBounds.right - horizontalBounds.left);
        const availableHeight = Math.max(140, viewportBounds.bottom - viewportBounds.top);
        tagsMenuEl.style.maxWidth = `${availableWidth}px`;
        tagsMenuEl.style.maxHeight = `${availableHeight}px`;

        const measuredRect = tagsMenuEl.getBoundingClientRect();
        const menuWidth = measuredRect.width || Math.min(288, availableWidth);
        const menuHeight = measuredRect.height || Math.min(360, availableHeight);
        const preferredLeft = anchorRect
            ? anchorRect.right - menuWidth
            : horizontalBounds.right - menuWidth;
        const clampedLeft = clampNumber(preferredLeft, horizontalBounds.left, Math.max(horizontalBounds.left, horizontalBounds.right - menuWidth));
        const belowTop = anchorRect ? anchorRect.bottom + 6 : viewportBounds.top;
        const aboveTop = anchorRect ? anchorRect.top - menuHeight - 6 : viewportBounds.top;
        const nextTop = anchorRect && belowTop + menuHeight > viewportBounds.bottom && aboveTop >= viewportBounds.top
            ? aboveTop
            : clampNumber(belowTop, viewportBounds.top, Math.max(viewportBounds.top, viewportBounds.bottom - menuHeight));

        if (anchorRect && preferredLeft < anchorRect.left) {
            tagsMenuEl.classList.add('ne-tags-menu--flip');
        }

        finalizeFloatingPanelPlacement(tagsMenuEl, clampedLeft, nextTop);
    });
}

export function updateLoreOverflowPanelPlacement(overflowPanelEl, anchorEl = null) {
    if (!overflowPanelEl || overflowPanelEl.hidden) {
        return;
    }

    prepareFloatingPanelPlacement(overflowPanelEl);

    requestAnimationFrame(() => {
        if (overflowPanelEl.hidden) {
            return;
        }

        const anchorRect = anchorEl?.getBoundingClientRect?.() ?? null;
        const viewportBounds = {
            left: 8,
            top: 8,
            right: Math.max(8, window.innerWidth - 8),
            bottom: Math.max(8, window.innerHeight - 8),
        };
        const horizontalBounds = {
            left: viewportBounds.left,
            right: viewportBounds.right,
        };
        const availableWidth = Math.max(160, horizontalBounds.right - horizontalBounds.left);
        const availableHeight = Math.max(120, viewportBounds.bottom - viewportBounds.top);
        overflowPanelEl.style.maxWidth = `${availableWidth}px`;
        overflowPanelEl.style.maxHeight = `${availableHeight}px`;

        const measuredRect = overflowPanelEl.getBoundingClientRect();
        const panelWidth = measuredRect.width || Math.min(288, availableWidth);
        const panelHeight = measuredRect.height || Math.min(220, availableHeight);
        const preferredLeft = anchorRect
            ? anchorRect.right - panelWidth
            : horizontalBounds.right - panelWidth;
        const nextLeft = clampNumber(
            preferredLeft,
            horizontalBounds.left,
            Math.max(horizontalBounds.left, horizontalBounds.right - panelWidth),
        );
        const belowTop = anchorRect ? anchorRect.bottom + 6 : viewportBounds.top;
        const aboveTop = anchorRect ? anchorRect.top - panelHeight - 6 : viewportBounds.top;
        const nextTop = anchorRect && belowTop + panelHeight > viewportBounds.bottom && aboveTop >= viewportBounds.top
            ? aboveTop
            : clampNumber(
                belowTop,
                viewportBounds.top,
                Math.max(viewportBounds.top, viewportBounds.bottom - panelHeight),
            );

        finalizeFloatingPanelPlacement(overflowPanelEl, nextLeft, nextTop);
    });
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function prepareFloatingPanelPlacement(panelEl) {
    panelEl.dataset.positioning = 'true';
    panelEl.style.visibility = 'hidden';
    panelEl.style.position = 'fixed';
    panelEl.style.left = '8px';
    panelEl.style.top = '8px';
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.transform = '';
}

function finalizeFloatingPanelPlacement(panelEl, left, top) {
    panelEl.style.left = `${Math.round(left)}px`;
    panelEl.style.top = `${Math.round(top)}px`;
    panelEl.style.visibility = '';
    delete panelEl.dataset.positioning;
}
