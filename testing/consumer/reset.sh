#!/usr/bin/env bash
# Empties the consumer project before each demo run: deletes every pasted file
# and recreates an empty Python virtual environment in .venv.
# Runs in bash, including Git Bash on Windows.
#
#   testing/consumer/reset.sh        (from anywhere)
set -euo pipefail

cd "$(dirname "$0")"

# Everything except the two tracked files goes: pasted .py files, __pycache__, the old .venv.
find . -mindepth 1 -maxdepth 1 ! -name README.md ! -name reset.sh -exec rm -rf {} +

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
  python=python3
else
  python=python
fi
"$python" -m venv .venv

echo "testing/consumer is empty, with a fresh .venv ($("$python" --version))."
