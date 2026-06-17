#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - UPDATE STYLES from the P drive (Mac)
#
#  Double-click to copy the NEWEST style backup from the P drive onto this
#  computer (the mapped styles + the fabric list). Use this on a freshly set-up
#  machine, or any machine that should match the latest styles someone mapped.
#
#  This updates DATA only. It does NOT change the program code - use
#  "UPDATE FOR MAC" for that. You must be connected to the P drive first.
# ============================================================================
cd "$(dirname "$0")" || exit 1

popup() { osascript -e "display dialog \"$1\" buttons {\"OK\"} with icon $2" >/dev/null 2>&1; }

NODE="node"
[ -x "./node/bin/node" ] && NODE="./node/bin/node"
if ! command -v "$NODE" >/dev/null 2>&1; then
  popup "Node is not set up yet on this computer. Double-click setup.command first, then try again." caution
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

# Confirm before overwriting local styles - this pulls the P drive's copy on top.
ANS="$(osascript -e "display dialog \"This will update this computer's styles and fabric list from the latest P-drive backup ($(basename "$LATEST")). Your program code is not affected. Continue?\" buttons {\"Cancel\",\"Update styles\"} default button \"Update styles\"" -e 'button returned of result' 2>/dev/null)"
if [ "$ANS" != "Update styles" ]; then
  echo "  Cancelled - nothing changed."
  exit 0
fi

echo ""
echo "  Copying the latest styles from the P drive..."
mkdir -p styles
# Overlay the backup's styles on top of local (adds/updates; never deletes others).
cp -R "$LATEST/styles/." styles/ || { popup "Could not copy the styles. Make sure the P drive is still connected, then try again." stop; exit 1; }

# Fabric list only - never touch this machine's local backup.json settings.
if [ -f "$LATEST/data/fabrics.json" ]; then
  mkdir -p data
  cp "$LATEST/data/fabrics.json" data/fabrics.json
fi

echo "  Done."
popup "Styles and fabric list updated from the P-drive backup: $(basename "$LATEST"). Refresh the app to see them." note
