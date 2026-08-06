const { db } = require("./client");

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

function now() {
  return Date.now();
}

module.exports = { db, all, get, run, now };
