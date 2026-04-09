// src/integrations/launcher-manager.js
// Responsible for: enabling and disabling launcher integrations from settings.

import { t } from '../i18n/index.js';
import {
    attachQuickReplySet,
    detachQuickReplySet,
    ensureQuickReplyButton,
    ensureQuickReplySetExists,
    getExtensionsMenuElement,
    getWorldInfoHeaderRowElement,
    hasQuickReplyApi,
    observeWorldInfoMutations,
    registerPluginSlashCommand,
    removeQuickReplyButtonByAutomationId,
    unregisterPluginSlashCommand,
} from '../services/st-context.js';
import { subscribeSettings } from '../state/settings-store.js';
import { isMobileViewport } from '../util.js';
import {
    LAUNCHER_ACTION_CREATE_CURRENT,
    LAUNCHER_ACTION_OPEN,
    LAUNCHER_ACTION_OPEN_LOREBOOK,
    LAUNCHER_ACTION_OPEN_NOTE,
    runLauncherAction,
} from './launcher-actions.js';
import {
    isEditableShortcutTarget,
    isNoteEditorCanvasShortcutTarget,
    matchesShortcutBinding,
} from './shortcut-utils.js';

const SLASH_COMMAND_SPECS = [
    {
        name: 'ne-notebook',
        helpKey: 'settings.integrations.slashCommands.helpNotebook',
        actionId: LAUNCHER_ACTION_OPEN_NOTE,
    },
    {
        name: 'ne-lorebook',
        helpKey: 'settings.integrations.slashCommands.helpLorebook',
        actionId: LAUNCHER_ACTION_OPEN_LOREBOOK,
    },
    {
        name: 'ne-new',
        helpKey: 'settings.integrations.slashCommands.helpNew',
        actionId: LAUNCHER_ACTION_CREATE_CURRENT,
    },
];
const LEGACY_SLASH_COMMAND_NAMES = ['ne', 'note-editor'];
const WAND_BUTTON_ID = 'ne-wand-button';
const WORLDINFO_BUTTON_ID = 'ne-worldinfo-header-button';
const QUICK_REPLY_SET_NAME = 'Note Editor';
const QUICK_REPLY_AUTOMATION_PREFIX = 'note-editor.launcher';
const QUICK_REPLY_RETRY_DELAY_MS = 800;
const QUICK_REPLY_RETRY_MAX_ATTEMPTS = 15;

const managerState = {
    unsubscribeSettings: null,
    shortcutConfig: null,
    shortcutListener: null,
    worldInfoObserverCleanup: null,
    quickReplyConfig: null,
    quickReplyRetryTimer: null,
    quickReplyRetryAttempts: 0,
};

export function initializeLauncherManager() {
    if (managerState.unsubscribeSettings) {
        return;
    }

    managerState.unsubscribeSettings = subscribeSettings((settings) => {
        syncLaunchers(settings);
    });
}

function syncLaunchers(settings) {
    const integrations = settings?.integrations ?? {};
    syncWandButton(integrations.wandMenu);
    syncSlashCommands();
    syncDesktopShortcuts(integrations.desktopShortcuts);
    syncWorldInfoButton(integrations.worldInfoButton);
    void syncQuickReplyIntegration(integrations.quickReply);
}

function syncWandButton(config = {}) {
    const menu = getExtensionsMenuElement();
    const existingButton = document.getElementById(WAND_BUTTON_ID);
    if (!config.enabled || !menu) {
        existingButton?.remove();
        return;
    }

    const button = existingButton instanceof HTMLElement ? existingButton : document.createElement('div');
    button.id = WAND_BUTTON_ID;
    button.className = 'list-group-item flex-container flexGap5 interactable';
    button.tabIndex = 0;
    button.innerHTML = `
        <i class="fa-solid fa-book-open" aria-hidden="true"></i>
        <span>Note Editor</span>
    `;
    button.onclick = () => {
        void runLauncherAction(LAUNCHER_ACTION_OPEN);
    };
    button.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        void runLauncherAction(LAUNCHER_ACTION_OPEN);
    };

    if (!button.isConnected) {
        menu.appendChild(button);
    }
}

function syncSlashCommands() {
    unregisterLegacySlashCommands();

    SLASH_COMMAND_SPECS.forEach((command) => {
        registerPluginSlashCommand({
            name: command.name,
            helpString: t(command.helpKey),
            callback: async () => {
                await runLauncherAction(command.actionId);
                return '';
            },
        });
    });
}

function unregisterLegacySlashCommands() {
    LEGACY_SLASH_COMMAND_NAMES.forEach((name) => {
        unregisterPluginSlashCommand(name);
    });
}

function syncDesktopShortcuts(config = {}) {
    managerState.shortcutConfig = config;
    if (!config.enabled) {
        if (managerState.shortcutListener) {
            window.removeEventListener('keydown', managerState.shortcutListener);
            managerState.shortcutListener = null;
        }
        return;
    }

    if (managerState.shortcutListener) {
        return;
    }

    managerState.shortcutListener = (event) => {
        if (
            isMobileViewport()
            || (isEditableShortcutTarget(event.target) && !isNoteEditorCanvasShortcutTarget(event.target))
        ) {
            return;
        }

        const actionId = resolveShortcutAction(event, managerState.shortcutConfig);
        if (!actionId) {
            return;
        }

        event.preventDefault();
        void runLauncherAction(actionId);
    };
    window.addEventListener('keydown', managerState.shortcutListener);
}

