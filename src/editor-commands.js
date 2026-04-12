// src/editor-commands.js
// Responsible for: shared text transforms for editor commands and plain-text export helpers.

import {
    stripMarkdownBlockPrefix,
    stripMarkdownInlineFormatting,
    stripMarkdownLineToPlainText,
    stripMarkdownToPlainText as stripMarkdownToPlainTextFromRules,
} from './markdown-rules.js';

const INDENT_UNIT = '    ';
const XML_PLACEHOLDER = 'tag';

export function applyEditorCommand(value, selectionStart, selectionEnd, commandId) {
    switch (commandId) {
        case 'bold':
        case 'italic':
            return formatInlineSelection(value, selectionStart, selectionEnd, commandId);
        case 'heading':
        case 'quote':
        case 'unordered':
        case 'ordered':
        case 'checkbox':
        case 'clear':
            return transformSelectedLines(value, selectionStart, selectionEnd, commandId);
        case 'indent':
            return indentTouchedLines(value, selectionStart, selectionEnd);
        case 'outdent':
            return outdentTouchedLines(value, selectionStart, selectionEnd);
        case 'xmlPair':
            return insertXmlPair(value, selectionStart, selectionEnd);
        case 'hash':
            return insertLiteral(value, selectionStart, selectionEnd, '#');
        default:
            return {
                value,
                selectionStart,
                selectionEnd,
            };
    }
}

