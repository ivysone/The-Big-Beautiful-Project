"""
Shared pytest fixtures and configuration for the test suite.
"""
import pytest
import tempfile
import sqlite3
import os
import json
import sys
from datetime import datetime

# Add project paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main', 'dashboard'))


@pytest.fixture
def temp_database():
    """
    Create a temporary SQLite database for testing.
    
    Yields:
        str: Path to the temporary database file
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
    Create a temporary database with initialized schema.
    
    Args:
        temp_database: Path from temp_database fixture
        
    Returns:
        str: Path to the initialized database
    """
    conn = sqlite3.connect(temp_database)
    cursor = conn.cursor()
    
    # Create telemetry events table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time TEXT,
            event_name TEXT,
            session_id TEXT,
            stage_id TEXT,
            payload TEXT
        )
    ''')
    
    # Create dashboard tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry_events (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            event_type TEXT,
            stage_number INTEGER,
            event_data TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS death_heatmap (
            id INTEGER PRIMARY KEY,
            stage_number INTEGER,
            x_position REAL,
            y_position REAL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS game_balance (
            id INTEGER PRIMARY KEY,
            setting_name TEXT,
            setting_value REAL
        )
    ''')
    
    conn.commit()
    conn.close()
    
    return temp_database


@pytest.fixture
def sample_events():
    """
    Provide sample event data for testing.
    
    Returns:
        list: List of event dictionaries
    """
    return [
        {
            'event_name': 'stage_start',
            'session_id': 'session-1',
            'stage_id': 'level-1',
            'payload': {'difficulty': 'easy', 'attempt_id': 1}
        },
        {
            'event_name': 'stage_complete',
            'session_id': 'session-1',
            'stage_id': 'level-1',
            'payload': {'difficulty': 'easy', 'duration_ms': 5000, 'result': 'complete'}
        },
        {
            'event_name': 'fail',
            'session_id': 'session-1',
            'stage_id': 'level-2',
            'payload': {'difficulty': 'easy', 'fail_reason': 'enemy', 'x': 100, 'y': 200}
        },
        {
            'event_name': 'quit',
            'session_id': 'session-2',
            'stage_id': 'level-1',
            'payload': {'difficulty': 'hard'}
        }
    ]


@pytest.fixture
def populated_database(initialized_database, sample_events):
    """
    Create a database populated with sample data.
    
    Args:
        initialized_database: Path to initialized database
        sample_events: Sample event data
        
    Returns:
        str: Path to the populated database
    """
    conn = sqlite3.connect(initialized_database)
    cursor = conn.cursor()
    
    # Insert sample events into events table (for FastAPI tests)
    for i, event in enumerate(sample_events):
        cursor.execute(
            "INSERT INTO events (time, event_name, session_id, stage_id, payload) VALUES (?, ?, ?, ?, ?)",
            (
                datetime.utcnow().isoformat(),
                event['event_name'],
                event['session_id'],
                event['stage_id'],
                json.dumps(event['payload'])
            )
        )
    
    # Insert sample events into telemetry_events table (for dashboard tests)
    telemetry_events = [
        (1, '2024-01-01 10:00:00', 'stage_start', 1, 
         json.dumps({'difficulty': 'easy', 'attempt_id': 1})),
        (2, '2024-01-01 10:05:00', 'stage_complete', 1, 
         json.dumps({'difficulty': 'easy', 'duration_ms': 5000, 'result': 'complete'})),
        (3, '2024-01-01 10:10:00', 'stage_start', 2, 
         json.dumps({'difficulty': 'easy', 'attempt_id': 2})),
        (4, '2024-01-01 10:15:00', 'fail', 2, 
         json.dumps({'difficulty': 'easy', 'fail_reason': 'enemy', 'x': 100, 'y': 200})),
    ]
    
    cursor.executemany(
        'INSERT INTO telemetry_events VALUES (?, ?, ?, ?, ?)',
        telemetry_events
    )
    
    # Insert sample death heatmap data
    death_data = [
        (1, 1, 100.5, 200.3),
        (2, 1, 150.2, 220.8),
        (3, 2, 300.1, 400.5),
    ]
    
    cursor.executemany(
        'INSERT INTO death_heatmap VALUES (?, ?, ?, ?)',
        death_data
    )
    
    # Insert sample game balance data
    balance_data = [
        (1, 'player_health', 100.0),
        (2, 'enemy_damage', 25.0),
        (3, 'jump_height', 150.0),
    ]
    
    cursor.executemany(
        'INSERT INTO game_balance VALUES (?, ?, ?)',
        balance_data
    )
    
    conn.commit()
    conn.close()
    
    return initialized_database


@pytest.fixture
def mock_db_path(temp_database):
    """
    Fixture to mock the database path for db.get_db_path().
    
    Usage:
        def test_something(mock_db_path):
            # db.get_db_path() will return temp database path
            result = query_df("SELECT * FROM table")
    
    Args:
        temp_database: Temporary database path
        
    Returns:
        str: Path to the mocked database
    """
    from unittest.mock import patch
    
    with patch('db.get_db_path', return_value=temp_database):
        yield temp_database


@pytest.fixture
def sample_normalized_events_dataframe():
    """
    Provide a sample normalized events dataframe for testing.
    
    Returns:
        pd.DataFrame: Sample normalized events data
    """
    import pandas as pd
    
    data = {
        'stage_id': [1, 1, 2, 2, 3],
        'event_name': ['stage_start', 'stage_complete', 'stage_start', 'fail', 'quit'],
        'difficulty': ['easy', 'easy', 'hard', 'hard', 'easy'],
        'duration_ms': [None, 5000, None, 3000, None],
        'result': [None, 'complete', None, 'death', None],
        'fail_reason': [None, None, None, 'enemy', None],
        'x': [None, None, None, 100.5, None],
        'y': [None, None, None, 200.3, None]
    }
    
    return pd.DataFrame(data)


# Pytest configuration hooks
def pytest_configure(config):
    """
    Register custom markers.
    """
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "api: API endpoint tests")
    config.addinivalue_line("markers", "database: Database operation tests")
    config.addinivalue_line("markers", "dashboard: Dashboard component tests")


def pytest_collection_modifyitems(config, items):
    """
    Automatically mark tests based on their location and name.
    """
    for item in items:
        # Mark integration tests
        if "integration" in item.nodeid.lower():
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.unit)
        
        # Mark API tests
        if "api" in item.nodeid.lower() or "test_main" in item.nodeid:
            item.add_marker(pytest.mark.api)
        
        # Mark database tests
        if "database" in item.nodeid.lower() or "test_db" in item.nodeid:
            item.add_marker(pytest.mark.database)
        
        # Mark dashboard tests
        if "dashboard" in item.nodeid.lower():
            item.add_marker(pytest.mark.dashboard)
