const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret_keyauth_2025';

function requireAdmin(req, res, next) {
  try {
    const token = (req.cookies && req.cookies.admin_token) ||
      (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) {
      return res.status(401).json({ success: false, message: 'No autorizado' });
    }

    const decoded = jwt.verify(token, SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalido o expirado' });
  }
}

module.exports = { requireAdmin, SECRET };
