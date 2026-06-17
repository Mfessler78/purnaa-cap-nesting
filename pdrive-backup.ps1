# Full program backup to the P drive (Windows). Called by "BACKUP TO P DRIVE FOR WINDOWS.bat".
$ErrorActionPreference = 'Stop'
function Show-Msg($text, $icon) {
  (New-Object -ComObject Wscript.Shell).Popup($text, 0, 'Purnaa Cap Nesting - Backup', $icon) | Out-Null
}
try {
  if (-not (Test-Path 'data\backup.json')) {
    Show-Msg 'No backup folder is set yet. Open the app and set the Backup folder (bottom bar) to the P drive, then try again.' 48; exit 1
  }
  $dest = (Get-Content 'data\backup.json' -Raw | ConvertFrom-Json).path
  if ([string]::IsNullOrWhiteSpace($dest)) {
    Show-Msg 'No backup folder is set yet. Open the app and set the Backup folder (bottom bar) to the P drive, then try again.' 48; exit 1
  }
  if (-not (Test-Path $dest)) {
    Show-Msg "Can't reach the P-drive backup folder ($dest). You are probably not connected to the office network / P drive. Connect, then try again." 16; exit 1
  }
  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
  $zip = Join-Path $dest ("capnest-FULL-program-$stamp.zip")
  Write-Host "  Zipping the whole program to the P drive (this can take a minute)..."
  # Keep code + data + .git; leave out the big rebuildable folders.
  $items = Get-ChildItem -Force | Where-Object { $_.Name -notin @('node_modules','node','dist') }
  Compress-Archive -Path $items.FullName -DestinationPath $zip -Force
  Show-Msg "Full program backup saved to the P drive: capnest-FULL-program-$stamp.zip" 64
} catch {
  Show-Msg ("Backup failed: " + $_.Exception.Message) 16
  exit 1
}