export function getSmartEnterState(value, selectionStart, selectionEnd) {
    if (selectionStart !== selectionEnd) {
        return null;
    }

    const lineRange = getLineRange(value, selectionStart);
    const listContext = parseContinuableListLine(lineRange.text);
    if (!listContext) {
        return null;
    }

    const caretOffset = selectionStart - lineRange.start;
    const markerEnd = listContext.indent.length + listContext.markerLength;
    if (caretOffset < markerEnd) {
        return null;
    }

    const beforeCaret = lineRange.text.slice(0, caretOffset);
    const afterCaret = lineRange.text.slice(caretOffset);
    const bodyBefore = beforeCaret.slice(markerEnd);
    const bodyAfter = afterCaret;
    const lineIsEffectivelyEmpty = !bodyBefore.trim() && !bodyAfter.trim();

    if (lineIsEffectivelyEmpty) {
        const replacement = listContext.indent;
        const nextValue = `${value.slice(0, lineRange.start)}${replacement}${value.slice(lineRange.end)}`;
        const nextCaret = lineRange.start + replacement.length;
        return {
            value: nextValue,
            selectionStart: nextCaret,
            selectionEnd: nextCaret,
        };
    }

    const continuation = `${listContext.indent}${getListContinuationPrefix(listContext)}`;
    const nextValue = `${value.slice(0, selectionStart)}\n${continuation}${value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + 1 + continuation.length;

    return {
        value: nextValue,
        selectionStart: nextCaret,
        selectionEnd: nextCaret,
    };
}

export function getSmartListDeletionState(value, selectionStart, selectionEnd, direction = 'backward') {
    if (selectionStart !== selectionEnd) {
        return null;
    }

    const lineRange = getLineRange(value, selectionStart);
    const listContext = parseContinuableListLine(lineRange.text);
    if (!listContext || listContext.body.trim()) {
        return null;
    }

    const caretOffset = selectionStart - lineRange.start;
    const markerEnd = listContext.indent.length + listContext.markerLength;
    const canDeleteBackward = direction === 'backward' && caretOffset >= markerEnd;
    const canDeleteForward = direction === 'forward' && caretOffset <= markerEnd;
    if (!canDeleteBackward && !canDeleteForward) {
        return null;
    }

    const replacement = listContext.indent;
    const nextValue = `${value.slice(0, lineRange.start)}${replacement}${value.slice(lineRange.end)}`;
    const nextCaret = lineRange.start + replacement.length;

    return {
        value: nextValue,
        selectionStart: nextCaret,
        selectionEnd: nextCaret,
    };
}

export function getInlineTermCommitState(value, selectionStart, selectionEnd, {
    extractTagsFromText,
    stripInlineTags,
} = {}) {
    if (
        selectionStart !== selectionEnd
        || typeof extractTagsFromText !== 'function'
        || typeof stripInlineTags !== 'function'
    ) {
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

export function toggleTaskLineByIndex(value, lineIndex) {
    const lines = String(value ?? '').split('\n');
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
        return null;
    }

    const sourceLine = String(lines[lineIndex] ?? '');
    if (/^(\s*)[-+*]\s+\[(?: |x|X)\]\s+/.test(sourceLine)) {
        lines[lineIndex] = sourceLine.replace(
            /^(\s*[-+*]\s+\[)( |x|X)(\]\s+)/,
            (_, open, state, close) => `${open}${String(state).trim().toLowerCase() === 'x' ? ' ' : 'x'}${close}`,
        );
    } else {
        lines[lineIndex] = transformLine(lines[lineIndex], 'checkbox');
    }
    const nextValue = lines.join('\n');
    const caretOffset = getLineStartOffset(lines, lineIndex) + lines[lineIndex].length;

    return {
        value: nextValue,
        selectionStart: caretOffset,
        selectionEnd: caretOffset,
    };
}

export function syncXmlMirrorSession(value, session, selectionStart, selectionEnd) {
    if (!session || !Number.isInteger(session.openTagStart) || session.openTagStart < 1) {
        return null;
    }

    const rawValue = String(value ?? '');
    const openTagStart = session.openTagStart;
    if (rawValue[openTagStart - 1] !== '<') {
        return null;
    }

    const openTagEnd = rawValue.indexOf('>', openTagStart);
    if (openTagEnd === -1) {
        return null;
    }

    const closeTagTokenStart = rawValue.indexOf('</', openTagEnd + 1);
    if (closeTagTokenStart === -1) {
        return null;
    }

    const closeTagStart = closeTagTokenStart + 2;
    const closeTagEnd = rawValue.indexOf('>', closeTagStart);
    if (closeTagEnd === -1) {
        return null;
    }

    const nextTagName = rawValue.slice(openTagStart, openTagEnd);
    const nextValue = `${rawValue.slice(0, closeTagStart)}${nextTagName}${rawValue.slice(closeTagEnd)}`;
    const nextCloseTagEnd = closeTagStart + nextTagName.length;
    const selectionInsideOpenTag = selectionStart >= openTagStart && selectionEnd <= openTagEnd;

    return {
        value: nextValue,
        selectionStart,
        selectionEnd,
        session: selectionInsideOpenTag
            ? {
                openTagStart,
                closeTagStart,
                closeTagEnd: nextCloseTagEnd,
            }
            : null,
    };
}

export function stripMarkdownToPlainText(value) {
    return stripMarkdownToPlainTextFromRules(value);
}

function insertXmlPair(value, selectionStart, selectionEnd) {
    const inserted = `<${XML_PLACEHOLDER}></${XML_PLACEHOLDER}>`;
    const nextValue = `${value.slice(0, selectionStart)}${inserted}${value.slice(selectionEnd)}`;
    const openTagStart = selectionStart + 1;

    return {
        value: nextValue,
        selectionStart: openTagStart,
        selectionEnd: openTagStart + XML_PLACEHOLDER.length,
        session: {
            openTagStart,
            closeTagStart: selectionStart + inserted.indexOf(`</${XML_PLACEHOLDER}>`) + 2,
            closeTagEnd: selectionStart + inserted.indexOf(`</${XML_PLACEHOLDER}>`) + 2 + XML_PLACEHOLDER.length,
        },
    };
}

function insertLiteral(value, selectionStart, selectionEnd, insertedText) {
    const nextValue = `${value.slice(0, selectionStart)}${insertedText}${value.slice(selectionEnd)}`;
    const caretPosition = selectionStart + insertedText.length;

    return {
        value: nextValue,
        selectionStart: caretPosition,
        selectionEnd: caretPosition,
    };
}

function formatInlineSelection(value, selectionStart, selectionEnd, type) {
    const marker = type === 'bold' ? '**' : '*';
    const adjacentToggleState = unwrapAdjacentInlineMarkers(value, selectionStart, selectionEnd, marker);
    if (adjacentToggleState) {
        return adjacentToggleState;
    }

    if (selectionStart === selectionEnd) {
        const caretToggleState = unwrapInlineMarkersAtCaret(value, selectionStart, marker);
        if (caretToggleState) {
            return caretToggleState;
        }
    }

    const selectedText = value.slice(selectionStart, selectionEnd);
    const textToWrap = selectedText;
    const wrapped = `${marker}${textToWrap}${marker}`;
    const nextSelectionStart = selectionStart + marker.length;
    const nextSelectionEnd = selectionStart + marker.length + textToWrap.length;

    return {
        value: `${value.slice(0, selectionStart)}${wrapped}${value.slice(selectionEnd)}`,
        selectionStart: nextSelectionStart,
        selectionEnd: nextSelectionEnd,
    };
}

function transformSelectedLines(value, selectionStart, selectionEnd, type) {
    const { start: lineStart, end: lineEnd } = getLineBoundsAt(value, selectionStart, selectionEnd);
    const originalBlock = value.slice(lineStart, lineEnd);
    const lines = originalBlock.split('\n');
    const transformContext = buildLineTransformContext(lines, type, selectionStart === selectionEnd);
    const nextBlock = lines
        .map((line, index) => transformLine(line, type, transformContext, index))
        .join('\n');
    const collapsed = selectionStart === selectionEnd;
    const delta = nextBlock.length - originalBlock.length;

    return {
        value: `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
        selectionStart: collapsed ? Math.max(lineStart, selectionStart + delta) : lineStart,
        selectionEnd: collapsed ? Math.max(lineStart, selectionEnd + delta) : lineStart + nextBlock.length,
    };
}

