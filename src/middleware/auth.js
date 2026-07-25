const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.admin_token || req.headers['authorization']?.split(' ')[1];
    if (!token) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
      }
      return res.redirect('/admin/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    if (req.headers['content-type']?.includes('application/json') || req.path.startsWith('/api/admin')) {
      return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }
    return res.redirect('/admin/login');
  }
}

module.exports = { requireAdmin };
