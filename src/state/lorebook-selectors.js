// src/state/lorebook-selectors.js
// Responsible for: pure derived reads for lorebook browsing and sidebar models.

import { getLorePositionLabel } from './lorebook-adapter.js';
import { t } from '../i18n/index.js';
import { getSearchTagContext, normalizeForSearch, splitSearchTextAndTags } from '../tag-utils.js';

const LOREBOOK_PAGE_SIZE = 100;

export function buildLorebookSidebarModel(lorebookState, sessionState, uiState = {}) {
    const settings = lorebookState?.settings ?? {};
    const workspaceLorebooks = Array.isArray(settings.workspaceLorebooks) ? settings.workspaceLorebooks : [];
    const loadedLorebooksById = settings.loadedLorebooksById ?? {};
    const activeLorebookId = String(settings.activeLorebookId ?? '').trim() || null;
    const activeCurrentEntryId = settings.currentEntryId ?? null;
    const expandedLorebooks = workspaceLorebooks.filter((lorebook) => lorebook.isExpanded);
    const pageByLorebookId = uiState.lorebookPageById ?? {};
    const filteredLorebooks = expandedLorebooks.map((lorebook) => {
        const loadedLorebookState = loadedLorebooksById[lorebook.id] ?? null;
        const summaries = Array.isArray(loadedLorebookState?.promptSummaryRows) ? loadedLorebookState.promptSummaryRows : [];
        const filteredEntries = filterLorebookEntries(summaries, sessionState.search).map((entry) => ({
            ...entry,
            lorebookId: lorebook.id,
            lorebookName: lorebook.name,
            slotId: lorebook.slotId,
        }));

        return {
            lorebook,
            loadedLorebookState,
            summaries,
            filteredEntries,
        };
    });
    const allFilteredEntries = filteredLorebooks.flatMap((group) => group.filteredEntries);

    const lorebooksWithSections = workspaceLorebooks.map((lorebook) => {
        const loadedLorebookState = loadedLorebooksById[lorebook.id] ?? null;
        const summaries = Array.isArray(loadedLorebookState?.promptSummaryRows) ? loadedLorebookState.promptSummaryRows : [];
        const filteredGroup = filteredLorebooks.find((group) => group.lorebook.slotId === lorebook.slotId) ?? null;
        const filteredLorebookEntries = filteredGroup?.filteredEntries ?? [];
        const isActiveLorebook = lorebook.id === activeLorebookId;

        const sections = buildLorebookSections(
            settings.positionOrder,
            settings.positionMeta,
            filteredLorebookEntries,
            loadedLorebookState?.collapsedPositions ?? {},
            isActiveLorebook ? activeCurrentEntryId : null,
            pageByLorebookId,
            lorebook.id,
        );

        return {
            ...lorebook,
            currentEntryId: loadedLorebookState?.currentEntryId ?? null,
            summaryStatus: loadedLorebookState?.summaryStatus ?? 'idle',
            hasAnyEntries: summaries.length > 0,
            searchResultCount: filteredLorebookEntries.length,
            sections,
            hasActiveEntry: isActiveLorebook && sections.some((section) => section.hasActiveEntry),
        };
    });

    const tagSuggestions = selectLorebookKeywordSuggestions(settings, sessionState, uiState);
    const positionList = buildPositionList(settings.positionOrder, settings.positionMeta);
    const filtersOpen = Boolean(sessionState.filtersOpen || sessionState.search);
    const showTools = workspaceLorebooks.length > 0 && filtersOpen;

    return {
        source: 'lorebook',
        search: sessionState.search,
        searchPlaceholder: getLorebookSearchPlaceholder(expandedLorebooks),
        showTools,
        filtersOpen,
        workspaceStatus: settings.workspaceStatus,
        workspaceLorebooks: lorebooksWithSections,
        activeLorebookId,
        currentEntryId: activeCurrentEntryId,
        searchResultCount: allFilteredEntries.length,
        resultCap: LOREBOOK_PAGE_SIZE,
        revealedRowKey: uiState.revealedRowKey ?? '',
        tagSuggestions,
        activeTagSuggestionIndex: clampSuggestionIndex(uiState.searchSuggestionIndex, tagSuggestions.length),
        activeTag: null,
        picker: buildLorebookPickerModel(settings, uiState, workspaceLorebooks),
        positionList,
        loreEntryCreationDialog: buildLoreEntryCreationDialogModel(settings, uiState, workspaceLorebooks, positionList),
        deletePanelOpen: Boolean(uiState.deletePanelOpen),
        bulkSelectedEntryKeys: uiState.bulkSelectedEntryKeys ?? new Set(),
        bulkDeleteLorebookSearch: String(uiState.bulkDeleteLorebookSearch ?? ''),
        bulkSelectedLorebookNames: uiState.bulkSelectedLorebookNames ?? new Set(),
        availableLorebookNames: uniqueStrings(settings.availableLorebookNames ?? []),
    };
}

