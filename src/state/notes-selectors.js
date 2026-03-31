// src/state/notes-selectors.js
// Responsible for: pure derived reads for note browsing and sidebar models.

import { NOTE_SEARCH_THRESHOLD } from './session-store.js';
import { getSearchTagContext, normalizeForSearch, normalizeTagForSearch, splitSearchTextAndTags } from '../tag-utils.js';

const noteAnalysisCache = new Map();
let searchMatcherCache = null; // { search: string, matcher: Function }
let sectionSortCache = { key: null, sections: null };
let visibleNotesCache = { settings: null, search: '', tag: '', notes: null };
let suggestionCache = { query: null, tagIndexRevision: -1, suggestions: null };

export function buildSidebarModel(notesState, sessionState, uiState = {}) {
    const tagSuggestions = selectSidebarTagSuggestions(notesState, sessionState, uiState);
    const shouldShowSearch = shouldShowSidebarSearch(notesState.settings.notes.length, sessionState);

    return {
        currentNoteId: notesState.settings.currentNoteId,
        sections: selectSidebarSections(notesState, sessionState, uiState.collapsedFolderIds ?? new Set()),
        noteBulkSelectMode: Boolean(uiState.noteBulkSelectMode),
        bulkSelectedNoteIds: uiState.bulkSelectedNoteIds ?? new Set(),
        bulkSelectedFolderIds: uiState.bulkSelectedFolderIds ?? new Set(),
        search: sessionState.search,
        activeTag: sessionState.tag,
        shouldShowSearch,
        showTools: Boolean((sessionState.filtersOpen || sessionState.search || sessionState.tag) && shouldShowSearch),
        filtersOpen: Boolean(sessionState.filtersOpen || sessionState.search || sessionState.tag),
        moveMenuNoteId: uiState.moveMenuNoteId ?? null,
        revealedRowKey: uiState.revealedRowKey ?? '',
        folderOptions: buildFolderOptions(notesState.settings.folders),
        hasAnyNotes: notesState.settings.notes.length > 0,
        tagSuggestions,
        activeTagSuggestionIndex: clampSuggestionIndex(uiState.searchSuggestionIndex, tagSuggestions.length),
    };
}

export function selectVisibleNotes(notesState, sessionState) {
    if (
        visibleNotesCache.settings === notesState.settings
        && visibleNotesCache.search === sessionState.search
        && visibleNotesCache.tag === sessionState.tag
    ) {
        return visibleNotesCache.notes;
    }

    const searchMatcher = getSearchMatcher(sessionState.search);
    const notes = notesState.settings.notes
        .filter((note) => noteMatchesTag(note, sessionState.tag))
        .filter(searchMatcher);

    visibleNotesCache = { settings: notesState.settings, search: sessionState.search, tag: sessionState.tag, notes };
    return notes;
}

export function selectSidebarSections(notesState, sessionState, collapsedFolderIds = new Set()) {
    return buildSections(
        notesState.settings.folders,
        selectVisibleNotes(notesState, sessionState),
        { hideEmptySections: isFilteredSidebarView(sessionState), collapsedFolderIds },
    );
}

export function selectSidebarTagSuggestions(notesState, sessionState, uiState = {}) {
    const searchCaret = uiState.searchSelection?.start ?? sessionState.search.length;
    const context = getSearchTagContext(sessionState.search, searchCaret);
    if (!context) {
        return [];
    }

    if (
        suggestionCache.query === context.normalizedQuery
        && suggestionCache.tagIndexRevision === notesState.tagIndexRevision
    ) {
        return suggestionCache.suggestions;
    }

    const { tagIndex } = notesState;
    const suggestions = [...tagIndex.entries()]
        .filter(([normalized]) => normalized.startsWith(context.normalizedQuery))
        .sort(([, left], [, right]) => left.original.localeCompare(right.original, undefined, { sensitivity: 'base' }))
        .slice(0, 8)
        .map(([, entry]) => entry.original);

    suggestionCache = { query: context.normalizedQuery, tagIndexRevision: notesState.tagIndexRevision, suggestions };
    return suggestions;
}

