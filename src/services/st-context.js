// src/services/st-context.js
// Responsible for: all access to SillyTavern runtime context used by the plugin.

function getRawContext() {
    return window.SillyTavern?.getContext?.() ?? null;
}

const WORLDINFO_UPDATED_EVENT = 'worldinfo_updated';

export function getSillyTavernContext() {
    return getRawContext();
}

export function saveSillyTavernSettings() {
    getRawContext()?.saveSettingsDebounced?.();
}

export function runWithSuppressedToasts(task, { restoreDelayMs = 900 } = {}) {
    if (typeof task !== 'function') {
        return undefined;
    }

    const toastr = window.toastr;
    if (!toastr) {
        return task();
    }

    const methodNames = ['success', 'info', 'warning', 'error'];
    const originals = new Map();
    methodNames.forEach((name) => {
        if (typeof toastr[name] === 'function') {
            originals.set(name, toastr[name]);
            toastr[name] = () => undefined;
        }
    });

    const restore = () => {
        originals.forEach((original, name) => {
            toastr[name] = original;
        });
        clearVisibleToasts();
    };

    clearVisibleToasts();

    try {
        const result = task();
        if (result && typeof result.finally === 'function') {
            return result.finally(() => {
                window.setTimeout(restore, restoreDelayMs);
            });
        }

        window.setTimeout(restore, restoreDelayMs);
        return result;
    } catch (error) {
        restore();
        throw error;
    }
}

export function getActiveCharacterSummary() {
    const character = getActiveCharacterRecord();
    if (!character) {
        return null;
    }

    return {
        id: character.id,
        name: character.name,
        avatar: character.avatar,
    };
}

export function getActiveCharacterRecord() {
    const context = getRawContext();
    if (!context) {
        return null;
    }

    const directName = firstMeaningfulString(
        context.characterName,
        context.character_name,
        context.chatMetadata?.character_name,
        context.chat_metadata?.character_name,
        context.name2
    );
    const directId = firstNonEmptyString(
        context.characterId,
        context.character_id,
        context.chatMetadata?.character_id,
        context.chat_metadata?.character_id
    );
    const characters = Array.isArray(context.characters) ? context.characters : [];
    const matchedCharacter = findCharacterMatch(characters, directId, directName, context.avatar_url);

    if (matchedCharacter) {
        return matchedCharacter;
    }

    if (!directName && !directId) {
        return null;
    }

    return {
        id: directId || `name:${directName}`,
        name: directName || 'Current character',
        avatar: firstNonEmptyString(context.avatar_url, context.characterAvatar),
        fileName: firstNonEmptyString(context.avatar_url, context.characterAvatar),
        primaryLorebookName: '',
        rawCharacter: null,
    };
}

export async function listAvailableLorebookNames() {
    const context = getRawContext();
    await context?.updateWorldInfoList?.();

    const settingsLorebookNames = await fetchLorebookNamesFromSettingsApi();

    return uniqueStrings([
        ...settingsLorebookNames,
        ...readLorebookNameCollection(window.world_names),
        ...readLorebookNameCollection(context?.world_names),
        ...readLorebookNameCollection(window.worldNames),
        ...readLorebookNameOptions('#world_editor_select'),
        ...readLorebookNameOptions('#world_info'),
        ...collectLorebookNamesFromCharacters(context?.characters),
    ]);
}

export function getWorldInfoState() {
    const candidates = [
        window.world_info,
        getRawContext()?.world_info,
        getRawContext()?.worldInfo,
    ];

    return candidates.find((value) => value && typeof value === 'object') ?? null;
}

export function resolveActiveCharacterLorebookLinks() {
    const activeCharacter = getActiveCharacterRecord();
    const worldInfoState = getWorldInfoState();
    const primaryName = firstNonEmptyString(
        activeCharacter?.rawCharacter?.data?.extensions?.world,
        activeCharacter?.primaryLorebookName
    );
    const fileName = firstNonEmptyString(activeCharacter?.fileName, activeCharacter?.avatar);
    const charLoreValue = fileName ? worldInfoState?.charLore?.[fileName] : null;

    return {
        character: activeCharacter,
        primaryName,
        linkedNames: uniqueStrings(readLinkedLorebookNames(charLoreValue)),
    };
}

