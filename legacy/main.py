from fastapi import FastAPI #framework to create API endpoints
from pydantic import BaseModel # validates incoming JSON automatically
from typing import Optional, Dict, Any #helps define optional fields and dictionaries
import sqlite3 #lightweight database
import json
from datetime import datetime

app = FastAPI()

def init_db(): #Create a database file and table


    conn = sqlite3.connect("telemetry.db")
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT,
            event_name TEXT,
            session_id TEXT,
            stage_id TEXT,
            payload TEXT
        )
    """)

    conn.commit()
    conn.close()


init_db()


# Data model (what the game sends)
class Event(BaseModel):
    event_name: str                 # e.g. "stage_start", "fail"
    session_id: str                 # unique per run
    stage_id: Optional[str] = None  # which level
    payload: Dict[str, Any] = {}    # extra data (x, y, damage, etc.)



# Routes
@app.get("/health")# Simple check to see if the backend is running.
def health():
    return {"status": "ok"}


@app.post("/event")# saving element from the game to database
def receive_event(event: Event):

    conn = sqlite3.connect("telemetry.db")
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO events (time, event_name, session_id, stage_id, payload) VALUES (?, ?, ?, ?, ?)",
        (
            datetime.utcnow().isoformat(),
            event.event_name,
            event.session_id,
            event.stage_id,
            json.dumps(event.payload)
        )
    )

    conn.commit()
    conn.close()

    return {"saved": True}


@app.get("/events")
def get_events():
    """
    Return all stored events (for testing/demo).
    """
    conn = sqlite3.connect("telemetry.db")
    cur = conn.cursor()

    cur.execute("SELECT * FROM events")
    rows = cur.fetchall()

    conn.close()

    return {"events": rows}
