import asyncio
from collections import defaultdict
from concurrent.futures import Future
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

from database.db import engine, get_db, Base, SessionLocal
from models.models import User, Note, Notebook, Connection
from schemas.schemas import (
    UserCreate, UserResponse, 
    NoteCreate, NoteUpdate, NoteResponse, 
    NotebookCreate, NotebookResponse, NotebookJoin,
    ConnectionCreate, ConnectionResponse,
    Token
)

from api.auth import create_access_token, get_current_user, get_password_hash, get_user_from_token, verify_password

Base.metadata.create_all(bind=engine)

app = FastAPI()


class NotebookRealtimeManager:
    def __init__(self):
        self.connections = defaultdict(set)
        self.loop = None

    async def connect(self, notebook_id: int, websocket: WebSocket):
        self.loop = asyncio.get_running_loop()
        await websocket.accept()
        self.connections[notebook_id].add(websocket)

    def disconnect(self, notebook_id: int, websocket: WebSocket):
        notebook_connections = self.connections.get(notebook_id)
        if not notebook_connections:
            return

        notebook_connections.discard(websocket)
        if not notebook_connections:
            self.connections.pop(notebook_id, None)

    async def broadcast(self, notebook_id: int, payload: dict):
        notebook_connections = list(self.connections.get(notebook_id, []))
        disconnected = []

        for websocket in notebook_connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(notebook_id, websocket)

    def broadcast_from_sync(self, notebook_id: int, payload: dict):
        if self.loop is None:
            return None

        return asyncio.run_coroutine_threadsafe(
            self.broadcast(notebook_id, payload),
            self.loop,
        )


realtime_manager = NotebookRealtimeManager()


def has_notebook_access(db: Session, notebook_id: int, user_id: int):
    is_owner = db.query(Notebook).filter(
        Notebook.id == notebook_id,
        Notebook.owner_id == user_id,
    ).first()
    is_member = db.query(Notebook).join(Notebook.members).filter(
        Notebook.id == notebook_id,
        User.id == user_id,
    ).first()
    return bool(is_owner or is_member)


def emit_notebook_event(notebook_id: int, event_type: str, **payload):
    serialized_payload = jsonable_encoder({"type": event_type, **payload})
    future = realtime_manager.broadcast_from_sync(notebook_id, serialized_payload)

    if isinstance(future, Future):
        future.add_done_callback(lambda done: done.exception())

# CORS — read allowed origins from env var (comma-separated)
# e.g. ALLOWED_ORIGINS="https://mystickyapp.vercel.app,http://localhost:5173"
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:3000"
)
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws/notebooks/{notebook_id}")
async def notebook_realtime_socket(
    websocket: WebSocket,
    notebook_id: int,
    token: str = Query(...),
):
    db = SessionLocal()

    try:
        current_user = get_user_from_token(token, db)

        if not has_notebook_access(db, notebook_id, current_user.id):
            await websocket.close(code=4403)
            return

        await realtime_manager.connect(notebook_id, websocket)

        while True:
            await websocket.receive_text()
    except HTTPException:
        await websocket.close(code=4401)
    except WebSocketDisconnect:
        pass
    finally:
        realtime_manager.disconnect(notebook_id, websocket)
        db.close()

