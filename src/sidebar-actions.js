// src/sidebar-actions.js
// Responsible for: sidebar row actions, folder prompts, and note selection flow.

import {
    exportNotesToDirectory,
    pickImportedNoteFiles,
    pickImportedNoteFolder,
} from './note-transfer.js';
import { normaliseDocumentSource } from './document-source.js';
import { t } from './i18n/index.js';
import { createLorebookFile, deleteLorebookFile } from './services/st-context.js';
import { runWithSuppressedToasts } from './ui-feedback.js';
import { openDocumentInSource } from './document-actions.js';
import { getLorePositionMeta } from './state/lorebook-adapter.js';
import {
    addManualLorebookToWorkspace,
    deleteLorebookEntry,
    getLorebookState,
    refreshLorebookWorkspace,
    removeLorebookWorkspaceSlot,
    replaceLorebookWorkspaceSlot,
    setLorebookEntryDepth,
    setLorebookEntryOrder,
    setLorebookEntryPosition,
    setActiveLorebook,
    toggleLorebookWorkspaceSlotExpansion,
    toggleLorebookEntryActivation,
    toggleLorebookEntryEnabled,
    toggleLorebookPositionSection,
} from './state/lorebook-store.js';
import {
    collectFolderAndDescendantIds,
    collectNoteIdsInFolder,
    createFolder,
    deleteFolder,
    deleteNote,
    getFolderById,
    getNotesState,
    importNotesFromTransfer,
    moveNoteToFolder,
    renameFolder,
    toggleNotePinned,
} from './state/notes-store.js';
import {
    getSettingsState,
    getSettingsPanelFontScaleDefault,
    setSettingsPanelFontScale,
} from './state/settings-store.js';
import {
    clearSessionTagFilter,
    getSessionState,
    setSessionFiltersOpen,
} from './state/session-store.js';

