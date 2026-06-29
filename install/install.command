#!/bin/bash
# ===========================================================================
#  Purnaa Cap Nesting - INSTALL (Mac)
#  Safe to run more than once. Installs Node user-locally (NO password),
#  uses Apple's Command Line Tools for Git, then gets the app and its
#  components. If anything fails it points to Max, not Ryan.
# ===========================================================================
set -u

APP_DIR="$HOME/purnaa-cap-nesting"
REPO_URL="https://github.com/Mfessler78/purnaa-cap-nesting.git"
NODE_VERSION="22.20.0"
TOOLS_DIR="$HOME/.purnaa-tools"
NODE_DIR="$TOOLS_DIR/node"

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

echo ""
echo "============================================================"
echo "  Purnaa Cap Nesting - INSTALL (Mac)"
echo "============================================================"
echo ""
echo "This sets up the app on this Mac. It is safe to run more"
echo "than once, and it will NOT ask for your password."
echo ""

# Make our user-local Node visible if it was installed on a previous run.
export PATH="$NODE_DIR/bin:$PATH"

# --- Git, via Apple's Command Line Tools ---------------------------------
# A fresh Mac ships a "git" stub that only triggers a pop-up; the real test
# is whether the Command Line Tools are actually installed.
if ! xcode-select -p >/dev/null 2>&1; then
  echo "The Apple developer tools (which include Git) are not"
  echo "installed yet. Asking macOS to install them now..."
  xcode-select --install >/dev/null 2>&1
  echo ""
  echo "------------------------------------------------------------"
  echo "  ACTION NEEDED - THEN RUN THIS AGAIN"
  echo "------------------------------------------------------------"
  echo "1. In the pop-up window that just appeared, click INSTALL"
  echo "   and wait for it to finish."
  echo "2. Then double-click install.command AGAIN to continue."
  echo ""
  read -n 1 -s -r -p "Press any key to close."
  echo ""
  exit 0
fi
echo "Developer tools (including Git) are installed."

# --- Node, installed just for this user (no admin) -----------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node $NODE_VERSION just for you (no password needed)..."
  ARCH="$(uname -m)"
  if [ "$ARCH" = "arm64" ]; then NODE_ARCH="arm64"; else NODE_ARCH="x64"; fi
  PKG="node-v$NODE_VERSION-darwin-$NODE_ARCH"
  URL="https://nodejs.org/dist/v$NODE_VERSION/$PKG.tar.gz"
  mkdir -p "$TOOLS_DIR" || fail
  echo "Downloading: $URL"
  curl -fL "$URL" -o "$TOOLS_DIR/node.tar.gz" || fail
  rm -rf "$TOOLS_DIR/$PKG" "$NODE_DIR"
  tar -xzf "$TOOLS_DIR/node.tar.gz" -C "$TOOLS_DIR" || fail
  mv "$TOOLS_DIR/$PKG" "$NODE_DIR" || fail
  rm -f "$TOOLS_DIR/node.tar.gz"
  export PATH="$NODE_DIR/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || fail
echo "Node is ready: $(node --version)"

# --- Get the code (clone first time, pull after) -------------------------
if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing copy..."
  git -C "$APP_DIR" pull || fail
else
  echo "Downloading the app..."
  git clone "$REPO_URL" "$APP_DIR" || fail
fi

# --- Install the app's components ----------------------------------------
echo "Installing app components (this can take a few minutes)..."
( cd "$APP_DIR" && npm install ) || fail

echo ""
echo "============================================================"
echo "  INSTALL COMPLETE"
echo "============================================================"
echo ""
echo "You can now start the app by double-clicking start.command"
echo ""
read -n 1 -s -r -p "Press any key to close."
echo ""
exit 0
