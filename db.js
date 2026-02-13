const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'alerts.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain TEXT NOT NULL,
    token_address TEXT NOT NULL,
    token_name TEXT,
    threshold_price REAL NOT NULL,
    direction TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    last_notified_at INTEGER,
    last_price REAL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

const stmts = {
  getAll: db.prepare('SELECT * FROM alerts ORDER BY created_at DESC'),
  getActive: db.prepare('SELECT * FROM alerts WHERE active = 1'),
  getById: db.prepare('SELECT * FROM alerts WHERE id = ?'),
  insert: db.prepare(
    'INSERT INTO alerts (chain, token_address, token_name, threshold_price, direction) VALUES (?, ?, ?, ?, ?)'
  ),
  delete: db.prepare('DELETE FROM alerts WHERE id = ?'),
  updatePrice: db.prepare('UPDATE alerts SET last_price = ? WHERE id = ?'),
  updateNotified: db.prepare('UPDATE alerts SET last_notified_at = ? WHERE id = ?'),
};

module.exports = {
  getAllAlerts() {
    return stmts.getAll.all();
  },

  getActiveAlerts() {
    return stmts.getActive.all();
  },

  getAlertById(id) {
    return stmts.getById.get(id);
  },

  createAlert(chain, tokenAddress, tokenName, thresholdPrice, direction) {
    const info = stmts.insert.run(chain, tokenAddress, tokenName, thresholdPrice, direction);
    return stmts.getById.get(info.lastInsertRowid);
  },

  deleteAlert(id) {
    return stmts.delete.run(id);
  },

  updateLastPrice(id, price) {
    stmts.updatePrice.run(price, id);
  },

  updateLastNotified(id, timestamp) {
    stmts.updateNotified.run(timestamp, id);
  },
};
