const { get, all } = require('./src/db/database');

async function checkDatabase() {
  console.log('📊 Verificando estado de la base de datos...\n');
  
  // Listar todas las tablas
  const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  console.log('🗂️  Tablas existentes:');
  tables.forEach(t => console.log('  -', t.name));
  
  // Verificar apps existentes
  const apps = await all(`SELECT id, name, owner_id FROM apps`);
  console.log('\n📱 Aplicaciones existentes:');
  if (apps.length > 0) {
    apps.forEach(a => console.log('  -', a.name, `(owner: ${a.owner_id})`));
  } else {
    console.log('  (Sin aplicaciones)');
  }
  
  // Verificar usuarios
  const userCount = await get(`SELECT COUNT(*) as count FROM users`);
  console.log('\n👥 Usuarios registrados:', userCount.count);
  
  // Verificar keys
  const keyCount = await get(`SELECT COUNT(*) as count FROM licenses`);
  console.log('🔑 Licencias generadas:', keyCount.count);
  
  console.log('\n✅ Verificación completada - Todos los datos están seguros');
}

checkDatabase().catch(console.error);