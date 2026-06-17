#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - FULL program backup to the P drive (Mac)
#
#  Double-click to drop a dated .zip of the WHOLE program (code + your customer
#  data: styles, fabrics, artwork) onto the P-drive backup folder. The big
#  rebuildable folders (node_modules, node, dist) are left out to keep it small.
#
#  You must be connected to the office network / P drive first.
# ============================================================================
cd "$(dirname "$0")" || exit 1

popup() { osascript -e "display dialog \"$1\" buttons {\"OK\"} with icon $2" >/dev/null 2>&1; }

# Find Node so we can read the configured backup folder out of data/backup.json.
NODE="node"
[ -x "./node/bin/node" ] && NODE="./node/bin/node"
if ! command -v "$NODE" >/dev/null 2>&1; then
  popup "Node is not set up yet on this computer. Double-click setup.command first, then try again." caution
  exit 1
fi

# The backup folder is whatever was set in the app's bottom bar (the P drive).
DEST="$("$NODE" -e 'try{process.stdout.write((JSON.parse(require("fs").readFileSync("data/backup.json","utf8")).path)||"")}catch(e){}' 2>/dev/null)"
if [ -z "$DEST" ]; then
  popup "No backup folder is set yet. Open the app and set the Backup folder (bottom bar) to the P drive, then try again." caution
  exit 1
fi

# Reachable? If the P drive folder isn't there, they're almost certainly off the network.
if [ ! -d "$DEST" ]; then
  popup "Can't reach the P-drive backup folder ($DEST). You are probably not connected to the office network / P drive. Connect, then try again." stop
  exit 1
fi

STAMP="$(date +%Y-%m-%d-%H%M)"
ZIP="$DEST/capnest-FULL-program-$STAMP.zip"

echo ""
echo "  Zipping the whole program to the P drive (this can take a minute)..."
if zip -r -q "$ZIP" . -x 'node_modules/*' -x 'node/*' -x 'dist/*' -x '.DS_Store' -x '*/.DS_Store'; then
  echo "  Saved: $ZIP"
  popup "Full program backup saved to the P drive: capnest-FULL-program-$STAMP.zip" note
else
  popup "The backup zip failed. Make sure the P drive is still connected and has free space, then try again." stop
  exit 1
fi
