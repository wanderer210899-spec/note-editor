// src/state/lorebook-store.js
// Responsible for: the SillyTavern-backed lorebook runtime store used by shared editor routing.

import { getDocumentSourceUi, DOCUMENT_SOURCE_LOREBOOK } from '../document-source.js';
import {
    createNativeLorebookEntry,
    listAvailableLorebookNames,
    loadLorebookByName,
    reloadLorebookByName,
    resolveActiveCharacterLorebookLinks,
    saveLorebookByName,
    subscribeToCharacterContextUpdates,
    subscribeToLorebookUpdates,
} from '../services/st-context.js';
import { t } from '../i18n/index.js';
import { cancelIdleTask, cloneData, readJsonStorage, scheduleIdleTask, writeJsonStorage } from '../util.js';
import { getSettingsState } from './settings-store.js';
import {
    buildPromptSummaryRows,
    getLorePositionLabel,
    getLorePositionMeta,
    getPromptSortedEntryIds,
    normalizeLorePosition,
    normalizeLorebookEntry,
    POSITION_META,
    POSITION_ORDER,
} from './lorebook-adapter.js';

const STORAGE_KEY = 'note-editor.lorebook-workspace.v1';
const AUTOSAVE_DELAY_MS = 2500;
const SUMMARY_BUILD_THRESHOLD = 500;
const SUMMARY_BUILD_CHUNK_SIZE = 150;
const MAX_WARM_LOREBOOKS = 2;
const CHARACTER_PRIMARY_SLOT_ID = 'character-primary-slot';

const listeners = new Set();
const sourceUi = getDocumentSourceUi(DOCUMENT_SOURCE_LOREBOOK);
const persistedUiState = readPersistedUiState();
let unsubscribeNativeLorebookUpdates = null;
let unsubscribeCharacterContextUpdates = null;

const runtime = {
    workspaceStatus: 'idle',
    refreshPromise: null,
    workspaceRevision: 0,
    saveStatus: 'saved',
    lastCharacterKey: '',
    availableLorebookNames: [],
    activeCharacter: null,
    primaryLorebookId: null,
    linkedLorebookIds: [],
    workspaceSlots: [...persistedUiState.workspaceSlots],
    activeLorebookId: persistedUiState.lastActiveLorebookId,
    lastWarmLorebookId: persistedUiState.lastWarmLorebookId,
    collapsedPositionsByLorebook: { ...persistedUiState.collapsedPositionsByLorebook },
    lorebookIds: [],
    books: new Map(),
    settingsSnapshotCache: null,
    currentDocumentCache: null,
};

export function subscribeLorebook(listener) {
    ensureNativeLorebookUpdateSubscription();
    ensureCharacterContextUpdateSubscription();
    listeners.add(listener);
    listener(getLorebookState());
    void ensureLorebookWorkspace();
    return () => listeners.delete(listener);
}

export function getLorebookState() {
    void ensureLorebookWorkspace();

    return {
        settings: getSettingsSnapshot(),
        currentDocument: getCurrentDocumentSnapshot(),
        sidebarStateKey: getSidebarStateCacheKey(),
        saveStatus: runtime.saveStatus,
        sourceUi,
    };
}

export function createLorebookEntry(overrides = {}) {
    const record = getActiveBookRecord();
    if (!record?.isLoaded || !record.rawData) {
        return null;
    }

    const nextUid = getNextLorebookEntryId(record);
    const nextEntry = buildNewLorebookEntry(record, nextUid, overrides);

    record.rawData.entries[nextUid] = nextEntry;
    record.entriesById = record.rawData.entries;
    record.entryCount = Object.keys(record.entriesById).length;
    record.currentEntryId = nextUid;
    commitBookMutation(record, { invalidateSummaries: true });
    return buildCurrentDocumentModel(record, nextEntry);
}

export function openLorebookEntry(entryId) {
    const record = getActiveBookRecord();
    const entry = getBookEntry(record, entryId);
    if (!record || !entry || record.currentEntryId === entryId) {
        return false;
    }

    flushLorebookAutosave(true);
    record.currentEntryId = String(entryId);
    invalidateSnapshots();
    emitChange();
    return true;
}

export function updateCurrentLorebookEntry(changes) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    if (!record || !entry) {
        return false;
    }

    let changed = false;
    let invalidateSummaries = false;
    if (typeof changes.title === 'string' && entry.comment !== changes.title) {
        entry.comment = changes.title;
        changed = true;
        invalidateSummaries = true;
    }

    if (typeof changes.content === 'string' && entry.content !== changes.content) {
        entry.content = changes.content;
        changed = true;
    }

    if (typeof changes.excludeRecursion === 'boolean' && entry.excludeRecursion !== changes.excludeRecursion) {
        entry.excludeRecursion = changes.excludeRecursion;
        changed = true;
    }

    if (typeof changes.preventRecursion === 'boolean' && entry.preventRecursion !== changes.preventRecursion) {
        entry.preventRecursion = changes.preventRecursion;
        changed = true;
    }

    if (Number.isFinite(Number(changes.probability))) {
        const nextProbability = clampProbabilityValue(changes.probability, entry.probability ?? 100);
        if (entry.probability !== nextProbability || !entry.useProbability) {
            entry.probability = nextProbability;
            entry.useProbability = true;
            changed = true;
        }
    }

    if (!changed) {
        return false;
    }

    entry.extensions = buildLorebookEntryExtensions(entry.extensions, entry);
    commitBookMutation(record, { invalidateSummaries });
    return true;
}

export function addCurrentLorebookKeyword(keyword) {
    return addCurrentLorebookKeywords([keyword]);
}

export function addCurrentLorebookKeywords(keywords) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    if (!record || !entry) {
        return false;
    }

    const nextKeywords = [...new Set(
        (Array.isArray(keywords) ? keywords : [])
            .map((keyword) => String(keyword ?? '').trim())
            .filter(Boolean),
    )];
    if (nextKeywords.length === 0) {
        return false;
    }

    const existing = new Set(asStringArray(entry.key));
    const toAdd = nextKeywords.filter((keyword) => !existing.has(keyword));
    if (toAdd.length === 0) {
        return false;
    }

    entry.key = [...asStringArray(entry.key), ...toAdd];
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function removeCurrentLorebookKeyword(keyword) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    const trimmedKeyword = String(keyword ?? '').trim();
    if (!record || !entry || !trimmedKeyword) {
        return false;
    }

    const primaryKeywords = asStringArray(entry.key);
    const secondaryKeywords = asStringArray(entry.keysecondary);
    const nextPrimary = primaryKeywords.filter((item) => item !== trimmedKeyword);
    const nextSecondary = secondaryKeywords.filter((item) => item !== trimmedKeyword);

    if (nextPrimary.length === primaryKeywords.length && nextSecondary.length === secondaryKeywords.length) {
        return false;
    }

    entry.key = nextPrimary;
    entry.keysecondary = nextSecondary;
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function addCurrentLorebookSecondaryKeyword(keyword) {
    return addCurrentLorebookSecondaryKeywords([keyword]);
}

