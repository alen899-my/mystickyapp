import { useEffect, useRef, useState, useContext } from "react";
import { db } from "../utils/db";
import { autoGrow, setZIndex, bodyParser, getContrastColor } from "../utils/utils";
import { Loader2, Trash2 } from "lucide-react";
import { NoteContext } from "../context/NotesContext";

const NoteCard = ({ note }) => {
    const cardRef          = useRef(null);
    const textAreaRef      = useRef(null);
    const keyUpTimer       = useRef(null);
    const posRef           = useRef(JSON.parse(note.position)); // owns the canonical position
    const isInteractingRef = useRef(false);                     // synchronous guard — no React async timing

    const { setNotes, setSelectedNote, zoomRef } = useContext(NoteContext);

    const [saving,   setSaving]  = useState(false);
    const [position, setPosition] = useState(() => JSON.parse(note.position));
    const [body,     setBody]    = useState(() => bodyParser(note.body));
    const [rotation]             = useState(() => Math.round(Math.random() * 4) - 2);

    const colors      = JSON.parse(note.colors);
    const headerColor = colors.colorHeader;
    const bodyColor   = colors.colorBody;
    const textColor   = colors.colorText;
    const contrast    = getContrastColor(headerColor);

    // ── Server sync — guarded by ref (always instantly accurate) ──
    useEffect(() => {
        if (!isInteractingRef.current) {
            const p = JSON.parse(note.position);
            posRef.current = p;
            setPosition(p);
        }
    }, [note.position]); // eslint-disable-line

    useEffect(() => {
        if (!isInteractingRef.current) {
            setBody(bodyParser(note.body));
        }
    }, [note.body]); // eslint-disable-line

    useEffect(() => {
        autoGrow(textAreaRef);
        setZIndex(cardRef.current);
    }, []);

    // ── Unmount cleanup ───────────────────────────────────────────
    useEffect(() => {
        return () => { clearTimeout(keyUpTimer.current); };
    }, []);

    // ── Save ──────────────────────────────────────────────────────
    const saveData = async (key, value) => {
        setSaving(true);
        try {
            await db.notes.update(note.$id, { [key]: JSON.stringify(value) });
        } catch (err) {
            console.error("Save failed:", err);
        }
        setSaving(false);
    };

    // ── Delete ────────────────────────────────────────────────────
    const handleDelete = (e) => {
        e.stopPropagation();
        db.notes.delete(note.$id);
        setNotes(prev => prev.filter(n => n.$id !== note.$id));
    };

    // ── Keyboard save ─────────────────────────────────────────────
    const handleKeyUp = () => {
        clearTimeout(keyUpTimer.current);
        isInteractingRef.current = true; // stay locked during the debounce window
        keyUpTimer.current = setTimeout(async () => {
            try {
                if (textAreaRef.current) await saveData("body", textAreaRef.current.value);
            } finally {
                // Only release if not focused anymore
                if (document.activeElement !== textAreaRef.current) {
                    isInteractingRef.current = false;
                }
            }
        }, 1500);
    };

    // ── Generic drag engine (shared by mouse + touch) ─────────────
    // lastScreen: {x, y} in screen pixels, updated each event
    // Returns a cleanup function
    const startDrag = (initialScreenX, initialScreenY) => {
        // Synchronously mark as interacting — no React async delay
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

            const z = zoomRef ? zoomRef.current || 1 : 1;
            const newPos = {
                x: posRef.current.x + dxScreen / z,
                y: posRef.current.y + dyScreen / z,
            };
            posRef.current = newPos;
            setPosition({ ...newPos });
        };

        const end = async () => {
            // Keep blocking server sync until position save completes.
            // If we release isInteractingRef BEFORE the save resolves, the
            // poll can fire and reset the position to the old server value → jump.
            try {
                await saveData("position", posRef.current);
            } finally {
                isInteractingRef.current = false;
            }
        };

        return { move, end };
    };

    // ── Mouse drag ────────────────────────────────────────────────
    const mouseDown = (e) => {
        if (e.target.className !== "card-header") return;
        e.preventDefault(); // prevent text selection during drag

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

    // ── Touch drag ────────────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────
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
                        <div className="card-author-avatar"
                            style={{ background: contrast, color: headerColor }}>
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
                        // Don't release immediately — there may be a pending body save timer.
                        // The timer's finally block will release when the save completes.
                        // If no timer is pending (user didn't type), release now.
                        if (!keyUpTimer.current) {
                            isInteractingRef.current = false;
                        }
                        // After 1.5s debounce + network, release at most 2.5s later
                        setTimeout(() => {
                            if (document.activeElement !== textAreaRef.current) {
                                isInteractingRef.current = false;
                            }
                        }, 2500);
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
                        month: "short", day: "numeric"
                    })}
                </div>
            )}
        </div>
    );
};

export default NoteCard;