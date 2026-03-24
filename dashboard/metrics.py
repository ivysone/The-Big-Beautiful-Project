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
    
    if df.empty:
        # Keep a predictable schema even when there is no data.
        for col in [
            "timestamp", "stage_id", "difficulty", "attempt_id", "duration_ms",
            "damage_taken", "x", "y", "enemy_type", "hp_after", "heal_amount",
            "fail_cause", "retry_from", "run_result", "enemies_killed",
            "heals_picked", "parries", "event_name", "user_id", "session_id"
        ]:
            if col not in df.columns:
                df[col] = pd.Series(dtype="object")

        df["difficulty"] = (
        df["difficulty"]
        .replace({"medium": "balanced", "normal": "balanced"})
        .fillna("balanced")
        )

        return df

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

# Base Aggregations
def _filter_difficulty(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = df.copy()
    if difficulty:
        use = use[use["difficulty"] == difficulty]
    return use


def combat_by_stage(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = _filter_difficulty(df, difficulty)
    use = use[use["stage_id"].notna()]

    # totals
    hits = use[use["event_name"] == "player_hit"].groupby("stage_id").size()
    heals = use[use["event_name"] == "heal_pickup"].groupby("stage_id").size()
    heal_amt = use[use["event_name"] == "heal_pickup"].groupby("stage_id")["heal_amount"].sum(min_count=1)
    kills = use[use["event_name"] == "enemy_kill"].groupby("stage_id").size()
    retries = use[use["event_name"] == "retry"].groupby("stage_id").size()
    deaths = use[use["event_name"] == "fail"].groupby("stage_id").size()

    stages = sorted(use["stage_id"].dropna().astype(int).unique())
    out = pd.DataFrame({"stage_id": stages})
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
    use = _filter_difficulty(df, difficulty)
    if stage_id is not None:
        use = use[use["stage_id"] == stage_id]
    deaths = use[use["event_name"] == "fail"]
    if deaths.empty:
        return pd.DataFrame(columns=["cause", "count"])
    vc = deaths["fail_cause"].fillna("unknown").value_counts().reset_index()
    vc.columns = ["cause", "count"]
    return vc


def hits_by_enemy(df: pd.DataFrame, difficulty: Optional[str] = None, stage_id: Optional[int] = None) -> pd.DataFrame:
    use = _filter_difficulty(df, difficulty)
    if stage_id is not None:
        use = use[use["stage_id"] == stage_id]
    hits = use[use["event_name"] == "player_hit"].copy()
    if hits.empty:
        return pd.DataFrame(columns=["enemy_type", "hits"])
    vc = hits["enemy_type"].fillna("unknown").value_counts().reset_index()
    vc.columns = ["enemy_type", "hits"]
    return vc


def funnel_by_stage(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = _filter_difficulty(df, difficulty)
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


def time_by_stage(df: pd.DataFrame, difficulty: Optional[str]) -> pd.DataFrame:
    use = _filter_difficulty(df, difficulty)
    use = use[
        (use["event_name"] == "stage_complete")
        & (use["duration_ms"].notna())
        & (use["stage_id"].notna())
    ]
    if use.empty:
        return pd.DataFrame(columns=["stage_id", "median_duration_ms", "p75_duration_ms", "p90_duration_ms"])

    g = use.groupby(use["stage_id"].astype(int))["duration_ms"]
    out = pd.DataFrame({
        "stage_id": g.median().index,
        "median_duration_ms": g.median().values,
        "p75_duration_ms": g.quantile(0.75).values,
        "p90_duration_ms": g.quantile(0.90).values,
    })
    return out.sort_values("stage_id")


def spike_detection(funnel_df: pd.DataFrame, time_df: pd.DataFrame) -> pd.DataFrame:
    merged = funnel_df.merge(time_df, on="stage_id", how="left")
    if merged.empty:
        merged["is_spike"] = []
        return merged

    merged["median_duration_ms"] = merged["median_duration_ms"].fillna(0)

    fail_q1 = merged["fail_rate"].quantile(0.25)
    fail_q3 = merged["fail_rate"].quantile(0.75)
    time_q1 = merged["median_duration_ms"].quantile(0.25)
    time_q3 = merged["median_duration_ms"].quantile(0.75)

    fail_iqr = fail_q3 - fail_q1
    time_iqr = time_q3 - time_q1

    fail_cut = max(0.40, fail_q3 + 1.5 * fail_iqr) if pd.notna(fail_iqr) else 0.40
    base_time = merged["median_duration_ms"].median(skipna=True)
    time_cut = max(base_time * 1.5 if pd.notna(base_time) else 0, time_q3 + 1.5 * time_iqr if pd.notna(time_iqr) else 0)

    merged["is_spike"] = (merged["fail_rate"] >= fail_cut) | (merged["median_duration_ms"] >= time_cut)
    merged["spike_score"] = (
        merged["fail_rate"].fillna(0) * 0.6
        + (merged["median_duration_ms"].fillna(0) / max(time_cut, 1)) * 0.4
    ).round(3)
    return merged

# Sprint2 Tabs Helpers

def compute_overview_kpis(df: pd.DataFrame, difficulty: Optional[str] = None) -> dict:
    """Small KPI summary for the Overview tab only."""
    use = _filter_difficulty(df, difficulty)
    funnel = funnel_by_stage(use, None)
    tdf = time_by_stage(use, None)
    spikes = spike_detection(funnel, tdf)

    starts = int(funnel["starts"].sum()) if len(funnel) else 0
    completes = int(funnel["completes"].sum()) if len(funnel) else 0
    fails = int(funnel["fails"].sum()) if len(funnel) else 0
    quits = int(funnel["quits"].sum()) if len(funnel) else 0

    stage_complete = use[(use["event_name"] == "stage_complete") & (use["duration_ms"].notna())]
    median_minutes = float(stage_complete["duration_ms"].median() / 60000.0) if len(stage_complete) else 0.0

    return {
        "starts": starts,
        "completes": completes,
        "fails": fails,
        "quits": quits,
        "completion_rate": (completes / starts) if starts else 0.0,
        "fail_rate": (fails / starts) if starts else 0.0,
        "median_minutes": median_minutes,
        "spike_stages": int(spikes["is_spike"].sum()) if len(spikes) else 0,
        "active_stages": int(funnel["stage_id"].nunique()) if len(funnel) else 0,
        "players": int(use["user_id"].nunique()) if "user_id" in use.columns else 0,
        "sessions": int(use["session_id"].nunique()) if "session_id" in use.columns else 0,
    }


def progression_curves(df: pd.DataFrame, difficulty: Optional[str] = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    use = _filter_difficulty(df, difficulty)

    durations = use[
        (use["event_name"] == "stage_complete")
        & (use["duration_ms"].notna())
        & (use["stage_id"].notna())
    ][["stage_id", "duration_ms", "user_id", "session_id"]].copy()
    if not durations.empty:
        durations["duration_minutes"] = durations["duration_ms"] / 60000.0

    stage_metrics = combat_by_stage(use, None)
    if not stage_metrics.empty:
        stage_metrics = stage_metrics.copy()
        stage_metrics["cumulative_heal_pickups"] = stage_metrics["heal_pickups"].cumsum()
        stage_metrics["cumulative_heal_amount"] = stage_metrics["heal_amount_total"].cumsum()
        stage_metrics["cumulative_enemy_kills"] = stage_metrics["enemy_kills"].cumsum()

    return durations, stage_metrics


def fairness_segments(df: pd.DataFrame, difficulty: Optional[str] = None) -> pd.DataFrame:
    use = _filter_difficulty(df, difficulty)
    if use.empty or "user_id" not in use.columns:
        return pd.DataFrame(columns=[
            "segment_type", "segment", "players", "completion_rate",
            "fail_rate", "median_duration_minutes", "avg_heals",
            "avg_player_hits", "avg_enemy_kills"
        ])

    # Player-level summary built from all available events.
    grp = use.groupby("user_id")
    player = pd.DataFrame({"user_id": grp.size().index})
    player["starts"] = grp.apply(lambda g: (g["event_name"] == "stage_start").sum()).values
    player["completes"] = grp.apply(lambda g: (g["event_name"] == "stage_complete").sum()).values
    player["fails"] = grp.apply(lambda g: (g["event_name"] == "fail").sum()).values
    player["heals"] = grp.apply(lambda g: (g["event_name"] == "heal_pickup").sum()).values
    player["hits_taken"] = grp.apply(lambda g: (g["event_name"] == "player_hit").sum()).values
    player["enemy_kills"] = grp.apply(lambda g: (g["event_name"] == "enemy_kill").sum()).values
    player["parries"] = grp.apply(lambda g: (g["event_name"] == "parry_success").sum()).values

    complete_durations = use[(use["event_name"] == "stage_complete") & (use["duration_ms"].notna())]
    if not complete_durations.empty:
        med = complete_durations.groupby("user_id")["duration_ms"].median() / 60000.0
        player["median_duration_minutes"] = player["user_id"].map(med)
    else:
        player["median_duration_minutes"] = pd.NA

    player["completion_rate"] = (player["completes"] / player["starts"].replace(0, pd.NA)).fillna(0)
    player["fail_rate"] = (player["fails"] / player["starts"].replace(0, pd.NA)).fillna(0)
    player["aggression_score"] = player["enemy_kills"] - player["heals"] - player["parries"]
    player["caution_score"] = player["heals"] + player["parries"] - player["hits_taken"] * 0.25

    segment_frames = []

    # Segment family 1: fast vs slow
    valid_time = player[player["median_duration_minutes"].notna()].copy()
    if not valid_time.empty:
        time_cut = valid_time["median_duration_minutes"].median()
        valid_time["segment"] = valid_time["median_duration_minutes"].apply(lambda x: "Fast" if x <= time_cut else "Slow")
        valid_time["segment_type"] = "Speed"
        segment_frames.append(valid_time)

    # Segment family 2: cautious vs aggressive
    if not player.empty:
        style_cut = player["caution_score"].median()
        style = player.copy()
        style["segment"] = style["caution_score"].apply(lambda x: "Cautious" if x >= style_cut else "Aggressive")
        style["segment_type"] = "Play style"
        segment_frames.append(style)

    if not segment_frames:
        return pd.DataFrame(columns=[
            "segment_type", "segment", "players", "completion_rate",
            "fail_rate", "median_duration_minutes", "avg_heals",
            "avg_player_hits", "avg_enemy_kills"
        ])

    stacked = pd.concat(segment_frames, ignore_index=True)
    summary = stacked.groupby(["segment_type", "segment"], dropna=False).agg(
        players=("user_id", "nunique"),
        completion_rate=("completion_rate", "mean"),
        fail_rate=("fail_rate", "mean"),
        median_duration_minutes=("median_duration_minutes", "median"),
        avg_heals=("heals", "mean"),
        avg_player_hits=("hits_taken", "mean"),
        avg_enemy_kills=("enemy_kills", "mean"),
    ).reset_index()

    return summary.sort_values(["segment_type", "segment"])


def comparison_mode_metrics(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "difficulty" not in df.columns:
        return pd.DataFrame(columns=["config", "metric", "value"])

    frames = []
    label_map = {"easy": "easy", "medium": "balanced", "hard": "hard", "balanced": "balanced"}

    for raw_diff in ["easy", "medium", "hard", "balanced"]:
        use = df[df["difficulty"] == raw_diff].copy()
        if use.empty:
            continue

        funnel = funnel_by_stage(use, None)
        starts = int(funnel["starts"].sum()) if len(funnel) else 0
        completes = int(funnel["completes"].sum()) if len(funnel) else 0
        fails = int(funnel["fails"].sum()) if len(funnel) else 0
        retries = int((use["event_name"] == "retry").sum())
        durations = use[(use["event_name"] == "stage_complete") & (use["duration_ms"].notna())]["duration_ms"]

        cfg = label_map[raw_diff]
        frames.extend([
            {"config": cfg, "metric": "Completion rate", "value": (completes / starts) if starts else 0.0},
            {"config": cfg, "metric": "Fail rate", "value": (fails / starts) if starts else 0.0},
            {"config": cfg, "metric": "Median minutes", "value": float(durations.median() / 60000.0) if len(durations) else 0.0},
            {"config": cfg, "metric": "Retries per start", "value": (retries / starts) if starts else 0.0},
        ])

    out = pd.DataFrame(frames)
    if out.empty:
        return out

    # Keep only one row per config/metric in case both balanced and medium exist.
    out = out.groupby(["config", "metric"], as_index=False)["value"].mean()
    return out