export async function loadLorebookByName(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return null;
    }

    const context = getRawContext();
    if (typeof context?.loadWorldInfo !== 'function') {
        return null;
    }

    const loaded = await context.loadWorldInfo(trimmedName);
    return loaded && typeof loaded === 'object'
        ? loaded
        : { entries: {} };
}

export function invalidateLorebookCache(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const context = getRawContext();
    const cacheCandidates = [
        window.worldInfoCache,
        window.world_info_cache,
        context?.worldInfoCache,
        context?.world_info_cache,
    ];
    const cache = cacheCandidates.find((candidate) => candidate && typeof candidate.delete === 'function');
    if (!cache) {
        return false;
    }

    cache.delete(trimmedName);
    return true;
}

export async function loadFreshLorebookByName(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return null;
    }

    invalidateLorebookCache(trimmedName);

    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: getLorebookRequestHeaders(),
        body: JSON.stringify({ name: trimmedName }),
        cache: 'no-cache',
    });
    if (!response.ok) {
        return null;
    }

    const loaded = await response.json();
    return loaded && typeof loaded === 'object'
        ? loaded
        : { entries: {} };
}

export async function saveLorebookByName(name, data, { immediately = false, refreshEditor = false } = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const context = getRawContext();
    if (typeof context?.saveWorldInfo !== 'function') {
        return false;
    }

    await context.saveWorldInfo(trimmedName, data, Boolean(immediately));
    if (refreshEditor) {
        syncLorebookEditor(trimmedName);
    }
    return true;
}

export async function deleteLorebookFile(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const context = getRawContext();
    const fn = [
        context?.deleteWorldInfo,
        window.deleteWorldInfo,
    ].find((candidate) => typeof candidate === 'function');

    if (!fn) {
        console.warn('[NoteEditor] deleteWorldInfo is not available in this version of SillyTavern.');
        return false;
    }

    try {
        await fn(trimmedName);
        return true;
    } catch (error) {
        console.warn('[NoteEditor] Failed to delete lorebook file.', error);
        return false;
    }
}

export async function createLorebookFile(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const context = getRawContext();
    const factory = [
        context?.createNewWorldInfo,
        window.createNewWorldInfo,
    ].find((candidate) => typeof candidate === 'function');

    try {
        if (factory) {
            await factory(trimmedName, { interactive: false });
            return true;
        }

        const created = await createLorebookFileFallback(trimmedName, context);
        if (!created) {
            console.warn('[NoteEditor] Could not create lorebook file: createNewWorldInfo is unavailable and the saveWorldInfo fallback could not create a new file.');
            return false;
        }

        return true;
    } catch (error) {
        console.warn('[NoteEditor] Failed to create lorebook file.', error);
        return false;
    }
}

export function createNativeLorebookEntry(name, data) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName || !data || typeof data !== 'object') {
        return null;
    }

    const context = getRawContext();
    const factory = [
        context?.createWorldInfoEntry,
        window.createWorldInfoEntry,
    ].find((candidate) => typeof candidate === 'function');

    if (!factory) {
        return null;
    }

    try {
        const created = factory(trimmedName, data);
        return created && typeof created === 'object'
            ? created
            : null;
    } catch (error) {
        console.warn('[NoteEditor] Native lorebook entry creation failed.', error);
        return null;
    }
}

export async function reloadLorebookByName(name, { refreshEditor = true } = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return null;
    }

    const loaded = await loadFreshLorebookByName(trimmedName);
    if (refreshEditor) {
        syncLorebookEditor(trimmedName);
    }
    return loaded;
}

