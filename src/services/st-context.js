// src/services/st-context.js
// Responsible for: the single SillyTavern integration gateway used by the plugin.

const WORLDINFO_UPDATED_EVENT = 'worldinfo_updated';
const WORLDINFO_MODULE_PATH = '/scripts/world-info.js';
const WORLDINFO_GET_URL = '/api/worldinfo/get';
const SETTINGS_GET_URL = '/api/settings/get';
const WORLDINFO_HEADER_ROW_SELECTOR = '#WorldInfo .flex-container.alignitemscenter.gap10px';
const EXTENSIONS_MENU_SELECTOR = '#extensionsMenu';
const SLASH_COMMAND_NAME_PATTERN = /^[a-z0-9_-]+$/i;
const QUICK_REPLY_ATTACH_SCOPE_GLOBAL = 'global';
const QUICK_REPLY_ATTACH_SCOPE_CHAT = 'chat';
const QUICK_REPLY_ATTACH_SCOPE_ALL = 'all';

const WORLDINFO_CAPABILITIES = {
    load: {
        contextNames: ['loadWorldInfo'],
        windowNames: ['loadWorldInfo'],
        moduleNames: ['loadWorldInfo'],
    },
    save: {
        contextNames: ['saveWorldInfo'],
        windowNames: ['saveWorldInfo'],
        moduleNames: ['saveWorldInfo'],
    },
    create: {
        contextNames: ['createNewWorldInfo'],
        windowNames: ['createNewWorldInfo'],
        moduleNames: ['createNewWorldInfo'],
    },
    delete: {
        contextNames: ['deleteWorldInfo'],
        windowNames: ['deleteWorldInfo'],
        moduleNames: ['deleteWorldInfo'],
    },
    reloadEditor: {
        contextNames: ['reloadWorldInfoEditor'],
        windowNames: ['reloadWorldInfoEditor'],
        moduleNames: ['reloadEditor'],
    },
    updateList: {
        contextNames: ['updateWorldInfoList'],
        windowNames: ['updateWorldInfoList'],
        moduleNames: ['updateWorldInfoList'],
    },
    createEntry: {
        contextNames: ['createWorldInfoEntry'],
        windowNames: ['createWorldInfoEntry'],
        moduleNames: ['createWorldInfoEntry'],
    },
    updateCharacterPrimary: {
        contextNames: ['charUpdatePrimaryWorld'],
        windowNames: ['charUpdatePrimaryWorld'],
        moduleNames: ['charUpdatePrimaryWorld'],
    },
    updateCharacterAuxiliary: {
        contextNames: ['charSetAuxWorlds'],
        windowNames: ['charSetAuxWorlds'],
        moduleNames: ['charSetAuxWorlds'],
    },
};

let cachedWorldInfoModule = null;
let worldInfoModulePromise = null;
const registeredSlashCommands = new Map();

function getRawContext() {
    return window.SillyTavern?.getContext?.() ?? null;
}

export function flushExtensionSettings() {
    const saver = getRawContext()?.saveSettingsDebounced;
    if (typeof saver !== 'function') {
        return false;
    }

    saver();
    return true;
}

export function readExtensionSetting(key) {
    const trimmedKey = firstNonEmptyString(key);
    if (!trimmedKey) {
        return null;
    }

    const extensionSettings = getRawContext()?.extensionSettings;
    if (!extensionSettings || typeof extensionSettings !== 'object') {
        return null;
    }

    return extensionSettings[trimmedKey] ?? null;
}

export function writeExtensionSetting(key, value) {
    const trimmedKey = firstNonEmptyString(key);
    if (!trimmedKey) {
        return false;
    }

    const context = getRawContext();
    if (!context) {
        return false;
    }

    context.extensionSettings ??= {};
    context.extensionSettings[trimmedKey] = value;
    return true;
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
        context.name2,
    );
    const directId = firstNonEmptyString(
        context.characterId,
        context.character_id,
        context.chatMetadata?.character_id,
        context.chat_metadata?.character_id,
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
    await invokeWorldInfoCapability('updateList', {
        silentMissing: true,
        silentFailure: true,
    });

    const settingsLorebookNames = await fetchLorebookNamesFromSettingsApi();
    const context = getRawContext();

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
        activeCharacter?.primaryLorebookName,
    );
    const fileName = firstNonEmptyString(activeCharacter?.fileName, activeCharacter?.avatar);
    const charLoreValue = fileName ? findCharacterLoreRecord(worldInfoState?.charLore, fileName) : null;

    return {
        character: activeCharacter,
        primaryName,
        linkedNames: uniqueStrings(readLinkedLorebookNames(charLoreValue)),
    };
}