export function addCurrentLorebookSecondaryKeywords(keywords) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    if (!record || !entry) {
        return false;
    }

    const nextKeywords = [...new Set(
        (Array.isArray(keywords) ? keywords : [])
            .map((keyword) => String(keyword ?? '').trim())
            .filter(Boolean),
    )];
    if (nextKeywords.length === 0) {
        return false;
    }

    const existing = new Set(asStringArray(entry.keysecondary));
    const toAdd = nextKeywords.filter((keyword) => !existing.has(keyword));
    if (toAdd.length === 0) {
        return false;
    }

    entry.keysecondary = [...asStringArray(entry.keysecondary), ...toAdd];
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function removeCurrentLorebookSecondaryKeyword(keyword) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    const trimmedKeyword = String(keyword ?? '').trim();
    if (!record || !entry || !trimmedKeyword) {
        return false;
    }

    const secondaryKeywords = asStringArray(entry.keysecondary);
    const nextSecondary = secondaryKeywords.filter((item) => item !== trimmedKeyword);
    if (nextSecondary.length === secondaryKeywords.length) {
        return false;
    }

    entry.keysecondary = nextSecondary;
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function setCurrentLorebookSecondaryKeywordLogic(logic) {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    if (!record || !entry) {
        return false;
    }

    const nextLogic = normalizeSecondaryKeywordLogicValue(logic);
    if (entry.selectiveLogic === nextLogic) {
        return false;
    }

    entry.selectiveLogic = nextLogic;
    if (!entry.selective) {
        entry.selective = true;
    }
    entry.extensions = buildLorebookEntryExtensions(entry.extensions, entry);
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function toggleLorebookEntryEnabled(lorebookId, entryId) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry) {
        return false;
    }

    entry.disable = !Boolean(entry.disable);
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function toggleLorebookEntryActivation(lorebookId, entryId) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry || entry.vectorized) {
        return false;
    }

    entry.constant = !Boolean(entry.constant);
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function setLorebookEntryPosition(lorebookId, entryId, positionValue) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry) {
        return false;
    }

    const normalizedPosition = normalizePositionValue(positionValue);
    if (!Number.isInteger(normalizedPosition) || normalizedPosition < 0) {
        return false;
    }

    if (entry.position === normalizedPosition) {
        return false;
    }

    entry.position = normalizedPosition;
    entry.extensions = buildLorebookEntryExtensions(entry.extensions, entry);
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function setLorebookEntryOrder(lorebookId, entryId, orderValue) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry) {
        return false;
    }

    const normalizedOrder = normalizeIntegerFieldValue(orderValue, entry.order ?? 100);
    if (entry.order === normalizedOrder) {
        return false;
    }

    entry.order = normalizedOrder;
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function setLorebookEntryDepth(lorebookId, entryId, depthValue) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry) {
        return false;
    }

    const normalizedDepth = Math.max(0, normalizeIntegerFieldValue(depthValue, entry.depth ?? 4));
    if (entry.depth === normalizedDepth) {
        return false;
    }

    entry.depth = normalizedDepth;
    entry.extensions = buildLorebookEntryExtensions(entry.extensions, entry);
    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function deleteLorebookEntry(lorebookId, entryId) {
    const record = getBookRecord(lorebookId);
    const entry = getBookEntry(record, entryId);
    if (!record || !entry) {
        return false;
    }

    const sortedIds = getSortedEntryIds(record);
    delete record.rawData.entries[String(entryId)];
    record.entriesById = record.rawData.entries;
    record.entryCount = Object.keys(record.entriesById).length;

    if (record.currentEntryId === String(entryId)) {
        const deletedIndex = sortedIds.indexOf(String(entryId));
        const nextId = sortedIds[deletedIndex + 1] ?? sortedIds[deletedIndex - 1] ?? null;
        record.currentEntryId = nextId;
    }

    commitBookMutation(record, { invalidateSummaries: true });
    return true;
}

export function toggleLorebookPositionSection(lorebookId, positionKey) {
    const trimmedLorebookId = String(lorebookId ?? '').trim();
    const trimmedPositionKey = String(positionKey ?? '').trim();
    if (!trimmedLorebookId || !trimmedPositionKey) {
        return false;
    }

    const currentState = runtime.collapsedPositionsByLorebook[trimmedLorebookId] ?? {};
    runtime.collapsedPositionsByLorebook = {
        ...runtime.collapsedPositionsByLorebook,
        [trimmedLorebookId]: {
            ...currentState,
            [trimmedPositionKey]: !currentState[trimmedPositionKey],
        },
    };
    persistUiState();
    invalidateSnapshots();
    emitChange();
    return true;
}

export async function setActiveLorebook(lorebookId, { forceRefresh = false } = {}) {
    const trimmedLorebookId = String(lorebookId ?? '').trim();
    if (!trimmedLorebookId) {
        return false;
    }

    const previousActiveLorebookId = runtime.activeLorebookId;
    if (previousActiveLorebookId && previousActiveLorebookId !== trimmedLorebookId) {
        runtime.lastWarmLorebookId = previousActiveLorebookId;
        void flushAutosaveForBook(previousActiveLorebookId, true);
    }

    runtime.activeLorebookId = trimmedLorebookId;
    persistUiState();
    invalidateSnapshots();
    emitChange();
    await ensureBookLoaded(trimmedLorebookId, { forceRefresh, markWarm: true });
    enforceLoadedBookRetention();
    return true;
}

export async function addManualLorebookToWorkspace(name) {
    const trimmedName = String(name ?? '').trim();
    if (!trimmedName || runtime.workspaceSlots.some((slot) => slot.lorebookId === trimmedName)) {
        return false;
    }

    runtime.workspaceSlots = [
        ...runtime.workspaceSlots,
        createWorkspaceSlot(trimmedName, { isExpanded: true }),
    ];
    runtime.lorebookIds = getWorkspaceLorebookIds(runtime.workspaceSlots);
    runtime.workspaceRevision += 1;
    ensureBookRecords(runtime.lorebookIds);
    runtime.activeLorebookId = trimmedName;
    persistUiState();
    invalidateSnapshots();
    emitChange();
    await ensureLorebookWorkspace({ forceRefresh: true });
    if (!runtime.lorebookIds.includes(trimmedName)) {
        return false;
    }

    await setActiveLorebook(trimmedName);
    return runtime.activeLorebookId === trimmedName;
}

export async function replaceLorebookWorkspaceSlot(slotId, nextLorebookId) {
    const trimmedSlotId = String(slotId ?? '').trim();
    const trimmedLorebookId = String(nextLorebookId ?? '').trim();
    if (!trimmedSlotId || !trimmedLorebookId) {
        return false;
    }

    const slot = getWorkspaceSlot(trimmedSlotId);
    if (!slot) {
        return false;
    }

    const duplicateSlot = runtime.workspaceSlots.find((candidate) => (
        candidate.slotId !== trimmedSlotId
        && candidate.lorebookId === trimmedLorebookId
    ));
    if (duplicateSlot) {
        return false;
    }

    runtime.workspaceSlots = runtime.workspaceSlots.map((candidate) => (
        candidate.slotId === trimmedSlotId
            ? { ...candidate, lorebookId: trimmedLorebookId }
            : candidate
    ));
    runtime.lorebookIds = getWorkspaceLorebookIds(runtime.workspaceSlots);
    runtime.workspaceRevision += 1;
    ensureBookRecords(runtime.lorebookIds);
    runtime.activeLorebookId = trimmedLorebookId;
    persistUiState();
    invalidateSnapshots();
    emitChange();
    await ensureLorebookWorkspace({ forceRefresh: true });
    if (!runtime.lorebookIds.includes(trimmedLorebookId)) {
        return false;
    }

    await setActiveLorebook(trimmedLorebookId);
    return runtime.activeLorebookId === trimmedLorebookId;
}

export function removeLorebookWorkspaceSlot(slotId) {
    const trimmedSlotId = String(slotId ?? '').trim();
    if (!trimmedSlotId) {
        return false;
    }

    const slot = getWorkspaceSlot(trimmedSlotId);
    if (!slot) {
        return false;
    }

    const slotIndex = runtime.workspaceSlots.findIndex((candidate) => candidate.slotId === trimmedSlotId);
    const remainingSlots = runtime.workspaceSlots.filter((candidate) => candidate.slotId !== trimmedSlotId);
    runtime.workspaceSlots = remainingSlots;
    runtime.lorebookIds = getWorkspaceLorebookIds(runtime.workspaceSlots);

    if (runtime.activeLorebookId === slot.lorebookId) {
        const nextSlot = remainingSlots[slotIndex] ?? remainingSlots[0] ?? null;
        runtime.activeLorebookId = nextSlot?.lorebookId ?? null;
    }

    persistUiState();
    invalidateSnapshots();
    emitChange();
    return true;
}

export async function toggleLorebookWorkspaceSlotExpansion(slotId) {
    const trimmedSlotId = String(slotId ?? '').trim();
    if (!trimmedSlotId) {
        return false;
    }

    let nextExpandedState = false;
    runtime.workspaceSlots = runtime.workspaceSlots.map((candidate) => {
        if (candidate.slotId !== trimmedSlotId) {
            return candidate;
        }

        nextExpandedState = !Boolean(candidate.isExpanded);
        return {
            ...candidate,
            isExpanded: nextExpandedState,
        };
    });

    persistUiState();
    invalidateSnapshots();
    emitChange();

    const slot = getWorkspaceSlot(trimmedSlotId);
    if (nextExpandedState && slot?.lorebookId) {
        await ensureBookLoaded(slot.lorebookId, { markWarm: true });
        enforceLoadedBookRetention();
    }

    return true;
}

