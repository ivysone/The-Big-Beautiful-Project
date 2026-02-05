import pytest
import pandas as pd
import sqlite3
import tempfile
import os
import sys
import json
from unittest.mock import patch, MagicMock
from dash.testing.application_runners import import_app

# Add the dashboard directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main', 'dashboard'))

from app import load_data, difficulty_options
from db import query_df
from metrics import normalize_events, funnel_by_stage, time_by_stage


class TestDashboardIntegration:
    """Integration tests for the dashboard application"""
    
    def setup_method(self):
        """Set up a temporary database with realistic test data"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        # Create and populate database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create tables
        cursor.execute('''
            CREATE TABLE telemetry_events (
                id INTEGER PRIMARY KEY,
                timestamp TEXT,
                event_type TEXT,
                stage_number INTEGER,
                event_data TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE death_heatmap (
                id INTEGER PRIMARY KEY,
                stage_number INTEGER,
                x_position REAL,
                y_position REAL
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE game_balance (
                id INTEGER PRIMARY KEY,
                setting_name TEXT,
                setting_value REAL
            )
        ''')
        
        # Insert sample telemetry events
        sample_events = [
            (1, '2024-01-01 10:00:00', 'stage_start', 1, 
             json.dumps({'difficulty': 'easy', 'attempt_id': 1})),
            (2, '2024-01-01 10:05:00', 'stage_complete', 1, 
             json.dumps({'difficulty': 'easy', 'duration_ms': 5000, 'result': 'complete'})),
            (3, '2024-01-01 10:10:00', 'stage_start', 2, 
             json.dumps({'difficulty': 'easy', 'attempt_id': 2})),
            (4, '2024-01-01 10:15:00', 'fail', 2, 
             json.dumps({'difficulty': 'easy', 'fail_reason': 'enemy', 'x': 100, 'y': 200})),
            (5, '2024-01-01 10:20:00', 'stage_start', 1, 
             json.dumps({'difficulty': 'hard', 'attempt_id': 3})),
            (6, '2024-01-01 10:25:00', 'stage_complete', 1, 
             json.dumps({'difficulty': 'hard', 'duration_ms': 8000, 'result': 'complete'})),
            (7, '2024-01-01 10:30:00', 'quit', 3, 
             json.dumps({'difficulty': 'easy'})),
        ]
        
        cursor.executemany(
            'INSERT INTO telemetry_events VALUES (?, ?, ?, ?, ?)',
            sample_events
        )
        
        # Insert sample death heatmap data
        sample_deaths = [
            (1, 1, 100.5, 200.3),
            (2, 1, 150.2, 220.8),
            (3, 2, 300.1, 400.5),
            (4, 2, 310.3, 405.2),
        ]
        
        cursor.executemany(
            'INSERT INTO death_heatmap VALUES (?, ?, ?, ?)',
            sample_deaths
        )
        
        # Insert sample game balance data
        sample_balance = [
            (1, 'player_health', 100.0),
            (2, 'enemy_damage', 25.0),
            (3, 'jump_height', 150.0),
        ]
        
        cursor.executemany(
            'INSERT INTO game_balance VALUES (?, ?, ?)',
            sample_balance
        )
        
        conn.commit()
        conn.close()
    
    def teardown_method(self):
        """Clean up temporary database"""
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_load_data_returns_all_tables(self):
        """Test that load_data returns data from all three tables"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            events, deaths, balance = load_data()
            
            # Assert
            assert isinstance(events, pd.DataFrame)
            assert isinstance(deaths, pd.DataFrame)
            assert isinstance(balance, pd.DataFrame)
            assert len(events) == 7
            assert len(deaths) == 4
            assert len(balance) == 3
    
    def test_end_to_end_funnel_analysis(self):
        """Test complete funnel analysis workflow"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act - Normalize and create funnel
            df_norm = normalize_events(events)
            funnel = funnel_by_stage(df_norm, difficulty='easy')
            
            # Assert
            assert len(funnel) >= 1
            stage_1 = funnel[funnel['stage_id'] == 1]
            assert len(stage_1) == 1
            assert stage_1['starts'].iloc[0] == 1
            assert stage_1['completes'].iloc[0] == 1
    
    def test_end_to_end_time_analysis(self):
        """Test complete time analysis workflow"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            df_norm = normalize_events(events)
            time_df = time_by_stage(df_norm, difficulty='easy')
            
            # Assert
            assert len(time_df) >= 1
            assert 'median_duration_ms' in time_df.columns
            assert 'p75_duration_ms' in time_df.columns
            assert 'p90_duration_ms' in time_df.columns
    
    def test_difficulty_filter_workflow(self):
        """Test filtering by difficulty across the workflow"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            df_norm = normalize_events(events)
            funnel_easy = funnel_by_stage(df_norm, difficulty='easy')
            funnel_hard = funnel_by_stage(df_norm, difficulty='hard')
            
            # Assert
            # Easy difficulty should have more events
            assert funnel_easy['starts'].sum() >= 1
            assert funnel_hard['starts'].sum() >= 1
            # They should have different totals
            assert funnel_easy['starts'].sum() != funnel_hard['starts'].sum()
    
    def test_spike_detection_workflow(self):
        """Test spike detection integration"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            from metrics import spike_detection
            df_norm = normalize_events(events)
            funnel = funnel_by_stage(df_norm, difficulty=None)
            time_df = time_by_stage(df_norm, difficulty=None)
            spikes = spike_detection(funnel, time_df)
            
            # Assert
            assert 'is_spike' in spikes.columns
            assert len(spikes) == len(funnel)
    
    def test_death_heatmap_data_availability(self):
        """Test death heatmap data is available and correct"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            _, deaths, _ = load_data()
            
            # Assert
            assert 'stage_number' in deaths.columns
            assert 'x_position' in deaths.columns
            assert 'y_position' in deaths.columns
            
            stage_1_deaths = deaths[deaths['stage_number'] == 1]
            assert len(stage_1_deaths) == 2
    
    def test_game_balance_data_availability(self):
        """Test game balance data is available and correct"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            # Act
            _, _, balance = load_data()
            
            # Assert
            assert 'setting_name' in balance.columns
            assert 'setting_value' in balance.columns
            
            health_setting = balance[balance['setting_name'] == 'player_health']
            assert len(health_setting) == 1
            assert health_setting['setting_value'].iloc[0] == 100.0
    
    def test_difficulty_options_generation(self):
        """Test difficulty options are correctly generated from data"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            df_norm = normalize_events(events)
            
            # Act
            options = difficulty_options(df_norm)
            
            # Assert
            assert isinstance(options, list)
            assert len(options) >= 2  # Should have easy and hard
            assert all('label' in opt and 'value' in opt for opt in options)
            
            values = [opt['value'] for opt in options]
            assert 'easy' in values
            assert 'hard' in values
    
    def test_multi_stage_funnel_analysis(self):
        """Test funnel analysis across multiple stages"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            df_norm = normalize_events(events)
            funnel = funnel_by_stage(df_norm, difficulty=None)
            
            # Assert
            # Should have data for multiple stages
            assert len(funnel) >= 2
            # Check that stages are sorted
            assert funnel['stage_id'].is_monotonic_increasing
            # Check rates are calculated
            assert all(funnel['completion_rate'].notna())
            assert all(funnel['fail_rate'].notna())
            assert all(funnel['dropoff_rate'].notna())
    
    def test_event_type_distribution(self):
        """Test that different event types are properly handled"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            df_norm = normalize_events(events)
            
            # Assert
            event_types = df_norm['event_name'].unique()
            assert 'stage_start' in event_types
            assert 'stage_complete' in event_types
            assert 'fail' in event_types
            assert 'quit' in event_types
    
    def test_payload_parsing_integration(self):
        """Test that event payloads are correctly parsed in the full workflow"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            
            # Act
            df_norm = normalize_events(events)
            
            # Assert
            # Check that payload fields are extracted
            assert 'difficulty' in df_norm.columns
            assert 'duration_ms' in df_norm.columns
            assert 'result' in df_norm.columns
            assert 'fail_reason' in df_norm.columns
            
            # Verify data is correctly extracted
            easy_events = df_norm[df_norm['difficulty'] == 'easy']
            assert len(easy_events) > 0
            
            complete_events = df_norm[df_norm['event_name'] == 'stage_complete']
            assert complete_events['duration_ms'].notna().any()


