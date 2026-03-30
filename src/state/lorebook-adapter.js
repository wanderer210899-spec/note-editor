// src/state/lorebook-adapter.js
// Responsible for: stable lorebook normalization and prompt-order sidebar metadata.

import { t } from '../i18n/index.js';
import { normalizeForSearch } from '../tag-utils.js';

export const POSITION_META = Object.freeze({
    before_char: { key: 'before_char', value: 0, label: 'Before Character', colorClass: 'ne-lore-position--before-char' },
    after_char: { key: 'after_char', value: 1, label: 'After Character', colorClass: 'ne-lore-position--after-char' },
    authors_note_top: { key: 'authors_note_top', value: 2, label: "Author's Note Top", colorClass: 'ne-lore-position--an-top' },
    authors_note_bottom: { key: 'authors_note_bottom', value: 3, label: "Author's Note Bottom", colorClass: 'ne-lore-position--an-bottom' },
    at_depth: { key: 'at_depth', value: 4, label: 'At Depth', colorClass: 'ne-lore-position--at-depth' },
    example_messages_top: { key: 'example_messages_top', value: 5, label: 'Example Messages Top', colorClass: 'ne-lore-position--examples' },
    example_messages_bottom: { key: 'example_messages_bottom', value: 6, label: 'Example Messages Bottom', colorClass: 'ne-lore-position--examples' },
    outlet: { key: 'outlet', value: 7, label: 'Prompt Outlet', colorClass: 'ne-lore-position--outlet' },
    other: { key: 'other', value: -1, label: 'Other', colorClass: 'ne-lore-position--other' },
});

export const POSITION_ORDER = Object.freeze([
    POSITION_META.before_char.key,
    POSITION_META.after_char.key,
    POSITION_META.authors_note_top.key,
    POSITION_META.authors_note_bottom.key,
    POSITION_META.at_depth.key,
    POSITION_META.example_messages_top.key,
    POSITION_META.example_messages_bottom.key,
    POSITION_META.outlet.key,
    POSITION_META.other.key,
]);

const POSITION_KEY_BY_VALUE = new Map([
    [0, POSITION_META.before_char.key],
    [1, POSITION_META.after_char.key],
    [2, POSITION_META.authors_note_top.key],
    [3, POSITION_META.authors_note_bottom.key],
    [4, POSITION_META.at_depth.key],
    [5, POSITION_META.example_messages_top.key],
    [6, POSITION_META.example_messages_bottom.key],
    [7, POSITION_META.outlet.key],
]);

const CYCLABLE_POSITION_VALUES = POSITION_ORDER
    .map((key) => POSITION_META[key]?.value)
    .filter((value) => Number.isInteger(value) && value >= 0);

export function normalizeLorePosition(positionValue) {
    return POSITION_KEY_BY_VALUE.get(Number(positionValue)) ?? POSITION_META.other.key;
}

export function getLorePositionMeta(positionKey) {
    const meta = POSITION_META[positionKey] ?? POSITION_META.other;
    return {
        ...meta,
        label: getLorePositionLabel(meta.key),
    };
}

export function getLorePositionLabel(positionKey) {
    const meta = POSITION_META[positionKey] ?? POSITION_META.other;
    const translationKey = `position.${meta.key}`;
    const translatedLabel = t(translationKey);
    return translatedLabel === translationKey ? meta.label : translatedLabel;
}

export function getNextLorePositionValue(currentPositionValue) {
    const currentValue = Number(currentPositionValue);
    const currentIndex = CYCLABLE_POSITION_VALUES.indexOf(Number.isInteger(currentValue) ? currentValue : 0);
    return CYCLABLE_POSITION_VALUES[(currentIndex + 1 + CYCLABLE_POSITION_VALUES.length) % CYCLABLE_POSITION_VALUES.length];
}

