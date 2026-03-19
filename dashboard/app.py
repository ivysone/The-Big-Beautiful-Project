import json
from datetime import datetime
import pandas as pd
import plotly.express as px
import dash
from dash import Dash, html, dcc, Input, Output, State
from .db import query_df

from .metrics import (
    combat_by_stage,
    comparison_mode_metrics,
    compute_overview_kpis,
    fairness_segments,
    fail_reasons,
    funnel_by_stage,
    hits_by_enemy,
    normalize_events,
    progression_curves,
    spike_detection,
    time_by_stage,
)

from .balancing_toolkit import (
    DEFAULT_PARAMS,
    generate_suggestions,
    compare_simulations,
    save_decision,
    init_balancing_tables,
)


# Dash App Setup
app = Dash(__name__, requests_pathname_prefix="/admin/")
app.title = "Telemetry Dashboard (Admin)"

# Data Helpers
def load_data():
    events = query_df("SELECT * FROM telemetry_events")
    deaths = query_df("SELECT * FROM death_heatmap")
    balance = query_df("SELECT * FROM game_balance")
    return events, deaths, balance

def difficulty_options(df_norm):
    opts = sorted([x for x in df_norm["difficulty"].dropna().unique().tolist()])
    return [{"label": d, "value": d} for d in (opts if opts else ["easy","medium","hard"])]

def card(title: str, value: str, subtitle: str | None = None):
    """Reusable KPI card component for Overview and toolkit output."""
    children = [html.H4(title, style={"marginBottom": "6px"}), html.H3(value, style={"margin": 0})]
    if subtitle:
        children.append(html.Div(subtitle, style={"marginTop": "6px", "color": "#666", "fontSize": "13px"}))
    return html.Div(
        children,
        style={
            "padding": "12px",
            "border": "1px solid #ddd",
            "borderRadius": "10px",
            "minWidth": "160px",
            "background": "#fff",
        },
    )

def empty_figure(title: str):
    """Consistent fallback chart when a dataset is empty."""
    return px.scatter(title=title)


# ========================================================================================

