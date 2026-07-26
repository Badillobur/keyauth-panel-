/**
 * LMAx27 Discord Bot
 * - RPC con canales de stats en tiempo real (usuarios online, total users, keys)
 * - Notificaciones automaticas: login, registro, ban, keys generadas
 * - Comandos slash: /stats /key /ban /users
 * - Status del bot actualizado cada 30s
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Discord.js
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
        EmbedBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');

// ─── Estado del bot ───────────────────────────────────────────────────────────
let botClient = null;
let botReady = false;
let statsInterval = null;
let statusInterval = null;

// ─── Init DB ──────────────────────────────────────────────────────────────────
async function initDiscordTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS discord_config (
    id                  TEXT PRIMARY KEY,
    bot_token           TEXT DEFAULT '',
    guild_id            TEXT DEFAULT '',
    log_channel_id      TEXT DEFAULT '',
    welcome_channel_id  TEXT DEFAULT '',
    stats_category_id   TEXT DEFAULT '',
    chan_online_id       TEXT DEFAULT '',
    chan_users_id        TEXT DEFAULT '',
    chan_keys_id         TEXT DEFAULT '',
    chan_apps_id         TEXT DEFAULT '',
    notify_login        INTEGER DEFAULT 1,
    notify_register     INTEGER DEFAULT 1,
    notify_ban          INTEGER DEFAULT 1,
    notify_keygen       INTEGER DEFAULT 1,
    updated_at          INTEGER DEFAULT (strftime('%s','now'))
  )`);
  const ex = await db.get('SELECT id FROM discord_config LIMIT 1');
  if (!ex) await db.run('INSERT INTO discord_config (id) VALUES (?)', [uuidv4()]);
}
initDiscordTable();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getConfig() {
  return db.get('SELECT * FROM discord_config LIMIT 1');
}

function getStats() {
  const now = Math.floor(Date.now() / 1000);
  return Promise.all([
    db.get('SELECT COUNT(*) as c FROM apps').then(function(r) { return r ? r.c : 0; }),
    db.get('SELECT COUNT(*) as c FROM users').then(function(r) { return r ? r.c : 0; }),
    db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at > ?', [now]).then(function(r) { return r ? r.c : 0; }),
    db.get('SELECT COUNT(*) as c FROM licenses').then(function(r) { return r ? r.c : 0; }),
    db.get('SELECT COUNT(*) as c FROM licenses WHERE used > 0').then(function(r) { return r ? r.c : 0; })
  ]).then(function(results) {
    return {
      apps: results[0],
      users: results[1],
      online: results[2],
      keys: results[3],
      usedKeys: results[4]
    };
  });
}

function goldEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xF5C518)
    .setTitle(title)
    .setDescription(description || '')
    .setTimestamp()
    .setFooter({ text: 'LMAx27 Panel v2.0' });
}

// ─── Actualizar canales de stats (RPC en tiempo real) ─────────────────────────
async function updateStatsChannels() {
  if (!botClient || !botReady) return;
  try {
    const config = await getConfig();
    if (!config.guild_id) return;
    const stats = await getStats();

    const updates = [
      { id: config.chan_online_id, name: '🟢 Online: ' + stats.online },
      { id: config.chan_users_id,  name: '👥 Usuarios: ' + stats.users },
      { id: config.chan_keys_id,   name: '🔑 Keys: ' + stats.keys },
      { id: config.chan_apps_id,   name: '📦 Apps: ' + stats.apps }
    ];

    for (const u of updates) {
      if (!u.id) continue;
      try {
        const channel = await botClient.channels.fetch(u.id);
        if (channel) await channel.setName(u.name);
      } catch (_) {}
    }
  } catch (_) {}
}

// ─── Actualizar status del bot ─────────────────────────────────────────────────
async function updateBotStatus() {
  if (!botClient || !botReady) return;
  try {
    const stats = await getStats();
    botClient.user.setPresence({
      status: 'online',
      activities: [{
        name: stats.online + ' usuarios online | LMAx27',
        type: ActivityType.Watching
      }]
    });
  } catch (_) {}
}

// ─── Registrar slash commands ──────────────────────────────────────────────────
async function registerCommands(token, guildId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Ver estadisticas del sistema LMAx27'),

    new SlashCommandBuilder()
      .setName('usuarios')
      .setDescription('Ver usuarios de una app')
      .addStringOption(function(o) {
        return o.setName('app').setDescription('Nombre de la app').setRequired(false);
      }),

    new SlashCommandBuilder()
      .setName('keys')
      .setDescription('Generar keys')
      .addStringOption(function(o) { return o.setName('app').setDescription('Nombre de la app').setRequired(true); })
      .addIntegerOption(function(o) { return o.setName('cantidad').setDescription('Cuantas keys').setRequired(true).setMinValue(1).setMaxValue(50); })
      .addIntegerOption(function(o) { return o.setName('dias').setDescription('Duracion en dias (0=permanente)').setRequired(false); }),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear un usuario')
      .addStringOption(function(o) { return o.setName('usuario').setDescription('Username').setRequired(true); })
      .addStringOption(function(o) { return o.setName('app').setDescription('Nombre de la app').setRequired(true); })
      .addStringOption(function(o) { return o.setName('razon').setDescription('Razon del ban').setRequired(false); }),

    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Verificar que el bot responde'),
  ].map(function(c) { return c.toJSON(); });

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(botClient.user.id, guildId), { body: commands });
}

// ─── Handler de slash commands ─────────────────────────────────────────────────
async function handleSlashCommands(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const embed = goldEmbed('🏓 Pong!', 'Bot online y funcionando.\nLatencia: ' + botClient.ws.ping + 'ms');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === 'stats') {
    await interaction.deferReply({ ephemeral: true });
    const stats = await getStats();
    const embed = goldEmbed('⚡ LMAx27 — Estadísticas', '')
      .addFields(
        { name: '📦 Aplicaciones', value: String(stats.apps), inline: true },
        { name: '👥 Usuarios Total', value: String(stats.users), inline: true },
        { name: '🟢 Online Ahora', value: String(stats.online), inline: true },
        { name: '🔑 Keys Totales', value: String(stats.keys), inline: true },
        { name: '✅ Keys Usadas', value: String(stats.usedKeys), inline: true },
        { name: '🆓 Keys Libres', value: String(stats.keys - stats.usedKeys), inline: true }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName === 'usuarios') {
    await interaction.deferReply({ ephemeral: true });
    const appName = interaction.options.getString('app');
    let appId = null;
    if (appName) {
      const app = await db.get('SELECT id FROM apps WHERE name=?', [appName]);
      if (!app) return interaction.editReply({ content: '❌ App "' + appName + '" no encontrada.' });
      appId = app.id;
    }
    const count = appId
      ? (await db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [appId])).c
      : (await db.get('SELECT COUNT(*) as c FROM users')).c;
    const online = appId
      ? (await db.get('SELECT COUNT(*) as c FROM sessions WHERE app_id=? AND expires_at>?', [appId, Math.floor(Date.now()/1000)])).c
      : (await db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>?', [Math.floor(Date.now()/1000)])).c;
    const embed = goldEmbed('👥 Usuarios' + (appName ? ' — ' + appName : ''), '')
      .addFields(
        { name: 'Total', value: String(count), inline: true },
        { name: 'Online', value: String(online), inline: true }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName === 'keys') {
    await interaction.deferReply({ ephemeral: true });
    const appName = interaction.options.getString('app');
    const amount = interaction.options.getInteger('cantidad') || 1;
    const days = interaction.options.getInteger('dias') || 30;
    const app = await db.get('SELECT id FROM apps WHERE name=?', [appName]);
    if (!app) return interaction.editReply({ content: '❌ App "' + appName + '" no encontrada.' });

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = function(n) { let s=''; for(let i=0;i<n;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; };
    const created = [];
    for (let i = 0; i < amount; i++) {
      const kv = 'KEY-' + seg(5) + '-' + seg(5) + '-' + seg(5) + '-' + seg(5);
      await db.run('INSERT INTO licenses (id,app_id,key_value,note,duration,level,max_uses) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), app.id, kv, 'Discord bot', days || null, 1, 1]);
      created.push(kv);
    }
    const embed = goldEmbed('🔑 Keys Generadas — ' + appName,
      '`' + created.join('`\n`') + '`')
      .addFields({ name: 'Duracion', value: days ? days + ' dias' : 'Permanente', inline: true });
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName === 'ban') {
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('usuario');
    const appName = interaction.options.getString('app');
    const reason = interaction.options.getString('razon') || 'Baneado via Discord';
    const app = await db.get('SELECT id FROM apps WHERE name=?', [appName]);
    if (!app) return interaction.editReply({ content: '❌ App "' + appName + '" no encontrada.' });
    const user = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [app.id, username]);
    if (!user) return interaction.editReply({ content: '❌ Usuario "' + username + '" no encontrado.' });
    await db.run('UPDATE users SET banned=1,ban_reason=? WHERE id=?', [reason, user.id]);
    const embed = new EmbedBuilder().setColor(0xEF4444)
      .setTitle('🚫 Usuario Baneado')
      .addFields(
        { name: 'Usuario', value: username, inline: true },
        { name: 'App', value: appName, inline: true },
        { name: 'Razon', value: reason }
      ).setTimestamp().setFooter({ text: 'LMAx27 Panel' });
    return interaction.editReply({ embeds: [embed] });
  }
}

// ─── Iniciar el bot ────────────────────────────────────────────────────────────
async function startBot(token, guildId) {
  if (botClient) {
    try { botClient.destroy(); } catch (_) {}
    botClient = null;
    botReady = false;
    if (statsInterval) clearInterval(statsInterval);
    if (statusInterval) clearInterval(statusInterval);
  }

  botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  return new Promise(function(resolve) {
    const timeout = setTimeout(function() {
      resolve({ ok: false, error: 'Timeout - Token invalido o sin conexion' });
    }, 15000);

    botClient.once('ready', async function() {
      clearTimeout(timeout);
      botReady = true;
      console.log('[Discord] Bot conectado como', botClient.user.tag);

      // Registrar slash commands
      if (guildId) {
        try { await registerCommands(token, guildId); }
        catch (e) { console.log('[Discord] Error registrando commands:', e.message); }
      }

      // Status inicial
      await updateBotStatus();

      // Actualizar stats cada 30s
      statsInterval = setInterval(updateStatsChannels, 30000);

      // Actualizar status cada 60s
      statusInterval = setInterval(updateBotStatus, 60000);

      // Primera actualización de canales
      setTimeout(updateStatsChannels, 3000);

      resolve({ ok: true, tag: botClient.user.tag });
    });

    botClient.on('interactionCreate', handleSlashCommands);

    botClient.on('error', function(e) {
      console.log('[Discord] Error:', e.message);
    });

    botClient.login(token).catch(function(e) {
      clearTimeout(timeout);
      resolve({ ok: false, error: e.message });
    });
  });
}

// ─── Auto-iniciar bot al arrancar el servidor ──────────────────────────────────
setTimeout(async function() {
  try {
    const config = await getConfig();
    if (config && config.bot_token) {
      console.log('[Discord] Auto-iniciando bot...');
      const result = await startBot(config.bot_token, config.guild_id);
      if (result.ok) console.log('[Discord] Bot iniciado:', result.tag);
      else console.log('[Discord] Error al iniciar bot:', result.error);
    }
  } catch (e) { console.log('[Discord] Error en auto-inicio:', e.message); }
}, 3000);

// ─── Funcion exportable para notificaciones ────────────────────────────────────
async function notifyDiscord(type, data) {
  try {
    if (!botClient || !botReady) return;
    const config = await getConfig();
    if (!config || !config.log_channel_id) return;
    if (!config['notify_' + type]) return;

    const colors = { login: 0x22C55E, register: 0xF5C518, ban: 0xEF4444, keygen: 0x3B82F6 };
    const icons  = { login: '🔓', register: '📝', ban: '🚫', keygen: '🔑' };

    const embed = new EmbedBuilder()
      .setColor(colors[type] || 0xF5C518)
      .setTitle((icons[type] || '⚡') + ' ' + (data.title || type))
      .setDescription(data.description || '')
      .setTimestamp()
      .setFooter({ text: 'LMAx27 · ' + (data.app || '') });

    if (data.fields) embed.addFields(data.fields);

    const channel = await botClient.channels.fetch(config.log_channel_id).catch(function() { return null; });
    if (channel) await channel.send({ embeds: [embed] });
  } catch (_) {}
}

// Obtener link de invitacion del bot
router.get('/invite', requireAdmin, async function(req, res) {
  try {
    if (!botClient || !botReady) return res.json({ success: false, message: 'Bot no iniciado' });
    const clientId = botClient.user.id;
    const perms = '8'; // Administrator - simplifica todo
    const link = 'https://discord.com/api/oauth2/authorize?client_id=' + clientId +
      '&permissions=' + perms + '&scope=bot%20applications.commands';
    res.json({ success: true, link, clientId });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Obtener config
router.get('/config', requireAdmin, async function(req, res) {
  try {
    const config = await getConfig();
    const safe = Object.assign({}, config);
    safe.has_token = !!(safe.bot_token && safe.bot_token.length > 5);
    safe.bot_token_preview = safe.has_token ? safe.bot_token.substring(0, 6) + '...' + safe.bot_token.slice(-4) : '';
    safe.bot_token = ''; // nunca mandar el token al frontend
    safe.bot_online = botReady;
    safe.bot_tag = botReady && botClient ? botClient.user.tag : null;
    res.json({ success: true, config: safe });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Guardar config y reiniciar bot
router.post('/config', requireAdmin, async function(req, res) {
  try {
    const { bot_token, guild_id, log_channel_id, welcome_channel_id,
            chan_online_id, chan_users_id, chan_keys_id, chan_apps_id,
            notify_login, notify_register, notify_ban, notify_keygen } = req.body;

    const config = await getConfig();
    const updates = [];
    const values = [];

    const addField = function(key, val) {
      if (val !== undefined && val !== null && val !== '***HIDDEN***') {
        updates.push(key + '=?');
        values.push(val);
      }
    };

    if (bot_token) addField('bot_token', bot_token);
    addField('guild_id', guild_id);
    addField('log_channel_id', log_channel_id);
    addField('welcome_channel_id', welcome_channel_id);
    addField('chan_online_id', chan_online_id);
    addField('chan_users_id', chan_users_id);
    addField('chan_keys_id', chan_keys_id);
    addField('chan_apps_id', chan_apps_id);
    if (notify_login !== undefined)    addField('notify_login', notify_login ? 1 : 0);
    if (notify_register !== undefined) addField('notify_register', notify_register ? 1 : 0);
    if (notify_ban !== undefined)      addField('notify_ban', notify_ban ? 1 : 0);
    if (notify_keygen !== undefined)   addField('notify_keygen', notify_keygen ? 1 : 0);

    updates.push('updated_at=?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(config.id);

    await db.run('UPDATE discord_config SET ' + updates.join(',') + ' WHERE id=?', values);

    // Si se cambió el token, reiniciar bot
    if (bot_token) {
      const newConfig = await getConfig();
      const result = await startBot(newConfig.bot_token, newConfig.guild_id || guild_id);
      if (result.ok) return res.json({ success: true, message: 'Bot conectado: ' + result.tag });
      else return res.json({ success: false, message: 'Config guardada pero error al conectar: ' + result.error });
    }

    res.json({ success: true, message: 'Configuracion guardada' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Test de conexion
router.post('/test', requireAdmin, async function(req, res) {
  try {
    if (!botReady || !botClient) return res.json({ success: false, message: 'Bot no iniciado' });
    const config = await getConfig();
    if (!config.log_channel_id) return res.json({ success: false, message: 'Sin canal de logs configurado' });

    const embed = goldEmbed('⚡ LMAx27 — Test de Conexion',
      'El bot esta funcionando correctamente!\nTodos los sistemas operativos.');
    const channel = await botClient.channels.fetch(config.log_channel_id).catch(function() { return null; });
    if (!channel) return res.json({ success: false, message: 'Canal no encontrado' });
    await channel.send({ embeds: [embed] });

    res.json({ success: true, message: 'Mensaje enviado a #' + channel.name });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Obtener status del bot
router.get('/status', requireAdmin, async function(req, res) {
  try {
    const stats = await getStats();
    res.json({
      success: true,
      online: botReady,
      tag: botReady && botClient ? botClient.user.tag : null,
      ping: botReady && botClient ? botClient.ws.ping : null,
      stats
    });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Forzar update de stats channels
router.post('/update-stats', requireAdmin, async function(req, res) {
  try {
    await updateStatsChannels();
    res.json({ success: true, message: 'Canales actualizados' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// Enviar mensaje manual
router.post('/send', requireAdmin, async function(req, res) {
  try {
    if (!botReady || !botClient) return res.json({ success: false, message: 'Bot no iniciado' });
    const { channel_id, title, message, color } = req.body;
    const config = await getConfig();
    const targetId = channel_id || config.log_channel_id;
    if (!targetId) return res.json({ success: false, message: 'Sin canal' });
    const channel = await botClient.channels.fetch(targetId).catch(function() { return null; });
    if (!channel) return res.json({ success: false, message: 'Canal no encontrado' });
    const embed = goldEmbed(title || '📢 Anuncio', message || '');
    if (color) embed.setColor(parseInt(color.replace('#',''), 16));
    await channel.send({ embeds: [embed] });
    res.json({ success: true, message: 'Enviado a #' + channel.name });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
module.exports.notifyDiscord = notifyDiscord;
