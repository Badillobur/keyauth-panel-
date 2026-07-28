/**
 * API pública LMAx27 — /api/1.2/
 * SEGURIDAD: Cada request DEBE venir firmada con HMAC-SHA256 usando la lib LMAx27Auth.hpp
 * Firma: HMAC-SHA256(app.secret, timestamp + "|" + ownerid + "|" + type)
 * Sin firma válida → rechazado con 403
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Notificaciones Discord
let notifyDiscord = function() {};
try { notifyDiscord = require('./discord').notifyDiscord; } catch(_) {}

// ─── Constantes de seguridad ──────────────────────────────────────────────────
// Versión de lib aceptada — debe coincidir con LMAX_LIB_VERSION en LMAx27Auth.hpp
const VALID_LIB_VERSIONS = ['LMAx27-lib-v1'];
// Ventana de tiempo permitida para el timestamp (±5 minutos)
const SIG_TOLERANCE_SECS = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] || req.socket.remoteAddress || '0.0.0.0';
}

function genSession() {
  return crypto.randomBytes(32).toString('hex');
}

function ok(res, msg, extra)   { return res.json(Object.assign({ success: true,  message: msg }, extra || {})); }
function fail(res, msg, extra) { return res.json(Object.assign({ success: false, message: msg }, extra || {})); }

async function addLog(appId, username, action, ip) {
  try {
    await db.run(
      'INSERT INTO logs (id,app_id,username,action,ip) VALUES (?,?,?,?,?)',
      [uuidv4(), appId, username || 'system', action, ip || '']
    );
  } catch(_) {}
}

// ─── Verificar firma HMAC de la lib ──────────────────────────────────────────
// Retorna true si la firma es válida, false si no
function verifyLibSignature(secret, timestamp, ownerid, type, sig) {
  if (!sig || !timestamp) return false;

  // Verificar que el timestamp no sea muy viejo ni del futuro
  const now = Math.floor(Date.now() / 1000);
  const ts  = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > SIG_TOLERANCE_SECS) return false;

  // Calcular HMAC esperado: HMAC-SHA256(secret, timestamp|ownerid|type)
  const msg      = timestamp + '|' + ownerid + '|' + type;
  const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');

  // Comparación segura contra timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig,      'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch(_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/1.2/
// ─────────────────────────────────────────────────────────────────────────────
router.post('/1.2/', async function(req, res) {
  try {
    const body    = req.body;
    const type    = body.type;
    const name    = body.name;
    const ownerid = body.ownerid;
    const sig     = body.sig;
    const ts      = body.timestamp;
    const libver  = body.libver;
    const ip      = getIP(req);

    // ── Params básicos ────────────────────────────────────────────────────────
    if (!type || !name || !ownerid) {
      return fail(res, 'Parametros requeridos faltantes');
    }

    // ── Verificar versión de lib ───────────────────────────────────────────────
    // init no requiere sig (es la primera llamada) pero SÍ requiere libver
    if (type !== 'init') {
      if (!libver || !VALID_LIB_VERSIONS.includes(libver)) {
        return fail(res, 'Lib no autorizada. Usa LMAx27Auth.hpp oficial.');
      }
    }

    // ── Obtener app ───────────────────────────────────────────────────────────
    const app = await db.get(
      'SELECT * FROM apps WHERE name=? AND owner_id=?',
      [name, ownerid]
    );
    if (!app) return fail(res, 'Aplicacion no encontrada');
    if (!app.status) return fail(res, 'Aplicacion deshabilitada');

    // ── Verificar firma HMAC (todas las calls excepto init) ───────────────────
    // init no puede verificar porque aún no tenemos el secret en el cliente
    // (podría ser un primer init sin secret, pero lo protegemos con libver)
    if (type !== 'init') {
      if (!verifyLibSignature(app.secret, ts, ownerid, type, sig)) {
        await addLog(app.id, 'system',
          'Intento de acceso sin firma valida [' + type + '] desde ' + ip, ip);
        return res.status(403).json({
          success: false,
          message: 'Firma invalida. Solo se permite acceso desde LMAx27Auth.hpp oficial.'
        });
      }
    }

    const now       = Math.floor(Date.now() / 1000);
    const sessionid = body.sessionid;

    // ── SESSION helper ────────────────────────────────────────────────────────
    async function getSession() {
      if (!sessionid) return null;
      return await db.get(
        'SELECT * FROM sessions WHERE session_key=? AND app_id=? AND expires_at>?',
        [sessionid, app.id, now]
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'init') {
      // Para init verificamos solo que venga con libver correcto
      if (!libver || !VALID_LIB_VERSIONS.includes(libver)) {
        return fail(res, 'Lib no autorizada. Usa LMAx27Auth.hpp oficial.');
      }

      const ver = body.ver;
      if (ver && app.version !== ver) {
        return fail(res, 'Version desactualizada. Version actual: ' + app.version,
          { newver: app.version });
      }

      const sessionKey = genSession();
      const expiresAt  = now + 1800;
      await db.run(
        'INSERT INTO sessions (id,app_id,session_key,ip,initialized,expires_at) VALUES (?,?,?,?,1,?)',
        [uuidv4(), app.id, sessionKey, ip, expiresAt]
      );
      await addLog(app.id, 'system', 'App inicializada desde ' + ip, ip);

      const numUsers  = ((await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [app.id])) || {}).c || 0;
      const numOnline = ((await db.get('SELECT COUNT(*) as c FROM sessions WHERE app_id=? AND expires_at>?', [app.id, now])) || {}).c || 0;
      const numKeys   = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [app.id])) || {}).c || 0;

      return ok(res, 'Sesion iniciada', {
        sessionid: sessionKey,
        appinfo: {
          numUsers: String(numUsers),
          numOnlineUsers: String(numOnline),
          numKeys: String(numKeys),
          version: app.version,
          customerPanelLink: ''
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'login') {
      const { username, pass, hwid } = body;
      if (!sessionid || !username || !pass) return fail(res, 'Parametros faltantes');
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida o expirada');

      const user = await db.get(
        'SELECT * FROM users WHERE app_id=? AND username=?',
        [app.id, username]
      );
      if (!user) return fail(res, 'Usuario no encontrado');
      if (user.banned) return fail(res, 'Cuenta baneada: ' + (user.ban_reason || ''));

      const valid = await bcrypt.compare(pass, user.password);
      if (!valid) {
        await addLog(app.id, username, 'Login fallido - contraseña incorrecta', ip);
        return fail(res, 'Contrasena incorrecta');
      }

      const sub = await db.get(
        'SELECT * FROM subscriptions WHERE user_id=? AND app_id=? AND (expiry IS NULL OR expiry>?)',
        [user.id, app.id, now]
      );
      if (!sub) return fail(res, 'Suscripcion expirada');

      // HWID check
      if (hwid) {
        if (user.hwid && user.hwid !== '' && user.hwid !== hwid) {
          await addLog(app.id, username, 'Login bloqueado - HWID diferente', ip);
          return fail(res, 'HWID no coincide');
        }
        if (!user.hwid || user.hwid === '') {
          await db.run('UPDATE users SET hwid=? WHERE id=?', [hwid, user.id]);
        }
      }

      await db.run('UPDATE users SET lastlogin=?,ip=? WHERE id=?', [now, ip, user.id]);
      await db.run('UPDATE sessions SET user_id=?,hwid=? WHERE session_key=?',
        [user.id, hwid || '', sessionid]);
      await addLog(app.id, username, 'Login exitoso', ip);

      notifyDiscord('login', {
        title: 'Login Exitoso',
        description: '**' + username + '** inicio sesion',
        fields: [
          { name: 'App', value: app.name, inline: true },
          { name: 'IP', value: ip, inline: true }
        ],
        app: app.name
      });

      const subs = (await db.all(
        'SELECT name,expiry FROM subscriptions WHERE user_id=? AND app_id=?',
        [user.id, app.id]
      )).map(function(s) {
        return { name: s.name, expiry: s.expiry ? String(s.expiry) : '0' };
      });

      return ok(res, 'Login exitoso', {
        info: {
          username: user.username,
          ip,
          hwid: user.hwid || hwid || '',
          createdate: String(user.createdate),
          lastlogin: String(now),
          subscriptions: subs
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTER
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'register') {
      const { username, pass, key, email, hwid } = body;
      if (!sessionid || !username || !pass || !key) return fail(res, 'Parametros faltantes');
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida o expirada');

      const license = await db.get(
        'SELECT * FROM licenses WHERE app_id=? AND key_value=?',
        [app.id, key]
      );
      if (!license) return fail(res, 'Licencia invalida');
      if (license.used >= license.max_uses) return fail(res, 'Licencia ya fue usada');

      const existing = await db.get(
        'SELECT id FROM users WHERE app_id=? AND username=?',
        [app.id, username]
      );
      if (existing) return fail(res, 'El nombre de usuario ya existe');

      const hashed = await bcrypt.hash(pass, 10);
      const userId = uuidv4();
      await db.run(
        'INSERT INTO users (id,app_id,username,password,email,ip,hwid,createdate) VALUES (?,?,?,?,?,?,?,?)',
        [userId, app.id, username, hashed, email || '', ip, hwid || '', now]
      );

      let expiry = null;
      if (license.duration) expiry = now + (license.duration * 86400);
      else if (license.expiry) expiry = license.expiry;

      await db.run(
        'INSERT INTO subscriptions (id,user_id,app_id,name,expiry,level) VALUES (?,?,?,?,?,?)',
        [uuidv4(), userId, app.id, 'default', expiry, license.level]
      );
      await db.run(
        'UPDATE licenses SET used=used+1,used_by=?,used_at=? WHERE id=?',
        [username, now, license.id]
      );
      await db.run(
        'UPDATE sessions SET user_id=?,hwid=? WHERE session_key=?',
        [userId, hwid || '', sessionid]
      );
      await addLog(app.id, username, 'Registro exitoso', ip);

      notifyDiscord('register', {
        title: 'Nuevo Registro',
        description: '**' + username + '** se registro',
        fields: [
          { name: 'App', value: app.name, inline: true },
          { name: 'Key', value: key.substring(0, 10) + '...', inline: true },
          { name: 'IP', value: ip, inline: true }
        ],
        app: app.name
      });

      return ok(res, 'Registro exitoso', {
        info: {
          username, ip,
          hwid: hwid || '',
          createdate: String(now),
          lastlogin: String(now),
          subscriptions: [{ name: 'default', expiry: expiry ? String(expiry) : '0' }]
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LICENSE (activar por key)
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'license') {
      const { key, hwid } = body;
      if (!sessionid || !key) return fail(res, 'Parametros faltantes');
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida o expirada');

      const license = await db.get(
        'SELECT * FROM licenses WHERE app_id=? AND key_value=?',
        [app.id, key]
      );
      if (!license) return fail(res, 'Licencia invalida');
      if (license.expiry && license.expiry < now) return fail(res, 'Licencia expirada');
      if (license.used >= license.max_uses) return fail(res, 'Licencia agotada');

      await db.run(
        'UPDATE licenses SET used=used+1,used_by=?,used_at=? WHERE id=?',
        ['key-only', now, license.id]
      );
      await db.run(
        'UPDATE sessions SET hwid=? WHERE session_key=?',
        [hwid || '', sessionid]
      );
      await addLog(app.id, 'key-only', 'Licencia activada', ip);

      return ok(res, 'Licencia valida', {
        info: {
          username: 'key-only', ip,
          hwid: hwid || '',
          createdate: String(now),
          lastlogin: String(now),
          subscriptions: [{ name: 'default', expiry: license.expiry ? String(license.expiry) : '0' }]
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'check') {
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida o expirada');
      return ok(res, 'Sesion valida');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECKBLACKLIST
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'checkblacklist') {
      const banned = await db.get(
        'SELECT id FROM users WHERE app_id=? AND banned=1 AND (hwid=? OR ip=?)',
        [app.id, body.hwid || '', ip]
      );
      if (banned) return fail(res, 'HWID o IP en blacklist');
      return ok(res, 'No esta en blacklist');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VAR (variable de la app, solo lectura)
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'var') {
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida');
      const v = await db.get(
        'SELECT var_value FROM app_vars WHERE app_id=? AND var_key=?',
        [app.id, body.varid]
      );
      if (!v) return fail(res, 'Variable no encontrada');
      return ok(res, 'Variable obtenida', { message: v.var_value });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SETVAR / GETVAR (variables de usuario)
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'setvar') {
      const session = await getSession();
      if (!session || !session.user_id) return fail(res, 'Sesion invalida');
      const varKey = body.var; const vardata = body.vardata;
      if (!varKey || vardata === undefined) return fail(res, 'Parametros faltantes');
      const ex = await db.get(
        'SELECT id FROM user_vars WHERE user_id=? AND var_key=?',
        [session.user_id, varKey]
      );
      if (ex) {
        await db.run('UPDATE user_vars SET var_value=? WHERE user_id=? AND var_key=?',
          [vardata, session.user_id, varKey]);
      } else {
        await db.run(
          'INSERT INTO user_vars (id,user_id,app_id,var_key,var_value) VALUES (?,?,?,?,?)',
          [uuidv4(), session.user_id, app.id, varKey, vardata]
        );
      }
      return ok(res, 'Variable guardada');
    }

    if (type === 'getvar') {
      const session = await getSession();
      if (!session || !session.user_id) return fail(res, 'Sesion invalida');
      const v = await db.get(
        'SELECT var_value FROM user_vars WHERE user_id=? AND var_key=?',
        [session.user_id, body.var]
      );
      if (!v) return fail(res, 'Variable no encontrada');
      return ok(res, 'Variable obtenida', { message: v.var_value });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BAN
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'ban') {
      const session = await getSession();
      if (!session || !session.user_id) return fail(res, 'Sesion invalida');
      await db.run('UPDATE users SET banned=1,ban_reason=? WHERE id=?',
        [body.reason || '', session.user_id]);
      await db.run('DELETE FROM sessions WHERE session_key=?', [sessionid]);
      await addLog(app.id, 'system', 'Usuario baneado: ' + (body.reason || ''), ip);
      return ok(res, 'Usuario baneado');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOG
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'log') {
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida');
      let uname = 'system';
      if (session.user_id) {
        const u = await db.get('SELECT username FROM users WHERE id=?', [session.user_id]);
        if (u) uname = u.username;
      }
      await addLog(app.id, uname, body.message || 'log', ip);
      return ok(res, 'Log guardado');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FETCHONLINE / FETCHSTATS
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'fetchonline') {
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida');
      const c = ((await db.get(
        'SELECT COUNT(*) as c FROM sessions WHERE app_id=? AND expires_at>?',
        [app.id, now]
      )) || {}).c || 0;
      return ok(res, 'Online obtenido', { message: String(c) });
    }

    if (type === 'fetchstats') {
      const session = await getSession();
      if (!session) return fail(res, 'Sesion invalida');
      const nU = ((await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [app.id])) || {}).c || 0;
      const nO = ((await db.get('SELECT COUNT(*) as c FROM sessions WHERE app_id=? AND expires_at>?', [app.id, now])) || {}).c || 0;
      const nK = ((await db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [app.id])) || {}).c || 0;
      return ok(res, 'Stats obtenidos', {
        appinfo: {
          numUsers: String(nU), numOnlineUsers: String(nO),
          numKeys: String(nK), version: app.version, customerPanelLink: ''
        }
      });
    }

    return fail(res, 'Tipo de accion desconocido: ' + type);

  } catch (err) {
    console.error('[API 1.2 Error]', err);
    return fail(res, 'Error interno del servidor');
  }
});

module.exports = router;
