import { useContext, useEffect, useState, useRef } from "react";
import { NoteContext } from "../context/NotesContext";
import ConnectionLayer from "../components/ConnectionLayer";
import NoteCard from "../components/NoteCard";
import Controls from "../components/Controls";
import { db } from "../utils/db";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, UserPlus, DoorOpen, Copy, Check, ArrowLeft, X } from "lucide-react";
import "../styles/NoteCanvas.css";
import { useDialog } from "../context/DialogContext";

const NotesPage = () => {
    const {
        notes,
        setNotes,
        connections,
        setConnections,
        selectedNote,
        currentNotebookId,
        setCurrentNotebookId,
        canvasOffset,
        setCanvasOffset,
        zoom,
        setZoom,
        pendingConnectionNoteId,
        cancelPendingConnection,
        pendingUnlinkNoteId,
        cancelPendingUnlink,
        deleteConnectionsForNote,
        selectedConnectionId,
        setSelectedConnectionId,
        deleteConnectionById,
    } = useContext(NoteContext);

    const [currentUser, setCurrentUser] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [copiedFlow, setCopiedFlow] = useState(false);

    const { showAlert, showConfirm } = useDialog();
    const navigate = useNavigate();
    const { id } = useParams();
    const notesPageRef = useRef(null);
    const copyFlowTimerRef = useRef(null);

    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const lastPinchDistRef = useRef(null);
    const lastPinchMidRef = useRef(null);

    useEffect(() => {
        if (id) setCurrentNotebookId(id);
    }, [id, setCurrentNotebookId]);

    useEffect(() => {
        const handleZoom = (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                const delta = -event.deltaY;
                const zoomFactor = Math.pow(1.35, delta / 80);

                setZoom(prevZoom => {
                    const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.05), 5);
                    setCanvasOffset(prevOffset => {
                        const rect = notesPageRef.current.getBoundingClientRect();
                        const mouseX = event.clientX - rect.left;
                        const mouseY = event.clientY - rect.top;
                        const canvasMouseX = (mouseX - prevOffset.x) / prevZoom;
                        const canvasMouseY = (mouseY - prevOffset.y) / prevZoom;

                        return {
                            x: mouseX - canvasMouseX * nextZoom,
                            y: mouseY - canvasMouseY * nextZoom,
                        };
                    });
                    return nextZoom;
                });
            } else {
                setCanvasOffset(prev => ({
                    x: prev.x - event.deltaX,
                    y: prev.y - event.deltaY,
                }));
            }
        };

        const blockNativePinch = (event) => {
            if (event.touches.length >= 2) {
                event.preventDefault();
            }
        };

        const page = notesPageRef.current;
        if (!page) return undefined;

        page.addEventListener("wheel", handleZoom, { passive: false });
        page.addEventListener("touchmove", blockNativePinch, { passive: false });

        return () => {
            page.removeEventListener("wheel", handleZoom);
            page.removeEventListener("touchmove", blockNativePinch);
        };
    }, [setCanvasOffset, setZoom]);

    const handleMouseDown = (event) => {
        const onCanvas =
            event.button === 1 ||
            event.target.classList.contains("notes-page") ||
            event.target.classList.contains("grid-background") ||
            event.target.classList.contains("canvas");

        if (onCanvas) {
            setSelectedConnectionId(null);
            setIsDragging(true);
            setStartPos({ x: event.clientX - canvasOffset.x, y: event.clientY - canvasOffset.y });
        }
    };

    const handleMouseMove = (event) => {
        if (isDragging) {
            setCanvasOffset({ x: event.clientX - startPos.x, y: event.clientY - startPos.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const getTouchDist = (firstTouch, secondTouch) =>
        Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);

    const getTouchMid = (firstTouch, secondTouch) => ({
        x: (firstTouch.clientX + secondTouch.clientX) / 2,
        y: (firstTouch.clientY + secondTouch.clientY) / 2,
    });

    const handleTouchStart = (event) => {
        if (event.touches.length === 2) {
            setIsDragging(false);
            lastPinchDistRef.current = getTouchDist(event.touches[0], event.touches[1]);
            lastPinchMidRef.current = getTouchMid(event.touches[0], event.touches[1]);
        } else if (
            event.touches.length === 1 &&
            (
                event.target.classList.contains("notes-page") ||
                event.target.classList.contains("grid-background") ||
                event.target.classList.contains("canvas")
            )
        ) {
            setSelectedConnectionId(null);
            setIsDragging(true);
            const touch = event.touches[0];
            setStartPos({ x: touch.clientX - canvasOffset.x, y: touch.clientY - canvasOffset.y });
        }
    };

    const handleTouchMove = (event) => {
        if (event.touches.length === 2) {
            event.preventDefault();
            const newDistance = getTouchDist(event.touches[0], event.touches[1]);
            const newMid = getTouchMid(event.touches[0], event.touches[1]);
            const previousDistance = lastPinchDistRef.current;

            if (previousDistance && previousDistance > 0) {
                const zoomFactor = newDistance / previousDistance;

                setZoom(prevZoom => {
                    const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.05), 5);
                    setCanvasOffset(prevOffset => {
                        const rect = notesPageRef.current.getBoundingClientRect();
                        const midX = newMid.x - rect.left;
                        const midY = newMid.y - rect.top;
                        const canvasMidX = (midX - prevOffset.x) / prevZoom;
                        const canvasMidY = (midY - prevOffset.y) / prevZoom;

                        return {
                            x: midX - canvasMidX * nextZoom,
                            y: midY - canvasMidY * nextZoom,
                        };
                    });
                    return nextZoom;
                });
            }

            lastPinchDistRef.current = newDistance;
            lastPinchMidRef.current = newMid;
        } else if (isDragging && event.touches.length === 1) {
            const touch = event.touches[0];
            setCanvasOffset({ x: touch.clientX - startPos.x, y: touch.clientY - startPos.y });
        }
    };

    const handleTouchEnd = (event) => {
        if (event.touches.length < 2) {
            lastPinchDistRef.current = null;
            lastPinchMidRef.current = null;
        }
        if (event.touches.length === 0) setIsDragging(false);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    useEffect(() => {
        db.auth.getMe()
            .then(response => response.ok && response.json().then(setCurrentUser))
            .catch(error => console.error("Failed to fetch user:", error));
    }, []);

    useEffect(() => {
        return () => {
            clearTimeout(copyFlowTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!currentNotebookId) return undefined;

        const pollNotes = async () => {
            try {
                const result = await db.notes.list(currentNotebookId);
                if (!result.documents) return;

                const serverNotes = result.documents;

                setNotes(prev => {
                    const serverIds = new Set(serverNotes.map(note => note.$id));
                    const stillPending = prev.filter(note =>
                        typeof note.$id === "string" &&
                        note.$id.startsWith("temp-") &&
                        !serverIds.has(note.$id)
                    );

                    const previousById = new Map(prev.map(note => [note.$id, note]));
                    const merged = serverNotes.map(serverNote => {
                        const localNote = previousById.get(serverNote.$id);
                        if (!localNote) return serverNote;

                        const base = localNote.cid
                            ? { ...serverNote, cid: localNote.cid }
                            : { ...serverNote };

                        if (localNote.__localEdit && Date.now() - localNote.__localEdit < 10000) {
                            base.position = localNote.position;
                            base.body = localNote.body;
                            base.colors = localNote.colors;
                            base.__localEdit = localNote.__localEdit;
                        }

                        return base;
                    });

                    return [...merged, ...stillPending];
                });
            } catch (error) {
                console.error("Polling error:", error);
            }
        };

        pollNotes();
        const interval = setInterval(pollNotes, 6000);
        return () => clearInterval(interval);
    }, [currentNotebookId, setNotes]);

    useEffect(() => {
        if (!currentNotebookId) return undefined;

        const pollConnections = async () => {
            try {
                const result = await db.connections.list(currentNotebookId);
                if (result.documents) {
                    setConnections(result.documents);
                }
            } catch (error) {
                console.error("Connection polling error:", error);
            }
        };

        pollConnections();
        const interval = setInterval(pollConnections, 6000);
        return () => clearInterval(interval);
    }, [currentNotebookId, setConnections]);

    useEffect(() => {
        if (!selectedConnectionId) return undefined;

        const handleKeyDown = (event) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === "TEXTAREA" || activeTag === "INPUT") return;

            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                deleteConnectionById(selectedConnectionId);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [deleteConnectionById, selectedConnectionId]);

    const handleInvite = async () => {
        try {
            const result = await db.notebooks.invite(currentNotebookId);
            if (result.invite_code) {
                setInviteCode(result.invite_code);
                setShowInviteModal(true);
                setShowDropdown(false);
            } else {
                await showAlert({
                    title: "Owner access only",
                    message: "Only the notebook owner can generate an invite code.",
                });
            }
        } catch (error) {
            console.error("Invite error:", error);
        }
    };

    const handleLeave = async () => {
        const confirmed = await showConfirm({
            title: "Leave notebook?",
            message: "Leave this shared notebook?",
            confirmText: "Leave",
            cancelText: "Stay",
            tone: "warning",
        });
        if (!confirmed) return;

        try {
            const result = await db.notebooks.leave(currentNotebookId);
            if (result.message === "Left successfully") {
                navigate("/");
            } else {
                await showAlert({
                    title: "Could not leave notebook",
                    message: result.detail || "Owners cannot leave. Delete the notebook instead.",
                });
            }
        } catch (error) {
            console.error("Leave error:", error);
        }
    };

    useEffect(() => {
        const closeDropdown = (event) => {
            if (!event.target.closest(".user-profile-nav")) {
                setShowDropdown(false);
            }
        };

        document.addEventListener("click", closeDropdown);
        return () => document.removeEventListener("click", closeDropdown);
    }, []);

    const selectedNoteId = selectedNote ? String(selectedNote.$id) : null;

    const getConnectedNotesInCreationOrder = () => {
        if (!selectedNoteId) return [];

        const noteById = new Map(notes.map(note => [String(note.$id), note]));
        if (!noteById.has(selectedNoteId)) return [];

        const visited = new Set([selectedNoteId]);
        const queue = [selectedNoteId];

        while (queue.length) {
            const currentId = queue.shift();

            connections.forEach(connection => {
                const sourceId = String(connection.source_note_id);
                const targetId = String(connection.target_note_id);

                if (sourceId === currentId && !visited.has(targetId)) {
                    visited.add(targetId);
                    queue.push(targetId);
                }

                if (targetId === currentId && !visited.has(sourceId)) {
                    visited.add(sourceId);
                    queue.push(sourceId);
                }
            });
        }

        return Array.from(visited)
            .map(noteId => noteById.get(noteId))
            .filter(Boolean)
            .sort((left, right) => {
                const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
                const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

                if (leftTime !== rightTime) {
                    return leftTime - rightTime;
                }

                return Number(left.$id) - Number(right.$id);
            });
    };

    const connectedNotes = getConnectedNotesInCreationOrder();

    const handleCopyConnectedNotes = async () => {
        if (!connectedNotes.length) {
            await showAlert({
                title: "Select a note first",
                message: "Choose one note in the workflow, then use Copy Flow.",
            });
            return;
        }

        const combinedText = connectedNotes
            .map(note => (note.body || "").trim())
            .filter(Boolean)
            .join("\n\n");

        if (!combinedText) {
            await showAlert({
                title: "Nothing to copy yet",
                message: "The selected flow has no note text to copy yet.",
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(combinedText);
            setCopiedFlow(true);
            clearTimeout(copyFlowTimerRef.current);
            copyFlowTimerRef.current = setTimeout(() => setCopiedFlow(false), 2000);
        } catch (error) {
            console.error("Copy flow error:", error);
            await showAlert({
                title: "Copy failed",
                message: "Could not copy the connected notes. Please try again.",
            });
        }
    };

    return (
        <div
            ref={notesPageRef}
            className="notes-page"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                cursor: isDragging ? "grabbing" : "grab",
                overflow: "hidden",
            }}
        >
            <div
                className="grid-background"
                style={{
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
                }}
            />

            <header className="clean-top-bar">
                <div className="canvas-top-actions">
                    <button className="back-btn" onClick={() => navigate("/")}>
                        <ArrowLeft size={15} strokeWidth={2.5} />
                        Dashboard
                    </button>

                    <button
                        className={`canvas-copy-btn ${connectedNotes.length ? "active" : ""}`}
                        onClick={handleCopyConnectedNotes}
                        disabled={!connectedNotes.length}
                        title={connectedNotes.length ? "Copy connected notes in creation order" : "Select a note to copy its connected flow"}
                    >
                        {copiedFlow
                            ? <Check size={15} strokeWidth={2.5} />
                            : <Copy size={15} strokeWidth={2.5} />
                        }
                        {copiedFlow
                            ? "Copied"
                            : connectedNotes.length > 1
                                ? `Copy Flow (${connectedNotes.length})`
                                : "Copy Flow"
                        }
                    </button>
                </div>

                {currentUser && (
                    <div className="user-profile-nav">
                        <div className="mini-avatar" onClick={() => setShowDropdown(prev => !prev)}>
                            {currentUser.username[0].toUpperCase()}
                        </div>

                        {showDropdown && (
                            <div className="profile-dropdown dash-dropdown">
                                <div className="dropdown-user-info">
                                    <p className="dropdown-username">{currentUser.username}</p>
                                    <p className="dropdown-email">{currentUser.email}</p>
                                </div>
                                <div className="dropdown-divider" />
                                <button className="dropdown-item" onClick={handleInvite}>
                                    <UserPlus size={14} />
                                    Invite Others
                                </button>
                                <button className="dropdown-item" onClick={handleLeave}>
                                    <DoorOpen size={14} />
                                    Leave Notebook
                                </button>
                                <div className="dropdown-divider" />
                                <button className="dropdown-item logout-item" onClick={handleLogout}>
                                    <LogOut size={14} />
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </header>

            {showInviteModal && (
                <div
                    className="modal-backdrop"
                    onClick={event => event.target === event.currentTarget && setShowInviteModal(false)}
                >
                    <div className="sharp-modal" style={{ textAlign: "center" }}>
                        <div style={{
                            width: 52,
                            height: 52,
                            background: "rgba(61,44,0,0.1)",
                            borderRadius: "3px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 1rem",
                            transform: "rotate(-2deg)",
                        }}>
                            <UserPlus size={26} color="#3d2c00" />
                        </div>

                        <h2>Invite Collaborators</h2>
                        <p style={{ marginBottom: 0 }}>
                            Anyone with this code can view and edit notes.
                        </p>

                        <div className="invite-code-box">
                            {inviteCode}
                            <button
                                className="invite-copy-btn"
                                onClick={() => {
                                    navigator.clipboard.writeText(inviteCode);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied
                                    ? <Check size={18} color="#3d8c00" />
                                    : <Copy size={18} />
                                }
                            </button>
                        </div>

                        <button className="sharp-btn primary" onClick={() => setShowInviteModal(false)}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            {pendingConnectionNoteId && (
                <div className="connection-hint">
                    <span>Select another note&apos;s link button to connect it.</span>
                    <button type="button" onClick={cancelPendingConnection} title="Cancel connection">
                        <X size={14} />
                    </button>
                </div>
            )}

            {pendingUnlinkNoteId && (
                <div className="connection-hint unlink-hint">
                    <span>Select a connected note to remove only that link.</span>
                    <div className="connection-hint-actions">
                        <button
                            type="button"
                            className="connection-hint-secondary"
                            onClick={() => deleteConnectionsForNote(pendingUnlinkNoteId)}
                            title="Remove every connection from this note"
                        >
                            Unlink All
                        </button>
                        <button type="button" onClick={cancelPendingUnlink} title="Cancel unlink">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            <div
                className="canvas"
                style={{
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    transformOrigin: "0 0",
                    overflow: "visible",
                }}
            >
                {connections.length > 0 && <ConnectionLayer />}
                {notes.map(note => (
                    <NoteCard key={note.cid || note.$id} note={note} />
                ))}
            </div>

            <Controls />
        </div>
    );
};

export default NotesPage;
