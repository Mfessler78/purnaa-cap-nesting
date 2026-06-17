#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - UPDATE this computer to the newest version (Mac)
#
#  Double-click this any time the owner has published a new version. It pulls
#  the newest CODE from GitHub and rebuilds the app. Your local data (fabrics,
#  mapped styles) is kept - only the program code is updated. When it finishes,
#  double-click "START FOR MAC.command" to run the newest version.
# ============================================================================
cd "$(dirname "$0")" || exit 1

popup() { osascript -e "display dialog \"$1\" buttons {\"OK\"} with icon $2" >/dev/null 2>&1; }

# This only works on a copy made with `git clone` (a plain folder copy can't update).
if [ ! -d .git ]; then
  popup "This copy is not connected to GitHub, so it cannot update. Reinstall it with git clone (ask the owner for the steps)." stop
  exit 1
fi

# Find Node: the private bundled copy first, then a system install.
if [ -x "./node/bin/node" ]; then
  export PATH="$PWD/node/bin:$PATH"
elif ! command -v node >/dev/null 2>&1; then
  popup "Node is not set up yet on this computer. Double-click setup.command first, then try again." caution
  exit 1
fi

echo ""
echo "  Getting the newest version from GitHub..."
BEFORE_LOCK="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"

# --ff-only: only accept a clean fast-forward (no surprise merges).
# --autostash: tuck away this computer's local data edits, update, then put
#              them back - so using the app here never blocks an update.
if ! git pull --ff-only --autostash; then
  popup "Could not download the update. Check the internet and your GitHub sign-in. If it mentions a conflict with local changes, tell the owner before doing anything else." stop
  exit 1
fi

AFTER_LOCK="$(shasum package-lock.json 2>/dev/null | awk '{print $1}')"

# Only reinstall the building blocks if the dependency list actually changed -
# otherwise skip it so updates are fast.
if [ "$BEFORE_LOCK" != "$AFTER_LOCK" ]; then
  echo "  The parts list changed - reinstalling building blocks (a few minutes)..."
  if ! npm ci; then
    popup "The update downloaded but installing the new parts failed. Try setup.command, then start the app again." stop
    exit 1
  fi
fi

echo "  Rebuilding the app..."
if ! npm run build; then
  popup "The update downloaded but the rebuild failed. Try setup.command, then start the app again." stop
  exit 1
fi

echo ""
echo "  Update complete."
popup "Update complete. Now double-click START FOR MAC to run the newest version." note
