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
      const token = jwt.sign({ 
        id: partner.id, 
        username: partner.username, 
        role: 'partner', 
        partner_role: partner.role || 'partner', 
        partner_id: partner.id 
      }, SECRET, { expiresIn: '24h' });
      res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'strict' });
      return res.json({ success: true, message: 'Login exitoso', token, role: 'partner', partner_role: partner.role || 'partner' });
    }

    return res.json({ success: false, message: 'Credenciales incorrectas' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/logout', function(req, res) {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

router.get('/me', requireAdmin, async function(req, res) {
  try {
    if (req.admin.role === 'partner') {
      const p = await db.get('SELECT * FROM partners WHERE id=?', [req.admin.id]);
      if (!p) return res.json({ success: true, admin: req.admin });
      const partnerRole = p.role || 'partner';
      return res.json({ 
        success: true, 
        admin: Object.assign({}, req.admin, { 
          partner_role: partnerRole,
          display_name: p.display_name,
          email: p.email
        }) 
      });
    }
    res.json({ success: true, admin: req.admin });
  } catch(e) {
    res.json({ success: true, admin: req.admin });
  }
});

// ─── Middleware: solo admin, NO partners ──────────────────────────────────────
function adminOnly(req, res, next) {
  if (req.admin && req.admin.role === 'partner') {
    return res.status(403).json({ success: false, message: 'Acceso denegado — solo el administrador puede hacer esto' });
  }
  next();
}

// ─── GESTIÓN DE PERMISOS DE PARTNERS ─────────────────────────────────────────

// GET /admin/partner-permissions/:partnerId/:appId
router.get('/partner-permissions/:partnerId/:appId', requireAdmin, async function(req, res) {
  try {
    const { partnerId, appId } = req.params;
    
    // Solo admin puede ver todos los permisos
    if (req.admin.role === 'partner' && req.admin.id !== partnerId) {
      return res.status(403).json({ success: false, message: 'Sin acceso' });
    }
    
    const perms = await db.get('SELECT * FROM partner_permissions WHERE partner_id=? AND app_id=?', [partnerId, appId]);
    const defaultPerms = {
      can_genkeys: 1, can_view_users: 1, can_ban_users: 0,
      can_view_logs: 0, can_reset_hwid: 0, can_extend_sub: 0,
      max_keys_per_day: 50, max_key_duration: 30
    };
    res.json({ success: true, permissions: perms || defaultPerms });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// POST /admin/partner-permissions/:partnerId/:appId
router.post('/partner-permissions/:partnerId/:appId', adminOnly, async function(req, res) {
  try {
    const { partnerId, appId } = req.params;
    const {
      can_genkeys, can_view_users, can_ban_users, can_view_logs,
      can_reset_hwid, can_extend_sub, max_keys_per_day, max_key_duration
    } = req.body;
    
    // Verificar que el partner y la app existen
    const partner = await db.get('SELECT id FROM partners WHERE id=?', [partnerId]);
    const app = await db.get('SELECT id FROM apps WHERE id=?', [appId]);
    if (!partner || !app) {
      return res.json({ success: false, message: 'Partner o App no encontrada' });
    }
    
    // Verificar si existe
    const existing = await db.get('SELECT id FROM partner_permissions WHERE partner_id=? AND app_id=?', [partnerId, appId]);
    
    if (existing) {
      // Actualizar
      await db.run(`UPDATE partner_permissions SET 
        can_genkeys=?, can_view_users=?, can_ban_users=?, can_view_logs=?,
        can_reset_hwid=?, can_extend_sub=?, max_keys_per_day=?, max_key_duration=?,
        updated_at=(strftime('%s','now'))
        WHERE partner_id=? AND app_id=?`, [
        can_genkeys?1:0, can_view_users?1:0, can_ban_users?1:0, can_view_logs?1:0,
        can_reset_hwid?1:0, can_extend_sub?1:0, max_keys_per_day||50, max_key_duration||30,
        partnerId, appId
      ]);
    } else {
      // Crear
      const { v4: uuidv4 } = require('uuid');
      await db.run(`INSERT INTO partner_permissions 
        (id, partner_id, app_id, can_genkeys, can_view_users, can_ban_users, can_view_logs,
         can_reset_hwid, can_extend_sub, max_keys_per_day, max_key_duration, created_at, updated_at) 
        VALUES (?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'),strftime('%s','now'))`, [
        uuidv4(), partnerId, appId,
        can_genkeys?1:0, can_view_users?1:0, can_ban_users?1:0, can_view_logs?1:0,
        can_reset_hwid?1:0, can_extend_sub?1:0, max_keys_per_day||50, max_key_duration||30
      ]);
    }
    
    // Log de cambio de permisos
    await db.run(`INSERT INTO logs (id, app_id, message, ip_address, user_agent, created_at) 
                  VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`, [
      uuidv4(), appId, 
      `Admin ${req.admin.username} actualizó permisos del partner ${partnerId}`,
      req.ip || 'unknown', req.headers['user-agent'] || 'unknown'
    ]);
    
    res.json({ success: true, message: 'Permisos actualizados correctamente' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// ─── STATS ────────────────────────────────────────────────────────────────────

router.get('/stats', requireAdmin, async function(req, res) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Partner: stats solo de sus apps
    if (req.admin.role === 'partner') {
      const partnerApps = await db.all('SELECT app_id FROM partner_apps WHERE partner_id=?', [req.admin.id]);
      const appIds = partnerApps.map(function(p){return p.app_id;});
      if (!appIds.length) return res.json({success:true, stats:{totalApps:0,totalUsers:0,totalKeys:0,usedKeys:0,onlineUsers:0,recentLogs:[]}});
      const ph = appIds.map(function(){return '?';}).join(',');
      const totalApps   = appIds.length;
      const totalUsers  = ((await db.get('SELECT COUNT(*) as c FROM users WHERE app_id IN ('+ph+')', appIds))||{}).c||0;
      const totalKeys   = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id IN ('+ph+')', appIds))||{}).c||0;
      const usedKeys    = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE used>0 AND app_id IN ('+ph+')', appIds))||{}).c||0;
      const onlineUsers = ((await db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>? AND app_id IN ('+ph+')', [now,...appIds]))||{}).c||0;
      const recentLogs  = await db.all('SELECT * FROM logs WHERE app_id IN ('+ph+') ORDER BY created_at DESC LIMIT 10', appIds);
      return res.json({success:true, stats:{totalApps,totalUsers,totalKeys,usedKeys,onlineUsers,recentLogs}});
    }

    // Admin: stats globales
    const totalApps   = ((await db.get('SELECT COUNT(*) as c FROM apps')) || {}).c || 0;
    const totalUsers  = ((await db.get('SELECT COUNT(*) as c FROM users')) || {}).c || 0;
    const totalKeys   = ((await db.get('SELECT COUNT(*) as c FROM licenses')) || {}).c || 0;
    const usedKeys    = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE used>0')) || {}).c || 0;
    const onlineUsers = ((await db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>?', [now])) || {}).c || 0;
    const recentLogs  = await db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT 10');
    res.json({ success: true, stats: { totalApps, totalUsers, totalKeys, usedKeys, onlineUsers, recentLogs } });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── APPS ─────────────────────────────────────────────────────────────────────

router.get('/apps', requireAdmin, async function(req, res) {
  try {
    // Si es partner, solo mostrar SUS apps asignadas
    if (req.admin.role === 'partner') {
      const partnerApps = await db.all(
        'SELECT a.*, pa.can_genkeys, pa.can_users, pa.can_logs, pa.key_limit, pa.keys_used FROM apps a ' +
        'JOIN partner_apps pa ON pa.app_id=a.id WHERE pa.partner_id=? ORDER BY a.created_at DESC',
        [req.admin.id]
      );
      const result = [];
      for (const a of partnerApps) {
        result.push(Object.assign({}, a, {
          userCount: (await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [a.id])).c || 0,
          keyCount:  (await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [a.id])).c || 0,
        }));
      }
      return res.json({ success: true, apps: result });
    }
    // Admin: ver todas
    const apps = await db.all('SELECT * FROM apps ORDER BY created_at DESC');
    const result = [];
    for (const a of apps) {
      result.push(Object.assign({}, a, {
        userCount: (await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [a.id])).c || 0,
        keyCount:  (await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [a.id])).c || 0,
      }));
    }
    res.json({ success: true, apps: result });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Crear app — SOLO ADMIN
router.post('/apps', requireAdmin, adminOnly, async function(req, res) {
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

router.put('/apps/:id', requireAdmin, adminOnly, async function(req, res) {
  try {
    const app = await db.get('SELECT * FROM apps WHERE id=?', [req.params.id]);
    if (!app) return res.json({ success: false, message: 'App no encontrada' });
    const name      = req.body.name      !== undefined ? req.body.name      : app.name;
    const version   = req.body.version   !== undefined ? req.body.version   : app.version;
    const status    = req.body.status    !== undefined ? req.body.status    : app.status;
    const free_mode = req.body.free_mode !== undefined ? req.body.free_mode : app.free_mode;
    const description = req.body.description !== undefined ? req.body.description : (app.description || '');
    await db.run('UPDATE apps SET name=?,version=?,status=?,free_mode=?,description=? WHERE id=?', [name, version, status, free_mode, description, app.id]);
    res.json({ success: true, message: 'App actualizada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.delete('/apps/:id', requireAdmin, adminOnly, async function(req, res) {
  try {
    await db.run('DELETE FROM apps WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'App eliminada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ─── KEYS ─────────────────────────────────────────────────────────────────────

router.get('/apps/:appId/keys', requireAdmin, async function(req, res) {
  try {
    // Verificar permiso de partner
    if (req.admin.role === 'partner') {
      const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.admin.id, req.params.appId]);
      if (!pa) return res.status(403).json({ success: false, message: 'Sin acceso a esta app' });
    }
    const keys = await db.all('SELECT * FROM licenses WHERE app_id=? ORDER BY created_at DESC', [req.params.appId]);
    res.json({ success: true, keys });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/apps/:appId/keys', requireAdmin, async function(req, res) {
  try {
    const appId = req.params.appId;
    const app = await db.get('SELECT id FROM apps WHERE id=?', [appId]);
    if (!app) return res.json({ success: false, message: 'App no encontrada' });

    const amount = Math.min(parseInt(req.body.amount) || 1, 500);

    // Verificar permisos de partner
    if (req.admin.role === 'partner') {
      const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.admin.id, appId]);
      if (!pa) return res.status(403).json({ success: false, message: 'Sin acceso a esta app' });
      if (!pa.can_genkeys) return res.status(403).json({ success: false, message: 'No tienes permiso para generar keys' });
      // Verificar limite de keys
      if (pa.key_limit > 0) {
        const used = pa.keys_used || 0;
        if (used + amount > pa.key_limit) {
          return res.json({ success: false, message: 'Limite de keys alcanzado (' + used + '/' + pa.key_limit + '). Contacta a +51928140884 para aumentar tu limite.' });
        }
        // Incrementar contador de keys usadas
        await db.run('UPDATE partner_apps SET keys_used=keys_used+? WHERE partner_id=? AND app_id=?', [amount, req.admin.id, appId]);
      }
    }

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
    if (req.admin.role === 'partner') {
      const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.admin.id, req.params.appId]);
      if (!pa) return res.status(403).json({ success: false, message: 'Sin acceso a esta app' });
      if (!pa.can_users) return res.status(403).json({ success: false, message: 'No tienes permiso para ver usuarios' });
    }
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
    if (req.admin.role === 'partner') {
      const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.admin.id, req.params.appId]);
      if (!pa) return res.status(403).json({ success: false, message: 'Sin acceso a esta app' });
      if (!pa.can_logs) return res.status(403).json({ success: false, message: 'No tienes permiso para ver logs' });
    }
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
    partner_id   TEXT NOT NULL,
    app_id       TEXT NOT NULL,
    can_genkeys  INTEGER DEFAULT 1,
    can_users    INTEGER DEFAULT 1,
    can_logs     INTEGER DEFAULT 1,
    key_limit    INTEGER DEFAULT 0,
    keys_used    INTEGER DEFAULT 0,
    PRIMARY KEY (partner_id, app_id),
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  )`);
  // agregar columnas si no existen (migracion)
  try { await db.run('ALTER TABLE partner_apps ADD COLUMN key_limit INTEGER DEFAULT 0'); } catch(_) {}
  try { await db.run('ALTER TABLE partner_apps ADD COLUMN keys_used INTEGER DEFAULT 0'); } catch(_) {}
  try { await db.run("ALTER TABLE partners ADD COLUMN role TEXT DEFAULT 'partner'"); } catch(_) {}
  try { await db.run('ALTER TABLE partners ADD COLUMN max_bots INTEGER DEFAULT 1'); } catch(_) {}
  try { await db.run('ALTER TABLE partners ADD COLUMN max_partners INTEGER DEFAULT 0'); } catch(_) {}
  try { await db.run('ALTER TABLE partners ADD COLUMN owner_id TEXT DEFAULT NULL'); } catch(_) {}
  try { await db.run("ALTER TABLE apps ADD COLUMN description TEXT DEFAULT ''"); } catch(_) {}
  // Tabla bots por partner
  await db.run(`CREATE TABLE IF NOT EXISTS partner_discord_bots (
    id           TEXT PRIMARY KEY,
    partner_id   TEXT NOT NULL,
    app_id       TEXT NOT NULL,
    bot_token    TEXT NOT NULL DEFAULT '',
    guild_id     TEXT DEFAULT '',
    log_channel_id TEXT DEFAULT '',
    chan_online_id TEXT DEFAULT '',
    chan_users_id  TEXT DEFAULT '',
    chan_keys_id   TEXT DEFAULT '',
    active       INTEGER DEFAULT 1,
    bot_name     TEXT DEFAULT '',
    created_at   INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  )`);
})();

// Ver límite de keys de un partner
router.get('/partners/:id/limits', requireAdmin, async function(req, res) {
  try {
    const apps = await db.all(
      'SELECT a.id, a.name, pa.key_limit, pa.keys_used, pa.can_genkeys FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
      [req.params.id]
    );
    res.json({ success: true, apps });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// Actualizar límite de keys de un partner para una app
router.put('/partners/:id/limits/:appId', requireAdmin, async function(req, res) {
  try {
    const { key_limit, can_genkeys } = req.body;
    const ex = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.params.id, req.params.appId]);
    if (!ex) return res.json({ success: false, message: 'Relacion partner-app no encontrada' });
    await db.run('UPDATE partner_apps SET key_limit=?, can_genkeys=? WHERE partner_id=? AND app_id=?',
      [parseInt(key_limit) || 0, can_genkeys ? 1 : 1, req.params.id, req.params.appId]);
    res.json({ success: true, message: 'Limite actualizado' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// Resetear contador de keys usadas por partner
router.post('/partners/:id/limits/:appId/reset', requireAdmin, async function(req, res) {
  try {
    await db.run('UPDATE partner_apps SET keys_used=0 WHERE partner_id=? AND app_id=?', [req.params.id, req.params.appId]);
    res.json({ success: true, message: 'Contador reseteado' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// Listar partners — SOLO ADMIN
router.get('/partners', requireAdmin, adminOnly, async function(req, res) {
  try {
    const partners = await db.all('SELECT * FROM partners ORDER BY created_at DESC');
    const result = [];
    for (const p of partners) {
      const apps = await db.all(
        'SELECT a.id, a.name, pa.can_genkeys, pa.can_users, pa.can_logs, pa.key_limit, pa.keys_used FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
        [p.id]
      );
      const partnerData = {
        id: p.id,
        username: p.username,
        display_name: p.display_name || p.username,
        email: p.email || '',
        role: p.role || 'partner',
        active: p.active,
        max_bots: p.max_bots || 1,
        max_partners: p.max_partners || 0,
        owner_id: p.owner_id,
        last_login: p.last_login,
        created_at: p.created_at,
        apps: apps
      };
      result.push(partnerData);
    }
    res.json({ success: true, partners: result });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Crear partner — SOLO ADMIN
router.post('/partners', requireAdmin, adminOnly, async function(req, res) {
  try {
    const { username, password, display_name, email, role, app_ids, permissions } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Usuario y contrasena requeridos' });
    const ex = await db.get('SELECT id FROM partners WHERE username=?', [username]);
    if (ex) return res.json({ success: false, message: 'Username ya existe' });
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    const partnerRole = (role === 'owner') ? 'owner' : 'partner';
    await db.run('INSERT INTO partners (id,username,password,display_name,email,role) VALUES (?,?,?,?,?,?)',
      [id, username, hashed, display_name || username, email || '', partnerRole]);
    // Asociar apps CON permisos y límite de keys
    if (app_ids && app_ids.length) {
      for (const appId of app_ids) {
        const perm = (permissions && permissions[appId]) || {};
        const can_genkeys = perm.can_genkeys !== undefined ? (perm.can_genkeys ? 1 : 0) : 1;
        const can_users   = perm.can_users   !== undefined ? (perm.can_users   ? 1 : 0) : 1;
        const can_logs    = perm.can_logs    !== undefined ? (perm.can_logs    ? 1 : 0) : 1;
        const key_limit   = parseInt(perm.key_limit) || 0;
        await db.run('INSERT OR REPLACE INTO partner_apps (partner_id,app_id,can_genkeys,can_users,can_logs,key_limit,keys_used) VALUES (?,?,?,?,?,?,0)',
          [id, appId, can_genkeys, can_users, can_logs, key_limit]);
      }
    }
    const partner = await db.get('SELECT id,username,display_name,email,role,active,created_at FROM partners WHERE id=?', [id]);
    res.json({ success: true, message: 'Partner creado', partner });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Actualizar partner — SOLO ADMIN
router.put('/partners/:id', requireAdmin, adminOnly, async function(req, res) {
  try {
    const { display_name, email, active, password, role, max_bots, max_partners, app_ids, permissions } = req.body;
    const p = await db.get('SELECT * FROM partners WHERE id=?', [req.params.id]);
    if (!p) return res.json({ success: false, message: 'Partner no encontrado' });
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await db.run('UPDATE partners SET password=? WHERE id=?', [hashed, p.id]);
    }
    const partnerRole = role === 'owner' ? 'owner' : role === 'partner' ? 'partner' : p.role;
    const newMaxBots     = max_bots     !== undefined ? parseInt(max_bots)     : p.max_bots;
    const newMaxPartners = max_partners !== undefined ? parseInt(max_partners) : p.max_partners;
    await db.run('UPDATE partners SET display_name=?,email=?,active=?,role=?,max_bots=?,max_partners=? WHERE id=?',
      [display_name ?? p.display_name, email ?? p.email, active ?? p.active, partnerRole, newMaxBots, newMaxPartners, p.id]);    // Actualizar apps con permisos y límites — BUG FIX: guardar can_genkeys/can_users/can_logs/key_limit correctamente
    if (app_ids !== undefined) {
      await db.run('DELETE FROM partner_apps WHERE partner_id=?', [p.id]);
      for (const appId of (app_ids || [])) {
        const perm = (permissions && permissions[appId]) || {};
        const can_genkeys = perm.can_genkeys !== undefined ? (perm.can_genkeys ? 1 : 0) : 1;
        const can_users   = perm.can_users   !== undefined ? (perm.can_users   ? 1 : 0) : 1;
        const can_logs    = perm.can_logs    !== undefined ? (perm.can_logs    ? 1 : 0) : 1;
        const key_limit   = parseInt(perm.key_limit) || 0;
        await db.run('INSERT INTO partner_apps (partner_id,app_id,can_genkeys,can_users,can_logs,key_limit,keys_used) VALUES (?,?,?,?,?,?,0)',
          [p.id, appId, can_genkeys, can_users, can_logs, key_limit]);
      }
    }
    res.json({ success: true, message: 'Partner actualizado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Eliminar partner — SOLO ADMIN
router.delete('/partners/:id', requireAdmin, adminOnly, async function(req, res) {
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


// ─── OWNER: crear sub-partners (solo si role=owner y dentro de su limite) ─────

router.post('/owner/partners', requireAdmin, async function(req, res) {
  try {
    if (req.admin.role !== 'partner') return res.status(403).json({ success: false, message: 'Solo partners con rol owner pueden hacer esto' });
    // Verificar que es owner
    const me = await db.get('SELECT * FROM partners WHERE id=?', [req.admin.id]);
    if (!me || me.role !== 'owner') return res.status(403).json({ success: false, message: 'Solo owners pueden crear sub-partners' });

    // Verificar limite
    const maxPartners = me.max_partners || 0;
    if (maxPartners === 0) return res.status(403).json({ success: false, message: 'No tienes permiso para crear partners. Contacta al admin.' });
    const existingCount = await db.get('SELECT COUNT(*) as c FROM partners WHERE owner_id=?', [me.id]);
    const count = (existingCount && existingCount.c) || 0;
    if (count >= maxPartners) return res.json({ success: false, message: 'Limite alcanzado: puedes crear maximo ' + maxPartners + ' partner(s). Tienes ' + count + '.' });

    const { username, password, display_name, permissions } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Usuario y contrasena requeridos' });
    const ex = await db.get('SELECT id FROM partners WHERE username=?', [username]);
    if (ex) return res.json({ success: false, message: 'Username ya existe' });

    // OBTENER TODAS LAS APPS DEL OWNER (automáticamente)
    const myApps = await db.all('SELECT * FROM partner_apps WHERE partner_id=?', [me.id]);
    if (!myApps.length) return res.json({ success: false, message: 'No tienes apps asignadas. No puedes crear sub-partners sin apps.' });

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO partners (id,username,password,display_name,role,owner_id) VALUES (?,?,?,?,?,?)',
      [id, username, hashed, display_name || username, 'partner', me.id]);

    // COPIAR TODAS LAS APPS DEL OWNER al sub-partner con los mismos permisos
    for (const ownerApp of myApps) {
      const perm = (permissions && permissions[ownerApp.app_id]) || {};
      // Sub-partner hereda permisos del owner (o se pueden personalizar desde el frontend)
      const can_genkeys = perm.can_genkeys !== undefined ? (perm.can_genkeys ? 1 : 0) : (ownerApp.can_genkeys || 1);
      const can_users   = perm.can_users   !== undefined ? (perm.can_users   ? 1 : 0) : (ownerApp.can_users || 1);
      const can_logs    = perm.can_logs    !== undefined ? (perm.can_logs    ? 1 : 0) : (ownerApp.can_logs || 1);
      
      // key_limit del sub-partner: si el owner tiene límite, el sub-partner puede tener hasta lo que queda disponible
      const ownerLimit  = ownerApp.key_limit || 0;
      const ownerUsed   = ownerApp.keys_used || 0;
      const ownerLeft   = ownerLimit > 0 ? Math.max(0, ownerLimit - ownerUsed) : 0;
      const reqLimit    = parseInt(perm.key_limit) || 0;
      const key_limit   = ownerLimit > 0 ? Math.min(reqLimit || ownerLeft, ownerLeft) : reqLimit;
      
      await db.run('INSERT OR REPLACE INTO partner_apps (partner_id,app_id,can_genkeys,can_users,can_logs,key_limit,keys_used) VALUES (?,?,?,?,?,?,0)',
        [id, ownerApp.app_id, can_genkeys, can_users, can_logs, key_limit]);
    }
    
    res.json({ success: true, message: 'Sub-partner "' + username + '" creado con ' + myApps.length + ' app(s) asignada(s) (' + (count+1) + '/' + maxPartners + ')' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Listar sub-partners creados por este owner
router.get('/owner/partners', requireAdmin, async function(req, res) {
  try {
    if (req.admin.role !== 'partner') return res.status(403).json({ success: false, message: 'Solo partners' });
    const me = await db.get('SELECT * FROM partners WHERE id=?', [req.admin.id]);
    if (!me || me.role !== 'owner') return res.status(403).json({ success: false, message: 'Solo owners' });

    const partners = await db.all('SELECT id,username,display_name,role,active,last_login,created_at FROM partners WHERE owner_id=? ORDER BY created_at DESC', [me.id]);
    const result = [];
    for (const p of partners) {
      const apps = await db.all(
        'SELECT a.id, a.name, pa.can_genkeys, pa.can_users, pa.can_logs, pa.key_limit, pa.keys_used FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
        [p.id]
      );
      result.push(Object.assign({}, p, { apps }));
    }
    const maxPartners = me.max_partners || 0;
    res.json({ success: true, partners: result, used: result.length, max: maxPartners });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Eliminar sub-partner (owner solo puede eliminar los suyos)
router.delete('/owner/partners/:id', requireAdmin, async function(req, res) {
  try {
    if (req.admin.role !== 'partner') return res.status(403).json({ success: false, message: 'Solo partners' });
    const me = await db.get('SELECT * FROM partners WHERE id=?', [req.admin.id]);
    if (!me || me.role !== 'owner') return res.status(403).json({ success: false, message: 'Solo owners' });
    const target = await db.get('SELECT * FROM partners WHERE id=? AND owner_id=?', [req.params.id, me.id]);
    if (!target) return res.json({ success: false, message: 'Partner no encontrado o no te pertenece' });
    await db.run('DELETE FROM partners WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Sub-partner eliminado' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Ver mis apps (como owner/partner) con info de permisos y limites
router.get('/owner/me', requireAdmin, async function(req, res) {
  try {
    if (req.admin.role !== 'partner') return res.status(403).json({ success: false, message: 'Solo partners' });
    const me = await db.get('SELECT id,username,display_name,role,max_bots,max_partners,active FROM partners WHERE id=?', [req.admin.id]);
    if (!me) return res.status(403).json({ success: false, message: 'Partner no encontrado' });
    const apps = await db.all(
      'SELECT a.id, a.name, a.version, pa.can_genkeys, pa.can_users, pa.can_logs, pa.key_limit, pa.keys_used FROM partner_apps pa JOIN apps a ON a.id=pa.app_id WHERE pa.partner_id=?',
      [me.id]
    );
    // Contar bots activos
    const botCount = await db.get('SELECT COUNT(*) as c FROM partner_discord_bots WHERE partner_id=? AND active=1', [me.id]);
    res.json({ success: true, me: Object.assign({}, me, { apps, bot_count: (botCount && botCount.c) || 0 }) });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
