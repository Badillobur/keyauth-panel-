require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Confiar en el proxy de Render/Railway (necesario para rate limiting e IPs reales)
app.set('trust proxy', 1);

// Archivos estaticos PRIMERO - antes de helmet y cualquier middleware
app.use('/admin', express.static(path.join(__dirname, '../public/admin'), {
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js'))  res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html');
  }
}));

// Seguridad (despues de estaticos)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting para la API publica
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Demasiadas peticiones, intenta mas tarde' }
});
app.use('/api/1.2', apiLimiter);

// Rate limiting para el panel admin
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use('/api/admin', adminLimiter);

// Rutas API publica (compatible KeyAuth)
app.use('/api', require('./routes/api'));

// SDK download — publico, sin auth, para que clientes descarguen LMAx27Auth.hpp
app.get('/sdk/LMAx27Auth.hpp', function(req, res) {
  var p = require('path').join(__dirname, '../public/sdk/LMAx27Auth.hpp');
  res.setHeader('Content-Disposition', 'attachment; filename="LMAx27Auth.hpp"');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(p);
});
// Headers del SDK (para quienes compraron la lib)
app.get('/sdk/LMAx27Auth.h', function(req, res) {
  var p = require('path').join(__dirname, '../public/sdk/LMAx27Auth.h');
  res.setHeader('Content-Disposition', 'attachment; filename="LMAx27Auth.h"');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(p);
});
app.get('/sdk/LMAx27Enc.h', function(req, res) {
  var p = require('path').join(__dirname, '../public/sdk/LMAx27Enc.h');
  res.setHeader('Content-Disposition', 'attachment; filename="LMAx27Enc.h"');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(p);
});
app.get('/sdk/LMAx27Auth.lib', function(req, res) {
  var p = require('path').join(__dirname, '../public/sdk/LMAx27Auth.lib');
  res.setHeader('Content-Disposition', 'attachment; filename="LMAx27Auth.lib"');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(p);
});
// También accesible desde el panel admin
app.get('/api/admin/sdk/download', function(req, res) {
  var p = require('path').join(__dirname, '../public/sdk/LMAx27Auth.h');
  res.setHeader('Content-Disposition', 'attachment; filename="LMAx27Auth.h"');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(p);
});

// Rutas API del panel admin
app.use('/api/admin', require('./routes/admin'));

// Rutas Discord bot
const discordRouter = require('./routes/discord');
app.use('/api/admin/discord', discordRouter);

// Ruta raiz -> redirigir al panel
app.get('/', function(req, res) { res.redirect('/login'); });

// URLs limpias y profesionales
app.get('/login',     function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/login.html')); });
app.get('/panel',     function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/index.html')); });
app.get('/apps',      function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/apps.html')); });
app.get('/keys',      function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/keys.html')); });
app.get('/users',     function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/users.html')); });
app.get('/logs',      function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/logs.html')); });
app.get('/vars',      function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/vars.html')); });
app.get('/partners',  function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/partners.html')); });
app.get('/files',     function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/files.html')); });
app.get('/discord',   function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/discord.html')); });
app.get('/docs',      function(req, res) { res.sendFile(require('path').join(__dirname, '../public/admin/api-docs.html')); });

// Ruta de salud
app.get('/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Descargas publicas /d/:code ─────────────────────────────────────────────
app.get('/d/:code', async function(req, res) {
  try {
    const db = require('./db/database');
    const file = await db.get('SELECT * FROM download_files WHERE code=? AND active=1', [req.params.code]);
    if (!file) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>LMAx27 - No encontrado</title>
        <style>body{background:#0a0a0a;color:#eab308;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;}
        h1{font-size:24px;}p{color:#666;}</style></head>
        <body><h1>LMAx27</h1><p>Archivo no encontrado o desactivado.</p></body></html>`);
    }
    // Incrementar contador
    await db.run('UPDATE download_files SET downloads=downloads+1 WHERE id=?', [file.id]);

    // Convertir links de Google Drive a descarga directa
    let downloadUrl = file.url;
    const driveMatch = downloadUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      downloadUrl = 'https://drive.google.com/uc?export=download&confirm=t&id=' + driveMatch[1];
    }

    // Para otros links — mandar página HTML que descarga automáticamente
    res.send(`<!DOCTYPE html><html><head><title>LMAx27 - Descargando...</title>
      <style>body{background:#0a0a0a;color:#eab308;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
      .spinner{width:40px;height:40px;border:3px solid #222;border-top-color:#eab308;border-radius:50%;animation:spin 1s linear infinite;}
      @keyframes spin{to{transform:rotate(360deg)}}
      h2{margin:0;font-size:18px;}p{color:#666;font-size:13px;margin:0;}</style>
      <script>window.onload = function(){ window.location.href = '${downloadUrl.replace(/'/g,"\\'")}'; };</script>
      </head><body>
      <div class="spinner"></div>
      <h2>LMAx27</h2>
      <p>Descargando ${file.name}...</p>
      <p style="font-size:11px;color:#444;">Si no inicia, <a href="${downloadUrl.replace(/'/g,"\\'")}}" style="color:#eab308;">haz click aqui</a></p>
      </body></html>`);
  } catch(e) {
    res.status(500).send('Error interno');
  }
});

// Ver owner_id del admin actual (util para configurar el C++)
app.get('/ownerid', async function(req, res) {
  try {
    const db = require('./db/database');
    const admin = await db.get('SELECT id, username FROM admins LIMIT 1');
    res.json({ ownerid: admin ? admin.id : 'no admin found', username: admin ? admin.username : '' });
  } catch(e) { res.json({ error: e.message }); }
});

// Auto-ping para mantener el servidor activo en Render plan gratuito
// Render duerme después de 15min de inactividad — ping cada 5min lo previene
if (process.env.NODE_ENV === 'production') {
  const https = require('https');
  const http  = require('http');

  function pingServer() {
    const url = process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + PORT);
    const lib = url.startsWith('https') ? https : http;
    lib.get(url + '/health', function(r) {
      console.log('[Keep-alive] Ping OK -', r.statusCode, new Date().toISOString());
    }).on('error', function(e) {
      console.log('[Keep-alive] Ping error:', e.message);
    });
  }

  // Ping cada 4 minutos (Render duerme a los 15min, esto lo previene con margen)
  setInterval(pingServer, 4 * 60 * 1000);

  // Ping inmediato al arrancar
  setTimeout(pingServer, 10000);
}

// Diagnóstico (solo en desarrollo o con clave)
app.get('/debug-env', function(req, res) {
  res.json({
    node_env:   process.env.NODE_ENV || 'undefined',
    port:       process.env.PORT || 'undefined',
    admin_user: process.env.ADMIN_USERNAME || 'undefined',
    admin_pass: process.env.ADMIN_PASSWORD ? '***SET***' : 'NOT SET (default: admin123)',
    jwt_secret: process.env.JWT_SECRET ? '***SET***' : 'NOT SET (using fallback)'
  });
});

// 404
app.use(function(req, res) {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// Error handler
app.use(function(err, req, res, next) {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('');
  console.log('  LMAx27 Panel v2.0 - Sistema de Licenciamiento');
  console.log('  Entorno : ' + (isProd ? 'PRODUCCION' : 'desarrollo'));
  console.log('  Puerto  : ' + PORT);
  if (!isProd) {
    console.log('  Panel   : http://localhost:' + PORT + '/admin/login.html');
    console.log('  API     : http://localhost:' + PORT + '/api/1.2/');
  }
  console.log('');
});

module.exports = app;
