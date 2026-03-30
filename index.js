// index.js
// The entry point. ST loads this file first.
// Its only job: start everything up in the right order.

import { createPanel, togglePanel } from './src/panel.js';

let hasInitialised = false;

// SillyTavern loads our plugin after the page is ready, but we still
// wait for DOMContentLoaded as a safety net in case of unusual load timing.
document.addEventListener('DOMContentLoaded', init);

// If DOMContentLoaded already fired (ST loads plugins late), run immediately.
if (document.readyState !== 'loading') {
    init();
}

function init() {
    if (hasInitialised) {
        return;
    }

    hasInitialised = true;

    // Build the panel and inject it into the page.
    createPanel();

    // Add our button to the wand (Extensions) menu.
    registerWandButton();
}

function registerWandButton() {
    const existingButton = document.getElementById('ne-wand-button');
    if (existingButton) {
        return;
    }

    // ST's wand/extensions dropdown is a container with this ID.
    // This is the same element the Notebook targets.
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        console.error('[NoteEditor] Could not find #extensionsMenu.');
        return;
    }

    // Build the button using ST's own CSS classes so it looks native.
    // These exact classes are what the Notebook uses — they give us the
    // correct padding, hover style, and flex layout that ST defines.
    const btn = document.createElement('div');
    btn.id = 'ne-wand-button';
    btn.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    btn.tabIndex = 0;  // makes it keyboard-focusable, for accessibility

    // The icon — Font Awesome 'notebook' icon
    const icon = document.createElement('i');
    icon.classList.add('fa-solid', 'fa-book-open');

    // The label text
    const label = document.createElement('span');
    label.textContent = 'Note Editor';

    btn.appendChild(icon);
    btn.appendChild(label);
    menu.appendChild(btn);

    // When clicked, toggle the panel open or closed.
    btn.addEventListener('click', togglePanel);
}
