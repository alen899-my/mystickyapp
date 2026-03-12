import { useState, useEffect, useContext } from "react";
import { db } from "../utils/db";
import { NoteContext } from "../context/NotesContext";
import { useNavigate } from "react-router-dom";
import "../styles/NotebookDashboard.css";
import { Home, Plus, Folder, Search, Book, BookText, LogOut, Users, StickyNote } from "lucide-react";

const NotebookPage = () => {
    const [notebooks, setNotebooks] = useState([]);
    const [newNotebookName, setNewNotebookName] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [showUserDropdown, setShowUserDropdown] = useState(false);

    const { setCurrentNotebookId } = useContext(NoteContext);
    const navigate = useNavigate();

    const fetchNotebooks = async () => {
        try {
            const result = await db.notebooks.list();
            setNotebooks(Array.isArray(result) ? result : []);
        } catch (err) {
            console.error("Fetch notebooks error:", err);
        }
    };

    useEffect(() => {
        fetchNotebooks();
        db.auth.getMe().then(r => r.ok && r.json().then(setCurrentUser)).catch(() => {});

        const close = (e) => {
            if (!e.target.closest(".user-profile-nav")) setShowUserDropdown(false);
        };
        document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, []);

    const handleCreateNotebook = async (e) => {
        e.preventDefault();
        if (!newNotebookName.trim()) return;
        await db.notebooks.create(newNotebookName);
        fetchNotebooks();
        setNewNotebookName("");
        setShowCreateModal(false);
    };

    const handleJoinNotebook = async (e) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        const result = await db.notebooks.join(joinCode);
        if (result.notebook_id) {
            fetchNotebooks();
            setJoinCode("");
            setShowJoinModal(false);
        } else {
            alert(result.detail || "Invalid code. Try again.");
        }
    };

    const handleSelectNotebook = (id) => {
        setCurrentNotebookId(id);
        navigate(`/notebook/${id}`);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    return (
        <div className="clean-dashboard">

            {/* ── Sidebar ─────────────────────────── */}
            <aside className="clean-sidebar">
                <div className="sidebar-brand">
                    <StickyNote size={22} color="#ffeba1" strokeWidth={2.5} />
                </div>
                <nav className="sidebar-nav-list">
                    <div className="sidebar-link active" title="Home">
                        <Home className="icon" size={20} />
                    </div>
                    <div className="sidebar-link" onClick={() => setShowCreateModal(true)} title="New Notebook">
                        <Plus className="icon" size={20} />
                    </div>
                    <div className="sidebar-link" onClick={() => setShowJoinModal(true)} title="Join Notebook">
                        <Users className="icon" size={20} />
                    </div>
                    <div className="sidebar-link" title="All Notebooks">
                        <Folder className="icon" size={20} />
                    </div>
                </nav>
            </aside>

            {/* ── Main ────────────────────────────── */}
            <main className="clean-main">

                {/* Top Bar */}
                <header className="clean-top-bar">
                    <div className="search-box">
                        <Search size={15} color="rgba(255,235,161,0.35)" strokeWidth={2} />
                        <input type="text" placeholder="Search notebooks..." />
                    </div>

                    {currentUser && (
                        <div className="user-profile-nav">
                            <div
                                className="mini-avatar"
                                onClick={() => setShowUserDropdown(v => !v)}
                            >
                                {currentUser.username[0].toUpperCase()}
                            </div>

                            {showUserDropdown && (
                                <div className="dash-dropdown">
                                    <div className="dropdown-user-info">
                                        <p className="dropdown-username">{currentUser.username}</p>
                                        <p className="dropdown-email">{currentUser.email}</p>
                                    </div>
                                    <div className="dropdown-divider" />
                                    <button
                                        className="dropdown-item"
                                        onClick={() => { setShowJoinModal(true); setShowUserDropdown(false); }}
                                    >
                                        <Users size={14} /> Join Notebook
                                    </button>
                                    <div className="dropdown-divider" />
                                    <button className="dropdown-item logout-item" onClick={handleLogout}>
                                        <LogOut size={14} /> Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </header>

                {/* Scrollable content */}
                <div className="clean-content-scroller">
                    <div className="content-max-width">

                        {/* Hero */}
                        <section className="clean-hero">
                            <h1>Welcome back, {currentUser?.username || "there"} ✏️</h1>
                            <p>Your collaborative sticky notes workspace.</p>
                        </section>

                        {/* Quick Actions */}
                        <section className="clean-actions">
                            <div className="action-grid">
                                <div className="action-card" onClick={() => setShowCreateModal(true)}>
                                    <div className="action-icon-circle">
                                        <Plus size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="action-card-text">
                                        <h3>New Notebook</h3>
                                        <p>Create a fresh canvas for your stickies</p>
                                    </div>
                                </div>
                                <div
                                    className="action-card"
                                    onClick={() => setShowJoinModal(true)}
                                    style={{ animationName: "noteSlapRight" }}
                                >
                                    <div
                                        className="action-icon-circle"
                                        style={{ background: "rgba(255,235,161,0.1)", color: "#ffeba1" }}
                                    >
                                        <Users size={22} />
                                    </div>
                                    <div className="action-card-text">
                                        <h3>Join Notebook</h3>
                                        <p>Enter a code to join a shared workspace</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Notebooks Table */}
                        <section className="clean-recent">
                            <div className="table-header-row">
                                <h2>My Notebooks</h2>
                                <span style={{ color: "rgba(255,235,161,0.35)", fontSize: "0.9rem", fontFamily: "'Caveat', cursive" }}>
                                    {notebooks.length} {notebooks.length === 1 ? "notebook" : "notebooks"}
                                </span>
                            </div>

                            <div className="clean-table-container">
                                <table className="clean-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th className="table-extra-col">Created</th>
                                            <th className="table-extra-col">Owner</th>
                                            <th>Role</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notebooks.length === 0 ? (
                                            <tr>
                                                <td colSpan="4">
                                                    <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                                                        <BookText
                                                            size={40}
                                                            color="rgba(255,235,161,0.15)"
                                                            style={{ margin: "0 auto 0.75rem", display: "block" }}
                                                        />
                                                        <span style={{
                                                            fontFamily: "'Caveat', cursive",
                                                            fontSize: "1rem",
                                                            color: "rgba(255,235,161,0.3)"
                                                        }}>
                                                            No notebooks yet — create or join one above.
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : notebooks.map((nb) => {
                                            const isOwner = nb.owner_id === currentUser?.id;
                                            const date = nb.created_at ? new Date(nb.created_at).toLocaleDateString() : "—";
                                            const ownerInit = nb.owner?.username?.[0]?.toUpperCase() ?? "?";
                                            const ownerName = nb.owner?.username ?? "Unknown";

                                            return (
                                                <tr key={nb.id} onClick={() => handleSelectNotebook(nb.id)}>
                                                    <td>
                                                        <div className="table-file-name">
                                                            <Book
                                                                size={16}
                                                                color={isOwner ? "#ffeba1" : "rgba(255,235,161,0.3)"}
                                                                style={{ flexShrink: 0, opacity: 0.8 }}
                                                            />
                                                            <div style={{ minWidth: 0 }}>
                                                                <span style={{
                                                                    display: "block",
                                                                    fontFamily: "'Caveat', cursive",
                                                                    fontWeight: 700,
                                                                    fontSize: "1rem",
                                                                    color: isOwner ? "#ffeba1" : "rgba(255,235,161,0.7)"
                                                                }}>
                                                                    {nb.name}
                                                                </span>
                                                                <span style={{
                                                                    fontFamily: "'Caveat', cursive",
                                                                    fontSize: "0.75rem",
                                                                    color: "rgba(255,235,161,0.25)"
                                                                }}>
                                                                    #{nb.id}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="table-extra-col" style={{
                                                        color: "rgba(255,235,161,0.35)",
                                                        fontSize: "0.88rem",
                                                        fontFamily: "'Caveat', cursive"
                                                    }}>
                                                        {date}
                                                    </td>
                                                    <td className="table-extra-col">
                                                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                                            <div style={{
                                                                width: 24, height: 24,
                                                                borderRadius: "3px",
                                                                background: isOwner ? "rgba(255,235,161,0.12)" : "rgba(255,235,161,0.04)",
                                                                color: isOwner ? "#ffeba1" : "rgba(255,235,161,0.3)",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                fontFamily: "'Caveat', cursive",
                                                                fontSize: "0.7rem", fontWeight: 700,
                                                                flexShrink: 0,
                                                                transform: "rotate(-2deg)"
                                                            }}>
                                                                {ownerInit}
                                                            </div>
                                                            <span style={{
                                                                fontFamily: "'Caveat', cursive",
                                                                color: "rgba(255,235,161,0.45)",
                                                                fontSize: "0.88rem"
                                                            }}>
                                                                {isOwner ? "You" : ownerName}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${isOwner ? "owner" : "member"}`}>
                                                            {isOwner ? "Owner" : "Member"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                    </div>
                </div>
            </main>

            {/* ── Create Modal ─────────────────────── */}
            {showCreateModal && (
                <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
                    <div className="sharp-modal">
                        <h2>New Notebook ✨</h2>
                        <p>Give your sticky workspace a name.</p>
                        <form onSubmit={handleCreateNotebook}>
                            <div className="sharp-input-group">
                                <label>Notebook Name</label>
                                <input
                                    type="text"
                                    className="sharp-input"
                                    value={newNotebookName}
                                    onChange={e => setNewNotebookName(e.target.value)}
                                    placeholder="e.g. Product Roadmap"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-footer-btns">
                                <button
                                    type="button"
                                    className="sharp-btn secondary"
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="sharp-btn primary">
                                    Create →
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Join Modal ───────────────────────── */}
            {showJoinModal && (
                <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowJoinModal(false)}>
                    <div className="sharp-modal" style={{ transform: "rotate(0.8deg)" }}>
                        <h2>Join the board! 🔑</h2>
                        <p>Enter the 8-character invite code.</p>
                        <form onSubmit={handleJoinNotebook}>
                            <div className="sharp-input-group">
                                <label>Invite Code</label>
                                <input
                                    type="text"
                                    className="sharp-input"
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="A1B2C3D4"
                                    maxLength={8}
                                    required
                                    autoFocus
                                    style={{
                                        textTransform: "uppercase",
                                        letterSpacing: "6px",
                                        textAlign: "center",
                                        fontSize: "1.4rem"
                                    }}
                                />
                            </div>
                            <div className="modal-footer-btns">
                                <button
                                    type="button"
                                    className="sharp-btn secondary"
                                    onClick={() => setShowJoinModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="sharp-btn primary">
                                    Join →
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default NotebookPage;