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

    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'admin123';

    // Validar directo contra variables de entorno (sin depender de la DB)
    if (username !== envUser || password !== envPass) {
      return res.json({ success: false, message: 'Contrasena incorrecta' });
    }

    // Asegurar que el admin existe en DB (para foreign keys, etc.)
    let admin = await db.get('SELECT * FROM admins WHERE username=?', [username]);
    if (!admin) {
      const hashed = await bcrypt.hash(envPass, 10);
      const id = uuidv4();
      await db.run('INSERT INTO admins (id,username,password,role) VALUES (?,?,?,?)', [id, username, hashed, 'superadmin']);
      admin = await db.get('SELECT * FROM admins WHERE username=?', [username]);
    }

    const valid = true; // ya validamos arriba contra env
    if (!valid) return res.json({ success: false, message: 'Contrasena incorrecta' });

    const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, SECRET, { expiresIn: '24h' });
    res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'strict' });
    return res.json({ success: true, message: 'Login exitoso', token });
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
    await db.run('INSERT INTO apps (id,name,owner_id,secret,version) VALUES (?,?,?,?,?)', [id, name, req.admin.id, secret, version || '1.0']);
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

module.exports = router;