export function handleSidebarAction(action, actionButton, {
    createNote,
    getUiState,
    renderSidebarController,
    resetSidebarControllerState,
    closeSidebar,
    applySearchTagSuggestion,
} = {}) {
    const activeSource = normaliseDocumentSource(getSessionState().activeSource);
    const isNoteSource = activeSource === 'note';

    switch (action) {
        case 'close-sidebar':
            if (getUiState().settingsPanelOpen) {
                getUiState().settingsPanelOpen = false;
                getUiState().noteExportPickerOpen = false;
                renderSidebarController();
            } else {
                closeSidebar();
            }
            return true;
        case 'new-document':
        case 'new-note':
            getUiState().settingsPanelOpen = false;
            if (!isNoteSource) {
                openLoreEntryCreationDialogState(getUiState(), {
                    lorebookId: getLorebookState()?.settings?.activeLorebookId ?? '',
                });
                renderSidebarController();
                return true;
            }

            createNote?.();
            resetSidebarControllerState();
            return true;
        case 'create-lore-entry-in-position': {
            if (isNoteSource) {
                return true;
            }

            getUiState().settingsPanelOpen = false;
            openLoreEntryCreationDialogState(getUiState(), {
                lorebookId: actionButton.dataset.lorebookId,
                positionKey: actionButton.dataset.positionKey,
            });
            renderSidebarController();
            return true;
        }
        case 'create-lore-entry-in-lorebook':
            if (isNoteSource) {
                return true;
            }
            getUiState().settingsPanelOpen = false;
            openLoreEntryCreationDialogState(getUiState(), {
                lorebookId: actionButton.dataset.lorebookId,
            });
            renderSidebarController();
            return true;
        case 'refresh-lorebook-workspace':
            void refreshLorebookWorkspace();
            return true;
        case 'refresh-active-lorebook':
            void setActiveLorebook(actionButton.dataset.lorebookId, { forceRefresh: true });
            return true;
        case 'go-to-lorebook-page': {
            const pageKey = String(actionButton.dataset.pageKey ?? '').trim();
            const page = Number(actionButton.dataset.page);
            if (!pageKey || !Number.isFinite(page)) {
                return true;
            }

            const uiState = getUiState();
            uiState.lorebookPageById = {
                ...(uiState.lorebookPageById ?? {}),
                [pageKey]: Math.max(1, Math.trunc(page)),
            };
            renderSidebarController();
            return true;
        }
        case 'add-workspace-lorebook':
        case 'open-add-workspace-lorebook-picker': {
            const uiState = getUiState();
            uiState.settingsPanelOpen = false;
            closeLoreEntryCreationDialogState(uiState);
            uiState.lorebookPickerMode = 'add';
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            uiState.revealedRowKey = '';
            renderSidebarController();
            return true;
        }
        case 'open-replace-workspace-lorebook-picker': {
            const slotId = String(actionButton.dataset.slotId ?? '').trim();
            if (!slotId) {
                return true;
            }

            const uiState = getUiState();
            uiState.settingsPanelOpen = false;
            closeLoreEntryCreationDialogState(uiState);
            uiState.lorebookPickerMode = 'replace';
            uiState.lorebookPickerSlotId = slotId;
            uiState.lorebookPickerSearch = '';
            uiState.revealedRowKey = '';
            renderSidebarController();
            return true;
        }
        case 'close-workspace-lorebook-picker': {
            const uiState = getUiState();
            uiState.lorebookPickerMode = null;
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            renderSidebarController();
            return true;
        }
        case 'add-workspace-lorebook-option': {
            const lorebookName = String(actionButton.dataset.lorebookId ?? '').trim();
            if (!lorebookName) {
                return true;
            }

            const uiState = getUiState();
            uiState.lorebookPickerMode = null;
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            void addManualLorebookToWorkspace(lorebookName);
            return true;
        }
        case 'create-new-lorebook': {
            const lorebookName = String(actionButton.dataset.lorebookName ?? '').trim();
            if (!lorebookName) {
                return true;
            }

            const uiState = getUiState();
            uiState.lorebookPickerMode = null;
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            void createAndAddLorebookToWorkspace(lorebookName);
            return true;
        }
        case 'replace-workspace-lorebook-option': {
            const slotId = String(actionButton.dataset.slotId ?? '').trim();
            const lorebookName = String(actionButton.dataset.lorebookId ?? '').trim();
            if (!slotId || !lorebookName) {
                return true;
            }

            const uiState = getUiState();
            uiState.lorebookPickerMode = null;
            uiState.lorebookPickerSlotId = null;
            uiState.lorebookPickerSearch = '';
            void replaceLorebookWorkspaceSlot(slotId, lorebookName);
            return true;
        }
        case 'remove-workspace-lorebook': {
            removeLorebookWorkspaceSlot(actionButton.dataset.slotId);
            const uiState = getUiState();
            if (uiState.lorebookPickerSlotId === String(actionButton.dataset.slotId ?? '')) {
                uiState.lorebookPickerMode = null;
                uiState.lorebookPickerSlotId = null;
                uiState.lorebookPickerSearch = '';
            }
            uiState.revealedRowKey = '';
            return true;
        }
        case 'open-delete-panel': {
            const uiState = getUiState();
            uiState.settingsPanelOpen = false;
            uiState.deletePanelOpen = true;
            uiState.lorebookPickerMode = null;
            closeLoreEntryCreationDialogState(uiState);
            uiState.bulkSelectedEntryKeys = new Set();
            uiState.bulkDeleteLorebookSearch = '';
            uiState.bulkSelectedLorebookNames = new Set();
            renderSidebarController();
            return true;
        }
        case 'close-delete-panel': {
            const uiState = getUiState();
            uiState.deletePanelOpen = false;
            uiState.bulkSelectedEntryKeys = new Set();
            uiState.bulkDeleteLorebookSearch = '';
            uiState.bulkSelectedLorebookNames = new Set();
            renderSidebarController();
            return true;
        }
        case 'close-lore-entry-create-dialog':
            closeLoreEntryCreationDialogState(getUiState());
            renderSidebarController();
            return true;
        case 'switch-lore-entry-create-mode': {
            const nextMode = String(actionButton.dataset.mode ?? '').trim() === 'lorebook' ? 'lorebook' : 'entry';
            const uiState = getUiState();
            uiState.loreEntryCreationMode = nextMode;
            renderSidebarController();
            return true;
        }
        case 'confirm-lore-entry-create-dialog': {
            if (isNoteSource) {
                return true;
            }

            const uiState = getUiState();
            const creationMode = uiState.loreEntryCreationMode === 'lorebook' ? 'lorebook' : 'entry';
            if (creationMode === 'lorebook') {
                const lorebookName = String(uiState.loreEntryCreationLorebookName ?? '').trim();
                if (!lorebookName) {
                    return true;
                }

                closeLoreEntryCreationDialogState(uiState);
                renderSidebarController();
                void createAndAddLorebookToWorkspace(lorebookName);
                return true;
            }

            const targetLorebookId = String(uiState.loreEntryCreationLorebookId ?? '').trim();
            const targetPositionValue = getLorePositionMeta(uiState.loreEntryCreationPositionKey)?.value;
            const nextPosition = Number.isInteger(targetPositionValue) && targetPositionValue >= 0
                ? targetPositionValue
                : getLorePositionMeta('before_char')?.value;
            const nextOrder = Number.isFinite(Number(uiState.loreEntryCreationOrder))
                ? Math.trunc(Number(uiState.loreEntryCreationOrder))
                : 100;

            closeLoreEntryCreationDialogState(uiState);
            renderSidebarController();
            void (async () => {
                if (targetLorebookId) {
                    await setActiveLorebook(targetLorebookId);
                }

                createNote?.({
                    position: nextPosition,
                    order: nextOrder,
                });
            })();
            return true;
        }
        case 'toggle-bulk-entry-select': {
            const key = String(actionButton.dataset.entryKey ?? '').trim();
            if (!key) {
                return true;
            }
            const uiState = getUiState();
            toggleSelectionId(uiState.bulkSelectedEntryKeys, key);
            renderSidebarController();
            return true;
        }
        case 'toggle-bulk-lorebook-select': {
            const name = String(actionButton.dataset.lorebookName ?? '').trim();
            if (!name) {
                return true;
            }
            const uiState = getUiState();
            toggleSelectionId(uiState.bulkSelectedLorebookNames, name);
            renderSidebarController();
            return true;
        }
        case 'bulk-delete-entries': {
            const uiState = getUiState();
            const keys = [...(uiState.bulkSelectedEntryKeys ?? [])];
            if (keys.length === 0) {
                return true;
            }
            const confirmMessage = keys.length === 1
                ? t('confirm.bulkDeleteEntries.one')
                : t('confirm.bulkDeleteEntries.many', { count: keys.length });
            if (!window.confirm(confirmMessage)) {
                return true;
            }
            keys.forEach((key) => {
                const [lorebookId, entryId] = key.split(':');
                if (lorebookId && entryId) {
                    deleteLorebookEntry(lorebookId, entryId);
                }
            });
            uiState.bulkSelectedEntryKeys = new Set();
            uiState.deletePanelOpen = false;
            resetSidebarControllerState();
            return true;
        }
        case 'bulk-delete-lorebooks': {
            const uiState = getUiState();
            const names = [...(uiState.bulkSelectedLorebookNames ?? [])];
            if (names.length === 0) {
                return true;
            }
            const confirmMessage = names.length === 1
                ? t('confirm.bulkDeleteLorebooks.one')
                : t('confirm.bulkDeleteLorebooks.many', { count: names.length });
            if (!window.confirm(confirmMessage)) {
                return true;
            }
            void (async () => {
                const workspaceLorebooks = getLorebookState()?.settings?.workspaceLorebooks ?? [];
                for (const name of names) {
                    const slot = workspaceLorebooks.find((lb) => lb.id === name);
                    if (slot) {
                        removeLorebookWorkspaceSlot(slot.slotId);
                    }
                    await deleteLorebookFile(name);
                }
                await refreshLorebookWorkspace();
                resetSidebarControllerState();
            })();
            return true;
        }
        case 'toggle-workspace-lorebook-expansion':
            void toggleLorebookWorkspaceSlotExpansion(actionButton.dataset.slotId);
            getUiState().revealedRowKey = '';
            return true;
        case 'toggle-lorebook-position':
            toggleLorebookPositionSection(actionButton.dataset.lorebookId, actionButton.dataset.positionKey);
            return true;
        case 'toggle-note-folder-collapse': {
            if (!isNoteSource) {
                return true;
            }

            const folderId = String(actionButton.dataset.folderId ?? '').trim();
            if (!folderId) {
                return true;
            }

            const uiState = getUiState();
            if (uiState.collapsedFolderIds.has(folderId)) {
                uiState.collapsedFolderIds.delete(folderId);
            } else {
                uiState.collapsedFolderIds.add(folderId);
            }

            renderSidebarController();
            return true;
        }
        case 'toggle-lore-entry-enabled':
            toggleLorebookEntryEnabled(actionButton.dataset.lorebookId, actionButton.dataset.entryId);
            getUiState().revealedRowKey = '';
            return true;
        case 'toggle-lore-entry-activation':
            if (!actionButton.disabled) {
                toggleLorebookEntryActivation(actionButton.dataset.lorebookId, actionButton.dataset.entryId);
            }
            getUiState().revealedRowKey = '';
            return true;
        case 'delete-lore-entry':
            confirmAndDelete(
                t('confirm.deleteLoreEntry'),
                () => deleteLorebookEntry(actionButton.dataset.lorebookId, actionButton.dataset.entryId),
                resetSidebarControllerState,
            );
            return true;
        case 'new-folder':
            if (!isNoteSource) {
                return true;
            }
            promptForFolder(t('prompt.folder.name'), t('prompt.folder.default'), (folderName) => createFolder(folderName));
            resetSidebarControllerState();
            return true;
        case 'new-note-in-folder': {
            if (!isNoteSource) {
                return true;
            }

            const folderId = String(actionButton.dataset.folderId ?? '').trim();
            if (!folderId) {
                return true;
            }

            createNote?.({ folderId });
            resetSidebarControllerState();
            return true;
        }
        case 'new-subfolder': {
            if (!isNoteSource) {
                return true;
            }

            const parentFolderId = String(actionButton.dataset.folderId ?? '').trim();
            if (!parentFolderId) {
                return true;
            }

            promptForFolder(t('prompt.folder.name'), t('prompt.folder.default'), (folderName) => createFolder(folderName, parentFolderId));
            resetSidebarControllerState();
            return true;
        }
        case 'rename-folder-row': {
            if (!isNoteSource) {
                return true;
            }

            const folderId = actionButton.dataset.folderId;
            if (!folderId) {
                return true;
            }

            const folder = getFolderById(folderId);
            promptForFolder(t('prompt.folder.rename'), folder?.name ?? '', (folderName) => renameFolder(folderId, folderName));
            resetSidebarControllerState();
            return true;
        }
        case 'delete-folder-row':
            if (!isNoteSource) {
                return true;
            }
            confirmAndDelete(
                t('confirm.deleteFolder', { name: t('notes.section.unfiled') }),
                () => runQuietMutation(() => deleteFolder(actionButton.dataset.folderId)),
                resetSidebarControllerState,
            );
            return true;
        case 'toggle-filters':
            setSessionFiltersOpen(!getSessionState().filtersOpen);
            return true;
        case 'clear-tag-filter':
            setSessionFiltersOpen(true);
            clearSessionTagFilter();
            return true;
        case 'apply-search-tag-suggestion':
            applySearchTagSuggestion(actionButton.dataset.tag || '');
            return true;
        case 'toggle-note-pin':
            if (!isNoteSource) {
                return true;
            }
            toggleNotePinned(actionButton.dataset.noteId);
            getUiState().revealedRowKey = '';
            return true;
        case 'toggle-move-menu': {
            if (!isNoteSource) {
                return true;
            }
            const uiState = getUiState();
            uiState.moveMenuNoteId = uiState.moveMenuNoteId === actionButton.dataset.noteId
                ? null
                : actionButton.dataset.noteId;
            uiState.revealedRowKey = `note:${actionButton.dataset.noteId}`;
            renderSidebarController();
            return true;
        }
        case 'move-note-row':
            if (!isNoteSource) {
                return true;
            }
            moveNoteToFolder(actionButton.dataset.noteId, actionButton.dataset.folderId || null);
            resetSidebarControllerState();
            return true;
        case 'delete-note-row':
            if (!isNoteSource) {
                return true;
            }
            confirmAndDelete(
                t('confirm.deleteNote'),
                () => runQuietMutation(() => deleteNote(actionButton.dataset.noteId)),
                resetSidebarControllerState,
            );
            return true;
        case 'toggle-note-bulk-select-mode': {
            if (!isNoteSource) {
                return true;
            }

            const uiState = getUiState();
            uiState.noteBulkSelectMode = !uiState.noteBulkSelectMode;
            uiState.bulkSelectedNoteIds = new Set();
            uiState.bulkSelectedFolderIds = new Set();
            renderSidebarController();
            return true;
        }
        case 'toggle-bulk-note-select': {
            if (!isNoteSource) {
                return true;
            }

            const noteId = String(actionButton.dataset.noteId ?? '').trim();
            if (!noteId) {
                return true;
            }

            const uiState = getUiState();
            toggleSelectionId(uiState.bulkSelectedNoteIds, noteId);

            renderSidebarController();
            return true;
        }
        case 'toggle-bulk-folder-select': {
            if (!isNoteSource) {
                return true;
            }

            const folderId = String(actionButton.dataset.folderId ?? '').trim();
            if (!folderId) {
                return true;
            }

            const uiState = getUiState();
            const folderIds = collectFolderAndDescendantIds(folderId);
            const noteIds = collectNoteIdsInFolder(folderId);
            if (uiState.bulkSelectedFolderIds.has(folderId)) {
                folderIds.forEach((id) => uiState.bulkSelectedFolderIds.delete(id));
                noteIds.forEach((noteId) => uiState.bulkSelectedNoteIds.delete(noteId));
            } else {
                folderIds.forEach((id) => uiState.bulkSelectedFolderIds.add(id));
                noteIds.forEach((noteId) => uiState.bulkSelectedNoteIds.add(noteId));
            }

            renderSidebarController();
            return true;
        }
        case 'bulk-delete-notes-and-folders': {
            if (!isNoteSource) {
                return true;
            }

            const uiState = getUiState();
            const noteIds = [...uiState.bulkSelectedNoteIds];
            const folderIds = [...uiState.bulkSelectedFolderIds];
            const totalCount = noteIds.length + folderIds.length;
            if (totalCount === 0) {
                return true;
            }

            const confirmMessage = totalCount === 1
                ? t('confirm.bulkDeleteNotes.one')
                : t('confirm.bulkDeleteNotes.many', { count: totalCount });
            if (!window.confirm(confirmMessage)) {
                return true;
            }

            // Reset bulk state BEFORE deletions so the re-renders triggered
            // by store changes see the clean state (no stuck delete bar).
            uiState.noteBulkSelectMode = false;
            uiState.bulkSelectedNoteIds = new Set();
            uiState.bulkSelectedFolderIds = new Set();
            folderIds.forEach((id) => deleteFolder(id));
            noteIds.forEach((id) => deleteNote(id));
            resetSidebarControllerState();
            return true;
        }
        case 'open-settings-panel': {
            const uiState = getUiState();
            uiState.settingsPanelOpen = true;
            uiState.deletePanelOpen = false;
            uiState.loreEntryCreationOpen = false;
            uiState.lorebookPickerMode = null;
            uiState.noteExportPickerOpen = false;
            renderSidebarController();
            return true;
        }
        case 'close-settings-panel':
            getUiState().settingsPanelOpen = false;
            getUiState().noteExportPickerOpen = false;
            renderSidebarController();
            return true;
        case 'open-note-export-picker': {
            const uiState = getUiState();
            uiState.noteExportPickerOpen = true;
            renderSidebarController();
            return true;
        }
        case 'close-note-export-picker': {
            const uiState = getUiState();
            uiState.noteExportPickerOpen = false;
            renderSidebarController();
            return true;
        }
        case 'reset-panel-font-scale':
            setSettingsPanelFontScale(getSettingsPanelFontScaleDefault());
            renderSidebarController();
            return true;
        case 'toggle-note-export-folder': {
            const exportFolderId = String(actionButton.dataset.folderId ?? '').trim();
            if (!exportFolderId) {
                renderSidebarController();
                return true;
            }
            const exportSelection = getNoteTransferSelectionState(getUiState());
            const exportFolderIds = collectFolderAndDescendantIds(exportFolderId);
            if (exportSelection.selectedFolderIds.has(exportFolderId)) {
                exportFolderIds.forEach((id) => exportSelection.selectedFolderIds.delete(id));
            } else {
                exportFolderIds.forEach((id) => exportSelection.selectedFolderIds.add(id));
            }
            renderSidebarController();
            return true;
        }
        case 'toggle-note-export-note': {
            toggleSelectionId(getNoteTransferSelectionState(getUiState()).selectedNoteIds, actionButton.dataset.noteId);
            renderSidebarController();
            return true;
        }
        case 'select-all-note-exports': {
            const selection = getNoteTransferSelectionState(getUiState());
            const notesSettings = getNotesState().settings;
            selection.selectedFolderIds = new Set((notesSettings.folders ?? []).map((folder) => folder.id));
            selection.selectedNoteIds = new Set((notesSettings.notes ?? []).map((note) => note.id));
            renderSidebarController();
            return true;
        }
        case 'clear-note-exports': {
            const selection = getNoteTransferSelectionState(getUiState());
            selection.selectedFolderIds = new Set();
            selection.selectedNoteIds = new Set();
            renderSidebarController();
            return true;
        }
        case 'import-note-files':
            void runNoteImport({
                picker: pickImportedNoteFiles,
                renderSidebarController,
            });
            return true;
        case 'import-note-folder':
            void runNoteImport({
                picker: pickImportedNoteFolder,
                renderSidebarController,
            });
            return true;
        case 'export-selected-notes':
            void runNoteExport({
                selectionState: getNoteTransferSelectionState(getUiState()),
                renderSidebarController,
            });
            return true;
        default:
            return false;
    }
}

