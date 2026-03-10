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
                (note) => note.$id === selectedNote.$id
            );

            // 3. Create the updated note object
            const updatedNote = {
                ...notes[currentNoteIndex],
                colors: JSON.stringify(color),
            };

            // 4. Update the local state so the UI changes immediately
            const newNotes = [...notes];
            newNotes[currentNoteIndex] = updatedNote;
            setNotes(newNotes);

            // 5. Update the Appwrite database
            await db.notes.update(selectedNote.$id, {
                colors: JSON.stringify(color),
            });

            if (onSelect) {
                onSelect();
            }
            
        } catch (error) {
            console.error("Error changing color:", error);
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

