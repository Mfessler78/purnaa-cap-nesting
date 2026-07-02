#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - RETRIEVE NEW STYLES from the P drive (Mac)
#
#  Double-click to copy EVERY style found across all P-drive backups onto this
#  computer (the newest copy of each, + the fabric list). Use this on a freshly
#  set-up machine, or any machine that should have all styles anyone has mapped.
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

# EVERY snapshot, oldest -> newest. We do NOT trust the single newest snapshot:
# different machines back up their own subset of styles to the same P-drive
# parent, so the latest folder is just whoever backed up last (often one or two
# styles). Folder names are timestamps, so a plain sort is chronological.
SNAPS=()
while IFS= read -r d; do
  [ -d "$d/styles" ] && SNAPS+=("$d")
done < <(ls -1d "$DEST"/capnest-backup-* 2>/dev/null | sort)
if [ "${#SNAPS[@]}" -eq 0 ]; then
  popup "No style backups were found on the P drive yet. Back up styles from the host first (the app's 'Back up now' button)." caution
  exit 1
fi

# Confirm before pulling. This is a MERGE, newest copy of each style wins; nothing
# local is deleted, because no single snapshot is the full picture anymore.
ANS="$(osascript -e "display dialog \"This will pull EVERY style found across all ${#SNAPS[@]} P-drive backups onto this computer, using the newest copy of each. New styles are added and existing ones are updated; nothing is deleted. The fabric list is also updated. Your program code is not affected. Continue?\" buttons {\"Cancel\",\"Update styles\"} default button \"Update styles\"" -e 'button returned of result' 2>/dev/null)"
if [ "$ANS" != "Update styles" ]; then
  echo "  Cancelled - nothing changed."
  exit 0
fi

echo ""
echo "  Pulling styles from ${#SNAPS[@]} P-drive backup(s) (newest copy of each style wins)..."
mkdir -p styles
# Merge each snapshot's styles into local, oldest first so a newer snapshot's copy
# of a style overwrites an older one.
for snap in "${SNAPS[@]}"; do
  cp -R "$snap/styles/." styles/ || { popup "Could not copy the styles. Make sure the P drive is still connected, then try again." stop; exit 1; }
done

# Fabric list only (never touch this machine's local backup.json settings): take it
# from the newest snapshot that has one.
for ((i=${#SNAPS[@]}-1; i>=0; i--)); do
  if [ -f "${SNAPS[$i]}/data/fabrics.json" ]; then
    mkdir -p data
    cp "${SNAPS[$i]}/data/fabrics.json" data/fabrics.json
    break
  fi
done

echo "  Done."
popup "Styles and fabric list updated from ${#SNAPS[@]} P-drive backup(s). Refresh the app to see them." note