function buildSectionCacheKey(notes, folders, hideEmptySections, collapsedFolderIds) {
    const notesPart = notes.map((n) => `${n.id}:${n.pinned ? '1' : '0'}:${n.updatedAt}:${n.folderId ?? ''}`).join('|');
    const foldersPart = folders.map((f) => `${f.id}:${f.parentFolderId ?? ''}`).join(',');
    const collapsedPart = [...collapsedFolderIds].sort().join(',');
    return `${notesPart}::${foldersPart}::${hideEmptySections ? '1' : '0'}::${collapsedPart}`;
}

function buildSections(folders, notes, options = {}) {
    const hideEmptySections = Boolean(options.hideEmptySections);
    const collapsedFolderIds = options.collapsedFolderIds ?? new Set();
    const cacheKey = buildSectionCacheKey(notes, folders, hideEmptySections, collapsedFolderIds);
    if (sectionSortCache.key === cacheKey) {
        return sectionSortCache.sections;
    }

    // Build a flat map of section objects (without subfolders yet).
    const sectionMap = new Map(
        folders.map((folder) => [
            folder.id,
            {
                id: folder.id,
                title: folder.name,
                notes: [],
                subfolders: [],
                folderId: folder.id,
                parentFolderId: folder.parentFolderId ?? null,
                isUnfiled: false,
                depth: 0,
            },
        ]),
    );
    const unfiledSection = {
        id: 'unfiled',
        title: 'Unfiled',
        notes: [],
        subfolders: [],
        folderId: null,
        parentFolderId: null,
        isUnfiled: true,
        depth: 0,
    };

    // Distribute notes — orphaned folder references fall through to unfiled.
    notes.forEach((note) => {
        const section = note.folderId ? sectionMap.get(note.folderId) : null;
        (section ?? unfiledSection).notes.push(note);
    });

    // Build the tree: attach each folder as a child of its parent.
    const rootSections = [];
    sectionMap.forEach((section) => {
        if (section.parentFolderId && sectionMap.has(section.parentFolderId)) {
            sectionMap.get(section.parentFolderId).subfolders.push(section);
        } else {
            rootSections.push(section);
        }
    });

    // Recursively sort, assign depth, sort notes, and apply collapsed state.
    function finalizeSection(section, depth) {
        section.depth = depth;
        section.isCollapsed = collapsedFolderIds.has(section.folderId);
        section.notes = [...section.notes].sort(sortPinnedThenRecent);
        section.subfolders = section.subfolders
            .sort((a, b) => {
                const fa = folders.find((f) => f.id === a.folderId);
                const fb = folders.find((f) => f.id === b.folderId);
                return (fa?.order ?? 0) - (fb?.order ?? 0);
            })
            .map((sub) => finalizeSection(sub, depth + 1));
        return section;
    }

    const finalRootSections = rootSections
        .sort((a, b) => {
            const fa = folders.find((f) => f.id === a.folderId);
            const fb = folders.find((f) => f.id === b.folderId);
            return (fa?.order ?? 0) - (fb?.order ?? 0);
        })
        .map((section) => finalizeSection(section, 0));

    // Filter empty sections at each level if in filtered view.
    function hasVisibleContent(section) {
        return section.notes.length > 0 || section.subfolders.some(hasVisibleContent);
    }

    const visibleRootSections = hideEmptySections
        ? finalRootSections.filter(hasVisibleContent)
        : finalRootSections;

    unfiledSection.notes.sort(sortPinnedThenRecent);

    const sections = [
        ...visibleRootSections,
        ...((!hideEmptySections || unfiledSection.notes.length > 0) ? [unfiledSection] : []),
    ];
    sectionSortCache = { key: cacheKey, sections };
    return sections;
}

function shouldShowSidebarSearch(totalNoteCount, sessionState) {
    return Boolean(
        sessionState.filtersOpen
        || totalNoteCount >= NOTE_SEARCH_THRESHOLD
        || sessionState.search
        || sessionState.tag
    );
}

