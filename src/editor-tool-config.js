// src/editor-tool-config.js
// Responsible for: the stable format-bar tool registry shared by settings and editor UI.

import { escapeHtml } from './util.js';

export const EDITOR_MODE_HYBRID = 'hybrid';
export const EDITOR_MODE_PREVIEW = 'editor-preview';

export const FORMAT_BAR_TOOL_DEFINITIONS = [
    {
        id: 'bold',
        labelKey: 'editorShell.format.bold',
        iconClass: '',
        text: 'B',
        html: '<strong>B</strong>',
    },
    {
        id: 'italic',
        labelKey: 'editorShell.format.italic',
        iconClass: '',
        text: 'I',
        html: '<em>I</em>',
    },
    {
        id: 'heading',
        labelKey: 'editorShell.format.heading',
        iconClass: '',
        text: 'H',
    },
    {
        id: 'quote',
        labelKey: 'editorShell.format.quote',
        iconClass: 'fa-quote-left',
        text: '',
    },
    {
        id: 'unordered',
        labelKey: 'editorShell.format.unordered',
        iconClass: 'fa-list-ul',
        text: '',
    },
    {
        id: 'ordered',
        labelKey: 'editorShell.format.ordered',
        iconClass: 'fa-list-ol',
        text: '',
    },
    {
        id: 'checkbox',
        labelKey: 'editorShell.format.checkbox',
        iconClass: 'fa-square-check',
        text: '',
    },
    {
        id: 'xmlPair',
        labelKey: 'editorShell.format.xmlPair',
        iconClass: '',
        text: '<>',
    },
    {
        id: 'hash',
        labelKey: 'editorShell.format.hash',
        iconClass: '',
        text: '#',
    },
    {
        id: 'copyPlain',
        labelKey: 'editorShell.format.copyPlain',
        iconClass: 'fa-copy',
        text: '',
    },
    {
        id: 'indent',
        labelKey: 'editorShell.format.indent',
        iconClass: 'fa-indent',
        text: '',
    },
    {
        id: 'outdent',
        labelKey: 'editorShell.format.outdent',
        iconClass: 'fa-outdent',
        text: '',
    },
    {
        id: 'clear',
        labelKey: 'editorShell.format.clear',
        shortLabelKey: 'editorShell.format.clearShort',
        iconClass: '',
        text: 'Clear',
    },
    {
        id: 'undo',
        labelKey: 'editorShell.format.undo',
        iconClass: 'fa-rotate-left',
        text: '',
    },
    {
        id: 'redo',
        labelKey: 'editorShell.format.redo',
        iconClass: 'fa-rotate-right',
        text: '',
    },
];

export const DEFAULT_FORMAT_BAR_TOOLS = FORMAT_BAR_TOOL_DEFINITIONS.map((tool) => tool.id);

const FORMAT_BAR_TOOL_DEFINITION_BY_ID = new Map(
    FORMAT_BAR_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
);

export function createDefaultFormatBarTools() {
    return DEFAULT_FORMAT_BAR_TOOLS.map((id) => ({
        id,
        visible: true,
    }));
}

export function getFormatBarToolDefinition(toolId) {
    const normalizedToolId = String(toolId ?? '').trim();
    return FORMAT_BAR_TOOL_DEFINITION_BY_ID.get(normalizedToolId) ?? null;
}

export function normalizeFormatBarTools(value) {
    const requestedTools = Array.isArray(value) ? value : [];
    if (requestedTools.length === 0) {
        return createDefaultFormatBarTools();
    }

    const allStringEntries = requestedTools.every((item) => typeof item === 'string');
    if (allStringEntries) {
        return normalizeLegacyFormatBarTools(requestedTools);
    }

    const normalizedTools = [];
    const seen = new Set();

    requestedTools.forEach((rawTool) => {
        const normalizedTool = normalizeFormatBarToolItem(rawTool);
        if (!normalizedTool || seen.has(normalizedTool.id)) {
            return;
        }

        seen.add(normalizedTool.id);
        normalizedTools.push(normalizedTool);
    });

    DEFAULT_FORMAT_BAR_TOOLS.forEach((toolId) => {
        if (seen.has(toolId)) {
            return;
        }

        normalizedTools.push({
            id: toolId,
            visible: true,
        });
    });

    return normalizedTools.length > 0 ? normalizedTools : createDefaultFormatBarTools();
}

export function getVisibleFormatBarTools(formatBarTools = []) {
    return normalizeFormatBarTools(formatBarTools).filter((tool) => tool.visible);
}

export function setFormatBarToolVisibility(formatBarTools, toolId, visible) {
    const normalizedToolId = String(toolId ?? '').trim();
    if (!normalizedToolId) {
        return normalizeFormatBarTools(formatBarTools);
    }

    return normalizeFormatBarTools(formatBarTools).map((tool) => (
        tool.id === normalizedToolId
            ? { ...tool, visible: Boolean(visible) }
            : tool
    ));
}

export function moveFormatBarTool(formatBarTools, toolId, direction) {
    const normalizedToolId = String(toolId ?? '').trim();
    const offset = direction === 'up'
        ? -1
        : direction === 'down'
            ? 1
            : 0;
    const normalizedTools = normalizeFormatBarTools(formatBarTools);

    if (!normalizedToolId || offset === 0) {
        return normalizedTools;
    }

    const currentIndex = normalizedTools.findIndex((tool) => tool.id === normalizedToolId);
    if (currentIndex === -1) {
        return normalizedTools;
    }

    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= normalizedTools.length) {
        return normalizedTools;
    }

    const reorderedTools = [...normalizedTools];
    [reorderedTools[currentIndex], reorderedTools[nextIndex]] = [reorderedTools[nextIndex], reorderedTools[currentIndex]];
    return reorderedTools;
}

export function renderFormatBarToolContent(toolDefinition, {
    label = '',
    shortLabel = '',
} = {}) {
    if (!toolDefinition) {
        return {
            markup: '',
            textOnly: false,
        };
    }

    if (toolDefinition.html) {
        return {
            markup: toolDefinition.html,
            textOnly: false,
        };
    }

    if (toolDefinition.iconClass) {
        return {
            markup: `<i class="fa-solid ${toolDefinition.iconClass}" aria-hidden="true"></i>`,
            textOnly: false,
        };
    }

    const fallbackText = shortLabel || toolDefinition.text || label;
    return {
        markup: escapeHtml(fallbackText),
        textOnly: true,
    };
}

function normalizeLegacyFormatBarTools(toolIds) {
    const visibleIds = new Set();

    toolIds.forEach((rawToolId) => {
        const toolId = String(rawToolId ?? '').trim();
        if (!FORMAT_BAR_TOOL_DEFINITION_BY_ID.has(toolId)) {
            return;
        }

        visibleIds.add(toolId);
    });

    if (visibleIds.size === 0) {
        return createDefaultFormatBarTools();
    }

    return DEFAULT_FORMAT_BAR_TOOLS.map((toolId) => ({
        id: toolId,
        visible: visibleIds.has(toolId),
    }));
}

function normalizeFormatBarToolItem(rawTool) {
    if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
        return null;
    }

    const toolId = String(rawTool.id ?? '').trim();
    if (!FORMAT_BAR_TOOL_DEFINITION_BY_ID.has(toolId)) {
        return null;
    }

    return {
        id: toolId,
        visible: rawTool.visible !== false,
    };
}
