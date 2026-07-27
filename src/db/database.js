const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'keyauth.db');
const sqlite = new sqlite3.Database(dbPath);

// Wrapper síncrono-style usando promesas resueltas en un pool
// Para mantener compatibilidad usamos un wrapper que expone prepare/get/all/run sync-like
// usando el modo serialized de sqlite3

sqlite.serialize(function() {
  sqlite.run('PRAGMA journal_mode = WAL');
  sqlite.run('PRAGMA foreign_keys = ON');
});

// ─── Promisify helpers ────────────────────────────────────────────────────────

function run(sql, params) {
  params = params || [];
  return new Promise(function(resolve, reject) {
    sqlite.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params) {
  params = params || [];
  return new Promise(function(resolve, reject) {
    sqlite.get(sql, params, function(err, row) {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params) {
  params = params || [];
  return new Promise(function(resolve, reject) {
    sqlite.all(sql, params, function(err, rows) {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function exec(sql) {
  return new Promise(function(resolve, reject) {
    sqlite.exec(sql, function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS apps (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    owner_id    TEXT NOT NULL,
    secret      TEXT NOT NULL,
    version     TEXT NOT NULL DEFAULT '1.0',
    status      INTEGER NOT NULL DEFAULT 1,
    free_mode   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'admin',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    username    TEXT NOT NULL,
    password    TEXT NOT NULL,
    email       TEXT DEFAULT '',
    ip          TEXT DEFAULT '',
    hwid        TEXT DEFAULT '',
    createdate  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    lastlogin   INTEGER DEFAULT NULL,
    banned      INTEGER NOT NULL DEFAULT 0,
    ban_reason  TEXT DEFAULT '',
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
    UNIQUE(app_id, username)
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    key_value   TEXT NOT NULL UNIQUE,
    note        TEXT DEFAULT '',
    expiry      INTEGER DEFAULT NULL,
    duration    INTEGER DEFAULT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    used        INTEGER NOT NULL DEFAULT 0,
    used_by     TEXT DEFAULT NULL,
    used_at     INTEGER DEFAULT NULL,
    max_uses    INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    app_id      TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT 'default',
    expiry      INTEGER DEFAULT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS logs (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    username    TEXT DEFAULT 'system',
    action      TEXT NOT NULL,
    ip          TEXT DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_vars (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    var_key     TEXT NOT NULL,
    var_value   TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
    UNIQUE(app_id, var_key)
  );

  CREATE TABLE IF NOT EXISTS user_vars (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    app_id      TEXT NOT NULL,
    var_key     TEXT NOT NULL,
    var_value   TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, var_key)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    app_id      TEXT NOT NULL,
    user_id     TEXT DEFAULT NULL,
    session_key TEXT NOT NULL UNIQUE,
    ip          TEXT DEFAULT '',
    hwid        TEXT DEFAULT '',
    initialized INTEGER NOT NULL DEFAULT 0,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );
`;

exec(SCHEMA).then(function() {
  console.log('[DB] Base de datos inicializada correctamente en', dbPath);
  // Ejecutar migración v2 de forma segura
  setTimeout(function() {
    require('./migration_v2');
  }, 1000);
}).catch(function(err) {
  console.error('[DB] Error inicializando schema:', err);
});

module.exports = { run, get, all, exec, sqlite };
