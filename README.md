# Fielder

A local, single-user Kanban task tracker for account-exec work: tasks with
subtasks, epics ("groups"), labels, and due dates, filterable by account/AE/
epic/label — plus a POC/demo tracker synced from the
[`katelawrencegupta-elastic/poc`](https://github.com/katelawrencegupta-elastic/poc)
GitHub repo, and a timeline/Gantt view overlaying task and POC dates with
GitHub commit activity.

## Stack

- **Server**: Node.js + Express, [`node:sqlite`](https://nodejs.org/api/sqlite.html) (built-in, file-backed SQLite — no native build step).
- **Client**: React + Vite, [`@hello-pangea/dnd`](https://github.com/hello-pangea/dnd) for the Kanban drag-and-drop, [`vis-timeline`](https://visjs.github.io/vis-timeline/) for the Gantt view.
- No auth — runs on localhost only.

Requires **Node 22.5+** (built-in `node:sqlite` support); tested on Node 26.

## Setup

```bash
npm install                 # installs workspaces + local git hooks (see Data safety)
cp .env.example .env        # never commit .env — fill in optional tokens/URLs locally
```

Optional in `.env`: `GITHUB_TOKEN`, `ACCOUNTS_SHEET_ID`, `SCRAPPY_URL`, `CALENDAR_ICS_URL`, `FIELDWORK_DB_PATH`.
Accounts can also sync from a CSV at `server/data/accounts-sheet.csv`.

### One-time: import existing tasks from `fieldwork`

If you have the older `fieldwork` app's task history, pull it in once:

```bash
FIELDWORK_DB_PATH=/path/to/fieldwork.db npm run migrate:fieldwork
# or:
node server/scripts/import-fieldwork.js /path/to/fieldwork.db
```

Safe to re-run — it skips the import if fieldwork-sourced tasks already exist
(pass `--force` to import again anyway).

## Running

```bash
npm run dev:server   # http://127.0.0.1:3101 — API + seeds the DB on first boot
npm run dev:client   # http://127.0.0.1:5173 — Vite dev server, proxies /api to the server
```

Open `http://127.0.0.1:5173`.

For a single-process production-style run instead:

```bash
npm run build:client
npm run dev:server   # now also serves the built client at :3101
```

## Views

- **Kanban** — Backlog / In Progress / Blocked / Done columns, drag-and-drop, filter bar (AE → account → epic → label).
- **Epics** — group related tasks (e.g. "GEH POC Phase 1") with a progress bar.
- **POCs** — one card per folder in the `poc` GitHub repo. Click **Sync POCs** to pull `poc.json` manifests + commit history.
- **Timeline** — Gantt-style view of dated tasks, POC date ranges, and GitHub commits as markers, grouped by account or by POC.

## Linking a POC to an account

Add a `poc.json` file to the root of the POC's folder in the `poc` repo:

```json
{
  "account": "ge_healthcare",
  "title": "GE Healthcare – Stan SNMP/Observability POC",
  "status": "in_progress",
  "startDate": "2026-07-20",
  "targetDemoDate": "2026-08-15",
  "owner": "Katelyn Gupta"
}
```

Any field can be left out and edited later from the POCs view instead —
syncing only overwrites a field if the manifest actually sets it. See the
`poc` repo's own README for the full convention.

## Data safety

- The DB (`server/fielder.db`) is a real file-backed SQLite database (WAL mode). It is **gitignored** — keep it local (or under Application Support via ctl).
- Never commit `.env`, `calendar.json`, `*.db` / WAL sidecars, `logs/`, `node_modules/`, or `client/dist/`. `npm install` wires a pre-commit hook (`npm run hooks:install`) that blocks those paths.
- A snapshot is written to `server/snapshots/` every hour. Use the **Snapshots** menu in the app header to save one on demand or restore an older one (restore reopens the database in-process; no server restart).
- **Export** (top right) downloads all tasks as JSON; **Import** accepts that same JSON shape to bulk-add tasks.

### Rotating calendar secrets (if they were ever committed)

1. **Google Calendar ICS** — Calendar settings → Integrate calendar → reset the secret iCal address → set `CALENDAR_ICS_URL` in local `.env`.
2. **Zoom** — Regenerate passcodes (or new meeting IDs) for any standing meetings whose join links with `pwd=` appeared in an old `calendar.json`.

## Project layout

```
server/
  db/            schema.sql, seed data, thin node:sqlite helpers
  routes/        accounts, stages, epics, tasks, labels, pocs, timeline, system (export/import/snapshots)
  services/      github.js (POC sync), snapshot.js (DB backups)
  scripts/       import-fieldwork.js (one-time migration)
client/
  src/
    api.js       fetch wrappers for every server route
    views/       KanbanView, EpicsView, PocsView, TimelineView
    components/  TaskCard, TaskDrawer, FilterBar, Pills
```
