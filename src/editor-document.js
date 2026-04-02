// src/editor-document.js
// Responsible for: pure editor document transforms and preview rendering helpers.

import { extractTagsFromText, stripInlineTags } from './tag-utils.js';
import { escapeHtml } from './util.js';

export function createMarkdownConverter() {
    const showdownGlobal = window.showdown;
    if (!showdownGlobal?.Converter) {
        return {
            makeHtml(markdown) {
                return `<p>${escapeHtml(markdown)}</p>`;
            },
        };
    }

    return new showdownGlobal.Converter({
        simplifiedAutoLink: true,
        strikethrough: true,
        tables: true,
        tasklists: true,
        ghCompatibleHeaderId: true,
        simpleLineBreaks: true,
        emoji: true,
    });
}

export function renderDocumentPreview(documentModel, markdownConverter) {
    const trimmed = documentModel.content.trim();
    const bodyMarkup = trimmed
        ? sanitizePreviewHtml(markdownConverter.makeHtml(normalizePreviewMarkdown(trimmed)))
        : '';

    return bodyMarkup;
}

export function getFormattedEditorState(value, selectionStart, selectionEnd, type) {
    if (type === 'bold' || type === 'italic') {
        return formatInlineSelection(value, selectionStart, selectionEnd, type);
    }

    return transformSelectedLines(value, selectionStart, selectionEnd, type);
}

export function getInlineTermCommitState(value, selectionStart, selectionEnd) {
    if (selectionStart !== selectionEnd) {
        return null;
    }

    const lineRange = getLineRange(value, selectionStart);
    const terms = extractTagsFromText(lineRange.text);
    if (terms.length === 0 || stripInlineTags(lineRange.text).trim() !== '') {
        return null;
    }

    const nextValue = `${value.slice(0, lineRange.start)}${value.slice(lineRange.end)}`;
    return {
        terms,
        value: nextValue,
        selectionStart: lineRange.start,
        selectionEnd: lineRange.start,
    };
}

function formatInlineSelection(value, selectionStart, selectionEnd, type) {
    const marker = type === 'bold' ? '**' : '*';
    const selectedText = value.slice(selectionStart, selectionEnd);
    const textToWrap = selectedText || 'text';
    const wrapped = `${marker}${textToWrap}${marker}`;
    const nextSelectionStart = selectionStart + marker.length;

    return {
        value: `${value.slice(0, selectionStart)}${wrapped}${value.slice(selectionEnd)}`,
        selectionStart: nextSelectionStart,
        selectionEnd: nextSelectionStart + textToWrap.length,
    };
}

function transformSelectedLines(value, selectionStart, selectionEnd, type) {
    const { start: lineStart, end: lineEnd } = getLineBoundsAt(value, selectionStart, selectionEnd);
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const transformContext = buildLineTransformContext(lines, type);
    const nextBlock = lines
        .map((line, index) => transformLine(line, type, transformContext, index))
        .join('\n');

    return {
        value: `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
        selectionStart: lineStart,
        selectionEnd: lineStart + nextBlock.length,
    };
}

function transformLine(line, type, context = {}, index = 0) {
    if (!line.trim()) {
        return line;
    }

    const { indent, content } = splitLineIndent(line);

    switch (type) {
        case 'heading':
            return `${indent}## ${stripBlockPrefix(content)}`;
        case 'quote':
            return `${indent}> ${stripBlockPrefix(content)}`;
        case 'unordered':
            return context.toggleUnorderedOff
                ? `${indent}${content.replace(/^[-+*]\s+/, '')}`
                : `${indent}- ${stripBlockPrefix(content)}`;
        case 'ordered': {
            if (context.toggleOrderedOff) {
                return `${indent}${content.replace(/^\d+\.\s+/, '')}`;
            }

            const number = context.orderedNumbers?.get(index) ?? 1;
            return `${indent}${number}. ${stripBlockPrefix(content)}`;
        }
        case 'indent':
            return `    ${line}`;
        case 'outdent':
            return stripOneIndent(line);
        case 'clear':
            return clearLineFormatting(line);
        default:
            return line;
    }
}

