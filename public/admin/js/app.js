/* ─── Global Utilities ──────────────────────────────────────────────────────── */

const API = '/api/admin';

// ─── Token ───────────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('ka_token') || '';
}

function setToken(t) {
  localStorage.setItem('ka_token', t);
}

function clearToken() {
  localStorage.removeItem('ka_token');
  localStorage.removeItem('ka_admin');
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────
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
    if (res.status === 401) {
      clearToken();
      window.location.href = '/admin/login.html';
      return null;
    }
    return await res.json();
  } catch (e) {
    toast('Error de conexion con el servidor', 'error');
    return null;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'info';
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (icons[type] || '•') + '</span><span>' + msg + '</span>';
  container.appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = '0.3s ease';
    setTimeout(function() { el.remove(); }, 300);
  }, 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Cerrar modal al click fuera
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ─── Copy to clipboard ───────────────────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    }
    toast('Copiado al portapapeles', 'success');
  });
}

// ─── Format date ─────────────────────────────────────────────────────────────
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

function isExpired(ts) {
  if (!ts) return false;
  const t = typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts;
  return Date.now() > t;
}

// ─── Relative time ───────────────────────────────────────────────────────────
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
  const day = Math.floor(h / 24);
  return 'hace ' + day + 'd';
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
function confirmAction(msg, cb) {
  if (confirm(msg)) cb();
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  await apiFetch(API + '/logout', { method: 'POST' });
  clearToken();
  window.location.href = '/admin/login.html';
}

// ─── Auth guard ───────────────────────────────────────────────────────────────
async function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/admin/login.html';
    return null;
  }
  const res = await apiFetch(API + '/me');
  if (!res || !res.success) {
    clearToken();
    window.location.href = '/admin/login.html';
    return null;
  }
  // Rellenar info del admin en sidebar
  const nameEl = document.getElementById('admin-name');
  const roleEl = document.getElementById('admin-role');
  const avatarEl = document.getElementById('admin-avatar');
  if (nameEl) nameEl.textContent = res.admin.username;
  if (roleEl) roleEl.textContent = res.admin.role;
  if (avatarEl) avatarEl.textContent = res.admin.username.charAt(0).toUpperCase();
  return res.admin;
}

// ─── Active nav ───────────────────────────────────────────────────────────────
function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
    if (el.dataset.page === page) el.classList.add('active');
  });
}

// ─── Search filter on table ───────────────────────────────────────────────────
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

// ─── Get URL param ────────────────────────────────────────────────────────────
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
