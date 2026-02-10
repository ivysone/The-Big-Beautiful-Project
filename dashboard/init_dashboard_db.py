import sqlite3
import os

DB_PATH = "./real_game.db"

def init_database():
    """Create the database structure if it doesn't exist"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Create telemetry_events table
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
    
    # Create death_heatmap table
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
    
    # Create game_balance table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_name TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Insert default game balance settings
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
        """, (k, v, "admin"))
    
    conn.commit()
    conn.close()
    
    print(f"Database initialized: {DB_PATH}")

if __name__ == "__main__":
    init_database()