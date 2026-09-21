const express = require("express");
const { all } = require("../db/helpers");
const { rowToAccount } = require("../db/serializers");
const { listCalendarEvents, assertCalendarRange } = require("../services/calendar");

const router = express.Router();

router.get("/events", async (req, res) => {
  const fromMs = Date.parse(String(req.query.from || ""));
  const toMs = Date.parse(String(req.query.to || ""));
  try {
    assertCalendarRange(fromMs, toMs);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }
  try {
    const accounts = all("SELECT * FROM accounts WHERE active = 1").map(rowToAccount);
    const result = await listCalendarEvents({ fromMs, toMs, accounts });
    res.json(result);
  } catch (err) {
    console.error("Calendar events failed:", err);
    res.status(502).json({ error: err.message || String(err) });
  }
});

module.exports = router;
