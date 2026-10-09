const express = require("express");
const { all } = require("../db/helpers");
const { rowToAccount } = require("../db/serializers");
const { syncAccounts } = require("../services/accountsSync");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = all("SELECT * FROM accounts WHERE active = 1 ORDER BY label COLLATE NOCASE ASC");
  res.json(rows.map(rowToAccount));
});

// Reconciles fielder's account list against the shared Google Sheet
// (additive — never removes an existing account; AE follows the sheet).
router.post("/sync", async (req, res) => {
  try {
    const result = await syncAccounts();
    if (!result.ok) return res.status(404).json(result);
    const rows = all("SELECT * FROM accounts WHERE active = 1 ORDER BY label COLLATE NOCASE ASC");
    res.json({ ...result, accounts: rows.map(rowToAccount) });
  } catch (err) {
    res.status(500).json({
      ok: false,
      reason: err.message || "Account sync failed",
      added: [],
      updated: [],
    });
  }
});

module.exports = router;
