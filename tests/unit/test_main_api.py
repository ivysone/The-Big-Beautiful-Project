import pytest
import sqlite3
import tempfile
import os
import sys
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.main import app, UserEvent, ensure_dashboard_tables


class TestUserEventModel:
    def test_event_model_with_all_fields(self):
        event = UserEvent(
            event_type="stage_start",
            username="testuser",
            session_id="session-123",
            mode_level_choice="easy",
            character_choice="warrior"
        )

        assert event.event_type == "stage_start"
        assert event.username == "testuser"
        assert event.session_id == "session-123"
        assert event.mode_level_choice == "easy"
        assert event.character_choice == "warrior"

    def test_event_model_validation_missing_required_field(self):
        with pytest.raises(Exception):
            UserEvent(session_id="session-123")


class TestHealthEndpoint:
    def setup_method(self):
        self.client = TestClient(app)

    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"ok": True}


class TestCollectEndpoint:
    def setup_method(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name

        fd, self.csv_path = tempfile.mkstemp(suffix='.csv')
        os.close(fd)
        os.unlink(self.csv_path)

        self._db_patcher = patch('app.main.DASHBOARD_DB_PATH', self.db_path)
        self._csv_patcher = patch('app.main.CSV_PATH', self.csv_path)
        self._db_patcher.start()
        self._csv_patcher.start()

        ensure_dashboard_tables()
        self.client = TestClient(app)

    def teardown_method(self):
        self._db_patcher.stop()
        self._csv_patcher.stop()
        try:
            os.unlink(self.db_path)
        except:
            pass
        try:
            os.unlink(self.csv_path)
        except:
            pass

    def test_collect_endpoint_saves_event(self):
        event_data = {
            "event_type": "stage_start",
            "username": "testuser",
            "session_id": "test-session-1",
            "mode_level_choice": "easy",
            "character_choice": "warrior"
        }

        response = self.client.post("/api/collect", json=event_data)

        assert response.status_code == 200
        data = response.json()
        assert data["saved"] is True
        assert "user_id" in data
        assert "session_id" in data

    def test_collect_endpoint_missing_required_field(self):
        event_data = {
            "session_id": "test-session-4"
        }

        response = self.client.post("/api/collect", json=event_data)

        assert response.status_code == 422


class TestEnsureDashboardTables:
    def test_ensure_dashboard_tables_creates_tables(self):
        temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        temp_db.close()
        db_path = temp_db.name

        try:
            with patch('app.main.DASHBOARD_DB_PATH', db_path):
                ensure_dashboard_tables()

                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = {row[0] for row in cursor.fetchall()}
                conn.close()

                assert 'telemetry_events' in tables
                assert 'death_heatmap' in tables
                assert 'game_balance' in tables
        finally:
            os.unlink(db_path)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
