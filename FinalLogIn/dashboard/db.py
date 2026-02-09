import os
import sqlite3
import pandas as pd

def get_db_path() -> str:
    # Use real_game.db instead of demo_game.db
    return os.getenv("GAME_DB_PATH", "./real_game.db")

def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    db_path = get_db_path()
    
    # Check if database exists
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return pd.DataFrame()
    
    conn = sqlite3.connect(db_path)
    try:
        df = pd.read_sql_query(sql, conn, params=params)
        return df
    finally:
        conn.close()
