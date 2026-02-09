import json
import pandas as pd
from typing import Optional

# Evaluation Logic

def _safe_json_loads(x):
    if x is None:
        return {}
    if isinstance(x, dict):
        return x
    try:
        return json.loads(x)
    except Exception:
        return {}

def normalize_events(events_df: pd.DataFrame) -> pd.DataFrame:
    df = events_df.copy()

    # timestamp generalization
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # stage_number -> stage_id
    if "stage_number" in df.columns:
        df["stage_id"] = pd.to_numeric(df["stage_number"], errors="coerce").astype("Int64")
    else:
        df["stage_id"] = pd.NA

    # event_data parsing
    payload = df.get("event_data", pd.Series([None] * len(df))).apply(_safe_json_loads)

    def pick(key, default=None):
        return payload.apply(lambda d: d.get(key, default))

    df["difficulty"] = pick("difficulty", None)
    df["result"] = pick("result", None)
    df["duration_ms"] = pd.to_numeric(pick("duration_ms", None), errors="coerce")
    df["attempt_id"] = pd.to_numeric(pick("attempt_id", None), errors="coerce")
    df["damage_taken"] = pd.to_numeric(pick("damage_taken", None), errors="coerce")
    df["x"] = pd.to_numeric(pick("x", None), errors="coerce")
    df["y"] = pd.to_numeric(pick("y", None), errors="coerce")
    df["fail_reason"] = pick("fail_reason", None)

    # event_type standard column
    df["event_name"] = df.get("event_type", None)

    return df


def funnel_by_stage(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]

    # eliminate row if stage_id is null
    use = use[use["stage_id"].notna()]

    def cnt(ev):
        return (use["event_name"] == ev).groupby(use["stage_id"]).sum().astype(int)

    start = cnt("stage_start")
    complete = cnt("stage_complete")
    fail = cnt("fail")
    quit_ = cnt("quit")

    out = pd.DataFrame({
        "stage_id": start.index.astype(int),
        "starts": start.values,
        "completes": complete.reindex(start.index, fill_value=0).values,
        "fails": fail.reindex(start.index, fill_value=0).values,
        "quits": quit_.reindex(start.index, fill_value=0).values
    })

    out["completion_rate"] = (out["completes"] / out["starts"]).round(4)
    out["fail_rate"] = (out["fails"] / out["starts"]).round(4)
    out["dropoff_rate"] = (out["quits"] / out["starts"]).round(4)
    return out.sort_values("stage_id")


def spike_detection(funnel_df: pd.DataFrame, time_df: pd.DataFrame) -> pd.DataFrame:
    # spike rule example
    merged = funnel_df.merge(time_df, on="stage_id", how="left")
    base = merged["median_duration_ms"].median(skipna=True)
    merged["is_spike"] = (merged["fail_rate"] > 0.40) & (merged["median_duration_ms"] > (base * 1.5))
    return merged


def time_by_stage(df: pd.DataFrame, difficulty: Optional[str]) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]
    use = use[(use["event_name"] == "stage_complete") & (use["duration_ms"].notna()) & (use["stage_id"].notna())]

    g = use.groupby(use["stage_id"].astype(int))["duration_ms"]
    out = pd.DataFrame({
        "stage_id": g.median().index,
        "median_duration_ms": g.median().values,
        "p75_duration_ms": g.quantile(0.75).values,
        "p90_duration_ms": g.quantile(0.90).values
    })
    return out.sort_values("stage_id")
