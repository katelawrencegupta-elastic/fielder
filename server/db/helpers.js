const client = require("./client");

function all(sql, ...params) {
  return client.db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return client.db.prepare(sql).get(...params);
}

function run(sql, ...params) {
  return client.db.prepare(sql).run(...params);
}

function now() {
  return Date.now();
}

module.exports = {
  get db() {
    return client.db;
  },
  all,
  get,
  run,
  now,
};
