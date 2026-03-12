import { useContext, useEffect, useState, useRef } from "react";
import { NoteContext } from "../context/NotesContext";
import NoteCard from "../components/NoteCard";
import Controls from "../components/Controls";
import { db } from "../utils/db";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, UserPlus, DoorOpen, Copy, Check, ArrowLeft } from "lucide-react";
import "../styles/NoteCanvas.css";

const NotesPage = () => {
    const {
        notes, setNotes,
        currentNotebookId, setCurrentNotebookId,
        canvasOffset, setCanvasOffset,
        zoom, setZoom
    } = useContext(NoteContext);

    const [currentUser, setCurrentUser]         = useState(null);
    const [showDropdown, setShowDropdown]       = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCode, setInviteCode]           = useState("");
    const [copied, setCopied]                   = useState(false);

    const navigate     = useNavigate();
    const { id }       = useParams();
    const notesPageRef = useRef(null);

    // Canvas pan state
    const [startPos, setStartPos]     = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    // Pinch-to-zoom refs (mobile)
    const lastPinchDistRef = useRef(null);
    const lastPinchMidRef  = useRef(null);

    // Sync URL param → context
    useEffect(() => {
        if (id) setCurrentNotebookId(id);
    }, [id, setCurrentNotebookId]);

    // Figma-style zoom: intercept ctrl+wheel, zoom into cursor
    useEffect(() => {
        const handleZoom = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta      = -e.deltaY;
                const zoomFactor = Math.pow(1.35, delta / 80);

                setZoom(prevZoom => {
                    const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.05), 5);
                    setCanvasOffset(prevOffset => {
                        const rect    = notesPageRef.current.getBoundingClientRect();
                        const mouseX  = e.clientX - rect.left;
                        const mouseY  = e.clientY - rect.top;
                        const cMouseX = (mouseX - prevOffset.x) / prevZoom;
                        const cMouseY = (mouseY - prevOffset.y) / prevZoom;
                        return {
                            x: mouseX - cMouseX * nextZoom,
                            y: mouseY - cMouseY * nextZoom,
                        };
                    });
                    return nextZoom;
                });
            } else {
                setCanvasOffset(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY,
                }));
            }
        };

        const blockNativePinch = (e) => {
            if (e.touches.length >= 2) e.preventDefault();
        };

        const page = notesPageRef.current;
        if (page) {
            page.addEventListener("wheel",     handleZoom,       { passive: false });
            page.addEventListener("touchmove", blockNativePinch, { passive: false });
        }
        return () => {
            if (page) {
                page.removeEventListener("wheel",     handleZoom);
                page.removeEventListener("touchmove", blockNativePinch);
            }
        };
    }, [setZoom, setCanvasOffset]);

    // ── Mouse pan ──────────────────────────────────────────────────
    const handleMouseDown = (e) => {
        const onCanvas =
            e.button === 1 ||
            e.target.classList.contains("notes-page") ||
            e.target.classList.contains("grid-background") ||
            e.target.classList.contains("canvas");

        if (onCanvas) {
            setIsDragging(true);
            setStartPos({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setCanvasOffset({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    // ── Touch pan + pinch zoom ─────────────────────────────────────
    const getTouchDist = (t1, t2) =>
        Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const getTouchMid = (t1, t2) => ({
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
    });

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            setIsDragging(false);
            lastPinchDistRef.current = getTouchDist(e.touches[0], e.touches[1]);
            lastPinchMidRef.current  = getTouchMid(e.touches[0], e.touches[1]);
        } else if (
            e.touches.length === 1 &&
            (e.target.classList.contains("notes-page") ||
             e.target.classList.contains("grid-background") ||
             e.target.classList.contains("canvas"))
        ) {
            setIsDragging(true);
            const t = e.touches[0];
            setStartPos({ x: t.clientX - canvasOffset.x, y: t.clientY - canvasOffset.y });
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const newDist = getTouchDist(e.touches[0], e.touches[1]);
            const newMid  = getTouchMid(e.touches[0], e.touches[1]);
            const prev    = lastPinchDistRef.current;

            if (prev && prev > 0) {
                const zoomFactor = newDist / prev;
                setZoom(prevZoom => {
                    const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.05), 5);
                    setCanvasOffset(prevOffset => {
                        const rect  = notesPageRef.current.getBoundingClientRect();
                        const midX  = newMid.x - rect.left;
                        const midY  = newMid.y - rect.top;
                        const cMidX = (midX - prevOffset.x) / prevZoom;
                        const cMidY = (midY - prevOffset.y) / prevZoom;
                        return { x: midX - cMidX * nextZoom, y: midY - cMidY * nextZoom };
                    });
                    return nextZoom;
                });
            }

            lastPinchDistRef.current = newDist;
            lastPinchMidRef.current  = newMid;
        } else if (isDragging && e.touches.length === 1) {
            const t = e.touches[0];
            setCanvasOffset({ x: t.clientX - startPos.x, y: t.clientY - startPos.y });
        }
    };

    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) {
            lastPinchDistRef.current = null;
            lastPinchMidRef.current  = null;
        }
        if (e.touches.length === 0) setIsDragging(false);
    };

    // ── Auth ───────────────────────────────────────────────────────
    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    useEffect(() => {
        db.auth.getMe()
            .then(r => r.ok && r.json().then(setCurrentUser))
            .catch(err => console.error("Failed to fetch user:", err));
    }, []);

    // ── Polling — conservative merge that never overwrites local state ──
    useEffect(() => {
        if (!currentNotebookId) return;

        const pollNotes = async () => {
            try {
                const result = await db.notes.list(currentNotebookId);
                if (!result.documents) return;

                const serverNotes = result.documents;

                setNotes(prev => {
                    const serverIds = new Set(serverNotes.map(n => n.$id));

                    // Keep any optimistic (temp-id) notes that haven't been
                    // confirmed by the server yet
                    const stillPending = prev.filter(
                        n => typeof n.$id === "string" &&
                             n.$id.startsWith("temp-") &&
                             !serverIds.has(n.$id)
                    );

                    // Build a lookup for current local notes
                    const prevById = new Map(prev.map(n => [n.$id, n]));

                    const merged = serverNotes.map(serverNote => {
                        const local = prevById.get(serverNote.$id);

                        if (!local) return serverNote; // brand-new note from another user

                        // Always preserve cid so the React key is stable and the
                        // component is never unmounted/remounted on a poll tick.
                        const base = local.cid
                            ? { ...serverNote, cid: local.cid }
                            : { ...serverNote };

                        // If user modified this recently, protect its fields from being overwritten by stale polls
                        if (local.__localEdit && Date.now() - local.__localEdit < 10000) {
                            base.position = local.position;
                            base.body = local.body;
                            base.colors = local.colors;
                            base.__localEdit = local.__localEdit;
                        }

                        return base;
                    });

                    return [...merged, ...stillPending];
                });
            } catch (err) {
                console.error("Polling error:", err);
            }
        };

        pollNotes();
        const interval = setInterval(pollNotes, 6000);
        return () => clearInterval(interval);
    }, [currentNotebookId, setNotes]);

    // ── Invite ─────────────────────────────────────────────────────
    const handleInvite = async () => {
        try {
            const result = await db.notebooks.invite(currentNotebookId);
            if (result.invite_code) {
                setInviteCode(result.invite_code);
                setShowInviteModal(true);
                setShowDropdown(false);
            } else {
                alert("Only the owner can generate an invite code.");
            }
        } catch (err) {
            console.error("Invite error:", err);
        }
    };

    const handleLeave = async () => {
        if (!window.confirm("Leave this shared notebook?")) return;
        try {
            const result = await db.notebooks.leave(currentNotebookId);
            if (result.message === "Left successfully") {
                navigate("/");
            } else {
                alert(result.detail || "Owners cannot leave. Delete the notebook instead.");
            }
        } catch (err) {
            console.error("Leave error:", err);
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const close = (e) => {
            if (!e.target.closest(".user-profile-nav")) setShowDropdown(false);
        };
        document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, []);

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
                width: "100vw",
                height: "100vh",
                cursor: isDragging ? "grabbing" : "grab",
                overflow: "hidden",
            }}
        >
            {/* Dot grid overlay */}
            <div
                className="grid-background"
                style={{
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
                }}
            />

            {/* ── Top Bar ──────────────────────────────────────────── */}
            <header className="clean-top-bar">
                <button className="back-btn" onClick={() => navigate("/")}>
                    <ArrowLeft size={15} strokeWidth={2.5} />
                    Dashboard
                </button>

                {currentUser && (
                    <div className="user-profile-nav">
                        <div
                            className="mini-avatar"
                            onClick={() => setShowDropdown(v => !v)}
                        >
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

            {/* ── Invite Modal ──────────────────────────────────────── */}
            {showInviteModal && (
                <div
                    className="modal-backdrop"
                    onClick={e => e.target === e.currentTarget && setShowInviteModal(false)}
                >
                    <div className="sharp-modal" style={{ textAlign: "center" }}>
                        <div style={{
                            width: 52, height: 52,
                            background: "rgba(61,44,0,0.1)",
                            borderRadius: "3px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            margin: "0 auto 1rem",
                            transform: "rotate(-2deg)"
                        }}>
                            <UserPlus size={26} color="#3d2c00" />
                        </div>

                        <h2>Invite Collaborators ✉️</h2>
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

                        <button
                            className="sharp-btn primary"
                            onClick={() => setShowInviteModal(false)}
                        >
                            Done →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Canvas ───────────────────────────────────────────── */}
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
                {notes.map(note => (
                    <NoteCard key={note.cid || note.$id} note={note} />
                ))}
            </div>

            {/* ── Controls (color picker + add btn) ────────────────── */}
            <Controls />
        </div>
    );
};

export default NotesPage;