export async function refreshLorebookWorkspace(options = {}) {
    await ensureLorebookWorkspace({ forceRefresh: true, ...options });
}

export function flushLorebookAutosave(immediately = true) {
    return flushAutosaveForBook(runtime.activeLorebookId, immediately);
}

function ensureNativeLorebookUpdateSubscription() {
    if (unsubscribeNativeLorebookUpdates) {
        return;
    }

    const unsubscribe = subscribeToLorebookUpdates((update) => {
        void handleNativeLorebookUpdate(update);
    });
    if (typeof unsubscribe === 'function') {
        unsubscribeNativeLorebookUpdates = unsubscribe;
    }
}

function ensureCharacterContextUpdateSubscription() {
    if (unsubscribeCharacterContextUpdates) {
        return;
    }

    const unsubscribe = subscribeToCharacterContextUpdates(() => {
        void handleCharacterContextUpdate();
    });
    if (typeof unsubscribe === 'function') {
        unsubscribeCharacterContextUpdates = unsubscribe;
    }
}

async function handleNativeLorebookUpdate(update) {
    const targetLorebookIds = uniqueStrings([
        ...(Array.isArray(update?.names) ? update.names : []),
        Array.isArray(update?.names) && update.names.length > 0 ? null : runtime.activeLorebookId,
        ...(Array.isArray(update?.names) && update.names.length > 0 ? [] : getExpandedWorkspaceLorebookIds()),
    ]);
    if (targetLorebookIds.length === 0) {
        return;
    }

    let changed = false;
    for (const lorebookId of targetLorebookIds) {
        const record = getBookRecord(lorebookId);
        if (!record) {
            continue;
        }

        if ((record.ignoredExternalUpdateUntil ?? 0) > Date.now()) {
            continue;
        }

        if (record.dirty || record.saveTimer !== null || record.inFlightRevision) {
            if (!record.hasExternalChange) {
                record.hasExternalChange = true;
                changed = true;
            }
            continue;
        }

        if (record.isLoaded || lorebookId === runtime.activeLorebookId || getExpandedWorkspaceLorebookIds().includes(lorebookId)) {
            await ensureBookLoaded(lorebookId, {
                forceRefresh: true,
                markWarm: lorebookId === runtime.activeLorebookId || lorebookId === runtime.lastWarmLorebookId,
            });
            continue;
        }

        if (!record.hasExternalChange) {
            record.hasExternalChange = true;
            changed = true;
        }
    }

    if (changed) {
        invalidateSnapshots();
        emitChange();
    }
}

async function handleCharacterContextUpdate() {
    await ensureLorebookWorkspace();
}

async function ensureLorebookWorkspace({ forceRefresh = false } = {}) {
    const linkedState = resolveActiveCharacterLorebookLinks();
    const characterKey = getCharacterWorkspaceKey(linkedState.character, linkedState);
    const characterChanged = runtime.lastCharacterKey !== characterKey;

    if (!forceRefresh && runtime.refreshPromise) {
        return runtime.refreshPromise;
    }

    if (!forceRefresh && runtime.workspaceStatus === 'loading') {
        return null;
    }

    if (!forceRefresh && runtime.workspaceStatus === 'ready' && runtime.lastCharacterKey === characterKey) {
        return null;
    }

    runtime.workspaceStatus = 'loading';
    runtime.lastCharacterKey = characterKey;

    runtime.refreshPromise = (async () => {
        const availableLorebookNames = await listAvailableLorebookNames();
        runtime.activeCharacter = linkedState.character;
        runtime.primaryLorebookId = linkedState.primaryName || null;
        runtime.linkedLorebookIds = [...linkedState.linkedNames];
        runtime.availableLorebookNames = uniqueStrings([
            ...availableLorebookNames,
            ...runtime.workspaceSlots.map((slot) => slot.lorebookId),
            runtime.primaryLorebookId,
            ...runtime.linkedLorebookIds,
        ]);
        runtime.workspaceSlots = syncCharacterPrimaryWorkspaceSlot(runtime.workspaceSlots, runtime.primaryLorebookId);
        runtime.workspaceSlots = buildVisibleWorkspaceSlots(runtime.workspaceSlots, {
            primaryLorebookId: runtime.primaryLorebookId,
            availableLorebookNames: runtime.availableLorebookNames,
        });
        runtime.lorebookIds = getWorkspaceLorebookIds(runtime.workspaceSlots);

        runtime.workspaceRevision += 1;
        ensureBookRecords(runtime.lorebookIds);

        if (characterChanged) {
            runtime.activeLorebookId = runtime.primaryLorebookId || runtime.lorebookIds[0] || null;
        } else if (!runtime.lorebookIds.includes(runtime.activeLorebookId)) {
            runtime.activeLorebookId = runtime.primaryLorebookId || runtime.lorebookIds[0] || null;
        }

        persistUiState();

        const lorebookIdsToLoad = uniqueStrings([
            runtime.activeLorebookId,
            ...getExpandedWorkspaceLorebookIds(),
        ]);
        await Promise.all(lorebookIdsToLoad.map((lorebookId) => ensureBookLoaded(lorebookId, {
            forceRefresh,
            markWarm: true,
        })));

        enforceLoadedBookRetention();

        runtime.workspaceStatus = 'ready';
    })().catch((error) => {
        console.error('[NoteEditor] Failed to refresh lorebook workspace.', error);
        runtime.workspaceStatus = 'error';
    }).finally(() => {
        runtime.refreshPromise = null;
        invalidateSnapshots();
        emitChange();
    });

    invalidateSnapshots();
    emitChange();
    return runtime.refreshPromise;
}

async function ensureBookLoaded(lorebookId, { forceRefresh = false, markWarm = false } = {}) {
    const record = getOrCreateBookRecord(lorebookId);
    if (!record) {
        return null;
    }

    if (record.loadPromise && !forceRefresh) {
        return record.loadPromise;
    }

    if (record.isLoaded && !forceRefresh) {
        if (markWarm) {
            touchLoadedRecord(record);
            enforceLoadedBookRetention();
        }
        if (!record.currentEntryId || !record.entriesById?.[record.currentEntryId]) {
            ensureCurrentEntryId(record);
        }
        return record;
    }

    record.isLoading = true;
    record.hasLoadError = false;
    record.errorMessage = '';
    invalidateSnapshots();
    emitChange();

    record.loadPromise = (async () => {
        const loaded = forceRefresh
            ? await reloadLorebookByName(lorebookId)
            : await loadLorebookByName(lorebookId);
        if (!loaded) {
            throw new Error(`Could not load lorebook "${lorebookId}".`);
        }

        record.rawData = normalizeLoadedLorebookData(loaded);
        record.entriesById = record.rawData.entries;
        record.entryCount = Object.keys(record.entriesById).length;
        record.normalizedEntriesById = {};
        record.promptSummaryRows = [];
        record.isLoaded = true;
        record.isLoading = false;
        record.hasExternalChange = false;
        record.lastLoadSource = forceRefresh ? 'fresh' : 'cached';
        record.hasTrustedFreshLoad = forceRefresh || record.hasTrustedFreshLoad;
        record.revision += 1;
        touchLoadedRecord(record);
        record.currentEntryId = record.currentEntryId && record.entriesById[record.currentEntryId]
            ? record.currentEntryId
            : null;
        buildBookSummaries(record);
        ensureCurrentEntryId(record);
        if (markWarm) {
            enforceLoadedBookRetention();
        }
        return record;
    })().catch((error) => {
        record.isLoading = false;
        record.isLoaded = false;
        record.hasLoadError = true;
        record.errorMessage = error instanceof Error ? error.message : 'Failed to load lorebook.';
        invalidateSnapshots();
        emitChange();
        return null;
    }).finally(() => {
        record.loadPromise = null;
    });

    return record.loadPromise;
}