function indentTouchedLines(value, selectionStart, selectionEnd) {
    const { start: lineStart, end: lineEnd } = getLineBoundsAt(value, selectionStart, selectionEnd);
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const nextLines = lines.map((line) => `${INDENT_UNIT}${line}`);
    const nextBlock = nextLines.join('\n');
    const collapsed = selectionStart === selectionEnd;
    const caretShift = INDENT_UNIT.length;

    return {
        value: `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
        selectionStart: collapsed ? selectionStart + caretShift : lineStart,
        selectionEnd: collapsed ? selectionEnd + caretShift : lineStart + nextBlock.length,
    };
}

function outdentTouchedLines(value, selectionStart, selectionEnd) {
    const { start: lineStart, end: lineEnd } = getLineBoundsAt(value, selectionStart, selectionEnd);
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const removedByLine = [];
    const nextLines = lines.map((line) => {
        const { nextLine, removed } = stripSingleIndent(line);
        removedByLine.push(removed);
        return nextLine;
    });
    const nextBlock = nextLines.join('\n');
    const collapsed = selectionStart === selectionEnd;
    const caretShift = removedByLine[0] ?? 0;

    return {
        value: `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`,
        selectionStart: collapsed ? Math.max(lineStart, selectionStart - caretShift) : lineStart,
        selectionEnd: collapsed ? Math.max(lineStart, selectionEnd - caretShift) : lineStart + nextBlock.length,
    };
}

function transformLine(line, type, context = {}, index = 0) {
    const sourceLine = String(line ?? '');
    if (
        !sourceLine.trim()
        && type !== 'indent'
        && type !== 'outdent'
        && type !== 'checkbox'
        && !context.allowEmptyLine
    ) {
        return sourceLine;
    }

    const { indent, content } = splitLineIndent(sourceLine);

    switch (type) {
        case 'heading':
            return context.toggleHeadingOff
                ? `${indent}${content.replace(/^#{1,6}\s+/, '')}`
                : `${indent}## ${stripMarkdownBlockPrefix(content)}`;
        case 'quote':
            return context.toggleQuoteOff
                ? `${indent}${content.replace(/^>\s*/, '')}`
                : `${indent}> ${stripMarkdownBlockPrefix(content)}`;
        case 'unordered':
            return context.toggleUnorderedOff
                ? `${indent}${content.replace(/^[-+*]\s+/, '')}`
                : `${indent}- ${stripMarkdownBlockPrefix(content)}`;
        case 'ordered': {
            if (context.toggleOrderedOff) {
                return `${indent}${content.replace(/^\d+\.\s+/, '')}`;
            }

            const number = context.orderedNumbers?.get(index) ?? 1;
            return `${indent}${number}. ${stripMarkdownBlockPrefix(content)}`;
        }
        case 'checkbox': {
            if (/^[-+*]\s+\[(?: |x|X)\]\s+/.test(content)) {
                return `${indent}${content.replace(/^[-+*]\s+\[(?: |x|X)\]\s+/, '')}`;
            }

            return `${indent}- [ ] ${stripMarkdownBlockPrefix(content)}`;
        }
        case 'clear':
            return clearLineFormatting(sourceLine);
        default:
            return sourceLine;
    }
}

function buildLineTransformContext(lines, type, collapsedSelection = false) {
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
        allowEmptyLine: collapsedSelection && lines.length === 1,
        orderedNumbers,
        toggleHeadingOff: type === 'heading' && nonEmptyLines.length > 0 && nonEmptyLines.every(isHeadingLine),
        toggleQuoteOff: type === 'quote' && nonEmptyLines.length > 0 && nonEmptyLines.every(isQuoteLine),
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

function stripSingleIndent(line) {
    const sourceLine = String(line ?? '');
    if (sourceLine.startsWith('\t')) {
        return {
            nextLine: sourceLine.slice(1),
            removed: 1,
        };
    }

    const spaceMatch = sourceLine.match(/^ {1,4}/);
    if (spaceMatch) {
        return {
            nextLine: sourceLine.slice(spaceMatch[0].length),
            removed: spaceMatch[0].length,
        };
    }

    return {
        nextLine: sourceLine,
        removed: 0,
    };
}

function clearLineFormatting(line) {
    let nextLine = String(line ?? '');

    for (let index = 0; index < 8; index += 1) {
        const { nextLine: withoutIndent } = stripSingleIndent(nextLine);
        const withoutBlock = withoutIndent.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+\[(?: |x|X)\]\s+|[-+*]\s+|\d+\.\s+)/, '');
        if (withoutBlock === nextLine) {
            break;
        }

        nextLine = withoutBlock;
    }

    return clearInlineFormatting(nextLine);
}

function clearInlineFormatting(text) {
    return stripMarkdownInlineFormatting(text);
}

function unwrapAdjacentInlineMarkers(value, selectionStart, selectionEnd, marker) {
    if (
        selectionStart < marker.length
        || value.slice(selectionStart - marker.length, selectionStart) !== marker
        || value.slice(selectionEnd, selectionEnd + marker.length) !== marker
    ) {
        return null;
    }

    const nextValue = `${value.slice(0, selectionStart - marker.length)}${value.slice(selectionStart, selectionEnd)}${value.slice(selectionEnd + marker.length)}`;
    const nextStart = selectionStart - marker.length;
    const nextEnd = selectionEnd - marker.length;
    return {
        value: nextValue,
        selectionStart: nextStart,
        selectionEnd: nextEnd,
    };
}

function unwrapInlineMarkersAtCaret(value, caretPosition, marker) {
    const range = findInlineMarkerRangeAtCaret(value, caretPosition, marker);
    if (!range) {
        return null;
    }

    const nextValue = `${value.slice(0, range.openStart)}${value.slice(range.contentStart, range.contentEnd)}${value.slice(range.closeEnd)}`;
    const nextCaret = Math.max(range.openStart, caretPosition - marker.length);
    return {
        value: nextValue,
        selectionStart: nextCaret,
        selectionEnd: nextCaret,
    };
}

function findInlineMarkerRangeAtCaret(value, caretPosition, marker) {
    const { start: lineStart, end: lineEnd } = getLineBoundsAt(value, caretPosition);
    const line = value.slice(lineStart, lineEnd);
    const regex = marker === '**'
        ? /\*\*([^*\n]+)\*\*/g
        : /(^|[^*])\*([^*\n]+)\*(?!\*)/g;

    let match = regex.exec(line);
    while (match) {
        if (marker === '**') {
            const openStart = lineStart + match.index;
            const contentStart = openStart + 2;
            const contentEnd = contentStart + match[1].length;
            const closeEnd = contentEnd + 2;
            if (caretPosition >= contentStart && caretPosition <= contentEnd) {
                return { openStart, contentStart, contentEnd, closeEnd };
            }
        } else {
            const prefixLength = match[1].length;
            const openStart = lineStart + match.index + prefixLength;
            const contentStart = openStart + 1;
            const contentEnd = contentStart + match[2].length;
            const closeEnd = contentEnd + 1;
            if (caretPosition >= contentStart && caretPosition <= contentEnd) {
                return { openStart, contentStart, contentEnd, closeEnd };
            }
        }

        match = regex.exec(line);
    }

    return null;
}

function parseContinuableListLine(line) {
    const sourceLine = String(line ?? '');
    const { indent, content } = splitLineIndent(sourceLine);
    if (!content) {
        return null;
    }

    const taskMatch = content.match(/^([-+*])\s+\[(?: |x|X)\](?:\s(.*))?$/);
    if (taskMatch) {
        const body = taskMatch[2] ?? '';
        return {
            type: 'task',
            indent,
            bullet: taskMatch[1],
            markerLength: content.length - body.length,
            body,
        };
    }

    const orderedMatch = content.match(/^(\d+)\.(?:\s(.*))?$/);
    if (orderedMatch) {
        const body = orderedMatch[2] ?? '';
        return {
            type: 'ordered',
            indent,
            number: Number(orderedMatch[1]),
            markerLength: content.length - body.length,
            body,
        };
    }

    const unorderedMatch = content.match(/^([-+*])(?:\s(.*))?$/);
    if (unorderedMatch) {
        const body = unorderedMatch[2] ?? '';
        return {
            type: 'unordered',
            indent,
            bullet: unorderedMatch[1],
            markerLength: content.length - body.length,
            body,
        };
    }

    return null;
}

function getListContinuationPrefix(listContext) {
    switch (listContext.type) {
        case 'task':
            return `${listContext.bullet ?? '-'} [ ] `;
        case 'ordered':
            return `${Number.isFinite(listContext.number) ? listContext.number + 1 : 1}. `;
        case 'unordered':
            return `${listContext.bullet ?? '-'} `;
        default:
            return '';
    }
}

function isHeadingLine(line) {
    return /^\s*#{1,6}\s+/.test(String(line ?? ''));
}

function isUnorderedListLine(line) {
    return /^\s*[-+*]\s+/.test(String(line ?? ''));
}

function isOrderedListLine(line) {
    return /^\s*\d+\.\s+/.test(String(line ?? ''));
}

function isQuoteLine(line) {
    return /^\s*>\s?/.test(String(line ?? ''));
}

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

function getLineStartOffset(lines, lineIndex) {
    let offset = 0;
    for (let index = 0; index < lineIndex; index += 1) {
        offset += lines[index].length + 1;
    }

    return offset;
}