export async function replaceActiveCharacterLorebookLink(oldName, newName) {
    const trimmedOldName = firstNonEmptyString(oldName);
    const trimmedNewName = firstNonEmptyString(newName);
    if (!trimmedOldName || !trimmedNewName || trimmedOldName === trimmedNewName) {
        return { ok: false, changed: false, reason: 'invalid' };
    }

    const linkedState = resolveActiveCharacterLorebookLinks();
    const fileName = firstNonEmptyString(linkedState.character?.fileName, linkedState.character?.avatar);
    const primaryMatches = linkedState.primaryName === trimmedOldName;
    const nextLinkedNames = (Array.isArray(linkedState.linkedNames) ? linkedState.linkedNames : [])
        .map((name) => (name === trimmedOldName ? trimmedNewName : name));
    const linkedMatches = nextLinkedNames.some((name, index) => name !== linkedState.linkedNames[index]);

    if (!primaryMatches && !linkedMatches) {
        return { ok: true, changed: false, reason: null };
    }

    if (primaryMatches) {
        const primaryResult = await invokeWorldInfoCapability('updateCharacterPrimary', {
            args: [trimmedNewName],
            failureMessage: 'Failed to update the active character primary lorebook link.',
            silentMissing: true,
        });
        if (!primaryResult.ok) {
            return { ok: false, changed: false, reason: 'primary-link' };
        }
    }

    if (linkedMatches) {
        if (!fileName) {
            return { ok: false, changed: primaryMatches, reason: 'missing-character-file' };
        }

        const auxiliaryResult = await invokeWorldInfoCapability('updateCharacterAuxiliary', {
            args: [fileName, uniqueStrings(nextLinkedNames)],
            failureMessage: 'Failed to update the active character auxiliary lorebook links.',
            silentMissing: true,
        });
        if (!auxiliaryResult.ok) {
            return { ok: false, changed: primaryMatches, reason: 'auxiliary-link' };
        }
    }

    flushExtensionSettings();
    return { ok: true, changed: true, reason: null };
}

export async function loadLorebookByName(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return null;
    }

    const result = await invokeWorldInfoCapability('load', {
        args: [trimmedName],
        missingMessage: 'Could not load lorebook: no compatible loadWorldInfo function is available.',
        failureMessage: 'Failed to load lorebook.',
        silentMissing: true,
    });
    if (!result.ok) {
        return null;
    }

    return normalizeLorebookPayload(result.value);
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

    try {
        const loaded = await postJson(WORLDINFO_GET_URL, { name: trimmedName }, { cache: 'no-cache' });
        return normalizeLorebookPayload(loaded);
    } catch (error) {
        console.warn('[NoteEditor] Failed to load fresh lorebook data.', error);
        return null;
    }
}

export async function saveLorebookByName(name, data, { immediately = false, refreshEditor = false } = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const result = await invokeWorldInfoCapability('save', {
        args: [trimmedName, data, Boolean(immediately)],
        missingMessage: 'Could not save lorebook: no compatible saveWorldInfo function is available.',
        failureMessage: 'Failed to save lorebook.',
    });
    if (!result.ok) {
        return false;
    }

    if (refreshEditor) {
        await syncLorebookEditor(trimmedName);
    }

    return true;
}

export async function deleteLorebookFile(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const result = await invokeWorldInfoCapability('delete', {
        args: [trimmedName],
        missingMessage: 'Could not delete lorebook file: no compatible deleteWorldInfo function is available.',
        failureMessage: 'Failed to delete lorebook file.',
    });
    return result.ok;
}

export async function createLorebookFile(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const result = await invokeWorldInfoCapability('create', {
        args: [trimmedName, { interactive: false }],
        missingMessage: 'Could not create lorebook file: no compatible createNewWorldInfo function is available.',
        failureMessage: 'Failed to create lorebook file.',
        silentMissing: true,
    });
    if (result.ok) {
        return true;
    }

    if (result.reason !== 'missing') {
        return false;
    }

    const created = await createLorebookFileFallback(trimmedName);
    if (!created) {
        console.warn('[NoteEditor] Could not create lorebook file: createNewWorldInfo is unavailable and the saveWorldInfo fallback could not create a new file.');
        return false;
    }

    return true;
}

