import argparse
import json
import random
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Tuple


@dataclass
class PlayerProfile:
    user_id: int
    skill: float
    caution: float
    persistence: float
    sessions: int


DIFFICULTIES = ["easy", "balanced", "hard"]
DIFF_MULT = {"easy": 0.85, "balanced": 1.0, "hard": 1.2}
ENEMIES = ["grunt", "archer", "brute", "elite", "boss"]
FAIL_CAUSES = ["enemy", "trap", "fall", "boss", "attrition"]
PICKUPS = ["heal_small", "heal_large", "ammo", "coin"]
DIALOGUES = ["intro", "npc_hint", "checkpoint", "boss_intro", "ending"]


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id TEXT,
    event_type TEXT,
    event_data TEXT,
    stage_number INTEGER,
    timestamp TEXT
);

CREATE TABLE IF NOT EXISTS death_heatmap (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id TEXT,
    stage_number INTEGER,
    x_position REAL,
    y_position REAL,
    timestamp TEXT
);

CREATE TABLE IF NOT EXISTS game_balance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_name TEXT,
    setting_value REAL,
    timestamp TEXT
);
"""


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def clear_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM telemetry_events")
    conn.execute("DELETE FROM death_heatmap")
    conn.execute("DELETE FROM game_balance")
    conn.commit()


def insert_game_balance_defaults(conn: sqlite3.Connection, ts: str) -> None:
    defaults = [
        ("enemyHpMult", 1.0, ts),
        ("enemyDamageMult", 1.0, ts),
        ("playerDamageMult", 1.0, ts),
        ("parryWindowMs", 120, ts),
        ("checkpointSpacing", 1.0, ts),
    ]
    conn.executemany(
        "INSERT INTO game_balance(setting_name, setting_value, timestamp) VALUES (?, ?, ?)",
        defaults,
    )
    conn.commit()


def add_event(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    session_id: str,
    event_type: str,
    stage_number: int,
    timestamp: datetime,
    event_data: Dict,
) -> None:
    conn.execute(
        """
        INSERT INTO telemetry_events(user_id, session_id, event_type, event_data, stage_number, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, session_id, event_type, json.dumps(event_data), stage_number, iso(timestamp)),
    )

    if event_type == "death" and event_data.get("x_position") is not None and event_data.get("y_position") is not None:
        conn.execute(
            (
                user_id,
                session_id,
                stage_number,
                float(event_data["x_position"]),
                float(event_data["y_position"]),
                iso(timestamp),
            ),
        )


def player_profiles(num_users: int, min_sessions_per_user: int, extra_sessions: int, rng: random.Random) -> List[PlayerProfile]:
    profiles: List[PlayerProfile] = []
    base = [min_sessions_per_user] * num_users
    for _ in range(extra_sessions):
        base[rng.randrange(num_users)] += 1

    for uid in range(1, num_users + 1):
        profiles.append(
            PlayerProfile(
                user_id=uid,
                skill=max(0.55, min(1.45, rng.gauss(1.0, 0.18))),
                caution=max(0.5, min(1.5, rng.gauss(1.0, 0.2))),
                persistence=max(0.55, min(1.5, rng.gauss(1.0, 0.2))),
                sessions=base[uid - 1],
            )
        )
    return profiles


def stage_positions(stage: int, rng: random.Random, death_zone: bool = False) -> Tuple[float, float]:
    # Fixed-ish clusters so the heatmap looks intentional rather than uniform.
    clusters = {
        1: [(20, 30), (60, 50), (80, 25)],
        2: [(18, 70), (42, 40), (74, 58)],
        3: [(30, 25), (55, 55), (82, 78)],
        4: [(24, 62), (58, 35), (78, 22)],
        5: [(26, 28), (52, 72), (85, 45)],
        6: [(20, 20), (48, 52), (76, 80)],
    }
    hot_clusters = {
        1: (60, 50),
        2: (42, 40),
        3: (55, 55),
        4: (58, 35),
        5: (52, 72),
        6: (48, 52),
    }
    if death_zone:
        cx, cy = hot_clusters[stage]
        spread = 7
    else:
        cx, cy = rng.choice(clusters[stage])
        spread = 11
    x = max(0.0, min(100.0, rng.gauss(cx, spread)))
    y = max(0.0, min(100.0, rng.gauss(cy, spread)))
    return round(x, 2), round(y, 2)


def choose_difficulty(profile: PlayerProfile, rng: random.Random) -> str:
    # Better players tend to choose harder modes more often.
    if profile.skill > 1.15:
        weights = [0.2, 0.45, 0.35]
    elif profile.skill < 0.9:
        weights = [0.45, 0.4, 0.15]
    else:
        weights = [0.25, 0.5, 0.25]
    return rng.choices(DIFFICULTIES, weights=weights, k=1)[0]