function buildLorebookPagingModel({
    currentPage = 1,
    totalEntries = 0,
    pageSize = LOREBOOK_PAGE_SIZE,
    visibleCount = 0,
} = {}) {
    const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
    const safePage = clampPageNumber(currentPage, totalPages);
    const start = totalEntries === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
    const end = totalEntries === 0 ? 0 : start + Math.max(visibleCount - 1, 0);
    const previousCount = safePage > 1
        ? Math.min(pageSize, start - 1)
        : 0;
    const remainingEntries = Math.max(0, totalEntries - end);
    const nextCount = safePage < totalPages
        ? Math.min(pageSize, remainingEntries)
        : 0;

    return {
        currentPage: safePage,
        totalPages,
        totalEntries,
        pageSize,
        visibleStart: start,
        visibleEnd: end,
        visibleCount,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < totalPages,
        previousCount,
        nextCount,
    };
}

function filterLorebookEntries(entries, search) {
    const { text, tags } = splitSearchTextAndTags(search);
    if (!text && tags.length === 0) {
        return entries;
    }

    return entries.filter((entry) => {
        const normalizedKeywords = Array.isArray(entry.normalizedKeywords) ? entry.normalizedKeywords : [];
        if (tags.length > 0 && !tags.every((tag) => normalizedKeywords.includes(tag))) {
            return false;
        }

        if (!text) {
            return true;
        }

        return String(entry.searchText ?? '').includes(text);
    });
}

function buildLorebookSections(positionOrder = [], positionMeta = {}, entries = [], collapsedPositions = {}, currentEntryId = null, pageByPositionKey = {}, lorebookId = '') {
    const positionOptions = buildPositionOptions(positionOrder, positionMeta);
    const sectionMap = new Map(
        (Array.isArray(positionOrder) ? positionOrder : []).map((positionKey) => [
            positionKey,
            {
                key: positionKey,
                title: getLorePositionLabel(positionKey),
                colorClass: positionMeta[positionKey]?.colorClass ?? positionMeta.other?.colorClass ?? '',
                isCollapsed: Boolean(collapsedPositions[positionKey]),
                entries: [],
            },
        ]),
    );

    entries.forEach((entry) => {
        const section = sectionMap.get(entry.positionKey) ?? sectionMap.get('other');
        if (section) {
            section.entries.push({
                ...entry,
                isCurrent: entry.id === currentEntryId,
                isAtDepth: entry.positionKey === 'at_depth',
                depth: Number.isFinite(Number(entry.nativeTraits?.depth)) ? Number(entry.nativeTraits.depth) : 0,
                order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
                positionOptions,
            });
        }
    });

    return [...sectionMap.values()]
        .filter((section) => section.entries.length > 0)
        .map((section) => {
            const hasActiveEntry = section.entries.some((entry) => entry.isCurrent);
            const pageKey = `${lorebookId}:${section.key}`;
            const totalEntries = section.entries.length;
            const totalPages = Math.max(1, Math.ceil(totalEntries / LOREBOOK_PAGE_SIZE));
            const currentPage = clampPageNumber(pageByPositionKey[pageKey], totalPages);
            const pageStart = (currentPage - 1) * LOREBOOK_PAGE_SIZE;
            const visibleEntries = section.entries.slice(pageStart, Math.min(pageStart + LOREBOOK_PAGE_SIZE, totalEntries));

            return {
                ...section,
                entries: visibleEntries,
                hasActiveEntry,
                paging: buildLorebookPagingModel({
                    currentPage,
                    totalEntries,
                    pageSize: LOREBOOK_PAGE_SIZE,
                    visibleCount: visibleEntries.length,
                }),
                pageKey,
            };
        });
}

