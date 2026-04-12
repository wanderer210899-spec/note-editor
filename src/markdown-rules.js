// src/markdown-rules.js
// Responsible for: shared markdown syntax patterns used by hybrid display,
// plain-text export, and editor-side formatting helpers.

import { escapeHtml } from './util.js';

export const MARKDOWN_PATTERNS = {
    heading: /^\s*(#{1,6})\s+(.*)$/,
    task: /^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/,
    ordered: /^(\s*)(\d+)\.\s+(.*)$/,
    bullet: /^(\s*)[-+*]\s+(.*)$/,
    quote: /^\s*>\s?/,
    taskPrefix: /^\s*[-+*]\s+\[(?: |x|X)\]\s+/,
    listPrefix: /^\s*(?:[-+*]|\d+\.)\s+/,
    headingPrefix: /^\s{0,3}#{1,6}\s+/,
    quotePrefix: /^\s{0,3}>\s?/,
    blockPrefix: /^(?:#{1,6}\s+|>\s*|[-+*]\s+\[(?: |x|X)\]\s+|[-+*]\s+|\d+\.\s+)/,
    image: /!\[([^\]]*)\]\(([^)]+)\)/g,
    link: /\[([^\]]+)\]\(([^)]+)\)/g,
    boldAsterisk: /\*\*([^*\n]+)\*\*/g,
    boldUnderscore: /__([^_\n]+)__/g,
    italicAsterisk: /\*([^*\n]+)\*/g,
    italicUnderscore: /_([^_\n]+)_/g,
    strike: /~~([^~\n]+)~~/g,
    code: /`([^`\n]+)`/g,
};

const INDENT_DEPTH_TOKEN = '    ';

export function parseHeadingLine(line) {
    const match = String(line ?? '').match(MARKDOWN_PATTERNS.heading);
    if (!match) {
        return null;
    }

    return {
        level: match[1].length,
        text: match[2],
    };
}

export function isTaskLine(line) {
    return MARKDOWN_PATTERNS.task.test(String(line ?? ''));
}

export function isOrderedLine(line) {
    return MARKDOWN_PATTERNS.ordered.test(String(line ?? ''));
}

export function isBulletLine(line) {
    return MARKDOWN_PATTERNS.bullet.test(String(line ?? '')) && !isTaskLine(line);
}

export function isQuoteLine(line) {
    return MARKDOWN_PATTERNS.quote.test(String(line ?? ''));
}

export function isMarkdownListLine(line) {
    return MARKDOWN_PATTERNS.listPrefix.test(String(line ?? ''));
}

export function stripMarkdownBlockPrefix(value) {
    return String(value ?? '').replace(MARKDOWN_PATTERNS.blockPrefix, '');
}

export function stripMarkdownInlineFormatting(value) {
    let nextText = String(value ?? '');

    for (let index = 0; index < 4; index += 1) {
        const stripped = nextText
            .replace(MARKDOWN_PATTERNS.image, '$1')
            .replace(MARKDOWN_PATTERNS.link, '$1')
            .replace(MARKDOWN_PATTERNS.boldAsterisk, '$1')
            .replace(MARKDOWN_PATTERNS.boldUnderscore, '$1')
            .replace(MARKDOWN_PATTERNS.italicAsterisk, '$1')
            .replace(MARKDOWN_PATTERNS.italicUnderscore, '$1')
            .replace(MARKDOWN_PATTERNS.strike, '$1')
            .replace(MARKDOWN_PATTERNS.code, '$1');
        if (stripped === nextText) {
            break;
        }

        nextText = stripped;
    }

    return nextText;
}

export function stripMarkdownLineToPlainText(line) {
    const withoutTask = String(line ?? '')
        .replace(MARKDOWN_PATTERNS.taskPrefix, '')
        .replace(MARKDOWN_PATTERNS.listPrefix, '')
        .replace(MARKDOWN_PATTERNS.headingPrefix, '')
        .replace(MARKDOWN_PATTERNS.quotePrefix, '');

    return stripMarkdownInlineFormatting(withoutTask).replace(/^\s+$/, '');
}

export function stripMarkdownToPlainText(value) {
    const normalized = String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => stripMarkdownLineToPlainText(line))
        .join('\n');

    return normalized
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
}

export function renderInlineMarkdown(value) {
    let markup = escapeHtml(String(value ?? ''));

    markup = markup
        .replace(MARKDOWN_PATTERNS.image, '$1')
        .replace(MARKDOWN_PATTERNS.link, '$1')
        .replace(MARKDOWN_PATTERNS.boldAsterisk, '<strong>$1</strong>')
        .replace(MARKDOWN_PATTERNS.boldUnderscore, '<strong>$1</strong>')
        .replace(MARKDOWN_PATTERNS.italicAsterisk, '<em>$1</em>')
        .replace(MARKDOWN_PATTERNS.italicUnderscore, '<em>$1</em>');

    return markup;
}

export function getIndentDepth(indent) {
    const sourceIndent = String(indent ?? '').replace(/\t/g, INDENT_DEPTH_TOKEN);
    return Math.max(0, Math.floor(sourceIndent.length / 4));
}

export function parseMarkdownBlocks(value) {
    const content = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!content.trim()) {
        return [];
    }

    const lines = content.split('\n');
    const lineOffsets = getLineOffsets(lines);
    const blocks = [];
    let lineIndex = 0;

    while (lineIndex < lines.length) {
        if (!lines[lineIndex].trim()) {
            lineIndex += 1;
            continue;
        }

        const startLine = lineIndex;
        let type = 'paragraph';

        if (parseHeadingLine(lines[lineIndex])) {
            type = 'heading';
            lineIndex += 1;
        } else if (isTaskLine(lines[lineIndex])) {
            type = 'task-list';
            while (lineIndex < lines.length && isTaskLine(lines[lineIndex])) {
                lineIndex += 1;
            }
        } else if (isOrderedLine(lines[lineIndex])) {
            type = 'ordered-list';
            while (lineIndex < lines.length && isOrderedLine(lines[lineIndex])) {
                lineIndex += 1;
            }
        } else if (isBulletLine(lines[lineIndex])) {
            type = 'bullet-list';
            while (lineIndex < lines.length && isBulletLine(lines[lineIndex])) {
                lineIndex += 1;
            }
        } else if (isQuoteLine(lines[lineIndex])) {
            type = 'quote';
            while (lineIndex < lines.length && isQuoteLine(lines[lineIndex])) {
                lineIndex += 1;
            }
        } else {
            while (
                lineIndex < lines.length
                && lines[lineIndex].trim()
                && !parseHeadingLine(lines[lineIndex])
                && !isTaskLine(lines[lineIndex])
                && !isOrderedLine(lines[lineIndex])
                && !isBulletLine(lines[lineIndex])
                && !isQuoteLine(lines[lineIndex])
            ) {
                lineIndex += 1;
            }
        }

        const endLine = lineIndex;
        const startOffset = lineOffsets[startLine];
        const endOffset = endLine < lines.length ? lineOffsets[endLine] - 1 : content.length;
        const raw = content.slice(startOffset, endOffset);

        blocks.push({
            index: blocks.length,
            type,
            startLine,
            endLine,
            startOffset,
            endOffset,
            lines: lines.slice(startLine, endLine),
            raw,
        });
    }

    return blocks;
}

export function findMarkdownBlockIndexByOffset(blocks, offset) {
    const sourceOffset = Number.isFinite(Number(offset)) ? Number(offset) : -1;
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return -1;
    }

    for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (sourceOffset >= block.startOffset && sourceOffset <= block.endOffset) {
            return index;
        }
    }

    for (let index = 0; index < blocks.length; index += 1) {
        if (sourceOffset < blocks[index].startOffset) {
            return index;
        }
    }

    return blocks.length - 1;
}

export function replaceMarkdownBlock(content, block, replacement) {
    if (!block) {
        return String(content ?? '');
    }

    return `${String(content ?? '').slice(0, block.startOffset)}${String(replacement ?? '')}${String(content ?? '').slice(block.endOffset)}`;
}

function getLineOffsets(lines) {
    const offsets = [];
    let offset = 0;

    lines.forEach((line) => {
        offsets.push(offset);
        offset += line.length + 1;
    });

    return offsets;
}