def attempt_stage(
    conn: sqlite3.Connection,
    *,
    profile: PlayerProfile,
    session_id: str,
    difficulty: str,
    stage: int,
    start_dt: datetime,
    attempt_id: int,
    rng: random.Random,
) -> Tuple[datetime, bool, int]:
    now = start_dt
    events_added = 0
    diff_mult = DIFF_MULT[difficulty]
    stage_mult = 0.78 + (stage * 0.12)
    danger = diff_mult * stage_mult / profile.skill

    def emit(event_type: str, payload: Dict):
        nonlocal now, events_added
        base = {"difficulty": difficulty, "attempt_id": attempt_id}
        base.update(payload)
        add_event(
            conn,
            user_id=profile.user_id,
            session_id=session_id,
            event_type=event_type,
            stage_number=stage,
            timestamp=now,
            event_data=base,
        )
        events_added += 1
        now += timedelta(seconds=rng.uniform(2, 10))

    emit("stage_start", {})

    # Optional dialogue at start of selected stages.
    if stage in (1, 3, 6) and rng.random() < 0.55:
        dlg = rng.choice(DIALOGUES)
        emit("dialogue_start", {"dialogue_id": dlg})
        emit("dialogue_end", {"dialogue_id": dlg, "duration_ms": int(rng.uniform(1800, 6500))})

    # Spawn several enemies and pickups.
    enemy_waves = max(2, min(6, int(rng.gauss(2.2 + stage * 0.5 + diff_mult, 0.8))))
    pickup_spawns = max(0, min(3, int(rng.gauss(1.1 + (1.2 - diff_mult), 0.7))))

    for _ in range(enemy_waves):
        enemy = rng.choices(ENEMIES, weights=[4, 3, 2, 1.6, 0.6], k=1)[0]
        x, y = stage_positions(stage, rng)
        emit("enemy_spawn", {"extra": {"enemy_type": enemy}, "x_position": x, "y_position": y})

    for _ in range(pickup_spawns):
        item_type = rng.choices(PICKUPS, weights=[4, 2, 1, 1], k=1)[0]
        x, y = stage_positions(stage, rng)
        emit("pickup_spawn", {"item_type": item_type, "x_position": x, "y_position": y})

    # Combat loop.
    player_hits = max(1, int(rng.gauss(2.5 + stage * 1.2 + (diff_mult - 0.85) * 4, 1.6)))
    if profile.caution > 1.1:
        player_hits -= 1
    player_hits = max(0, player_hits)

    parries = max(0, int(rng.gauss(profile.caution * 1.8, 1.0)))
    enemy_kills = max(1, int(rng.gauss(enemy_waves * (0.9 + 0.12 * profile.skill), 1.2)))
    heal_pickups = max(0, int(rng.gauss((danger - 0.65) * 2.6 + profile.caution * 0.8, 1.0)))

    # Emit hits and parries in mixed order.
    combat_events: List[Tuple[str, Dict]] = []
    for _ in range(player_hits):
        enemy = rng.choices(ENEMIES, weights=[3, 3, 2, 1.5, 0.8], k=1)[0]
        combat_events.append((
            "player_hit",
            {
                "damage_taken": round(max(4.0, rng.gauss(11 + stage * 2.4 + (diff_mult - 1.0) * 9, 4.0)), 1),
                "extra": {"enemy_type": enemy},
            },
        ))
    for _ in range(parries):
        enemy = rng.choices(ENEMIES, weights=[2, 2, 2, 1.5, 1.0], k=1)[0]
        combat_events.append((
            "parry_success",
            {"extra": {"enemy_type": enemy}, "timing_window_ms": int(rng.uniform(90, 150))},
        ))
    rng.shuffle(combat_events)
    for event_type, payload in combat_events:
        emit(event_type, payload)

    for _ in range(enemy_kills):
        enemy = rng.choices(ENEMIES, weights=[4, 3, 2, 1.3, 0.5], k=1)[0]
        emit("enemy_kill", {"extra": {"enemy_type": enemy}})

    for _ in range(heal_pickups):
        amount = rng.choice([15, 20, 25, 30, 40])
        emit("heal_pickup", {"extra": {"amount": amount, "source": rng.choice(["pickup", "item", "skill"]), "heal_amount": amount}})

    # Outcome model: later stages + hard mode tend to fail more often.
    fail_prob = 0.11 + max(0, danger - 0.92) * 0.46
    fail_prob -= (profile.caution - 1.0) * 0.06
    fail_prob = min(0.78, max(0.03, fail_prob))
    success = rng.random() > fail_prob

    duration_ms = int(max(18000, rng.gauss((33000 + stage * 9000) * diff_mult / (0.8 + profile.skill * 0.22), 6500)))

    if success:
        emit(
            "stage_complete",
            {
                "duration_ms": duration_ms,
                "extra": {
                    "result": "success",
                    "enemies_killed": enemy_kills,
                    "heals_picked": heal_pickups,
                    "parries": parries,
                },
            },
        )
    else:
        reason = rng.choices(FAIL_CAUSES, weights=[5, 2, 1.5, 1.4, 1.2], k=1)[0]
        x, y = stage_positions(stage, rng, death_zone=True)
        emit(
            "death",
            {
                "cause": reason,
                "fail_reason": reason,
                "x_position": x,
                "y_position": y,
                "extra": {"cause": reason},
            },
        )
        emit(
            "fail",
            {
                "reason": reason,
                "fail_reason": reason,
                "duration_ms": duration_ms,
            },
        )

    return now, success, events_added