function buildPositionList(positionOrder = [], positionMeta = {}) {
    return (Array.isArray(positionOrder) ? positionOrder : [])
        .filter((key) => key !== 'other')
        .map((key) => ({
            key,
            value: positionMeta[key]?.value ?? null,
            label: getLorePositionLabel(key),
            colorClass: positionMeta[key]?.colorClass ?? '',
        }))
        .filter((position) => position.value !== null);
}

function buildPositionOptions(positionOrder = [], positionMeta = {}) {
    return (Array.isArray(positionOrder) ? positionOrder : [])
        .filter((positionKey) => positionKey !== 'other')
        .map((positionKey) => ({
            key: positionKey,
            value: positionMeta[positionKey]?.value ?? null,
            label: getLorePositionLabel(positionKey),
        }))
        .filter((option) => option.value !== null);
}

function buildLoreEntryCreationDialogModel(settings, uiState, workspaceLorebooks, positionList) {
    if (!uiState.loreEntryCreationOpen) {
        return null;
    }

    const lorebooks = (Array.isArray(workspaceLorebooks) ? workspaceLorebooks : []).map((lorebook) => ({
        id: lorebook.id,
        name: lorebook.name,
        isActive: lorebook.id === settings.activeLorebookId,
        isPrimary: Boolean(lorebook.isPrimary),
    }));
    const selectedLorebookId = lorebooks.some((lorebook) => lorebook.id === uiState.loreEntryCreationLorebookId)
        ? uiState.loreEntryCreationLorebookId
        : lorebooks.find((lorebook) => lorebook.isActive)?.id ?? lorebooks[0]?.id ?? '';
    const selectedPositionKey = positionList.some((position) => position.key === uiState.loreEntryCreationPositionKey)
        ? uiState.loreEntryCreationPositionKey
        : positionList.find((position) => position.key === 'before_char')?.key ?? positionList[0]?.key ?? '';
    const orderValue = String(uiState.loreEntryCreationOrder ?? '').trim() || '100';
    const mode = uiState.loreEntryCreationMode === 'lorebook' ? 'lorebook' : 'entry';
    const lorebookName = String(uiState.loreEntryCreationLorebookName ?? '').trim();
    const existingLorebookNames = uniqueStrings(settings.availableLorebookNames ?? []);
    const hasExactLorebookMatch = lorebookName
        ? existingLorebookNames.some((candidate) => candidate.localeCompare(lorebookName, undefined, { sensitivity: 'base' }) === 0)
        : false;

    return {
        title: t('dialog.createEntry.title'),
        mode,
        lorebooks,
        positions: positionList,
        selectedLorebookId,
        selectedPositionKey,
        orderValue,
        lorebookName,
        canConfirmEntry: lorebooks.length > 0 && positionList.length > 0,
        canConfirmLorebook: Boolean(lorebookName) && !hasExactLorebookMatch,
        hasExactLorebookMatch,
    };
}

