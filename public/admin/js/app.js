const API = '/api/admin';

const API = '/api/admin';

// ─── Token ────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('lmax_token') || ''; }
function setToken(t) { localStorage.setItem('lmax_token', t); }
function clearToken() { localStorage.removeItem('lmax_token'); }

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  const token = getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  options.credentials = 'include';
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (e) {
    toast('Error de conexion con el servidor', 'error');
    return null;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'info';
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const icons = { success: '✓', error: '✕', info: '★', warning: '⚠' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span style="font-size:14px;">' + (icons[type]||'•') + '</span><span>' + msg + '</span>';
  c.appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s';
    setTimeout(function() { el.remove(); }, 300);
  }, 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
document.addEventListener('click', function(e) { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

// ─── Copy ─────────────────────────────────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    if (btn) { const o = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(function() { btn.textContent = o; }, 1500); }
    toast('Copiado al portapapeles', 'success');
  });
}

// ─── Date ─────────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString();
}
function relTime(ts) {
  if (!ts) return '—';
  const t = typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts;
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'hace ' + s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return 'hace ' + m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return 'hace ' + h + 'h';
  return 'hace ' + Math.floor(h / 24) + 'd';
}

// ─── Confirm ──────────────────────────────────────────────────────────────────
function confirmAction(msg, cb) { if (confirm(msg)) cb(); }

// ─── Auth ─────────────────────────────────────────────────────────────────────
function logout() {
  apiFetch(API + '/logout', { method: 'POST' });
  clearToken();
  window.location.href = '/admin/login.html';
}

async function requireAuth() {
  const nameEl = document.getElementById('admin-name');
  const roleEl = document.getElementById('admin-role');
  const avatarEl = document.getElementById('admin-avatar');
  if (nameEl) nameEl.textContent = 'Admin';
  if (roleEl) roleEl.textContent = 'superadmin';
  if (avatarEl) avatarEl.textContent = 'L';
  return { id: 'admin', username: 'admin', role: 'superadmin' };
}

// ─── Search filter ────────────────────────────────────────────────────────────
function filterTable(inputId, tableId) {
  const input = document.getElementById(inputId);
  const table = document.getElementById(tableId);
  if (!input || !table) return;
  input.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function(row) {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ─── URL param ────────────────────────────────────────────────────────────────
function getParam(name) { return new URLSearchParams(window.location.search).get(name); }

// ─── Particles ───────────────────────────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const count = 25;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = [
      'left:' + Math.random() * 100 + '%',
      'width:' + (Math.random() * 2 + 1) + 'px',
      'height:' + (Math.random() * 2 + 1) + 'px',
      'animation-duration:' + (Math.random() * 15 + 10) + 's',
      'animation-delay:' + (Math.random() * 10) + 's',
      'opacity:' + (Math.random() * 0.5 + 0.1)
    ].join(';');
    container.appendChild(p);
  }
}

// ─── Number counter animation ─────────────────────────────────────────────────
function animateCount(el, target, duration) {
  if (!el) return;
  const start = 0;
  const step = target / (duration / 16);
  let current = start;
  const timer = setInterval(function() {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = Math.floor(current);
  }, 16);
}

// Iniciar partículas al cargar
document.addEventListener('DOMContentLoaded', initParticles);
