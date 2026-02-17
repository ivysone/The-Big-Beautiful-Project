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

# metrics.py (or wherever normalize_events lives)

def normalize_events(events_df: pd.DataFrame) -> pd.DataFrame:
    df = events_df.copy()

    # timestamp
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    payload = df.get("event_data", pd.Series([None] * len(df))).apply(_safe_json_loads)

    def _get_extra(d):
        if not isinstance(d, dict):
            return {}
        ex = d.get("extra", {})
        # extra sometimes stored as json string
        if isinstance(ex, str):
            ex = _safe_json_loads(ex)
        return ex if isinstance(ex, dict) else {}

    extra = payload.apply(_get_extra)

    def pick(key, default=None):
        # ALWAYS returns a Series
        return payload.apply(lambda d: d.get(key, default) if isinstance(d, dict) else default)

    def pick_extra(key, default=None):
        # ALWAYS returns a Series
        return extra.apply(lambda d: d.get(key, default) if isinstance(d, dict) else default)

    # --- stage_id: prefer db column, fall back to payload.stage_number ---
    stage_from_payload = pick("stage_number", None)
    if "stage_number" in df.columns:
        df["stage_id"] = pd.to_numeric(df["stage_number"], errors="coerce").astype("Int64")
    else:
        df["stage_id"] = pd.to_numeric(stage_from_payload, errors="coerce").astype("Int64")

    # common top-level fields
    df["difficulty"] = pick("difficulty", None)
    df["attempt_id"] = pd.to_numeric(pick("attempt_id", None), errors="coerce")
    df["duration_ms"] = pd.to_numeric(pick("duration_ms", None), errors="coerce")
    df["damage_taken"] = pd.to_numeric(pick("damage_taken", None), errors="coerce")

    # x/y with safe fallback (x_position -> x)
    x1 = pick("x_position", None)
    x2 = pick("x", None)
    df["x"] = pd.to_numeric(x1, errors="coerce").combine_first(pd.to_numeric(x2, errors="coerce"))

    y1 = pick("y_position", None)
    y2 = pick("y", None)
    df["y"] = pd.to_numeric(y1, errors="coerce").combine_first(pd.to_numeric(y2, errors="coerce"))


    # extra fields
    df["enemy_type"] = (
        pick_extra("enemy", None)
        .combine_first(pick_extra("enemyType", None))
        .combine_first(pick_extra("enemy_type", None))
    )
    df["hp_after"] = pd.to_numeric(pick_extra("hp_after", None), errors="coerce")
    df["heal_amount"] = pd.to_numeric(
        pick_extra("amount", None).combine_first(pick_extra("heal_amount", None)),
        errors="coerce"
    )
    # cause can live in a few places depending on how it was saved
    df["fail_cause"] = (
        pick_extra("cause", None)
        .combine_first(pick("cause", None))
        .combine_first(pick("fail_reason", None))
        .combine_first(pick_extra("fail_reason", None))
    )

    df["retry_from"] = pick_extra("from", None)

    # stage summary extras (optional)
    df["run_result"] = pick_extra("result", None).combine_first(pick("result", None))
    df["enemies_killed"] = pd.to_numeric(pick_extra("enemies_killed", None), errors="coerce")
    df["heals_picked"] = pd.to_numeric(pick_extra("heals_picked", None), errors="coerce")
    df["parries"] = pd.to_numeric(pick_extra("parries", None), errors="coerce")

    # standard event name
    df["event_name"] = df.get("event_type", None)

    return df

def combat_by_stage(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]
    use = use[use["stage_id"].notna()]

    # totals
    hits = use[use["event_name"] == "player_hit"].groupby("stage_id").size()
    heals = use[use["event_name"] == "heal_pickup"].groupby("stage_id").size()
    heal_amt = use[use["event_name"] == "heal_pickup"].groupby("stage_id")["heal_amount"].sum(min_count=1)
    kills = use[use["event_name"] == "enemy_kill"].groupby("stage_id").size()
    retries = use[use["event_name"] == "retry"].groupby("stage_id").size()
    deaths = use[use["event_name"] == "death"].groupby("stage_id").size()

    out = pd.DataFrame({"stage_id": sorted(use["stage_id"].dropna().astype(int).unique())})
    out["player_hits"] = out["stage_id"].map(hits).fillna(0).astype(int)
    out["heal_pickups"] = out["stage_id"].map(heals).fillna(0).astype(int)
    out["heal_amount_total"] = out["stage_id"].map(heal_amt).fillna(0).astype(float)
    out["enemy_kills"] = out["stage_id"].map(kills).fillna(0).astype(int)
    out["retries"] = out["stage_id"].map(retries).fillna(0).astype(int)
    out["deaths"] = out["stage_id"].map(deaths).fillna(0).astype(int)

    # ratios that feel “useful”
    out["heals_per_death"] = (out["heal_pickups"] / out["deaths"].replace(0, pd.NA)).fillna(0).round(2)
    out["hits_per_run"] = (out["player_hits"] / out["retries"].replace(0, pd.NA)).fillna(out["player_hits"]).round(2)

    return out.sort_values("stage_id")

def fail_reasons(df: pd.DataFrame, difficulty: Optional[str] = None, stage_id: Optional[int] = None) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]
    if stage_id is not None:
        use = use[use["stage_id"] == stage_id]

    deaths = use[use["event_name"] == "death"]
    if deaths.empty:
        return pd.DataFrame(columns=["cause", "count"])

    vc = deaths["fail_cause"].fillna("unknown").value_counts().reset_index()
    vc.columns = ["cause", "count"]
    return vc

def hits_by_enemy(df: pd.DataFrame, difficulty: Optional[str] = None, stage_id: Optional[int] = None) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]
    if stage_id is not None:
        use = use[use["stage_id"] == stage_id]

    hits = use[use["event_name"] == "player_hit"].copy()
    if hits.empty:
        return pd.DataFrame(columns=["enemy_type", "hits"])

    vc = hits["enemy_type"].fillna("unknown").value_counts().reset_index()
    vc.columns = ["enemy_type", "hits"]
    return vc


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
