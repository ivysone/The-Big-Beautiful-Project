# dashboard/balancing_toolkit.py
import json
import math
import uuid
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional

import pandas as pd

from .db import execute

# ---------- DB INIT ----------
def init_balancing_tables() -> None:
    execute("""
    CREATE TABLE IF NOT EXISTS balance_decisions (
        id TEXT PRIMARY KEY,
        ts_iso TEXT NOT NULL,
        designer TEXT,
        stage_id INTEGER,
        difficulty TEXT,
        changes_json TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        rationale_text TEXT NOT NULL
    )
    """)

# ---------- PARAMETERS ----------
DEFAULT_PARAMS: Dict[str, Any] = {
    "enemyHpMult": 1.0,
    "enemyDamageMult": 1.0,
    "playerDamageMult": 1.0,

    # still here for compatibility with existing UI/decision log, but not required for prototype
    "playerIncomingDamageMult": 1.0,
    "staminaRegenMult": 1.0,
    "parryWindowMs": 120,
    "parryStunMs": 1200,
    "checkpointSpacing": 1.0,
    "rewardCoinsMult": 1.0,
}

# ---------- RULE ENGINE ----------
@dataclass
class Suggestion:
    rule_id: str
    severity: str  # "low" | "med" | "high"
    message: str
    suggested_changes: Dict[str, Any]
    evidence: Dict[str, Any]

def _get_stage_metrics(funnel: pd.DataFrame, tdf: pd.DataFrame) -> pd.DataFrame:
    # Ensure funnel has stage_id
    if funnel is None or funnel.empty:
        funnel = pd.DataFrame(columns=["stage_id", "completion_rate", "fail_rate", "dropoff_rate"])
    if "stage_id" not in funnel.columns:
        funnel = funnel.copy()
        funnel["stage_id"] = []

    # Ensure tdf has stage_id + median_duration_ms
    if tdf is None or tdf.empty:
        tdf = pd.DataFrame(columns=["stage_id", "median_duration_ms"])
    else:
        tdf = tdf.copy()
        if "stage_id" not in tdf.columns:
            tdf["stage_id"] = []
        if "median_duration_ms" not in tdf.columns:
            tdf["median_duration_ms"] = 0

    # Merge safely
    m = funnel.merge(tdf[["stage_id", "median_duration_ms"]], on="stage_id", how="left")

    # Ensure required metric columns exist
    for col in ["completion_rate", "fail_rate", "dropoff_rate", "median_duration_ms"]:
        if col not in m.columns:
            m[col] = 0
        m[col] = m[col].fillna(0)

    return m


