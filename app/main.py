import os, csv, json, sqlite3, hashlib, threading, uuid
from datetime import datetime, timezone
from typing import Optional, Dict, List

from fastapi import FastAPI, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from itsdangerous import URLSafeSerializer, BadSignature

from pathlib import Path

from starlette.middleware.wsgi import WSGIMiddleware
import dashboard.app as dash_entry



# App + middleware
app = FastAPI(title="Pixel Adventure Data Collector")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent  # /app
STATIC_DIR = BASE_DIR / "static"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

CSV_PATH = os.path.join(DATA_DIR, "user_events.csv")
DASHBOARD_DB_PATH = os.path.join(DATA_DIR, "game.db")  # unified DB

# Serve browser files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ===== SESSIONS (COOKIE) =====
SECRET = os.getenv("APP_SECRET", "change-this-to-a-long-random-string")
serializer = URLSafeSerializer(SECRET, salt="session")
SESSION_COOKIE = "session"

def set_session(resp, username: str):
    token = serializer.dumps({"u": username})
    resp.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax")

def clear_session(resp):
    resp.delete_cookie(SESSION_COOKIE)

def get_user(request: Request) -> Optional[str]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        data = serializer.loads(token)
        return data.get("u")
    except BadSignature:
        return None

# ===== CSV HEADERS (UPDATED - 10 COLUMNS) =====
CSV_HEADERS: List[str] = [
    "timestamp",
    "event_type",
    "user_id",            # ← Changed from "username" (anonymous like user_087)
    "session_id",         # ← NEW COLUMN!
    "password_hash",
    "mode_level_choice",
    "character_choice",
    "login_time",
    "logout_time",
    "duration_seconds",
]

_csv_lock = threading.Lock()

# ===== ANONYMIZATION (NEW!) =====
ANON_SALT = os.environ.get("ANON_SALT", "dev_salt_change_me")

# Server-side session tracking
_active_sessions_lock = threading.Lock()
_active_session_by_user: Dict[str, str] = {}


def sha256_hex(s: str) -> str:
    """SHA-256 hash to hexadecimal string"""
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def user_id_from_username(username: str) -> str:
    """
    Convert username to anonymous user_id like user_087.
    Same username always gives same user_id (stable).
    """
    h = sha256_hex(f"{ANON_SALT}::{username}")
    num = int(h[:8], 16) % 1000
    return f"user_{num:03d}"


def generate_session_id(user_id: str) -> str:
    """Generate unique session ID"""
    return f"session_{user_id}_{uuid.uuid4().hex[:12]}"


def get_or_create_session_id(user_id: str, provided_session_id: str) -> str:
    """
    Guarantees session_id exists.
    - If client sends session_id → use it
    - Else reuse active session for this user
    - Else create new session
    """
    sid = (provided_session_id or "").strip()
    
    with _active_sessions_lock:
        if sid:
            _active_session_by_user[user_id] = sid
            return sid
        
        if user_id in _active_session_by_user:
            return _active_session_by_user[user_id]
        
        new_sid = generate_session_id(user_id)
        _active_session_by_user[user_id] = new_sid
        return new_sid


def clear_session_id(user_id: str):
    """Clear session on logout"""
    with _active_sessions_lock:
        _active_session_by_user.pop(user_id, None)


# ===== CSV HELPERS =====
def ensure_csv_exists():
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    if not os.path.exists(CSV_PATH):
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writeheader()


