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

// Rutas API del panel admin
app.use('/api/admin', require('./routes/admin'));

// Rutas Discord bot
const discordRouter = require('./routes/discord');
app.use('/api/admin/discord', discordRouter);

// Ruta raiz -> redirigir al panel
app.get('/', function(req, res) {
  res.redirect('/admin/login.html');
});

// Ruta de salud
app.get('/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
