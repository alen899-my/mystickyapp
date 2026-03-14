import PropTypes from "prop-types";
import { useContext } from "react";
import { NoteContext } from "../context/NotesContext";
import { db } from "../utils/db";
import { useDialog } from "../context/DialogContext";

const Color = ({ color, onSelect }) => {
    // 1. Add 'notes' and 'setNotes' to the context destructuring
    const { selectedNote, notes, setNotes, getNoteKey } = useContext(NoteContext);
    const { showAlert } = useDialog();

    const matchesTargetNote = (candidate, targetNote) => getNoteKey(candidate) === getNoteKey(targetNote);

    const changeColor = async () => {
        try {
            // 2. Ensure a note is actually selected
            if (!selectedNote) {
                await showAlert({
                    title: "Select a note first",
                    message: "Pick the note you want to recolor, then choose a color.",
                });
                return;
            }

            const selectedNoteKey = getNoteKey(selectedNote);
            const targetNote = notes.find((note) => getNoteKey(note) === selectedNoteKey);

            if (!targetNote) return;

            const newColorString = JSON.stringify(color);

            // 4. Update the local state so the UI changes immediately
            setNotes(prev => prev.map(n => matchesTargetNote(n, targetNote) ? {
                ...n,
                colors: newColorString,
                __localEdit: Date.now()
            } : n));

            // 5. Update the Appwrite database with retry logic for optimistic notes
            const saveToServer = async (retryCount = 0) => {
                let latestId = targetNote.$id;
                // Peek at latest state to get potential real ID
                setNotes(prev => {
                    const latestNote = prev.find(n => matchesTargetNote(n, targetNote));
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

Color.propTypes = {
    color: PropTypes.shape({
        colorHeader: PropTypes.string.isRequired,
    }).isRequired,
    onSelect: PropTypes.func,
};

