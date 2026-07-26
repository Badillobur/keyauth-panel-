// ─── LMAx27 Panel — app.js ──────────────────────────────────────────────────
var API = '/api/admin';

// Token
function getToken() { return localStorage.getItem('lmax_token') || ''; }
function setToken(t) { localStorage.setItem('lmax_token', t); }
function clearToken() { localStorage.removeItem('lmax_token'); }

// Fetch wrapper
async function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  options.credentials = 'include';
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  try {
    var res = await fetch(url, options);
    var data = await res.json();
    // Solo 401 (token inválido/expirado) redirige al login
    // 403 (sin permiso para esa acción) solo muestra toast, NO cierra sesión
    if (res.status === 401) {
      if (data && data.message) toast(data.message, 'error');
      setTimeout(function() {
        clearToken();
        window.location.href = '/login';
      }, 1500);
      return null;
    }
    if (res.status === 403) {
      if (data && data.message) toast(data.message, 'error');
      return null;
    }
    return data;
  } catch(e) {
    toast('Error de conexion', 'error');
    return null;
  }
}

// Auth guard — verifica token y redirige al login si no hay sesion
async function requireAuth() {
  var token = getToken();
  if (!token) {
    window.location.href = '/login';
    return null;
  }
  // Verificar con el servidor
  var res = await apiFetch(API + '/me');
  if (!res || !res.success) {
    clearToken();
    window.location.href = '/login';
    return null;
  }
  var nameEl = document.getElementById('admin-name');
  var roleEl = document.getElementById('admin-role');
  var avatarEl = document.getElementById('admin-avatar');
  if (nameEl) nameEl.textContent = res.admin.username || 'Admin';
  if (roleEl) roleEl.textContent = res.admin.role || 'superadmin';
  if (avatarEl) avatarEl.textContent = (res.admin.username || 'L').charAt(0).toUpperCase();
  return res.admin;
}

// Logout
function logout() {
  clearToken();
  window.location.href = '/login';
}

// Toast
function toast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  var icons = { success: '✓', error: '✕', info: '★', warning: '⚠' };
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (icons[type]||'•') + '</span><span>' + msg + '</span>';
  c.appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s';
    setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
  }, 3500);
}

// Modal
function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); }
document.addEventListener('click', function(e) { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

// Copy
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    if (btn) { var o = btn.textContent; btn.textContent = '✓'; setTimeout(function() { btn.textContent = o; }, 1500); }
    toast('Copiado', 'success');
  });
}

// Date helpers
function fmtDate(ts) {
  if (!ts) return '—';
  var d = new Date(typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(ts) {
  if (!ts) return '—';
  var d = new Date(typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString();
}
function relTime(ts) {
  if (!ts) return '—';
  var t = typeof ts === 'number' && ts < 9999999999 ? ts * 1000 : ts;
  var diff = Date.now() - t;
  var s = Math.floor(diff / 1000);
  if (s < 60) return 'hace ' + s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return 'hace ' + m + 'm';
  var h = Math.floor(m / 60);
  if (h < 24) return 'hace ' + h + 'h';
  return 'hace ' + Math.floor(h / 24) + 'd';
}

// Confirm
function confirmAction(msg, cb) { if (confirm(msg)) cb(); }

// Search filter
function filterTable(inputId, tableId) {
  var input = document.getElementById(inputId);
  var table = document.getElementById(tableId);
  if (!input || !table) return;
  input.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function(row) {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// URL param
function getParam(name) { return new URLSearchParams(window.location.search).get(name); }

// App seleccionada persistente (se guarda en localStorage para no seleccionar cada vez)
function getSavedApp() { return localStorage.getItem('lmax_selected_app') || ''; }
function setSavedApp(id) { if (id) localStorage.setItem('lmax_selected_app', id); else localStorage.removeItem('lmax_selected_app'); }

// Carga un selector <select id="app-selector"> con las apps y restaura la seleccion guardada
// Retorna el app_id que quedo seleccionado (o '' si ninguno)
async function loadAppSelector(selectorId, onChange) {
  selectorId = selectorId || 'app-selector';
  var sel = document.getElementById(selectorId);
  if (!sel) return '';
  var r = await apiFetch(API + '/apps');
  if (!r || !r.success || !r.apps.length) return '';
  sel.innerHTML = '<option value="">— Seleccionar App —</option>';
  r.apps.forEach(function(a) {
    var o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name + (a.keyCount !== undefined ? '  (' + a.keyCount + ' keys)' : '');
    o.dataset.name = a.name;
    sel.appendChild(o);
  });
  // Prioridad: param URL > ultima guardada
  var fromUrl  = getParam('app');
  var fromSave = getSavedApp();
  var toSet    = fromUrl || fromSave;
  if (toSet) {
    // verificar que la opción existe
    var exists = Array.from(sel.options).some(function(o){ return o.value === toSet; });
    if (exists) sel.value = toSet;
  }
  sel.addEventListener('change', function() {
    setSavedApp(sel.value);
    if (typeof onChange === 'function') onChange(sel.value);
  });
  return sel.value;
}

// Counter animation
function animateCount(el, target, duration) {
  if (!el) return;
  var step = target / (duration / 16);
  var current = 0;
  var timer = setInterval(function() {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = Math.floor(current);
  }, 16);
}

// Particles
function initParticles() {
  var container = document.getElementById('particles');
  if (!container) return;
  for (var i = 0; i < 20; i++) {
    var p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = 'left:' + Math.random()*100 + '%;animation-duration:' + (Math.random()*15+10) + 's;animation-delay:' + (Math.random()*10) + 's;width:' + (Math.random()*2+1) + 'px;height:' + (Math.random()*2+1) + 'px;';
    container.appendChild(p);
  }
}
document.addEventListener('DOMContentLoaded', initParticles);
