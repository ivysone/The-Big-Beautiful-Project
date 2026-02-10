import pytest
import json
import sqlite3
import tempfile
import os
import sys
from fastapi.testclient import TestClient

# Add the project directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import after adding to path
from legacy.main import app, Event, init_db


class TestEventModel:
    """Unit tests for the Event Pydantic model"""
    
    def test_event_model_with_all_fields(self):
        """Test Event model with all fields provided"""
        # Arrange & Act
        event = Event(
            event_name="stage_start",
            session_id="session-123",
            stage_id="level-1",
            payload={"difficulty": "easy", "attempt": 1}
        )
        
        # Assert
        assert event.event_name == "stage_start"
        assert event.session_id == "session-123"
        assert event.stage_id == "level-1"
        assert event.payload == {"difficulty": "easy", "attempt": 1}
    
    def test_event_model_validation_missing_required_field(self):
        """Test Event model validation fails when required field missing"""
        # Arrange & Act & Assert
        with pytest.raises(Exception):
            Event(session_id="session-123")  # Missing event_name


class TestHealthEndpoint:
    """Unit tests for the /health endpoint"""
    
    def setup_method(self):
        """Set up test client"""
        self.client = TestClient(app)
    
    def test_health_endpoint_returns_ok(self):
        """Test that /health endpoint returns status ok"""
        # Act
        response = self.client.get("/health")
        
        # Assert
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestEventEndpoint:
    """Unit tests for the /event endpoint"""
    
    def setup_method(self):
        """Set up test client and temporary database"""
        self.client = TestClient(app)
        
        # Create temporary database
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        # Patch sqlite3.connect to use temp database
        self.original_connect = sqlite3.connect
        sqlite3.connect = lambda x: self.original_connect(self.db_path)
        
        # Initialize database
        init_db()
    
    def teardown_method(self):
        """Clean up temporary database"""
        sqlite3.connect = self.original_connect
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_event_endpoint_saves_event(self):
        """Test that /event endpoint saves event to database"""
        # Arrange
        event_data = {
            "event_name": "stage_start",
            "session_id": "test-session-1",
            "stage_id": "level-1",
            "payload": {"difficulty": "easy"}
        }
        
        # Act
        response = self.client.post("/event", json=event_data)
        
        # Assert
        assert response.status_code == 200
        assert response.json() == {"saved": True}
        
        # Verify data in database
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM events")
        rows = cursor.fetchall()
        conn.close()
        
        assert len(rows) == 1
        assert rows[0][2] == "stage_start"  # event_name
        assert rows[0][3] == "test-session-1"  # session_id
        assert rows[0][4] == "level-1"  # stage_id
    
    def test_event_endpoint_missing_required_field(self):
        """Test /event endpoint with missing required field"""
        # Arrange
        event_data = {
            "session_id": "test-session-4"
            # Missing event_name
        }
        
        # Act
        response = self.client.post("/event", json=event_data)
        
        # Assert
        assert response.status_code == 422  # Unprocessable Entity


class TestInitDb:
    """Unit tests for the init_db function"""
    
    def test_init_db_creates_table(self):
        """Test that init_db creates the events table"""
        # Arrange
        temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        temp_db.close()
        db_path = temp_db.name
        
        original_connect = sqlite3.connect
        sqlite3.connect = lambda x: original_connect(db_path)
        
        try:
            # Act
            init_db()
            
            # Assert
            conn = original_connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
            result = cursor.fetchone()
            conn.close()
            
            assert result is not None
            assert result[0] == "events"
        finally:
            sqlite3.connect = original_connect
            os.unlink(db_path)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
