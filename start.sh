#!/usr/bin/env bash
set -e

export DB_PATH=${DB_PATH:-/data/real_game.db}

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
