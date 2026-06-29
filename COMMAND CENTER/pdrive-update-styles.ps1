# Retrieve new styles from the latest P-drive backup (Windows).
# Called by "Retrieve New Styles from P Drive.bat". Updates DATA only, not program code.
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
  if (-not (Ask-Continue "This will make this computer's styles match the latest P-drive backup ($($latest.Name)) exactly: new and renamed styles are added, and any local style NOT in that backup is removed. The fabric list is also updated. Your program code is not affected. Continue?")) {
    Write-Host '  Cancelled - nothing changed.'; exit 0
  }
  Write-Host '  Updating styles from the P drive (mirroring the latest backup)...'
  if (-not (Test-Path 'styles')) { New-Item -ItemType Directory -Path 'styles' | Out-Null }
  $backupStyles = Join-Path $latest.FullName 'styles'
  # 1. Remove local style folders NOT in the latest backup. The backup is a full copy
  #    of the host, so a folder missing from it was deleted or renamed on the host;
  #    dropping it here keeps local an exact mirror (no stale or duplicate styles).
  Get-ChildItem -Path 'styles' -Directory | ForEach-Object {
    if (-not (Test-Path (Join-Path $backupStyles $_.Name))) {
      Remove-Item -Path $_.FullName -Recurse -Force
      Write-Host ("  removed (not in backup): " + $_.Name)
    }
  }
  # 2. Copy every style from the latest backup on top of local (adds new, updates changed).
  Copy-Item -Path (Join-Path $backupStyles '*') -Destination 'styles' -Recurse -Force
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
