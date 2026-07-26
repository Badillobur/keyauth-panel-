/* ─── Global Utilities ──────────────────────────────────────────────────────── */

const API = '/api/admin';

function getToken() { return 'no-auth'; }
function setToken(t) {}
function clearToken() {}

async function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
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

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

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

function confirmAction(msg, cb) {
  if (confirm(msg)) cb();
}

function logout() {
  window.location.href = '/admin/index.html';
}

// Sin auth - devuelve admin falso directo
async function requireAuth() {
  const nameEl = document.getElementById('admin-name');
  const roleEl = document.getElementById('admin-role');
  const avatarEl = document.getElementById('admin-avatar');
  if (nameEl) nameEl.textContent = 'Admin';
  if (roleEl) roleEl.textContent = 'superadmin';
  if (avatarEl) avatarEl.textContent = 'A';
  return { id: 'admin', username: 'admin', role: 'superadmin' };
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
    if (el.dataset.page === page) el.classList.add('active');
  });
}

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

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
