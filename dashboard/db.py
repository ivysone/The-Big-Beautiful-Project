import os
import sqlite3
import pandas as pd

def get_db_path() -> str:
    return os.environ.get("DB_PATH", "data/game.db")


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

def execute(sql: str, params: tuple = ()) -> None:
    """Run INSERT/UPDATE/CREATE statements safely."""
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
    finally:
        conn.close()
