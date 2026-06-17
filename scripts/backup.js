// Dead-simple backup of everything that can't be rebuilt: the mapped styles
// and the fabric table. Everything else (code, dist/) comes back with a fresh
// install, but styles/ and data/ are hand-made on this one machine — if the
// disk dies, they die with it. This makes one timestamped copy you can carry to
// the NAS / USB.
//
// Usage:
//   npm run backup                  -> writes ./backups/backup-YYYY-MM-DD-HHMM/
//   npm run backup -- "D:\\path"    -> writes the timestamped copy under D:\path
//                                      (e.g. a mapped NAS drive) instead
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Anchor to the app folder, same as the server, so it backs up THIS install's
// store no matter what directory the command is run from.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SOURCES = ['styles', 'data']

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

async function main() {
  // Optional first argument: where to put the backup (e.g. a NAS folder).
  // Defaults to ./backups/ next to the app.
  const destParent = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(APP_ROOT, 'backups')

  const dest = path.join(destParent, `backup-${stamp()}`)
  await fsp.mkdir(dest, { recursive: true })

  let copiedAnything = false
  for (const name of SOURCES) {
    const from = path.join(APP_ROOT, name)
    if (!fs.existsSync(from)) {
      console.log(`  (skipped ${name}/ — nothing there yet)`)
      continue
    }
    await fsp.cp(from, path.join(dest, name), { recursive: true })
    copiedAnything = true
    console.log(`  copied ${name}/`)
  }

  if (!copiedAnything) {
    console.log('\n  Nothing to back up yet (no styles or fabrics saved).\n')
    return
  }

  console.log(`\n  Backup saved to:\n    ${dest}\n`)
  console.log('  Next: copy that whole folder to the office NAS (or a USB stick).')
  console.log('  To restore later, copy the styles/ and data/ folders from a')
  console.log('  backup back into the app folder, replacing what is there.\n')
}

main().catch((err) => {
  console.error('\n  Backup failed:', err.message, '\n')
  process.exit(1)
})
