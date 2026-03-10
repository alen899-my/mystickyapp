import { createContext, useState, useEffect, useRef } from "react";
import Spinner from "../icons/Spinner";
import { db } from "../utils/db";
 
export const NoteContext = createContext();
 
const NotesProvider = ({ children }) => {
    const [selectedNote, setSelectedNote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState([]);
    const [currentNotebookId, setCurrentNotebookId] = useState(null);
    const [canvasOffset, setCanvasOffset] = useState({ x: 100, y: 120 });
    const [zoom, setZoom] = useState(1);

    // zoomRef is always the latest zoom value — safe to read inside drag closures
    const zoomRef = useRef(1);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    const fetchNotes = async (notebookId) => {
        if (!notebookId) return;
        setLoading(true);
        const response = await db.notes.list(notebookId);
        setNotes(response.documents || []);
        setLoading(false);
    };

    useEffect(() => {
        if (currentNotebookId) {
            fetchNotes(currentNotebookId);
        }
    }, [currentNotebookId]);

    const contextData = { 
        notes, 
        setNotes, 
        selectedNote, 
        setSelectedNote,
        currentNotebookId,
        setCurrentNotebookId,
        canvasOffset,
        setCanvasOffset,
        zoom,
        zoomRef,   // always-current zoom ref, safe in event closures
        setZoom,
        loading
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