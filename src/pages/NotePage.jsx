import NoteCard from "../components/NoteCard";
import { useState, useEffect } from "react";
import Controls from "../components/Controls";
import { useContext } from "react";
import { NoteContext } from "../context/NotesContext";

const NotesPage = () => {
    const { notes } = useContext(NoteContext);
    return (
        <div>
            {notes.map((note) => (
                <NoteCard note={note} key={note.$id} />
            ))}
            <Controls />
        </div>
    );
};


export default NotesPage;
