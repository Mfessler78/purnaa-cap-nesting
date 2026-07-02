#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - RETRIEVE STYLES from the P drive (Mac)
#
#  Double-click to bring this computer's styles into line with the shared set on
#  the P drive: new styles are added, changed ones updated, unchanged ones
#  skipped (fast), and styles that were deleted/renamed on the shared set are
#  removed here too (a named warning prints for each; every removal stays
#  recoverable from the sync folder's backups/). The live progress prints in this
#  window.
#
#  This updates DATA only. It does NOT change the program code - use
#  "update.command" for that. You must be connected to the P drive first.
#
#  All the real work is in scripts/pdrive-retrieve.js so Mac and Windows run the
#  exact same logic. This launcher just finds the app + Node and runs it.
# ============================================================================
set -u

# Operate on the app folder THIS launcher belongs to (COMMAND CENTER lives inside
# the app), the same way start.command does, so we read the SAME data/backup.json
# the running app wrote. Fall back to ~/purnaa-cap-nesting only when launched from
# outside an app folder (e.g. first-time setup run from the Desktop).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANDIDATE="$(dirname "$SCRIPT_DIR")"
if [ -f "$CANDIDATE/package.json" ] && [ -d "$CANDIDATE/server" ]; then
  APP_DIR="$CANDIDATE"
else
  APP_DIR="$HOME/purnaa-cap-nesting"
fi
NODE_DIR="$HOME/.purnaa-tools/node"
export PATH="$NODE_DIR/bin:$PATH"

popup() { osascript -e "display dialog \"$1\" buttons {\"OK\"} with icon $2" >/dev/null 2>&1; }

if [ ! -d "$APP_DIR/.git" ]; then
  popup "The app is not installed yet on this computer. Double-click install.command first, then try again." caution
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  popup "Node is not set up yet on this computer. Double-click install.command first, then try again." caution
  exit 1
fi

cd "$APP_DIR" || exit 1
node "scripts/pdrive-retrieve.js"
STATUS=$?

echo ""
read -n 1 -s -r -p "Press any key to close."
echo ""
exit $STATUS