export function createNativeLorebookEntry(name, data) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName || !data || typeof data !== 'object') {
        return null;
    }

    const resolved = resolveWorldInfoCapabilitySync('createEntry');
    if (!resolved) {
        return null;
    }

    try {
        const created = resolved.fn(trimmedName, data);
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
        await syncLorebookEditor(trimmedName);
    }
    return loaded;
}

export async function syncLorebookEditor(name, { loadIfNotSelected = false } = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const result = await invokeWorldInfoCapability('reloadEditor', {
        args: [trimmedName, Boolean(loadIfNotSelected)],
        missingMessage: 'Could not refresh the lorebook editor: no compatible reload function is available.',
        failureMessage: 'Lorebook editor refresh failed.',
        silentMissing: true,
    });
    return result.ok;
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

export function getExtensionsMenuElement() {
    return document.querySelector(EXTENSIONS_MENU_SELECTOR);
}

export function getWorldInfoHeaderRowElement() {
    return document.querySelector(WORLDINFO_HEADER_ROW_SELECTOR);
}

export function observeWorldInfoMutations(listener) {
    if (
        typeof listener !== 'function'
        || typeof MutationObserver !== 'function'
        || typeof requestAnimationFrame !== 'function'
    ) {
        return null;
    }

    const documentBody = document.body;
    if (!documentBody) {
        return null;
    }

    let frameHandle = 0;
    let observedPanel = null;
    let disposed = false;

    const emit = () => {
        if (disposed || frameHandle) {
            return;
        }

        frameHandle = requestAnimationFrame(() => {
            frameHandle = 0;
            if (disposed) {
                return;
            }

            syncPanelObserver();
            listener(getWorldInfoHeaderRowElement());
        });
    };

    const panelObserver = new MutationObserver(() => {
        emit();
    });

    function syncPanelObserver() {
        const nextPanel = document.getElementById('WorldInfo');
        if (nextPanel === observedPanel) {
            return;
        }

        panelObserver.disconnect();
        observedPanel = nextPanel instanceof HTMLElement ? nextPanel : null;
        if (!observedPanel) {
            return;
        }

        panelObserver.observe(observedPanel, {
            childList: true,
            subtree: true,
        });
    }

    const bodyObserver = new MutationObserver(() => {
        emit();
    });

    bodyObserver.observe(documentBody, {
        childList: true,
        subtree: true,
    });

    emit();
    return () => {
        disposed = true;
        if (frameHandle) {
            cancelAnimationFrame(frameHandle);
            frameHandle = 0;
        }
        bodyObserver.disconnect();
        panelObserver.disconnect();
    };
}

export function registerPluginSlashCommand({
    name,
    callback,
    aliases = [],
    helpString = '',
    hidden = false,
} = {}) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName || !SLASH_COMMAND_NAME_PATTERN.test(trimmedName) || typeof callback !== 'function') {
        return false;
    }

    const parser = getRawContext()?.SlashCommandParser;
    const SlashCommand = getRawContext()?.SlashCommand;
    if (!parser || typeof parser.addCommandObject !== 'function' || !SlashCommand?.fromProps) {
        return false;
    }

    const normalizedAliases = Array.isArray(aliases)
        ? aliases
            .map((alias) => firstNonEmptyString(alias))
            .filter((alias) => alias && alias !== trimmedName)
        : [];

    const existing = getSlashCommandRecord(trimmedName);
    if (existing && !registeredSlashCommands.has(trimmedName)) {
        console.warn(`[NoteEditor] Could not register /${trimmedName}: another command already owns that name.`);
        return false;
    }

    unregisterPluginSlashCommand(trimmedName);

    const wrappedCallback = async (args = {}, value = '') => {
        const result = await callback({
            namedArgs: args ?? {},
            unnamedArgs: typeof value === 'string' ? value : String(value ?? ''),
            value,
        });
        return typeof result === 'string' ? result : '';
    };

    const commandObject = SlashCommand.fromProps({
        name: trimmedName,
        callback: wrappedCallback,
        aliases: normalizedAliases,
        helpString,
        interruptsGeneration: false,
        purgeFromMessage: true,
        unnamedArgumentList: [],
        namedArgumentList: [],
        isHidden: Boolean(hidden),
    });

    parser.addCommandObject(commandObject);
    registeredSlashCommands.set(trimmedName, {
        commandObject,
        aliases: normalizedAliases,
    });
    return true;
}

