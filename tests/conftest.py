"""
Shared pytest fixtures for the test suite.
"""
import pytest
import tempfile
import sqlite3
import os


@pytest.fixture
def temp_database():
    """
    Provides a temporary SQLite database file.
    The database file is automatically cleaned up after the test.
    """
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    temp_db.close()
    
    yield temp_db.name
    
    # Cleanup
    try:
        os.unlink(temp_db.name)
    except:
        pass


@pytest.fixture
def initialized_database(temp_database):
    """
    Provides a temporary database with initialized schema.
    Creates the basic tables needed for testing.
    """
    conn = sqlite3.connect(temp_database)
    cursor = conn.cursor()
    
    # Create events table (API schema)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            event_name TEXT NOT NULL,
            session_id TEXT,
            stage_id TEXT,
            payload TEXT
        )
    ''')
    
    # Create telemetry_events table (Dashboard schema)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            event_type TEXT,
            stage_number INTEGER,
            event_data TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    
    return temp_database


def pytest_configure(config):
    """
    Register custom markers.
    """
    config.addinivalue_line(
        "markers", "unit: Unit tests that test individual functions/methods"
    )
    config.addinivalue_line(
        "markers", "integration: Integration tests that test multiple components together"
    )
    config.addinivalue_line(
        "markers", "slow: Tests that take a long time to run"
    )
