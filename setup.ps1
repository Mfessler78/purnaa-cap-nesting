# ============================================================================
#  Purnaa Cap Nesting - first-time setup (Windows)
#
#  Run via setup.bat. Downloads a PRIVATE copy of Node into this folder (.\node)
#  and builds the app. Needs the internet once. Nothing is installed system-wide
#  and nothing needs admin rights.
# ============================================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# The Node version bundled into the folder. Pinned so setup is repeatable.
$NodeVersion = 'v22.22.3'   # >= 22.13.0 required by pdfjs-dist@6.0.227

Write-Host ''
Write-Host '  Purnaa Cap Nesting - first-time setup'
Write-Host '  Downloads a private copy of Node into this folder and builds the app.'
Write-Host '  (Needs the internet once. Nothing is installed system-wide.)'
Write-Host ''

switch ($env:PROCESSOR_ARCHITECTURE) {
  'ARM64' { $arch = 'arm64' }
  default { $arch = 'x64' }
}

$haveVer = ''
if (Test-Path 'node\node.exe') { try { $haveVer = (& (Join-Path $PWD 'node\node.exe') --version).Trim() } catch {} }
if ($haveVer -eq $NodeVersion) {
  Write-Host "  Portable Node $NodeVersion is already here - skipping download."
} else {
  if (Test-Path 'node') {
    Write-Host "  Replacing portable Node ('$haveVer') with $NodeVersion ..."
    Remove-Item 'node' -Recurse -Force
  }
  $pkg = "node-$NodeVersion-win-$arch"
  $url = "https://nodejs.org/dist/$NodeVersion/$pkg.zip"
  $zip = Join-Path $env:TEMP "$pkg.zip"
  Write-Host "  Downloading Node $NodeVersion for win-$arch ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip
  } catch {
    Write-Host ''
    Write-Host "  Could not download Node from: $url"
    Write-Host '  Check the internet connection, or download that .zip by hand, unzip it,'
    Write-Host "  and put its contents in a folder named 'node' here (so node\node.exe exists)."
    exit 1
  }
  $tmp = Join-Path $env:TEMP 'capnest-node-extract'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp
  # The zip extracts to a node-<ver>-win-<arch> folder; move its contents to .\node
  New-Item -ItemType Directory -Force -Path 'node' | Out-Null
  Copy-Item -Path (Join-Path $tmp "$pkg\*") -Destination 'node' -Recurse -Force
  Remove-Item $zip -Force
  Remove-Item $tmp -Recurse -Force
  Write-Host '  Node is ready in .\node'
}

$npm = Join-Path $PWD 'node\npm.cmd'
# Put the portable Node on PATH so npm lifecycle scripts (e.g. esbuild's
# install.js, run as `node install.js`) can find node.exe. $PWD is the script
# folder, so this is relative to wherever the folder was copied - nothing hardcoded.
$env:Path = "$PWD\node;" + $env:Path
# A folder-copy backup can carry a node_modules built on the Mac dev machine,
# whose native binaries won't run on Windows. `npm ci` wipes node_modules and
# installs exactly from the committed package-lock.json - correct Windows builds.
Write-Host '  Installing the app building blocks (this can take a few minutes) ...'
& $npm ci
if ($LASTEXITCODE -ne 0) { Write-Host '  npm install failed - see the messages above.'; exit 1 }
Write-Host '  Building the app ...'
& $npm run build
if ($LASTEXITCODE -ne 0) { Write-Host '  Build failed - see the messages above.'; exit 1 }

Write-Host ''
Write-Host '  Setup complete. Double-click "START FOR WINDOWS.bat" to run the app.'
Write-Host ''
