"""
End-to-end integration tests that test the complete workflow
from API data collection through dashboard visualization.
"""
import pytest
import json
import sqlite3
import tempfile
import os
import sys
from unittest.mock import patch
from fastapi.testclient import TestClient

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'dashboard'))

from legacy.main import app as api_app, init_db
from db import query_df
from metrics import normalize_events, funnel_by_stage


@pytest.mark.integration
class TestEndToEndWorkflow:
    """
    Test the complete workflow from event collection to dashboard analytics.
    
    This simulates a real gaming session where:
    1. Player events are sent to the API
    2. Events are stored in the database
    3. Dashboard queries and processes the data
    4. Analytics are computed
    """
    
    def setup_method(self):
        """Set up test environment"""
        self.api_client = TestClient(api_app)
        
        # Create temporary database
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        # Patch database connections
        self.original_connect = sqlite3.connect
        sqlite3.connect = lambda x: self.original_connect(self.db_path)
        
        # Initialize both database schemas
        init_db()
        self._init_dashboard_schema()
    
    def teardown_method(self):
        """Clean up test environment"""
        sqlite3.connect = self.original_connect
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def _init_dashboard_schema(self):
        """Initialize dashboard-specific tables"""
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS telemetry_events (
                id INTEGER PRIMARY KEY,
                timestamp TEXT,
                event_type TEXT,
                stage_number INTEGER,
                event_data TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def _simulate_game_session(self, session_id, difficulty='normal'):
        """
        Simulate a complete game session with multiple events.
        
        Returns list of event responses from the API.
        """
        events = []
        
        # Stage 1: Start and complete
        events.append(self.api_client.post('/event', json={
            'event_name': 'stage_start',
            'session_id': session_id,
            'stage_id': '1',
            'payload': {'difficulty': difficulty, 'attempt_id': 1}
        }))
        
        events.append(self.api_client.post('/event', json={
            'event_name': 'stage_complete',
            'session_id': session_id,
            'stage_id': '1',
            'payload': {
                'difficulty': difficulty,
                'duration_ms': 5000,
                'result': 'complete'
            }
        }))
        
        # Stage 2: Start and fail
        events.append(self.api_client.post('/event', json={
            'event_name': 'stage_start',
            'session_id': session_id,
            'stage_id': '2',
            'payload': {'difficulty': difficulty, 'attempt_id': 2}
        }))
        
        events.append(self.api_client.post('/event', json={
            'event_name': 'fail',
            'session_id': session_id,
            'stage_id': '2',
            'payload': {
                'difficulty': difficulty,
                'fail_reason': 'enemy_collision',
                'x': 150.5,
                'y': 300.2,
                'damage_taken': 100
            }
        }))
        
        return events
    
    def _migrate_events_to_dashboard_schema(self):
        """
        Convert API events to dashboard schema.
        In a real system, this would be done by a background process.
        """
        conn = self.original_connect(self.db_path)
        cursor = conn.cursor()
        
        # Get events from API table
        cursor.execute('SELECT * FROM events')
        api_events = cursor.fetchall()
        
        # Convert to dashboard schema
        for event in api_events:
            event_id, time, event_name, session_id, stage_id, payload_str = event
            
            try:
                stage_number = int(stage_id) if stage_id else None
            except:
                stage_number = None
            
            cursor.execute(
                'INSERT INTO telemetry_events (timestamp, event_type, stage_number, event_data) VALUES (?, ?, ?, ?)',
                (time, event_name, stage_number, payload_str)
            )
        
        conn.commit()
        conn.close()
    
    def test_complete_workflow_single_session(self):
        """Test complete workflow with a single game session"""
        # Step 1: Simulate game session (API collection)
        session_id = 'test-session-001'
        event_responses = self._simulate_game_session(session_id, difficulty='easy')
        
        # Verify all events were saved successfully
        assert all(r.status_code == 200 for r in event_responses)
        assert all(r.json()['saved'] for r in event_responses)
        
        # Step 2: Migrate data to dashboard schema
        self._migrate_events_to_dashboard_schema()
        
        # Step 3: Query and process data (dashboard workflow)
        with patch('db.get_db_path', return_value=self.db_path):
            # Load data
            events_df = query_df('SELECT * FROM telemetry_events')
            
            # Verify data was migrated correctly
            assert len(events_df) == 4
            assert 'stage_start' in events_df['event_type'].values
            assert 'stage_complete' in events_df['event_type'].values
            assert 'fail' in events_df['event_type'].values
            
            # Step 4: Normalize and analyze
            normalized_df = normalize_events(events_df)
            
            # Verify normalization
            assert 'stage_id' in normalized_df.columns
            assert 'difficulty' in normalized_df.columns
            assert normalized_df['difficulty'].iloc[0] == 'easy'
            
            # Step 5: Generate funnel
            funnel = funnel_by_stage(normalized_df, difficulty='easy')
            
            # Verify funnel calculations
            assert len(funnel) == 2  # Two stages
            assert funnel[funnel['stage_id'] == 1]['completes'].iloc[0] == 1
            assert funnel[funnel['stage_id'] == 2]['fails'].iloc[0] == 1
    
    def test_complete_workflow_multiple_sessions(self):
        """Test workflow with multiple game sessions"""
        # Simulate multiple sessions
        sessions = [
            ('session-001', 'easy'),
            ('session-002', 'easy'),
            ('session-003', 'hard'),
        ]
        
        for session_id, difficulty in sessions:
            self._simulate_game_session(session_id, difficulty)
        
        # Migrate data
        self._migrate_events_to_dashboard_schema()
        
        # Analyze data
        with patch('db.get_db_path', return_value=self.db_path):
            events_df = query_df('SELECT * FROM telemetry_events')
            
            # Should have 4 events per session * 3 sessions
            assert len(events_df) == 12
            
            # Analyze by difficulty
            normalized_df = normalize_events(events_df)
            
            funnel_easy = funnel_by_stage(normalized_df, difficulty='easy')
            funnel_hard = funnel_by_stage(normalized_df, difficulty='hard')
            
            # Easy should have 2 sessions worth of data
            assert funnel_easy['starts'].sum() == 4  # 2 stages * 2 sessions
            
            # Hard should have 1 session worth of data
            assert funnel_hard['starts'].sum() == 2  # 2 stages * 1 session


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
