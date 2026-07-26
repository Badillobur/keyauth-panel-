const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAdmin, SECRET } = require('../middleware/auth');

function genKey(prefix) {
  prefix = prefix || 'KEY';
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = function(n) { let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
  return prefix + '-' + seg(5) + '-' + seg(5) + '-' + seg(5) + '-' + seg(5);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

router.post('/login', async function(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Usuario y contrasena requeridos' });

    // Admin principal — siempre daniel/daniel a menos que Render tenga otra cosa configurada
    const adminUser = process.env.ADMIN_USERNAME || 'daniel';
    const adminPass = process.env.ADMIN_PASSWORD || 'daniel';

    // ── Admin principal ────────────────────────────────────────────────────
    if (username === adminUser && password === adminPass) {
      let admin = await db.get('SELECT * FROM admins WHERE username=?', [username]);
      if (!admin) {
        // crear con username viejo si existe
        admin = await db.get('SELECT * FROM admins LIMIT 1');
        if (!admin) {
          const id = uuidv4();
          const hashed = await bcrypt.hash(adminPass, 10);
          await db.run('INSERT INTO admins (id,username,password,role) VALUES (?,?,?,?)', [id, adminUser, hashed, 'superadmin']);
          admin = await db.get('SELECT * FROM admins WHERE id=?', [id]);
        }
      }
      // Sincronizar siempre la DB con las credenciales actuales
      await db.run('UPDATE admins SET username=?,password=? WHERE id=?', [adminUser, await bcrypt.hash(adminPass, 10), admin.id]);
      const token = jwt.sign({ id: admin.id, username: adminUser, role: 'superadmin' }, SECRET, { expiresIn: '24h' });
      res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'strict' });
      return res.json({ success: true, message: 'Login exitoso', token, role: 'superadmin' });
    }

    // ── Partner (buscar en tabla partners) ────────────────────────────────
    const partner = await db.get('SELECT * FROM partners WHERE username=? AND active=1', [username]);
    if (partner) {
      const valid = await bcrypt.compare(password, partner.password);
      if (!valid) return res.json({ success: false, message: 'Contrasena incorrecta' });
      await db.run('UPDATE partners SET last_login=? WHERE id=?', [Math.floor(Date.now()/1000), partner.id]);
      const token = jwt.sign({ id: partner.id, username: partner.username, role: 'partner', partner_id: partner.id }, SECRET, { expiresIn: '24h' });
      res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'strict' });
      return res.json({ success: true, message: 'Login exitoso', token, role: 'partner' });
    }

    return res.json({ success: false, message: 'Credenciales incorrectas' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/logout', function(req, res) {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

router.get('/me', requireAdmin, function(req, res) {
  res.json({ success: true, admin: req.admin });
});

// ─── STATS ────────────────────────────────────────────────────────────────────

router.get('/stats', requireAdmin, async function(req, res) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const totalApps    = ((await db.get('SELECT COUNT(*) as c FROM apps')) || {}).c || 0;
    const totalUsers   = ((await db.get('SELECT COUNT(*) as c FROM users')) || {}).c || 0;
    const totalKeys    = ((await db.get('SELECT COUNT(*) as c FROM licenses')) || {}).c || 0;
    const usedKeys     = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE used>0')) || {}).c || 0;
    const onlineUsers  = ((await db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>?', [now])) || {}).c || 0;
    const recentLogs   = await db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT 10');
    res.json({ success: true, stats: { totalApps, totalUsers, totalKeys, usedKeys, onlineUsers, recentLogs } });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── APPS ─────────────────────────────────────────────────────────────────────

router.get('/apps', requireAdmin, async function(req, res) {
  try {
    const apps = await db.all('SELECT * FROM apps ORDER BY created_at DESC');
    const result = [];
    for (const a of apps) {
      const uCount = ((await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [a.id])) || {}).c || 0;
      const kCount = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [a.id])) || {}).c || 0;
      result.push(Object.assign({}, a, { userCount: uCount, keyCount: kCount }));
    }
    res.json({ success: true, apps: result });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps', requireAdmin, async function(req, res) {
  try {
    const { name, version } = req.body;
    if (!name) return res.json({ success: false, message: 'Nombre requerido' });
    const existing = await db.get('SELECT id FROM apps WHERE name=?', [name]);
    if (existing) return res.json({ success: false, message: 'Nombre de app ya existe' });
    const id = uuidv4();
    const secret = uuidv4().replace(/-/g, '');
    const ownerId = uuidv4().replace(/-/g, '').substring(0, 10); // owner_id unico de 10 chars por app
    await db.run('INSERT INTO apps (id,name,owner_id,secret,version) VALUES (?,?,?,?,?)', [id, name, ownerId, secret, version || '1.0']);
    const app = await db.get('SELECT * FROM apps WHERE id=?', [id]);
    res.json({ success: true, message: 'App creada', app });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.put('/apps/:id', requireAdmin, async function(req, res) {
  try {
    const app = await db.get('SELECT * FROM apps WHERE id=?', [req.params.id]);
    if (!app) return res.json({ success: false, message: 'App no encontrada' });
    const name      = req.body.name      !== undefined ? req.body.name      : app.name;
    const version   = req.body.version   !== undefined ? req.body.version   : app.version;
    const status    = req.body.status    !== undefined ? req.body.status    : app.status;
    const free_mode = req.body.free_mode !== undefined ? req.body.free_mode : app.free_mode;
    await db.run('UPDATE apps SET name=?,version=?,status=?,free_mode=? WHERE id=?', [name, version, status, free_mode, app.id]);
    res.json({ success: true, message: 'App actualizada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:id', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM apps WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'App eliminada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── KEYS ─────────────────────────────────────────────────────────────────────

router.get('/apps/:appId/keys', requireAdmin, async function(req, res) {
  try {
    const keys = await db.all('SELECT * FROM licenses WHERE app_id=? ORDER BY created_at DESC', [req.params.appId]);
    res.json({ success: true, keys });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/keys', requireAdmin, async function(req, res) {
  try {
    const appId = req.params.appId;
    const app = await db.get('SELECT id FROM apps WHERE id=?', [appId]);
    if (!app) return res.json({ success: false, message: 'App no encontrada' });

    const amount   = Math.min(parseInt(req.body.amount) || 1, 500);
    const duration = req.body.duration ? parseInt(req.body.duration) : null;
    const level    = parseInt(req.body.level) || 1;
    const note     = req.body.note || '';
    const prefix   = req.body.prefix || 'KEY';
    const max_uses = parseInt(req.body.max_uses) || 1;
    const expiry   = req.body.expiry_date ? Math.floor(new Date(req.body.expiry_date).getTime() / 1000) : null;

    const created = [];
    for (let i = 0; i < amount; i++) {
      const kv = genKey(prefix);
      await db.run('INSERT INTO licenses (id,app_id,key_value,note,expiry,duration,level,max_uses) VALUES (?,?,?,?,?,?,?,?)',
        [uuidv4(), appId, kv, note, expiry, duration, level, max_uses]);
      created.push(kv);
    }
    res.json({ success: true, message: amount + ' key(s) generada(s)', keys: created });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:appId/keys/:keyId', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM licenses WHERE id=? AND app_id=?', [req.params.keyId, req.params.appId]);
    res.json({ success: true, message: 'Key eliminada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/keys/:keyId/reset', requireAdmin, async function(req, res) {
  try {
    await db.run('UPDATE licenses SET used=0,used_by=NULL,used_at=NULL WHERE id=? AND app_id=?', [req.params.keyId, req.params.appId]);
    res.json({ success: true, message: 'Key reseteada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

// CREAR USUARIO MANUAL
router.post('/apps/:appId/users', requireAdmin, async function(req, res) {
  try {
    const { username, password, email, days, level } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Usuario y contrasena requeridos' });
    const app = await db.get('SELECT id FROM apps WHERE id=?', [req.params.appId]);
    if (!app) return res.json({ success: false, message: 'App no encontrada' });
    const ex = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [req.params.appId, username]);
    if (ex) return res.json({ success: false, message: 'El usuario ya existe' });
    const now = Math.floor(Date.now() / 1000);
    const hashed = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    await db.run('INSERT INTO users (id,app_id,username,password,email,createdate) VALUES (?,?,?,?,?,?)',
      [userId, req.params.appId, username, hashed, email || '', now]);
    const expiry = days && parseInt(days) > 0 ? now + (parseInt(days) * 86400) : null;
    await db.run('INSERT INTO subscriptions (id,user_id,app_id,name,expiry,level) VALUES (?,?,?,?,?,?)',
      [uuidv4(), userId, req.params.appId, 'default', expiry, parseInt(level) || 1]);
    res.json({ success: true, message: 'Usuario "' + username + '" creado correctamente' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.get('/apps/:appId/users', requireAdmin, async function(req, res) {
  try {
    const users = await db.all(
      'SELECT u.*, (SELECT name FROM subscriptions WHERE user_id=u.id LIMIT 1) as sub_name, ' +
      '(SELECT expiry FROM subscriptions WHERE user_id=u.id LIMIT 1) as sub_expiry ' +
      'FROM users u WHERE u.app_id=? ORDER BY u.createdate DESC', [req.params.appId]);
    res.json({ success: true, users });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/users/:userId/ban', requireAdmin, async function(req, res) {
  try {
    const user = await db.get('SELECT * FROM users WHERE id=? AND app_id=?', [req.params.userId, req.params.appId]);
    if (!user) return res.json({ success: false, message: 'Usuario no encontrado' });
    const nb = user.banned ? 0 : 1;
    await db.run('UPDATE users SET banned=?,ban_reason=? WHERE id=?', [nb, nb ? (req.body.reason || 'Baneado por admin') : '', user.id]);
    res.json({ success: true, message: nb ? 'Usuario baneado' : 'Usuario desbaneado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/users/:userId/reset-hwid', requireAdmin, async function(req, res) {
  try {
    await db.run("UPDATE users SET hwid='' WHERE id=? AND app_id=?", [req.params.userId, req.params.appId]);
    res.json({ success: true, message: 'HWID reseteado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:appId/users/:userId', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM users WHERE id=? AND app_id=?', [req.params.userId, req.params.appId]);
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/users/:userId/extend', requireAdmin, async function(req, res) {
  try {
    const days = parseInt(req.body.days);
    if (!days || days < 1) return res.json({ success: false, message: 'Dias invalidos' });
    const now = Math.floor(Date.now() / 1000);
    const sub = await db.get('SELECT * FROM subscriptions WHERE user_id=? AND app_id=?', [req.params.userId, req.params.appId]);
    if (sub) {
      const base = (sub.expiry && sub.expiry > now) ? sub.expiry : now;
      await db.run('UPDATE subscriptions SET expiry=? WHERE id=?', [base + (days * 86400), sub.id]);
    } else {
      await db.run("INSERT INTO subscriptions (id,user_id,app_id,name,expiry) VALUES (?,?,?,'default',?)",
        [uuidv4(), req.params.userId, req.params.appId, now + (days * 86400)]);
    }
    res.json({ success: true, message: 'Suscripcion extendida ' + days + ' dias' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── LOGS ─────────────────────────────────────────────────────────────────────

router.get('/apps/:appId/logs', requireAdmin, async function(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await db.all('SELECT * FROM logs WHERE app_id=? ORDER BY created_at DESC LIMIT ?', [req.params.appId, limit]);
    res.json({ success: true, logs });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:appId/logs', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM logs WHERE app_id=?', [req.params.appId]);
    res.json({ success: true, message: 'Logs eliminados' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── VARIABLES ────────────────────────────────────────────────────────────────

router.get('/apps/:appId/vars', requireAdmin, async function(req, res) {
  try {
    const vars = await db.all('SELECT * FROM app_vars WHERE app_id=?', [req.params.appId]);
    res.json({ success: true, vars });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/vars', requireAdmin, async function(req, res) {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.json({ success: false, message: 'Key y value requeridos' });
    const ex = await db.get('SELECT id FROM app_vars WHERE app_id=? AND var_key=?', [req.params.appId, key]);
    if (ex) await db.run('UPDATE app_vars SET var_value=? WHERE id=?', [value, ex.id]);
    else await db.run('INSERT INTO app_vars (id,app_id,var_key,var_value) VALUES (?,?,?,?)', [uuidv4(), req.params.appId, key, value]);
    res.json({ success: true, message: 'Variable guardada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:appId/vars/:varId', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM app_vars WHERE id=? AND app_id=?', [req.params.varId, req.params.appId]);
    res.json({ success: true, message: 'Variable eliminada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── PARTNERS ─────────────────────────────────────────────────────────────────

// Inicializar tabla de partners
(async function() {
  await db.run(`CREATE TABLE IF NOT EXISTS partners (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    active      INTEGER DEFAULT 1,
    last_login  INTEGER DEFAULT NULL,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS partner_apps (
    partner_id  TEXT NOT NULL,
    app_id      TEXT NOT NULL,
    can_genkeys INTEGER DEFAULT 1,
    can_users   INTEGER DEFAULT 1,
    can_logs    INTEGER DEFAULT 1,
    PRIMARY KEY (partner_id, app_id),
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  )`);
})();

// Listar partners
router.get('/partners', requireAdmin, async function(req, res) {
  try {
    const partners = await db.all('SELECT * FROM partners ORDER BY created_at DESC');
    const result = [];
    for (const p of partners) {
      const apps = await db.all(
        'SELECT a.id, a.name, pa.can_genkeys, pa.can_users, pa.can_logs FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
        [p.id]
      );
      result.push(Object.assign({}, p, { password: undefined, apps }));
    }
    res.json({ success: true, partners: result });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Crear partner
router.post('/partners', requireAdmin, async function(req, res) {
  try {
    const { username, password, display_name, email, app_ids } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Usuario y contraseña requeridos' });
    const ex = await db.get('SELECT id FROM partners WHERE username=?', [username]);
    if (ex) return res.json({ success: false, message: 'Username ya existe' });
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO partners (id,username,password,display_name,email) VALUES (?,?,?,?,?)',
      [id, username, hashed, display_name || username, email || '']);
    // Asociar apps
    if (app_ids && app_ids.length) {
      for (const appId of app_ids) {
        await db.run('INSERT OR IGNORE INTO partner_apps (partner_id,app_id) VALUES (?,?)', [id, appId]);
      }
    }
    const partner = await db.get('SELECT id,username,display_name,email,active,created_at FROM partners WHERE id=?', [id]);
    res.json({ success: true, message: 'Partner creado', partner });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Actualizar partner
router.put('/partners/:id', requireAdmin, async function(req, res) {
  try {
    const { display_name, email, active, password, app_ids, permissions } = req.body;
    const p = await db.get('SELECT * FROM partners WHERE id=?', [req.params.id]);
    if (!p) return res.json({ success: false, message: 'Partner no encontrado' });
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await db.run('UPDATE partners SET password=? WHERE id=?', [hashed, p.id]);
    }
    await db.run('UPDATE partners SET display_name=?,email=?,active=? WHERE id=?',
      [display_name ?? p.display_name, email ?? p.email, active ?? p.active, p.id]);
    // Actualizar apps: borrar y reinsertar
    if (app_ids !== undefined) {
      await db.run('DELETE FROM partner_apps WHERE partner_id=?', [p.id]);
      for (const appId of (app_ids || [])) {
        const perm = (permissions && permissions[appId]) || {};
        await db.run('INSERT INTO partner_apps (partner_id,app_id,can_genkeys,can_users,can_logs) VALUES (?,?,?,?,?)',
          [p.id, appId, perm.can_genkeys ? 1 : 1, perm.can_users ? 1 : 1, perm.can_logs ? 1 : 1]);
      }
    }
    res.json({ success: true, message: 'Partner actualizado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Eliminar partner
router.delete('/partners/:id', requireAdmin, async function(req, res) {
  try {
    await db.run('DELETE FROM partners WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Partner eliminado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Apps que puede ver un partner (usado por el middleware de partner)
router.get('/partner-apps', async function(req, res) {
  try {
    const token = (req.cookies && req.cookies.admin_token) ||
      (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    if (!token) return res.json({ success: false, apps: [] });
    const { SECRET } = require('../middleware/auth');
    const decoded = require('jsonwebtoken').verify(token, SECRET);
    if (decoded.role !== 'partner') return res.json({ success: false, apps: [] });
    const apps = await db.all(
      'SELECT a.*, pa.can_genkeys, pa.can_users, pa.can_logs FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
      [decoded.partner_id]
    );
    res.json({ success: true, apps, role: 'partner', username: decoded.username });
  } catch (e) { res.json({ success: false, apps: [] }); }
});

module.exports = router;
