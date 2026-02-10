import pytest
import json
import sqlite3
import tempfile
import os
import sys
from datetime import datetime
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Add the project directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main'))

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
    
    def test_event_model_with_optional_fields_missing(self):
        """Test Event model with optional fields not provided"""
        # Arrange & Act
        event = Event(
            event_name="stage_start",
            session_id="session-123"
        )
        
        # Assert
        assert event.event_name == "stage_start"
        assert event.session_id == "session-123"
        assert event.stage_id is None
        assert event.payload == {}
    
    def test_event_model_validation_missing_required_field(self):
        """Test Event model validation fails when required field missing"""
        # Arrange & Act & Assert
        with pytest.raises(Exception):
            Event(session_id="session-123")  # Missing event_name
    
    def test_event_model_with_empty_payload(self):
        """Test Event model with explicitly empty payload"""
        # Arrange & Act
        event = Event(
            event_name="quit",
            session_id="session-456",
            payload={}
        )
        
        # Assert
        assert event.payload == {}
    
    def test_event_model_with_complex_payload(self):
        """Test Event model with nested payload data"""
        # Arrange & Act
        event = Event(
            event_name="fail",
            session_id="session-789",
            stage_id="level-3",
            payload={
                "position": {"x": 100.5, "y": 200.3},
                "stats": {"health": 0, "damage_taken": 150},
                "metadata": ["tag1", "tag2"]
            }
        )
        
        # Assert
        assert event.payload["position"]["x"] == 100.5
        assert event.payload["stats"]["damage_taken"] == 150
        assert len(event.payload["metadata"]) == 2


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
    
    def test_health_endpoint_method_not_allowed(self):
        """Test that POST to /health is not allowed"""
        # Act
        response = self.client.post("/health")
        
        # Assert
        assert response.status_code == 405


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
    
    def test_event_endpoint_with_minimal_data(self):
        """Test /event endpoint with minimal required data"""
        # Arrange
        event_data = {
            "event_name": "quit",
            "session_id": "test-session-2"
        }
        
        # Act
        response = self.client.post("/event", json=event_data)
        
        # Assert
        assert response.status_code == 200
        
        # Verify in database
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT stage_id, payload FROM events WHERE session_id = ?", ("test-session-2",))
        row = cursor.fetchone()
        conn.close()
        
        assert row[0] is None  # stage_id should be None
        assert row[1] == "{}"  # payload should be empty dict
    
    def test_event_endpoint_with_complex_payload(self):
        """Test /event endpoint with complex nested payload"""
        # Arrange
        event_data = {
            "event_name": "fail",
            "session_id": "test-session-3",
            "stage_id": "level-5",
            "payload": {
                "x": 123.45,
                "y": 678.90,
                "damage_taken": 250,
                "fail_reason": "enemy_collision",
                "metadata": {"time_survived": 45.5}
            }
        }
        
        # Act
        response = self.client.post("/event", json=event_data)
        
        # Assert
        assert response.status_code == 200
        
        # Verify payload is correctly serialized
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT payload FROM events WHERE session_id = ?", ("test-session-3",))
        payload_str = cursor.fetchone()[0]
        conn.close()
        
        payload = json.loads(payload_str)
        assert payload["x"] == 123.45
        assert payload["fail_reason"] == "enemy_collision"
        assert payload["metadata"]["time_survived"] == 45.5
    
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
    
    def test_event_endpoint_invalid_json(self):
        """Test /event endpoint with invalid JSON"""
        # Act
        response = self.client.post(
            "/event",
            data="invalid json{",
            headers={"Content-Type": "application/json"}
        )
        
        # Assert
        assert response.status_code == 422
    
    def test_event_endpoint_timestamp_recorded(self):
        """Test that timestamp is recorded for events"""
        # Arrange
        event_data = {
            "event_name": "stage_complete",
            "session_id": "test-session-5",
            "stage_id": "level-2"
        }
        
        before_time = datetime.utcnow()
        
        # Act
        response = self.client.post("/event", json=event_data)
        
        after_time = datetime.utcnow()
        
        # Assert
        assert response.status_code == 200
        
        # Verify timestamp
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT time FROM events WHERE session_id = ?", ("test-session-5",))
        timestamp_str = cursor.fetchone()[0]
        conn.close()
        
        event_time = datetime.fromisoformat(timestamp_str)
        assert before_time <= event_time <= after_time
    
    def test_event_endpoint_method_not_allowed(self):
        """Test that GET to /event is not allowed"""
        # Act
        response = self.client.get("/event")
        
        # Assert
        assert response.status_code == 405


