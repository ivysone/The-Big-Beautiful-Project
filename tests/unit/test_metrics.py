import pytest
import pandas as pd
import json
from datetime import datetime
import sys
import os

# Add the dashboard directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'The-Big-Beautiful-Project-main', 'dashboard'))

from metrics import normalize_events, funnel_by_stage, time_by_stage, spike_detection


class TestNormalizeEvents:
    """Unit tests for the normalize_events function"""
    
    def test_normalize_events_with_valid_data(self):
        """Test normalizing events with valid complete data"""
        # Arrange
        data = {
            'timestamp': ['2024-01-01 10:00:00', '2024-01-01 11:00:00'],
            'stage_number': [1, 2],
            'event_type': ['stage_start', 'stage_complete'],
            'event_data': [
                json.dumps({'difficulty': 'easy', 'duration_ms': 1000, 'attempt_id': 1}),
                json.dumps({'difficulty': 'hard', 'duration_ms': 2000, 'attempt_id': 2})
            ]
        }
        df = pd.DataFrame(data)
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert 'stage_id' in result.columns
        assert 'difficulty' in result.columns
        assert 'duration_ms' in result.columns
        assert 'event_name' in result.columns
        assert result['stage_id'].iloc[0] == 1
        assert result['difficulty'].iloc[0] == 'easy'
        assert result['duration_ms'].iloc[0] == 1000
        assert result['event_name'].iloc[0] == 'stage_start'
    
    def test_normalize_events_with_missing_timestamp(self):
        """Test normalizing events when timestamp column is missing"""
        # Arrange
        data = {
            'stage_number': [1, 2],
            'event_type': ['stage_start', 'stage_complete'],
            'event_data': ['{}', '{}']
        }
        df = pd.DataFrame(data)
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert 'timestamp' not in result.columns or result['timestamp'].isna().all()
        assert len(result) == 2
    
    def test_normalize_events_with_invalid_json(self):
        """Test normalizing events with invalid JSON in event_data"""
        # Arrange
        data = {
            'stage_number': [1],
            'event_type': ['stage_start'],
            'event_data': ['invalid json {']
        }
        df = pd.DataFrame(data)
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert result['difficulty'].iloc[0] is None
        assert pd.isna(result['duration_ms'].iloc[0])
    
    def test_normalize_events_with_null_event_data(self):
        """Test normalizing events with null event_data"""
        # Arrange
        data = {
            'stage_number': [1, 2],
            'event_type': ['stage_start', 'stage_complete'],
            'event_data': [None, None]
        }
        df = pd.DataFrame(data)
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert result['difficulty'].isna().all()
        assert result['duration_ms'].isna().all()
    
    def test_normalize_events_with_nested_payload_fields(self):
        """Test normalizing events with all payload fields"""
        # Arrange
        data = {
            'stage_number': [1],
            'event_type': ['fail'],
            'event_data': [json.dumps({
                'difficulty': 'hard',
                'result': 'death',
                'duration_ms': 5000,
                'attempt_id': 3,
                'damage_taken': 150,
                'x': 100.5,
                'y': 200.3,
                'fail_reason': 'enemy_collision'
            })]
        }
        df = pd.DataFrame(data)
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert result['difficulty'].iloc[0] == 'hard'
        assert result['result'].iloc[0] == 'death'
        assert result['duration_ms'].iloc[0] == 5000
        assert result['attempt_id'].iloc[0] == 3
        assert result['damage_taken'].iloc[0] == 150
        assert result['x'].iloc[0] == 100.5
        assert result['y'].iloc[0] == 200.3
        assert result['fail_reason'].iloc[0] == 'enemy_collision'
    
    def test_normalize_events_preserves_original_dataframe(self):
        """Test that normalize_events doesn't modify the original dataframe"""
        # Arrange
        data = {
            'stage_number': [1],
            'event_type': ['stage_start'],
            'event_data': [json.dumps({'difficulty': 'easy'})]
        }
        df = pd.DataFrame(data)
        original_columns = df.columns.tolist()
        
        # Act
        result = normalize_events(df)
        
        # Assert
        assert df.columns.tolist() == original_columns
        assert 'stage_id' not in df.columns


