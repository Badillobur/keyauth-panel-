const { run } = require('./src/db/database');

async function addPermissionsTable() {
  console.log('📊 Agregando tabla de permisos...');
  
  try {
    // Crear tabla de permisos
    await run(`
      CREATE TABLE IF NOT EXISTS partner_permissions (
        id              TEXT PRIMARY KEY,
        partner_id      TEXT NOT NULL,
        app_id          TEXT NOT NULL,
        can_genkeys     INTEGER NOT NULL DEFAULT 1,
        can_view_users  INTEGER NOT NULL DEFAULT 1,
        can_ban_users   INTEGER NOT NULL DEFAULT 0,
        can_view_logs   INTEGER NOT NULL DEFAULT 0,
        can_reset_hwid  INTEGER NOT NULL DEFAULT 0,
        can_extend_sub  INTEGER NOT NULL DEFAULT 0,
        max_keys_per_day INTEGER NOT NULL DEFAULT 50,
        max_key_duration INTEGER NOT NULL DEFAULT 30,
        created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
        FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
        UNIQUE(partner_id, app_id)
      )
    `);
    
    console.log('✅ Tabla partner_permissions creada');
    console.log('🎯 CONTROL TOTAL ACTIVADO:');
    console.log('  • Generar keys: Configurable');
    console.log('  • Ver usuarios: Configurable');
    console.log('  • Banear usuarios: Configurable');
    console.log('  • Ver logs: Configurable');
    console.log('  • Reset HWID: Configurable');
    console.log('  • Extender subs: Configurable');
    console.log('  • Límites por día: Configurable');
    console.log('  • Duración máxima: Configurable');
    
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
}

addPermissionsTable();