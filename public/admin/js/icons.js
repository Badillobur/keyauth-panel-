// SVG Icons amarillos — LMAx27 Panel
const Icons = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="#f5c518"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="#f5c518" opacity=".6"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="#f5c518" opacity=".6"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="#f5c518"/></svg>',
  apps:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#f5c518" stroke-width="1.5"/><path d="M2 6h12M6 6v8" stroke="#f5c518" stroke-width="1.5"/></svg>',
  keys:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="3.5" stroke="#f5c518" stroke-width="1.5"/><path d="M9 8h5M12 6.5V8M14 6.5V8" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  users:     '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="#f5c518" stroke-width="1.5"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  logs:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#f5c518" stroke-width="1.5"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  vars:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#f5c518" stroke-width="1.5"/><path d="M5.5 6C5.5 4.619 6.619 4 8 4s2.5.619 2.5 2c0 1.5-2.5 2-2.5 3M8 12v.5" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  partners:  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2.5" stroke="#f5c518" stroke-width="1.5"/><circle cx="10.5" cy="5" r="2.5" stroke="#f5c518" stroke-width="1.5"/><path d="M1 14c0-2.5 2-4 4.5-4M15 14c0-2.5-2-4-4.5-4M8 10c2.5 0 4 1.5 4 4H4c0-2.5 1.5-4 4-4z" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  discord:   '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 2.5C12.4 2 11.2 1.7 10 1.6L9.8 2c-1.2-.2-2.4-.2-3.6 0L6 1.6C4.8 1.7 3.6 2 2.5 2.5 .6 5.4 .1 8.2 .3 11c1.3.9 2.5 1.5 3.7 1.9l.7-1c-.4-.2-.8-.4-1.2-.7l.3-.2c2.3 1 4.9 1 7.2 0l.3.2c-.4.3-.8.5-1.2.7l.7 1c1.2-.4 2.4-1 3.7-1.9.3-3.2-.5-6-2.7-8.5zM5.5 9.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm5 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" fill="#f5c518" opacity=".8"/></svg>',
  docs:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1.5" stroke="#f5c518" stroke-width="1.5"/><path d="M6 5h4M6 8h4M6 11h2" stroke="#f5c518" stroke-width="1.5" stroke-linecap="round"/></svg>',
  plus:      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>',
  edit:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-7 7H2v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  trash:     '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2.5h3v1M4 3.5l.5 7h4l.5-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 4V2.5A1.5 1.5 0 002.5 1H2A1.5 1.5 0 00.5 2.5v5A1.5 1.5 0 002 9h1.5" stroke="currentColor" stroke-width="1.3"/></svg>',
  refresh:   '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5a5.5 5.5 0 105.5-5.5 5.5 5.5 0 00-4 1.7L1 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M1 1.5v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ban:       '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 2.5l8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  unban:     '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M4 6.5l2 2 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hwid:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3" width="11" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 6.5h5M6.5 5v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  extend:    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 3.5v3l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user_add:  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="5" r="3" stroke="#000" stroke-width="1.5"/><path d="M1 13c0-2.8 2.2-4.5 5-4.5M10 8.5v5M7.5 11H13" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>',
  key_gen:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5.5" cy="7" r="3.5" stroke="#000" stroke-width="1.5"/><path d="M8.5 7h4.5M11 5.5V7M13 5.5V7" stroke="#000" stroke-width="1.5" stroke-linecap="round"/><path d="M3.5 9l1-2" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>',
  search:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  logout:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5M9 4l4 3-4 3M13 7H5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt:      '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M13 2L4 13h7l-2 7 9-11h-7l2-7z" fill="#f5c518" stroke="#f5c518" stroke-width="1" stroke-linejoin="round"/></svg>',
  online:    '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#22c55e"/></svg>',
  offline:   '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#ef4444"/></svg>',
};

// Inyectar iconos en todos los nav-items del sidebar
function applyIcons() {
  document.querySelectorAll('.nav-item[data-page]').forEach(function(el) {
    const page = el.dataset.page;
    if (Icons[page]) {
      const span = el.querySelector('.nav-icon');
      if (span) span.innerHTML = Icons[page];
    }
  });
}
document.addEventListener('DOMContentLoaded', applyIcons);
