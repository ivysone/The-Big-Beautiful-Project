#!/usr/bin/env bash
set -e

export DB_PATH=${DB_PATH:-/data/game.db}

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