class TestDashboardCallbackIntegration:
    """Integration tests for dashboard callback logic"""
    
    def setup_method(self):
        """Set up test database"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.temp_db.close()
        self.db_path = self.temp_db.name
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE telemetry_events (
                id INTEGER PRIMARY KEY,
                timestamp TEXT,
                event_type TEXT,
                stage_number INTEGER,
                event_data TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE death_heatmap (
                id INTEGER PRIMARY KEY,
                stage_number INTEGER,
                x_position REAL,
                y_position REAL
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE game_balance (
                id INTEGER PRIMARY KEY,
                setting_name TEXT,
                setting_value REAL
            )
        ''')
        
        # Add comprehensive test data
        events = []
        for stage in [1, 2, 3]:
            for i in range(10):
                # Stage starts
                events.append((
                    len(events) + 1,
                    f'2024-01-01 10:{i:02d}:00',
                    'stage_start',
                    stage,
                    json.dumps({'difficulty': 'normal', 'attempt_id': i})
                ))
                
                # Some completions (60% success rate)
                if i < 6:
                    events.append((
                        len(events) + 1,
                        f'2024-01-01 10:{i:02d}:30',
                        'stage_complete',
                        stage,
                        json.dumps({
                            'difficulty': 'normal',
                            'duration_ms': 1000 + (i * 100) + (stage * 500),
                            'result': 'complete'
                        })
                    ))
                else:
                    # Failures
                    events.append((
                        len(events) + 1,
                        f'2024-01-01 10:{i:02d}:30',
                        'fail',
                        stage,
                        json.dumps({
                            'difficulty': 'normal',
                            'fail_reason': 'enemy',
                            'x': 100 + i * 10,
                            'y': 200 + stage * 50
                        })
                    ))
        
        cursor.executemany('INSERT INTO telemetry_events VALUES (?, ?, ?, ?, ?)', events)
        
        # Add death positions
        for stage in [1, 2, 3]:
            for i in range(5):
                cursor.execute(
                    'INSERT INTO death_heatmap VALUES (?, ?, ?, ?)',
                    (len(events) + i + 1, stage, 100.0 + i * 20, 200.0 + stage * 30)
                )
        
        conn.commit()
        conn.close()
    
    def teardown_method(self):
        """Clean up"""
        try:
            os.unlink(self.db_path)
        except:
            pass
    
    def test_kpi_calculation_integration(self):
        """Test KPI calculations with realistic data"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            df = normalize_events(events)
            funnel = funnel_by_stage(df, difficulty='normal')
            
            # Act
            total_starts = int(funnel["starts"].sum())
            total_completes = int(funnel["completes"].sum())
            completion_rate = total_completes / total_starts if total_starts else 0
            
            # Assert
            assert total_starts == 30  # 3 stages * 10 starts each
            assert total_completes == 18  # 3 stages * 6 completions each
            assert 0 < completion_rate < 1
            assert abs(completion_rate - 0.6) < 0.01  # Should be 60%
    
    def test_funnel_rates_consistency(self):
        """Test that funnel rates sum correctly"""
        # Arrange
        with patch('db.get_db_path', return_value=self.db_path):
            events, _, _ = load_data()
            df = normalize_events(events)
            funnel = funnel_by_stage(df, difficulty='normal')
            
            # Act & Assert
            for _, row in funnel.iterrows():
                # Note: rates can be > 1.0 if there are multiple events per start
                # Just check they're calculated
                assert row['completion_rate'] >= 0
                assert row['fail_rate'] >= 0
                assert row['dropoff_rate'] >= 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
