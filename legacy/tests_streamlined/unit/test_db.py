import pytest
import pandas as pd
import sqlite3
import tempfile
import os
import sys
from unittest.mock import patch

# Add the dashboard directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'dashboard'))

from db import get_db_path, query_df


class TestGetDbPath:
    """Unit tests for get_db_path function"""
    
    def test_get_db_path_default(self):
        """Test that default path is returned when env var not set"""
        # Arrange
        with patch.dict(os.environ, {}, clear=True):
            # Act
            result = get_db_path()
            
            # Assert
            assert result == os.path.join("..", "backend", "game.db")
    
    def test_get_db_path_from_environment(self):
        """Test that path from environment variable is returned"""
        # Arrange
        custom_path = "/custom/path/to/game.db"
        with patch.dict(os.environ, {'GAME_DB_PATH': custom_path}):
            # Act
            result = get_db_path()
            
            # Assert
            assert result == custom_path


class TestQueryDf:
    """Unit tests for query_df function"""
    
    def setup_method(self):
        """Set up a temporary database for testing"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        # Create a test table with sample data
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                name TEXT,
                value INTEGER
            )
        ''')
        cursor.executemany(
            'INSERT INTO test_table (name, value) VALUES (?, ?)',
            [('Alice', 100), ('Bob', 200), ('Charlie', 300)]
        )
        conn.commit()
        conn.close()
    
    def teardown_method(self):
        """Clean up the temporary database"""
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_query_df_basic_select(self):
        """Test basic SELECT query"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM test_table")
            
            # Assert
            assert isinstance(result, pd.DataFrame)
            assert len(result) == 3
            assert list(result.columns) == ['id', 'name', 'value']
    
    def test_query_df_with_parameters(self):
        """Test query with parameterized values"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df(
                "SELECT * FROM test_table WHERE name = ?",
                params=('Alice',)
            )
            
            # Assert
            assert len(result) == 1
            assert result['name'].iloc[0] == 'Alice'
            assert result['value'].iloc[0] == 100
    
    def test_query_df_empty_result(self):
        """Test query that returns no rows"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM test_table WHERE value > 1000")
            
            # Assert
            assert isinstance(result, pd.DataFrame)
            assert len(result) == 0
            assert list(result.columns) == ['id', 'name', 'value']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
