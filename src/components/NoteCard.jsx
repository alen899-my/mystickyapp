import { useEffect, useRef, useState, useContext } from "react";
import { db } from "../utils/db";
import { autoGrow, setZIndex, bodyParser, getContrastColor } from "../utils/utils";
import { Loader2, Trash2 } from "lucide-react";
import { NoteContext } from "../context/NotesContext";

const NoteCard = ({ note }) => {
    const cardRef          = useRef(null);
    const textAreaRef      = useRef(null);
    const keyUpTimer       = useRef(null);
    const getStableRotation = (id) => {
        const source = String(id || "note");
        let hash = 0;

        for (let index = 0; index < source.length; index += 1) {
            hash = (hash * 31 + source.charCodeAt(index)) % 5;
        }

        return hash - 2;
    };
    const getNotePosition = (p) => {
        if (!p) return { x: 0, y: 0 };
        return typeof p === "string" ? JSON.parse(p) : p;
    };

    const getNoteColors = (c) => {
        if (!c) return { colorHeader: "#000", colorBody: "#fff", colorText: "#000" };
        return typeof c === "string" ? JSON.parse(c) : c;
    };

    const posRef           = useRef(getNotePosition(note.position));
    const isInteractingRef = useRef(false);
    // Track whether a body save is in-flight so onBlur knows to stay locked
    const bodySavingRef    = useRef(false);

    const { setNotes, setSelectedNote, zoomRef } = useContext(NoteContext);

    const [saving,   setSaving]   = useState(false);
    const [position, setPosition] = useState(() => getNotePosition(note.position));
    const [body,     setBody]     = useState(() => bodyParser(note.body));
    const [rotation]              = useState(() => getStableRotation(note.cid || note.$id));

    const colors      = getNoteColors(note.colors);
    const headerColor = colors.colorHeader;
    const bodyColor   = colors.colorBody;
    const textColor   = colors.colorText;
    const contrast    = getContrastColor(headerColor);

    // ── Server sync — only apply when not interacting ──────────────
    useEffect(() => {
        if (isInteractingRef.current) return;
        const p = getNotePosition(note.position);
        if (p && (p.x !== posRef.current.x || p.y !== posRef.current.y)) {
            posRef.current = { x: p.x, y: p.y };
            setPosition(posRef.current);
        }
    }, [note.position]);

    useEffect(() => {
        if (isInteractingRef.current) return;
        const noteBody = note.body || "";
        const newBody = bodyParser(noteBody);
        if (newBody !== body) {
            setBody(newBody);
        }
    }, [note.body, body]);

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
            
            const currentBody = textAreaRef.current ? textAreaRef.current.value : body;

            // Protect local change in central state immediately against polls
            setNotes(prev => prev.map(n => n.cid === note.cid ? {
                ...n,
                body: currentBody,
                __localEdit: Date.now()
            } : n));

            try {
                if (textAreaRef.current) {
                    await saveData("body", textAreaRef.current.value);
                }
            } finally {
                keyUpTimer.current = null;
                bodySavingRef.current = false;
                if (document.activeElement !== textAreaRef.current) {
                    isInteractingRef.current = false;
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
            const newPos = {
                x: posRef.current.x + dxScreen / z,
                y: posRef.current.y + dyScreen / z,
            };
            posRef.current = newPos;
            setPosition(newPos);
        };

        const end = async () => {
            const finalPos = { ...posRef.current };

            // Protect local change in central state immediately against polls
            setNotes(prev => prev.map(n => n.cid === note.cid ? {
                ...n,
                position: JSON.stringify(finalPos),
                __localEdit: Date.now()
            } : n));

            try {
                await saveData("position", finalPos);
            } finally {
                isInteractingRef.current = false;
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
                        if (keyUpTimer.current !== null || bodySavingRef.current) {
                            return;
                        }
                        isInteractingRef.current = false;
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