export function handleSidebarFieldCommit(field, { getUiState } = {}) {
    const action = field?.dataset?.fieldAction;
    if (!action) {
        return false;
    }

    switch (action) {
        case 'set-lore-entry-order':
            return setLorebookEntryOrder(field.dataset.lorebookId, field.dataset.entryId, field.value);
        case 'set-lore-entry-position':
            return setLorebookEntryPosition(field.dataset.lorebookId, field.dataset.entryId, field.value);
        case 'set-lore-entry-depth':
            return setLorebookEntryDepth(field.dataset.lorebookId, field.dataset.entryId, field.value);
        default:
            if (getUiState) {
                getUiState().revealedRowKey = '';
            }
            return false;
    }
}

export function handleSidebarDocumentSelection(documentButton, { closeSidebarAfterDocumentSelection, closeTagsMenu } = {}) {
    if (!documentButton?.dataset.documentId) {
        return false;
    }

    const activeSource = normaliseDocumentSource(getSessionState().activeSource);
    if (activeSource === 'lorebook' && documentButton.dataset.lorebookId) {
        void (async () => {
            await setActiveLorebook(documentButton.dataset.lorebookId);
            openDocumentInSource(documentButton.dataset.documentId, activeSource);
            closeSidebarAfterDocumentSelection();
            closeTagsMenu();
        })();
        return true;
    }

    openDocumentInSource(documentButton.dataset.documentId, activeSource);
    closeSidebarAfterDocumentSelection();
    closeTagsMenu();
    return true;
}

