// src/editor-display.js
// Responsible for: preview rendering helpers for full preview and lightweight hybrid display.

import { t } from './i18n/index.js';
import {
    getIndentDepth,
    isMarkdownListLine,
    parseHeadingLine,
    parseMarkdownBlocks,
    renderInlineMarkdown,
} from './markdown-rules.js';
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
    const trimmed = String(documentModel?.content ?? '').trim();
    return trimmed
        ? sanitizePreviewHtml(markdownConverter.makeHtml(normalizePreviewMarkdown(trimmed)))
        : '';
}

export function renderHybridDisplay(documentModel) {
    const blocks = parseMarkdownBlocks(documentModel?.content ?? '');
    if (blocks.length === 0) {
        return '';
    }

    return blocks
        .map((block) => renderHybridBlockContent(block))
        .join('');
}

function renderHybridBlockContent(block) {
    switch (block.type) {
        case 'heading':
            return renderHeadingBlock(block);
        case 'task-list':
            return renderTaskListBlock(block);
        case 'ordered-list':
            return renderOrderedListBlock(block);
        case 'bullet-list':
            return renderBulletListBlock(block);
        case 'quote':
            return renderQuoteBlock(block);
        default:
            return renderParagraphBlock(block);
    }
}

function renderHeadingBlock(block) {
    const heading = parseHeadingLine(block.lines[0] ?? '');
    if (!heading) {
        return renderParagraphBlock(block);
    }

    return `<h${heading.level} class="ne-hybrid-block ne-hybrid-block--heading" data-block-start-offset="${block.startOffset}" data-line-start-offset="${block.startOffset}">${renderInlineMarkdown(heading.text)}</h${heading.level}>`;
}

function renderTaskListBlock(block) {
    const lineOffsets = getBlockLineOffsets(block);
    const items = block.lines.map((line, index) => {
        const match = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
        const indentDepth = getIndentDepth(match?.[1] ?? '');
        const checked = String(match?.[2] ?? '').toLowerCase() === 'x';
        const text = match?.[3] ?? '';
        const lineIndex = block.startLine + index;
        const lineOffset = lineOffsets[index] ?? block.startOffset;

        return `
            <li class="ne-hybrid-list__item ne-hybrid-list__item--task" data-depth="${indentDepth}" data-line-start-offset="${lineOffset}">
                <button
                    class="ne-hybrid-task-toggle${checked ? ' ne-hybrid-task-toggle--checked' : ''}"
                    type="button"
                    data-action="toggle-hybrid-task"
                    data-line-index="${lineIndex}"
                    aria-pressed="${checked ? 'true' : 'false'}"
                    aria-label="${escapeHtml(checked ? t('editor.hybrid.task.uncheck') : t('editor.hybrid.task.check'))}"
                >
                    <span aria-hidden="true"></span>
                </button>
                <span class="ne-hybrid-task-text${checked ? ' ne-hybrid-task-text--checked' : ''}">${renderInlineMarkdown(text)}</span>
            </li>
        `;
    });

    return `<ul class="ne-hybrid-block ne-hybrid-list ne-hybrid-list--tasks" data-block-start-offset="${block.startOffset}">${items.join('')}</ul>`;
}

function renderOrderedListBlock(block) {
    const lineOffsets = getBlockLineOffsets(block);
    const firstMatch = block.lines[0]?.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const startNumber = Number(firstMatch?.[2] ?? 1);
    const items = block.lines.map((line, index) => {
        const match = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        const indentDepth = getIndentDepth(match?.[1] ?? '');
        const text = match?.[3] ?? '';
        const lineOffset = lineOffsets[index] ?? block.startOffset;

        return `
            <li class="ne-hybrid-list__item" data-depth="${indentDepth}" data-line-start-offset="${lineOffset}">
                <span class="ne-hybrid-list__text">${renderInlineMarkdown(text)}</span>
            </li>
        `;
    });

    return `<ol class="ne-hybrid-block ne-hybrid-list" start="${startNumber}" data-block-start-offset="${block.startOffset}">${items.join('')}</ol>`;
}

function renderBulletListBlock(block) {
    const lineOffsets = getBlockLineOffsets(block);
    const items = block.lines.map((line, index) => {
        const match = line.match(/^(\s*)[-+*]\s+(.*)$/);
        const indentDepth = getIndentDepth(match?.[1] ?? '');
        const text = match?.[2] ?? '';
        const lineOffset = lineOffsets[index] ?? block.startOffset;

        return `
            <li class="ne-hybrid-list__item" data-depth="${indentDepth}" data-line-start-offset="${lineOffset}">
                <span class="ne-hybrid-list__text">${renderInlineMarkdown(text)}</span>
            </li>
        `;
    });

    return `<ul class="ne-hybrid-block ne-hybrid-list" data-block-start-offset="${block.startOffset}">${items.join('')}</ul>`;
}

function renderQuoteBlock(block) {
    const lineOffsets = getBlockLineOffsets(block);
    const parts = block.lines.map((line, index) => {
        const lineOffset = lineOffsets[index] ?? block.startOffset;
        return `<p data-line-start-offset="${lineOffset}">${renderInlineMarkdown(line.replace(/^\s*>\s?/, ''))}</p>`;
    });
    return `<blockquote class="ne-hybrid-block ne-hybrid-block--quote" data-block-start-offset="${block.startOffset}">${parts.join('')}</blockquote>`;
}

function renderParagraphBlock(block) {
    const lineOffsets = getBlockLineOffsets(block);
    const parts = block.lines.map((line, index) => {
        const lineOffset = lineOffsets[index] ?? block.startOffset;
        return `<span class="ne-hybrid-line" data-line-start-offset="${lineOffset}">${renderInlineMarkdown(line)}</span>`;
    });
    return `<p class="ne-hybrid-block" data-block-start-offset="${block.startOffset}">${parts.join('<br />')}</p>`;
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

function sanitizePreviewHtml(html) {
    const domPurify = window.DOMPurify;
    if (typeof domPurify?.sanitize === 'function') {
        return domPurify.sanitize(html);
    }

    return html;
}

function getBlockLineOffsets(block) {
    const lines = Array.isArray(block?.lines) ? block.lines : [];
    const offsets = [];
    let nextOffset = Number.isFinite(Number(block?.startOffset)) ? Number(block.startOffset) : 0;

    lines.forEach((line, index) => {
        offsets.push(nextOffset);
        nextOffset += String(line ?? '').length;
        if (index < lines.length - 1) {
            nextOffset += 1;
        }
    });

    return offsets;
}
