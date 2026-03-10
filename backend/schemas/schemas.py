from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

# Notebook Schemas
class NotebookBase(BaseModel):
    name: str

class NotebookCreate(NotebookBase):
    pass

class NotebookResponse(NotebookBase):
    id: int
    owner_id: int
    invite_code: Optional[str] = None
    created_at: datetime
    owner: UserResponse
    class Config:
        from_attributes = True

class NotebookJoin(BaseModel):
    invite_code: str

# Note Schemas
class NoteBase(BaseModel):
    body: str = ""
    colors: str
    position: str

class NoteCreate(NoteBase):
    notebook_id: int

class NoteUpdate(BaseModel):
    body: Optional[str] = None
    colors: Optional[str] = None
    position: Optional[str] = None

class NoteResponse(NoteBase):
    id: int
    owner_id: int
    notebook_id: int
    owner: UserResponse
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