function promptForFolder(promptLabel, defaultValue, mutator) {
    const folderName = window.prompt(promptLabel, defaultValue);
    if (folderName === null) {
        return;
    }

    runQuietMutation(() => mutator(folderName));
}

function runQuietMutation(mutator) {
    return runWithSuppressedToasts(mutator);
}

function confirmAndDelete(message, fn, resetState) {
    if (window.confirm(message)) {
        fn();
    }
    resetState();
}

async function createAndAddLorebookToWorkspace(lorebookName) {
    const trimmedLorebookName = String(lorebookName ?? '').trim();
    if (!trimmedLorebookName) {
        return false;
    }

    const created = await createLorebookFile(trimmedLorebookName);
    if (!created) {
        return false;
    }

    const addedToWorkspace = await addManualLorebookToWorkspace(trimmedLorebookName);
    if (!addedToWorkspace) {
        await refreshLorebookWorkspace();
    }

    return addedToWorkspace;
}

function openLoreEntryCreationDialogState(uiState, {
    lorebookId = '',
    positionKey = '',
    order = 100,
} = {}) {
    const settings = getLorebookState()?.settings ?? {};
    const workspaceLorebooks = Array.isArray(settings.workspaceLorebooks) ? settings.workspaceLorebooks : [];
    const validLorebookId = workspaceLorebooks.some((lorebook) => lorebook.id === String(lorebookId ?? '').trim())
        ? String(lorebookId).trim()
        : workspaceLorebooks.find((lorebook) => lorebook.id === settings.activeLorebookId)?.id
            ?? workspaceLorebooks[0]?.id
            ?? '';
    const positionOptions = (Array.isArray(settings.positionOrder) ? settings.positionOrder : [])
        .filter((candidate) => candidate !== 'other');
    const validPositionKey = positionOptions.includes(String(positionKey ?? '').trim())
        ? String(positionKey).trim()
        : positionOptions.includes('before_char')
            ? 'before_char'
            : positionOptions[0] ?? '';

    uiState.lorebookPickerMode = null;
    uiState.lorebookPickerSlotId = null;
    uiState.lorebookPickerSearch = '';
    uiState.settingsPanelOpen = false;
    uiState.deletePanelOpen = false;
    uiState.loreEntryCreationOpen = true;
    uiState.loreEntryCreationMode = 'entry';
    uiState.loreEntryCreationLorebookId = validLorebookId;
    uiState.loreEntryCreationPositionKey = validPositionKey;
    uiState.loreEntryCreationOrder = Number.isFinite(Number(order))
        ? String(Math.trunc(Number(order)))
        : '100';
    uiState.loreEntryCreationLorebookName = '';
    uiState.revealedRowKey = '';
}

