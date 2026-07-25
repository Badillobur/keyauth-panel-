# KeyAuth Panel - Sistema de Licenciamiento

Panel de administracion y API REST compatible con KeyAuth para gestionar licencias de software.

## Requisitos

- Node.js 16+
- npm

## Instalacion

```bash
cd keyauth-web
npm install
```

## Configuracion

Edita el archivo `.env`:

```env
PORT=3000
JWT_SECRET=cambia_esto_por_una_clave_muy_segura
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## Iniciar

```bash
npm start
```

Panel: http://localhost:3000/admin/login.html

## API

Endpoint: `POST http://tu-servidor/api/1.2/`

### Tipos disponibles
- `init`           - Inicializar sesion
- `login`          - Login con usuario/pass
- `register`       - Registro con key
- `license`        - Activar solo con key
- `check`          - Verificar sesion
- `checkblacklist` - Verificar ban
- `var`            - Obtener variable de app
- `setvar`         - Guardar variable de usuario
- `getvar`         - Leer variable de usuario
- `ban`            - Banear usuario actual
- `log`            - Guardar log
- `fetchonline`    - Contar usuarios online
- `fetchstats`     - Estadisticas de la app

## Codigo C++

```cpp
KeyAuth::api KeyAuthApp(
    "NombreDeTuApp",
    "owner-id-del-panel",
    "secret-del-panel",
    "1.0",
    "http://tu-servidor/api/1.2/"
);

KeyAuthApp.init();
KeyAuthApp.login(username, password);
```

## Estructura

```
keyauth-web/
├── src/
│   ├── server.js          # Servidor Express
│   ├── db/database.js     # SQLite schema
│   ├── routes/
│   │   ├── api.js         # API publica
│   │   └── admin.js       # API del panel
│   └── middleware/auth.js # JWT middleware
├── public/admin/          # Panel web
│   ├── login.html
│   ├── index.html         # Dashboard
│   ├── apps.html
│   ├── keys.html
│   ├── users.html
│   ├── logs.html
│   ├── vars.html
│   └── api-docs.html
├── data/                  # Base de datos SQLite (auto-creada)
├── .env
└── package.json
```
