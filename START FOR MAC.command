#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - start / restart the app (Mac, SECONDARY)
#
#  Windows is the real office host; this Mac launcher exists so the host OS
#  isn't locked in. Double-click to start. Double-click again to restart - it
#  frees the port and starts fresh. Leave the Terminal window open while in use.
# ============================================================================
cd "$(dirname "$0")" || exit 1
export PORT=4173

# 1. Free the port: kill any instance already running, so this acts as a reset.
lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null

# 2-3. Find Node (bundled copy first, then a system install) and make sure the
# app is built. If either is missing, this computer just needs first-time setup.
NODE_EXE=""
if [ -x "./node/bin/node" ]; then
  NODE_EXE="./node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_EXE="$(command -v node)"
fi
if [ -z "$NODE_EXE" ] || [ ! -f "dist/index.html" ]; then
  osascript -e 'display dialog "First-time setup is needed on this computer.

Close this, then double-click  setup.command  - it downloads everything and sets up automatically (needs the internet once). When it finishes, open this again." buttons {"OK"} with icon caution' >/dev/null 2>&1
  exit 1
fi

# 4. Open the browser to the app on this computer.
open "http://localhost:${PORT}"

# 5. Run the server (blocks here while the app is healthy).
"$NODE_EXE" server/serve.js
