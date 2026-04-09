// src/integrations/shortcut-utils.js
// Responsible for: parsing user-defined desktop shortcut strings for Note Editor launchers.

const MODIFIER_TOKENS = {
    ctrl: 'ctrl',
    control: 'ctrl',
    alt: 'alt',
    option: 'alt',
    shift: 'shift',
    meta: 'meta',
    cmd: 'meta',
    command: 'meta',
};

export function parseShortcutBinding(binding) {
    const tokens = String(binding ?? '')
        .trim()
        .split('+')
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
    if (tokens.length === 0) {
        return null;
    }

    const parsed = {
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        key: '',
    };

    tokens.forEach((token) => {
        const modifier = MODIFIER_TOKENS[token];
        if (modifier) {
            parsed[modifier] = true;
            return;
        }

        parsed.key = normalizeShortcutKey(token);
    });

    if (!parsed.key || isModifierOnlyKey(parsed.key)) {
        return null;
    }

    return parsed;
}

export function formatShortcutBinding(binding) {
    const parsed = typeof binding === 'string'
        ? parseShortcutBinding(binding)
        : binding;
    if (!parsed?.key || isModifierOnlyKey(parsed.key)) {
        return '';
    }

    const tokens = [];
    if (parsed.ctrl) {
        tokens.push('Ctrl');
    }
    if (parsed.alt) {
        tokens.push('Alt');
    }
    if (parsed.shift) {
        tokens.push('Shift');
    }
    if (parsed.meta) {
        tokens.push('Meta');
    }

    tokens.push(formatShortcutKeyLabel(parsed.key));
    return tokens.join('+');
}

export function createShortcutBindingFromEvent(event) {
    if (!event || event.repeat) {
        return '';
    }

    const key = normalizeShortcutKey(event.key);
    if (!key || isModifierOnlyKey(key)) {
        return '';
    }

    return formatShortcutBinding({
        ctrl: Boolean(event.ctrlKey),
        alt: Boolean(event.altKey),
        shift: Boolean(event.shiftKey),
        meta: Boolean(event.metaKey),
        key,
    });
}

export function isShortcutCaptureExitKey(event) {
    const key = normalizeShortcutKey(event?.key);
    return key === 'enter' || key === 'escape';
}

export function matchesShortcutBinding(event, binding) {
    const parsed = parseShortcutBinding(binding);
    if (!parsed || !event || event.repeat) {
        return false;
    }

    return Boolean(
        event.ctrlKey === parsed.ctrl
        && event.altKey === parsed.alt
        && event.shiftKey === parsed.shift
        && event.metaKey === parsed.meta
        && normalizeShortcutKey(event.key) === parsed.key
    );
}

export function isEditableShortcutTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest([
        'input',
        'textarea',
        'select',
        '[contenteditable=""]',
        '[contenteditable="true"]',
    ].join(', ')));
}

export function isNoteEditorCanvasShortcutTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest('#ne-note-content-input'));
}

function normalizeShortcutKey(value) {
    const token = String(value ?? '').trim().toLowerCase();
    if (!token) {
        return '';
    }

    if (token === ' ') {
        return 'space';
    }

    const aliasMap = {
        esc: 'escape',
        return: 'enter',
        del: 'delete',
        control: 'ctrl',
        plus: '+',
    };
    const aliasedToken = aliasMap[token] ?? token;

    if (aliasedToken.length === 1) {
        return aliasedToken;
    }

    return aliasedToken;
}

function formatShortcutKeyLabel(key) {
    const normalized = normalizeShortcutKey(key);
    if (!normalized) {
        return '';
    }

    if (normalized === 'space') {
        return 'Space';
    }

    return normalized.length === 1
        ? normalized.toUpperCase()
        : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isModifierOnlyKey(key) {
    return key === 'ctrl'
        || key === 'alt'
        || key === 'shift'
        || key === 'meta';
}
