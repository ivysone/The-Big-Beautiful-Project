# The Big Beautiful Project

A 2D action-platformer prototype built with **Phaser**, paired with a **telemetry analytics dashboard** and a **combat balancing toolkit** to support data-driven game design decisions.

This project explores how **live gameplay data** can be captured, visualized, and used to iterate on difficulty, pacing, and player experience.

Hosted on: https://the-big-beautiful-project.fly.dev/intro

## Local Deployment Guide

This guide walks you through running **The Big Beautiful Project** locally:  
the **game**, **telemetry backend**, and **analytics dashboard**.

### Clone the Repo
``` 
git clone https://github.com/ivysone/The-Big-Beautiful-Project.git
cd The-Big-Beautiful-Project
```

### Install Dependencies
``` 
pip install -r requirements.txt
```

### Run the project
From the project root:
``` 
uvicorn app.main:app --reload --port 8000
```
This starts:

Frontend Game:
http://localhost:8000/intro

Dashboard:
http://localhost:8000/admin/



## Project Goals

- Build a playable combat-focused platformer prototype  
- Capture meaningful gameplay telemetry in real time  
- Visualize player behavior, difficulty spikes, and failure causes  
- Prototype a balancing toolkit to simulate tuning changes before shipping  
- Demonstrate a **data-informed game design workflow**

## Game Overview

- **Genre:** 2D Action Platformer  
- **Engine:** Phaser

## Telemetry System

Gameplay events are sent from the game client to a backend API and stored for analysis.

### Captured Events
- `stage_start`
- `stage_complete`
- `fail`
- `retry`
- `death` (cause + position)
- `player_hit` (damage + enemy type)
- `enemy_kill`
- `heal_pickup`
- `parry_success`

## Analytics Dashboard

The admin dashboard is built using **Python, Dash, and Plotly**.

### Key Views
- **Funnel Analysis** 
- **Completion & Fail Rates by Stage**
- **Time-to-Complete Percentiles**
- **Death Heatmaps**
- **Combat & Healing Summary**
- **Death Causes**
- **Enemy Impact Analysis**

This allows designers to quickly identify difficulty spikes, unfair encounters, and pacing issues.

## Balancing Toolkit

A simulation-based tool that predicts the impact of combat tuning changes **before applying them in-game**.

### Adjustable Parameters
- Enemy health multiplier
- Enemy damage multiplier
- Player damage multiplier

### Predicted Outcomes
- Completion rate
- Fail chance per attempt
- Average retries per run
- Median run time
- Failure distribution

### Toolkit Features
- Baseline vs proposed comparisons
- Rule-based design suggestions
- Decision logging with rationale
- Calibrated using real player telemetry

## Tech Stack

### Game
- Phaser
- JavaScript
- HTML & CSS

### Backend & Dashboard
- Python
- FastAPI
- Dash
- Plotly
- Pandas
- SQLite / CSV storage

### Deployment
- Local development
- Hosted backend & dashboard (Fly.io)

## Contributions
- Game Development (Darsshan, Raghd)
- Backend/Dashboard (Kim, Darsshan)
- Frontend Views (Katherine, Ivy, Kyra)
- Testing (Alex, Nicole)