export function unregisterPluginSlashCommand(name) {
    const trimmedName = firstNonEmptyString(name);
    if (!trimmedName) {
        return false;
    }

    const managedRecord = registeredSlashCommands.get(trimmedName);
    if (!managedRecord?.commandObject) {
        return false;
    }

    const parser = getRawContext()?.SlashCommandParser;
    if (!parser?.commands) {
        registeredSlashCommands.delete(trimmedName);
        return false;
    }

    const currentRecord = getSlashCommandRecord(trimmedName);
    if (currentRecord && currentRecord !== managedRecord.commandObject) {
        registeredSlashCommands.delete(trimmedName);
        return false;
    }

    deleteSlashCommandKey(parser.commands, trimmedName);
    managedRecord.aliases.forEach((alias) => {
        deleteSlashCommandKey(parser.commands, alias);
    });

    registeredSlashCommands.delete(trimmedName);
    return true;
}

export function hasQuickReplyApi() {
    return Boolean(getQuickReplyApi());
}

export function ensureQuickReplySetExists(name, options = {}) {
    const api = getQuickReplyApi();
    const trimmedName = firstNonEmptyString(name);
    if (!api || !trimmedName) {
        return null;
    }

    const existingSet = api.getSetByName?.(trimmedName);
    if (existingSet) {
        return existingSet;
    }

    return api.createSet?.(trimmedName, {
        disableSend: Boolean(options.disableSend),
        placeBeforeInput: Boolean(options.placeBeforeInput),
        injectInput: Boolean(options.injectInput),
    }) ?? null;
}

export function listQuickReplyButtons(setName) {
    const set = getQuickReplySet(setName);
    if (!set || !Array.isArray(set.qrList)) {
        return [];
    }

    return set.qrList.map((item) => ({
        id: item?.id,
        label: firstNonEmptyString(item?.label),
        automationId: firstNonEmptyString(item?.automationId),
    }));
}

export function ensureQuickReplyButton(setName, {
    label,
    automationId,
    message,
    title = '',
    icon = '',
    showLabel = true,
} = {}) {
    const api = getQuickReplyApi();
    const set = getQuickReplySet(setName);
    const trimmedLabel = firstNonEmptyString(label);
    const trimmedAutomationId = firstNonEmptyString(automationId);
    if (!api || !set || !trimmedLabel || !trimmedAutomationId || !firstNonEmptyString(message)) {
        return null;
    }

    const existing = findQuickReplyByAutomationId(set, trimmedAutomationId);
    if (existing) {
        if (doesQuickReplyMatch(existing, {
            label: trimmedLabel,
            automationId: trimmedAutomationId,
            message,
            title,
            icon,
            showLabel,
        })) {
            return existing;
        }

        if (typeof api.deleteQuickReply === 'function') {
            api.deleteQuickReply(set.name, existing.label);
        } else if (typeof existing.delete === 'function') {
            existing.delete();
        } else {
            return existing;
        }
    }

    return api.createQuickReply?.(set.name, trimmedLabel, {
        message,
        title,
        icon,
        showLabel: Boolean(showLabel),
        automationId: trimmedAutomationId,
    }) ?? null;
}

export function removeQuickReplyButtonByAutomationId(setName, automationId) {
    const api = getQuickReplyApi();
    const set = getQuickReplySet(setName);
    const trimmedAutomationId = firstNonEmptyString(automationId);
    if (!api || !set || !trimmedAutomationId) {
        return false;
    }

    const existing = findQuickReplyByAutomationId(set, trimmedAutomationId);
    if (!existing) {
        return false;
    }

    if (typeof api.deleteQuickReply === 'function') {
        api.deleteQuickReply(set.name, existing.label);
        return true;
    }

    if (typeof existing.delete === 'function') {
        existing.delete();
        return true;
    }

    return false;
}

export function attachQuickReplySet(setName, scope) {
    const api = getQuickReplyApi();
    const set = getQuickReplySet(setName);
    const normalizedScope = normalizeQuickReplyAttachScope(scope);
    if (!api || !set || normalizedScope === QUICK_REPLY_ATTACH_SCOPE_ALL) {
        return false;
    }

    if (normalizedScope === QUICK_REPLY_ATTACH_SCOPE_GLOBAL) {
        const listedSets = api.listGlobalSets?.();
        const attachedSets = Array.isArray(listedSets) ? listedSets : [];
        if (!attachedSets.includes(set.name)) {
            api.addGlobalSet?.(set.name);
        }
        return true;
    }

    if (normalizedScope === QUICK_REPLY_ATTACH_SCOPE_CHAT) {
        const listedSets = api.listChatSets?.();
        const attachedSets = Array.isArray(listedSets) ? listedSets : [];
        if (!attachedSets.includes(set.name)) {
            api.addChatSet?.(set.name);
        }
        return true;
    }

    return false;
}

