/* eslint-disable react-refresh/only-export-components */
import PropTypes from "prop-types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import "../styles/Dialog.css";

const DialogContext = createContext(null);

const toneIcons = {
    danger: AlertTriangle,
    warning: TriangleAlert,
    info: Info,
};

const normalizeDialogOptions = (options, fallbackMessage) => {
    if (typeof options === "string") {
        return { message: options || fallbackMessage };
    }

    return { ...options };
};

export const DialogProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);

    const currentDialog = queue[0] ?? null;

    const closeDialog = useCallback((result) => {
        setQueue((previousQueue) => {
            const activeDialog = previousQueue[0];
            if (!activeDialog) return previousQueue;

            activeDialog.resolve(result);
            return previousQueue.slice(1);
        });
    }, []);

    useEffect(() => {
        if (!currentDialog) return undefined;

        const handleKeyDown = (event) => {
            if (event.key !== "Escape") return;

            event.preventDefault();
            closeDialog(currentDialog.kind === "confirm" ? false : true);
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeDialog, currentDialog]);

    useEffect(() => {
        if (!currentDialog) return undefined;

        const { overflow } = document.body.style;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = overflow;
        };
    }, [currentDialog]);

    const contextValue = useMemo(() => {
        const enqueueDialog = (dialogConfig) => new Promise((resolve) => {
            setQueue((previousQueue) => [
                ...previousQueue,
                {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    ...dialogConfig,
                    resolve,
                },
            ]);
        });

        return {
            showAlert: (options) => {
                const normalized = normalizeDialogOptions(options, "Something happened.");

                return enqueueDialog({
                    kind: "alert",
                    tone: "info",
                    title: normalized.title || "Heads up",
                    message: normalized.message || "Something happened.",
                    confirmText: normalized.confirmText || "Okay",
                });
            },
            showConfirm: (options) => {
                const normalized = normalizeDialogOptions(options, "Please confirm this action.");

                return enqueueDialog({
                    kind: "confirm",
                    tone: normalized.tone || "danger",
                    title: normalized.title || "Confirm action",
                    message: normalized.message || "Please confirm this action.",
                    confirmText: normalized.confirmText || "Confirm",
                    cancelText: normalized.cancelText || "Cancel",
                });
            },
        };
    }, []);

    const DialogIcon = currentDialog ? toneIcons[currentDialog.tone] || Info : Info;

    return (
        <DialogContext.Provider value={contextValue}>
            {children}
            {currentDialog && createPortal(
                <div
                    className="app-dialog-backdrop"
                    onClick={() => closeDialog(currentDialog.kind === "confirm" ? false : true)}
                    role="presentation"
                >
                    <div
                        className={`app-dialog app-dialog-${currentDialog.tone}`}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="app-dialog-title"
                        aria-describedby="app-dialog-message"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="app-dialog-icon-wrap">
                            <DialogIcon size={22} strokeWidth={2.3} />
                        </div>
                        <div className="app-dialog-body">
                            <h2 id="app-dialog-title">{currentDialog.title}</h2>
                            <p id="app-dialog-message">{currentDialog.message}</p>
                        </div>
                        <div className="app-dialog-actions">
                            {currentDialog.kind === "confirm" && (
                                <button
                                    type="button"
                                    className="app-dialog-btn app-dialog-btn-secondary"
                                    onClick={() => closeDialog(false)}
                                >
                                    {currentDialog.cancelText}
                                </button>
                            )}
                            <button
                                type="button"
                                className={`app-dialog-btn ${currentDialog.tone === "danger" ? "app-dialog-btn-danger" : "app-dialog-btn-primary"}`}
                                onClick={() => closeDialog(true)}
                            >
                                {currentDialog.confirmText}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </DialogContext.Provider>
    );
};

export const useDialog = () => {
    const context = useContext(DialogContext);

    if (!context) {
        throw new Error("useDialog must be used within a DialogProvider.");
    }

    return context;
};

DialogProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
