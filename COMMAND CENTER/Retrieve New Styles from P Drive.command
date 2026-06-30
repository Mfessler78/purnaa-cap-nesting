#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - RETRIEVE NEW STYLES from the P drive (Mac)
#
#  Double-click to copy the NEWEST style backup from the P drive onto this
#  computer (the mapped styles + the fabric list). Use this on a freshly set-up
#  machine, or any machine that should match the latest styles someone mapped.
#
#  This updates DATA only. It does NOT change the program code - use
#  "update.command" for that. You must be connected to the P drive first.
# ============================================================================
set -u

# Operate on the app folder THIS launcher belongs to (COMMAND CENTER lives
# inside the app), the same way start.command does. This matters because we read
# the backup folder from data/backup.json: the running app writes it next to its
# own copy, so retrieving must read the SAME copy or it sees "not set" on a stray
# clone. Fall back to ~/purnaa-cap-nesting only when launched from outside an app
# folder (e.g. first-time setup run from the Desktop).
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
cd "$APP_DIR" || exit 1

NODE="node"
if ! command -v "$NODE" >/dev/null 2>&1; then
  popup "Node is not set up yet on this computer. Double-click install.command first, then try again." caution
  exit 1
fi

DEST="$("$NODE" -e 'try{process.stdout.write((JSON.parse(require("fs").readFileSync("data/backup.json","utf8")).path)||"")}catch(e){}' 2>/dev/null)"
if [ -z "$DEST" ]; then
  popup "No backup folder is set yet. Open the app and set the Backup folder (bottom bar) to the P drive, then try again." caution
  exit 1
fi
if [ ! -d "$DEST" ]; then
  popup "Can't reach the P-drive backup folder ($DEST). You are probably not connected to the office network / P drive. Connect, then try again." stop
  exit 1
fi

# Newest snapshot wins: the folder names are timestamps, so a plain sort works.
LATEST="$(ls -1d "$DEST"/capnest-backup-* 2>/dev/null | sort | tail -1)"
if [ -z "$LATEST" ] || [ ! -d "$LATEST/styles" ]; then
  popup "No style backups were found on the P drive yet. Back up styles from the host first (the app's 'Back up now' button)." caution
  exit 1
fi

# Confirm before mirroring - this makes local styles MATCH the backup exactly:
# new/renamed styles come in, and styles not in the backup are removed locally.
ANS="$(osascript -e "display dialog \"This will make this computer's styles match the latest P-drive backup ($(basename "$LATEST")) exactly: new and renamed styles are added, and any local style NOT in that backup is removed. The fabric list is also updated. Your program code is not affected. Continue?\" buttons {\"Cancel\",\"Update styles\"} default button \"Update styles\"" -e 'button returned of result' 2>/dev/null)"
if [ "$ANS" != "Update styles" ]; then
  echo "  Cancelled - nothing changed."
  exit 0
fi

echo ""
echo "  Updating styles from the P drive (mirroring the latest backup)..."
mkdir -p styles
# 1. Remove local style folders NOT in the latest backup. The backup is a full copy
#    of the host, so a folder missing from it was deleted or renamed on the host;
#    dropping it here keeps local an exact mirror (no stale or duplicate styles).
for local in styles/*/; do
  [ -d "$local" ] || continue
  name="$(basename "$local")"
  if [ ! -e "$LATEST/styles/$name" ]; then
    rm -rf "$local"
    echo "  removed (not in backup): $name"
  fi
done
# 2. Copy every style from the latest backup on top of local (adds new, updates changed).
cp -R "$LATEST/styles/." styles/ || { popup "Could not copy the styles. Make sure the P drive is still connected, then try again." stop; exit 1; }

# Fabric list only - never touch this machine's local backup.json settings.
if [ -f "$LATEST/data/fabrics.json" ]; then
  mkdir -p data
  cp "$LATEST/data/fabrics.json" data/fabrics.json
fi

echo "  Done."
popup "Styles and fabric list updated from the P-drive backup: $(basename "$LATEST"). Refresh the app to see them." note