export function syncLorebookEditor(name, { loadIfNotSelected = false } = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const context = getRawContext();
    if (typeof context?.reloadWorldInfoEditor !== 'function') {
        return false;
    }

    try {
        context.reloadWorldInfoEditor(trimmedName, Boolean(loadIfNotSelected));
        return true;
    } catch (error) {
        console.warn('[NoteEditor] Lorebook editor refresh failed.', error);
        return false;
    }
}

export function subscribeToLorebookUpdates(listener) {
    if (typeof listener !== 'function') {
        return null;
    }

    const context = getRawContext();
    const eventSource = context?.eventSource;
    if (!eventSource || typeof eventSource.on !== 'function') {
        return null;
    }

    const handleUpdate = (...args) => {
        const payload = args.length <= 1 ? args[0] : args;
        listener({
            raw: payload,
            names: extractLorebookNames(payload),
        });
    };

    eventSource.on(WORLDINFO_UPDATED_EVENT, handleUpdate);
    return () => {
        if (typeof eventSource.removeListener === 'function') {
            eventSource.removeListener(WORLDINFO_UPDATED_EVENT, handleUpdate);
        }
    };
}

export function subscribeToCharacterContextUpdates(listener) {
    if (typeof listener !== 'function') {
        return null;
    }

    const context = getRawContext();
    const eventSource = context?.eventSource;
    if (!eventSource || typeof eventSource.on !== 'function') {
        return null;
    }

    const eventTypes = context?.eventTypes ?? {};
    const eventNames = uniqueStrings([
        eventTypes.CHAT_CHANGED,
        eventTypes.CHAT_LOADED,
        eventTypes.CHARACTER_PAGE_LOADED,
        eventTypes.CHARACTER_EDITED,
        eventTypes.GROUP_UPDATED,
        eventTypes.WORLDINFO_SETTINGS_UPDATED,
    ]);
    if (eventNames.length === 0) {
        return null;
    }

    const handlers = new Map();
    eventNames.forEach((eventName) => {
        const handler = (...args) => {
            const payload = args.length <= 1 ? args[0] : args;
            listener({
                eventName,
                raw: payload,
            });
        };
        handlers.set(eventName, handler);
        eventSource.on(eventName, handler);
    });

    return () => {
        if (typeof eventSource.removeListener !== 'function') {
            return;
        }

        handlers.forEach((handler, eventName) => {
            eventSource.removeListener(eventName, handler);
        });
    };
}

function findCharacterMatch(characters, directId, directName, avatar) {
    const wantedId = directId ? String(directId) : '';
    const wantedName = directName ? directName.trim().toLowerCase() : '';
    const wantedAvatar = avatar ? String(avatar) : '';

    const character = characters.find((candidate, index) => {
        const candidateId = String(candidate?.id ?? index);
        const candidateName = String(candidate?.name ?? '').trim().toLowerCase();
        const candidateAvatar = String(candidate?.avatar ?? '');

        return (
            (wantedId && candidateId === wantedId)
            || (wantedName && candidateName === wantedName)
            || (wantedAvatar && candidateAvatar === wantedAvatar)
        );
    });

    if (!character) {
        return null;
    }

    return {
        id: String(character.id ?? characters.indexOf(character)),
        name: firstNonEmptyString(character.name, directName, 'Current character'),
        avatar: firstNonEmptyString(character.avatar, avatar),
        fileName: firstNonEmptyString(character.avatar, character.filename),
        primaryLorebookName: firstNonEmptyString(character.data?.extensions?.world),
        rawCharacter: character,
    };
}

function collectLorebookNamesFromCharacters(characters) {
    if (!Array.isArray(characters)) {
        return [];
    }

    return characters
        .map((character) => firstNonEmptyString(character?.data?.extensions?.world))
        .filter(Boolean);
}

function readLinkedLorebookNames(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }

                return firstNonEmptyString(item?.name, item?.world, item?.book);
            })
            .filter(Boolean);
    }

    if (value && typeof value === 'object') {
        return Object.values(value)
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }

                return firstNonEmptyString(item?.name, item?.world, item?.book);
            })
            .filter(Boolean);
    }

    return [];
}

