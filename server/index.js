require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const path = require("path");

const client = require("./db/client");
const { seed } = require("./db/seed");
const { startSnapshotInterval, stopSnapshotInterval } = require("./services/snapshot");

const accountsRouter = require("./routes/accounts");
const stagesRouter = require("./routes/stages");
const epicsRouter = require("./routes/epics");
const tasksRouter = require("./routes/tasks");
const labelsRouter = require("./routes/labels");
const pocsRouter = require("./routes/pocs");
const meetingsRouter = require("./routes/meetings");
const calendarRouter = require("./routes/calendar");
const timelineRouter = require("./routes/timeline");
const taskEventsRouter = require("./routes/taskEvents");
const systemRouter = require("./routes/system");

seed();

const app = express();
const PORT = Number(process.env.PORT) || 3101;
const HOST = process.env.HOST || "127.0.0.1";

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      cb(null, false);
    },
  })
);
app.use(express.json());

app.use("/api/accounts", accountsRouter);
app.use("/api/stages", stagesRouter);
app.use("/api/epics", epicsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/labels", labelsRouter);
app.use("/api/pocs", pocsRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/timeline", timelineRouter);
app.use("/api/task-events", taskEventsRouter);
app.use("/api", systemRouter);

// Serve the built client in production.
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\nFielder server running at http://${HOST}:${PORT}`);
  startSnapshotInterval();
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  stopSnapshotInterval();
  const force = setTimeout(() => {
    try {
      client.closeDatabase();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }, 8000);
  force.unref();
  server.close(() => {
    try {
      client.closeDatabase();
    } catch (err) {
      console.error("Error closing database:", err.message);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
