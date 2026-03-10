from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from typing import List
import uvicorn
import os

from database.db import engine, get_db, Base
from models.models import User, Note, Notebook
from schemas.schemas import (
    UserCreate, UserResponse, 
    NoteCreate, NoteUpdate, NoteResponse, 
    NotebookCreate, NotebookResponse, NotebookJoin,
    Token
)

from api.auth import create_access_token, get_current_user, get_password_hash, verify_password

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    db_notebook = db.query(Notebook).filter(Notebook.id == notebook_id, Notebook.owner_id == current_user.id).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or you are not the owner")
    db.delete(db_notebook)
    db.commit()
    return {"message": "Notebook deleted"}

# Note Routes
@app.get("/notebooks/{notebook_id}/notes", response_model=List[NoteResponse])
def get_notes_for_notebook(notebook_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if owner OR member
    is_owner = db.query(Notebook).filter(Notebook.id == notebook_id, Notebook.owner_id == current_user.id).first()
    is_member = db.query(Notebook).join(Notebook.members).filter(Notebook.id == notebook_id, User.id == current_user.id).first()
    
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="Access denied")
        
    return db.query(Note).options(joinedload(Note.owner)).filter(Note.notebook_id == notebook_id).all()

@app.post("/notes", response_model=NoteResponse)
def create_note(note: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check access to notebook
    is_owner = db.query(Notebook).filter(Notebook.id == note.notebook_id, Notebook.owner_id == current_user.id).first()
    is_member = db.query(Notebook).join(Notebook.members).filter(Notebook.id == note.notebook_id, User.id == current_user.id).first()
    
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="Access denied to this notebook")
    
    db_note = Note(**note.dict(), owner_id=current_user.id)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db.query(Note).options(joinedload(Note.owner)).filter(Note.id == db_note.id).first()

@app.patch("/notes/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, note: NoteUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Check if user has access to the notebook this note belongs to
    notebook_id = db_note.notebook_id
    is_owner = db.query(Notebook).filter(Notebook.id == notebook_id, Notebook.owner_id == current_user.id).first()
    is_member = db.query(Notebook).join(Notebook.members).filter(Notebook.id == notebook_id, User.id == current_user.id).first()
    
    # Only owner of note OR someone with notebook access can update? 
    # Usually collaborative means anyone with notebook access can update.
    if not (is_owner or is_member):
         raise HTTPException(status_code=403, detail="Access denied")

    update_data = note.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_note, key, value)
    
    db.commit()
    db.refresh(db_note)
    return db.query(Note).options(joinedload(Note.owner)).filter(Note.id == note_id).first()

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
    
    db.delete(db_note)
    db.commit()
    return {"message": "Note deleted"}

@app.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