# Auth Routes
@app.post("/signup", response_model=UserResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

import uuid

# Notebook Routes
@app.get("/notebooks", response_model=List[NotebookResponse])
def get_notebooks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get notebooks owned by user
    owned = db.query(Notebook).options(joinedload(Notebook.owner)).filter(Notebook.owner_id == current_user.id).all()
    # Get notebooks where user is a member
    joined = db.query(Notebook).options(joinedload(Notebook.owner)).join(Notebook.members).filter(User.id == current_user.id).all()
    return list(set(owned + joined))

@app.get("/notebooks/{notebook_id}", response_model=NotebookResponse)
def get_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notebook = db.query(Notebook).options(joinedload(Notebook.owner)).filter(Notebook.id == notebook_id).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if notebook.owner_id != current_user.id and current_user not in notebook.members:
        raise HTTPException(status_code=403, detail="Access denied")

    return notebook

@app.post("/notebooks", response_model=NotebookResponse)
def create_notebook(notebook: NotebookCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Create with a unique invite code
    invite_code = str(uuid.uuid4())[:8].upper()
    db_notebook = Notebook(**notebook.dict(), owner_id=current_user.id, invite_code=invite_code)
    db.add(db_notebook)
    db.commit()
    db.refresh(db_notebook)
    return db_notebook

@app.post("/notebooks/{notebook_id}/invite")
def get_invite_code(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_notebook = db.query(Notebook).filter(Notebook.id == notebook_id, Notebook.owner_id == current_user.id).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or you are not the owner")
    
    if not db_notebook.invite_code:
        db_notebook.invite_code = str(uuid.uuid4())[:8].upper()
        db.commit()
        db.refresh(db_notebook)
    
    return {"invite_code": db_notebook.invite_code}

@app.post("/notebooks/join")
def join_notebook(join_data: NotebookJoin, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_notebook = db.query(Notebook).filter(Notebook.invite_code == join_data.invite_code).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    
    if db_notebook.owner_id == current_user.id:
        return {"message": "You are already the owner of this notebook"}
    
    if current_user in db_notebook.members:
        return {"message": "You are already a member of this notebook"}
    
    db_notebook.members.append(current_user)
    db.commit()
    return {"message": "Joined successfully", "notebook_id": db_notebook.id}

@app.post("/notebooks/{notebook_id}/leave")
def leave_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_notebook = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    if db_notebook in current_user.member_of:
        current_user.member_of.remove(db_notebook)
        db.commit()
        return {"message": "Left successfully"}
    
    raise HTTPException(status_code=400, detail="You are not a member of this notebook")

@app.delete("/notebooks/{notebook_id}")
def delete_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_notebook = (
        db.query(Notebook)
        .options(
            joinedload(Notebook.members),
            joinedload(Notebook.notes),
            joinedload(Notebook.connections),
        )
        .filter(Notebook.id == notebook_id)
        .first()
    )

    if not db_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if db_notebook.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this notebook")

    # Clear membership links before removing the notebook so join-table rows are cleaned
    # up consistently across database backends.
    db_notebook.members.clear()
    db.delete(db_notebook)
    db.commit()
    return {"message": "Notebook deleted"}

@app.get("/notebooks/{notebook_id}/connections", response_model=List[ConnectionResponse])
def get_connections_for_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not has_notebook_access(db, notebook_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    return db.query(Connection).filter(Connection.notebook_id == notebook_id).all()

@app.post("/connections", response_model=ConnectionResponse)
def create_connection(connection: ConnectionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not has_notebook_access(db, connection.notebook_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied to this notebook")

    if connection.source_note_id == connection.target_note_id:
        raise HTTPException(status_code=400, detail="A note cannot connect to itself")

    source_id, target_id = sorted([connection.source_note_id, connection.target_note_id])

    notes = db.query(Note).filter(
        Note.notebook_id == connection.notebook_id,
        Note.id.in_([source_id, target_id]),
    ).all()
    if len(notes) != 2:
        raise HTTPException(status_code=404, detail="One or more notes were not found in this notebook")

    existing = db.query(Connection).filter(
        Connection.notebook_id == connection.notebook_id,
        Connection.source_note_id == source_id,
        Connection.target_note_id == target_id,
    ).first()
    if existing:
        return existing

    db_connection = Connection(
        notebook_id=connection.notebook_id,
        source_note_id=source_id,
        target_note_id=target_id,
    )
    db.add(db_connection)
    db.commit()
    db.refresh(db_connection)
    emit_notebook_event(connection.notebook_id, "connection_created", connection=db_connection)
    return db_connection

@app.delete("/connections/{connection_id}")
def delete_connection(connection_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_connection = db.query(Connection).filter(Connection.id == connection_id).first()
    if not db_connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not has_notebook_access(db, db_connection.notebook_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    notebook_id = db_connection.notebook_id
    db.delete(db_connection)
    db.commit()
    emit_notebook_event(notebook_id, "connection_deleted", connection_id=connection_id)
    return {"message": "Connection deleted"}

# Note Routes
@app.get("/notebooks/{notebook_id}/notes", response_model=List[NoteResponse])
def get_notes_for_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if owner OR member
    if not has_notebook_access(db, notebook_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
        
    return db.query(Note).options(joinedload(Note.owner)).filter(Note.notebook_id == notebook_id).all()

@app.post("/notes", response_model=NoteResponse)
def create_note(note: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check access to notebook
    if not has_notebook_access(db, note.notebook_id, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied to this notebook")
    
    db_note = Note(**note.dict(), owner_id=current_user.id)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    full_note = db.query(Note).options(joinedload(Note.owner)).filter(Note.id == db_note.id).first()
    emit_notebook_event(note.notebook_id, "note_created", note=full_note)
    return full_note

@app.patch("/notes/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, note: NoteUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Check if user has access to the notebook this note belongs to
    notebook_id = db_note.notebook_id
    if not has_notebook_access(db, notebook_id, current_user.id):
         raise HTTPException(status_code=403, detail="Access denied")

    update_data = note.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_note, key, value)
    
    db.commit()
    db.refresh(db_note)
    full_note = db.query(Note).options(joinedload(Note.owner)).filter(Note.id == note_id).first()
    emit_notebook_event(notebook_id, "note_updated", note=full_note)
    return full_note

@app.delete("/notes/{note_id}")
def delete_note(note_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    # Owner of note OR owner of notebook can delete
    is_note_owner = (db_note.owner_id == current_user.id)
    is_notebook_owner = db.query(Notebook).filter(Notebook.id == db_note.notebook_id, Notebook.owner_id == current_user.id).first()
    
    if not is_note_owner and not is_notebook_owner:
        raise HTTPException(status_code=403, detail="Access denied")

    related_connection_ids = [
        connection_id
        for (connection_id,) in db.query(Connection.id).filter(
            or_(
                Connection.source_note_id == note_id,
                Connection.target_note_id == note_id,
            )
        ).all()
    ]

    db.query(Connection).filter(
        or_(
            Connection.source_note_id == note_id,
            Connection.target_note_id == note_id,
        )
    ).delete(synchronize_session=False)

    notebook_id = db_note.notebook_id
    db.delete(db_note)
    db.commit()
    emit_notebook_event(
        notebook_id,
        "note_deleted",
        note_id=note_id,
        removed_connection_ids=related_connection_ids,
    )
    return {"message": "Note deleted"}

@app.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
