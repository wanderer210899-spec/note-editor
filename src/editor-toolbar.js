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

    if (event.type === 'pointerup' && event.button !== 0) {
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

    tagsMenuEl.classList.remove('ne-tags-menu--flip');
    tagsMenuEl.style.position = 'fixed';
    tagsMenuEl.style.left = '8px';
    tagsMenuEl.style.top = '8px';
    tagsMenuEl.style.right = 'auto';
    tagsMenuEl.style.bottom = 'auto';
    tagsMenuEl.style.transform = '';

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

        tagsMenuEl.style.left = `${Math.round(clampedLeft)}px`;
        tagsMenuEl.style.top = `${Math.round(nextTop)}px`;
    });
}

export function updateLoreOverflowPanelPlacement(overflowPanelEl, anchorEl = null) {
    if (!overflowPanelEl || overflowPanelEl.hidden) {
        return;
    }

    overflowPanelEl.style.position = 'fixed';
    overflowPanelEl.style.left = '8px';
    overflowPanelEl.style.top = '8px';
    overflowPanelEl.style.right = 'auto';
    overflowPanelEl.style.bottom = 'auto';
    overflowPanelEl.style.transform = '';

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

        overflowPanelEl.style.left = `${Math.round(nextLeft)}px`;
        overflowPanelEl.style.top = `${Math.round(nextTop)}px`;
    });
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