function buildBookSummaries(record) {
    record.summaryBuildToken += 1;
    cancelIdleTask(record.summaryIdleHandle);
    record.summaryIdleHandle = null;

    const buildToken = record.summaryBuildToken;
    const entries = Object.values(record.entriesById ?? {});
    record.normalizedEntriesById = {};
    record.promptSummaryRows = [];
    record.summaryStatus = entries.length > SUMMARY_BUILD_THRESHOLD ? 'loading' : 'ready';
    invalidateSnapshots();
    emitChange();

    if (entries.length <= SUMMARY_BUILD_THRESHOLD) {
        record.normalizedEntriesById = buildNormalizedEntryMap(entries);
        record.promptSummaryRows = buildPromptSummaryRows(record.name, record.normalizedEntriesById);
        record.summaryRevision += 1;
        record.summaryStatus = 'ready';
        ensureCurrentEntryId(record, { preferPromptOrder: true });
        invalidateSnapshots();
        emitChange();
        return;
    }

    const nextNormalizedEntriesById = {};
    let index = 0;

    const processChunk = () => {
        if (record.summaryBuildToken !== buildToken) {
            return;
        }

        const chunkEnd = Math.min(index + SUMMARY_BUILD_CHUNK_SIZE, entries.length);
        for (; index < chunkEnd; index += 1) {
            const normalizedEntry = normalizeLorebookEntry(entries[index]);
            if (normalizedEntry.id) {
                nextNormalizedEntriesById[normalizedEntry.id] = normalizedEntry;
            }
        }

        if (index < entries.length) {
            record.summaryIdleHandle = scheduleIdleTask(processChunk);
            return;
        }

        record.normalizedEntriesById = nextNormalizedEntriesById;
        record.promptSummaryRows = buildPromptSummaryRows(record.name, record.normalizedEntriesById);
        record.summaryRevision += 1;
        record.summaryStatus = 'ready';
        record.summaryIdleHandle = null;
        ensureCurrentEntryId(record, { preferPromptOrder: true });
        invalidateSnapshots();
        emitChange();
    };

    record.summaryIdleHandle = scheduleIdleTask(processChunk);
}

function commitBookMutation(record, { invalidateSummaries = false } = {}) {
    record.revision += 1;
    record.dirtyRevision = record.revision;
    if (invalidateSummaries) {
        buildBookSummaries(record);
    }
    scheduleAutosave(record);
    if (!invalidateSummaries) {
        invalidateSnapshots();
        emitChange();
    }
}

function scheduleAutosave(record) {
    runtime.saveStatus = 'saving';
    clearTimeout(record.saveTimer);
    record.dirty = true;
    invalidateSnapshots();
    emitChange();
    record.saveTimer = window.setTimeout(() => {
        void persistBook(record, false);
    }, AUTOSAVE_DELAY_MS);
}

async function flushAutosaveForBook(lorebookId, immediately) {
    const record = getBookRecord(lorebookId);
    if (!record) {
        return false;
    }

    if (record.saveTimer !== null || record.dirty) {
        await persistBook(record, Boolean(immediately));
        return true;
    }

    runtime.saveStatus = getActiveBookSaveStatus();
    invalidateSnapshots();
    emitChange();
    return false;
}

async function persistBook(record, immediately) {
    if (!record?.rawData) {
        return false;
    }

    if (record.saveTimer !== null) {
        clearTimeout(record.saveTimer);
        record.saveTimer = null;
    }

    const saveRevision = record.revision;
    const payload = buildCanonicalLorebookPayload(record.rawData);
    record.lastSaveRequestedRevision = saveRevision;
    record.inFlightRevision = saveRevision;
    runtime.saveStatus = 'saving';
    invalidateSnapshots();
    emitChange();

    try {
        record.ignoredExternalUpdateUntil = Date.now() + 2000;
        await saveLorebookByName(record.name, payload, { immediately, refreshEditor: true });
        record.lastSavedRevision = saveRevision;
        record.inFlightRevision = 0;
        record.hasExternalChange = false;
        record.lastLoadSource = 'fresh';
        record.hasTrustedFreshLoad = true;
        if (record.revision === saveRevision) {
            record.dirty = false;
            record.dirtyRevision = 0;
        }
    } catch (error) {
        record.inFlightRevision = 0;
        record.dirty = true;
        record.ignoredExternalUpdateUntil = 0;
        console.error(`[NoteEditor] Failed to save lorebook "${record.name}".`, error);
    } finally {
        runtime.saveStatus = getActiveBookSaveStatus();
        invalidateSnapshots();
        emitChange();
    }

    if (record.dirty) {
        scheduleAutosave(record);
    } else {
        enforceLoadedBookRetention();
    }

    return true;
}

function getSettingsSnapshot() {
    const activeRecord = getActiveBookRecord();
    const cacheKey = [
        runtime.workspaceRevision,
        runtime.workspaceStatus,
        runtime.activeLorebookId ?? '',
        buildWorkspaceSlotCacheKey(),
        buildWorkspaceBookCacheKey(),
        activeRecord?.revision ?? -1,
        activeRecord?.currentEntryId ?? '',
        runtime.saveStatus,
        runtime.lastWarmLorebookId ?? '',
        JSON.stringify(runtime.collapsedPositionsByLorebook),
    ].join('|');

    if (runtime.settingsSnapshotCache?.key === cacheKey) {
        return runtime.settingsSnapshotCache.value;
    }

    const workspaceLorebooks = runtime.workspaceSlots.map((slot) => {
        const lorebookId = slot.lorebookId;
        const record = getBookRecord(lorebookId);
        return {
            slotId: slot.slotId,
            id: lorebookId,
            name: lorebookId,
            origin: getLorebookOrigin(lorebookId),
            isPrimary: lorebookId === runtime.primaryLorebookId,
            isActive: lorebookId === runtime.activeLorebookId,
            isExpanded: Boolean(slot.isExpanded),
            isLoaded: Boolean(record?.isLoaded),
            isLoading: Boolean(record?.isLoading),
            hasLoadError: Boolean(record?.hasLoadError),
            errorMessage: record?.errorMessage ?? '',
            entryCount: record?.entryCount ?? Object.keys(record?.entriesById ?? {}).length,
            lastOpenedAt: record?.lastOpenedAt ?? 0,
            saveStatus: getBookSaveStatus(record),
            hasExternalChange: Boolean(record?.hasExternalChange),
            lastLoadSource: record?.lastLoadSource ?? 'idle',
        };
    });

    const loadedLorebooksById = Object.fromEntries(
        runtime.lorebookIds.map((lorebookId) => {
            const record = getBookRecord(lorebookId);
            if (!record?.isLoaded && !record?.isLoading && !record?.hasLoadError) {
                return [
                    lorebookId,
                    {
                        isLoaded: false,
                        isLoading: false,
                        hasLoadError: false,
                        errorMessage: '',
                        currentEntryId: null,
                        collapsedPositions: {
                            ...(runtime.collapsedPositionsByLorebook[lorebookId] ?? {}),
                        },
                        promptSummaryRows: [],
                        summaryStatus: 'idle',
                        hasExternalChange: false,
                        lastLoadSource: 'idle',
                    },
                ];
            }

            return [
                lorebookId,
                {
                    isLoaded: Boolean(record?.isLoaded),
                    isLoading: Boolean(record?.isLoading),
                    hasLoadError: Boolean(record?.hasLoadError),
                    errorMessage: record?.errorMessage ?? '',
                    currentEntryId: record?.currentEntryId ?? null,
                    collapsedPositions: {
                        ...(runtime.collapsedPositionsByLorebook[lorebookId] ?? {}),
                    },
                    promptSummaryRows: record?.promptSummaryRows ?? [],
                    summaryStatus: record?.summaryStatus ?? 'idle',
                    dirtyRevision: record?.dirtyRevision ?? 0,
                    inFlightRevision: record?.inFlightRevision ?? 0,
                    hasExternalChange: Boolean(record?.hasExternalChange),
                    lastLoadSource: record?.lastLoadSource ?? 'idle',
                },
            ];
        }),
    );

    runtime.settingsSnapshotCache = {
        key: cacheKey,
        value: {
            workspaceStatus: runtime.workspaceStatus,
            workspaceLorebooks,
            availableLorebookNames: [...runtime.availableLorebookNames],
            activeCharacter: runtime.activeCharacter
                ? {
                    id: runtime.activeCharacter.id,
                    name: runtime.activeCharacter.name,
                    avatar: runtime.activeCharacter.avatar,
                    fileName: runtime.activeCharacter.fileName,
                }
                : null,
            activeLorebookId: runtime.activeLorebookId,
            currentEntryId: activeRecord?.currentEntryId ?? null,
            loadedLorebooksById,
            positionMeta: POSITION_META,
            positionOrder: POSITION_ORDER,
        },
    };

    return runtime.settingsSnapshotCache.value;
}

