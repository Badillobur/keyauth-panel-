const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'lmax27_secret_2025_xK9mP2qL8nR4vT7w';

function requireAdmin(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies.admin_token) ||
      (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', ''));

    if (!token) {
      return res.status(401).json({ success: false, message: 'No autorizado — inicia sesion' });
    }

    const decoded = jwt.verify(token, SECRET);

    // Token expiro
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return res.status(401).json({ success: false, message: 'Sesion expirada — inicia sesion de nuevo' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesion invalida — inicia sesion' });
  }
}

module.exports = { requireAdmin, SECRET };