function buildLorebookPickerModel(settings, uiState, workspaceLorebooks) {
    const mode = uiState.lorebookPickerMode;
    if (mode !== 'add' && mode !== 'replace') {
        return null;
    }

    const slotId = mode === 'replace' ? String(uiState.lorebookPickerSlotId ?? '').trim() : null;
    const targetLorebook = slotId
        ? workspaceLorebooks.find((lorebook) => lorebook.slotId === slotId) ?? null
        : null;
    if (mode === 'replace' && !targetLorebook) {
        return null;
    }

    const search = String(uiState.lorebookPickerSearch ?? '');
    const normalizedSearch = normalizeForSearch(search);
    const trimmedSearch = search.trim();
    const availableLorebookNames = uniqueStrings(settings.availableLorebookNames ?? []);
    const visibleLorebookIds = new Set(workspaceLorebooks.map((lorebook) => lorebook.id));
    const options = availableLorebookNames
        .filter((lorebookId) => !visibleLorebookIds.has(lorebookId) || lorebookId === targetLorebook?.id)
        .filter((lorebookId) => !normalizedSearch || normalizeForSearch(lorebookId).includes(normalizedSearch))
        .map((lorebookId) => ({
            id: lorebookId,
            isCurrent: lorebookId === targetLorebook?.id,
        }));

    const hasExactNameMatch = trimmedSearch
        ? availableLorebookNames.some((lorebookId) => lorebookId.localeCompare(trimmedSearch, undefined, { sensitivity: 'base' }) === 0)
        : false;
    const canCreate = mode === 'add' && Boolean(trimmedSearch) && !hasExactNameMatch;

    return {
        mode,
        slotId,
        search,
        title: mode === 'add'
            ? t('picker.addTitle')
            : t('picker.replaceTitle', { name: targetLorebook?.name ?? t('settings.source.lorebook') }),
        emptyMessage: options.length > 0
            ? ''
            : normalizedSearch
                ? t('picker.empty.searchNoMatch')
                : mode === 'add'
                    ? t('picker.empty.allVisible')
                    : t('picker.empty.noReplacement'),
        options,
        canCreate,
        createName: canCreate ? trimmedSearch : '',
    };
}

function selectLorebookKeywordSuggestions(settings, sessionState, uiState = {}) {
    const activeLorebookId = String(settings.activeLorebookId ?? '').trim();
    if (!activeLorebookId) {
        return [];
    }

    const searchCaret = uiState.searchSelection?.start ?? sessionState.search.length;
    const context = getSearchTagContext(sessionState.search, searchCaret);
    if (!context) {
        return [];
    }

    const promptSummaryRows = settings.loadedLorebooksById?.[activeLorebookId]?.promptSummaryRows ?? [];
    const keywordSet = new Set();
    promptSummaryRows.forEach((entry) => {
        [...(entry.primaryKeywords ?? []), ...(entry.secondaryKeywords ?? [])].forEach((keyword) => {
            const trimmedKeyword = String(keyword ?? '').trim();
            if (trimmedKeyword) {
                keywordSet.add(trimmedKeyword);
            }
        });
    });

    return [...keywordSet]
        .filter((keyword) => normalizeForSearch(keyword).startsWith(context.normalizedQuery))
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .slice(0, 8);
}

function getLorebookSearchPlaceholder(expandedLorebooks) {
    if (expandedLorebooks.length === 1) {
        return t('search.placeholder.lorebookSingle', { name: expandedLorebooks[0].name });
    }

    if (expandedLorebooks.length > 1) {
        return t('search.placeholder.lorebookExpanded');
    }

    return t('search.placeholder.lorebook');
}

function clampSuggestionIndex(index, length) {
    if (!length) {
        return 0;
    }

    const numericIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
    return Math.max(0, Math.min(length - 1, numericIndex));
}

function clampPageNumber(pageNumber, totalPages) {
    const numericPage = Number.isFinite(Number(pageNumber)) ? Math.trunc(Number(pageNumber)) : 1;
    return Math.max(1, Math.min(totalPages, numericPage));
}

function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? '').trim())
        .filter((value) => {
            if (!value || seen.has(value)) {
                return false;
            }

            seen.add(value);
            return true;
        });
}
