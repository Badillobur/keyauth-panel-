const { get, all, run } = require('./src/db/database');

async function debugAndFix() {
  console.log('🔍 Diagnosticando problema de login...\n');
  
  // Verificar admins
  const admins = await all('SELECT * FROM admins');
  console.log('👑 Super Admins:');
  console.log(admins);
  
  // Verificar partners
  const partners = await all('SELECT * FROM partners');
  console.log('\n🤝 Partners:');
  console.log(partners);
  
  // Verificar apps y su owner_id
  const apps = await all('SELECT * FROM apps');
  console.log('\n📱 Apps:');
  console.log(apps);
  
  // Si no hay super admin, crearlo
  if (admins.length === 0) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const hashedPass = await bcrypt.hash('daniel', 10);
    await run('INSERT INTO admins (id,username,password,role) VALUES (?,?,?,?)', 
      [id, 'daniel', hashedPass, 'superadmin']);
    console.log('\n✅ Super admin creado: daniel/daniel');
  }
  
  console.log('\n📋 SOLUCIÓN:');
  console.log('1. Haz login como super admin: daniel/daniel');
  console.log('2. Crea la aplicación "LMAx27" si no existe');
  console.log('3. Luego agrega el bot Discord');
}

debugAndFix().catch(console.error);