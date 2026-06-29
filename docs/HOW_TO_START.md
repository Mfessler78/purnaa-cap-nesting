# How to start Purnaa Cap Nesting (office computer)

This is the plain-language guide for running the app on the office computer (the
"host") so everyone on the office network can use it. No internet, no accounts —
it all stays on your local network. The app runs on **one** computer (the host);
everyone else just opens it in a web browser.

> **Every launcher lives in the `COMMAND CENTER` folder.** That one folder holds
> `install`, `start`, `update`, and `Retrieve New Styles from P Drive` (each as a
> `.bat` for Windows and a `.command` for Mac). The shortest version of this guide
> is `COMMAND CENTER/SETUP-CARD.md`.

---

## Every day: start the app

1. Go to the host computer (the one that runs the app).
2. Open the **`COMMAND CENTER`** folder and double-click **`start.bat`**
   (Windows) or **`start.command`** (Mac).
3. A web browser opens to the app. A small **"Purnaa Cap Nesting"** item appears
   **minimized in the taskbar** — leave it there and ignore it. That's the app
   running quietly in the background.

That's it. The app is now running and ready on every office computer.

> **The one fix for almost everything: double-click `start` again.** It safely
> stops whatever was running and starts fresh. You can't break anything by
> double-clicking it twice — there's never two copies fighting each other.

---

## How to open the app

**On the host computer itself:** a browser opens automatically when you start it.
Any time, you can also go to `http://localhost:4173`.

**On any other office computer:** open a web browser and go to the host's address:
`http://<host-ip>:4173` (for example `http://192.168.1.42:4173`).

The easy way to get that address: on the host, click **"Copy office link"** in the
app's **top-right corner** — it copies the current link to the clipboard. Paste it
into the other computer's browser (or into a message to send it over).

> Tip: bookmark that address on each computer so nobody has to retype it.

> **If the link stops working on the other computers:** the host's network address
> may have changed. On the host, click **"Copy office link"** again to get the
> current one. (Giving the host a fixed address — see below — prevents this.)

All computers share the **same** styles and fabrics, because everything is stored
on the host. If one person adds or edits a style, everyone sees it.

---

## Shared styles & data (one source of truth)

There is **one** copy of everything, and it lives on the **host computer's own
hard drive**:

- Mapped styles → the `styles/` folder.
- The fabric list → `data/fabrics.json`.

Every computer that opens the app is looking at that same copy on the host. Add a
style on one machine and it appears on all of them. There is no separate per-user
or per-browser copy to keep in sync, and nothing is stored in the cloud.

> **Important:** the app must always run from the host's **own local hard drive** —
> never from a network drive, the P drive, or a cloud-synced folder (Dropbox,
> OneDrive, Google Drive). Running off a synced folder can make the style list go
> blank or half-saved. The P drive is for **backups only** (see "Backing up"),
> never for running the program.

**One person edits styles at a time.** The app does not lock styles, so if two
people opened the *same* style in the Mapping Tool and both saved, the **last save
wins** and the earlier one is overwritten with no warning. In normal use one person
maintains styles, so this isn't an issue — just don't have two people mapping the
*same* style at the same moment. (Running print jobs from several machines at once
is completely fine; that only reads styles.)

---

## Finding the host's address

Other computers reach the app at `http://<host-ip>:4173`. The simplest way to get
it is the **"Copy office link"** button in the app's top-right corner (above). If
you'd rather find it manually on the host:

- Press `Win + R`, type `cmd`, press Enter, then type `ipconfig` and press Enter.
  Look for the **IPv4 Address** (e.g. `192.168.1.42`). That's the host's address.

To keep that address from changing:

- Ask whoever manages the office network/router to give the host computer a
  **fixed (static / reserved) IP address**. Then `http://192.168.x.x:4173` never
  changes and the bookmarks keep working.

---

## If something goes wrong

The app is designed so the fix is almost always the same: **double-click `start`
again** (in the `COMMAND CENTER` folder). Beyond that:

