import { Plus } from "lucide-react";
import colors from "../assets/colors.json";
import { useContext } from "react";
import { db } from "../utils/db";
import { NoteContext } from "../context/NotesContext";
import { useDialog } from "../context/DialogContext";

const AddButton = () => {
    const { setNotes, currentNotebookId, canvasOffset, zoom } = useContext(NoteContext);
    const { showAlert } = useDialog();
 
    const addNote = async () => {
        if (!currentNotebookId) {
            await showAlert({
                title: "No notebook selected",
                message: "Open a notebook first, then add your note to the canvas.",
            });
            return;
        }

        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

        // Calculate center relative to current canvas view
        const spawnX = Math.round((viewportWidth / 2 - canvasOffset.x) / zoom) - 150;
        const spawnY = Math.round((viewportHeight / 2 - canvasOffset.y) / zoom) - 120;

        const tempId = `temp-${Date.now()}`;
        const optimisticNote = {
            $id: tempId,
            cid: tempId, // Persistent key
            body: "",
            colors: JSON.stringify(colors[0]),
            position: JSON.stringify({ x: spawnX, y: spawnY }),
            notebook_id: parseInt(currentNotebookId),
            isOptimistic: true 
        };

        // 1. Instantly update UI
        setNotes((prevState) => [optimisticNote, ...prevState]);

        const payload = {
            position: optimisticNote.position,
            colors: optimisticNote.colors,
            notebook_id: optimisticNote.notebook_id
        };

        try {
            // 2. Perform server call in background
            const response = await db.notes.create(payload);
            
            // 3. Replace temp note with real data but KEEP the CID for stable key
            setNotes((prevState) => {
                const existingRealNote = prevState.find(n => String(n.$id) === String(response.$id));

                if (existingRealNote) {
                    return prevState
                        .filter(n => n.cid !== tempId)
                        .map(n => {
                            if (String(n.$id) !== String(response.$id)) {
                                return n;
                            }

                            return {
                                ...n,
                                ...response,
                                cid: n.cid || tempId,
                                body: n.__localEdit ? n.body : response.body,
                                position: n.__localEdit ? n.position : response.position,
                                colors: n.__localEdit ? n.colors : response.colors,
                                __localEdit: n.__localEdit || undefined,
                            };
                        });
                }

                return prevState.map(n => {
                    if (n.cid === tempId) {
                        return {
                            ...response,
                            cid: tempId,
                            body: n.__localEdit ? n.body : response.body,
                            position: n.__localEdit ? n.position : response.position,
                            colors: n.__localEdit ? n.colors : response.colors,
                            __localEdit: n.__localEdit || undefined,
                        };
                    }
                    return n;
                });
            });
        } catch (error) {
            // Rollback on failure
            setNotes((prevState) => prevState.filter(n => n.$id !== tempId));
            console.error("Failed to create note:", error);
        }
    };
 
    return (
        <div id="add-btn" onClick={addNote}>
            <Plus size={24} strokeWidth={2.5} />
        </div>
    );
};
export default AddButton;
