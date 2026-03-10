from sqlalchemy import text
from database.db import engine

with engine.connect() as conn:
    res = conn.execute(text("SELECT id, created_at FROM notes ORDER BY id DESC LIMIT 10")).fetchall()
    for row in res:
        print(f"ID: {row[0]}, Created At: {row[1]}")