def generate_suggestions(funnel: pd.DataFrame, tdf: pd.DataFrame) -> List[Suggestion]:
    """(unchanged) 6 deterministic rules. Uses stage-level metrics."""
    m = _get_stage_metrics(funnel, tdf)
    out: List[Suggestion] = []

    FAIL_HI = 0.40
    COMPLETE_HI = 0.85
    TIME_HI_MS = 120000  # 2 mins
    TIME_LO_MS = 45000   # 45s

    r1 = m[(m["fail_rate"] > FAIL_HI) & (m["median_duration_ms"] > TIME_HI_MS)]
    if len(r1):
        worst = r1.sort_values(["fail_rate", "median_duration_ms"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R1",
            severity="high",
            message=f"Stage {int(worst.stage_id)}: Fail rate >40% and time high. Suggest reducing enemy HP by 10%.",
            suggested_changes={"enemyHpMult": -0.10},
            evidence={"stage_id": int(worst.stage_id), "fail_rate": float(worst.fail_rate), "median_duration_ms": float(worst.median_duration_ms)}
        ))

    r2 = m[(m["fail_rate"] > FAIL_HI) & (m["median_duration_ms"] <= TIME_HI_MS)]
    if len(r2):
        worst = r2.sort_values(["fail_rate"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R2",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Fail rate >40% but time not extreme. Suggest reducing enemy damage by 10%.",
            suggested_changes={"enemyDamageMult": -0.10},
            evidence={"stage_id": int(worst.stage_id), "fail_rate": float(worst.fail_rate), "median_duration_ms": float(worst.median_duration_ms)}
        ))

    r3 = m[m["dropoff_rate"] > 0.25]
    if len(r3):
        worst = r3.sort_values(["dropoff_rate"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R3",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Dropoff >25%. Suggest more frequent checkpoints (reduce checkpointSpacing by 15%).",
            suggested_changes={"checkpointSpacing": -0.15},
            evidence={"stage_id": int(worst.stage_id), "dropoff_rate": float(worst.dropoff_rate)}
        ))

    r4 = m[(m["completion_rate"] > COMPLETE_HI) & (m["median_duration_ms"] < TIME_LO_MS)]
    if len(r4):
        best = r4.sort_values(["completion_rate", "median_duration_ms"], ascending=[False, True]).iloc[0]
        out.append(Suggestion(
            rule_id="R4",
            severity="low",
            message=f"Stage {int(best.stage_id)}: Very high completion and very fast. Suggest increasing enemy HP by 10%.",
            suggested_changes={"enemyHpMult": +0.10},
            evidence={"stage_id": int(best.stage_id), "completion_rate": float(best.completion_rate), "median_duration_ms": float(best.median_duration_ms)}
        ))

    r5 = m[(m["median_duration_ms"] > TIME_HI_MS) & (m["fail_rate"] <= FAIL_HI)]
    if len(r5):
        worst = r5.sort_values(["median_duration_ms"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R5",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Time high but fails not extreme. Suggest increasing player damage by 10%.",
            suggested_changes={"playerDamageMult": +0.10},
            evidence={"stage_id": int(worst.stage_id), "median_duration_ms": float(worst.median_duration_ms), "fail_rate": float(worst.fail_rate)}
        ))

    r6 = m[(m["completion_rate"] < 0.35) & (m["dropoff_rate"] > 0.20)]
    if len(r6):
        worst = r6.sort_values(["completion_rate", "dropoff_rate"], ascending=[True, False]).iloc[0]
        out.append(Suggestion(
            rule_id="R6",
            severity="high",
            message=f"Stage {int(worst.stage_id)}: Very low completion + high dropoff. Suggest reducing incoming damage 10% and increasing stamina regen 10%.",
            suggested_changes={"playerIncomingDamageMult": -0.10, "staminaRegenMult": +0.10},
            evidence={"stage_id": int(worst.stage_id), "completion_rate": float(worst.completion_rate), "dropoff_rate": float(worst.dropoff_rate)}
        ))

    return out

# ---------- SIMULATION (REFRESHED) ----------
def _sigmoid(x: float) -> float:
    # stable-ish sigmoid
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)

def _logit(p: float) -> float:
    p = max(1e-6, min(1.0 - 1e-6, p))
    return math.log(p / (1.0 - p))

def _lognormal_params_from_median(median: float, sigma: float) -> Tuple[float, float]:
    mu = math.log(max(median, 1.0))
    return mu, sigma