export function normalizeLorebookEntry(rawEntry) {
    const id = String(rawEntry?.uid ?? '');
    const title = String(rawEntry?.comment ?? '').trim();
    const content = String(rawEntry?.content ?? '');
    const primaryKeywords = asStringArray(rawEntry?.key);
    const secondaryKeywords = asStringArray(rawEntry?.keysecondary);
    const normalizedPrimaryKeywords = primaryKeywords.map((keyword) => normalizeForSearch(keyword)).filter(Boolean);
    const normalizedSecondaryKeywords = secondaryKeywords.map((keyword) => normalizeForSearch(keyword)).filter(Boolean);
    const positionKey = normalizeLorePosition(rawEntry?.position);
    const uidNumber = Number(id);

    return {
        id,
        uidNumber: Number.isFinite(uidNumber) ? uidNumber : null,
        title,
        content,
        enabled: !Boolean(rawEntry?.disable),
        activationMode: getActivationMode(rawEntry),
        positionKey,
        positionValue: Number.isInteger(Number(rawEntry?.position)) ? Number(rawEntry.position) : POSITION_META.other.value,
        order: Number.isFinite(Number(rawEntry?.order)) ? Number(rawEntry.order) : 0,
        displayIndex: Number.isFinite(Number(rawEntry?.displayIndex)) ? Number(rawEntry.displayIndex) : Number.MAX_SAFE_INTEGER,
        primaryKeywords,
        secondaryKeywords,
        normalizedKeywords: [...normalizedPrimaryKeywords, ...normalizedSecondaryKeywords],
        searchText: normalizeForSearch([
            title,
            ...primaryKeywords,
            ...secondaryKeywords,
        ].join(' ')),
        nativeTraits: {
            group: rawEntry?.group ?? null,
            groupOverride: rawEntry?.groupOverride ?? null,
            groupWeight: rawEntry?.groupWeight ?? null,
            sticky: rawEntry?.sticky ?? null,
            cooldown: rawEntry?.cooldown ?? null,
            delay: rawEntry?.delay ?? null,
            probability: rawEntry?.probability ?? null,
            useProbability: rawEntry?.useProbability ?? null,
            excludeRecursion: rawEntry?.excludeRecursion ?? null,
            preventRecursion: rawEntry?.preventRecursion ?? null,
            weight: rawEntry?.weight ?? null,
            depth: rawEntry?.depth ?? null,
            role: rawEntry?.role ?? null,
            outlet: rawEntry?.outlet ?? rawEntry?.outletName ?? null,
            selective: rawEntry?.selective ?? null,
        },
    };
}

export function buildPromptSummaryRows(lorebookId, normalizedEntriesById = {}) {
    const buckets = new Map(POSITION_ORDER.map((positionKey) => [positionKey, []]));

    Object.values(normalizedEntriesById).forEach((entry) => {
        const bucket = buckets.get(entry.positionKey) ?? buckets.get(POSITION_META.other.key);
        bucket?.push(entry);
    });

    const rows = [];
    let promptOrderIndex = 0;

    POSITION_ORDER.forEach((positionKey) => {
        const traversalOrder = (buckets.get(positionKey) ?? []).slice().sort(compareTraversalOrder);
        const promptOrder = traversalOrder.reverse();

        promptOrder.forEach((entry, sectionPromptIndex) => {
            rows.push({
                id: entry.id,
                lorebookId,
                title: entry.title,
                enabled: entry.enabled,
                activationMode: entry.activationMode,
                positionValue: entry.positionValue,
                positionKey: entry.positionKey,
                primaryKeywords: entry.primaryKeywords,
                secondaryKeywords: entry.secondaryKeywords,
                normalizedKeywords: entry.normalizedKeywords,
                order: entry.order,
                displayIndex: entry.displayIndex,
                promptOrderIndex,
                sectionPromptIndex,
                nativeTraits: entry.nativeTraits,
                searchText: entry.searchText,
            });
            promptOrderIndex += 1;
        });
    });

    return rows;
}

export function getPromptSortedEntryIds(normalizedEntriesById = {}) {
    return buildPromptSummaryRows('', normalizedEntriesById).map((entry) => entry.id);
}

function compareTraversalOrder(left, right) {
    if (left.order !== right.order) {
        return right.order - left.order;
    }

    if (left.uidNumber !== null && right.uidNumber !== null && left.uidNumber !== right.uidNumber) {
        return left.uidNumber - right.uidNumber;
    }

    if (left.uidNumber !== null && right.uidNumber === null) {
        return -1;
    }

    if (left.uidNumber === null && right.uidNumber !== null) {
        return 1;
    }

    return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' });
}

function getActivationMode(entry) {
    if (entry?.vectorized) {
        return 'vectorized';
    }

    return entry?.constant ? 'constant' : 'keyword';
}

function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
}