function getCurrentDocumentSnapshot() {
    const record = getActiveBookRecord();
    const entry = getCurrentBookEntry(record);
    if (!record || !entry) {
        runtime.currentDocumentCache = null;
        return null;
    }

    const cacheKey = [
        record.name,
        record.revision,
        runtime.saveStatus,
        record.currentEntryId,
        entry.comment,
        entry.content,
        asStringArray(entry.key).join('\u0001'),
        asStringArray(entry.keysecondary).join('\u0001'),
        Boolean(entry.disable),
        Boolean(entry.constant),
        Boolean(entry.vectorized),
        Number(entry.position),
        Boolean(record.hasExternalChange),
        record.lastLoadSource ?? 'idle',
    ].join('|');
    if (runtime.currentDocumentCache?.key === cacheKey) {
        return runtime.currentDocumentCache.value;
    }

    runtime.currentDocumentCache = {
        key: cacheKey,
        value: buildCurrentDocumentModel(record, entry),
    };
    return runtime.currentDocumentCache.value;
}

function buildCurrentDocumentModel(record, entry) {
    const normalizedEntry = normalizeLorebookEntry(entry);
    const positionMeta = getLorePositionMeta(normalizedEntry.positionKey);
    const secondaryKeywordLogic = getSecondaryKeywordLogicKey(
        entry.selectiveLogic,
        normalizedEntry.secondaryKeywords.length > 0,
    );

    return {
        id: normalizedEntry.id,
        source: DOCUMENT_SOURCE_LOREBOOK,
        title: normalizedEntry.title,
        content: normalizedEntry.content,
        editable: true,
        saveStatus: runtime.saveStatus,
        meta: {
            lorebookId: record.name,
            lorebookName: record.name,
            enabled: normalizedEntry.enabled,
            activationMode: normalizedEntry.activationMode,
            position: {
                key: positionMeta.key,
                value: normalizedEntry.positionValue,
                label: positionMeta.label,
            },
            keywords: normalizedEntry.primaryKeywords,
            secondaryKeywords: normalizedEntry.secondaryKeywords,
            secondaryKeywordLogic,
            secondaryKeywordLogicOptions: getSecondaryKeywordLogicOptions(),
            positionOptions: getLorePositionOptions(),
            nativeTraits: {
                ...normalizedEntry.nativeTraits,
                order: entry.order ?? null,
                displayIndex: entry.displayIndex ?? null,
            },
            syncState: {
                hasExternalChange: Boolean(record.hasExternalChange),
                lastLoadSource: record.lastLoadSource ?? 'idle',
                hasTrustedFreshLoad: Boolean(record.hasTrustedFreshLoad),
            },
            termState: {
                key: 'keywords',
                buttonLabel: sourceUi.termButtonLabel,
                singularLabel: sourceUi.singularTermLabel,
                pluralLabel: sourceUi.pluralTermLabel,
                emptyHint: sourceUi.emptyTermsHint,
                unavailableHint: sourceUi.unavailableTermsHint,
                activationMode: sourceUi.previewTermAction,
                items: uniqueStrings([...normalizedEntry.primaryKeywords, ...normalizedEntry.secondaryKeywords]),
            },
        },
    };
}

function normalizeLoadedLorebookData(data) {
    const normalized = cloneLorebookData(data);
    delete normalized.originalData;
    normalized.entries = readEntriesObject(data?.entries);
    return normalized;
}

function buildCanonicalLorebookPayload(rawData) {
    const source = cloneLorebookData(rawData);
    const payload = {};

    Object.entries(source).forEach(([key, value]) => {
        if (key === 'entries' || key === 'originalData' || value === undefined) {
            return;
        }

        payload[key] = cloneData(value);
    });

    payload.entries = readEntriesObject(source.entries);
    return payload;
}

function readEntriesObject(entries) {
    if (!entries || typeof entries !== 'object') {
        return {};
    }

    return Object.fromEntries(
        Object.entries(entries).map(([fallbackUid, entry]) => {
            const sanitizedEntry = sanitizeLorebookEntry(entry, { uid: fallbackUid });
            return [String(sanitizedEntry.uid), sanitizedEntry];
        }),
    );
}

function getNextLorebookEntryId(record) {
    const entryIds = Object.keys(record.entriesById ?? {})
        .map((uid) => Number(uid))
        .filter((uid) => Number.isFinite(uid));
    return String(entryIds.length ? Math.max(...entryIds) + 1 : 1);
}

function getNextDisplayIndex(record) {
    const displayIndexes = Object.values(record.entriesById ?? {})
        .map((entry) => Number(entry?.displayIndex))
        .filter((value) => Number.isFinite(value));
    return displayIndexes.length ? Math.max(...displayIndexes) + 1 : 0;
}

function buildNewLorebookEntry(record, nextUid, overrides = {}) {
    const nativeEntry = createNativeLorebookEntry(record.name, record.rawData);
    const nextDisplayIndex = getNextDisplayIndex(record);
    const entry = sanitizeLorebookEntry(nativeEntry, {
        uid: nextUid,
        order: typeof overrides.order === 'number' ? overrides.order : 100,
        position: typeof overrides.position === 'number' ? overrides.position : 0,
        displayIndex: nextDisplayIndex,
    });

    entry.uid = String(nextUid);
    entry.comment = String(overrides.title ?? '').trim();
    entry.content = String(overrides.content ?? '');
    entry.position = typeof overrides.position === 'number' ? overrides.position : entry.position;
    entry.order = typeof overrides.order === 'number' ? overrides.order : entry.order;
    entry.displayIndex = nextDisplayIndex;
    entry.key = [];
    entry.keysecondary = [];
    entry.disable = false;
    entry.constant = false;
    entry.vectorized = false;
    entry.selective = true;
    const { newEntryExcludeRecursion, newEntryPreventRecursion } = getSettingsState();
    entry.excludeRecursion = newEntryExcludeRecursion;
    entry.preventRecursion = newEntryPreventRecursion;
    entry.extensions = buildLorebookEntryExtensions(entry.extensions, entry);
    entry.characterFilter = normalizeCharacterFilter(entry.characterFilter);

    return entry;
}

