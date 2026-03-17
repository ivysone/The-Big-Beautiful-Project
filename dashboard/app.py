import pandas as pd
import plotly.express as px
from dash import Dash, html, dcc, Input, Output, State
import dash
from .db import query_df
from .metrics import normalize_events, funnel_by_stage, time_by_stage, spike_detection, combat_by_stage, hits_by_enemy, fail_reasons
import json
from datetime import datetime

from .balancing_toolkit import (
    DEFAULT_PARAMS,
    generate_suggestions,
    compare_simulations,
    save_decision,
    init_balancing_tables,
)


# Dashboard UI
app = Dash(
    __name__,
    requests_pathname_prefix="/admin/",
)

app.title = "Telemetry Dashboard (Admin)"

def load_data():
    events = query_df("SELECT * FROM telemetry_events")
    return events

def difficulty_options(df):
    if "difficulty" not in df.columns:
        return [{"label": d, "value": d} for d in ["easy", "balanced", "hard"]]

    opts = sorted(df["difficulty"].dropna().unique().tolist())
    return [{"label": d, "value": d} for d in opts]
    
# LAYOUT
app.layout = html.Div([
    html.H2("📊 Telemetry Analytics Dashboard"),
    html.Div([
        html.Div([
            html.Label("Difficulty"),
            dcc.Dropdown(id="difficulty-dd", placeholder="All", clearable=True),
        ], style={"width": "250px", "display": "inline-block", "marginRight": "16px"}),

        dcc.Tabs([
            # Funnel view
            dcc.Tab(label="Funnel View", children=[
                dcc.Graph(id="funnel-view"),
            ]),

            # Difficulty Spikes
            dcc.Tab(label="Difficulty Spikes", children=[
                dcc.Graph(id="difficulty-spikes"),
            ]),

            # Progression Curves
            dcc.Tab(label="Progression Curves", children=[
                dcc.Graph(id="progression-curves"),
            ]),

            # Fairness Indicators
            dcc.Tab(label="Fairness Indicators", children=[
                dcc.Graph(id="fairness-chart"),
            ]),

            # Comparison Mode
            dcc.Tab(label="Comparison Mode", children=[
                dcc.Graph(id="difficulty-comparison"),
            ]),

            # Balancing Toolkit
            dcc.Tab(label="Balancing Toolkit", children=[
                html.H3("Combat Tuning Toolkit"),
                html.Div([
                    html.Div([
                        html.H4("Parameters (Proposed)"),
                        html.Div([
                            html.Label("Enemy Health"),
                            dcc.Slider(
                                id="p-enemyHpMult",
                                min=0.7, max=1.5, step=0.05,
                                value=DEFAULT_PARAMS["enemyHpMult"],
                                tooltip={"placement": "bottom", "always_visible": False},
                            ),
                            html.Small("Higher = longer fights. Increases time-to-kill (TTK).", style={"color": "#666"}),
                        ], style={"marginBottom": "14px"}),

                        html.Div([
                            html.Label("Enemy Damage"),
                            dcc.Slider(
                                id="p-enemyDamageMult",
                                min=0.7, max=1.5, step=0.05,
                                value=DEFAULT_PARAMS["enemyDamageMult"],
                                tooltip={"placement": "bottom", "always_visible": False},
                            ),
                            html.Small("Higher = more damage taken during TTK. Increases fail probability.", style={"color": "#666"}),
                        ], style={"marginBottom": "14px"}),

                        html.Div([
                            html.Label("Player Damage Output"),
                            dcc.Slider(
                                id="p-playerDamageMult",
                                min=0.7, max=1.5, step=0.05,
                                value=DEFAULT_PARAMS["playerDamageMult"],
                                tooltip={"placement": "bottom", "always_visible": False},
                            ),
                            html.Small("Higher = shorter fights. Reduces exposure time to damage.", style={"color": "#666"}),
                        ]),

                        html.Hr(),

                        html.Div([
                            dcc.Input(id="sim-seed", type="number", value=123, style={"width": "120px"}),
                            html.Span("Seed", style={"marginLeft": "8px", "marginRight": "14px"}),
                            html.Button("Run Full Simulation (500)", id="run-sim-btn", n_clicks=0),
                        ], style={"display": "flex", "alignItems": "center", "gap": "10px"}),

                        html.Div(id="sim-mode-badge", style={"marginTop": "10px", "color": "#666"}),
                    ], style={"flex": "1", "minWidth": "340px", "border": "1px solid #ddd", "borderRadius": "12px", "padding": "14px"}),

                    html.Div([
                        html.H4("Predicted Impact (Baseline vs Proposed)"),
                        html.Div(id="kpi-deltas", style={
                            "display": "grid",
                            "gridTemplateColumns": "1fr 1fr 1fr",
                            "gap": "10px",
                            "marginBottom": "10px",
                        }),
                        dcc.Graph(id="sim-reach-curve"),
                        html.Div([
                            dcc.Graph(id="sim-fail-by-stage"),
                            dcc.Graph(id="sim-time-by-stage"),
                        ], style={"display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "12px"}),
                    ], style={"flex": "2", "minWidth": "520px"}),
                ], style={"display": "flex", "gap": "14px", "alignItems": "flex-start"}),

                html.Hr(),

                html.H4("Rule-based Suggestions"),
                html.Div(id="rules-box", style={"border":"1px solid #ddd","borderRadius":"10px","padding":"10px"}),

                html.Hr(),
                html.H4("Decision Log"),
                html.Div([
                    dcc.Input(id="designer-name", placeholder="Designer name", value="designer", style={"width":"200px","marginRight":"8px"}),
                    dcc.Input(id="decision-stage", type="number", placeholder="Stage (optional)", style={"width":"160px","marginRight":"8px"}),
                    dcc.Input(id="decision-difficulty", placeholder="Difficulty (optional)", style={"width":"180px","marginRight":"8px"}),
                ], style={"marginBottom":"8px"}),

                dcc.Textarea(
                    id="decision-rationale",
                    placeholder="Rationale: what you changed and why (reference the baseline vs proposed deltas)...",
                    style={"width":"100%","height":"90px"}
                ),

                html.Div([
                    html.Button("Save Decision", id="save-decision-btn", n_clicks=0),
                    html.Span("", id="save-decision-status", style={"marginLeft":"10px"})
                ], style={"marginTop":"10px","marginBottom":"10px"}),

                dcc.Graph(id="decision-log-table"),
            ])


        ])
    ], style={"padding": "16px"})
])

# Initial Dropdown menu
@app.callback(
    Output("difficulty-dd", "options"),
    Input("difficulty-dd", "value"),
)

def init_dropdown(_):
    events = load_data()

    if events is None or events.empty:
        return [{"label": d, "value": d} for d in ["easy", "balanced", "hard"]]

    df = normalize_events(events)

    return difficulty_options(df)
    
# Dashboard Update
@app.callback(
    Output("funnel-view", "figure"),
    Output("difficulty-spikes", "figure"),
    Output("progression-curves", "figure"),
    Output("fairness-chart", "figure"),
    Output("difficulty-comparison", "figure"),
    
    Input("difficulty-dd", "value")
)


def update_dashboard(difficulty):
    events = load_data()

    if events is None or events.empty:
        empty = px.scatter(title="No telemetry data yet")
        return empty, empty, empty, empty, empty
    
    df = normalize_events(events)

    # Funnel
    funnel = funnel_by_stage(df, difficulty=difficulty)
    fig_funnel = px.bar(
        funnel,
        x="stage_id",
        y=["starts","completes","fails"],
        barmode="group",
        title="Stage Completion Funnel"
    )

    # Spike Detection
    time_df = time_by_stage(df, difficulty=difficulty)
    spikes = spike_detection(funnel, time_df)

    fig_spikes = px.scatter(
        spikes,
        x="fail_rate",
        y="median_duration_ms",
        color="is_spike",
        hover_data=["stage_id"],
        title="Difficulty Spike Detection"
    )

    # Progression Curves
    fig_progress = px.line(
        time_df,
        x="stage_id",
        y=["median_duration_ms", "p75_duration_ms", "p90_duration_ms"],
        title="Progression Curves (Time to Complete)"
    )

    # Fairness Indicators
    median_time = df["duration_ms"].median()
    fast_players = df[df["duration_ms"] <= median_time]
    slow_players = df[df["duration_ms"] > median_time]

    fairness = pd.DataFrame({
        "group": ["fast_players", "slow_players"],
        "avg_damage": [
            fast_players["damage_taken"].mean(),
            slow_players["damage_taken"].mean()
        ]
    })

    fig_fairness = px.bar(
        fairness,
        x="group",
        y="avg_damage",
        title="Fairness Indicator (Damage Taken by Player Type)"
    )

    # Difficulty Compariosn
    funnel_all = funnel_by_stage(df)

    compare = funnel_all.groupby("stage_id")[["completion_rate"]].mean().reset_index()

    fig_compare = px.line(
        compare,
        x="stage_id",
        y="completion_rate",
        title="Difficulty Comparison (Completion Rate)"
    )

    return fig_funnel, fig_spikes, fig_progress, fig_fairness, fig_compare

@app.callback(
    Output("sim-mode-badge", "children"),
    Output("kpi-deltas", "children"),
    Output("rules-box", "children"),
    Output("sim-reach-curve", "figure"),  
    Output("sim-fail-by-stage", "figure"),    
    Output("sim-time-by-stage", "figure"),   
    Input("run-sim-btn", "n_clicks"),
    Input("p-enemyHpMult", "value"),
    Input("p-enemyDamageMult", "value"),
    Input("p-playerDamageMult", "value"),
    Input("difficulty-dd", "value"),
    State("sim-seed", "value"),
)
def toolkit_update(n_clicks, enemyHpMult, enemyDamageMult, playerDamageMult, difficulty, seed):
    events, deaths, balance = load_data()
    df = normalize_events(events)

    funnel = funnel_by_stage(df, difficulty=difficulty)
    tdf = time_by_stage(df, difficulty=difficulty)

    if funnel is None or funnel.empty:
        empty_fig = px.scatter(title="No telemetry data for this filter (try another difficulty).")
        return (
            "Preview (no data)",
            [],
            html.Div("No telemetry data available for current filters."),
            empty_fig,
            empty_fig,
            empty_fig,
        )


    proposed_params = {
        "enemyHpMult": enemyHpMult,
        "enemyDamageMult": enemyDamageMult,
        "playerDamageMult": playerDamageMult,
    }

    # --- RULES (telemetry driven) ---
    suggestions = generate_suggestions(funnel, tdf)
    if suggestions:
        rules_ui = html.Ul([
            html.Li([
                html.B(f"{s.rule_id} ({s.severity}) "),
                html.Span(s.message),
                html.Code("  " + json.dumps(s.suggested_changes))
            ]) for s in suggestions
        ])
    else:
        rules_ui = html.Div("No rules triggered for current telemetry filters.")

    # --- PREVIEW vs FULL ---
    triggered = getattr(dash.callback_context, "triggered_id", None)
    full_run = (triggered == "run-sim-btn" and (n_clicks or 0) > 0)

    n_runs = 800 if full_run else 200
    badge = ("Full simulation (800 runs)" if full_run else "Preview (200 runs)")

    frames = compare_simulations(
        funnel=funnel,
        tdf=tdf,
        proposed_params=proposed_params,
        n_runs=n_runs,
        seed=int(seed or 123),
        stage_id=None,      # or set a specific stage id
        n_enemies=15,
    )

    # --- KPI delta cards ---
    kpi_df = frames["kpis"]
    kpi_cards = []
    for _, row in kpi_df.iterrows():
        metric = row["metric"]
        baseline = float(row["baseline"])
        proposed = float(row["proposed"])
        delta = float(row["delta"])

        # formatting
        if "rate" in metric.lower():
            btxt = f"{baseline:.1%}"
            ptxt = f"{proposed:.1%}"
            dtxt = f"{delta:+.1%}"
        else:
            btxt = f"{baseline:,.2f}" if "Avg" in metric else f"{baseline:,.0f}"
            ptxt = f"{proposed:,.2f}" if "Avg" in metric else f"{proposed:,.0f}"
            dtxt = f"{delta:+,.2f}" if "Avg" in metric else f"{delta:+,.0f}"

        kpi_cards.append(
            html.Div([
                html.Div(metric, style={"fontWeight": "600"}),
                html.Div(f"{btxt} → {ptxt}", style={"fontSize": "18px"}),
                html.Div(dtxt, style={"color": "#333"}),
            ], style={"border": "1px solid #ddd", "borderRadius": "12px", "padding": "10px"})
        )

    # --- FIGURE 1: Distribution plot (repurposes sim-reach-curve) ---
    # Show how tuning changes the distribution of fails_total (very convincing for retries)
    dist = frames["dist"].copy()

    # Histogram of fails per run (shows retries)
    fig_dist = px.histogram(
        dist,
        x="fails_total",
        color="variant",
        barmode="overlay",
        nbins=20,
        title="Retries distribution (fails per run) — Baseline vs Proposed"
    )
    fig_dist.update_layout(xaxis_title="Fails per run", yaxis_title="Count")

    # --- FIGURE 2: Fail chance per attempt (bar compare) ---
    stage_fail = frames["stage_fail"]
    fig_fail = px.bar(
        stage_fail,
        x="variant",
        y="pred_attempt_fail_rate",
        title="Predicted fail chance per attempt"
    )
    fig_fail.update_yaxes(range=[0, 1])
    fig_fail.update_layout(yaxis_tickformat=".0%")

    # --- FIGURE 3: Median run time (bar compare) ---
    stage_time = frames["stage_time"]
    fig_time = px.bar(
        stage_time,
        x="variant",
        y="pred_median_run_time_ms",
        title="Predicted median run time (ms)"
    )

    return badge, kpi_cards, rules_ui, fig_dist, fig_fail, fig_time


@app.callback(
    Output("save-decision-status", "children"),
    Input("save-decision-btn", "n_clicks"),
    State("designer-name", "value"),
    State("decision-stage", "value"),
    State("decision-difficulty", "value"),
    State("decision-rationale", "value"),
    # params
    State("p-enemyHpMult", "value"),
    State("p-enemyDamageMult", "value"),
    State("p-playerDamageMult", "value"),
    prevent_initial_call=True
)
def save_decision_cb(n_clicks, designer, stage_id, difficulty, rationale,
                     enemyHpMult, enemyDamageMult, playerDamageMult):
    # compute evidence snapshot from current telemetry filters
    events, deaths, balance = load_data()
    df = normalize_events(events)
    funnel = funnel_by_stage(df, difficulty=difficulty)
    tdf = time_by_stage(df, difficulty=difficulty)
    suggestions = generate_suggestions(funnel, tdf)

    changes = {
        "enemyHpMult": enemyHpMult,
        "enemyDamageMult": enemyDamageMult,
        "playerDamageMult": playerDamageMult,
    }


    evidence = {
        "difficulty_filter": difficulty,
        "funnel_rows": int(len(funnel)),
        "time_rows": int(len(tdf)),
        "funnel_head": funnel.head(10).to_dict(orient="records"),
        "time_head": tdf.head(10).to_dict(orient="records"),
    }

    if not rationale or not rationale.strip():
        return "Please enter a rationale before saving."

    init_balancing_tables()
    decision_id = save_decision(
        ts_iso=datetime.utcnow().isoformat(),
        designer=designer or "designer",
        stage_id=int(stage_id) if stage_id not in (None, "") else None,
        difficulty=difficulty,
        changes=changes,
        rules=suggestions,
        evidence=evidence,
        rationale=rationale.strip()
    )
    return f"Saved ✅ {decision_id[:8]}"

@app.callback(
    Output("decision-log-table", "figure"),
    Input("save-decision-btn", "n_clicks"),
)
def refresh_decision_log(_):
    init_balancing_tables()
    df = query_df("SELECT ts_iso, designer, stage_id, difficulty, changes_json, rationale_text FROM balance_decisions ORDER BY ts_iso DESC LIMIT 50")
    if not len(df):
        return px.scatter(title="No decisions saved yet.")
    # show as a simple bar/table-like chart (Dash DataTable is also fine, but you already use figures)
    df["changes_json"] = df["changes_json"].apply(lambda s: (s or "")[:120] + ("..." if s and len(s) > 120 else ""))
    return px.scatter(df, x="ts_iso", y="designer", hover_data=["stage_id","difficulty","changes_json","rationale_text"],
                      title="Decision Log (hover for details)")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8050)
