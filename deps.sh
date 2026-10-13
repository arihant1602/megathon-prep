#!/usr/bin/env bash
# Restores dependencies removed on 2026-10-13 to free disk space.
set -euo pipefail
cd "$(dirname "$0")"

(cd . && npm ci)

# services/.venv: uv workspace
(cd services && uv sync --python 3.14)
