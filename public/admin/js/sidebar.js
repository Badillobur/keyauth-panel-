// Genera el sidebar en todas las páginas
function buildSidebar(activePage) {
  const nav = [
    { section: 'General' },
    { page: 'dashboard', label: 'Dashboard',        href: '/admin/index.html' },
    { page: 'apps',      label: 'Aplicaciones',     href: '/admin/apps.html' },
    { section: 'Gestion' },
    { page: 'keys',      label: 'Licencias / Keys', href: '/admin/keys.html' },
    { page: 'users',     label: 'Usuarios',         href: '/admin/users.html' },
    { page: 'logs',      label: 'Logs',             href: '/admin/logs.html' },
    { section: 'Config' },
    { page: 'vars',      label: 'Variables',        href: '/admin/vars.html' },
    { page: 'partners',  label: 'Partners',         href: '/admin/partners.html' },
    { page: 'discord',   label: 'Bot Discord',      href: '/admin/discord.html' },
    { page: 'docs',      label: 'API Docs',         href: '/admin/api-docs.html' },
  ];

  let html = '<aside class="sidebar" id="sidebar">';
  html += '<div class="sidebar-logo"><div class="logo-icon"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M13 2L4 13h7l-2 7 9-11h-7l2-7z" fill="#f5c518" stroke="#f5c518" stroke-width="1" stroke-linejoin="round"/></svg></div><div><div class="logo-text">LMAx27</div><div class="logo-version">Panel v2.0</div></div></div>';
  html += '<nav class="sidebar-nav">';
  for (const item of nav) {
    if (item.section) {
      html += '<div class="nav-section-title">' + item.section + '</div>';
    } else {
      const active = item.page === activePage ? ' active' : '';
      html += '<a href="' + item.href + '" class="nav-item' + active + '" data-page="' + item.page + '"><span class="nav-icon"></span>' + item.label + '</a>';
    }
  }
  html += '</nav>';
  html += '<div class="sidebar-footer">';
  html += '<div class="user-info"><div class="user-avatar" id="admin-avatar">L</div><div><div class="user-name" id="admin-name">Admin</div><div class="user-role" id="admin-role">superadmin</div></div></div>';
  html += '<button class="btn-logout" onclick="logout()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5M9 4l4 3-4 3M13 7H5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Cerrar Sesion</button>';
  html += '</div></aside>';
  return html;
}

function injectSidebar(activePage) {
  const container = document.getElementById('sidebar-container');
  if (container) {
    container.innerHTML = buildSidebar(activePage);
    // Cargar iconos SVG después de inyectar
    const s = document.createElement('script');
    s.src = '/admin/js/icons.js';
    s.onload = applyIcons;
    document.head.appendChild(s);
  }
}
