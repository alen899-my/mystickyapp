import { Trash2 } from "lucide-react";
import { db } from "../utils/db";
import { useContext } from "react";
import { NoteContext } from "../context/NotesContext";
const DeleteButton = ({ noteId, color = '#000000' }) => {
    const { setNotes } = useContext(NoteContext);
 
    const handleDelete = async (e) => {
        db.notes.delete(noteId);
        setNotes((prevState) =>
            prevState.filter((note) => note.$id !== noteId)
        );
    };
 
    return (
        <div 
            onClick={handleDelete} 
            style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                color: color,
                transition: 'transform 0.1s ease',
                opacity: 0.6
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '0.6'; }}
        >
            <Trash2 size={16} />
        </div>
    );
};
 
export default DeleteButton;