/* eslint-disable react/prop-types */
import { useEffect, useRef, useState, useContext } from "react";
import { db } from "../utils/db";
import { autoGrow, setZIndex, bodyParser, getContrastColor } from "../utils/utils";
import { Link2, Loader2, Trash2, Unlink2 } from "lucide-react";
import { NoteContext } from "../context/NotesContext";

const NoteCard = ({ note }) => {
    const cardRef = useRef(null);
    const textAreaRef = useRef(null);
    const bodySaveTimerRef = useRef(null);
    const getStableRotation = (id) => {
        const source = String(id || "note");
        let hash = 0;

        for (let index = 0; index < source.length; index += 1) {
            hash = (hash * 31 + source.charCodeAt(index)) % 5;
        }

        return hash - 2;
    };
    const getNotePosition = (position) => {
        if (!position) return { x: 0, y: 0 };
        return typeof position === "string" ? JSON.parse(position) : position;
    };

    const getNoteColors = (colors) => {
        if (!colors) return { colorHeader: "#000", colorBody: "#fff", colorText: "#000" };
        return typeof colors === "string" ? JSON.parse(colors) : colors;
    };

    const posRef = useRef(getNotePosition(note.position));
    const isInteractingRef = useRef(false);
    const bodySavingRef = useRef(false);

    const {
        setNotes,
        setConnections,
        setSelectedNote,
        zoomRef,
        connections,
        pendingConnectionNoteId,
        beginOrCompleteConnection,
        pendingUnlinkNoteId,
        beginOrCompleteUnlink,
        deleteConnectionById,
        updateNoteSize,
        removeNoteSize,
        updateNotePosition,
        removeNotePosition,
        getNoteKey,
    } = useContext(NoteContext);

    const [saving, setSaving] = useState(false);
    const [position, setPosition] = useState(() => getNotePosition(note.position));
    const [body, setBody] = useState(() => bodyParser(note.body));
    const [rotation] = useState(() => getStableRotation(note.cid || note.$id));

    const colors = getNoteColors(note.colors);
    const headerColor = colors.colorHeader;
    const bodyColor = colors.colorBody;
    const textColor = colors.colorText;
    const contrast = getContrastColor(headerColor);
    const noteDomId = String(note.$id);
    const noteKey = getNoteKey(note);
    const isTempNote = noteDomId.startsWith("temp-");
    const isPendingConnectionStart = pendingConnectionNoteId === noteDomId;
    const isPendingUnlinkStart = pendingUnlinkNoteId === noteDomId;
    const matchesCurrentNote = (candidate) => getNoteKey(candidate) === noteKey;
    const noteConnections = connections.filter(connection =>
        String(connection.source_note_id) === noteDomId ||
        String(connection.target_note_id) === noteDomId
    );
    const hasConnections = noteConnections.length > 0;

    useEffect(() => {
        if (isInteractingRef.current) return;

        const nextPosition = getNotePosition(note.position);
        if (nextPosition.x !== posRef.current.x || nextPosition.y !== posRef.current.y) {
            posRef.current = nextPosition;
            setPosition(nextPosition);
        }
    }, [note.position]);

    useEffect(() => {
        if (isInteractingRef.current) return;

        const nextBody = bodyParser(note.body || "");
        if (nextBody !== body) {
            setBody(nextBody);
        }
    }, [note.body, body]);

    useEffect(() => {
        autoGrow(textAreaRef);
        setZIndex(cardRef.current);
    }, []);

    useEffect(() => {
        if (!cardRef.current || typeof ResizeObserver === "undefined") return undefined;

        const updateSize = () => {
            if (!cardRef.current) return;

            updateNoteSize(noteDomId, {
                width: cardRef.current.offsetWidth,
                height: cardRef.current.offsetHeight,
            });
        };

        updateSize();

        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(cardRef.current);

        return () => {
            resizeObserver.disconnect();
            removeNoteSize(noteDomId);
        };
    }, [noteDomId, removeNoteSize, updateNoteSize]);

    useEffect(() => {
        updateNotePosition(noteDomId, position);
    }, [noteDomId, position, updateNotePosition]);

    useEffect(() => {
        return () => {
            clearTimeout(bodySaveTimerRef.current);
            removeNotePosition(noteDomId);
        };
    }, [noteDomId, removeNotePosition]);

    const noteIdRef = useRef(note.$id);
    useEffect(() => { noteIdRef.current = note.$id; }, [note.$id]);

    const saveData = async (key, value, retryCount = 0) => {
        const currentId = noteIdRef.current;

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
        } catch (error) {
            console.error("Save failed:", error);
        }
        setSaving(false);
    };

    const handleDelete = (event) => {
        event.stopPropagation();
        db.notes.delete(note.$id);
        setNotes(prev => prev.filter(candidate => !matchesCurrentNote(candidate)));
        setConnections(prev => prev.filter(connection =>
            String(connection.source_note_id) !== noteDomId &&
            String(connection.target_note_id) !== noteDomId
        ));
        setSelectedNote(prev => getNoteKey(prev) === noteKey ? null : prev);
    };

    const handleSelectCard = () => {
        setZIndex(cardRef.current);
        setSelectedNote(note);
    };

    const persistBody = async (nextBody) => {
        clearTimeout(bodySaveTimerRef.current);
        bodySaveTimerRef.current = null;
        bodySavingRef.current = true;

        try {
            await saveData("body", nextBody);
        } finally {
            bodySavingRef.current = false;
            if (document.activeElement !== textAreaRef.current) {
                isInteractingRef.current = false;
            }
        }
    };

    const scheduleBodySave = (nextBody) => {
        clearTimeout(bodySaveTimerRef.current);
        bodySaveTimerRef.current = setTimeout(() => {
            persistBody(nextBody);
        }, 1500);
    };

    const handleBodyChange = (event) => {
        const nextBody = event.target.value;

        isInteractingRef.current = true;
        setBody(nextBody);
        setNotes(prev => prev.map(candidate => matchesCurrentNote(candidate) ? {
            ...candidate,
            body: nextBody,
            __localEdit: Date.now(),
        } : candidate));
        scheduleBodySave(nextBody);
    };

    const startDrag = (initialScreenX, initialScreenY) => {
        isInteractingRef.current = true;
        setZIndex(cardRef.current);
        setSelectedNote(note);

        let lastX = initialScreenX;
        let lastY = initialScreenY;

        const move = (screenX, screenY) => {
            const deltaX = screenX - lastX;
            const deltaY = screenY - lastY;
            lastX = screenX;
            lastY = screenY;

            const currentZoom = zoomRef?.current || 1;
            const newPosition = {
                x: posRef.current.x + deltaX / currentZoom,
                y: posRef.current.y + deltaY / currentZoom,
            };
            posRef.current = newPosition;
            setPosition(newPosition);
        };

        const end = async () => {
            const finalPosition = { ...posRef.current };

            setNotes(prev => prev.map(candidate => matchesCurrentNote(candidate) ? {
                ...candidate,
                position: JSON.stringify(finalPosition),
                __localEdit: Date.now(),
            } : candidate));

            try {
                await saveData("position", finalPosition);
            } finally {
                isInteractingRef.current = false;
            }
        };

        return { move, end };
    };

    const mouseDown = (event) => {
        if (!event.target.classList.contains("card-header")) return;
        event.preventDefault();

        const { move, end } = startDrag(event.clientX, event.clientY);

        const onMove = (moveEvent) => move(moveEvent.clientX, moveEvent.clientY);
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            end();
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    const touchStart = (event) => {
        if (!event.target.classList.contains("card-header")) return;
        const touch = event.touches[0];

        const { move, end } = startDrag(touch.clientX, touch.clientY);

        const onMove = (moveEvent) => {
            moveEvent.preventDefault();
            const nextTouch = moveEvent.touches[0];
            move(nextTouch.clientX, nextTouch.clientY);
        };
        const onEnd = () => {
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onEnd);
            end();
        };

        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onEnd);
    };

    return (
        <div
            ref={cardRef}
            className={`card ${isPendingConnectionStart ? "pending-connection-start" : ""}`}
            onMouseDownCapture={handleSelectCard}
            onTouchStartCapture={handleSelectCard}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                backgroundColor: bodyColor,
                "--rotation": `${rotation}deg`,
            }}
        >
            <div className="card-tape" style={{ background: `${headerColor}88` }} />

            <div
                className="card-header"
                onMouseDown={mouseDown}
                onTouchStart={touchStart}
                style={{ backgroundColor: headerColor }}
            >
                <div className="card-header-left">
                    <button
                        className="card-delete-btn"
                        onMouseDown={event => event.stopPropagation()}
                        onClick={handleDelete}
                        style={{ color: contrast }}
                        title="Delete"
                    >
                        <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                    <button
                        className={`card-connect-btn ${isPendingConnectionStart ? "active" : ""}`}
                        onMouseDown={event => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            beginOrCompleteConnection(note);
                        }}
                        style={{ color: contrast }}
                        title={isTempNote ? "Wait for this note to save before connecting" : "Connect note"}
                        disabled={isTempNote}
                    >
                        <Link2 size={13} strokeWidth={2.4} />
                    </button>
                    <button
                        className={`card-unlink-btn ${isPendingUnlinkStart ? "active" : ""}`}
                        onMouseDown={event => event.stopPropagation()}
                        onClick={async (event) => {
                            event.stopPropagation();

                            if (!hasConnections) return;

                            if (!pendingUnlinkNoteId && noteConnections.length === 1) {
                                await deleteConnectionById(noteConnections[0].id);
                                return;
                            }

                            beginOrCompleteUnlink(note);
                        }}
                        style={{ color: contrast }}
                        title={
                            !hasConnections
                                ? "This note has no connections"
                                : noteConnections.length === 1 && !pendingUnlinkNoteId
                                    ? "Remove this connection"
                                    : "Choose a connected note to unlink, or use Unlink All from the hint"
                        }
                        disabled={!hasConnections}
                    >
                        <Unlink2 size={13} strokeWidth={2.4} />
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

            <div className="card-body">
                <textarea
                    ref={textAreaRef}
                    value={body}
                    onChange={handleBodyChange}
                    onFocus={() => {
                        isInteractingRef.current = true;
                        setZIndex(cardRef.current);
                        setSelectedNote(note);
                    }}
                    onBlur={() => {
                        if (bodySaveTimerRef.current !== null) {
                            persistBody(textAreaRef.current ? textAreaRef.current.value : body);
                            return;
                        }

                        if (bodySavingRef.current) {
                            return;
                        }
                        isInteractingRef.current = false;
                    }}
                    onInput={() => autoGrow(textAreaRef)}
                    style={{ color: textColor }}
                    placeholder="Write something..."
                />
            </div>

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
