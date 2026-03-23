import pytest
import pandas as pd
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from dashboard.metrics import normalize_events, funnel_by_stage, time_by_stage


class TestNormalizeEvents:
    def test_normalize_events_with_valid_data(self):
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

        result = normalize_events(df)

        assert 'stage_id' in result.columns
        assert 'difficulty' in result.columns
        assert 'duration_ms' in result.columns
        assert 'event_name' in result.columns
        assert result['stage_id'].iloc[0] == 1
        assert result['difficulty'].iloc[0] == 'easy'
        assert result['duration_ms'].iloc[0] == 1000
        assert result['event_name'].iloc[0] == 'stage_start'

    def test_normalize_events_with_invalid_json(self):
        data = {
            'stage_number': [1],
            'event_type': ['stage_start'],
            'event_data': ['invalid json {']
        }
        df = pd.DataFrame(data)

        result = normalize_events(df)

        assert result['difficulty'].iloc[0] is None
        assert pd.isna(result['duration_ms'].iloc[0])


class TestFunnelByStage:
    def test_funnel_by_stage_basic_counts(self):
        data = {
            'stage_id': [1, 1, 1, 1, 2, 2, 2],
            'event_name': ['stage_start', 'stage_complete', 'fail', 'quit',
                          'stage_start', 'stage_complete', 'fail'],
            'difficulty': ['easy'] * 7
        }
        df = pd.DataFrame(data)

        result = funnel_by_stage(df)

        assert len(result) == 2
        assert result[result['stage_id'] == 1]['starts'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['completes'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['fails'].iloc[0] == 1
        assert result[result['stage_id'] == 1]['quits'].iloc[0] == 1

    def test_funnel_by_stage_with_difficulty_filter(self):
        data = {
            'stage_id': [1, 1, 1, 1],
            'event_name': ['stage_start', 'stage_complete', 'stage_start', 'fail'],
            'difficulty': ['easy', 'easy', 'hard', 'hard']
        }
        df = pd.DataFrame(data)

        result = funnel_by_stage(df, difficulty='easy')

        assert len(result) == 1
        assert result['starts'].iloc[0] == 1
        assert result['completes'].iloc[0] == 1
        assert result['fails'].iloc[0] == 0


class TestTimeByStage:
    def test_time_by_stage_basic_calculation(self):
        data = {
            'stage_id': [1, 1, 1, 2, 2],
            'event_name': ['stage_complete'] * 5,
            'duration_ms': [1000, 2000, 3000, 1500, 2500],
            'difficulty': ['easy'] * 5
        }
        df = pd.DataFrame(data)

        result = time_by_stage(df, difficulty=None)

        assert len(result) == 2
        assert result[result['stage_id'] == 1]['median_duration_ms'].iloc[0] == 2000
        assert result[result['stage_id'] == 2]['median_duration_ms'].iloc[0] == 2000


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
