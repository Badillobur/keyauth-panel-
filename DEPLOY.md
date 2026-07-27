# 🚀 LMAx27 Auth System - Deploy Guide

## 📦 Deploy en Render/Railway/Vercel

### 1. **Variables de Entorno Requeridas:**

```bash
NODE_ENV=production
PORT=3000
ADMIN_USERNAME=daniel
ADMIN_PASSWORD=daniel
```

### 2. **Build Script:**
```bash
npm install
```

### 3. **Start Script:**
```bash
npm start
```

### 4. **Base de Datos:**
- SQLite automática (se crea en `/data/keyauth.db`)
- Migración v2 se ejecuta automáticamente
- No requiere configuración adicional

---

## ✅ **Funcionalidades Incluidas:**

### 🎯 **Sistema Completo:**
- **Error FOREIGN KEY** - ✅ SOLUCIONADO
- **Bot Discord Principal** - ✅ Funcional
- **Bots por Partner/Owner** - ✅ Con invitación
- **Sistema de Roles** - ✅ Admin/Owner/Partner
- **Panel Responsivo** - ✅ UI/UX optimizada

### 🔐 **Autenticación:**
- **Admin Principal**: `daniel/daniel`
- **Sistema Partners**: Roles dinámicos
- **C++ Integration**: LMAx27Auth compatible

### 🤖 **Discord Integration:**
- **Bot Principal**: Comandos completos
- **Bots de Partners**: Por aplicación
- **Invitación Automática**: Un click
- **Permisos Completos**: Administrator

---

## 🛠️ **Post-Deploy Checklist:**

### 1. **Verificar Deploy:**
```bash
curl https://tu-app.render.com/api/admin/me
```

### 2. **Login Inicial:**
- URL: `https://tu-app.render.com/panel`
- Usuario: `daniel`
- Contraseña: `daniel`

### 3. **Crear Primera App:**
- Ir a "Aplicaciones" → "Nueva App"
- Nombre: `LMAx27`
- Owner ID: `9945b20eda`

### 4. **Configurar Bot Discord:**
- Ir a "Bot Discord" → "Bot Principal"
- Pegar token de Discord
- Configurar Guild ID
- Click "Guardar y Conectar"

### 5. **Test de Invitación:**
- Click "Invitar al Servidor"
- Verificar que abre Discord

---

## 🎯 **URLs Importantes:**

- **Panel Admin**: `/panel`
- **API Docs**: `/docs`
- **Login**: `/login`
- **C++ Endpoint**: `https://tu-app.render.com/api/1.2/`

---

## 🔧 **Troubleshooting:**

### **Error: Bot no conecta**
```bash
# Verificar token en Discord Developer Portal
# Asegurarse que el bot esté creado
# Verificar permisos de bot
```

### **Error: FOREIGN KEY**
```bash
# Sistema automáticamente ejecuta migración v2
# Si persiste, eliminar /data/keyauth.db y reiniciar
```

### **Error: Login no funciona**
```bash
# Verificar variables de entorno
# ADMIN_USERNAME=daniel
# ADMIN_PASSWORD=daniel
```

---

## 🎉 **Deploy Exitoso Cuando:**

- ✅ Panel carga en `/panel`
- ✅ Login funciona con `daniel/daniel`
- ✅ Se pueden crear aplicaciones
- ✅ Bot Discord conecta
- ✅ Botón "Invitar" funciona
- ✅ Sistema de partners disponible

**¡Sistema LMAx27 Auth completamente funcional en producción!** 🚀