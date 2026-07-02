# Retrieve every style found across all P-drive backups (Windows), newest copy wins.
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
  # EVERY snapshot, oldest -> newest. We do NOT trust the single newest snapshot:
  # different machines back up their own subset of styles to the same P-drive
  # parent, so the latest folder is just whoever backed up last (often one or two
  # styles). Folder names are timestamps, so a name sort is chronological.
  $snaps = @(Get-ChildItem -Path $dest -Directory -Filter 'capnest-backup-*' |
    Where-Object { Test-Path (Join-Path $_.FullName 'styles') } |
    Sort-Object Name)
  if ($snaps.Count -eq 0) {
    Show-Msg 'No style backups were found on the P drive yet. Back up styles from the host first (the app''s "Back up now" button).' 48; exit 1
  }
  if (-not (Ask-Continue "This will pull EVERY style found across all $($snaps.Count) P-drive backups onto this computer, using the newest copy of each. New styles are added and existing ones are updated; nothing is deleted. The fabric list is also updated. Your program code is not affected. Continue?")) {
    Write-Host '  Cancelled - nothing changed.'; exit 0
  }
  Write-Host "  Pulling styles from $($snaps.Count) P-drive backup(s) (newest copy of each style wins)..."
  if (-not (Test-Path 'styles')) { New-Item -ItemType Directory -Path 'styles' | Out-Null }
  # Merge each snapshot's styles into local, oldest first so a newer snapshot's
  # copy of a style overwrites an older one. robocopy (built into Windows) is used
  # instead of Copy-Item because it retries and size-verifies over a network drive,
  # so it won't leave a half-written PDF behind - a truncated PDF is what surfaces
  # in the app as "Invalid Root reference". robocopy exit codes 0-7 are success.
  foreach ($snap in $snaps) {
    $src = Join-Path $snap.FullName 'styles'
    robocopy $src 'styles' /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Could not copy styles from $($snap.Name) (robocopy code $LASTEXITCODE). Make sure the P drive is still connected." }
  }
  # Fabric list only (never touch this machine's local backup.json settings): take
  # it from the newest snapshot that has one.
  for ($i = $snaps.Count - 1; $i -ge 0; $i--) {
    $fab = Join-Path $snaps[$i].FullName 'data\fabrics.json'
    if (Test-Path $fab) {
      if (-not (Test-Path 'data')) { New-Item -ItemType Directory -Path 'data' | Out-Null }
      Copy-Item -Path $fab -Destination 'data\fabrics.json' -Force
      break
    }
  }
  Show-Msg "Styles and fabric list updated from $($snaps.Count) P-drive backup(s). Refresh the app to see them." 64
} catch {
  Show-Msg ("Update styles failed: " + $_.Exception.Message) 16
  exit 1
}