export function detachQuickReplySet(setName, scope = QUICK_REPLY_ATTACH_SCOPE_ALL) {
    const api = getQuickReplyApi();
    const set = getQuickReplySet(setName);
    const normalizedScope = normalizeQuickReplyAttachScope(scope);
    if (!api || !set) {
        return false;
    }

    let changed = false;
    if (
        normalizedScope === QUICK_REPLY_ATTACH_SCOPE_ALL
        || normalizedScope === QUICK_REPLY_ATTACH_SCOPE_GLOBAL
    ) {
        const listedSets = api.listGlobalSets?.();
        const attachedSets = Array.isArray(listedSets) ? listedSets : [];
        if (attachedSets.includes(set.name)) {
            api.removeGlobalSet?.(set.name);
            changed = true;
        }
    }

    if (
        normalizedScope === QUICK_REPLY_ATTACH_SCOPE_ALL
        || normalizedScope === QUICK_REPLY_ATTACH_SCOPE_CHAT
    ) {
        const listedSets = api.listChatSets?.();
        const attachedSets = Array.isArray(listedSets) ? listedSets : [];
        if (attachedSets.includes(set.name)) {
            api.removeChatSet?.(set.name);
            changed = true;
        }
    }

    return changed;
}

async function invokeWorldInfoCapability(capabilityName, {
    args = [],
    missingMessage = '',
    failureMessage = '',
    silentMissing = false,
    silentFailure = false,
} = {}) {
    const resolved = await resolveWorldInfoCapability(capabilityName);
    if (!resolved) {
        if (!silentMissing && missingMessage) {
            console.warn(`[NoteEditor] ${missingMessage}`);
        }

        return {
            ok: false,
            reason: 'missing',
            source: null,
            value: undefined,
        };
    }

    try {
        return {
            ok: true,
            reason: null,
            source: resolved.source,
            value: await resolved.fn(...args),
        };
    } catch (error) {
        if (!silentFailure && failureMessage) {
            console.warn(`[NoteEditor] ${failureMessage}`, error);
        }

        return {
            ok: false,
            reason: 'error',
            source: resolved.source,
            value: undefined,
        };
    }
}

async function resolveWorldInfoCapability(capabilityName) {
    const resolved = resolveWorldInfoCapabilitySync(capabilityName);
    if (resolved) {
        return resolved;
    }

    const config = WORLDINFO_CAPABILITIES[capabilityName];
    if (!config?.moduleNames?.length) {
        return null;
    }

    try {
        const module = await getWorldInfoModule();
        const fn = resolveFunctionByName(module, config.moduleNames);
        if (!fn) {
            return null;
        }

        return {
            source: 'module',
            fn,
        };
    } catch {
        return null;
    }
}

function resolveWorldInfoCapabilitySync(capabilityName) {
    const config = WORLDINFO_CAPABILITIES[capabilityName];
    if (!config) {
        return null;
    }

    const context = getRawContext();
    const contextFn = resolveFunctionByName(context, config.contextNames);
    if (contextFn) {
        return {
            source: 'context',
            fn: contextFn,
        };
    }

    const windowFn = resolveFunctionByName(window, config.windowNames);
    if (windowFn) {
        return {
            source: 'window',
            fn: windowFn,
        };
    }

    const moduleFn = resolveFunctionByName(cachedWorldInfoModule, config.moduleNames);
    if (moduleFn) {
        return {
            source: 'module',
            fn: moduleFn,
        };
    }

    return null;
}

function getSlashCommandRecord(name) {
    const parser = getRawContext()?.SlashCommandParser;
    const commands = parser?.commands;
    if (!commands) {
        return null;
    }

    if (commands instanceof Map) {
        return commands.get(name) ?? null;
    }

    if (typeof commands === 'object') {
        return commands[name] ?? null;
    }

    return null;
}

function deleteSlashCommandKey(commands, name) {
    if (!commands || !name) {
        return;
    }

    if (commands instanceof Map) {
        commands.delete(name);
        return;
    }

    if (typeof commands === 'object') {
        delete commands[name];
    }
}

function getQuickReplyApi() {
    return window.quickReplyApi && typeof window.quickReplyApi === 'object'
        ? window.quickReplyApi
        : null;
}