function syncWorldInfoButton(config = {}) {
    if (!config.enabled) {
        managerState.worldInfoObserverCleanup?.();
        managerState.worldInfoObserverCleanup = null;
        document.getElementById(WORLDINFO_BUTTON_ID)?.remove();
        return;
    }

    if (!managerState.worldInfoObserverCleanup) {
        managerState.worldInfoObserverCleanup = observeWorldInfoMutations(() => {
            mountWorldInfoButton();
        });
    }

    mountWorldInfoButton();
}

function mountWorldInfoButton() {
    const headerRow = getWorldInfoHeaderRowElement();
    const existingButton = document.getElementById(WORLDINFO_BUTTON_ID);
    if (!headerRow) {
        existingButton?.remove();
        return;
    }

    const button = existingButton instanceof HTMLButtonElement ? existingButton : document.createElement('button');
    button.id = WORLDINFO_BUTTON_ID;
    button.type = 'button';
    button.className = 'menu_button interactable ne-worldinfo-header-button';
    button.title = t('settings.integrations.worldInfoButton.tooltip');
    button.setAttribute('aria-label', t('settings.integrations.worldInfoButton.tooltip'));
    button.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i>';
    button.onclick = () => {
        void runLauncherAction(LAUNCHER_ACTION_OPEN_LOREBOOK);
    };

    if (button.parentElement !== headerRow) {
        headerRow.appendChild(button);
    }
}

async function syncQuickReplyIntegration(config = {}) {
    managerState.quickReplyConfig = {
        enabled: Boolean(config?.enabled),
        includeNotes: config?.includeNotes !== false,
        includeLore: config?.includeLore !== false,
        includeNew: config?.includeNew !== false,
    };

    if (!hasQuickReplyApi()) {
        queueQuickReplyRetry();
        return;
    }

    clearQuickReplyRetry();
    managerState.quickReplyRetryAttempts = 0;

    await Promise.resolve(ensureQuickReplySetExists(QUICK_REPLY_SET_NAME, {
        disableSend: false,
        placeBeforeInput: false,
        injectInput: false,
    }));

    syncQuickReplyButtons(QUICK_REPLY_SET_NAME, managerState.quickReplyConfig);
    detachQuickReplySet(QUICK_REPLY_SET_NAME, 'all');
    if (managerState.quickReplyConfig.enabled) {
        attachQuickReplySet(QUICK_REPLY_SET_NAME, 'global');
    }
}

function queueQuickReplyRetry() {
    if (
        managerState.quickReplyRetryTimer
        || managerState.quickReplyRetryAttempts >= QUICK_REPLY_RETRY_MAX_ATTEMPTS
    ) {
        return;
    }

    managerState.quickReplyRetryAttempts += 1;
    managerState.quickReplyRetryTimer = window.setTimeout(() => {
        managerState.quickReplyRetryTimer = null;
        void syncQuickReplyIntegration(managerState.quickReplyConfig);
    }, QUICK_REPLY_RETRY_DELAY_MS);
}

function clearQuickReplyRetry() {
    if (!managerState.quickReplyRetryTimer) {
        return;
    }

    window.clearTimeout(managerState.quickReplyRetryTimer);
    managerState.quickReplyRetryTimer = null;
}

function syncQuickReplyButtons(setName, config = {}) {
    getQuickReplyButtonSpecs(config).forEach((spec) => {
        if (spec.enabled) {
            ensureQuickReplyButton(setName, {
                automationId: spec.automationId,
                label: spec.label,
                title: spec.title,
                icon: '',
                message: spec.message,
                showLabel: true,
            });
            return;
        }

        removeQuickReplyButtonByAutomationId(setName, spec.automationId);
    });
}

function getQuickReplyButtonSpecs(config = {}) {
    return [
        {
            enabled: config.includeNotes !== false,
            automationId: `${QUICK_REPLY_AUTOMATION_PREFIX}.notes`,
            label: t('settings.integrations.quickReply.button.notebook'),
            title: t('settings.integrations.quickReply.button.notebookTitle'),
            message: '/ne-notebook',
        },
        {
            enabled: config.includeLore !== false,
            automationId: `${QUICK_REPLY_AUTOMATION_PREFIX}.lore`,
            label: t('settings.integrations.quickReply.button.lorebook'),
            title: t('settings.integrations.quickReply.button.lorebookTitle'),
            message: '/ne-lorebook',
        },
        {
            enabled: config.includeNew !== false,
            automationId: `${QUICK_REPLY_AUTOMATION_PREFIX}.new`,
            label: t('settings.integrations.quickReply.button.new'),
            title: t('settings.integrations.quickReply.button.newTitle'),
            message: '/ne-new',
        },
    ];
}

function resolveShortcutAction(event, config = {}) {
    if (matchesShortcutBinding(event, config.openNotes)) {
        return LAUNCHER_ACTION_OPEN_NOTE;
    }
    if (matchesShortcutBinding(event, config.openLorebook)) {
        return LAUNCHER_ACTION_OPEN_LOREBOOK;
    }
    if (matchesShortcutBinding(event, config.createCurrent)) {
        return LAUNCHER_ACTION_CREATE_CURRENT;
    }

    return '';
}
