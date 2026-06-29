#!/bin/bash
# ===========================================================================
#  Purnaa Cap Nesting - UPDATE (Mac)
#  Pulls the latest code from GitHub. Only reinstalls components if the
#  package-lock.json actually changed. This is a deliberate, separate step;
#  starting the app never updates on its own.
# ===========================================================================
set -u

APP_DIR="$HOME/purnaa-cap-nesting"
NODE_DIR="$HOME/.purnaa-tools/node"

export PATH="$NODE_DIR/bin:$PATH"

fail() {
  echo ""
  echo "------------------------------------------------------------"
  echo "  UPDATE DID NOT FINISH"
  echo "------------------------------------------------------------"
  echo ""
  echo "First, try running install.command again - it usually fixes this."
  echo "If it still fails, take a PHOTO of this whole window and send"
  echo "it to Max. Do NOT ask Ryan - this one is Max's to fix."
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

cd "$APP_DIR" || fail

echo ""
echo "============================================================"
echo "  Purnaa Cap Nesting - UPDATE"
echo "============================================================"
echo ""

# Hash the lock file before and after pulling to decide if components changed.
BEFORE="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"

echo "Getting the latest version..."
git pull || fail

AFTER="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"

if [ "$BEFORE" != "$AFTER" ]; then
  echo "Components changed - updating them..."
  npm install || fail
else
  echo "Components unchanged - nothing else to install."
fi

echo ""
echo "============================================================"
echo "  UPDATE COMPLETE"
echo "============================================================"
echo ""
echo "Start the app as usual by double-clicking start.command"
echo ""
read -n 1 -s -r -p "Press any key to close."
echo ""
exit 0
