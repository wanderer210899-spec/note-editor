// src/ui-feedback.js
// Responsible for: browser-level feedback helpers that are not SillyTavern-specific.

export function runWithSuppressedToasts(task, { restoreDelayMs = 900 } = {}) {
    if (typeof task !== 'function') {
        return undefined;
    }

    const toastr = window.toastr;
    if (!toastr) {
        return task();
    }

    const methodNames = ['success', 'info', 'warning', 'error'];
    const originals = new Map();
    methodNames.forEach((name) => {
        if (typeof toastr[name] === 'function') {
            originals.set(name, toastr[name]);
            toastr[name] = () => undefined;
        }
    });

    const restore = () => {
        originals.forEach((original, name) => {
            toastr[name] = original;
        });
        clearVisibleToasts();
    };

    clearVisibleToasts();

    try {
        const result = task();
        if (result && typeof result.finally === 'function') {
            return result.finally(() => {
                window.setTimeout(restore, restoreDelayMs);
            });
        }

        window.setTimeout(restore, restoreDelayMs);
        return result;
    } catch (error) {
        restore();
        throw error;
    }
}

function clearVisibleToasts() {
    window.toastr?.clear?.();
    document.querySelectorAll('.toast, .toastify, #toast-container .toast').forEach((element) => {
        element.remove();
    });
}
