#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - PUBLISH your code changes to GitHub (OWNER ONLY)
#
#  Double-click this after a session of code changes. It packs up everything
#  you changed, asks for a short note, and sends it to GitHub. After that,
#  every other computer can get it by double-clicking "UPDATE FOR MAC".
#
#  Put this ONLY on the owner's computer. Other machines should never publish.
# ============================================================================
cd "$(dirname "$0")" || exit 1

popup() { osascript -e "display dialog \"$1\" buttons {\"OK\"} with icon $2" >/dev/null 2>&1; }

# Needs a real clone connected to GitHub.
if [ ! -d .git ]; then
  popup "This copy is not connected to GitHub, so it cannot publish. Use a copy made with git clone." stop
  exit 1
fi

# Anything to publish?
if [ -z "$(git status --porcelain)" ]; then
  popup "Nothing has changed since the last publish - there is nothing to send." note
  exit 0
fi

# Ask for a one-line description (becomes the commit message).
MSG="$(osascript -e 'set r to text returned of (display dialog "Describe what you changed (one short line):" default answer "" with title "Publish update to GitHub")' 2>/dev/null)"
if [ -z "$MSG" ]; then
  echo "Cancelled - nothing was published."
  exit 1
fi

echo ""
echo "  Packing up your changes..."
git add -A || { popup "Could not stage the changes. See the Terminal window." stop; exit 1; }
git commit -m "$MSG" || { popup "Could not save the commit. See the Terminal window." stop; exit 1; }

echo "  Sending to GitHub..."
if git push; then
  echo "  Published."
  popup "Published. Everyone else can now press UPDATE to get this version." note
else
  popup "Your changes were saved on this computer, but the send to GitHub failed. Check the internet and your GitHub sign-in, then run this again." stop
  exit 1
fi
