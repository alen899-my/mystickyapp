from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.db import Base

# Association table for notebook members
notebook_members = Table(
    "notebook_members",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("notebook_id", Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Notebooks the user OWNS
    owned_notebooks = relationship("Notebook", back_populates="owner")
    
    # Notebooks the user is a MEMBER of
    member_of = relationship("Notebook", secondary=notebook_members, back_populates="members")
    
    notes = relationship("Note", back_populates="owner")

class Notebook(Base):
    __tablename__ = "notebooks"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    invite_code = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    owner = relationship("User", back_populates="owned_notebooks")
    
    # All users who have access to this notebook (members)
    members = relationship("User", secondary=notebook_members, back_populates="member_of")
    
    notes = relationship("Note", back_populates="notebook", cascade="all, delete-orphan")
    connections = relationship("Connection", back_populates="notebook", cascade="all, delete-orphan")

class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    body = Column(Text, nullable=True)
    colors = Column(Text, nullable=True)
    position = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    notebook_id = Column(Integer, ForeignKey("notebooks.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="notes")
    notebook = relationship("Notebook", back_populates="notes")

class Connection(Base):
    __tablename__ = "connections"
    id = Column(Integer, primary_key=True, index=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"))
    source_note_id = Column(Integer, ForeignKey("notes.id"))
    target_note_id = Column(Integer, ForeignKey("notes.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    notebook = relationship("Notebook", back_populates="connections")
    source_note = relationship("Note", foreign_keys=[source_note_id])
    target_note = relationship("Note", foreign_keys=[target_note_id])
