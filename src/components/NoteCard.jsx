import { useEffect, useRef, useState, useContext } from "react";
import { db } from "../utils/db";
import { autoGrow, setZIndex, bodyParser, getContrastColor } from "../utils/utils";
import { Loader2, Trash2 } from "lucide-react";
import { NoteContext } from "../context/NotesContext";

const NoteCard = ({ note }) => {
    const cardRef          = useRef(null);
    const textAreaRef      = useRef(null);
    const keyUpTimer       = useRef(null);
    const posRef           = useRef(JSON.parse(note.position));
    const isInteractingRef = useRef(false);
    const ignoreUpdatesUntilRef = useRef(0);
    // Track whether a body save is in-flight so onBlur knows to stay locked
    const bodySavingRef    = useRef(false);

    const { setNotes, setSelectedNote, zoomRef } = useContext(NoteContext);

    const [saving,   setSaving]   = useState(false);
    const [position, setPosition] = useState(() => JSON.parse(note.position));
    const [body,     setBody]     = useState(() => bodyParser(note.body));
    const [rotation]              = useState(() => Math.round(Math.random() * 4) - 2);

    const colors      = JSON.parse(note.colors);
    const headerColor = colors.colorHeader;
    const bodyColor   = colors.colorBody;
    const textColor   = colors.colorText;
    const contrast    = getContrastColor(headerColor);

    // ── Server sync — only apply when not interacting ──────────────
    useEffect(() => {
        if (isInteractingRef.current) return;

        const msLeft = ignoreUpdatesUntilRef.current - Date.now();
        if (msLeft > 0) {
            const t = setTimeout(() => {
                if (!isInteractingRef.current) {
                    const p = JSON.parse(note.position);
                    posRef.current = p;
                    setPosition(p);
                }
            }, msLeft + 10);
            return () => clearTimeout(t);
        }

        const p = JSON.parse(note.position);
        posRef.current = p;
        setPosition(p);
    }, [note.position]); // eslint-disable-line

    useEffect(() => {
        if (isInteractingRef.current) return;

        const msLeft = ignoreUpdatesUntilRef.current - Date.now();
        if (msLeft > 0) {
            const t = setTimeout(() => {
                if (!isInteractingRef.current) {
                    setBody(bodyParser(note.body));
                }
            }, msLeft + 10);
            return () => clearTimeout(t);
        }

        setBody(bodyParser(note.body));
    }, [note.body]); // eslint-disable-line

    useEffect(() => {
        autoGrow(textAreaRef);
        setZIndex(cardRef.current);
    }, []);

    // ── Unmount cleanup ─────────────────────────────────────────────
    useEffect(() => {
        return () => {
            clearTimeout(keyUpTimer.current);
        };
    }, []);

    const noteIdRef = useRef(note.$id);
    useEffect(() => { noteIdRef.current = note.$id; }, [note.$id]);

    // ── Helpers ─────────────────────────────────────────────────────
    const blockPollingFor = (ms) => {
        ignoreUpdatesUntilRef.current = Date.now() + ms;
    };

    const releaseInteraction = () => {
        blockPollingFor(2000);
        isInteractingRef.current = false;
    };

    // ── Save ────────────────────────────────────────────────────────
    const saveData = async (key, value, retryCount = 0) => {
        const currentId = noteIdRef.current;
        
        // If still optimistic, wait for real ID from server to arrive
        if (typeof currentId === "string" && currentId.startsWith("temp-")) {
            if (retryCount < 20) {
                setTimeout(() => saveData(key, value, retryCount + 1), 500);
            } else {
                console.error("Timed out waiting for real note ID to save", key);
            }
            return;
        }

        setSaving(true);
        try {
            await db.notes.update(currentId, { [key]: JSON.stringify(value) });
        } catch (err) {
            console.error("Save failed:", err);
        }
        setSaving(false);
    };

    // ── Delete ──────────────────────────────────────────────────────
    const handleDelete = (e) => {
        e.stopPropagation();
        db.notes.delete(note.$id);
        setNotes(prev => prev.filter(n => n.$id !== note.$id));
    };

    // ── Keyboard save ───────────────────────────────────────────────
    const handleKeyUp = () => {
        clearTimeout(keyUpTimer.current);
        keyUpTimer.current = null;

        isInteractingRef.current = true;

        keyUpTimer.current = setTimeout(async () => {
            bodySavingRef.current = true;
            try {
                if (textAreaRef.current) {
                    await saveData("body", textAreaRef.current.value);
                }
            } finally {
                keyUpTimer.current = null;       // ← CRITICAL: mark timer as done
                bodySavingRef.current = false;
                // Only release if the textarea is no longer focused
                if (document.activeElement !== textAreaRef.current) {
                    releaseInteraction();
                }
            }
        }, 1500);
    };

    // ── Generic drag engine ─────────────────────────────────────────
    const startDrag = (initialScreenX, initialScreenY) => {
        isInteractingRef.current = true;
        setZIndex(cardRef.current);
        setSelectedNote(note);

        let lastX = initialScreenX;
        let lastY = initialScreenY;

        const move = (screenX, screenY) => {
            const dxScreen = screenX - lastX;
            const dyScreen = screenY - lastY;
            lastX = screenX;
            lastY = screenY;

            const z = zoomRef?.current || 1;
            posRef.current = {
                x: posRef.current.x + dxScreen / z,
                y: posRef.current.y + dyScreen / z,
            };
            // Spread into a new object so React sees a new reference and re-renders
            setPosition({ ...posRef.current });
        };

        const end = async () => {
            // Snapshot the position before any async gap
            const finalPos = { ...posRef.current };
            try {
                await saveData("position", finalPos);
            } finally {
                releaseInteraction();
            }
        };

        return { move, end };
    };

    // ── Mouse drag ──────────────────────────────────────────────────
    const mouseDown = (e) => {
        if (e.target.className !== "card-header") return;
        e.preventDefault();

        const { move, end } = startDrag(e.clientX, e.clientY);

        const onMove = (ev) => move(ev.clientX, ev.clientY);
        const onUp   = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup",   onUp);
            end();
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup",   onUp);
    };

    // ── Touch drag ──────────────────────────────────────────────────
    const touchStart = (e) => {
        if (e.target.className !== "card-header") return;
        const t0 = e.touches[0];

        const { move, end } = startDrag(t0.clientX, t0.clientY);

        const onMove = (ev) => {
            ev.preventDefault();
            const t = ev.touches[0];
            move(t.clientX, t.clientY);
        };
        const onEnd = () => {
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend",  onEnd);
            end();
        };
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend",  onEnd);
    };

    // ── Render ──────────────────────────────────────────────────────
    return (
        <div
            ref={cardRef}
            className="card"
            style={{
                left: `${position.x}px`,
                top:  `${position.y}px`,
                backgroundColor: bodyColor,
                "--rotation": `${rotation}deg`,
            }}
        >
            {/* Tape strip */}
            <div className="card-tape" style={{ background: `${headerColor}88` }} />

            {/* Header / Drag Handle */}
            <div
                className="card-header"
                onMouseDown={mouseDown}
                onTouchStart={touchStart}
                style={{ backgroundColor: headerColor }}
            >
                <div className="card-header-left">
                    <button
                        className="card-delete-btn"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={handleDelete}
                        style={{ color: contrast }}
                        title="Delete"
                    >
                        <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                    {saving && (
                        <span className="card-saving" style={{ color: contrast }}>
                            <Loader2 size={12} className="animate-spin" />
                        </span>
                    )}
                </div>

                {note.owner && (
                    <div className="card-author">
                        <div
                            className="card-author-avatar"
                            style={{ background: contrast, color: headerColor }}
                        >
                            {note.owner.username[0].toUpperCase()}
                        </div>
                        <span className="card-author-name" style={{ color: contrast }}>
                            {note.owner.username}
                        </span>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="card-body">
                <textarea
                    ref={textAreaRef}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    onKeyUp={handleKeyUp}
                    onFocus={() => {
                        isInteractingRef.current = true;
                        setZIndex(cardRef.current);
                        setSelectedNote(note);
                    }}
                    onBlur={() => {
                        // If a body save is still in-flight or timer is pending, don't release.
                        // The timer's finally block will call releaseInteraction() instead.
                        if (keyUpTimer.current !== null || bodySavingRef.current) {
                            return;
                        }
                        releaseInteraction();
                    }}
                    onInput={() => autoGrow(textAreaRef)}
                    style={{ color: textColor }}
                    placeholder="Write something..."
                />
            </div>

            {/* Footer */}
            {note.created_at && (
                <div className="card-footer" style={{ color: textColor }}>
                    {new Date(note.created_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric",
                    })}
                </div>
            )}
        </div>
    );
};

export default NoteCard;