// src/editor-document.js
// Responsible for: pure editor document transforms and preview rendering helpers.

import { extractTagsFromText, stripInlineTags } from './tag-utils.js';
import { renderDocumentPreviewTerms } from './ui/editor-view.js';
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
    const termsMarkup = renderDocumentPreviewTerms(documentModel);
    const bodyMarkup = trimmed
        ? sanitizePreviewHtml(markdownConverter.makeHtml(trimmed))
        : '';

    return `${termsMarkup}${bodyMarkup}`;
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
    const selectedBlock = value.slice(lineStart, lineEnd);
    const nextBlock = selectedBlock
        .split('\n')
        .map((line) => transformLine(line, type))
        .join('\n');

    return {
        value: `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
        selectionStart: lineStart,
        selectionEnd: lineStart + nextBlock.length,
    };
}

function transformLine(line, type) {
    if (!line.trim()) {
        return line;
    }

    switch (type) {
        case 'heading':
            return line.replace(/^\s{0,3}(#{1,6}\s+)?/, '## ');
        case 'quote':
            return line.replace(/^\s{0,3}(>\s*)?/, '> ');
        case 'clear':
            return line
                .replace(/^\s{0,3}(#{1,6}\s+|>\s*)/, '')
                .replace(/^\*\*(.+)\*\*$/, '$1')
                .replace(/^\*(.+)\*$/, '$1');
        default:
            return line;
    }
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

function sanitizePreviewHtml(html) {
    const domPurify = window.DOMPurify;
    if (typeof domPurify?.sanitize === 'function') {
        return domPurify.sanitize(html);
    }

    return html;
}
