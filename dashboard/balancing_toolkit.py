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

def generate_suggestions_from_sim(
    stage_fail: pd.DataFrame,
    stage_time: pd.DataFrame,
    reach_curve: pd.DataFrame | None = None,
) -> List[Suggestion]:
    if stage_fail is None or stage_fail.empty or stage_time is None or stage_time.empty:
        return []

    fail_df = stage_fail[stage_fail["variant"] == "Proposed"].copy()
    time_df = stage_time[stage_time["variant"] == "Proposed"].copy()

    if fail_df.empty or time_df.empty:
        return []

    m = fail_df.merge(
        time_df[["stage_id", "pred_median_run_time_ms"]],
        on="stage_id",
        how="outer",
    ).fillna(0)

    if reach_curve is not None and not reach_curve.empty:
        rc = reach_curve[reach_curve["variant"] == "Proposed"].copy()
        if not rc.empty:
            m = m.merge(
                rc[["stage_id", "reach_rate"]],
                on="stage_id",
                how="left",
            )

    if "reach_rate" not in m.columns:
        m["reach_rate"] = 1.0

    out: List[Suggestion] = []

    FAIL_HI = 0.40
    TIME_HI_MS = 120000
    TIME_LO_MS = 45000

    r1 = m[(m["pred_attempt_fail_rate"] > FAIL_HI) & (m["pred_median_run_time_ms"] > TIME_HI_MS)]
    if len(r1):
        worst = r1.sort_values(["pred_attempt_fail_rate", "pred_median_run_time_ms"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R1",
            severity="high",
            message=f"Stage {int(worst.stage_id)}: Predicted fail rate >40% and time high. Suggest reducing enemy HP by 10%.",
            suggested_changes={"enemyHpMult": -0.10},
            evidence={
                "stage_id": int(worst.stage_id),
                "pred_attempt_fail_rate": float(worst.pred_attempt_fail_rate),
                "pred_median_run_time_ms": float(worst.pred_median_run_time_ms),
            },
        ))

    r2 = m[(m["pred_attempt_fail_rate"] > FAIL_HI) & (m["pred_median_run_time_ms"] <= TIME_HI_MS)]
    if len(r2):
        worst = r2.sort_values(["pred_attempt_fail_rate"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R2",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Predicted fail rate >40% but time not extreme. Suggest reducing enemy damage by 10%.",
            suggested_changes={"enemyDamageMult": -0.10},
            evidence={
                "stage_id": int(worst.stage_id),
                "pred_attempt_fail_rate": float(worst.pred_attempt_fail_rate),
                "pred_median_run_time_ms": float(worst.pred_median_run_time_ms),
            },
        ))

    r3 = m[m["reach_rate"] < 0.60]
    if len(r3):
        worst = r3.sort_values(["reach_rate"], ascending=True).iloc[0]
        out.append(Suggestion(
            rule_id="R3",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Predicted reach is low. Suggest more frequent checkpoints.",
            suggested_changes={"checkpointSpacing": -0.15},
            evidence={
                "stage_id": int(worst.stage_id),
                "reach_rate": float(worst.reach_rate),
            },
        ))

    r4 = m[(m["pred_attempt_fail_rate"] < 0.15) & (m["pred_median_run_time_ms"] < TIME_LO_MS)]
    if len(r4):
        best = r4.sort_values(["pred_attempt_fail_rate", "pred_median_run_time_ms"], ascending=[True, True]).iloc[0]
        out.append(Suggestion(
            rule_id="R4",
            severity="low",
            message=f"Stage {int(best.stage_id)}: Predicted fail rate is very low and clear time is very fast. Suggest increasing enemy HP by 10%.",
            suggested_changes={"enemyHpMult": +0.10},
            evidence={
                "stage_id": int(best.stage_id),
                "pred_attempt_fail_rate": float(best.pred_attempt_fail_rate),
                "pred_median_run_time_ms": float(best.pred_median_run_time_ms),
            },
        ))

    r5 = m[(m["pred_median_run_time_ms"] > TIME_HI_MS) & (m["pred_attempt_fail_rate"] <= FAIL_HI)]
    if len(r5):
        worst = r5.sort_values(["pred_median_run_time_ms"], ascending=False).iloc[0]
        out.append(Suggestion(
            rule_id="R5",
            severity="med",
            message=f"Stage {int(worst.stage_id)}: Predicted time is still high. Suggest increasing player damage by 10%.",
            suggested_changes={"playerDamageMult": +0.10},
            evidence={
                "stage_id": int(worst.stage_id),
                "pred_attempt_fail_rate": float(worst.pred_attempt_fail_rate),
                "pred_median_run_time_ms": float(worst.pred_median_run_time_ms),
            },
        ))

    r6 = m[(m["pred_attempt_fail_rate"] > 0.30) & (m["reach_rate"] < 0.50)]
    if len(r6):
        worst = r6.sort_values(["reach_rate", "pred_attempt_fail_rate"], ascending=[True, False]).iloc[0]
        out.append(Suggestion(
            rule_id="R6",
            severity="high",
            message=f"Stage {int(worst.stage_id)}: Predicted survival and reach are both weak. Suggest reducing incoming damage and increasing stamina regen.",
            suggested_changes={"playerIncomingDamageMult": -0.10, "staminaRegenMult": +0.10},
            evidence={
                "stage_id": int(worst.stage_id),
                "pred_attempt_fail_rate": float(worst.pred_attempt_fail_rate),
                "reach_rate": float(worst.reach_rate),
            },
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
    Lightweight stage simulation that reacts to all balancing sliders.

    The model blends telemetry-derived baselines with simple combat/economy heuristics:
    - enemyHpMult: longer fights
    - enemyDamageMult: more incoming damage
    - playerDamageMult: faster clears
    - playerIncomingDamageMult: scales damage taken after mitigation
    - staminaRegenMult: reduces effective exposure / improves sustain
    - parryWindowMs: reduces effective exposure
    - parryStunMs: increases player damage uptime
    - checkpointSpacing: affects quit probability after failures
    - rewardCoinsMult: improves sustain and slightly reduces time pressure
    """
    import random

    def _lognormal(median: float, sigma: float, rng: random.Random) -> float:
        mu = math.log(max(median, 1.0))
        return math.exp(rng.gauss(mu, sigma))

    rng = random.Random(int(seed or 123))

    m = _get_stage_metrics(funnel, tdf).copy()
    if m.empty:
        runs = pd.DataFrame([{
            "run_idx": 0,
            "stage_id": stage_id or 1,
            "completed": 0,
            "attempts": 0,
            "fails_total": 0,
            "duration_ms": 0,
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

    # ----- telemetry baselines -----
    base_completion = float(row.get("completion_rate", 0.5) or 0.5)
    base_fail = float(row.get("fail_rate", 0.3) or 0.3)
    base_drop = float(row.get("dropoff_rate", 0.1) or 0.1)
    base_median_ms = float(row.get("median_duration_ms", 60000) or 60000)

    # ----- parameter extraction -----
    enemy_hp_mult = float(params.get("enemyHpMult", 1.0))
    enemy_dmg_mult = float(params.get("enemyDamageMult", 1.0))
    player_dmg_mult = float(params.get("playerDamageMult", 1.0))
    player_incoming_mult = float(params.get("playerIncomingDamageMult", 1.0))
    stamina_regen_mult = float(params.get("staminaRegenMult", 1.0))
    parry_window_ms = float(params.get("parryWindowMs", 120.0))
    parry_stun_ms = float(params.get("parryStunMs", 1200.0))
    checkpoint_spacing = float(params.get("checkpointSpacing", 1.0))
    reward_coins_mult = float(params.get("rewardCoinsMult", 1.0))

    # clamp to safe ranges
    enemy_hp_mult = max(0.5, min(2.0, enemy_hp_mult))
    enemy_dmg_mult = max(0.5, min(2.0, enemy_dmg_mult))
    player_dmg_mult = max(0.5, min(2.0, player_dmg_mult))
    player_incoming_mult = max(0.5, min(2.0, player_incoming_mult))
    stamina_regen_mult = max(0.5, min(2.0, stamina_regen_mult))
    parry_window_ms = max(40.0, min(300.0, parry_window_ms))
    parry_stun_ms = max(300.0, min(2500.0, parry_stun_ms))
    checkpoint_spacing = max(0.5, min(2.0, checkpoint_spacing))
    reward_coins_mult = max(0.5, min(2.0, reward_coins_mult))

    # ----- combat baselines -----
    PLAYER_MAX_HP = 50.0
    PLAYER_BASE_DMG = 7.0

    ARCHER_HP = 15.0
    GOBLIN_HP = 30.0
    ARCHER_DMG = 5.0
    GOBLIN_DMG = 8.0

    PLAYER_HPS = 1.5
    ENEMY_HPS = 0.6
    BASE_EXPOSURE = 0.40

    SKILL_SIGMA = 0.18
    DMG_NOISE_SIGMA = 0.30

    # ----- slider-derived effects -----

    # parry window: bigger window = less incoming damage
    # 120ms is baseline; every +60ms gives meaningful mitigation
    parry_window_factor = 1.0 - ((parry_window_ms - 120.0) / 300.0)
    parry_window_factor = max(0.70, min(1.20, parry_window_factor))

    # parry stun: bigger stun = more effective player uptime / shorter fights
    parry_stun_factor = 1.0 - ((parry_stun_ms - 1200.0) / 6000.0)
    parry_stun_factor = max(0.80, min(1.15, parry_stun_factor))

    # stamina regen reduces exposure and increases effective HP buffer
    stamina_exposure_factor = 1.0 / max(0.7, min(1.5, stamina_regen_mult))
    stamina_hp_factor = max(0.85, min(1.20, 0.9 + 0.1 * stamina_regen_mult))

    # reward multiplier acts like better sustain/economy
    reward_exposure_factor = max(0.88, min(1.08, 1.0 - (reward_coins_mult - 1.0) * 0.12))
    reward_time_factor = max(0.90, min(1.10, 1.0 - (reward_coins_mult - 1.0) * 0.06))

    # checkpoint spacing: lower means more frequent checkpoints -> lower quit pressure
    checkpoint_quit_factor = max(0.60, min(1.50, checkpoint_spacing))
    checkpoint_fails_factor = max(0.85, min(1.20, 0.95 + 0.10 * (checkpoint_spacing - 1.0)))

    # final exposure multiplier for incoming damage
    exposure = BASE_EXPOSURE
    exposure *= parry_window_factor
    exposure *= stamina_exposure_factor
    exposure *= reward_exposure_factor
    exposure = max(0.18, min(0.75, exposure))

    # enemy counts by stage
    n_total = int(max(4, n_enemies))
    n_archers = n_total // 2
    n_goblins = n_total - n_archers

    # telemetry-informed quit probability after each fail
    p_quit = max(0.02, min(0.25, base_drop * 0.45 * checkpoint_quit_factor))

    # overhead time
    base_overhead_ms = max(500.0, base_median_ms * 0.20)

    run_rows: List[Dict[str, Any]] = []
    attempt_fail_estimates: List[float] = []

    for r in range(int(n_runs)):
        skill = math.exp(rng.gauss(0.0, SKILL_SIGMA))
        skill = max(0.60, min(1.80, skill))

        attempts = 0
        fails_total = 0
        duration_ms = 0.0
        completed = 0

        for _ in range(200):
            attempts += 1

            # outgoing DPS
            dmg_per_hit = max(0.5, PLAYER_BASE_DMG * player_dmg_mult * skill)
            player_dps = dmg_per_hit * PLAYER_HPS

            # parry stun makes fights shorter
            player_dps *= (1.0 / parry_stun_factor)

            # enemy HP
            archer_hp = ARCHER_HP * enemy_hp_mult
            goblin_hp = GOBLIN_HP * enemy_hp_mult

            # enemy DPS
            archer_dps = (ARCHER_DMG * enemy_dmg_mult) * ENEMY_HPS
            goblin_dps = (GOBLIN_DMG * enemy_dmg_mult) * ENEMY_HPS

            # sequential kill times
            t_archer = (archer_hp / max(0.1, player_dps)) ** 0.75
            t_goblin = (goblin_hp / max(0.1, player_dps)) ** 0.75

            # raw incoming damage during combat
            expected_damage = exposure * (
                (n_archers * t_archer * archer_dps) +
                (n_goblins * t_goblin * goblin_dps)
            )

            # apply direct incoming-damage multiplier
            expected_damage *= player_incoming_mult

            # checkpoint spacing slightly affects failure pressure
            expected_damage *= checkpoint_fails_factor

            # attempt-to-attempt variance
            damage = expected_damage * math.exp(rng.gauss(0.0, DMG_NOISE_SIGMA))

            # effective HP buffer
            hp_buffer = PLAYER_MAX_HP
            hp_buffer *= stamina_hp_factor
            hp_buffer *= max(0.92, min(1.10, 1.0 + (reward_coins_mult - 1.0) * 0.08))
            hp_buffer *= (0.90 + 0.20 * rng.random())

            failed = damage >= hp_buffer

            # smooth fail estimate for charting
            ratio = (damage - hp_buffer) / max(1e-6, hp_buffer)
            p_fail_est = _sigmoid(4.5 * ratio)

            # blend simulation with telemetry baseline slightly so output feels grounded
            p_fail_est = 0.75 * p_fail_est + 0.25 * base_fail
            p_fail_est = max(0.0, min(1.0, p_fail_est))
            attempt_fail_estimates.append(float(p_fail_est))

            # time accounting
            combat_s = (n_archers * t_archer) + (n_goblins * t_goblin)
            combat_ms = combat_s * 1000.0
            overhead_ms = _lognormal(base_overhead_ms, sigma=0.35, rng=rng)
            overhead_ms *= reward_time_factor

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

    # attempt fail rate
    pred_attempt_fail_rate = float(sum(attempt_fail_estimates) / max(1, len(attempt_fail_estimates)))

    # stage completion rate
    sim_completion = float(runs_df["completed"].mean()) if len(runs_df) else 0.0

    # blend with baseline to reduce extreme simulation swings
    pred_completion_rate = 0.70 * sim_completion + 0.30 * base_completion
    pred_completion_rate = max(0.0, min(1.0, pred_completion_rate))

    stage_df = pd.DataFrame([{
        "stage_id": stage_id,
        "pred_attempt_fail_rate": pred_attempt_fail_rate,
        "pred_completion_rate": pred_completion_rate,
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
    stage_metrics = _get_stage_metrics(funnel, tdf).copy().sort_values("stage_id")
    if stage_metrics.empty:
        empty = pd.DataFrame()
        return {
            "stage_fail": empty,
            "stage_time": empty,
            "reach_curve": empty,
            "kpis": empty,
            "dist": empty,
            "meta": pd.DataFrame([{"n_runs": n_runs, "seed": seed}]),
            "base_runs": empty,
            "prop_runs": empty,
        }

    stage_ids = (
        [stage_id]
        if stage_id is not None and stage_id in stage_metrics["stage_id"].tolist()
        else stage_metrics["stage_id"].astype(int).tolist()
    )

    def simulate_variant(params: Dict[str, Any], label: str) -> tuple[pd.DataFrame, pd.DataFrame]:
        per_stage_runs = []
        per_stage_summary = []

        for idx, sid in enumerate(stage_ids):
            enemy_count = n_enemies + idx
            runs_df, stage_df = run_simulation(
                funnel=funnel,
                tdf=tdf,
                params=params,
                n_runs=n_runs,
                seed=seed + idx,
                stage_id=sid,
                n_enemies=enemy_count,
            )
            runs_df = runs_df.copy()
            runs_df["variant"] = label
            stage_df = stage_df.copy()
            stage_df["variant"] = label

            per_stage_runs.append(runs_df)
            per_stage_summary.append(stage_df)

        runs = pd.concat(per_stage_runs, ignore_index=True)
        stages = pd.concat(per_stage_summary, ignore_index=True)

        reach_rows = []
        survivors = 1.0
        for _, row in stages.sort_values("stage_id").iterrows():
            sid = int(row["stage_id"])
            reach_rows.append({
                "stage_id": sid,
                "variant": label,
                "reach_rate": survivors,
                "completion_rate_at_stage": float(row["pred_completion_rate"]),
            })
            survivors *= float(row["pred_completion_rate"])

        reach_curve = pd.DataFrame(reach_rows)
        return runs, stages.merge(reach_curve, on=["stage_id", "variant"], how="left")

    base_runs, base_stage = simulate_variant(DEFAULT_PARAMS, "Baseline")
    prop_runs, prop_stage = simulate_variant(proposed_params, "Proposed")

    stage_fail = pd.concat([
        base_stage[["stage_id", "pred_attempt_fail_rate", "variant"]],
        prop_stage[["stage_id", "pred_attempt_fail_rate", "variant"]],
    ], ignore_index=True)

    stage_time = pd.concat([
        base_stage[["stage_id", "pred_median_run_time_ms", "variant"]],
        prop_stage[["stage_id", "pred_median_run_time_ms", "variant"]],
    ], ignore_index=True)

    reach_curve = pd.concat([
        base_stage[["stage_id", "reach_rate", "variant"]],
        prop_stage[["stage_id", "reach_rate", "variant"]],
    ], ignore_index=True)

    dist_df = pd.concat([
        base_runs[["duration_ms", "fails_total", "attempts", "completed", "stage_id", "variant"]],
        prop_runs[["duration_ms", "fails_total", "attempts", "completed", "stage_id", "variant"]],
    ], ignore_index=True)

    def overall_kpis(stage_df: pd.DataFrame, runs_df: pd.DataFrame) -> Dict[str, float]:
        final_reach = float(stage_df.sort_values("stage_id")["reach_rate"].iloc[-1]) if len(stage_df) else 0.0
        return {
            "completion_rate": final_reach,
            "median_duration_ms": float(stage_df["pred_median_run_time_ms"].median()) if len(stage_df) else 0.0,
            "avg_fails": float(stage_df["pred_avg_fails"].mean()) if len(stage_df) else 0.0,
            "avg_attempt_fail_rate": float(stage_df["pred_attempt_fail_rate"].mean()) if len(stage_df) else 0.0,
        }

    kb = overall_kpis(base_stage, base_runs)
    kp = overall_kpis(prop_stage, prop_runs)

    kpi_df = pd.DataFrame([
        {
            "metric": "Predicted final reach rate",
            "baseline": kb["completion_rate"],
            "proposed": kp["completion_rate"],
            "delta": kp["completion_rate"] - kb["completion_rate"],
        },
        {
            "metric": "Median stage time (ms)",
            "baseline": kb["median_duration_ms"],
            "proposed": kp["median_duration_ms"],
            "delta": kp["median_duration_ms"] - kb["median_duration_ms"],
        },
        {
            "metric": "Avg fails per stage-run",
            "baseline": kb["avg_fails"],
            "proposed": kp["avg_fails"],
            "delta": kp["avg_fails"] - kb["avg_fails"],
        },
        {
            "metric": "Avg attempt fail rate",
            "baseline": kb["avg_attempt_fail_rate"],
            "proposed": kp["avg_attempt_fail_rate"],
            "delta": kp["avg_attempt_fail_rate"] - kb["avg_attempt_fail_rate"],
        },
    ])

    return {
        "stage_fail": stage_fail,
        "stage_time": stage_time,
        "reach_curve": reach_curve,
        "kpis": kpi_df,
        "dist": dist_df,
        "meta": pd.DataFrame([{"n_runs": n_runs, "seed": seed, "stages": len(stage_ids)}]),
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
