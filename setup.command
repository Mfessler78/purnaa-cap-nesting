#!/bin/bash
# ============================================================================
#  Purnaa Cap Nesting - first-time setup (Mac / Linux)
#
#  Double-click this once on a new computer. It downloads a PRIVATE copy of
#  Node into this folder (./node) and builds the app. Needs the internet once.
#  Nothing is installed system-wide and nothing needs admin rights.
#
#  After it finishes, double-click  "START FOR MAC.command"  to run the app.
# ============================================================================
cd "$(dirname "$0")" || exit 1

# The Node version bundled into the folder. Pinned so setup is repeatable; edit
# here if you ever need a different one.
NODE_VERSION="v22.22.3"   # >= 22.13.0 required by pdfjs-dist@6.0.227

echo ""
echo "  Purnaa Cap Nesting - first-time setup"
echo "  Downloads a private copy of Node into this folder and builds the app."
echo "  (Needs the internet once. Nothing is installed system-wide.)"
echo ""

case "$(uname -s)" in
  Darwin) PLAT="darwin"; EXT="tar.gz" ;;
  Linux)  PLAT="linux";  EXT="tar.xz" ;;
  *) echo "  Unsupported OS. On Windows, double-click setup.bat instead."; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) NARCH="arm64" ;;
  x86_64|amd64)  NARCH="x64" ;;
  *) echo "  Unsupported processor type: $(uname -m)"; exit 1 ;;
esac

HAVE_VER=""
[ -x "node/bin/node" ] && HAVE_VER="$(node/bin/node --version 2>/dev/null)"
if [ "$HAVE_VER" = "$NODE_VERSION" ]; then
  echo "  Portable Node $NODE_VERSION is already here - skipping download."
else
  if [ -d node ]; then
    echo "  Replacing portable Node ('$HAVE_VER') with $NODE_VERSION ..."
    rm -rf node
  fi
  PKG="node-${NODE_VERSION}-${PLAT}-${NARCH}"
  URL="https://nodejs.org/dist/${NODE_VERSION}/${PKG}.${EXT}"
  echo "  Downloading Node ${NODE_VERSION} for ${PLAT}-${NARCH}..."
  TMP="$(mktemp -d)"
  if ! curl -fL "$URL" -o "$TMP/node.${EXT}"; then
    echo ""
    echo "  Could not download Node from:"
    echo "    $URL"
    echo "  Check the internet connection, or download that file by hand, unzip it,"
    echo "  and put its contents in a folder named 'node' here (so node/bin/node exists)."
    rm -rf "$TMP"
    exit 1
  fi
  mkdir -p node
  tar -xf "$TMP/node.${EXT}" -C node --strip-components=1
  rm -rf "$TMP"
  echo "  Node is ready in ./node"
fi

# Use the bundled Node for the rest of setup.
export PATH="$PWD/node/bin:$PATH"

# `npm ci` wipes node_modules and installs exactly from the committed
# package-lock.json, so a copied-in node_modules built for another OS is replaced
# with correct binaries for this machine.
echo "  Installing the app's building blocks (this can take a few minutes)..."
if ! npm ci; then echo "  npm install failed - see the messages above."; exit 1; fi

echo "  Building the app..."
if ! npm run build; then echo "  Build failed - see the messages above."; exit 1; fi

echo ""
echo "  Setup complete. Double-click  \"START FOR MAC.command\"  to run the app."
echo ""