function closeLoreEntryCreationDialogState(uiState) {
    uiState.loreEntryCreationOpen = false;
    uiState.loreEntryCreationMode = 'entry';
    uiState.loreEntryCreationLorebookId = '';
    uiState.loreEntryCreationPositionKey = '';
    uiState.loreEntryCreationOrder = '100';
    uiState.loreEntryCreationLorebookName = '';
}

function getNoteTransferSelectionState(uiState) {
    if (!uiState.noteTransferSelection) {
        uiState.noteTransferSelection = {
            selectedFolderIds: new Set(),
            selectedNoteIds: new Set(),
        };
    }

    uiState.noteTransferSelection.selectedFolderIds ??= new Set();
    uiState.noteTransferSelection.selectedNoteIds ??= new Set();
    return uiState.noteTransferSelection;
}

function toggleSelectionId(targetSet, value) {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
        return;
    }

    if (targetSet.has(normalizedValue)) {
        targetSet.delete(normalizedValue);
        return;
    }

    targetSet.add(normalizedValue);
}

async function runNoteImport({ picker, renderSidebarController }) {
    try {
        const picked = await picker();
        if (!picked || picked.totalPicked === 0) {
            return;
        }

        const overwriteExisting = getSettingsState().transferOverwriteExisting === true;
        const result = importNotesFromTransfer(picked.records, { overwriteExisting });
        renderSidebarController();
        window.alert(t('settings.transfer.result.import', {
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            unsupported: picked.skippedUnsupported,
        }));
    } catch (error) {
        console.error('[NoteEditor] Note import failed.', error);
        window.alert(t('settings.transfer.error.import'));
    }
}

async function runNoteExport({ selectionState, renderSidebarController }) {
    try {
        const overwriteExisting = getSettingsState().transferOverwriteExisting === true;
        const result = await exportNotesToDirectory(getNotesState().settings, selectionState, { overwriteExisting });
        if (result.status === 'cancelled' || result.status === 'empty') {
            return;
        }

        renderSidebarController();
        window.alert(t('settings.transfer.result.export', {
            written: result.written,
            overwritten: result.overwritten,
            skipped: result.skipped,
        }));
    } catch (error) {
        console.error('[NoteEditor] Note export failed.', error);
        window.alert(error?.message || t('settings.transfer.error.export'));
    }
}
