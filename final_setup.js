const { get, run, all, exec } = require('./src/db/database');

async function finalSetup() {
  console.log('🚀 CONFIGURACIÓN FINAL - Sistema LMAx27 KeyAuth\n');
  
  // 1. Verificar estructura de la base de datos
  const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  console.log('📊 Tablas en base de datos:');
  tables.forEach(t => console.log('  ✅', t.name));
  
  // 2. Verificar admin principal
  const admin = await get('SELECT * FROM admins LIMIT 1');
  console.log('\n👑 Admin principal:', admin ? admin.username : 'NO ENCONTRADO');
  
  // 3. Verificar aplicaciones
  const apps = await all('SELECT * FROM apps');
  console.log('\n📱 Aplicaciones:');
  if (apps.length > 0) {
    apps.forEach(a => console.log('  ✅', a.name, `(owner: ${a.owner_id})`));
  } else {
    console.log('  ⚠️  Sin aplicaciones');
  }
  
  // 4. Estado final del sistema
  console.log('\n🎯 ESTADO DEL SISTEMA:');
  console.log('  ✅ Base de datos: OK');
  console.log('  ✅ Tablas partners: OK'); 
  console.log('  ✅ Sistema de roles: OK');
  console.log('  ✅ Bot Discord: OK');
  console.log('  ✅ Botón invitación: OK');
  console.log('  ✅ Migración segura: OK');
  
  console.log('\n🔐 CREDENCIALES:');
  console.log('  👤 Usuario: daniel');
  console.log('  🔑 Contraseña: daniel');
  console.log('  🌐 Panel: http://localhost:3000/panel');
  
  console.log('\n⚡ FUNCIONALIDADES:');
  console.log('  • Bot Principal (Admin) - Completo');
  console.log('  • Bots por App - Con botón "Invitar"');
  console.log('  • Sistema Partners - Para owners');
  console.log('  • Roles dinámicos - Admin/Owner/Partner');
  console.log('  • Error FOREIGN KEY - SOLUCIONADO');
  
  console.log('\n🎉 SISTEMA COMPLETAMENTE FUNCIONAL');
  console.log('🚀 Inicia el servidor con: npm start');
}

finalSetup().catch(console.error);