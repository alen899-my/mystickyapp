from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    try:
        # Add invite_code to notebooks
        conn.execute(text("ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS invite_code VARCHAR UNIQUE;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notebooks_invite_code ON notebooks (invite_code);"))
        
        # Create notebook_members table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notebook_members (
                user_id INTEGER NOT NULL,
                notebook_id INTEGER NOT NULL,
                PRIMARY KEY (user_id, notebook_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
            );
        """))
        
        conn.commit()
        print("Successfully migrated database for collaborative features")
    except Exception as e:
        print(f"Error during migration: {e}")
