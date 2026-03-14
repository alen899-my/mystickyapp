/* eslint-disable react/prop-types */
import { createContext, useState, useEffect, useRef } from "react";
import Spinner from "../icons/Spinner";
import { db } from "../utils/db";
import { useDialog } from "./DialogContext";

export const NoteContext = createContext();

const NotesProvider = ({ children }) => {
    const { showAlert } = useDialog();
    const [selectedNote, setSelectedNote] = useState(null);
    const [selectedConnectionId, setSelectedConnectionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState([]);
    const [connections, setConnections] = useState([]);
    const [currentNotebookId, setCurrentNotebookId] = useState(null);
    const [canvasOffset, setCanvasOffset] = useState({ x: 100, y: 120 });
    const [zoom, setZoom] = useState(1);
    const [pendingConnectionNoteId, setPendingConnectionNoteId] = useState(null);
    const [pendingUnlinkNoteId, setPendingUnlinkNoteId] = useState(null);
    const [noteSizes, setNoteSizes] = useState({});
    const [notePositions, setNotePositions] = useState({});

    // zoomRef is always the latest zoom value - safe to read inside drag closures
    const zoomRef = useRef(1);
    const connectionsRef = useRef([]);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);

    const getNoteKey = (note) => String(note?.cid || note?.$id || "");

    const fetchCanvasData = async (notebookId) => {
        if (!notebookId) return;

        setLoading(true);

        try {
            const [noteResponse, connectionResponse] = await Promise.all([
                db.notes.list(notebookId),
                db.connections.list(notebookId),
            ]);

            setNotes(noteResponse.documents || []);
            setConnections(connectionResponse.documents || []);
            setSelectedConnectionId(null);
            setPendingConnectionNoteId(null);
            setPendingUnlinkNoteId(null);
            setNoteSizes({});
            setNotePositions({});
        } finally {
            setLoading(false);
        }
    };

    const updateNoteSize = (noteId, size) => {
        setNoteSizes(prev => {
            const current = prev[noteId];
            if (
                current &&
                current.width === size.width &&
                current.height === size.height
            ) {
                return prev;
            }

            return { ...prev, [noteId]: size };
        });
    };

    const removeNoteSize = (noteId) => {
        setNoteSizes(prev => {
            if (!prev[noteId]) return prev;

            const next = { ...prev };
            delete next[noteId];
            return next;
        });
    };

    const updateNotePosition = (noteId, position) => {
        setNotePositions(prev => {
            const current = prev[noteId];
            if (
                current &&
                current.x === position.x &&
                current.y === position.y
            ) {
                return prev;
            }

            return { ...prev, [noteId]: position };
        });
    };

    const removeNotePosition = (noteId) => {
        setNotePositions(prev => {
            if (!prev[noteId]) return prev;

            const next = { ...prev };
            delete next[noteId];
            return next;
        });
    };

    const cancelPendingConnection = () => {
        setPendingConnectionNoteId(null);
    };

    const cancelPendingUnlink = () => {
        setPendingUnlinkNoteId(null);
    };

    const deleteConnectionById = async (connectionId) => {
        if (!connectionId) return;

        setConnections(prev => prev.filter(connection => connection.id !== connectionId));
        setSelectedConnectionId(prev => prev === connectionId ? null : prev);

        try {
            await db.connections.delete(connectionId);
        } catch (error) {
            console.error("Delete connection error:", error);

            if (currentNotebookId) {
                const response = await db.connections.list(currentNotebookId);
                setConnections(response.documents || []);
            }
        }
    };

    const deleteConnectionsForNote = async (noteId) => {
        if (!noteId) return;

        const noteIdString = String(noteId);
        const affectedConnections = connectionsRef.current.filter(connection =>
            String(connection.source_note_id) === noteIdString ||
            String(connection.target_note_id) === noteIdString
        );

        if (!affectedConnections.length) return;

        const affectedIds = new Set(affectedConnections.map(connection => connection.id));
        setConnections(prev => prev.filter(connection => !affectedIds.has(connection.id)));
        setSelectedConnectionId(prev => affectedIds.has(prev) ? null : prev);
        setPendingUnlinkNoteId(prev => prev === noteIdString ? null : prev);

        const results = await Promise.allSettled(
            affectedConnections.map(connection => db.connections.delete(connection.id))
        );

        const hasFailure = results.some(result => result.status === "rejected");
        if (hasFailure && currentNotebookId) {
            console.error("Delete connections for note error:", results);
            const response = await db.connections.list(currentNotebookId);
            setConnections(response.documents || []);
        }
    };

    const beginOrCompleteUnlink = async (note) => {
        if (!note) return;

        const noteId = String(note.$id);
        if (noteId.startsWith("temp-")) {
            await showAlert({
                title: "Note still saving",
                message: "Please wait for the note to finish saving before unlinking it.",
            });
            return;
        }

        if (!pendingUnlinkNoteId) {
            setPendingUnlinkNoteId(noteId);
            setPendingConnectionNoteId(null);
            setSelectedConnectionId(null);
            return;
        }

        if (pendingUnlinkNoteId === noteId) {
            setPendingUnlinkNoteId(null);
            return;
        }

        const matchingConnection = connectionsRef.current.find(connection => {
            const sourceId = String(connection.source_note_id);
            const targetId = String(connection.target_note_id);

            return (
                (sourceId === pendingUnlinkNoteId && targetId === noteId) ||
                (sourceId === noteId && targetId === pendingUnlinkNoteId)
            );
        });

        if (!matchingConnection) {
            await showAlert({
                title: "No direct link found",
                message: "Those two notes are not directly connected.",
            });
            setPendingUnlinkNoteId(noteId);
            return;
        }

        setPendingUnlinkNoteId(null);
        await deleteConnectionById(matchingConnection.id);
    };

    const beginOrCompleteConnection = async (note) => {
        if (!note || !currentNotebookId) return;

        const noteId = String(note.$id);
        if (noteId.startsWith("temp-")) {
            await showAlert({
                title: "Note still saving",
                message: "Please wait for the note to finish saving before connecting it.",
            });
            return;
        }

        if (!pendingConnectionNoteId) {
            setPendingConnectionNoteId(noteId);
            setPendingUnlinkNoteId(null);
            setSelectedConnectionId(null);
            return;
        }

        if (pendingConnectionNoteId === noteId) {
            setPendingConnectionNoteId(null);
            return;
        }

        const sourceNote = notes.find(candidate => String(candidate.$id) === pendingConnectionNoteId);
        const targetNote = notes.find(candidate => String(candidate.$id) === noteId);
        setPendingConnectionNoteId(null);

        if (!sourceNote || !targetNote) {
            return;
        }

        const [sourceId, targetId] = [Number(sourceNote.$id), Number(targetNote.$id)].sort((left, right) => left - right);
        const duplicate = connections.some(connection =>
            connection.source_note_id === sourceId &&
            connection.target_note_id === targetId
        );

        if (duplicate) return;

        try {
            const response = await db.connections.create({
                notebook_id: Number(currentNotebookId),
                source_note_id: sourceId,
                target_note_id: targetId,
            });

            setConnections(prev => {
                if (prev.some(connection => connection.id === response.id)) {
                    return prev;
                }

                return [...prev, response];
            });
        } catch (error) {
            console.error("Create connection error:", error);
            await showAlert({
                title: "Could not create connection",
                message: "Please try again in a moment.",
                confirmText: "Close",
            });
        }
    };

    useEffect(() => {
        if (currentNotebookId) {
            fetchCanvasData(currentNotebookId);
        } else {
            setNotes([]);
            setConnections([]);
            setSelectedConnectionId(null);
            setPendingConnectionNoteId(null);
            setPendingUnlinkNoteId(null);
            setNoteSizes({});
            setNotePositions({});
        }
    }, [currentNotebookId]);

    const contextData = {
        notes,
        setNotes,
        connections,
        setConnections,
        selectedNote,
        setSelectedNote,
        selectedConnectionId,
        setSelectedConnectionId,
        pendingConnectionNoteId,
        pendingUnlinkNoteId,
        beginOrCompleteConnection,
        cancelPendingConnection,
        beginOrCompleteUnlink,
        cancelPendingUnlink,
        deleteConnectionById,
        deleteConnectionsForNote,
        noteSizes,
        notePositions,
        updateNoteSize,
        removeNoteSize,
        updateNotePosition,
        removeNotePosition,
        getNoteKey,
        currentNotebookId,
        setCurrentNotebookId,
        canvasOffset,
        setCanvasOffset,
        zoom,
        zoomRef,
        setZoom,
        loading,
    };

    return (
        <NoteContext.Provider value={contextData}>
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
                    <Spinner size="100" />
                </div>
            ) : (
                children
            )}
        </NoteContext.Provider>
    );
};

export default NotesProvider;