function sanitizeLorebookEntry(entry, fallback = {}) {
    const template = createFallbackLorebookEntryTemplate(fallback);
    const source = entry && typeof entry === 'object'
        ? cloneData(entry)
        : {};
    const sanitized = {
        ...template,
        ...source,
    };

    sanitized.uid = resolveLorebookEntryId(source.uid, fallback.uid, template.uid);
    sanitized.key = asStringArray(source.key);
    sanitized.keysecondary = asStringArray(source.keysecondary);
    sanitized.comment = normalizeStringValue(source.comment, template.comment);
    sanitized.content = normalizeStringValue(source.content, template.content);
    sanitized.disable = normalizeBooleanValue(source.disable, template.disable);
    sanitized.constant = normalizeBooleanValue(source.constant, template.constant);
    sanitized.vectorized = normalizeBooleanValue(source.vectorized, template.vectorized);
    sanitized.selective = normalizeBooleanValue(source.selective, template.selective);
    sanitized.selectiveLogic = normalizeNumberValue(source.selectiveLogic, template.selectiveLogic);
    sanitized.addMemo = normalizeBooleanValue(source.addMemo, template.addMemo);
    sanitized.order = normalizeNumberValue(source.order, template.order);
    sanitized.position = normalizeNumberValue(source.position, template.position);
    sanitized.ignoreBudget = normalizeBooleanValue(source.ignoreBudget, template.ignoreBudget);
    sanitized.excludeRecursion = normalizeBooleanValue(source.excludeRecursion, template.excludeRecursion);
    sanitized.preventRecursion = normalizeBooleanValue(source.preventRecursion, template.preventRecursion);
    sanitized.matchPersonaDescription = normalizeBooleanValue(source.matchPersonaDescription, template.matchPersonaDescription);
    sanitized.matchCharacterDescription = normalizeBooleanValue(source.matchCharacterDescription, template.matchCharacterDescription);
    sanitized.matchCharacterPersonality = normalizeBooleanValue(source.matchCharacterPersonality, template.matchCharacterPersonality);
    sanitized.matchCharacterDepthPrompt = normalizeBooleanValue(source.matchCharacterDepthPrompt, template.matchCharacterDepthPrompt);
    sanitized.matchScenario = normalizeBooleanValue(source.matchScenario, template.matchScenario);
    sanitized.matchCreatorNotes = normalizeBooleanValue(source.matchCreatorNotes, template.matchCreatorNotes);
    sanitized.delayUntilRecursion = normalizeBooleanValue(source.delayUntilRecursion, template.delayUntilRecursion);
    sanitized.probability = normalizeNumberValue(source.probability, template.probability);
    sanitized.useProbability = normalizeBooleanValue(source.useProbability, template.useProbability);
    sanitized.depth = normalizeNumberValue(source.depth, template.depth);
    sanitized.outletName = normalizeStringValue(source.outletName, template.outletName);
    sanitized.group = normalizeStringValue(source.group, template.group);
    sanitized.groupOverride = normalizeBooleanValue(source.groupOverride, template.groupOverride);
    sanitized.groupWeight = normalizeNumberValue(source.groupWeight, template.groupWeight);
    sanitized.scanDepth = normalizeNullableNumberValue(source.scanDepth, template.scanDepth);
    sanitized.caseSensitive = normalizeNullableBooleanValue(source.caseSensitive, template.caseSensitive);
    sanitized.matchWholeWords = normalizeNullableBooleanValue(source.matchWholeWords, template.matchWholeWords);
    sanitized.useGroupScoring = normalizeBooleanValue(source.useGroupScoring, template.useGroupScoring);
    sanitized.automationId = normalizeStringValue(source.automationId, template.automationId);
    sanitized.role = normalizeNullableRoleValue(source.role, template.role);
    sanitized.sticky = normalizeNumberValue(source.sticky, template.sticky);
    sanitized.cooldown = normalizeNumberValue(source.cooldown, template.cooldown);
    sanitized.delay = normalizeNumberValue(source.delay, template.delay);
    sanitized.triggers = normalizeStringArrayValue(source.triggers);
    sanitized.displayIndex = normalizeNumberValue(source.displayIndex, template.displayIndex);
    sanitized.extensions = buildLorebookEntryExtensions(source.extensions, sanitized, template.extensions);

    if ('characterFilter' in source || 'characterFilter' in fallback) {
        sanitized.characterFilter = normalizeCharacterFilter(source.characterFilter ?? template.characterFilter);
    }

    return sanitized;
}

function createFallbackLorebookEntryTemplate({
    uid = '1',
    order = 100,
    position = 0,
    displayIndex = 0,
} = {}) {
    return {
        uid: String(uid),
        key: [],
        keysecondary: [],
        comment: '',
        content: '',
        constant: false,
        vectorized: false,
        selective: true,
        selectiveLogic: 0,
        addMemo: true,
        order: normalizeNumberValue(order, 100),
        position: normalizeNumberValue(position, 0),
        disable: false,
        ignoreBudget: false,
        excludeRecursion: false,
        preventRecursion: false,
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        delayUntilRecursion: false,
        probability: 100,
        useProbability: true,
        depth: 4,
        outletName: '',
        group: '',
        groupOverride: false,
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: false,
        automationId: '',
        role: null,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        triggers: [],
        displayIndex: normalizeNumberValue(displayIndex, 0),
        extensions: {
            position: normalizeNumberValue(position, 0),
            exclude_recursion: false,
            display_index: normalizeNumberValue(displayIndex, 0),
            probability: 100,
            useProbability: true,
            depth: 4,
            selectiveLogic: 0,
            group: '',
            group_override: false,
            group_weight: 100,
            prevent_recursion: false,
            delay_until_recursion: false,
            scan_depth: null,
            match_whole_words: null,
            use_group_scoring: false,
            case_sensitive: null,
            automation_id: '',
            role: 0,
            vectorized: false,
            sticky: 0,
            cooldown: 0,
            delay: 0,
            match_persona_description: false,
            match_character_description: false,
            match_character_personality: false,
            match_character_depth_prompt: false,
            match_scenario: false,
            match_creator_notes: false,
            triggers: [],
        },
    };
}

function buildLorebookEntryExtensions(extensions, entry, fallback = {}) {
    const source = extensions && typeof extensions === 'object'
        ? cloneData(extensions)
        : {};

    return {
        ...fallback,
        ...source,
        position: normalizeNumberValue(source.position, entry.position),
        exclude_recursion: normalizeBooleanValue(source.exclude_recursion, entry.excludeRecursion),
        display_index: normalizeNumberValue(source.display_index, entry.displayIndex),
        probability: normalizeNumberValue(source.probability, entry.probability),
        useProbability: normalizeBooleanValue(source.useProbability, entry.useProbability),
        depth: normalizeNumberValue(source.depth, entry.depth),
        selectiveLogic: normalizeNumberValue(source.selectiveLogic, entry.selectiveLogic),
        group: normalizeStringValue(source.group, entry.group),
        group_override: normalizeBooleanValue(source.group_override, entry.groupOverride),
        group_weight: normalizeNumberValue(source.group_weight, entry.groupWeight),
        prevent_recursion: normalizeBooleanValue(source.prevent_recursion, entry.preventRecursion),
        delay_until_recursion: normalizeBooleanValue(source.delay_until_recursion, entry.delayUntilRecursion),
        scan_depth: normalizeNullableNumberValue(source.scan_depth, entry.scanDepth),
        match_whole_words: normalizeNullableBooleanValue(source.match_whole_words, entry.matchWholeWords),
        use_group_scoring: normalizeBooleanValue(source.use_group_scoring, entry.useGroupScoring),
        case_sensitive: normalizeNullableBooleanValue(source.case_sensitive, entry.caseSensitive),
        automation_id: normalizeStringValue(source.automation_id, entry.automationId),
        role: normalizeNumberValue(source.role, entry.role ?? 0),
        vectorized: normalizeBooleanValue(source.vectorized, entry.vectorized),
        sticky: normalizeNumberValue(source.sticky, entry.sticky),
        cooldown: normalizeNumberValue(source.cooldown, entry.cooldown),
        delay: normalizeNumberValue(source.delay, entry.delay),
        match_persona_description: normalizeBooleanValue(source.match_persona_description, entry.matchPersonaDescription),
        match_character_description: normalizeBooleanValue(source.match_character_description, entry.matchCharacterDescription),
        match_character_personality: normalizeBooleanValue(source.match_character_personality, entry.matchCharacterPersonality),
        match_character_depth_prompt: normalizeBooleanValue(source.match_character_depth_prompt, entry.matchCharacterDepthPrompt),
        match_scenario: normalizeBooleanValue(source.match_scenario, entry.matchScenario),
        match_creator_notes: normalizeBooleanValue(source.match_creator_notes, entry.matchCreatorNotes),
        triggers: normalizeStringArrayValue(Array.isArray(source.triggers) ? source.triggers : entry.triggers),
    };
}

function normalizeCharacterFilter(value) {
    const source = value && typeof value === 'object'
        ? value
        : {};

    return {
        isExclude: normalizeBooleanValue(source.isExclude, false),
        names: normalizeStringArrayValue(source.names),
        tags: normalizeStringArrayValue(source.tags),
    };
}

function cloneLorebookData(data) {
    return data && typeof data === 'object'
        ? cloneData(data)
        : {};
}

function resolveLorebookEntryId(...values) {
    const match = values.find((value) => {
        const normalized = String(value ?? '').trim();
        return normalized.length > 0;
    });

    return String(match ?? '1').trim();
}

function normalizeStringValue(value, fallback = '') {
    if (typeof value === 'string') {
        return value;
    }

    return value === undefined || value === null
        ? fallback
        : String(value);
}