def run_simulation(
    funnel: pd.DataFrame,
    tdf: pd.DataFrame,
    params: Dict[str, Any],
    n_runs: int = 300,
    seed: int = 123,
    stage_id: int | None = None,
    n_enemies: int = 15,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Combat stats:
      - Player: 50 HP, 7 base damage
      - Enemies: even split archers/goblins
          * Archer: 15 HP, 5 damage
          * Goblin: 30 HP, 8 damage

    Model:
      - Player fights enemies sequentially.
      - While enemies are alive, they deal damage over time (DPS = damage_per_hit * ENEMY_HPS).
      - Player kill speed comes from DPS (player_damage_per_hit * PLAYER_HPS).
      - Exposure factor models parry/block/dodge.
      - Each attempt fails if sampled damage >= sampled effective HP buffer.
      - After each fail, player may quit with probability p_quit derived from telemetry dropoff_rate.
    """
    import random

    def _sigmoid(x: float) -> float:
        # stable-ish sigmoid
        if x >= 0:
            z = math.exp(-x)
            return 1.0 / (1.0 + z)
        z = math.exp(x)
        return z / (1.0 + z)

    def _lognormal(median: float, sigma: float, rng: random.Random) -> float:
        mu = math.log(max(median, 1.0))
        return math.exp(rng.gauss(mu, sigma))

    rng = random.Random(int(seed or 123))

    m = _get_stage_metrics(funnel, tdf).copy()
    if m.empty:
        runs = pd.DataFrame([{
            "run_idx": 0, "stage_id": stage_id or 1,
            "completed": 0, "attempts": 0, "fails_total": 0, "duration_ms": 0
        }])
        stage = pd.DataFrame([{
            "stage_id": stage_id or 1,
            "pred_attempt_fail_rate": 0.0,
            "pred_completion_rate": 0.0,
            "pred_avg_fails": 0.0,
            "pred_median_run_time_ms": 0.0,
            "p_quit_on_fail_used": 0.0,
        }])
        return runs, stage

    m = m.sort_values("stage_id")
    if stage_id is None:
        stage_id = int(m["stage_id"].iloc[0])

    row = m[m["stage_id"] == stage_id]
    if row.empty:
        row = m.iloc[[0]]
        stage_id = int(row["stage_id"].iloc[0])
    row = row.iloc[0]

    # Telemetry baselines 
    base_drop = float(row.get("dropoff_rate", 0.10) or 0.10)
    base_median_ms = float(row.get("median_duration_ms", 60000) or 60000)

    # Quit probability after each fail
    p_quit = max(0.02, min(0.12, base_drop * 0.4))

    # Combat stats 
    PLAYER_MAX_HP = 50.0
    PLAYER_BASE_DMG = 7.0

    ARCHER_HP = 15.0
    GOBLIN_HP = 30.0
    ARCHER_DMG = 5.0
    GOBLIN_DMG = 8.0

    # Pacing/variance knobs
    OVERHEAD_FRAC = 0.20     # non-combat time fraction
    PLAYER_HPS = 1.5         # player hits per second
    ENEMY_HPS = 0.6         # enemy attacks per second
    EXPOSURE = 0.4          # % damage that lands
    SKILL_SIGMA = 0.18       # player-to-player variability
    DMG_NOISE_SIGMA = 0.30   # attempt-to-attempt variability
    HP_BUFFER_MIN = 0.90     # effective HP buffer range
    HP_BUFFER_MAX = 1.10

    # Enemy counts (even split-ish)
    N_TOTAL = int(n_enemies)
    N_ARCHERS = N_TOTAL // 2
    N_GOBLINS = N_TOTAL - N_ARCHERS

    base_overhead_ms = base_median_ms * OVERHEAD_FRAC
    if base_overhead_ms < 500:
        base_overhead_ms = 500.0  # avoid degenerate overhead

    run_rows: List[Dict[str, Any]] = []
    attempt_fail_estimates: List[float] = []

    for r in range(int(n_runs)):
        # Player skill multiplier (affects outgoing DPS and implicitly reduces exposure a bit)
        skill = math.exp(rng.gauss(0.0, SKILL_SIGMA))
        skill = max(0.60, min(1.80, skill))

        attempts = 0
        fails_total = 0
        duration_ms = 0.0
        completed = 0

        for _ in range(200):
            attempts += 1

            enemy_hp_mult = float(params.get("enemyHpMult", 1.0))
            enemy_dmg_mult = float(params.get("enemyDamageMult", 1.0))
            player_dmg_mult = float(params.get("playerDamageMult", 1.0))

            # Player DPS
            dmg_per_hit = max(0.5, PLAYER_BASE_DMG * player_dmg_mult * skill)
            player_dps = dmg_per_hit * PLAYER_HPS

            # Enemy HP/DPS
            archer_hp = ARCHER_HP * enemy_hp_mult
            goblin_hp = GOBLIN_HP * enemy_hp_mult

            archer_dps = (ARCHER_DMG * enemy_dmg_mult) * ENEMY_HPS
            goblin_dps = (GOBLIN_DMG * enemy_dmg_mult) * ENEMY_HPS

            # Time to kill each enemy type (sequential)
            t_archer = archer_hp / max(0.1, player_dps)
            t_goblin = goblin_hp / max(0.1, player_dps)

            # Expected incoming damage during combat
            expected_damage = EXPOSURE * (
                (N_ARCHERS * t_archer * archer_dps) +
                (N_GOBLINS * t_goblin * goblin_dps)
            )

            # Add attempt variance
            damage = expected_damage * math.exp(rng.gauss(0.0, DMG_NOISE_SIGMA))

            # Effective HP buffer
            hp_buffer = PLAYER_MAX_HP * (HP_BUFFER_MIN + (HP_BUFFER_MAX - HP_BUFFER_MIN) * rng.random())

            # Determine fail
            failed = damage >= hp_buffer

            # Derive a smooth fail-prob estimate for reporting/charts
            # ratio = 0 means damage equals HP; >0 means likely fail.
            ratio = (damage - PLAYER_MAX_HP) / max(1e-6, PLAYER_MAX_HP)
            p_fail_est = _sigmoid(4.0 * ratio)   # 4.0 controls steepness
            attempt_fail_estimates.append(float(p_fail_est))

            # Time accounting: overhead + combat time
            combat_s = (N_ARCHERS * t_archer) + (N_GOBLINS * t_goblin)
            combat_ms = combat_s * 1000.0
            overhead_ms = _lognormal(base_overhead_ms, sigma=0.35, rng=rng)
            duration_ms += (overhead_ms + combat_ms)

            if failed:
                fails_total += 1
                if rng.random() < p_quit:
                    completed = 0
                    break
                continue
            else:
                completed = 1
                break

        run_rows.append({
            "run_idx": r,
            "stage_id": stage_id,
            "completed": completed,
            "attempts": attempts,
            "fails_total": fails_total,
            "duration_ms": int(duration_ms),
        })

    runs_df = pd.DataFrame(run_rows)

    pred_attempt_fail_rate = float(sum(attempt_fail_estimates) / max(1, len(attempt_fail_estimates)))
    stage_df = pd.DataFrame([{
        "stage_id": stage_id,
        "pred_attempt_fail_rate": pred_attempt_fail_rate,
        "pred_completion_rate": float(runs_df["completed"].mean()) if len(runs_df) else 0.0,
        "pred_avg_fails": float(runs_df["fails_total"].mean()) if len(runs_df) else 0.0,
        "pred_median_run_time_ms": float(runs_df["duration_ms"].median()) if len(runs_df) else 0.0,
        "p_quit_on_fail_used": float(p_quit),
    }])

    return runs_df, stage_df



def build_reach_curve(runs_df: pd.DataFrame) -> pd.DataFrame:
    """P(reach >= k) curve from per-run stage_reached."""
    if runs_df is None or not len(runs_df):
        return pd.DataFrame({"stage": [0], "reach_rate": [0.0]})

    max_stage = int(runs_df["stage_reached"].max())
    xs = list(range(0, max_stage + 1))
    ys = [(runs_df["stage_reached"] >= k).mean() for k in xs]
    return pd.DataFrame({"stage": xs, "reach_rate": ys})

def compare_simulations(
    funnel: pd.DataFrame,
    tdf: pd.DataFrame,
    proposed_params: Dict[str, Any],
    n_runs: int,
    seed: int,
    stage_id: int | None = None,
    n_enemies: int = 15,
) -> Dict[str, pd.DataFrame]:
    """
    ONE-STAGE baseline vs proposed comparison.

    Expects run_simulation() to return:
      runs_df columns: completed, attempts, fails_total, duration_ms, stage_id
      stage_df columns: pred_attempt_fail_rate, pred_completion_rate, pred_avg_fails, pred_median_run_time_ms, p_quit_on_fail_used
    """
    base_runs, base_stage = run_simulation(
        funnel, tdf, DEFAULT_PARAMS,
        n_runs=n_runs, seed=seed, stage_id=stage_id, n_enemies=n_enemies
    )
    prop_runs, prop_stage = run_simulation(
        funnel, tdf, proposed_params,
        n_runs=n_runs, seed=seed, stage_id=stage_id, n_enemies=n_enemies
    )

    # --- Stage chart frames (attempt fail rate + run time) ---
    # single-row stage_df -> make tidy frames for line/bar charts
    stage_fail = pd.concat([
        base_stage.assign(variant="Baseline")[["stage_id", "pred_attempt_fail_rate", "variant"]],
        prop_stage.assign(variant="Proposed")[["stage_id", "pred_attempt_fail_rate", "variant"]],
    ], ignore_index=True)

    stage_time = pd.concat([
        base_stage.assign(variant="Baseline")[["stage_id", "pred_median_run_time_ms", "variant"]],
        prop_stage.assign(variant="Proposed")[["stage_id", "pred_median_run_time_ms", "variant"]],
    ], ignore_index=True)

    # --- KPI summary (from runs_df) ---
    def _kpis(runs: pd.DataFrame) -> Dict[str, float]:
        if runs is None or not len(runs):
            return {"completion_rate": 0.0, "median_duration_ms": 0.0, "avg_fails": 0.0, "avg_attempts": 0.0}
        return {
            "completion_rate": float(runs["completed"].mean()),
            "median_duration_ms": float(runs["duration_ms"].median()),
            "avg_fails": float(runs["fails_total"].mean()),
            "avg_attempts": float(runs["attempts"].mean()),
        }

    kb = _kpis(base_runs)
    kp = _kpis(prop_runs)

    kpi_df = pd.DataFrame([
        {"metric": "Completion rate", "baseline": kb["completion_rate"], "proposed": kp["completion_rate"],
         "delta": kp["completion_rate"] - kb["completion_rate"]},
        {"metric": "Median run time (ms)", "baseline": kb["median_duration_ms"], "proposed": kp["median_duration_ms"],
         "delta": kp["median_duration_ms"] - kb["median_duration_ms"]},
        {"metric": "Avg fails per run", "baseline": kb["avg_fails"], "proposed": kp["avg_fails"],
         "delta": kp["avg_fails"] - kb["avg_fails"]},
        {"metric": "Avg attempts per run", "baseline": kb["avg_attempts"], "proposed": kp["avg_attempts"],
         "delta": kp["avg_attempts"] - kb["avg_attempts"]},
    ])

    # Optional: a nice distribution frame for plotting (helps “feel convincing”)
    dist_df = pd.concat([
        base_runs.assign(variant="Baseline")[["duration_ms", "fails_total", "attempts", "completed", "variant"]],
        prop_runs.assign(variant="Proposed")[["duration_ms", "fails_total", "attempts", "completed", "variant"]],
    ], ignore_index=True)

    # A small “meta” table that you can show in UI (e.g., tooltip text)
    meta_df = pd.DataFrame([{
        "stage_id": int((base_stage["stage_id"].iloc[0]) if len(base_stage) else (stage_id or 1)),
        "n_runs": int(n_runs),
        "seed": int(seed),
        "n_enemies": int(n_enemies),
        "p_quit_on_fail_used": float(base_stage["p_quit_on_fail_used"].iloc[0]) if len(base_stage) else None,
    }])

    return {
        "stage_fail": stage_fail,
        "stage_time": stage_time,
        "kpis": kpi_df,
        "dist": dist_df,
        "meta": meta_df,
        "base_runs": base_runs,
        "prop_runs": prop_runs,
    }


# ---------- DECISION LOG ----------
def save_decision(
    ts_iso: str,
    designer: str,
    stage_id: Optional[int],
    difficulty: Optional[str],
    changes: Dict[str, Any],
    rules: List[Suggestion],
    evidence: Dict[str, Any],
    rationale: str,
) -> str:
    init_balancing_tables()
    decision_id = str(uuid.uuid4())

    execute(
        """INSERT INTO balance_decisions
           (id, ts_iso, designer, stage_id, difficulty, changes_json, rules_json, evidence_json, rationale_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            decision_id,
            ts_iso,
            designer,
            stage_id,
            difficulty,
            json.dumps(changes, ensure_ascii=False),
            json.dumps([s.__dict__ for s in rules], ensure_ascii=False),
            json.dumps(evidence, ensure_ascii=False),
            rationale,
        ),
    )
    return decision_id

