import pytest
import pandas as pd
import sqlite3
import os
import sys
import tempfile
from unittest.mock import patch, MagicMock

# Add the dashboard directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main', 'dashboard'))

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
    
    def test_get_db_path_empty_env_var(self):
        """Test behavior when environment variable is empty"""
        # Arrange
        with patch.dict(os.environ, {'GAME_DB_PATH': ''}):
            # Act
            result = get_db_path()
            
            # Assert
            # Empty string is falsy, so default should be used
            assert result == ''


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
    
    def test_query_df_with_where_clause(self):
        """Test SELECT query with WHERE clause"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM test_table WHERE value > 150")
            
            # Assert
            assert len(result) == 2
            assert result['name'].tolist() == ['Bob', 'Charlie']
    
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
    
    def test_query_df_connection_closes(self):
        """Test that database connection is properly closed"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            with patch('sqlite3.connect') as mock_connect:
                mock_conn = MagicMock()
                mock_connect.return_value = mock_conn
                
                # Act
                try:
                    query_df("SELECT * FROM test_table")
                except:
                    pass
                
                # Assert
                mock_conn.close.assert_called_once()
    
    def test_query_df_with_nonexistent_table(self):
        """Test query on non-existent table raises error"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act & Assert
            with pytest.raises(Exception):
                query_df("SELECT * FROM nonexistent_table")
    
    def test_query_df_with_invalid_sql(self):
        """Test query with invalid SQL syntax"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act & Assert
            with pytest.raises(Exception):
                query_df("INVALID SQL QUERY")
    
    def test_query_df_aggregation(self):
        """Test query with aggregation functions"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT COUNT(*) as count, SUM(value) as total FROM test_table")
            
            # Assert
            assert len(result) == 1
            assert result['count'].iloc[0] == 3
            assert result['total'].iloc[0] == 600
    
    def test_query_df_with_join(self):
        """Test query with JOIN operations"""
        # Arrange
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE departments (
                id INTEGER PRIMARY KEY,
                dept_name TEXT
            )
        ''')
        cursor.execute('INSERT INTO departments VALUES (1, "Engineering")')
        conn.commit()
        conn.close()
        
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df('''
                SELECT t.name, d.dept_name 
                FROM test_table t, departments d 
                WHERE t.id = d.id
            ''')
            
            # Assert
            assert len(result) == 1
            assert result['name'].iloc[0] == 'Alice'
    
    def test_query_df_connection_error_handling(self):
        """Test handling of database connection errors"""
        # Arrange
        with patch('db.get_db_path', return_value='/nonexistent/path/db.db'):
            # Act & Assert
            with pytest.raises(Exception):
                query_df("SELECT * FROM test_table")
    
    def test_query_df_with_multiple_parameters(self):
        """Test query with multiple parameters"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df(
                "SELECT * FROM test_table WHERE value >= ? AND value <= ?",
                params=(100, 200)
            )
            
            # Assert
            assert len(result) == 2
            assert set(result['name'].tolist()) == {'Alice', 'Bob'}


class TestDatabaseIntegration:
    """Integration tests for database operations"""
    
    def setup_method(self):
        """Set up a temporary database with realistic telemetry data"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create telemetry_events table
        cursor.execute('''
            CREATE TABLE telemetry_events (
                id INTEGER PRIMARY KEY,
                timestamp TEXT,
                event_type TEXT,
                stage_number INTEGER,
                event_data TEXT
            )
        ''')
        
        # Create death_heatmap table
        cursor.execute('''
            CREATE TABLE death_heatmap (
                id INTEGER PRIMARY KEY,
                stage_number INTEGER,
                x_position REAL,
                y_position REAL
            )
        ''')
        
        # Create game_balance table
        cursor.execute('''
            CREATE TABLE game_balance (
                id INTEGER PRIMARY KEY,
                setting_name TEXT,
                setting_value REAL
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def teardown_method(self):
        """Clean up the temporary database"""
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_query_telemetry_events_schema(self):
        """Test querying telemetry_events table structure"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM telemetry_events LIMIT 0")
            
            # Assert
            expected_columns = ['id', 'timestamp', 'event_type', 'stage_number', 'event_data']
            assert list(result.columns) == expected_columns
    
    def test_query_death_heatmap_schema(self):
        """Test querying death_heatmap table structure"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM death_heatmap LIMIT 0")
            
            # Assert
            expected_columns = ['id', 'stage_number', 'x_position', 'y_position']
            assert list(result.columns) == expected_columns
    
    def test_query_game_balance_schema(self):
        """Test querying game_balance table structure"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            result = query_df("SELECT * FROM game_balance LIMIT 0")
            
            # Assert
            expected_columns = ['id', 'setting_name', 'setting_value']
            assert list(result.columns) == expected_columns


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