def seed_database(
    db_path: str,
    *,
    users: int = 40,
    min_sessions: int = 2,
    total_sessions: int = 88,
    seed: int = 42,
    clear_existing: bool = True,
) -> Dict[str, int]:
    rng = random.Random(seed)
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path))
    ensure_tables(conn)
    if clear_existing:
        clear_tables(conn)
    insert_game_balance_defaults(conn, iso(datetime.now(timezone.utc)))

    extra_sessions = max(0, total_sessions - users * min_sessions)
    profiles = player_profiles(users, min_sessions, extra_sessions, rng)

    base_dt = datetime.now(timezone.utc) - timedelta(days=16)
    total_events = 0
    total_deaths = 0
    total_attempts = 0

    for profile in profiles:
        for s in range(profile.sessions):
            session_id = f"sess_u{profile.user_id:03d}_{s+1:02d}"
            difficulty = choose_difficulty(profile, rng)
            session_dt = base_dt + timedelta(hours=3 * total_attempts + rng.uniform(0, 2.5))

            # Later sessions tend to reach later stages.
            furthest_stage = min(6, max(2, int(rng.gauss(2.5 + profile.skill * 1.5 + s * 0.45, 1.1))))
            current_stage = 1
            retry_counts: Dict[int, int] = {}

            while current_stage <= furthest_stage:
                retry_counts.setdefault(current_stage, 0)
                attempt_id = retry_counts[current_stage] + 1
                end_dt, success, events_added = attempt_stage(
                    conn,
                    profile=profile,
                    session_id=session_id,
                    difficulty=difficulty,
                    stage=current_stage,
                    start_dt=session_dt,
                    attempt_id=attempt_id,
                    rng=rng,
                )
                total_events += events_added
                total_attempts += 1
                if not success:
                    total_deaths += 1
                    retry_counts[current_stage] += 1
                    will_retry = rng.random() < min(0.92, 0.52 + (profile.persistence - 0.8) * 0.32)
                    if will_retry and retry_counts[current_stage] <= 2:
                        add_event(
                            conn,
                            user_id=profile.user_id,
                            session_id=session_id,
                            event_type="retry",
                            stage_number=current_stage,
                            timestamp=end_dt,
                            event_data={
                                "difficulty": difficulty,
                                "attempt_id": retry_counts[current_stage] + 1,
                                "retry_count": retry_counts[current_stage],
                            },
                        )
                        total_events += 1
                        session_dt = end_dt + timedelta(seconds=rng.uniform(8, 35))
                        continue
                    else:
                        break
                else:
                    current_stage += 1
                    session_dt = end_dt + timedelta(seconds=rng.uniform(12, 42))

    conn.commit()

    cur = conn.cursor()
    rows = {
        "users": cur.execute("SELECT COUNT(DISTINCT user_id) FROM telemetry_events").fetchone()[0],
        "sessions": cur.execute("SELECT COUNT(DISTINCT session_id) FROM telemetry_events").fetchone()[0],
        "events": cur.execute("SELECT COUNT(*) FROM telemetry_events").fetchone()[0],
        "deaths": cur.execute("SELECT COUNT(*) FROM death_heatmap").fetchone()[0],
    }
    conn.close()
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed realistic synthetic telemetry into the dashboard SQLite DB.")
    parser.add_argument("--db-path", default="game.db", help="Path to the SQLite database file.")
    parser.add_argument("--users", type=int, default=40, help="Number of pseudonymous users.")
    parser.add_argument("--sessions", type=int, default=88, help="Total number of sessions to seed.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    parser.add_argument("--keep-existing", action="store_true", help="Do not clear existing rows before seeding.")
    args = parser.parse_args()

    summary = seed_database(
        args.db_path,
        users=max(40, args.users),
        total_sessions=max(80, args.sessions),
        seed=args.seed,
        clear_existing=not args.keep_existing,
    )

    print("Seed complete")
    print(json.dumps(summary, indent=2))
