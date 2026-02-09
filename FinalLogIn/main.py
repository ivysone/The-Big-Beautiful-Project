from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import csv
import os
import hashlib
import threading
import sqlite3
import json

app = FastAPI(title="Pixel Adventure Data Collector")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CSV_PATH = os.path.join("data", "user_events.csv")
DASHBOARD_DB_PATH = os.path.join("dashboard", "real_game.db")
CSV_HEADERS = [
    "timestamp",
    "event_type",
    "username",
    "password_hash",
    "mode_level_choice",
    "character_choice",
    "login_time",
    "logout_time",
    "duration_seconds",
]

_csv_lock = threading.Lock()


def ensure_csv_exists():
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    if not os.path.exists(CSV_PATH):
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writeheader()


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# Auto-update SQLite function
def update_dashboard_db(row_data):
    """Insert new CSV row into SQLite database immediately"""
    try:
        conn = sqlite3.connect(DASHBOARD_DB_PATH)
        cur = conn.cursor()
        
        # Create user_id from username
        user_id = int(hashlib.md5(row_data['username'].encode()).hexdigest()[:8], 16) % 1000
        
        # Create session_id
        session_id = f"session_{row_data['username']}_{row_data['timestamp'][:10]}"
        
        # Map difficulty to stage number
        difficulty = row_data['mode_level_choice'].lower() if row_data['mode_level_choice'] else 'medium'
        stage_map = {'easy': 2, 'medium': 5, 'hard': 8, '': 5}
        stage_number = stage_map.get(difficulty, 5)
        
        # Event type
        event_type = row_data['event_type']
        
        # Build event_data JSON
        event_data = json.dumps({
            "difficulty": difficulty,
            "character": row_data['character_choice'] or ""
        })
        
        # Insert into telemetry_events
        cur.execute("""
        INSERT INTO telemetry_events(user_id, session_id, event_type, event_data, stage_number, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            session_id,
            event_type,
            event_data,
            stage_number,
            row_data['timestamp']
        ))
        
        # If logout with duration, add stage_complete event
        if event_type == 'logout' and row_data['duration_seconds']:
            duration_ms = int(row_data['duration_seconds']) * 1000
            complete_data = json.dumps({
                "difficulty": difficulty,
                "result": "win",
                "duration_ms": duration_ms
            })
            
            cur.execute("""
            INSERT INTO telemetry_events(user_id, session_id, event_type, event_data, stage_number, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                session_id,
                "stage_complete",
                complete_data,
                stage_number,
                row_data['logout_time'] or row_data['timestamp']
            ))
        
        conn.commit()
        conn.close()
        print(f"Dashboard DB updated: {event_type} for {row_data['username']}")
    except Exception as e:
        print(f"Dashboard DB update failed: {e}")


class UserEvent(BaseModel):
    event_type: str = Field(..., examples=["register", "login", "select_character", "select_mode"])
    username: str
    password: Optional[str] = None
    mode_level_choice: Optional[str] = None
    character_choice: Optional[str] = None
    login_time: Optional[str] = None
    logout_time: Optional[str] = None
    duration_seconds: Optional[int] = None
    timestamp: Optional[str] = None


@app.on_event("startup")
def startup():
    ensure_csv_exists()


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/collect")
def collect_event(ev: UserEvent):
    ensure_csv_exists()

    row = {
        "timestamp": ev.timestamp or utc_now_iso(),
        "event_type": ev.event_type,
        "username": ev.username,
        "password_hash": hash_password(ev.password) if ev.password else "",
        "mode_level_choice": ev.mode_level_choice or "",
        "character_choice": ev.character_choice or "",
        "login_time": ev.login_time or "",
        "logout_time": ev.logout_time or "",
        "duration_seconds": ev.duration_seconds or "",
    }

    # Save to CSV
    with _csv_lock:
        with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writerow(row)

    # AUTO-UPDATE DASHBOARD DATABASE
    update_dashboard_db(row)

    return {"saved": True, "row": row}