function sortPinnedThenRecent(left, right) {
    if (left.pinned !== right.pinned) {
        return Number(right.pinned) - Number(left.pinned);
    }

    return getNoteAnalysis(right).updatedAtMs - getNoteAnalysis(left).updatedAtMs;
}

function isFilteredSidebarView(sessionState) {
    return Boolean(sessionState.search || sessionState.tag);
}

// Returns a cached matcher for the current search string, rebuilding only when the query changes.
function getSearchMatcher(search) {
    if (searchMatcherCache?.search === search) {
        return searchMatcherCache.matcher;
    }
    const matcher = createSearchMatcher(search);
    searchMatcherCache = { search, matcher };
    return matcher;
}

function createSearchMatcher(search) {
    const { text, tags } = splitSearchTextAndTags(search);
    if (!text && tags.length === 0) {
        return () => true;
    }

    return (note) => {
        const analysis = getNoteAnalysis(note);
        if (tags.length > 0 && !tags.every((tag) => analysis.normalizedTagSet.has(tag))) {
            return false;
        }

        if (!text) {
            return true;
        }

        return analysis.searchHaystack.includes(text);
    };
}

function noteMatchesTag(note, tag) {
    const trimmedTag = normalizeTagForSearch(tag);
    if (!trimmedTag) {
        return true;
    }

    return getNoteAnalysis(note).normalizedTagSet.has(trimmedTag);
}

function clampSuggestionIndex(index, length) {
    if (length <= 0) {
        return 0;
    }

    const numericIndex = Number.isInteger(index) ? index : 0;
    return Math.max(0, Math.min(numericIndex, length - 1));
}

function getNoteAnalysis(note) {
    const cached = noteAnalysisCache.get(note.id);
    if (
        cached
        && cached.updatedAt === note.updatedAt
        && cached.title === note.title
        && cached.content === note.content
        && areStringArraysEqual(cached.tags, note.tags)
    ) {
        return cached;
    }

    const normalizedTags = note.tags.map((tag) => normalizeTagForSearch(tag)).filter(Boolean);
    const nextAnalysis = {
        updatedAt: note.updatedAt,
        updatedAtMs: Date.parse(note.updatedAt) || 0,
        title: note.title,
        content: note.content,
        tags: [...note.tags],
        normalizedTags,
        normalizedTagSet: new Set(normalizedTags),
        searchHaystack: normalizeForSearch([
            note.title,
            note.content,
            ...note.tags,
        ].join(' ')),
    };

    noteAnalysisCache.set(note.id, nextAnalysis);
    return nextAnalysis;
}

// Called by notes-store after a note is deleted to purge the stale cache entry.
// Not called during normal render passes — deletions are the only time note IDs leave the array.
export function reconcileNoteAnalysisCache(notes) {
    const activeNoteIds = new Set(notes.map((note) => note.id));
    [...noteAnalysisCache.keys()].forEach((noteId) => {
        if (!activeNoteIds.has(noteId)) {
            noteAnalysisCache.delete(noteId);
        }
    });
}

function areStringArraysEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

// Produces a depth-ordered flat list of folder options for the move-note menu.
// Walks the folder tree in DFS order so each parent precedes its children.
// Returns [{ id, name, depth }, ...] — root folders have depth 0.
export function buildFolderOptions(folders) {
    const childrenOf = new Map();
    folders.forEach((folder) => {
        const parentKey = folder.parentFolderId ?? null;
        if (!childrenOf.has(parentKey)) {
            childrenOf.set(parentKey, []);
        }
        childrenOf.get(parentKey).push(folder);
    });

    childrenOf.forEach((children) => {
        children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    const result = [];
    function walk(parentId, depth) {
        const children = childrenOf.get(parentId) ?? [];
        children.forEach((folder) => {
            result.push({ id: folder.id, name: folder.name, depth });
            walk(folder.id, depth + 1);
        });
    }
    walk(null, 0);
    return result;
}
