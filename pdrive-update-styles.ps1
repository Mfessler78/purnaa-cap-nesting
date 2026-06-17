# Update styles from the latest P-drive backup (Windows).
# Called by "UPDATE STYLES FOR WINDOWS.bat". Updates DATA only, not program code.
$ErrorActionPreference = 'Stop'
function Show-Msg($text, $icon) {
  (New-Object -ComObject Wscript.Shell).Popup($text, 0, 'Purnaa Cap Nesting - Update styles', $icon) | Out-Null
}
function Ask-Continue($text) {
  # 1 = OK/Cancel buttons + 48 = exclamation icon; returns 1 for OK, 2 for Cancel.
  return ((New-Object -ComObject Wscript.Shell).Popup($text, 0, 'Purnaa Cap Nesting - Update styles', 49) -eq 1)
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
  # Newest snapshot wins - folder names are timestamps, so a name sort works.
  $latest = Get-ChildItem -Path $dest -Directory -Filter 'capnest-backup-*' | Sort-Object Name | Select-Object -Last 1
  if (-not $latest -or -not (Test-Path (Join-Path $latest.FullName 'styles'))) {
    Show-Msg 'No style backups were found on the P drive yet. Back up styles from the host first (the app''s "Back up now" button).' 48; exit 1
  }
  if (-not (Ask-Continue "This will update this computer's styles and fabric list from the latest P-drive backup ($($latest.Name)). Your program code is not affected. Continue?")) {
    Write-Host '  Cancelled - nothing changed.'; exit 0
  }
  Write-Host '  Copying the latest styles from the P drive...'
  if (-not (Test-Path 'styles')) { New-Item -ItemType Directory -Path 'styles' | Out-Null }
  # Overlay the backup's styles on top of local (adds/updates; never deletes others).
  Copy-Item -Path (Join-Path $latest.FullName 'styles\*') -Destination 'styles' -Recurse -Force
  # Fabric list only - never touch this machine's local backup.json settings.
  $fab = Join-Path $latest.FullName 'data\fabrics.json'
  if (Test-Path $fab) {
    if (-not (Test-Path 'data')) { New-Item -ItemType Directory -Path 'data' | Out-Null }
    Copy-Item -Path $fab -Destination 'data\fabrics.json' -Force
  }
  Show-Msg "Styles and fabric list updated from the P-drive backup: $($latest.Name). Refresh the app to see them." 64
} catch {
  Show-Msg ("Update styles failed: " + $_.Exception.Message) 16
  exit 1
}
