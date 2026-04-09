// index.js
// The entry point. ST loads this file first and only needs a one-time bootstrap.

import { initializeLauncherManager } from './src/integrations/launcher-manager.js';
import { createPanel } from './src/panel.js';

let hasInitialised = false;

document.addEventListener('DOMContentLoaded', init);

if (document.readyState !== 'loading') {
    init();
}

function init() {
    if (hasInitialised) {
        return;
    }

    hasInitialised = true;
    createPanel();
    initializeLauncherManager();
}
