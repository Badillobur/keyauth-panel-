const jwt = require('jsonwebtoken');
const db = require('../db/database');

const SECRET = process.env.JWT_SECRET || 'lmax27_secret_2025_xK9mP2qL8nR4vT7w';

function requireAdmin(req, res, next) {
  const token =
    (req.cookies && req.cookies.admin_token) ||
    (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', ''));

  if (!token) {
    return res.status(401).json({ success: false, message: 'No autorizado — inicia sesion' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesion invalida — inicia sesion' });
  }

  if (decoded.exp && Date.now() / 1000 > decoded.exp) {
    return res.status(401).json({ success: false, message: 'Sesion expirada — inicia sesion de nuevo' });
  }

  // Si es partner, verificar en DB que siga activo en TIEMPO REAL
  if (decoded.role === 'partner') {
    db.get('SELECT * FROM partners WHERE id=?', [decoded.partner_id || decoded.id])
      .then(function(partner) {
        if (!partner) {
          return res.status(401).json({ success: false, message: 'Partner no encontrado' });
        }
        if (!partner.active) {
          return res.status(403).json({ success: false, message: 'Tu cuenta fue desactivada. Contacta al administrador.' });
        }
        // Actualizar datos del partner con los de la DB (por si cambio algo)
        req.admin = {
          id: partner.id,
          username: partner.username,
          role: 'partner',
          partner_id: partner.id,
          active: partner.active
        };
        next();
      })
      .catch(function(err) {
        return res.status(500).json({ success: false, message: 'Error verificando sesion' });
      });
    return; // salir, next() se llama arriba de forma async
  }

  // Admin principal — pasar directo
  req.admin = decoded;
  next();
}

module.exports = { requireAdmin, SECRET };