async function fetchLorebookNamesFromSettingsApi() {
    try {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getLorebookRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return readLorebookNameCollection(data?.world_names);
    } catch (error) {
        console.warn('[NoteEditor] Failed to fetch lorebook names from settings API.', error);
        return [];
    }
}

function readLorebookNameCollection(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }

            if (item && typeof item === 'object') {
                return firstNonEmptyString(
                    item.name,
                    item.world,
                    item.worldName,
                    item.lorebook,
                    item.book,
                    item.id,
                    item.value,
                    item.label,
                    item.text,
                );
            }

            return '';
        })
        .filter(Boolean);
}

function readLorebookNameOptions(selector) {
    const select = document.querySelector(selector);
    if (!select) {
        return [];
    }

    return [...select.querySelectorAll('option')]
        .map((option) => firstNonEmptyString(option.textContent, option.label, option.value))
        .filter(Boolean);
}

async function createLorebookFileFallback(name, context = getRawContext()) {
    const saver = [
        context?.saveWorldInfo,
        window.saveWorldInfo,
    ].find((candidate) => typeof candidate === 'function');
    if (!saver) {
        return false;
    }

    const existingNames = await listAvailableLorebookNames();
    const normalizedTargetName = normalizeComparableLorebookName(name);
    const alreadyExists = existingNames.some((candidate) => (
        normalizeComparableLorebookName(candidate) === normalizedTargetName
    ));
    if (alreadyExists) {
        return false;
    }

    await saver(name, { entries: {} }, true);
    await context?.updateWorldInfoList?.();
    invalidateLorebookCache(name);
    return true;
}

function uniqueStrings(values) {
    const seen = new Set();
    return values.filter((value) => {
        const trimmed = firstNonEmptyString(value);
        if (!trimmed || seen.has(trimmed)) {
            return false;
        }

        seen.add(trimmed);
        return true;
    });
}

function firstNonEmptyString(...values) {
    const match = values.find((value) => typeof value === 'string' && value.trim().length > 0);
    return match ? match.trim() : '';
}

function firstMeaningfulString(...values) {
    const match = values.find((value) => {
        if (typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 && !isTemplatePlaceholder(trimmed);
    });

    return match ? match.trim() : '';
}

function normalizeComparableLorebookName(value) {
    return firstNonEmptyString(value).toLocaleLowerCase();
}

function isTemplatePlaceholder(value) {
    return /^\{\{[^}]+\}\}$/.test(value);
}

function clearVisibleToasts() {
    window.toastr?.clear?.();
    document.querySelectorAll('.toast, .toastify, #toast-container .toast').forEach((element) => {
        element.remove();
    });
}

function getLorebookRequestHeaders() {
    const baseHeaders = { 'Content-Type': 'application/json' };
    const requestHeaders = typeof window.getRequestHeaders === 'function'
        ? window.getRequestHeaders()
        : null;

    if (requestHeaders && typeof requestHeaders === 'object' && !Array.isArray(requestHeaders)) {
        return {
            ...requestHeaders,
            ...baseHeaders,
        };
    }

    return baseHeaders;
}

function extractLorebookNames(payload) {
    const names = [];

    collectLorebookNames(payload, names);
    return uniqueStrings(names);
}

function collectLorebookNames(value, names) {
    if (!value) {
        return;
    }

    if (typeof value === 'string') {
        names.push(value);
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectLorebookNames(item, names));
        return;
    }

    if (typeof value !== 'object') {
        return;
    }

    names.push(
        firstNonEmptyString(
            value.name,
            value.world,
            value.worldName,
            value.lorebook,
            value.lorebookId,
            value.file,
            value.id,
        ),
    );

    collectLorebookNames(value.book, names);
    collectLorebookNames(value.books, names);
    collectLorebookNames(value.worldInfo, names);
}