class TestEventsEndpoint:
    """Unit tests for the /events endpoint"""
    
    def setup_method(self):
        """Set up test client and temporary database with sample data"""
        self.client = TestClient(app)
        
        # Create temporary database
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        # Patch sqlite3.connect
        self.original_connect = sqlite3.connect
        sqlite3.connect = lambda x: self.original_connect(self.db_path)
        
        # Initialize and populate database
        init_db()
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.executemany(
            "INSERT INTO events (time, event_name, session_id, stage_id, payload) VALUES (?, ?, ?, ?, ?)",
            [
                ("2024-01-01T10:00:00", "stage_start", "session-1", "level-1", "{}"),
                ("2024-01-01T10:05:00", "stage_complete", "session-1", "level-1", '{"duration_ms": 5000}'),
                ("2024-01-01T10:10:00", "fail", "session-2", "level-2", '{"damage_taken": 100}')
            ]
        )
        conn.commit()
        conn.close()
    
    def teardown_method(self):
        """Clean up temporary database"""
        sqlite3.connect = self.original_connect
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_events_endpoint_returns_all_events(self):
        """Test that /events endpoint returns all stored events"""
        # Act
        response = self.client.get("/events")
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert len(data["events"]) == 3
    
    def test_events_endpoint_event_structure(self):
        """Test that returned events have correct structure"""
        # Act
        response = self.client.get("/events")
        
        # Assert
        data = response.json()
        first_event = data["events"][0]
        
        # Events should have: id, time, event_name, session_id, stage_id, payload
        assert len(first_event) == 6
        assert first_event[2] == "stage_start"
        assert first_event[3] == "session-1"
    
    def test_events_endpoint_empty_database(self):
        """Test /events endpoint with empty database"""
        # Arrange - clear database
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM events")
        conn.commit()
        conn.close()
        
        # Act
        response = self.client.get("/events")
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 0
    
    def test_events_endpoint_method_not_allowed(self):
        """Test that POST to /events is not allowed"""
        # Act
        response = self.client.post("/events")
        
        # Assert
        assert response.status_code == 405


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
    
    def test_init_db_table_schema(self):
        """Test that events table has correct schema"""
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
            cursor.execute("PRAGMA table_info(events)")
            columns = cursor.fetchall()
            conn.close()
            
            column_names = [col[1] for col in columns]
            assert "id" in column_names
            assert "time" in column_names
            assert "event_name" in column_names
            assert "session_id" in column_names
            assert "stage_id" in column_names
            assert "payload" in column_names
        finally:
            sqlite3.connect = original_connect
            os.unlink(db_path)
    
    def test_init_db_idempotent(self):
        """Test that init_db can be called multiple times safely"""
        # Arrange
        temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        temp_db.close()
        db_path = temp_db.name
        
        original_connect = sqlite3.connect
        sqlite3.connect = lambda x: original_connect(db_path)
        
        try:
            # Act
            init_db()
            init_db()  # Call again
            
            # Assert - should not raise error
            conn = original_connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='events'")
            count = cursor.fetchone()[0]
            conn.close()
            
            assert count == 1
        finally:
            sqlite3.connect = original_connect
            os.unlink(db_path)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
