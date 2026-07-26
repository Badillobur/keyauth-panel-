var SVG = {
  dashboard: '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1" fill="#f5c518"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" fill="#f5c518" opacity=".5"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" fill="#f5c518" opacity=".5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" fill="#f5c518"/></svg>',
  apps:      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="#f5c518" stroke-width="1.4"/><path d="M1.5 5.5h12M5.5 5.5v8" stroke="#f5c518" stroke-width="1.4"/></svg>',
  keys:      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="5.5" cy="7.5" r="3.5" stroke="#f5c518" stroke-width="1.4"/><path d="M8.5 7.5H14M11.5 6V7.5M13.5 6V7.5" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round"/></svg>',
  users:     '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="4.5" r="2.5" stroke="#f5c518" stroke-width="1.4"/><path d="M2 13.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round"/></svg>',
  logs:      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="#f5c518" stroke-width="1.4"/><path d="M4.5 5h6M4.5 7.5h6M4.5 10h3.5" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round"/></svg>',
  vars:      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5h2.5L6 3l3 9 2-4.5h2" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  partners:  '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="5" cy="4.5" r="2" stroke="#f5c518" stroke-width="1.4"/><circle cx="10" cy="4.5" r="2" stroke="#f5c518" stroke-width="1.4"/><path d="M1 13c0-2.2 1.8-3.5 4-3.5M14 13c0-2.2-1.8-3.5-4-3.5M7.5 9.5c2.2 0 4 1.3 4 3.5H3.5c0-2.2 1.8-3.5 4-3.5z" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round"/></svg>',
  discord:   '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M12.5 2.5C11.4 2 10.2 1.7 9 1.6L8.8 2c-1.2-.2-2.4-.2-3.6 0L5 1.6C3.8 1.7 2.6 2 1.5 2.5-.4 5.3.1 8.2.3 11c1.3.9 2.5 1.5 3.7 1.9l.7-1c-.4-.2-.8-.4-1.2-.7l.3-.2c2.2 1 4.8 1 7 0l.3.2c-.4.3-.8.5-1.2.7l.7 1c1.2-.4 2.4-1 3.7-1.9.2-2.8-.5-5.6-2.8-8.5zM5 9c-.8 0-1.5-.7-1.5-1.5S4.2 6 5 6s1.5.7 1.5 1.5S5.8 9 5 9zm5 0c-.8 0-1.5-.7-1.5-1.5S9.2 6 10 6s1.5.7 1.5 1.5S10.8 9 10 9z" fill="#f5c518" opacity=".8"/></svg>',
  docs:      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2.5" y="1" width="10" height="13" rx="1.5" stroke="#f5c518" stroke-width="1.4"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="#f5c518" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

function buildSidebar(activePage) {
  var nav = [
    { section: 'General' },
    { page: 'dashboard', label: 'Dashboard',        href: '/panel' },
    { page: 'apps',      label: 'Aplicaciones',     href: '/apps' },
    { section: 'Gestion' },
    { page: 'keys',      label: 'Licencias / Keys', href: '/keys' },
    { page: 'users',     label: 'Usuarios',         href: '/users' },
    { page: 'logs',      label: 'Logs',             href: '/logs' },
    { section: 'Config' },
    { page: 'vars',      label: 'Variables',        href: '/vars' },
    { page: 'partners',  label: 'Partners',         href: '/partners' },
    { page: 'discord',   label: 'Bot Discord',      href: '/discord' },
    { page: 'docs',      label: 'API Docs',         href: '/docs' },
  ];

  var html = '<aside class="sidebar" id="sidebar">';
  html += '<div class="sidebar-logo"><div class="logo-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="7" fill="#111"/><path d="M5 20h18M5 20l2.5-8 4.5 4 2-6 2 6 4.5-4 2.5 8z" fill="#f5c518"/><text x="14" y="19" text-anchor="middle" font-size="7" font-weight="900" fill="#0a0a0a" font-family="Arial Black,sans-serif">LMA</text></svg></div><div><div class="logo-text">LMAx27</div><div class="logo-version">Panel v2.0</div></div></div>';
  html += '<nav class="sidebar-nav">';

  for (var i = 0; i < nav.length; i++) {
    var item = nav[i];
    if (item.section) {
      html += '<div class="nav-section-title">' + item.section + '</div>';
    } else {
      var active = item.page === activePage ? ' active' : '';
      var icon = SVG[item.page] || '';
      html += '<a href="' + item.href + '" class="nav-item' + active + '" data-page="' + item.page + '"><span class="nav-icon">' + icon + '</span>' + item.label + '</a>';
    }
  }

  html += '</nav>';
  html += '<div class="sidebar-footer">';
  html += '<div class="user-info"><div class="user-avatar" id="admin-avatar">L</div><div><div class="user-name" id="admin-name">Admin</div><div class="user-role" id="admin-role">superadmin</div></div></div>';
  html += '<button class="btn-logout" onclick="logout()"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2H2.5A1.5 1.5 0 001 3.5v6A1.5 1.5 0 002.5 11H5M8.5 4l3 2.5-3 2.5M11.5 6.5H4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Cerrar Sesion</button>';
  html += '</div></aside>';
  return html;
}

function injectSidebar(activePage) {
  var container = document.getElementById('sidebar-container');
  if (container) container.innerHTML = buildSidebar(activePage);
}
