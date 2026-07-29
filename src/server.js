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

// ─── Upload de archivos con multer ───────────────────────────────────────────
const multer  = require('multer');
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Usar /tmp que siempre existe en Render
    const dir = require('os').tmpdir() + '/lmax27-uploads';
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    // Mantener nombre original con timestamp para evitar colisiones
    const ext  = require('path').extname(file.originalname);
    const base = require('path').basename(file.originalname, ext)
                   .replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    cb(null, base + '_' + Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// POST /api/admin/files/upload — subir archivo real
app.post('/api/admin/files/upload', async function(req, res) {
  // Verificar token admin primero
  const jwt = require('jsonwebtoken');
  const { SECRET } = require('./middleware/auth');
  const token = (req.cookies && req.cookies.admin_token) ||
    (req.headers.authorization && req.headers.authorization.replace('Bearer ',''));
  if (!token) return res.json({ success: false, message: 'No autorizado' });
  try { jwt.verify(token, SECRET); } catch(_) { return res.json({ success: false, message: 'Token invalido' }); }

  upload.single('file')(req, res, async function(err) {
    if (err) return res.json({ success: false, message: 'Error al subir: ' + err.message });
    if (!req.file) return res.json({ success: false, message: 'No se recibio ningun archivo' });

    const db = require('./db/database');
    const { v4: uuidv4 } = require('uuid');
    const name    = req.body.name || req.file.originalname;
    const rawCode = req.body.code || name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,40);
    const code    = rawCode.replace(/[^a-z0-9-]/g,'');
    const version = req.body.version || '';
    const desc    = req.body.description || '';

    // Verificar código único
    const existing = await db.get('SELECT id FROM download_files WHERE code=?', [code]);
    if (existing) {
      require('fs').unlinkSync(req.file.path);
      return res.json({ success: false, message: 'El codigo ya existe, usa otro nombre' });
    }

    const id = uuidv4();
    // Guardar ruta del archivo en lugar de URL externa
    await db.run('INSERT INTO download_files (id,name,code,url,description,version,active) VALUES (?,?,?,?,?,?,1)',
      [id, name, code, '__LOCAL__:' + req.file.path, desc, version]);

    const file = await db.get('SELECT * FROM download_files WHERE id=?', [id]);
    res.json({ success: true, message: 'Archivo subido', file });
  });
});
app.get('/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Descargas publicas /:code (URL limpia: lmax27.shop/nombre-archivo) ───────
app.get('/d/:code', async function(req, res) { handleDownload(req.params.code, res); });
app.get('/:code([a-z0-9][a-z0-9-]{2,39})', async function(req, res, next) {
  // Solo interceptar si parece un código de archivo (no rutas del sistema)
  const reserved = ['login','panel','apps','keys','users','logs','vars','partners','files','discord','docs','health','ownerid','debug-env','api','admin','sdk'];
  if (reserved.includes(req.params.code)) return next();
  handleDownload(req.params.code, res, next);
});

async function handleDownload(code, res, next) {
  try {
    const db = require('./db/database');
    const file = await db.get('SELECT * FROM download_files WHERE code=? AND active=1', [code]);
    if (!file) {
      if (next) return next();
      return res.status(404).send(`<!DOCTYPE html><html><head><title>LMAx27 - No encontrado</title>
        <style>body{background:#0a0a0a;color:#eab308;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;}
        h2{margin:0;}p{color:#666;font-size:13px;}</style></head>
        <body><h2>LMAx27</h2><p>Archivo no encontrado o desactivado.</p></body></html>`);
    }
    await db.run('UPDATE download_files SET downloads=downloads+1 WHERE id=?', [file.id]);

    // ── Archivo local subido directamente ─────────────────────────────────
    if (file.url && file.url.startsWith('__LOCAL__:')) {
      const filePath = file.url.replace('__LOCAL__:', '');
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        return res.status(410).send(`<!DOCTYPE html><html><head><title>LMAx27</title>
          <style>body{background:#0a0a0a;color:#eab308;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;}
          h2{margin:0;}p{color:#666;font-size:13px;}</style></head>
          <body><h2>LMAx27</h2><p>El archivo ya no esta disponible. Contacta al administrador.</p></body></html>`);
      }
      const origName = require('path').basename(filePath).replace(/_\d+(\.[^.]+)$/, '$1');
      res.setHeader('Content-Disposition', 'attachment; filename="' + origName + '"');
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.sendFile(filePath);
    }

    // ── Enlace externo (Google Drive, etc.) ───────────────────────────────
    let downloadUrl = file.url;
    const driveMatch = downloadUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      downloadUrl = 'https://drive.google.com/uc?export=download&confirm=t&id=' + driveMatch[1];
    }

    const safeName = (file.name || 'archivo').replace(/'/g, "\\'");
    const safeUrl  = downloadUrl.replace(/'/g, "\\'").replace(/}/g, '');
    res.send(`<!DOCTYPE html><html><head><title>LMAx27 - Descargando ${safeName}...</title>
      <meta charset="UTF-8"/>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a0a;color:#eab308;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;}
        .logo{font-size:28px;font-weight:900;letter-spacing:2px;}
        .sub{color:#555;font-size:13px;}
        .card{background:#111;border:1px solid #222;border-radius:12px;padding:28px 36px;text-align:center;min-width:320px;}
        .filename{font-size:15px;font-weight:600;color:#fff;margin:8px 0 20px 0;word-break:break-all;}
        .bar-wrap{background:#1a1a1a;border-radius:8px;height:8px;overflow:hidden;margin-bottom:8px;}
        .bar{background:linear-gradient(90deg,#eab308,#f59e0b);height:8px;border-radius:8px;width:0%;transition:width .4s ease;}
        .pct{font-size:12px;color:#555;}
        .status{font-size:12px;color:#eab308;margin-top:8px;}
        .fallback{margin-top:16px;font-size:11px;color:#333;}
        .fallback a{color:#eab308;text-decoration:none;}
        .fallback a:hover{text-decoration:underline;}
      </style>
    </head><body>
      <div class="card">
        <div class="logo">LMAx27</div>
        <div class="filename">${safeName}</div>
        <div class="bar-wrap"><div class="bar" id="bar"></div></div>
        <div class="pct" id="pct">Iniciando descarga...</div>
        <div class="status" id="status">Conectando al servidor...</div>
        <div class="fallback">Si no inicia, <a href="${safeUrl}">haz click aqui</a></div>
      </div>
      <script>
        var url = '${safeUrl}';
        var bar = document.getElementById('bar');
        var pct = document.getElementById('pct');
        var status = document.getElementById('status');
        var progress = 0;

        // Simular progreso visual mientras descarga
        function simulate() {
          if (progress < 90) {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            bar.style.width = progress + '%';
            pct.textContent = Math.floor(progress) + '%';
          }
        }
        var interval = setInterval(simulate, 300);

        // Iniciar descarga real
        setTimeout(function() {
          status.textContent = 'Descargando...';
          // Crear link oculto para forzar descarga
          var a = document.createElement('a');
          a.href = url;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();

          // Completar barra después de un momento
          setTimeout(function() {
            clearInterval(interval);
            progress = 100;
            bar.style.width = '100%';
            pct.textContent = '100%';
            status.textContent = 'Descarga iniciada correctamente';
            status.style.color = '#22c55e';
          }, 2000);
        }, 800);
      </script>
    </body></html>`);
  } catch(e) {
    if (next) return next();
    res.status(500).send('Error interno');
  }
}

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
