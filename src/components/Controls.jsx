import { useState } from "react";
import AddButton from "./AddButton";
import colors from "../assets/colors.json";
import Color from "./Color";
import { Plus, X } from "lucide-react";
 
const Controls = () => {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <div id="controls">
                <AddButton />
                {colors.slice(0, 3).map((color) => (
                    <Color key={color.id} color={color} />
                ))}

                <div 
                    id="color-plus-btn"
                    onClick={() => setShowModal(true)}
                >
                    <Plus size={20} />
                </div>
            </div>

            {showModal && (
                <div className="color-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="color-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="color-modal-header">
                            <h3>Choose Color</h3>
                            <div className="close-btn" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </div>
                        </div>
                        <div className="color-grid">
                            {colors.map((color) => (
                                <Color 
                                    key={color.id} 
                                    color={color} 
                                    onSelect={() => setShowModal(false)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

 
export default Controls;