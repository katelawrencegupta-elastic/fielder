const express = require("express");
const { all } = require("../db/helpers");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(all("SELECT DISTINCT label FROM task_labels ORDER BY label ASC").map((r) => r.label));
});

module.exports = router;
