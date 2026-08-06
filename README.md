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
npm install                 # installs both server + client workspaces
cp .env.example .env        # optional: add a GITHUB_TOKEN to raise the POC-sync rate limit
```

### One-time: import existing tasks from `fieldwork`

If you have the older `fieldwork` app's task history, pull it in once:

```bash
npm run migrate:fieldwork
# or, for a non-default path:
node server/scripts/import-fieldwork.js /path/to/fieldwork.db
```

Safe to re-run — it skips the import if fieldwork-sourced tasks already exist
(pass `--force` to import again anyway).

## Running

```bash
npm run dev:server   # http://localhost:3101 — API + seeds the DB on first boot
npm run dev:client   # http://localhost:5173 — Vite dev server, proxies /api to the server
```

Open `http://localhost:5173`.

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

- The DB (`server/fielder.db`) is a real file-backed SQLite database (WAL mode).
- A snapshot is written to `server/snapshots/` every 10 minutes (last 24h kept). Use the **Snapshots** menu in the app header to save one on demand or restore an older one (restoring requires restarting the server).
- **Export** (top right) downloads all tasks as JSON; **Import** accepts that same JSON shape to bulk-add tasks.

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
