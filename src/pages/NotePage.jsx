import { useContext, useEffect, useState, useRef } from "react";
import { NoteContext } from "../context/NotesContext";
import NoteCard from "../components/NoteCard";
import Controls from "../components/Controls";
import { db } from "../utils/db";
import { useNavigate, useParams } from "react-router-dom";
import { Search, LogOut, UserPlus, DoorOpen, Copy, Check, ArrowLeft } from "lucide-react";
import "../styles/NoteCanvas.css";

const NotesPage = () => {
    const { notes, setNotes, currentNotebookId, setCurrentNotebookId, canvasOffset, setCanvasOffset, zoom, setZoom } = useContext(NoteContext);
    const [currentUser, setCurrentUser] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [copied, setCopied] = useState(false);
    
    const navigate = useNavigate();
    const { id } = useParams();
    const notesPageRef = useRef(null);

    // Canvas Panning State
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    // Sync URL to Context
    useEffect(() => {
        if (id) {
            setCurrentNotebookId(id);
        }
    }, [id, setCurrentNotebookId]);

    // Figma-like Zoom logic: prevent browser zoom and zoom into cursor
    useEffect(() => {
        const handleZoom = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                
                const delta = -e.deltaY;
                // High-performance trackpad zoom math
                const zoomFactor = Math.pow(1.35, delta / 80); 

                setZoom(prevZoom => {
                    const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.05), 5);
                    
                    setCanvasOffset(prevOffset => {
                        const rect = notesPageRef.current.getBoundingClientRect();
                        const mouseX = e.clientX - rect.left;
                        const mouseY = e.clientY - rect.top;

                        const canvasMouseX = (mouseX - prevOffset.x) / prevZoom;
                        const canvasMouseY = (mouseY - prevOffset.y) / prevZoom;

                        const newOffsetX = mouseX - canvasMouseX * nextZoom;
                        const newOffsetY = mouseY - canvasMouseY * nextZoom;

                        return { x: newOffsetX, y: newOffsetY };
                    });

                    return nextZoom;
                });
            } else {
                // Natural Panning 
                setCanvasOffset(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY
                }));
            }
        };

        const page = notesPageRef.current;
        if (page) {
            page.addEventListener('wheel', handleZoom, { passive: false });
        }
        return () => {
            if (page) page.removeEventListener('wheel', handleZoom);
        };
    }, [setZoom, setCanvasOffset]);

    const handleMouseDown = (e) => {
        if (e.button === 1 || e.target.classList.contains("notes-page") || e.target.classList.contains("grid-background") || e.target.classList.contains("canvas")) {
            setIsDragging(true);
            setStartPos({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setCanvasOffset({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 1 && (e.target.classList.contains("notes-page") || e.target.classList.contains("grid-background") || e.target.classList.contains("canvas"))) {
            setIsDragging(true);
            const touch = e.touches[0];
            setStartPos({ x: touch.clientX - canvasOffset.x, y: touch.clientY - canvasOffset.y });
        }
    };

    const handleTouchMove = (e) => {
        if (isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            setCanvasOffset({ x: touch.clientX - startPos.x, y: touch.clientY - startPos.y });
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await db.auth.getMe();
                if (response.ok) {
                    const user = await response.json();
                    setCurrentUser(user);
                }
            } catch (err) {
                console.error("Failed to fetch user:", err);
            }
        };
        fetchUser();
    }, []);

    // Polling — field-level merge so notes never jump mid-drag/type
    useEffect(() => {
        if (!currentNotebookId) return;

        const pollNotes = async () => {
            try {
                const result = await db.notes.list(currentNotebookId);
                if (!result.documents) return;

                const serverNotes = result.documents;

                setNotes((prev) => {
                    // Keep pending optimistic notes that haven't been confirmed yet
                    const serverIds = new Set(serverNotes.map(n => n.$id));
                    const pendingOptimistic = prev.filter(
                        n => typeof n.$id === "string" &&
                             n.$id.startsWith("temp-") &&
                             !serverIds.has(n.cid)
                    );

                    // For each server note, do a field-level merge with the current local version.
                    // This preserves local position/body changes that haven't been saved to server yet.
                    const prevById = new Map(prev.map(n => [n.$id, n]));

                    const merged = serverNotes.map(serverNote => {
                        const local = prevById.get(serverNote.$id);
                        if (!local) return serverNote; // new note from another user

                        // If position changed on server AND we are not interacting → update
                        // (NoteCard's isInteractingRef handles the per-card guard,
                        //  so just pass through whatever the server says)
                        return {
                            ...serverNote,
                            // Preserve any local fields that we haven't flushed yet
                            // by letting server values through — NoteCard's ref guard
                            // will reject the update if the card is being dragged/typed
                        };
                    });

                    return [...merged, ...pendingOptimistic];
                });
            } catch (err) {
                console.error("Polling error:", err);
            }
        };

        pollNotes(); // initial load
        const interval = setInterval(pollNotes, 6000); // 6s — enough time for saves to land
        return () => clearInterval(interval);
    }, [currentNotebookId, setNotes]);


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
        if (window.confirm("Are you sure you want to leave this shared notebook?")) {
            try {
                const result = await db.notebooks.leave(currentNotebookId);
                if (result.message === "Left successfully") {
                    navigate("/");
                } else {
                    alert(result.detail || "Owners cannot leave their own notebooks. You must delete it instead.");
                }
            } catch (err) {
                console.error("Leave error:", err);
            }
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
            onTouchEnd={handleMouseUp}
            style={{ 
                width: "100vw", 
                height: "100vh", 
                cursor: isDragging ? "grabbing" : "grab",
                overflow: 'hidden',
                backgroundColor: '#0c0c0c'
            }}
        >
            <div 
                className="grid-background"
                style={{
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`
                }}
            />
            {/* Clean Top Bar Integration */}
            <header className="clean-top-bar">
                <button className="back-btn" onClick={() => navigate("/")}>
                    <ArrowLeft size={16} strokeWidth={2.5} style={{ marginRight: '8px' }} />
                    Dashboard
                </button>
                
                {currentUser && (
                    <div className="user-profile-nav">
                        <div 
                            className="mini-avatar"
                            onClick={() => setShowDropdown(!showDropdown)}
                        >
                            {currentUser.username[0].toUpperCase()}
                        </div>

                        {showDropdown && (
                            <div className="profile-dropdown dash-dropdown">
                                <div className="dropdown-user-info">
                                    <p className="dropdown-username">{currentUser.username}</p>
                                    <p className="dropdown-email">{currentUser.email}</p>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button className="dropdown-item" onClick={handleInvite}>
                                    <UserPlus size={16} />
                                    Invite Others
                                </button>
                                <button className="dropdown-item" onClick={handleLeave}>
                                    <DoorOpen size={16} />
                                    Leave Notebook
                                </button>
                                <div className="dropdown-divider"></div>
                                <button className="dropdown-item logout-item" onClick={handleLogout}>
                                    <LogOut size={16} style={{ marginRight: '10px' }} />
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </header>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowInviteModal(false)}>
                    <div className="sharp-modal" style={{ textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255, 235, 161, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <UserPlus size={32} color="#ffeba1" />
                        </div>
                        <h2>Invite Collaborators</h2>
                        <p style={{ color: '#888', marginBottom: '1.5rem' }}>Anyone with this code can view and edit notes in this notebook.</p>
                        
                        <div style={{ 
                            background: '#000', 
                            padding: '1.5rem', 
                            borderRadius: '16px', 
                            border: '1px dashed rgba(255, 235, 161, 0.3)',
                            fontSize: '2rem',
                            fontWeight: '900',
                            letterSpacing: '5px',
                            color: '#ffeba1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '1rem',
                            marginBottom: '2rem'
                        }}>
                            {inviteCode}
                            <div 
                                onClick={() => {
                                    navigator.clipboard.writeText(inviteCode);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                                style={{ cursor: 'pointer', opacity: 0.6 }}
                            >
                                {copied ? <Check size={20} color="#4CAF50" /> : <Copy size={20} />}
                            </div>
                        </div>

                        <button className="sharp-btn primary" style={{ width: '100%' }} onClick={() => setShowInviteModal(false)}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            <div 
                className="canvas"
                style={{ 
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '50000px', // Content containment
                    height: '50000px',
                    transformOrigin: '0 0'
                }}
            >
                {notes.map((note) => (
                    <NoteCard key={note.cid || note.$id} note={note} />
                ))}
            </div>
            <Controls />
        </div>
    );
};

export default NotesPage;
