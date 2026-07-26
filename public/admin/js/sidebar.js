// Genera el sidebar en todas las páginas
function buildSidebar(activePage) {
  const nav = [
    { section: 'General' },
    { page: 'dashboard', icon: '📊', label: 'Dashboard',        href: '/admin/index.html' },
    { page: 'apps',      icon: '📦', label: 'Aplicaciones',     href: '/admin/apps.html' },
    { section: 'Gestión' },
    { page: 'keys',      icon: '🔑', label: 'Licencias / Keys', href: '/admin/keys.html' },
    { page: 'users',     icon: '👥', label: 'Usuarios',         href: '/admin/users.html' },
    { page: 'logs',      icon: '📋', label: 'Logs',             href: '/admin/logs.html' },
    { section: 'Config' },
    { page: 'vars',      icon: '⚙️', label: 'Variables',        href: '/admin/vars.html' },
    { page: 'discord',   icon: '🤖', label: 'Bot Discord',      href: '/admin/discord.html' },
    { page: 'docs',      icon: '📖', label: 'API Docs',         href: '/admin/api-docs.html' },
  ];

  let html = '<aside class="sidebar" id="sidebar">';
  html += '<div class="sidebar-logo"><div class="logo-icon">⚡</div><div><div class="logo-text">LMAx27</div><div class="logo-version">Panel v2.0</div></div></div>';
  html += '<nav class="sidebar-nav">';
  for (const item of nav) {
    if (item.section) {
      html += '<div class="nav-section-title">' + item.section + '</div>';
    } else {
      const active = item.page === activePage ? ' active' : '';
      html += '<a href="' + item.href + '" class="nav-item' + active + '" data-page="' + item.page + '"><span class="nav-icon">' + item.icon + '</span>' + item.label + '</a>';
    }
  }
  html += '</nav>';
  html += '<div class="sidebar-footer">';
  html += '<div class="user-info"><div class="user-avatar" id="admin-avatar">L</div><div><div class="user-name" id="admin-name">Admin</div><div class="user-role" id="admin-role">superadmin</div></div></div>';
  html += '<button class="btn-logout" onclick="logout()">🚪 Cerrar Sesion</button>';
  html += '</div></aside>';
  return html;
}

function injectSidebar(activePage) {
  const container = document.getElementById('sidebar-container');
  if (container) container.innerHTML = buildSidebar(activePage);
}
