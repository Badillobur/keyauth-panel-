const { run, get } = require('./database');

async function runMigrationV2() {
  console.log('[Migration] Iniciando migración v2 - Agregando tablas de partners y bots...');
  
  try {
    // Verificar si las tablas ya existen
    const tablesExist = await get(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name IN ('partners', 'partner_apps', 'partner_discord_bots')
    `);
    
    if (tablesExist && tablesExist.count > 0) {
      console.log('[Migration] Las tablas ya existen, saltando migración');
      return { success: true, message: 'Tablas ya existentes' };
    }

    // Crear tabla partners
    await run(`
      CREATE TABLE IF NOT EXISTS partners (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL UNIQUE,
        password    TEXT NOT NULL,
        email       TEXT DEFAULT '',
        role        TEXT NOT NULL DEFAULT 'partner',
        max_bots    INTEGER NOT NULL DEFAULT 1,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )
    `);
    
    // Crear tabla partner_apps
    await run(`
      CREATE TABLE IF NOT EXISTS partner_apps (
        id          TEXT PRIMARY KEY,
        partner_id  TEXT NOT NULL,
        app_id      TEXT NOT NULL,
        can_genkeys INTEGER NOT NULL DEFAULT 1,
        key_limit   INTEGER NOT NULL DEFAULT 0,
        keys_used   INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
        FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
        UNIQUE(partner_id, app_id)
      )
    `);
    
    // Crear tabla partner_discord_bots
    await run(`
      CREATE TABLE IF NOT EXISTS partner_discord_bots (
        id              TEXT PRIMARY KEY,
        partner_id      TEXT NOT NULL,
        app_id          TEXT NOT NULL,
        bot_name        TEXT NOT NULL DEFAULT 'Partner Bot',
        bot_token       TEXT NOT NULL,
        guild_id        TEXT DEFAULT '',
        log_channel_id  TEXT DEFAULT '',
        chan_online_id  TEXT DEFAULT '',
        chan_users_id   TEXT DEFAULT '',
        chan_keys_id    TEXT DEFAULT '',
        active          INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
        FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
        UNIQUE(partner_id, app_id)
      )
    `);

    console.log('[Migration] ✅ Tablas creadas exitosamente');
    console.log('[Migration] ✅ Aplicaciones existentes preservadas');
    
    return { success: true, message: 'Migración v2 completada' };
    
  } catch (error) {
    console.error('[Migration] ❌ Error en migración:', error.message);
    return { success: false, error: error.message };
  }
}

// Auto-ejecutar migración al importar
runMigrationV2();

module.exports = { runMigrationV2 };