function getQuickReplySet(name) {
    const api = getQuickReplyApi();
    const trimmedName = firstNonEmptyString(name);
    if (!api || !trimmedName) {
        return null;
    }

    return api.getSetByName?.(trimmedName) ?? null;
}

function findQuickReplyByAutomationId(set, automationId) {
    if (!set || !Array.isArray(set.qrList)) {
        return null;
    }

    return set.qrList.find((item) => firstNonEmptyString(item?.automationId) === automationId) ?? null;
}

function doesQuickReplyMatch(item, {
    label,
    automationId,
    message,
    title,
    icon,
    showLabel,
} = {}) {
    return firstNonEmptyString(item?.label) === firstNonEmptyString(label)
        && firstNonEmptyString(item?.automationId) === firstNonEmptyString(automationId)
        && firstNonEmptyString(item?.message) === firstNonEmptyString(message)
        && firstNonEmptyString(item?.title) === firstNonEmptyString(title)
        && firstNonEmptyString(item?.icon) === firstNonEmptyString(icon)
        && Boolean(item?.showLabel) === Boolean(showLabel);
}

function normalizeQuickReplyAttachScope(scope) {
    const trimmedScope = firstNonEmptyString(scope);
    if (trimmedScope === QUICK_REPLY_ATTACH_SCOPE_GLOBAL) {
        return QUICK_REPLY_ATTACH_SCOPE_GLOBAL;
    }

    if (trimmedScope === QUICK_REPLY_ATTACH_SCOPE_CHAT) {
        return QUICK_REPLY_ATTACH_SCOPE_CHAT;
    }

    return QUICK_REPLY_ATTACH_SCOPE_ALL;
}

function resolveFunctionByName(target, names) {
    if (!target || typeof target !== 'object' || !Array.isArray(names)) {
        return null;
    }

    for (const name of names) {
        if (typeof target[name] === 'function') {
            return target[name].bind(target);
        }
    }

    return null;
}

async function getWorldInfoModule() {
    if (cachedWorldInfoModule) {
        return cachedWorldInfoModule;
    }

    if (!worldInfoModulePromise) {
        worldInfoModulePromise = import(WORLDINFO_MODULE_PATH)
            .then((module) => {
                cachedWorldInfoModule = module;
                return module;
            })
            .catch((error) => {
                worldInfoModulePromise = null;
                throw error;
            });
    }

    return worldInfoModulePromise;
}

function normalizeLorebookPayload(value) {
    return value && typeof value === 'object'
        ? value
        : { entries: {} };
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
    if (!value) {
        return [];
    }

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
        if (Array.isArray(value.extraBooks)) {
            return value.extraBooks
                .map((item) => firstNonEmptyString(item?.name, item?.world, item?.book, item))
                .filter(Boolean);
        }

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

function findCharacterLoreRecord(charLore, fileName) {
    if (!charLore || !fileName) {
        return null;
    }

    if (Array.isArray(charLore)) {
        return charLore.find((entry) => (
            firstNonEmptyString(entry?.name, entry?.fileName, entry?.avatar) === fileName
        )) ?? null;
    }

    if (charLore && typeof charLore === 'object') {
        return charLore[fileName] ?? null;
    }

    return null;
}

async function fetchLorebookNamesFromSettingsApi() {
    try {
        const data = await postJson(SETTINGS_GET_URL, {});
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

async function createLorebookFileFallback(name) {
    const existingNames = await listAvailableLorebookNames();
    const normalizedTargetName = normalizeComparableLorebookName(name);
    const alreadyExists = existingNames.some((candidate) => (
        normalizeComparableLorebookName(candidate) === normalizedTargetName
    ));
    if (alreadyExists) {
        return false;
    }

    const saved = await invokeWorldInfoCapability('save', {
        args: [name, { entries: {} }, true],
        silentMissing: true,
        silentFailure: true,
    });
    if (!saved.ok) {
        return false;
    }

    await invokeWorldInfoCapability('updateList', {
        silentMissing: true,
        silentFailure: true,
    });
    invalidateLorebookCache(name);
    return true;
}

async function postJson(url, body, init = {}) {
    const response = await fetch(url, {
        ...init,
        method: 'POST',
        headers: getLorebookRequestHeaders(),
        body: JSON.stringify(body ?? {}),
    });

    if (!response.ok) {
        throw new Error(`Request failed: ${url} (${response.status})`);
    }

    return response.json();
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