function normalizeNumberValue(value, fallback = 0) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeNullableNumberValue(value, fallback = null) {
    if (value === undefined) {
        return fallback;
    }

    if (value === null || value === '') {
        return null;
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeBooleanValue(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeNullableBooleanValue(value, fallback = null) {
    if (value === undefined) {
        return fallback;
    }

    if (value === null) {
        return null;
    }

    return typeof value === 'boolean' ? value : fallback;
}

function normalizeNullableRoleValue(value, fallback = null) {
    if (value === undefined) {
        return fallback;
    }

    if (value === null || value === '') {
        return null;
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeStringArrayValue(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
}

function normalizeIntegerFieldValue(value, fallback = 0) {
    const normalized = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function clampProbabilityValue(value, fallback = 100) {
    const normalized = normalizeIntegerFieldValue(value, fallback);
    return Math.max(0, Math.min(100, normalized));
}

function normalizePositionValue(value) {
    const normalized = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(normalized)) {
        return null;
    }

    return POSITION_ORDER.some((positionKey) => POSITION_META[positionKey]?.value === normalized)
        ? normalized
        : null;
}

function getLorePositionOptions() {
    return POSITION_ORDER
        .filter((positionKey) => positionKey !== POSITION_META.other.key)
        .map((positionKey) => ({
            key: positionKey,
            value: POSITION_META[positionKey].value,
            label: getLorePositionLabel(positionKey),
        }));
}

function getSecondaryKeywordLogicOptions() {
    return [
        { key: '', label: t('editor.lore.logic.none'), value: 0 },
        { key: 'and_any', label: t('editor.lore.logic.andAny'), value: 0 },
        { key: 'and_all', label: t('editor.lore.logic.andAll'), value: 1 },
        { key: 'not_all', label: t('editor.lore.logic.notAll'), value: 2 },
        { key: 'not_any', label: t('editor.lore.logic.notAny'), value: 3 },
    ];
}

function normalizeSecondaryKeywordLogicValue(logic) {
    const matchedOption = getSecondaryKeywordLogicOptions().find((option) => option.key === String(logic ?? '').trim());
    return matchedOption?.value ?? 0;
}

function getSecondaryKeywordLogicKey(value, hasSecondaryKeywords = false) {
    const numericValue = Number(value);
    if (numericValue === 0) {
        return hasSecondaryKeywords ? 'and_any' : '';
    }

    const matchedOption = getSecondaryKeywordLogicOptions().find((option) => option.value === numericValue);
    return matchedOption?.key ?? '';
}

function getSortedEntryIds(record) {
    if (Array.isArray(record?.promptSummaryRows) && record.promptSummaryRows.length > 0) {
        return record.promptSummaryRows.map((entry) => entry.id);
    }

    return getPromptSortedEntryIds(buildNormalizedEntryMap(Object.values(record?.entriesById ?? {})));
}

function getActiveBookSaveStatus() {
    return getBookSaveStatus(getActiveBookRecord());
}

function getBookSaveStatus(record) {
    if (!record) {
        return 'saved';
    }

    return record.saveTimer !== null || record.dirty || record.inFlightRevision ? 'saving' : 'saved';
}

function ensureBookRecords(lorebookIds) {
    lorebookIds.forEach((lorebookId) => {
        getOrCreateBookRecord(lorebookId);
    });
}

function getOrCreateBookRecord(lorebookId) {
    const trimmedLorebookId = String(lorebookId ?? '').trim();
    if (!trimmedLorebookId) {
        return null;
    }

    if (!runtime.books.has(trimmedLorebookId)) {
        runtime.books.set(trimmedLorebookId, {
            name: trimmedLorebookId,
            rawData: null,
            entriesById: {},
            normalizedEntriesById: {},
            promptSummaryRows: [],
            revision: 0,
            currentEntryId: null,
            entryCount: 0,
            isLoaded: false,
            isLoading: false,
            hasLoadError: false,
            errorMessage: '',
            loadPromise: null,
            summaryStatus: 'idle',
            summaryRevision: 0,
            summaryBuildToken: 0,
            summaryIdleHandle: null,
            dirty: false,
            saveTimer: null,
            lastSavedRevision: 0,
            lastSaveRequestedRevision: 0,
            dirtyRevision: 0,
            inFlightRevision: 0,
            lastOpenedAt: 0,
            hasExternalChange: false,
            lastLoadSource: 'idle',
            hasTrustedFreshLoad: false,
            ignoredExternalUpdateUntil: 0,
        });
    }

    return runtime.books.get(trimmedLorebookId);
}

function getBookRecord(lorebookId) {
    const trimmedLorebookId = String(lorebookId ?? '').trim();
    return trimmedLorebookId ? (runtime.books.get(trimmedLorebookId) ?? null) : null;
}

function getActiveBookRecord() {
    return getBookRecord(runtime.activeLorebookId);
}

function getBookEntry(record, entryId) {
    if (!record?.entriesById) {
        return null;
    }

    return record.entriesById[String(entryId)] ?? null;
}

function getCurrentBookEntry(record) {
    return getBookEntry(record, record?.currentEntryId);
}

function buildNormalizedEntryMap(entries) {
    return Object.fromEntries(
        entries
            .map((entry) => normalizeLorebookEntry(entry))
            .filter((entry) => entry.id)
            .map((entry) => [entry.id, entry]),
    );
}

function buildWorkspaceBookCacheKey() {
    return runtime.lorebookIds
        .map((lorebookId) => {
            const record = getBookRecord(lorebookId);
            return [
                lorebookId,
                record?.revision ?? -1,
                record?.isLoaded ? 1 : 0,
                record?.isLoading ? 1 : 0,
                record?.hasLoadError ? 1 : 0,
                record?.summaryStatus ?? 'idle',
                record?.promptSummaryRows?.length ?? 0,
                record?.currentEntryId ?? '',
                record?.lastOpenedAt ?? 0,
                getBookSaveStatus(record),
                record?.hasExternalChange ? 1 : 0,
                record?.lastLoadSource ?? 'idle',
            ].join(':');
        })
        .join('|');
}

function buildWorkspaceBookSidebarCacheKey() {
    return runtime.lorebookIds
        .map((lorebookId) => {
            const record = getBookRecord(lorebookId);
            return [
                lorebookId,
                record?.summaryRevision ?? 0,
                record?.isLoaded ? 1 : 0,
                record?.isLoading ? 1 : 0,
                record?.hasLoadError ? 1 : 0,
                record?.summaryStatus ?? 'idle',
                record?.promptSummaryRows?.length ?? 0,
                record?.currentEntryId ?? '',
                record?.lastOpenedAt ?? 0,
                record?.hasExternalChange ? 1 : 0,
                record?.lastLoadSource ?? 'idle',
            ].join(':');
        })
        .join('|');
}

function buildWorkspaceSlotCacheKey() {
    return runtime.workspaceSlots
        .map((slot) => `${slot.slotId}:${slot.lorebookId}:${slot.isExpanded ? 1 : 0}:${isCharacterWorkspaceSlot(slot) ? 'character' : 'workspace'}`)
        .join('|');
}

function getSidebarStateCacheKey() {
    return [
        runtime.workspaceRevision,
        runtime.workspaceStatus,
        runtime.activeLorebookId ?? '',
        buildWorkspaceSlotCacheKey(),
        buildWorkspaceBookSidebarCacheKey(),
        runtime.lastWarmLorebookId ?? '',
        JSON.stringify(runtime.collapsedPositionsByLorebook),
    ].join('|');
}

function touchLoadedRecord(record) {
    record.lastOpenedAt = Date.now();
}

function enforceLoadedBookRetention() {
    const loadedRecords = runtime.lorebookIds
        .map((lorebookId) => getBookRecord(lorebookId))
        .filter((record) => record?.isLoaded);

    const expandedLorebookIds = new Set(getExpandedWorkspaceLorebookIds());
    const minimumRetainedIds = new Set([
        runtime.activeLorebookId,
        runtime.lastWarmLorebookId,
        ...expandedLorebookIds,
    ].filter(Boolean));
    const retentionLimit = Math.max(MAX_WARM_LOREBOOKS, minimumRetainedIds.size);

    if (loadedRecords.length <= retentionLimit) {
        return;
    }

    const retainedIds = new Set(minimumRetainedIds);

    loadedRecords
        .sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0))
        .forEach((record) => {
            if (retainedIds.size < retentionLimit) {
                retainedIds.add(record.name);
            }
        });

    let changed = false;
    loadedRecords.forEach((record) => {
        if (!retainedIds.has(record.name)) {
            changed = evictBookHeavyState(record) || changed;
        }
    });

    if (changed) {
        invalidateSnapshots();
        emitChange();
    }
}

function evictBookHeavyState(record) {
    if (!record || !record.isLoaded) {
        return false;
    }

    if (
        record.name === runtime.activeLorebookId
        || record.name === runtime.lastWarmLorebookId
        || getExpandedWorkspaceLorebookIds().includes(record.name)
    ) {
        return false;
    }

    if (record.dirty || record.saveTimer !== null || record.loadPromise || record.inFlightRevision) {
        return false;
    }

    cancelIdleTask(record.summaryIdleHandle);
    record.summaryIdleHandle = null;
    record.summaryBuildToken += 1;
    record.rawData = null;
    record.entriesById = {};
    record.normalizedEntriesById = {};
    record.promptSummaryRows = [];
    record.isLoaded = false;
    record.summaryStatus = 'idle';
    return true;
}

function getLorebookOrigin(lorebookId) {
    if (lorebookId === runtime.primaryLorebookId) {
        return 'character-primary';
    }

    if (runtime.linkedLorebookIds.includes(lorebookId)) {
        return 'character-linked';
    }

    return 'workspace';
}

function getWorkspaceSlot(slotId) {
    const trimmedSlotId = String(slotId ?? '').trim();
    if (!trimmedSlotId) {
        return null;
    }

    return runtime.workspaceSlots.find((slot) => slot.slotId === trimmedSlotId) ?? null;
}

function getWorkspaceLorebookIds(workspaceSlots = []) {
    return uniqueStrings(workspaceSlots.map((slot) => slot?.lorebookId));
}

function ensureCurrentEntryId(record, { preferPromptOrder = false } = {}) {
    if (!record) {
        return null;
    }

    const currentEntryId = String(record.currentEntryId ?? '').trim();
    if (currentEntryId && record.entriesById?.[currentEntryId]) {
        return currentEntryId;
    }

    const promptFirstId = preferPromptOrder
        ? String(record.promptSummaryRows?.[0]?.id ?? '').trim()
        : '';
    if (promptFirstId && record.entriesById?.[promptFirstId]) {
        record.currentEntryId = promptFirstId;
        return promptFirstId;
    }

    const firstEntryId = Object.keys(record.entriesById ?? {})[0] ?? null;
    record.currentEntryId = firstEntryId;
    return firstEntryId;
}

function getExpandedWorkspaceLorebookIds() {
    return getWorkspaceLorebookIds(runtime.workspaceSlots.filter((slot) => slot?.isExpanded));
}

function createWorkspaceSlotId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkspaceSlot(lorebookId, {
    slotId = createWorkspaceSlotId(),
    isExpanded = false,
    binding = 'workspace',
} = {}) {
    return {
        slotId: String(slotId),
        lorebookId: String(lorebookId ?? '').trim(),
        isExpanded: Boolean(isExpanded),
        binding: binding === 'character' ? 'character' : 'workspace',
    };
}

function buildVisibleWorkspaceSlots(workspaceSlots, {
    primaryLorebookId = null,
    availableLorebookNames = [],
} = {}) {
    const availableSet = new Set(uniqueStrings(availableLorebookNames));
    const nextSlots = [];
    const seenLorebookIds = new Set();
    const pushSlot = (slot) => {
        const lorebookId = String(slot?.lorebookId ?? '').trim();
        if (!lorebookId || !availableSet.has(lorebookId) || seenLorebookIds.has(lorebookId)) {
            return;
        }

        nextSlots.push({
            ...createWorkspaceSlot(lorebookId, {
                slotId: slot?.slotId ?? createWorkspaceSlotId(),
                isExpanded: slot?.isExpanded,
                binding: isCharacterWorkspaceSlot(slot) ? 'character' : 'workspace',
            }),
        });
        seenLorebookIds.add(lorebookId);
    };

    (Array.isArray(workspaceSlots) ? workspaceSlots : []).forEach((slot) => {
        pushSlot(slot);
    });

    if (nextSlots.length === 0 && availableSet.size > 0) {
        const fallbackLorebookId = primaryLorebookId && availableSet.has(primaryLorebookId)
            ? primaryLorebookId
            : [...availableSet][0];
        pushSlot(createWorkspaceSlot(fallbackLorebookId, {
            slotId: fallbackLorebookId === primaryLorebookId ? CHARACTER_PRIMARY_SLOT_ID : createWorkspaceSlotId(),
            isExpanded: true,
            binding: fallbackLorebookId === primaryLorebookId ? 'character' : 'workspace',
        }));
    }

    return nextSlots;
}

function isCharacterWorkspaceSlot(slot) {
    return slot?.binding === 'character' || String(slot?.slotId ?? '') === CHARACTER_PRIMARY_SLOT_ID;
}

function syncCharacterPrimaryWorkspaceSlot(workspaceSlots = [], primaryLorebookId = null) {
    const manualSlots = (Array.isArray(workspaceSlots) ? workspaceSlots : [])
        .filter((slot) => !isCharacterWorkspaceSlot(slot))
        .filter((slot) => String(slot?.lorebookId ?? '').trim() !== String(primaryLorebookId ?? '').trim());
    const existingCharacterSlot = (Array.isArray(workspaceSlots) ? workspaceSlots : [])
        .find((slot) => isCharacterWorkspaceSlot(slot)) ?? null;
    const trimmedPrimaryLorebookId = String(primaryLorebookId ?? '').trim();
    if (!trimmedPrimaryLorebookId) {
        return manualSlots;
    }

    return [
        createWorkspaceSlot(trimmedPrimaryLorebookId, {
            slotId: existingCharacterSlot?.slotId ?? CHARACTER_PRIMARY_SLOT_ID,
            isExpanded: existingCharacterSlot?.isExpanded ?? true,
            binding: 'character',
        }),
        ...manualSlots,
    ];
}

function invalidateSnapshots() {
    runtime.settingsSnapshotCache = null;
    runtime.currentDocumentCache = null;
}

function emitChange() {
    let snapshot;
    try {
        snapshot = getLorebookState();
    } catch (error) {
        console.error('[NoteEditor] Failed to build lorebook state snapshot.', error);
        return;
    }

    listeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('[NoteEditor] Lorebook listener failed during state emission.', error);
        }
    });
}

