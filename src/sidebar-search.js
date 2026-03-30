// src/sidebar-search.js
// Responsible for: sidebar search input state, tag suggestion flow, and focus restore.

import { getSearchTagContext } from './tag-utils.js';

export function clearSidebarSearchUi(uiState, searchSuggestionsEl, searchFiltersEl) {
    uiState.pendingSearchFocus = null;
    if (searchSuggestionsEl) {
        searchSuggestionsEl.hidden = true;
        searchSuggestionsEl.innerHTML = '';
    }
    if (searchFiltersEl) {
        searchFiltersEl.hidden = true;
        searchFiltersEl.innerHTML = '';
    }
}

export function getSidebarInputKey(inputEl) {
    return String(inputEl?.dataset?.sidebarInputKey ?? '').trim();
}

export function beginSidebarInputComposition(uiState, inputEl) {
    const inputKey = getSidebarInputKey(inputEl);
    if (!inputKey) {
        return '';
    }

    uiState.activeCompositionInputKey = inputKey;
    return inputKey;
}

export function endSidebarInputComposition(uiState, inputEl) {
    const inputKey = getSidebarInputKey(inputEl);
    if (!inputKey || uiState.activeCompositionInputKey !== inputKey) {
        return '';
    }

    uiState.activeCompositionInputKey = '';
    return inputKey;
}

export function isSidebarInputComposing(uiState, inputEl) {
    const inputKey = getSidebarInputKey(inputEl);
    return Boolean(inputKey) && uiState.activeCompositionInputKey === inputKey;
}

export function restoreSidebarSearchFocus(uiState, searchInputEl, sidebarToolsEl) {
    const pendingFocus = uiState.pendingSearchFocus;
    if (!pendingFocus) {
        return;
    }

    uiState.pendingSearchFocus = null;
    requestAnimationFrame(() => {
        if (!searchInputEl || sidebarToolsEl?.hidden) {
            return;
        }

        searchInputEl.focus({ preventScroll: true });
        if (typeof searchInputEl.setSelectionRange === 'function') {
            searchInputEl.setSelectionRange(pendingFocus.start, pendingFocus.end);
        }
        uiState.searchSelection = { ...pendingFocus };
    });
}

export function syncSidebarSearchInput(searchInput, model, uiState = null) {
    if (!searchInput) {
        return;
    }

    const shouldPreserveComposedValue = uiState && isSidebarInputComposing(uiState, searchInput);
    if (!shouldPreserveComposedValue && searchInput.value !== model.search) {
        searchInput.value = model.search;
    }

    const tagSuggestions = Array.isArray(model.tagSuggestions) ? model.tagSuggestions : [];
    const hasSuggestions = tagSuggestions.length > 0;
    searchInput.setAttribute('aria-autocomplete', hasSuggestions ? 'list' : 'none');
    searchInput.setAttribute('aria-expanded', hasSuggestions ? 'true' : 'false');
    if (hasSuggestions) {
        searchInput.setAttribute('aria-controls', 'ne-search-tag-suggestions');
        return;
    }

    searchInput.removeAttribute('aria-controls');
}

export function updateSidebarSearchSelection(uiState, searchInput) {
    uiState.searchSelection = {
        start: searchInput.selectionStart ?? searchInput.value.length,
        end: searchInput.selectionEnd ?? searchInput.value.length,
    };
}

export function syncSidebarSearchValue(searchInput, uiState, getSessionState, setSessionSearch, renderSidebarController, {
    resetSuggestionIndex = false,
} = {}) {
    if (!searchInput) {
        return;
    }

    if (resetSuggestionIndex) {
        uiState.searchSuggestionIndex = 0;
    }

    updateSidebarSearchSelection(uiState, searchInput);
    uiState.pendingSearchFocus = { ...uiState.searchSelection };

    if (getSessionState().search !== searchInput.value) {
        setSessionSearch(searchInput.value);
        return;
    }

    renderSidebarController();
}

export function handleSidebarSearchKeyDown(event, uiState, getTagSuggestions, renderSidebarController, applySearchTagSuggestion) {
    const tagSuggestions = getTagSuggestions();
    if (tagSuggestions.length === 0) {
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        uiState.searchSuggestionIndex = (uiState.searchSuggestionIndex + 1) % tagSuggestions.length;
        renderSidebarController();
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        uiState.searchSuggestionIndex = (uiState.searchSuggestionIndex - 1 + tagSuggestions.length) % tagSuggestions.length;
        renderSidebarController();
        return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applySearchTagSuggestion(tagSuggestions[uiState.searchSuggestionIndex] ?? tagSuggestions[0]);
    }
}

export function shouldSkipSidebarSearchKeyUp(event) {
    return [
        'ArrowUp',
        'ArrowDown',
        'Enter',
        'Tab',
        'Shift',
        'Control',
        'Alt',
        'Meta',
        'Escape',
    ].includes(event.key);
}

export function applySidebarSearchTagSuggestion(tag, uiState, searchInputEl, getSessionState, setSessionSearch) {
    if (!tag) {
        return;
    }

    const currentSearch = getSessionState().search;
    const selection = getSidebarSearchSelection(uiState, searchInputEl, getSessionState);
    const tagContext = getSearchTagContext(currentSearch, selection.start)
        ?? getSearchTagContext(currentSearch, currentSearch.length);
    if (!tagContext) {
        return;
    }

    const prefix = currentSearch.slice(0, tagContext.start);
    const suffix = currentSearch.slice(tagContext.end);
    const needsTrailingSpace = suffix.length === 0 || !/^\s/u.test(suffix);
    const insertion = `#${tag}${needsTrailingSpace ? ' ' : ''}`;
    const finalSearch = `${prefix}${insertion}${suffix}`;
    const caretPosition = prefix.length + insertion.length;

    uiState.searchSuggestionIndex = 0;
    uiState.pendingSearchFocus = {
        start: caretPosition,
        end: caretPosition,
    };
    uiState.searchSelection = { ...uiState.pendingSearchFocus };
    setSessionSearch(finalSearch);
}

export function getActiveSidebarSearchTagSuggestions(getSidebarModel) {
    const model = getSidebarModel?.() ?? null;
    return Array.isArray(model?.tagSuggestions) ? model.tagSuggestions : [];
}

function getSidebarSearchSelection(uiState, searchInputEl, getSessionState) {
    if (searchInputEl) {
        return {
            start: searchInputEl.selectionStart ?? searchInputEl.value.length,
            end: searchInputEl.selectionEnd ?? searchInputEl.value.length,
        };
    }

    return uiState.searchSelection ?? {
        start: getSessionState().search.length,
        end: getSessionState().search.length,
    };
}
