#!/bin/bash
# ===========================================================================
#  Purnaa Cap Nesting - START (Mac)
#  Builds the latest code and runs the office server on port 4173, then
#  opens the browser. Keep the window open while using the app.
# ===========================================================================
set -u

# Run the app folder THIS launcher belongs to (COMMAND CENTER lives inside the
# app). The owner's master copy is ~/Documents/purnaa-cap-nesting; end users get
# the clone at ~/purnaa-cap-nesting. Deriving the app folder from the launcher's
# own location runs whichever copy you double-clicked from — so the master Mac
# starts the copy that actually holds the styles, not a stray empty clone.
# Fall back to ~/purnaa-cap-nesting only when launched from outside an app folder
# (e.g. a first-time user running COMMAND CENTER from the Desktop before install).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANDIDATE="$(dirname "$SCRIPT_DIR")"
if [ -f "$CANDIDATE/package.json" ] && [ -d "$CANDIDATE/server" ]; then
  APP_DIR="$CANDIDATE"
else
  APP_DIR="$HOME/purnaa-cap-nesting"
fi
NODE_DIR="$HOME/.purnaa-tools/node"
URL="http://localhost:4173"

# Use our user-local Node (and any system Node) without needing setup.
export PATH="$NODE_DIR/bin:$PATH"

fail() {
  echo ""
  echo "------------------------------------------------------------"
  echo "  SOMETHING WENT WRONG"
  echo "------------------------------------------------------------"
  echo ""
  echo "Please take a PHOTO of this whole window and send it to Max."
  echo "Do NOT ask Ryan - this one is Max's to fix."
  echo ""
  read -n 1 -s -r -p "Press any key to close."
  echo ""
  exit 1
}

if [ ! -d "$APP_DIR/.git" ]; then
  echo "[PROBLEM] The app is not installed yet."
  echo "Please double-click install.command first."
  echo ""
  read -n 1 -s -r -p "Press any key to close."
  echo ""
  exit 1
fi

echo ""
echo "============================================================"
echo "  Purnaa Cap Nesting"
echo "============================================================"
echo ""
echo "Starting the app. The first start after an update takes a"
echo "little longer because it rebuilds."
echo ""
echo "  *** KEEP THIS WINDOW OPEN while you use the app.    ***"
echo "  *** Close it when you are finished to stop the app. ***"
echo ""

cd "$APP_DIR" || fail

# Build first so the server starts instantly afterwards.
echo "Preparing the app (rebuilding)..."
npm run build || fail

# Open the browser a few seconds after the server starts.
echo "Opening your browser at $URL ..."
( sleep 3; open "$URL" ) &

# Run the server (this is what keeps the window busy).
npm run serve || fail
exit 0