# Dashboard Layout
app.layout = html.Div([
    html.H2("📊 Telemetry Analytics Dashboard"),
    # Common Dropdown Menu
    html.Div([
        # Difficulty Dropdown
        html.Div([
            html.Label("Difficulty"),
            dcc.Dropdown(id="difficulty-dd", placeholder="All", clearable=True),
        ], style={"width": "250px", "display": "inline-block", "marginRight": "16px"}),
        # Stage Dropdown
        html.Div([
            html.Label("Stage"),
            dcc.Dropdown(id="stage-dd", placeholder="Select stage", clearable=False),
        ], style={"width": "250px", "display": "inline-block"}),
    ], style={"marginBottom": "16px"}),
    
    # Dashboard Tabs
    dcc.Tabs([
        # Overview Tab
        dcc.Tab(label="Overview", children=[
            html.Div(id="kpi-row", style={
                "display": "grid",
                "gridTemplateColumns": "repeat(auto-fit, minmax(180px, 1fr))",
                "gap": "12px",
                "marginTop": "12px",
            }),
        ]),

        # Funnel View Tab
        dcc.Tab(label="Funnel", children=[
            dcc.Graph(id="funnel-graph"),
            dcc.Graph(id="fail-drop-graph"),
        ]),
        
        # Difficulty Spikes Tab
        dcc.Tab(label="Difficulty Spikes", children=[
            dcc.Graph(id="spike-stage-bar"),
            dcc.Graph(id="spike-table"),
        ]),
        
        # Progression Cuves Tab
        dcc.Tab(label="Progression Curves", children=[
            dcc.Graph(id="time-curve"),
            dcc.Graph(id="resource-curve"),
        ]),

        # Fairness Indicators Tab
        dcc.Tab(label="Fairness Indicators", children=[
            dcc.Graph(id="fairness-speed"),
            dcc.Graph(id="fairness-style"),
        ]),
        
        # Comparison Mode Tab
        dcc.Tab(label="Comparison Mode", children=[
            dcc.Graph(id="comparison-mode-graph"),
        ]),

        # Player Death Heatmap Tab
        dcc.Tab(label="Heatmap", children=[
            dcc.Graph(id="death-heatmap"),
        ]),

        # Combat & Healing Tab
        dcc.Tab(label="Combat & Healing", children=[
            dcc.Graph(id="combat-summary"),
            html.Div([
                dcc.Graph(id="hits-by-enemy"),
                dcc.Graph(id="death-causes"),
            ], style={"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"12px"}),
        ]),

        # Balancing Toolkit Tab
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
], style={"padding": "16px", "background": "#fafafa"})



# ====================================================================================

# Dropdowns
@app.callback(
    Output("difficulty-dd", "options"),
    Output("stage-dd", "options"),
    Input("difficulty-dd", "value")
)
def init_dropdowns(_):
    events, deaths, _balance = load_data()

    # difficulty options
    if events is None or events.empty:
        diff_opts = [{"label": d, "value": d} for d in ["easy","medium","hard"]]
    else:
        df = normalize_events(events)
        diff_opts = difficulty_options(df)

    # stage options
    if deaths is None or deaths.empty or "stage_number" not in deaths.columns:
        stages = list(range(1, 11))
    else:
        stages = sorted(pd.to_numeric(deaths["stage_number"], errors="coerce").dropna().astype(int).unique().tolist())

    stage_opts = [{"label": f"Stage {s}", "value": s} for s in stages]
    return diff_opts, stage_opts

# ==============================================================================

# Main Dashboard Update
@app.callback(
    Output("kpi-row", "children"),
    Output("funnel-graph", "figure"),
    Output("fail-drop-graph", "figure"),
    Output("time-curve", "figure"),
    Output("resource-curve", "figure"),
    Output("spike-stage-bar", "figure"),
    Output("spike-table", "figure"),
    Output("fairness-speed", "figure"),
    Output("fairness-style", "figure"),
    Output("comparison-mode-graph", "figure"),
    Output("death-heatmap", "figure"),
    Output("combat-summary", "figure"),
    Output("hits-by-enemy", "figure"),
    Output("death-causes", "figure"),
    
    Input("difficulty-dd", "value"),
    Input("stage-dd", "value"),
)
def update_dashboard(difficulty, stage_value):
    events, deaths, balance = load_data()
    df = normalize_events(events)

    # Shared Metric Frames
    funnel = funnel_by_stage(df, difficulty=difficulty)
    tdf = time_by_stage(df, difficulty=difficulty)
    spikes = spike_detection(funnel, tdf)
    durations, resources = progression_curves(df, difficulty=difficulty)
    fairness = fairness_segments(df, difficulty=difficulty)
    comparison = comparison_mode_metrics(df)
    overview = compute_overview_kpis(df, difficulty=difficulty)

    # Overview
    kpi_cards = [
        card("Sessions", f"{overview['sessions']}", "unique session_ids"),
        card("Players", f"{overview['players']}", "unique users"),
        card("Completion Rate", f"{overview['completion_rate']:.1%}", f"{overview['completes']} completions"),
        card("Fail Rate", f"{overview['fail_rate']:.1%}", f"{overview['fails']} fails"),
        card("Spike Stages", f"{overview['spike_stages']}", f"across {overview['active_stages']} stages"),
        card("Median Completion Time", f"{overview['median_minutes']:.2f} min", "stage_complete events"),
    ]

    # Funnel
    if len(funnel):
        fig_funnel = px.bar(
            funnel,
            x="stage_id",
            y=["completes", "fails", "quits"],
            title="Stage Funnel Counts (complete / fail / quit)",
            barmode="stack",
        )
        fig_rates = px.line(
            funnel,
            x="stage_id",
            y=["completion_rate", "fail_rate", "dropoff_rate"],
            title="Stage Rates",
            markers=True,
        )
        fig_rates.update_layout(yaxis_tickformat=".0%")
    else:
        fig_funnel = empty_figure("Stage Funnel Counts - no data")
        fig_rates = empty_figure("Stage Rates - no data")

    fig_rates = px.line(
        funnel, x="stage_id", y=["completion_rate", "fail_rate", "dropoff_rate"],
        title="Stage Rates"
    )

    # Progression Curve
    if len(durations):
        fig_time = px.box(
            durations,
            x="stage_id",
            y="duration_minutes",
            points="all",
            title="Time-to-complete distribution by stage (minutes)",
        )
    else:
        fig_time = empty_figure("Time-to-complete distribution - no data")

    if len(resources):
        resource_long = resources[[
            "stage_id",
            "cumulative_heal_pickups",
            "cumulative_heal_amount",
            "cumulative_enemy_kills",
        ]].melt(id_vars="stage_id", var_name="metric", value_name="value")
        fig_resource = px.line(
            resource_long,
            x="stage_id",
            y="value",
            color="metric",
            markers=True,
            title="Progression curves: cumulative resource / progression accumulation",
        )
    else:
        fig_resource = empty_figure("Progression resource curves - no data")

    # Difficulty Spikes
    if len(spikes):
        fig_spike_bar = px.bar(
            spikes.sort_values(["is_spike", "spike_score", "stage_id"], ascending=[False, False, True]),
            x="stage_id",
            y="spike_score",
            color="is_spike",
            title="Difficulty spikes: automatically highlighted stages",
            hover_data=["fail_rate", "median_duration_ms", "completion_rate", "dropoff_rate"],
        )
        spikes_view = spikes.copy()
        spikes_view["spike_label"] = spikes_view["is_spike"].map({True: "SPIKE", False: "ok"})
        fig_spike = px.scatter(
            spikes_view,
            x="fail_rate",
            y="median_duration_ms",
            color="spike_label",
            hover_data=["stage_id", "spike_score", "completion_rate", "dropoff_rate"],
            title="Fail rate vs median duration (spike detection view)",
        )
        fig_spike.update_layout(xaxis_tickformat=".0%")
    else:
        fig_spike_bar = empty_figure("Difficulty spikes - no data")
        fig_spike = empty_figure("Spike detection view - no data")

    # Fairness Indicators
    if len(fairness):
        speed = fairness[fairness["segment_type"] == "Speed"].copy()
        style = fairness[fairness["segment_type"] == "Play style"].copy()

        fig_fair_speed = (
            px.bar(
                speed.melt(
                    id_vars=["segment"],
                    value_vars=["completion_rate", "fail_rate", "median_duration_minutes"],
                    var_name="metric",
                    value_name="value",
                ),
                x="metric",
                y="value",
                color="segment",
                barmode="group",
                title="Fairness indicators: Fast vs Slow players",
            )
            if len(speed)
            else empty_figure("Fairness indicators (Fast vs Slow) - insufficient data")
        )
        if len(speed):
            fig_fair_speed.update_xaxes(title=None)

        fig_fair_style = (
            px.bar(
                style.melt(
                    id_vars=["segment"],
                    value_vars=["completion_rate", "fail_rate", "avg_heals", "avg_player_hits", "avg_enemy_kills"],
                    var_name="metric",
                    value_name="value",
                ),
                x="metric",
                y="value",
                color="segment",
                barmode="group",
                title="Fairness indicators: Cautious vs Aggressive players",
            )
            if len(style)
            else empty_figure("Fairness indicators (Cautious vs Aggressive) - insufficient data")
        )
        if len(style):
            fig_fair_style.update_xaxes(title=None)
    else:
        fig_fair_speed = empty_figure("Fairness indicators - no data")
        fig_fair_style = empty_figure("Fairness indicators - no data")

    # Comparison Mode
    if len(comparison):
        fig_compare = px.bar(
            comparison,
            x="metric",
            y="value",
            color="config",
            barmode="group",
            title="Comparison mode: easy vs balanced vs hard",
        )
        fig_compare.update_xaxes(title=None)
    else:
        fig_compare = empty_figure("Comparison mode - no configuration data")

    # Death heatmap
    if stage_value is None:
        stage_value = int(deaths["stage_number"].dropna().iloc[0]) if len(deaths) and deaths["stage_number"].dropna().any() else 1

    stage_deaths = deaths[deaths["stage_number"] == stage_value].copy() if len(deaths) else pd.DataFrame(columns=["x_position", "y_position"])
    if len(stage_deaths):
        fig_heat = px.density_heatmap(
            stage_deaths,
            x="x_position",
            y="y_position",
            nbinsx=40,
            nbinsy=25,
            title=f"Death Heat Map (Stage {stage_value})",
        )
    else:
        fig_heat = empty_figure(f"Death Heat Map (Stage {stage_value}) - no data")

    # Combat report
    combat = combat_by_stage(df, difficulty=difficulty)
    if len(combat):
        fig_combat = px.bar(
            combat,
            x="stage_id",
            y=["enemy_kills", "player_hits", "heal_pickups", "deaths", "retries"],
            barmode="group",
            title="Combat & Healing volume by stage",
        )
    else:
        fig_combat = empty_figure("Combat & Healing - no data")

    hb = hits_by_enemy(df, difficulty=difficulty, stage_id=stage_value)
    fig_hits_enemy = (
        px.pie(hb, names="enemy_type", values="hits", title="Who is hitting the player? (hits by enemy type)")
        if len(hb)
        else empty_figure("No player_hit events yet.")
    )

    fr = fail_reasons(df, difficulty=difficulty, stage_id=stage_value)
    fig_fail_causes = (
        px.bar(fr, x="cause", y="count", title="Death causes")
        if len(fr)
        else empty_figure("No death events yet.")
    )

    return (
        kpi_cards,
        fig_funnel,
        fig_rates,
        fig_time,
        fig_resource,
        fig_spike_bar,
        fig_spike,
        fig_fair_speed,
        fig_fair_style,
        fig_compare,
        fig_heat,
        fig_combat,
        fig_hits_enemy,
        fig_fail_causes,
    )
    
# ------------------------------------------------------------------------------------------------------------------------------------------------

# Balancing Toolkit Callbacks
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
