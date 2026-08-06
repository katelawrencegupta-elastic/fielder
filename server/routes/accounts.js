const express = require("express");
const { all } = require("../db/helpers");
const { rowToAccount } = require("../db/serializers");
const { syncFromFieldwork } = require("../services/accountsSync");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = all("SELECT * FROM accounts WHERE active = 1 ORDER BY sort_order ASC");
  res.json(rows.map(rowToAccount));
});

// Reconciles fielder's account list against fieldwork's live-synced accounts
// cache (additive only — never removes or renames an existing account).
router.post("/sync", (req, res) => {
  const result = syncFromFieldwork();
  if (!result.ok) return res.status(404).json(result);
  const rows = all("SELECT * FROM accounts WHERE active = 1 ORDER BY sort_order ASC");
  res.json({ ...result, accounts: rows.map(rowToAccount) });
});

module.exports = router;