function buildLineTransformContext(lines, type) {
    const nonEmptyLines = lines.filter((line) => line.trim());
    const orderedNumbers = new Map();
    let nextNumber = 1;

    lines.forEach((line, index) => {
        if (!line.trim()) {
            return;
        }

        orderedNumbers.set(index, nextNumber);
        nextNumber += 1;
    });

    return {
        orderedNumbers,
        toggleUnorderedOff: type === 'unordered' && nonEmptyLines.length > 0 && nonEmptyLines.every(isUnorderedListLine),
        toggleOrderedOff: type === 'ordered' && nonEmptyLines.length > 0 && nonEmptyLines.every(isOrderedListLine),
    };
}

function splitLineIndent(line) {
    const match = String(line ?? '').match(/^(\s*)(.*)$/);
    return {
        indent: match?.[1] ?? '',
        content: match?.[2] ?? '',
    };
}

function stripBlockPrefix(content) {
    return String(content ?? '').replace(/^(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+\.\s+)/, '');
}

function stripOneIndent(line) {
    return String(line ?? '').replace(/^(?:\t| {1,4})/, '');
}

function clearLineFormatting(line) {
    let nextLine = String(line ?? '');

    for (let index = 0; index < 8; index += 1) {
        const withoutIndent = stripOneIndent(nextLine);
        const withoutBlock = withoutIndent.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+\.\s+)/, '');
        if (withoutBlock === nextLine) {
            break;
        }

        nextLine = withoutBlock;
    }

    return clearInlineFormatting(nextLine);
}

function clearInlineFormatting(text) {
    let nextText = String(text ?? '');

    for (let index = 0; index < 4; index += 1) {
        const stripped = nextText
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            .replace(/__([^_\n]+)__/g, '$1')
            .replace(/\*([^*\n]+)\*/g, '$1')
            .replace(/_([^_\n]+)_/g, '$1')
            .replace(/~~([^~\n]+)~~/g, '$1')
            .replace(/`([^`\n]+)`/g, '$1');
        if (stripped === nextText) {
            break;
        }

        nextText = stripped;
    }

    return nextText;
}

function isUnorderedListLine(line) {
    return /^\s*[-+*]\s+/.test(String(line ?? ''));
}

function isOrderedListLine(line) {
    return /^\s*\d+\.\s+/.test(String(line ?? ''));
}

// Returns the start and end character offsets of the line(s) spanning startPos..endPos.
// For a single position, pass only startPos and endPos defaults to it.
function getLineBoundsAt(value, startPos, endPos = startPos) {
    const start = value.lastIndexOf('\n', Math.max(0, startPos - 1)) + 1;
    const endBreak = value.indexOf('\n', endPos);
    const end = endBreak === -1 ? value.length : endBreak;
    return { start, end };
}

function getLineRange(value, position) {
    const { start, end } = getLineBoundsAt(value, position);
    return { start, end, text: value.slice(start, end) };
}

function normalizePreviewMarkdown(markdown) {
    const lines = String(markdown ?? '').split('\n');
    const normalizedLines = [];

    lines.forEach((line, index) => {
        const previousLine = normalizedLines.length > 0 ? normalizedLines[normalizedLines.length - 1] : '';
        const nextSourceLine = index + 1 < lines.length ? lines[index + 1] : '';
        const isListLine = isMarkdownListLine(line);
        const previousIsListLine = isMarkdownListLine(previousLine);

        if (isListLine && previousLine.trim() && !previousIsListLine) {
            normalizedLines.push('');
        }

        normalizedLines.push(line);

        if (isListLine && nextSourceLine.trim() && !isMarkdownListLine(nextSourceLine)) {
            normalizedLines.push('');
        }
    });

    return normalizedLines.join('\n');
}

function isMarkdownListLine(line) {
    return /^\s*(?:[-+*]|\d+\.)\s+/.test(String(line ?? ''));
}

function sanitizePreviewHtml(html) {
    const domPurify = window.DOMPurify;
    if (typeof domPurify?.sanitize === 'function') {
        return domPurify.sanitize(html);
    }

    return html;
}
