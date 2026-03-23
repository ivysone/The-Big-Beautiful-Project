import pytest
import sqlite3
import tempfile
import os
import sys
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.main import app as api_app, ensure_dashboard_tables
from dashboard.db import query_df
from dashboard.metrics import normalize_events, funnel_by_stage


@pytest.mark.integration
class TestEndToEndWorkflow:
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
        self.api_client = TestClient(api_app)

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

    def _simulate_game_session(self, username, difficulty='normal'):
        events = []

        events.append(self.api_client.post('/api/collect', json={
            'event_type': 'stage_start',
            'username': username,
            'mode_level_choice': difficulty,
            'stage_number': 1
        }))

        events.append(self.api_client.post('/api/collect', json={
            'event_type': 'stage_complete',
            'username': username,
            'mode_level_choice': difficulty,
            'stage_number': 1
        }))

        events.append(self.api_client.post('/api/collect', json={
            'event_type': 'stage_start',
            'username': username,
            'mode_level_choice': difficulty,
            'stage_number': 2
        }))

        events.append(self.api_client.post('/api/collect', json={
            'event_type': 'fail',
            'username': username,
            'mode_level_choice': difficulty,
            'stage_number': 2,
            'x_position': 150.5,
            'y_position': 300.2
        }))

        return events

    def test_complete_workflow_single_session(self):
        event_responses = self._simulate_game_session('player1', difficulty='easy')

        assert all(r.status_code == 200 for r in event_responses)
        assert all(r.json()['saved'] for r in event_responses)

        with patch('dashboard.db.get_db_path', return_value=self.db_path):
            events_df = query_df('SELECT * FROM telemetry_events')

            assert len(events_df) == 4
            assert 'stage_start' in events_df['event_type'].values
            assert 'stage_complete' in events_df['event_type'].values
            assert 'fail' in events_df['event_type'].values

            normalized_df = normalize_events(events_df)

            assert 'stage_id' in normalized_df.columns
            assert 'difficulty' in normalized_df.columns
            assert normalized_df['difficulty'].iloc[0] == 'easy'

            funnel = funnel_by_stage(normalized_df, difficulty='easy')

            assert len(funnel) == 2
            assert funnel[funnel['stage_id'] == 1]['completes'].iloc[0] == 1
            assert funnel[funnel['stage_id'] == 2]['fails'].iloc[0] == 1

    def test_complete_workflow_multiple_sessions(self):
        sessions = [
            ('player1', 'easy'),
            ('player2', 'easy'),
            ('player3', 'hard'),
        ]

        for username, difficulty in sessions:
            self._simulate_game_session(username, difficulty)

        with patch('dashboard.db.get_db_path', return_value=self.db_path):
            events_df = query_df('SELECT * FROM telemetry_events')

            assert len(events_df) == 12

            normalized_df = normalize_events(events_df)

            funnel_easy = funnel_by_stage(normalized_df, difficulty='easy')
            funnel_hard = funnel_by_stage(normalized_df, difficulty='hard')

            assert funnel_easy['starts'].sum() == 4
            assert funnel_hard['starts'].sum() == 2


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
