import React from "react";
import { useContext } from "react";
import { NoteContext } from "../context/NotesContext";
import { db } from "../utils/db";

const Color = ({ color, onSelect }) => {
    // 1. Add 'notes' and 'setNotes' to the context destructuring
    const { selectedNote, notes, setNotes } = useContext(NoteContext);

    const changeColor = async () => {
        try {
            // 2. Ensure a note is actually selected
            if (!selectedNote) {
                alert("Please select a note first.");
                return;
            }

            const currentNoteIndex = notes.findIndex(
                (note) => note.cid === selectedNote.cid || note.$id === selectedNote.$id
            );

            if (currentNoteIndex === -1) return;

            const targetNote = notes[currentNoteIndex];
            const newColorString = JSON.stringify(color);

            // 4. Update the local state so the UI changes immediately
            setNotes(prev => prev.map(n => n.cid === targetNote.cid ? {
                ...n,
                colors: newColorString,
                __localEdit: Date.now()
            } : n));

            // 5. Update the Appwrite database with retry logic for optimistic notes
            const saveToServer = async (retryCount = 0) => {
                let latestId = targetNote.$id;
                // Peek at latest state to get potential real ID
                setNotes(prev => {
                    const latestNote = prev.find(n => n.cid === targetNote.cid);
                    if (latestNote) latestId = latestNote.$id;
                    return prev;
                });

                if (typeof latestId === "string" && latestId.startsWith("temp-")) {
                    if (retryCount < 20) {
                        setTimeout(() => saveToServer(retryCount + 1), 500);
                    }
                    return;
                }

                try {
                    await db.notes.update(latestId, { colors: newColorString });
                } catch(e) { console.error("Error changing color:", e); }
            };

            saveToServer();

            if (onSelect) {
                onSelect();
            }
            
        } catch (error) {
            console.error("Error changing color (sync):", error);
        }
    };

    return (
        <div
            onClick={changeColor}
            className="color"
            style={{ backgroundColor: color.colorHeader }}
        ></div>
    );
};

export default Color;