class TestFunnelByStage:
    """Unit tests for the funnel_by_stage function"""
    
    def test_funnel_by_stage_basic_counts(self):
        """Test basic funnel calculation with various event types"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1, 1, 2, 2, 2],
            'event_name': ['stage_start', 'stage_complete', 'fail', 'quit', 
                          'stage_start', 'stage_complete', 'fail'],
            'difficulty': ['easy'] * 7
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert len(result) == 2
        assert result[result['stage_id'] == 1]['starts'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['completes'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['fails'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['quits'].iloc[0] == 1
    
    def test_funnel_by_stage_with_difficulty_filter(self):
        """Test funnel calculation filtered by difficulty"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1, 1],
            'event_name': ['stage_start', 'stage_complete', 'stage_start', 'fail'],
            'difficulty': ['easy', 'easy', 'hard', 'hard']
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df, difficulty='easy')
        
        # Assert
        assert len(result) == 1
        assert result['starts'].iloc[0] == 1
        assert result['completes'].iloc[0] == 1
        assert result['fails'].iloc[0] == 0
    
    def test_funnel_by_stage_completion_rate_calculation(self):
        """Test that completion rate is correctly calculated"""
        # Arrange
        data = {
            'stage_id': [1] * 10,
            'event_name': ['stage_start'] + ['stage_complete'] * 5 + ['fail'] * 4,
            'difficulty': ['easy'] * 10
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert result['completion_rate'].iloc[0] == 5.0  # 5 completes / 1 start
        assert result['fail_rate'].iloc[0] == 4.0  # 4 fails / 1 start
    
    def test_funnel_by_stage_with_null_stage_ids(self):
        """Test that rows with null stage_id are filtered out"""
        # Arrange
        data = {
            'stage_id': [1, None, 2, None],
            'event_name': ['stage_start', 'stage_complete', 'stage_start', 'fail'],
            'difficulty': ['easy'] * 4
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert len(result) == 2
        assert 1 in result['stage_id'].values
        assert 2 in result['stage_id'].values
    
    def test_funnel_by_stage_empty_dataframe(self):
        """Test funnel with empty dataframe"""
        # Arrange
        df = pd.DataFrame(columns=['stage_id', 'event_name', 'difficulty'])
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert len(result) == 0
        assert 'starts' in result.columns
        assert 'completes' in result.columns
    
    def test_funnel_by_stage_sorted_output(self):
        """Test that output is sorted by stage_id"""
        # Arrange
        data = {
            'stage_id': [3, 1, 2],
            'event_name': ['stage_start', 'stage_start', 'stage_start'],
            'difficulty': ['easy'] * 3
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert result['stage_id'].tolist() == [1, 2, 3]
    
    def test_funnel_by_stage_dropoff_rate(self):
        """Test dropoff rate calculation"""
        # Arrange
        data = {
            'stage_id': [1] * 4,
            'event_name': ['stage_start', 'quit', 'quit', 'stage_complete'],
            'difficulty': ['easy'] * 4
        }
        df = pd.DataFrame(data)
        
        # Act
        result = funnel_by_stage(df)
        
        # Assert
        assert result['dropoff_rate'].iloc[0] == 2.0  # 2 quits / 1 start


class TestTimeByStage:
    """Unit tests for the time_by_stage function"""
    
    def test_time_by_stage_basic_calculation(self):
        """Test basic time calculation with multiple completions"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1, 2, 2],
            'event_name': ['stage_complete'] * 5,
            'duration_ms': [1000, 2000, 3000, 1500, 2500],
            'difficulty': ['easy'] * 5
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty=None)
        
        # Assert
        assert len(result) == 2
        assert result[result['stage_id'] == 1]['median_duration_ms'].iloc[0] == 2000
        assert result[result['stage_id'] == 2]['median_duration_ms'].iloc[0] == 2000
    
    def test_time_by_stage_percentile_calculations(self):
        """Test that p75 and p90 percentiles are calculated"""
        # Arrange
        data = {
            'stage_id': [1] * 10,
            'event_name': ['stage_complete'] * 10,
            'duration_ms': [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
            'difficulty': ['easy'] * 10
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty=None)
        
        # Assert
        assert 'p75_duration_ms' in result.columns
        assert 'p90_duration_ms' in result.columns
        assert result['median_duration_ms'].iloc[0] == 550
        assert result['p75_duration_ms'].iloc[0] == 775
        assert result['p90_duration_ms'].iloc[0] == 950
    
    def test_time_by_stage_with_difficulty_filter(self):
        """Test time calculation filtered by difficulty"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1],
            'event_name': ['stage_complete', 'stage_complete', 'stage_complete'],
            'duration_ms': [1000, 2000, 3000],
            'difficulty': ['easy', 'easy', 'hard']
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty='easy')
        
        # Assert
        assert len(result) == 1
        assert result['median_duration_ms'].iloc[0] == 1500  # median of 1000 and 2000
    
    def test_time_by_stage_filters_non_complete_events(self):
        """Test that only stage_complete events are included"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1],
            'event_name': ['stage_complete', 'stage_start', 'fail'],
            'duration_ms': [1000, 2000, 3000],
            'difficulty': ['easy'] * 3
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty=None)
        
        # Assert
        assert len(result) == 1
        assert result['median_duration_ms'].iloc[0] == 1000
    
    def test_time_by_stage_filters_null_durations(self):
        """Test that null durations are filtered out"""
        # Arrange
        data = {
            'stage_id': [1, 1, 1],
            'event_name': ['stage_complete', 'stage_complete', 'stage_complete'],
            'duration_ms': [1000, None, 2000],
            'difficulty': ['easy'] * 3
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty=None)
        
        # Assert
        assert result['median_duration_ms'].iloc[0] == 1500
    
    def test_time_by_stage_empty_after_filtering(self):
        """Test with dataframe that becomes empty after filtering"""
        # Arrange
        data = {
            'stage_id': [1],
            'event_name': ['stage_start'],
            'duration_ms': [1000],
            'difficulty': ['easy']
        }
        df = pd.DataFrame(data)
        
        # Act
        result = time_by_stage(df, difficulty=None)
        
        # Assert
        assert len(result) == 0


class TestSpikeDetection:
    """Unit tests for the spike_detection function"""
    
    def test_spike_detection_identifies_spike(self):
        """Test that spikes are correctly identified"""
        # Arrange
        funnel_data = {
            'stage_id': [1, 2],
            'fail_rate': [0.5, 0.2],
            'starts': [10, 10],
            'completes': [5, 8],
            'fails': [5, 2]
        }
        time_data = {
            'stage_id': [1, 2],
            'median_duration_ms': [3000, 1000]
        }
        funnel_df = pd.DataFrame(funnel_data)
        time_df = pd.DataFrame(time_data)
        
        # Act
        result = spike_detection(funnel_df, time_df)
        
        # Assert
        assert 'is_spike' in result.columns
        assert result[result['stage_id'] == 1]['is_spike'].iloc[0] == True
        assert result[result['stage_id'] == 2]['is_spike'].iloc[0] == False
    
    def test_spike_detection_merge_correctness(self):
        """Test that funnel and time data are correctly merged"""
        # Arrange
        funnel_data = {
            'stage_id': [1, 2, 3],
            'fail_rate': [0.3, 0.4, 0.5],
            'starts': [10, 10, 10]
        }
        time_data = {
            'stage_id': [1, 2],
            'median_duration_ms': [1000, 2000]
        }
        funnel_df = pd.DataFrame(funnel_data)
        time_df = pd.DataFrame(time_data)
        
        # Act
        result = spike_detection(funnel_df, time_df)
        
        # Assert
        assert len(result) == 3
        assert result[result['stage_id'] == 3]['median_duration_ms'].isna().iloc[0]
    
    def test_spike_detection_threshold_logic(self):
        """Test the spike detection threshold logic"""
        # Arrange
        funnel_data = {
            'stage_id': [1, 2, 3, 4],
            'fail_rate': [0.35, 0.45, 0.50, 0.39]
        }
        time_data = {
            'stage_id': [1, 2, 3, 4],
            'median_duration_ms': [1000, 1000, 2000, 2000]
        }
        funnel_df = pd.DataFrame(funnel_data)
        time_df = pd.DataFrame(time_data)
        
        # Act
        result = spike_detection(funnel_df, time_df)
        
        # Assert
        # Median is 1500, so 1.5x = 2250
        # Stage 1: fail_rate 0.35 < 0.40, duration 1000 < 2250 -> False
        # Stage 2: fail_rate 0.45 > 0.40, duration 1000 < 2250 -> False
        # Stage 3: fail_rate 0.50 > 0.40, duration 2000 < 2250 -> False
        # Stage 4: fail_rate 0.39 < 0.40, duration 2000 < 2250 -> False
        assert result['is_spike'].sum() == 0
    
    def test_spike_detection_with_empty_dataframes(self):
        """Test spike detection with empty dataframes"""
        # Arrange
        funnel_df = pd.DataFrame(columns=['stage_id', 'fail_rate'])
        time_df = pd.DataFrame(columns=['stage_id', 'median_duration_ms'])
        
        # Act
        result = spike_detection(funnel_df, time_df)
        
        # Assert
        assert len(result) == 0
        assert 'is_spike' in result.columns


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
