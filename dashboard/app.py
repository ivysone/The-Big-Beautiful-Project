import pandas as pd
import plotly.express as px
from dash import Dash, html, dcc, Input, Output
from .db import query_df
from .metrics import normalize_events, funnel_by_stage, time_by_stage, spike_detection

# Dashboard UI
app = Dash(__name__, requests_pathname_prefix="/admin/")
app.title = "Telemetry Dashboard (Admin)"

def load_data():
    events = query_df("SELECT * FROM telemetry_events")
    deaths = query_df("SELECT * FROM death_heatmap")
    balance = query_df("SELECT * FROM game_balance")
    return events, deaths, balance

def difficulty_options(df_norm):
    opts = sorted([x for x in df_norm["difficulty"].dropna().unique().tolist()])
    return [{"label": d, "value": d} for d in (opts if opts else ["easy","medium","hard"])]

app.layout = html.Div([
    html.H2("📊 Telemetry Analytics Dashboard"),
    html.Div([
        html.Div([
            html.Label("Difficulty"),
            dcc.Dropdown(id="difficulty-dd", placeholder="All", clearable=True),
        ], style={"width": "250px", "display": "inline-block", "marginRight": "16px"}),

        html.Div([
            html.Label("Stage (Heatmap)"),
            dcc.Dropdown(id="stage-dd", placeholder="Select stage", clearable=False),
        ], style={"width": "250px", "display": "inline-block"}),
    ], style={"marginBottom": "16px"}),

    dcc.Tabs([
        dcc.Tab(label="Overview", children=[
            html.Div(id="kpi-row", style={"display": "flex", "gap": "12px", "marginTop": "12px"}),
            # dcc.Graph(id="spike-table"),
            # dcc.Graph(id="time-curve"),
        ]),
        dcc.Tab(label="Funnel", children=[
            dcc.Graph(id="funnel-graph"),
            # dcc.Graph(id="fail-drop-graph"),
        ]),
        dcc.Tab(label="Heatmap", children=[
            dcc.Graph(id="death-heatmap"),
        ]),
        dcc.Tab(label="(Sprint 2-1)", children=[
            dcc.Graph(id="balance-table"),
        ]),
        dcc.Tab(label="(Sprint 2-2)", children=[
            dcc.Graph(id="balance-table"),
        ]),
    ])
], style={"padding": "16px"})


@app.callback(
    Output("difficulty-dd", "options"),
    Output("stage-dd", "options"),
    Input("difficulty-dd", "value")
)
def init_dropdowns(_):
    events, deaths, _balance = load_data()
    df = normalize_events(events)

    diff_opts = difficulty_options(df)

    stages = sorted([int(s) for s in deaths["stage_number"].dropna().unique().tolist()]) if len(deaths) else list(range(1, 11))
    stage_opts = [{"label": f"Stage {s}", "value": s} for s in stages]
    return diff_opts, stage_opts


@app.callback(
    Output("kpi-row", "children"),
    Output("funnel-graph", "figure"),
    Output("fail-drop-graph", "figure"),
    Output("time-curve", "figure"),
    Output("spike-table", "figure"),
    Output("death-heatmap", "figure"),
    Output("balance-table", "figure"),
    Input("difficulty-dd", "value"),
    Input("stage-dd", "value"),
)
def update_dashboard(difficulty, stage_value):
    events, deaths, balance = load_data()
    df = normalize_events(events)

    # Funnel + Time
    funnel = funnel_by_stage(df, difficulty=difficulty)
    tdf = time_by_stage(df, difficulty=difficulty)
    spikes = spike_detection(funnel, tdf)

    # KPI
    total_starts = int(funnel["starts"].sum()) if len(funnel) else 0
    total_completes = int(funnel["completes"].sum()) if len(funnel) else 0
    completion_rate = (total_completes / total_starts) if total_starts else 0

    kpi = [
        html.Div([html.H4("Sessions (starts)"), html.H3(f"{total_starts}")], style={"padding":"12px","border":"1px solid #ddd","borderRadius":"10px"}),
        html.Div([html.H4("Completions"), html.H3(f"{total_completes}")], style={"padding":"12px","border":"1px solid #ddd","borderRadius":"10px"}),
        html.Div([html.H4("Completion Rate"), html.H3(f"{completion_rate:.2%}")], style={"padding":"12px","border":"1px solid #ddd","borderRadius":"10px"}),
        html.Div([html.H4("Spike Stages"), html.H3(f"{int(spikes['is_spike'].sum()) if len(spikes) else 0}")], style={"padding":"12px","border":"1px solid #ddd","borderRadius":"10px"}),
    ]

    # Funnel graph
    fig_funnel = px.bar(
        funnel, x="stage_id", y=["completes", "fails", "quits"],
        title="Stage Funnel Counts (complete/fail/quit)", barmode="stack"
    )

    fig_rates = px.line(
        funnel, x="stage_id", y=["completion_rate", "fail_rate", "dropoff_rate"],
        title="Stage Rates"
    )

    # Time curve
    fig_time = px.line(
        tdf, x="stage_id", y=["median_duration_ms", "p75_duration_ms", "p90_duration_ms"],
        title="Time-to-complete percentiles (ms)"
    )

    # Spike table (scatter)
    spikes_view = spikes.copy()
    spikes_view["spike_label"] = spikes_view["is_spike"].map({True: "SPIKE", False: "ok"})
    fig_spike = px.scatter(
        spikes_view, x="fail_rate", y="median_duration_ms", color="spike_label", hover_data=["stage_id"],
        title="Spike Detection (fail_rate vs median_duration_ms)"
    )

    # Death heatmap
    if stage_value is None:
        stage_value = int(deaths["stage_number"].dropna().iloc[0]) if len(deaths) else 1

    d = deaths[deaths["stage_number"] == stage_value].copy() if len(deaths) else pd.DataFrame(columns=["x_position","y_position"])
    if len(d):
        # 2D histogram heatmap
        fig_heat = px.density_heatmap(
            d, x="x_position", y="y_position", nbinsx=40, nbinsy=25,
            title=f"Death Heatmap (Stage {stage_value})"
        )
    else:
        fig_heat = px.scatter(title=f"Death Heatmap (Stage {stage_value}) - no data")

    # Balance table
    if len(balance):
        fig_balance = px.bar(balance, x="setting_name", y="setting_value", title="Game Balance Settings (Sprint 2)")
    else:
        fig_balance = px.scatter(title="Game Balance Settings - no data")

    return kpi, fig_funnel, fig_rates, fig_time, fig_spike, fig_heat, fig_balance


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8050)
