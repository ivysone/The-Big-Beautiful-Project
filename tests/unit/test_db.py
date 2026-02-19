import os
import sys
import sqlite3
import tempfile
from unittest.mock import patch

import pandas as pd
import pytest

# test_db

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "dashboard"))

from db import get_db_path, query_df


class TestGetDbPath:
    def test_get_db_path_default(self):
        with patch.dict(os.environ, {}, clear=True):
            result = get_db_path()
            assert result == "/dashboard/game.db"

    def test_get_db_path_from_environment(self):
        custom_path = "/custom/path/to/game.db"
        with patch.dict(os.environ, {"DB_PATH": custom_path}, clear=True):
            result = get_db_path()
            assert result == custom_path


class TestQueryDf:
    def setup_method(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.db_path = self.temp_db.name

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                name TEXT,
                value INTEGER
            )
            """
        )
        cursor.executemany(
            "INSERT INTO test_table (name, value) VALUES (?, ?)",
            [("Alice", 100), ("Bob", 200), ("Charlie", 300)],
        )
        conn.commit()
        conn.close()

    def teardown_method(self):
        try:
            os.unlink(self.db_path)
        except Exception:
            pass

    def test_query_df_basic_select(self):
        with patch("db.get_db_path", return_value=self.db_path):
            result = query_df("SELECT * FROM test_table")
            assert isinstance(result, pd.DataFrame)
            assert len(result) == 3
            assert list(result.columns) == ["id", "name", "value"]

    def test_query_df_with_parameters(self):
        with patch("db.get_db_path", return_value=self.db_path):
            result = query_df(
                "SELECT * FROM test_table WHERE name = ?",
                params=("Alice",),
            )
            assert len(result) == 1
            assert result["name"].iloc[0] == "Alice"
            assert result["value"].iloc[0] == 100

    def test_query_df_empty_result(self):
        with patch("db.get_db_path", return_value=self.db_path):
            result = query_df("SELECT * FROM test_table WHERE value > 1000")
            assert isinstance(result, pd.DataFrame)
            assert len(result) == 0
            assert list(result.columns) == ["id", "name", "value"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
