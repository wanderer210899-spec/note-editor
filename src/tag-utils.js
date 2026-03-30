// src/tag-utils.js
// Responsible for: shared tag parsing helpers used by editing and filtering UI.

// Matches inline tags: #tag or ＃tag (full-width hash for Japanese/CJK keyboards).
// Requires a Unicode letter or digit after the hash, then allows letters, digits,
// combining marks (\p{M}), hyphens, and underscores up to 32 chars total.
const INLINE_TAG_PATTERN = /(^|\s)[#＃]([\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,31})/gu;

// Matches a tag-in-progress immediately before the caret: a hash (or full-width hash)
// followed by a non-whitespace query, anchored to end-of-string so it only fires when
// the caret is inside or at the end of the tag being typed.
const SEARCH_TAG_CONTEXT_PATTERN = /(^|\s)([#＃])([^\s#＃]*)$/u;

export function normalizeForSearch(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\u3000/g, ' ')
        .toLocaleLowerCase();
}

export function normalizeTagForSearch(tag) {
    return normalizeForSearch(String(tag ?? '').trim());
}

export function getInlineTagPattern() {
    return INLINE_TAG_PATTERN;
}

export function extractTagsFromText(content) {
    return [...String(content ?? '').matchAll(getInlineTagPattern())]
        .map((match) => match[2]?.trim() ?? '')
        .filter(Boolean);
}

export function stripInlineTags(content) {
    return String(content ?? '').replace(getInlineTagPattern(), ' ');
}

export function splitSearchTextAndTags(search) {
    const tags = [...new Set(extractTagsFromText(search).map((tag) => normalizeTagForSearch(tag)))];
    const text = normalizeForSearch(stripInlineTags(search)).replace(/\s+/g, ' ').trim();

    return { text, tags };
}

export function getSearchTagContext(search, caretIndex = String(search ?? '').length) {
    const rawSearch = String(search ?? '');
    const clampedCaret = Math.max(0, Math.min(caretIndex, rawSearch.length));
    const prefix = rawSearch.slice(0, clampedCaret);
    const match = prefix.match(SEARCH_TAG_CONTEXT_PATTERN);
    if (!match) {
        return null;
    }

    const separator = match[1] ?? '';
    const hash = match[2] ?? '#';
    const queryBeforeCaret = match[3] ?? '';
    const start = prefix.length - match[0].length + separator.length;
    let end = start + hash.length + queryBeforeCaret.length;

    while (end < rawSearch.length && !/\s/u.test(rawSearch[end]) && rawSearch[end] !== '#' && rawSearch[end] !== '＃') {
        end += 1;
    }

    return {
        start,
        end,
        hash,
        query: rawSearch.slice(start + hash.length, end),
        queryBeforeCaret,
        normalizedQuery: normalizeTagForSearch(queryBeforeCaret),
    };
}
