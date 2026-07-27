const { get, run } = require('./src/db/database');
const bcrypt = require('bcryptjs');

async function fixAdminAccount() {
  console.log('🔧 Arreglando cuenta de admin...\n');
  
  // Verificar admin actual
  const currentAdmin = await get('SELECT * FROM admins LIMIT 1');
  console.log('👤 Admin actual:', currentAdmin);
  
  if (currentAdmin) {
    // Actualizar a daniel/daniel
    const hashedPass = await bcrypt.hash('daniel', 10);
    await run('UPDATE admins SET username=?, password=? WHERE id=?', 
      ['daniel', hashedPass, currentAdmin.id]);
    console.log('✅ Admin actualizado a: daniel/daniel');
  }
  
  // Crear aplicación LMAx27 con los datos correctos
  const app = await get('SELECT * FROM apps WHERE name=?', ['LMAx27']);
  if (!app) {
    const { v4: uuidv4 } = require('uuid');
    const appId = uuidv4();
    await run('INSERT INTO apps (id, name, owner_id, secret, version, status) VALUES (?, ?, ?, ?, ?, ?)', [
      appId,
      'LMAx27',                                      // nombre de tu app
      '9945b20eda',                                  // owner_id de tu código
      '438e6313bacf46b2bc62b4bdf321902e',           // secret de tu código
      '1.0',                                         // version
      1                                              // activo
    ]);
    console.log('✅ Aplicación "LMAx27" creada con owner_id: 9945b20eda');
    console.log('   App ID:', appId);
  } else {
    console.log('ℹ️  Aplicación "LMAx27" ya existe');
  }
  
  console.log('\n🎯 AHORA PUEDES:');
  console.log('1. Login: daniel/daniel');
  console.log('2. Agregar bot Discord a la app "LMAx27"');
  console.log('3. ¡No más errores FOREIGN KEY!');
}

fixAdminAccount().catch(console.error);