def ensure_dashboard_tables():
    conn = sqlite3.connect(DASHBOARD_DB_PATH)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS telemetry_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        event_type TEXT,
        event_data TEXT,
        stage_number INTEGER,
        timestamp TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS death_heatmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        stage_number INTEGER,
        x_position REAL,
        y_position REAL,
        timestamp TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_name TEXT,
        setting_value REAL,
        timestamp TEXT
    );
    """)

    conn.commit()
    conn.close()


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# ===== TELEMETRY → DASHBOARD DB (UPDATED) =====
def update_dashboard_db(row_data):
    try:
        conn = sqlite3.connect(DASHBOARD_DB_PATH)
        cur = conn.cursor()

        # Map user_id string to integer for DB
        user_id_str = row_data["user_id"]  # ← Changed from "username"
        try:
            user_id = int(user_id_str.split("_")[-1])  # "user_087" → 87
        except Exception:
            user_id = 0
        
        session_id = row_data.get("session_id") or f"session_{user_id_str}_unknown"

        difficulty = row_data["mode_level_choice"].lower() if row_data.get("mode_level_choice") else "medium"
        stage_number = row_data.get("stage_number")
        if not stage_number:
            stage_map = {"easy": 2, "medium": 5, "hard": 8, "": 5}
            stage_number = stage_map.get(difficulty, 5)

        event_type = row_data["event_type"]
        event_data_obj = {
            "difficulty": difficulty,
            "character": row_data.get("character_choice") or ""
        }

        extra = row_data.get("extra")
        if isinstance(extra, dict):
            event_data_obj.update(extra)

        event_data = json.dumps(event_data_obj)

        cur.execute("""
        INSERT INTO telemetry_events(user_id, session_id, event_type, event_data, stage_number, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            session_id,
            event_type,
            event_data,
            stage_number,
            row_data["timestamp"]
        ))

        if event_type == "death":
            x = row_data.get("x_position")
            y = row_data.get("y_position")
            if x is not None and y is not None:
                cur.execute("""
                INSERT INTO death_heatmap(user_id, session_id, stage_number, x_position, y_position, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    session_id,
                    stage_number,
                    float(x),
                    float(y),
                    row_data["timestamp"]
                ))

        if event_type == "logout" and row_data.get("duration_seconds"):
            duration_ms = int(row_data["duration_seconds"]) * 1000
            complete_data = json.dumps({
                "difficulty": difficulty,
                "result": "win",
                "duration_ms": ensure_int(duration_ms)
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
                row_data.get("logout_time") or row_data["timestamp"]
            ))

        conn.commit()
        conn.close()

    except Exception as e:
        print(f"Dashboard DB update failed: {e}")


def ensure_int(x):
    try:
        return int(x)
    except Exception:
        return 0


# ===== MODELS (UPDATED) =====
class UserEvent(BaseModel):
    event_type: str = Field(..., examples=["register", "login", "select_character", "select_mode", "logout", "complete_flow"])
    username: str
    session_id: Optional[str] = None  # ← NEW!
    password: Optional[str] = None
    mode_level_choice: Optional[str] = None
    character_choice: Optional[str] = None
    login_time: Optional[str] = None
    logout_time: Optional[str] = None
    duration_seconds: Optional[int] = None
    timestamp: Optional[str] = None

    stage_number: Optional[int] = None
    x_position: Optional[float] = None
    y_position: Optional[float] = None
    extra: Optional[dict] = None


# ===== STARTUP =====
@app.on_event("startup")
def startup():
    ensure_csv_exists()
    ensure_dashboard_tables()


# ===== PAGES =====
@app.get("/")
def home(request: Request):
    # Send logged-in users straight to game
    if get_user(request):
        return RedirectResponse("/game")
    return RedirectResponse("/login")


@app.get("/intro")
def intro_page():
    return FileResponse(os.path.join(STATIC_DIR, "intro.html"))


@app.get("/terms")
def terms_page():
    return FileResponse(os.path.join(STATIC_DIR, "terms.html"))


@app.get("/login")
def login_page():
    return FileResponse(os.path.join(STATIC_DIR, "login.html"))


@app.get("/main")
def main_page(request: Request):
    if not get_user(request):
        return RedirectResponse("/login")
    return FileResponse(os.path.join(STATIC_DIR, "main.html"))


@app.get("/character")
def character_page(request: Request):
    if not get_user(request):
        return RedirectResponse("/login")
    return FileResponse(os.path.join(STATIC_DIR, "character.html"))


@app.get("/game")
def game_page(request: Request):
    if not get_user(request):
        return RedirectResponse("/login")
    return FileResponse(os.path.join(STATIC_DIR, "game.html"))


# ===== AUTH ENDPOINTS =====
@app.post("/api/login")
def api_login(username: str = Form(...), password: str = Form(...)):
    resp = RedirectResponse("/game", status_code=303)
    set_session(resp, username)

    # Optional: log login
    collect_event(UserEvent(event_type="login", username=username, password=password))
    return resp


@app.post("/api/logout")
def api_logout(request: Request):
    username = get_user(request) or "unknown"
    resp = RedirectResponse("/login", status_code=303)
    clear_session(resp)

    collect_event(UserEvent(event_type="logout", username=username))
    return resp


@app.get("/api/me")
def api_me(request: Request):
    u = get_user(request)
    return {"logged_in": bool(u), "username": u}


# ===== TELEMETRY ENDPOINTS =====
@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/debug/db")
def debug_db():
    return {
        "DB_PATH": DASHBOARD_DB_PATH,
        "exists": os.path.exists(DASHBOARD_DB_PATH),
        "size": os.path.getsize(DASHBOARD_DB_PATH) if os.path.exists(DASHBOARD_DB_PATH) else 0,
    }



@app.post("/api/collect")
def collect_event(ev: UserEvent):
    """
    Main telemetry collection endpoint with privacy features.
    - Anonymizes usernames to user_087 format
    - Guarantees session_id is never empty
    - Stores 10 columns in CSV
    """
    ensure_csv_exists()

    ts = ev.timestamp or utc_now_iso()
    
    # ANONYMIZE username → user_087
    user_id = user_id_from_username(ev.username)
    
    # GUARANTEE session_id exists
    session_id = get_or_create_session_id(user_id, ev.session_id or "")

    row = {
        "timestamp": ts,
        "event_type": ev.event_type,
        "user_id": user_id,              # ← Anonymous (user_087)
        "session_id": session_id,        # ← Always has value
        "password_hash": hash_password(ev.password) if ev.password else "",
        "mode_level_choice": ev.mode_level_choice or "",
        "character_choice": ev.character_choice or "",
        "login_time": ev.login_time or "",
        "logout_time": ev.logout_time or "",
        "duration_seconds": ev.duration_seconds or "",
        "stage_number": ev.stage_number,
        "x_position": ev.x_position,
        "y_position": ev.y_position,
        "extra": ev.extra or {},
    }

    # Write to CSV with flush (reliability)
    with _csv_lock:
        with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            csv_row = {k: row.get(k, "") for k in CSV_HEADERS}
            writer.writerow(csv_row)
            f.flush()           # ← Ensure data written to disk
            os.fsync(f.fileno())  # ← Force OS to write

    # Update dashboard database
    update_dashboard_db(row)
    
    # Clear session on logout (allows new session on next login)
    if ev.event_type == "logout":
        clear_session_id(user_id)
    
    return {"saved": True, "user_id": user_id, "session_id": session_id}


# ===== DEBUG ENDPOINT (NEW!) =====
@app.get("/api/debug/csv")
def debug_csv():
    """
    Debug endpoint to check CSV status.
    Useful for troubleshooting data collection issues.
    """
    abs_path = os.path.abspath(CSV_PATH)
    exists = os.path.exists(CSV_PATH)
    size = os.path.getsize(CSV_PATH) if exists else 0
    
    last_lines: List[str] = []
    if exists:
        with open(CSV_PATH, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            last_lines = lines[-5:] if len(lines) >= 5 else lines
    
    return {
        "ABS_CSV_PATH": abs_path,
        "exists": exists,
        "size_bytes": size,
        "cwd": os.getcwd(),
        "last_5_lines": last_lines,
        "headers_should_be": CSV_HEADERS,
        "active_sessions": _active_session_by_user,
    }


# ===== DASHBOARD INTEGRATION =====
os.environ["DB_PATH"] = DASHBOARD_DB_PATH
app.mount("/admin", WSGIMiddleware(dash_entry.app.server))