- **A message box pops up saying the app stopped:** close it and double-click
  `start` again. (The app stays minimized and silent while it's healthy — if a
  box ever appears, it's telling you exactly what to do.)
- **A box says the app isn't installed yet:** this computer hasn't been set up yet.
  Close the box and double-click **`install.bat`** (Windows) or **`install.command`**
  (Mac) — see "One-time setup" below. When it finishes, double-click `start` again.
- **Other computers can't open the address:** make sure (a) the host is on and
  `start` has been run, (b) the other computer is on the **same office network**,
  (c) you used the correct `http://<host-ip>:4173` address, and (d) Windows Firewall
  isn't blocking it — the first time you run it, Windows may show an "Allow access"
  box; click **Allow** for **Private networks**.
- **Still stuck:** restart the host computer, then double-click `start`.

---

## How to stop the app

In the taskbar, find the minimized **"Purnaa Cap Nesting"** window, open it, and
close it (or press `Ctrl + C` inside it). That's the only thing running — nothing
is left in the background.

---

## Backing up (built into the app)

All the mapped styles and the fabric list live **only** on the host computer. If
that computer dies and there's no backup, every style has to be re-mapped by hand.
The app handles backups for you — look at the **bar along the bottom** of the app.

**The bottom bar shows:**
- **Last backed up: [date]** — when the last backup ran. If it ever says **"Never
  backed up"** or the date looks old, that's your cue to click "Back up now."
- **Back up now** — click any time to save a fresh backup immediately.
- **Backup folder** — where backups are saved (the P drive). Click **Set / Change**
  to set it.

**One-time:** click **Set**, then **Browse…** to pick the backup folder in a normal
folder window (it opens on the host computer's screen). You can also type the path.
The app checks it can write there and remembers it. Each backup is saved as its
**own dated folder** (e.g. `capnest-backup-2026-06-16-093000`), so old backups are
never overwritten — "restore from last Tuesday" is always possible.

> **Use a folder path, not a web address.** A network share must be given as a
> *file path*, not a `smb://…` / `http://…` URL:
> - **Windows:** `\\192.168.10.20\Purnaa\Printing\...` (or a mapped drive like
>   `P:\...`).
> - **Mac:** connect to the share first (Finder → Go → Connect to Server →
>   `smb://192.168.10.20/Purnaa`), then it appears under `/Volumes/Purnaa/...`.
>
> Easiest is to click **Browse…** and pick it — that always gives a valid path. If
> you paste a `smb://…` URL the app now refuses it and explains why.

**Automatic weekly backup:** when the app is opened and **a week has passed** since
the last backup (and something changed), it backs up **automatically and silently**.
You'll also be offered a backup right after you **create a new style**.

> **Honest limitation:** the weekly backup only happens **when the app is opened**.
> If the host was off when the week ticked over, it backs up the next time the app is
> opened — "weekly" means "checked the next time it's opened after a week." That's why
> the **"Last backed up" date is always shown**: if it ever looks old, just click
> **"Back up now."**

**To restore** (on a new or repaired computer): finish the one-time setup, then copy
the `styles` and `data` folders **out of** a dated backup folder and **into** the app
folder, replacing the empty ones. Start the app — every style and fabric is back.

> A terminal alternative also exists (`npm run backup`, or
> `npm run backup -- "P:\CapNestBackups"`), but the bottom bar is the everyday way.

---

## One-time setup (any computer) — just run install, once

Setup is **one double-click**, and it works the same on Windows or Mac. On a new
computer, open the **`COMMAND CENTER`** folder and:

1. **Run install once:**
   - **Windows:** double-click **`install.bat`**.
   - **Mac:** double-click **`install.command`**.

   It installs Node **just for this user** (no admin rights, no password), downloads
   the app from GitHub into your home folder (`~/purnaa-cap-nesting`), and installs
   the app's components. It needs the **internet once** and takes a few minutes. It is
   **safe to run more than once.** When it says "INSTALL COMPLETE," you're done.
2. Double-click **`start.bat`** (Windows) or **`start.command`** (Mac) to run it. If
   you ever double-click start *before* install, it pops up a message telling you to
   run install first — so it's hard to get wrong.

> **If you skipped install**, the start icon will just prompt you to run it. You can't
> end up half-installed.

> **Updating the program later:** double-click **`update`** in `COMMAND CENTER` (only
> when Max says to). It pulls the newest code from GitHub and rebuilds. Starting the
> app never updates it on its own.

> **Setting up another computer:** copy the `COMMAND CENTER` folder over (or download
> the repo), then run **install** on that computer. Each machine downloads the Node it
> needs for its own operating system and its own copy of the app from GitHub.

**Optional, recommended on the host:**
- Set the host to a **fixed IP** and add `start.bat` to Windows startup so it launches
  on boot (`Win + R` → `shell:startup` → paste a shortcut to `start.bat`).
- Keep the styles backed up to the P drive (bottom bar → "Back up now"), so a new
  machine can be set up with **install** and then catch up with **Retrieve New Styles
  from P Drive**.
