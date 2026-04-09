import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const files = [
    path.join(projectRoot, 'src', 'i18n', 'en.js'),
    path.join(projectRoot, 'src', 'i18n', 'zh.js'),
];

const suspectPatterns = [
    { label: 'replacement character', regex: /\uFFFD/ },
    { label: 'UTF-8 mojibake marker', regex: /â”€|Ã.|Â.|ðŸ|â€¦|â€œ|â€/ },
    { label: 'question-marked banner', regex: /^(\s*\/\/\s*\?\?)/m },
];

let hasFailure = false;

for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of suspectPatterns) {
        if (!pattern.regex.test(content)) {
            continue;
        }

        hasFailure = true;
        console.error(`[encoding] ${path.relative(projectRoot, filePath)} contains a ${pattern.label}.`);
    }
}

if (hasFailure) {
    process.exitCode = 1;
} else {
    console.log('Locale encoding check passed.');
}
