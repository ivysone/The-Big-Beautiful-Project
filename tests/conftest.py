import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import dashboard
import dashboard.db
import dashboard.metrics
import dashboard.app
import app.main

import pytest
import tempfile
import sqlite3


@pytest.fixture
def temp_database():
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    temp_db.close()

    yield temp_db.name

    try:
        os.unlink(temp_db.name)
    except:
        pass


@pytest.fixture
def initialized_database(temp_database):
    conn = sqlite3.connect(temp_database)
    cursor = conn.cursor()

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
    config.addinivalue_line(
        "markers", "unit: Unit tests that test individual functions/methods"
    )
    config.addinivalue_line(
        "markers", "integration: Integration tests that test multiple components together"
    )
    config.addinivalue_line(
        "markers", "slow: Tests that take a long time to run"
    )
