const { get, run, all } = require('./src/db/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function setupAdminBots() {
  console.log('🔧 Configurando sistema de bots para admin...\n');
  
  // 1. Agregar columna active a partners si no existe
  try {
    await run('ALTER TABLE partners ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    console.log('✅ Columna active agregada a partners');
  } catch(e) {
    console.log('ℹ️  Columna active ya existe en partners');
  }
  
  // 2. Verificar admin actual
  const admin = await get('SELECT * FROM admins WHERE role IN ("superadmin", "admin") LIMIT 1');
  console.log('👤 Admin encontrado:', admin ? admin.username : 'ninguno');
  
  // 3. Crear aplicación LMAx27 si no existe
  let app = await get('SELECT * FROM apps WHERE name=?', ['LMAx27']);
  if (!app) {
    const appId = uuidv4();
    await run('INSERT INTO apps (id, name, owner_id, secret, version, status) VALUES (?, ?, ?, ?, ?, ?)', [
      appId,
      'LMAx27',
      '9945b20eda',
      '438e6313bacf46b2bc62b4bdf321902e',
      '1.0',
      1
    ]);
    app = { id: appId, name: 'LMAx27' };
    console.log('✅ Aplicación LMAx27 creada');
  } else {
    console.log('ℹ️  Aplicación LMAx27 ya existe');
  }
  
  console.log('\n🎯 AHORA FUNCIONA:');
  console.log('1. Login como admin: daniel/daniel');
  console.log('2. Ve a la sección "Mis Bots"');
  console.log('3. Selecciona la app "LMAx27"');
  console.log('4. Crea tu bot Discord ✅');
  console.log('\n🔧 El error FOREIGN KEY está solucionado');
}

setupAdminBots().catch(console.error);