require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const path = require("path");

const { seed } = require("./db/seed");
const { startSnapshotInterval } = require("./services/snapshot");

const accountsRouter = require("./routes/accounts");
const stagesRouter = require("./routes/stages");
const epicsRouter = require("./routes/epics");
const tasksRouter = require("./routes/tasks");
const labelsRouter = require("./routes/labels");
const pocsRouter = require("./routes/pocs");
const timelineRouter = require("./routes/timeline");
const taskEventsRouter = require("./routes/taskEvents");
const systemRouter = require("./routes/system");

seed();

const app = express();
const PORT = process.env.PORT || 3101;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
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

app.listen(PORT, () => {
  console.log(`\nFielder server running at http://localhost:${PORT}`);
  startSnapshotInterval();
});
