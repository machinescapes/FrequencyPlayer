#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

INSTALL_CMD=(npm ci)
START_CMD=(npm run dev)

run_verify() {
  npm run check
}

echo "==> Working directory: $PWD"
echo "==> Syncing dependencies"
"${INSTALL_CMD[@]}"

echo "==> Running baseline verification"
run_verify

echo "==> Startup command"
printf '    %q' "${START_CMD[@]}"
printf '\n'

if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  echo "==> Starting the app"
  exec "${START_CMD[@]}"
fi

echo "Set RUN_START_COMMAND=1 if you want init.sh to launch the app directly."
