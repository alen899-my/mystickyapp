from database.db import engine, Base
from models.models import User, Note, Notebook

def reset_db():
    print("Dropping existing tables...")
    Note.__table__.drop(engine, checkfirst=True)
    Notebook.__table__.drop(engine, checkfirst=True)
    User.__table__.drop(engine, checkfirst=True)
    
    print("Creating new tables with Notebook support...")
    Base.metadata.create_all(bind=engine)
    print("Database reset successful!")

if __name__ == "__main__":
    reset_db()
