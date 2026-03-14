import { useContext } from "react";
import { Trash2 } from "lucide-react";
import { NoteContext } from "../context/NotesContext";

const DEFAULT_NOTE_SIZE = { width: 260, height: 260 };
const SVG_PADDING = 140;

const parsePosition = (position) => {
    if (!position) return { x: 0, y: 0 };
    return typeof position === "string" ? JSON.parse(position) : position;
};

const getBounds = (note, noteSizes, notePositions) => {
    const position = notePositions[String(note.$id)] || parsePosition(note.position);
    const size = noteSizes[String(note.$id)] || DEFAULT_NOTE_SIZE;

    return {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        centerX: position.x + size.width / 2,
        centerY: position.y + size.height / 2,
    };
};

const getAnchorPair = (sourceBounds, targetBounds) => {
    const deltaX = targetBounds.centerX - sourceBounds.centerX;
    const deltaY = targetBounds.centerY - sourceBounds.centerY;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        if (deltaX >= 0) {
            return {
                start: { x: sourceBounds.x + sourceBounds.width, y: sourceBounds.centerY },
                end: { x: targetBounds.x, y: targetBounds.centerY },
                orientation: "horizontal",
            };
        }

        return {
            start: { x: sourceBounds.x, y: sourceBounds.centerY },
            end: { x: targetBounds.x + targetBounds.width, y: targetBounds.centerY },
            orientation: "horizontal",
        };
    }

    if (deltaY >= 0) {
        return {
            start: { x: sourceBounds.centerX, y: sourceBounds.y + sourceBounds.height },
            end: { x: targetBounds.centerX, y: targetBounds.y },
            orientation: "vertical",
        };
    }

    return {
        start: { x: sourceBounds.centerX, y: sourceBounds.y },
        end: { x: targetBounds.centerX, y: targetBounds.y + targetBounds.height },
        orientation: "vertical",
    };
};

const buildSmoothPath = ({ start, end, orientation }) => {
    if (orientation === "horizontal") {
        const bend = Math.max(Math.abs(end.x - start.x) * 0.5, 44);
        const controlX1 = start.x + (end.x >= start.x ? bend : -bend);
        const controlX2 = end.x + (end.x >= start.x ? -bend : bend);

        return `M ${start.x} ${start.y} C ${controlX1} ${start.y}, ${controlX2} ${end.y}, ${end.x} ${end.y}`;
    }

    const bend = Math.max(Math.abs(end.y - start.y) * 0.5, 44);
    const controlY1 = start.y + (end.y >= start.y ? bend : -bend);
    const controlY2 = end.y + (end.y >= start.y ? -bend : bend);

    return `M ${start.x} ${start.y} C ${start.x} ${controlY1}, ${end.x} ${controlY2}, ${end.x} ${end.y}`;
};

const ConnectionLayer = () => {
    const {
        notes,
        connections,
        noteSizes,
        notePositions,
        selectedConnectionId,
        setSelectedConnectionId,
        deleteConnectionById,
    } = useContext(NoteContext);

    const notesById = new Map(notes.map(note => [String(note.$id), note]));
    const preparedConnections = connections
        .map(connection => {
            const sourceNote = notesById.get(String(connection.source_note_id));
            const targetNote = notesById.get(String(connection.target_note_id));
            if (!sourceNote || !targetNote) return null;

            const sourceBounds = getBounds(sourceNote, noteSizes, notePositions);
            const targetBounds = getBounds(targetNote, noteSizes, notePositions);
            const anchors = getAnchorPair(sourceBounds, targetBounds);
            const midpoint = {
                x: (anchors.start.x + anchors.end.x) / 2,
                y: (anchors.start.y + anchors.end.y) / 2,
            };

            return {
                ...connection,
                anchors,
                points: [anchors.start, anchors.end, midpoint],
                midpoint,
            };
        })
        .filter(Boolean);

    if (!preparedConnections.length) return null;

    const minX = Math.min(...preparedConnections.flatMap(connection => connection.points.map(point => point.x))) - SVG_PADDING;
    const minY = Math.min(...preparedConnections.flatMap(connection => connection.points.map(point => point.y))) - SVG_PADDING;
    const maxX = Math.max(...preparedConnections.flatMap(connection => connection.points.map(point => point.x))) + SVG_PADDING;
    const maxY = Math.max(...preparedConnections.flatMap(connection => connection.points.map(point => point.y))) + SVG_PADDING;
    const width = maxX - minX;
    const height = maxY - minY;

    return (
        <div
            className="connection-layer"
            style={{
                left: `${minX}px`,
                top: `${minY}px`,
                width: `${width}px`,
                height: `${height}px`,
            }}
        >
            <svg className="connection-svg" viewBox={`0 0 ${width} ${height}`}>
                {preparedConnections.map(connection => {
                    const localAnchors = {
                        ...connection.anchors,
                        start: {
                            x: connection.anchors.start.x - minX,
                            y: connection.anchors.start.y - minY,
                        },
                        end: {
                            x: connection.anchors.end.x - minX,
                            y: connection.anchors.end.y - minY,
                        },
                    };
                    const translatedPath = buildSmoothPath(localAnchors);

                    return (
                        <g key={connection.id}>
                            <path
                                className="connection-hit-area"
                                d={translatedPath}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedConnectionId(connection.id);
                                }}
                            />
                            <path
                                className={`connection-path ${selectedConnectionId === connection.id ? "selected" : ""}`}
                                d={translatedPath}
                            />
                        </g>
                    );
                })}
            </svg>

            {preparedConnections
                .filter(connection => connection.id === selectedConnectionId)
                .map(connection => (
                    <button
                        key={`delete-${connection.id}`}
                        type="button"
                        className="connection-delete-btn"
                        style={{
                            left: `${connection.midpoint.x - minX}px`,
                            top: `${connection.midpoint.y - minY}px`,
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            deleteConnectionById(connection.id);
                        }}
                        title="Delete connection"
                    >
                        <Trash2 size={12} />
                    </button>
                ))}
        </div>
    );
};

export default ConnectionLayer;