function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
}

function uniqueStrings(values) {
    const seen = new Set();
    return values
        .map((value) => String(value ?? '').trim())
        .filter((value) => {
            if (!value || seen.has(value)) {
                return false;
            }

            seen.add(value);
            return true;
        });
}

function getCharacterWorkspaceKey(character, linkedState = {}) {
    if (!character) {
        return 'no-character';
    }

    return [
        character.id,
        character.fileName,
        linkedState.primaryName,
        ...(Array.isArray(linkedState.linkedNames) ? linkedState.linkedNames : []),
    ].filter(Boolean).join('::');
}

function readPersistedUiState() {
    const stored = readJsonStorage(STORAGE_KEY);
    const legacyManualLorebookIds = Array.isArray(stored?.manualLorebookIds)
        ? stored.manualLorebookIds.map((name) => String(name ?? '').trim()).filter(Boolean)
        : [];
    const legacyExpandedLorebookId = typeof stored?.lastExpandedLorebookId === 'string'
        ? stored.lastExpandedLorebookId
        : null;
    const storedWorkspaceSlots = Array.isArray(stored?.workspaceSlots)
        ? stored.workspaceSlots
        : legacyManualLorebookIds.map((lorebookId, index) => createWorkspaceSlot(lorebookId, {
            slotId: `legacy-slot-${index}`,
            isExpanded: lorebookId === legacyExpandedLorebookId || (!legacyExpandedLorebookId && index === 0),
        }));

    return {
        workspaceSlots: storedWorkspaceSlots
            .map((slot) => createWorkspaceSlot(slot?.lorebookId, {
                slotId: slot?.slotId ?? slot?.id ?? createWorkspaceSlotId(),
                isExpanded: slot?.isExpanded,
                binding: slot?.binding,
            }))
            .filter((slot) => Boolean(slot.lorebookId)),
        lastActiveLorebookId: typeof stored?.lastActiveLorebookId === 'string'
            ? stored.lastActiveLorebookId
            : null,
        lastWarmLorebookId: typeof stored?.lastWarmLorebookId === 'string'
            ? stored.lastWarmLorebookId
            : null,
        collapsedPositionsByLorebook: stored?.collapsedPositionsByLorebook && typeof stored.collapsedPositionsByLorebook === 'object'
            ? stored.collapsedPositionsByLorebook
            : {},
    };
}

function persistUiState() {
    writeJsonStorage(STORAGE_KEY, {
        workspaceSlots: runtime.workspaceSlots,
        lastActiveLorebookId: runtime.activeLorebookId,
        lastWarmLorebookId: runtime.lastWarmLorebookId,
        collapsedPositionsByLorebook: runtime.collapsedPositionsByLorebook,
    });
}
