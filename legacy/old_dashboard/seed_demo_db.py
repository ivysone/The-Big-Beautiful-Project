import sqlite3
import json
from datetime import datetime, timedelta
import random
import os

DB_PATH = os.getenv("GAME_DB_PATH", "./demo_game.db")

def ensure_tables(conn: sqlite3.Connection):
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS telemetry_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        stage_number INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS death_heatmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        stage_number INTEGER,
        x_position REAL,
        y_position REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_name TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

def seed(conn: sqlite3.Connection):
    cur = conn.cursor()

    balance_defaults = {
        "enemy_hp": "100",
        "enemy_damage": "10",
        "enemy_count_multiplier": "1.0",
        "boss_minions": "3",
        "checkpoint_every_n_tiles": "120",
        "resource_drop_rate": "0.35",
        "stamina_regen": "1.0",
        "item_cost_multiplier": "1.0",
    }
    for k, v in balance_defaults.items():
        cur.execute("""
        INSERT OR REPLACE INTO game_balance(setting_name, setting_value, updated_by)
        VALUES (?, ?, ?)
        """, (k, v, "demo_admin"))

    # telemetry seed
    difficulties = ["easy", "normal", "hard"]
    now = datetime.utcnow()

    sessions = []
    for s in range(40):  # 40 sessions
        sessions.append(f"demo_s_{s:03d}")

    event_rows = []
    for session_id in sessions:
        difficulty = random.choice(difficulties)
        user_id = random.randint(1, 20)  # 20 users

        # run_start
        event_rows.append(("run_start", {"difficulty": difficulty}, 1, now))

        # 10 stages
        t = now
        for stage in range(1, 11):
            # stage_start
            event_rows.append(("stage_start", {"difficulty": difficulty}, stage, t))

            # stage outcome
            base_fail = 0.10 if difficulty == "easy" else (0.20 if difficulty == "normal" else 0.30)
            if stage in (6, 7):
                base_fail += 0.20

            duration = int(random.gauss(45000 + stage * 3000, 8000))
            duration = max(duration, 8000)

            if random.random() < base_fail:
                # fail
                payload = {
                    "difficulty": difficulty,
                    "result": "fail",
                    "attempt_id": random.randint(1, 5),
                    "damage_taken": random.randint(30, 250),
                    "x": random.uniform(0, 100),
                    "y": random.uniform(0, 60),
                    "fail_reason": random.choice(["hp0", "fall", "boss"])
                }
                event_rows.append(("fail", payload, stage, t + timedelta(milliseconds=duration)))
                # retry
                event_rows.append(("retry", {"difficulty": difficulty}, stage, t + timedelta(milliseconds=duration+500)))
                event_rows.append(("stage_complete", {"difficulty": difficulty, "result": "win", "duration_ms": duration + 10000}, stage, t + timedelta(milliseconds=duration+15000)))
            else:
                # complete
                payload = {"difficulty": difficulty, "result": "win", "duration_ms": duration}
                event_rows.append(("stage_complete", payload, stage, t + timedelta(milliseconds=duration)))

            t = t + timedelta(milliseconds=duration + 3000)

        # run_end
        event_rows.append(("run_end", {"difficulty": difficulty}, 10, t))

    cur.executemany("""
    INSERT INTO telemetry_events(user_id, session_id, event_type, event_data, stage_number, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    """, [
        (random.randint(1, 20), sid, et, json.dumps(ed), st, ts.isoformat())
        for (et, ed, st, ts), sid in [(row, random.choice(sessions)) for row in event_rows]
    ])

    for _ in range(250):
        cur.execute("""
        INSERT INTO death_heatmap(user_id, stage_number, x_position, y_position, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """, (
            random.randint(1, 20),
            random.randint(1, 10),
            random.uniform(0, 100),
            random.uniform(0, 60),
            (now + timedelta(seconds=random.randint(0, 20000))).isoformat()
        ))

    conn.commit()

def main():
    conn = sqlite3.connect(DB_PATH)
    ensure_tables(conn)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM telemetry_events")
    if cur.fetchone()[0] == 0:
        seed(conn)
        print(f"✅ Demo DB seeded: {DB_PATH}")
    else:
        print(f"ℹ️ Demo DB already has data: {DB_PATH}")
    conn.close()

if __name__ == "__main__":
    main()
