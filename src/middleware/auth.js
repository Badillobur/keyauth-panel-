// Auth desactivado - acceso libre al panel
function requireAdmin(req, res, next) {
  req.admin = { id: 'admin', username: 'admin', role: 'superadmin' };
  next();
}

const SECRET = process.env.JWT_SECRET || 'keyauth_secret_2025';

module.exports = { requireAdmin, SECRET };
