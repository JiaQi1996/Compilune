#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$TASK_ROOT/apps/macos/scripts/build-app.sh" "$@"
