import os
import sqlite3
import pandas as pd

"""
    SQLite Loader:
    Open SQLite file,
    execute SQL Query and
    return pandas DataFrame
"""
def get_db_path() -> str:
    return os.getenv("GAME_DB_PATH", os.path.join("..", "backend", "game.db"))

def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        df = pd.read_sql_query(sql, conn, params=params)
        return df
    finally:
        conn.close()
