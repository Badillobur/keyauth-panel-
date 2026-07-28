/**
 * LMAx27 Discord Bot v2
 * - RPC rotativo cada 3s: servers conectados / apps online / users online
 * - Slash commands mejorados
 * - Notificaciones con embeds ricos
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
        EmbedBuilder, ActivityType } = require('discord.js');

let botClient = null;
let botReady = false;
let statsInterval = null;
let rpcInterval = null;
let rpcIndex = 0;

async function initDiscordTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS discord_config (
    id TEXT PRIMARY KEY, bot_token TEXT DEFAULT '', guild_id TEXT DEFAULT '',
    log_channel_id TEXT DEFAULT '', welcome_channel_id TEXT DEFAULT '',
    chan_online_id TEXT DEFAULT '', chan_users_id TEXT DEFAULT '',
    chan_keys_id TEXT DEFAULT '', chan_apps_id TEXT DEFAULT '',
    notify_login INTEGER DEFAULT 1, notify_register INTEGER DEFAULT 1,
    notify_ban INTEGER DEFAULT 1, notify_keygen INTEGER DEFAULT 1,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
  const ex = await db.get('SELECT id FROM discord_config LIMIT 1');
  if (!ex) await db.run('INSERT INTO discord_config (id) VALUES (?)', [uuidv4()]);

  // Tabla para bots de partners/admin (múltiples bots)
  await db.run(`CREATE TABLE IF NOT EXISTS partner_discord_bots (
    id          TEXT PRIMARY KEY,
    partner_id  TEXT NOT NULL,
    app_id      TEXT NOT NULL,
    bot_name    TEXT DEFAULT '',
    bot_token   TEXT DEFAULT '',
    guild_id    TEXT DEFAULT '',
    log_channel_id  TEXT DEFAULT '',
    chan_online_id  TEXT DEFAULT '',
    chan_users_id   TEXT DEFAULT '',
    chan_keys_id    TEXT DEFAULT '',
    active      INTEGER DEFAULT 1,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  )`);
}
initDiscordTable();

function getConfig() { return db.get('SELECT * FROM discord_config LIMIT 1'); }

async function getStats() {
  const now = Math.floor(Date.now() / 1000);
  const [apps, users, online, keys, usedKeys] = await Promise.all([
    db.get('SELECT COUNT(*) as c FROM apps').then(function(r){return r?r.c:0;}),
    db.get('SELECT COUNT(*) as c FROM users').then(function(r){return r?r.c:0;}),
    db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>?',[now]).then(function(r){return r?r.c:0;}),
    db.get('SELECT COUNT(*) as c FROM licenses').then(function(r){return r?r.c:0;}),
    db.get('SELECT COUNT(*) as c FROM licenses WHERE used>0').then(function(r){return r?r.c:0;})
  ]);
  return { apps, users, online, keys, usedKeys };
}

function goldEmbed(title, desc) {
  return new EmbedBuilder().setColor(0xF5C518).setTitle(title).setDescription(desc||'').setTimestamp().setFooter({text:'LMAx27 Panel v2.0'});
}

// ─── RPC rotativo cada 3 segundos ────────────────────────────────────────────
const rpcMessages = [
  async function(stats) { return { name: '🌐 ' + stats.apps + ' servidor' + (stats.apps===1?'':'s') + ' conectado' + (stats.apps===1?'':'s'), type: ActivityType.Watching }; },
  async function(stats) { return { name: '📦 ' + stats.apps + ' app' + (stats.apps===1?'':'s') + ' activa' + (stats.apps===1?'':'s'), type: ActivityType.Playing }; },
  async function(stats) { return { name: '🟢 ' + stats.online + ' usuario' + (stats.online===1?'':'s') + ' online ahora', type: ActivityType.Watching }; },
  async function(stats) { return { name: '👥 ' + stats.users + ' usuario' + (stats.users===1?'':'s') + ' registrado' + (stats.users===1?'':'s'), type: ActivityType.Watching }; },
  async function(stats) { return { name: '🔑 ' + stats.keys + ' licencia' + (stats.keys===1?'':'s') + ' generada' + (stats.keys===1?'':'s'), type: ActivityType.Playing }; },
  async function(stats) { return { name: '⚡ LMAx27 — Sistema de Licencias', type: ActivityType.Custom }; },
];

async function rotateRPC() {
  if (!botClient || !botReady) return;
  try {
    const stats = await getStats();
    const msgFn = rpcMessages[rpcIndex % rpcMessages.length];
    const activity = await msgFn(stats);
    botClient.user.setPresence({ status: 'online', activities: [activity] });
    rpcIndex++;
  } catch (_) {}
}

async function updateStatsChannels() {
  if (!botClient || !botReady) return;
  try {
    const config = await getConfig();
    if (!config.guild_id) return;
    const s = await getStats();
    const updates = [
      { id: config.chan_online_id,  name: '🟢・Online: ' + s.online },
      { id: config.chan_users_id,   name: '👥・Users: ' + s.users },
      { id: config.chan_keys_id,    name: '🔑・Keys: ' + s.keys },
      { id: config.chan_apps_id,    name: '📦・Apps: ' + s.apps },
    ];
    for (const u of updates) {
      if (!u.id) continue;
      try { const ch = await botClient.channels.fetch(u.id); if (ch) await ch.setName(u.name); } catch (_) {}
    }
  } catch (_) {}
}

// ─── Slash Commands ───────────────────────────────────────────────────────────
async function registerCommands(token, guildId) {
  const cmds = [
    new SlashCommandBuilder().setName('ping').setDescription('Latencia del bot'),
    new SlashCommandBuilder().setName('stats').setDescription('Estadisticas del sistema LMAx27'),
    new SlashCommandBuilder().setName('usuarios')
      .setDescription('Usuarios de una app')
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(false).setAutocomplete(true);}),
    new SlashCommandBuilder().setName('keys')
      .setDescription('Generar keys desde Discord')
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(true).setAutocomplete(true);})
      .addIntegerOption(function(o){return o.setName('cantidad').setDescription('Cuantas keys (1-50)').setRequired(true).setMinValue(1).setMaxValue(50);})
      .addIntegerOption(function(o){return o.setName('dias').setDescription('Duracion en dias, 0 = permanente').setRequired(false).setMinValue(0);})
      .addStringOption(function(o){return o.setName('nivel').setDescription('Nivel de la key').setRequired(false).addChoices({name:'Basic',value:'1'},{name:'Premium',value:'2'},{name:'VIP',value:'3'});}),
    new SlashCommandBuilder().setName('ban')
      .setDescription('Banear usuario')
      .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true).setAutocomplete(true);})
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(true).setAutocomplete(true);})
      .addStringOption(function(o){return o.setName('razon').setDescription('Razon del ban').setRequired(false);}),
    new SlashCommandBuilder().setName('unban')
      .setDescription('Desbanear usuario')
      .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true).setAutocomplete(true);})
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(true).setAutocomplete(true);}),
    new SlashCommandBuilder().setName('resetear-hwid')
      .setDescription('Resetear HWID de un usuario')
      .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true).setAutocomplete(true);})
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(true).setAutocomplete(true);}),
    new SlashCommandBuilder().setName('extender')
      .setDescription('Extender suscripcion de un usuario')
      .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true).setAutocomplete(true);})
      .addStringOption(function(o){return o.setName('app').setDescription('Selecciona la app').setRequired(true).setAutocomplete(true);})
      .addIntegerOption(function(o){return o.setName('dias').setDescription('Dias a agregar').setRequired(true).setMinValue(1);}),
    new SlashCommandBuilder().setName('buscar')
      .setDescription('Buscar usuario en el sistema')
      .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true);}),
    new SlashCommandBuilder().setName('anuncio')
      .setDescription('Enviar anuncio al canal de logs')
      .addStringOption(function(o){return o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true);})
      .addStringOption(function(o){return o.setName('titulo').setDescription('Titulo del anuncio').setRequired(false);}),
  ].map(function(c){return c.toJSON();});
  const rest = new REST({version:'10'}).setToken(token);
  await rest.put(Routes.applicationGuildCommands(botClient.user.id, guildId), {body: cmds});
  console.log('[Discord] ' + cmds.length + ' comandos registrados en el servidor');
}

async function handleCommands(interaction) {
  // ── AUTOCOMPLETE ─────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused(true);
    const cmd = interaction.commandName;
    let choices = [];

    if (focused.name === 'app') {
      const apps = await db.all('SELECT name FROM apps ORDER BY name ASC LIMIT 25');
      const query = focused.value.toLowerCase();
      choices = apps
        .filter(function(a) { return a.name.toLowerCase().includes(query); })
        .map(function(a) { return { name: a.name, value: a.name }; });
    }

    if (focused.name === 'usuario') {
      const appVal = interaction.options.getString('app') || '';
      let users = [];
      if (appVal) {
        const app = await db.get('SELECT id FROM apps WHERE name=?', [appVal]);
        if (app) {
          users = await db.all('SELECT username FROM users WHERE app_id=? AND username LIKE ? LIMIT 25',
            [app.id, '%' + focused.value + '%']);
        }
      } else {
        users = await db.all('SELECT DISTINCT username FROM users WHERE username LIKE ? LIMIT 25',
          ['%' + focused.value + '%']);
      }
      choices = users.map(function(u) { return { name: u.username, value: u.username }; });
    }

    return interaction.respond(choices).catch(function() {});
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  if (cmd === 'ping') {
    return interaction.reply({ embeds: [goldEmbed('🏓 Pong!', 'Latencia WS: **' + botClient.ws.ping + 'ms**')], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (cmd === 'stats') {
    const s = await getStats();
    const embed = goldEmbed('⚡ LMAx27 — Estadísticas', '```\n  Sistema operativo al 100%\n```')
      .addFields(
        {name:'🌐 Servidores/Apps', value:'`' + s.apps + '`', inline:true},
        {name:'🟢 Usuarios Online', value:'`' + s.online + '`', inline:true},
        {name:'👥 Total Usuarios',  value:'`' + s.users + '`', inline:true},
        {name:'🔑 Keys Totales',    value:'`' + s.keys + '`', inline:true},
        {name:'✅ Keys Usadas',     value:'`' + s.usedKeys + '`', inline:true},
        {name:'🆓 Keys Libres',     value:'`' + (s.keys - s.usedKeys) + '`', inline:true}
      );
    return interaction.editReply({ embeds: [embed] });
  }

  if (cmd === 'usuarios') {
    const appName = interaction.options.getString('app');
    let where = ''; let params = [];
    if (appName) {
      const app = await db.get('SELECT id FROM apps WHERE name=?', [appName]);
      if (!app) return interaction.editReply({content:'❌ App "' + appName + '" no encontrada.'});
      where = ' WHERE app_id=?'; params = [app.id];
    }
    const total = (await db.get('SELECT COUNT(*) as c FROM users' + where, params)).c;
    const now = Math.floor(Date.now()/1000);
    const recent = await db.all('SELECT username,ip,createdate FROM users' + where + ' ORDER BY createdate DESC LIMIT 8', params);
    const embed = goldEmbed('👥 Usuarios' + (appName?' — '+appName:''), '')
      .addFields({name:'Total registrados', value:'`' + total + '`', inline:true})
      .addFields({name:'Ultimos registros', value: recent.length ? recent.map(function(u){return '`'+u.username+'`';}).join(' ') : 'Sin usuarios'});
    return interaction.editReply({ embeds: [embed] });
  }

  if (cmd === 'keys') {
    const appName = interaction.options.getString('app');
    const amount = interaction.options.getInteger('cantidad') || 1;
    const dias = interaction.options.getInteger('dias');
    const nivel = parseInt(interaction.options.getString('nivel') || '1');
    const app = await db.get('SELECT id,name FROM apps WHERE name=?', [appName]);
    if (!app) return interaction.editReply({content:'❌ App "'+appName+'" no encontrada.'});
    const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg=function(n){let s='';for(let i=0;i<n;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s;};
    const created=[];
    for (let i=0;i<amount;i++) {
      const kv='KEY-'+seg(5)+'-'+seg(5)+'-'+seg(5)+'-'+seg(5);
      await db.run('INSERT INTO licenses (id,app_id,key_value,note,duration,level,max_uses) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), app.id, kv, 'Discord /keys', dias||null, nivel, 1]);
      created.push(kv);
    }
    const embed = goldEmbed('🔑 ' + amount + ' Key' + (amount===1?'':'s') + ' Generada' + (amount===1?'':'s') + ' — ' + appName,
      '```\n' + created.join('\n') + '\n```')
      .addFields(
        {name:'App', value:appName, inline:true},
        {name:'Duracion', value: dias?dias+'d':'Permanente', inline:true},
        {name:'Nivel', value:nivel===1?'Basic':nivel===2?'Premium':'VIP', inline:true}
      );
    return interaction.editReply({ embeds: [embed] });
  }

  if (cmd === 'ban') {
    const username=interaction.options.getString('usuario');
    const appName=interaction.options.getString('app');
    const reason=interaction.options.getString('razon')||'Baneado via Discord';
    const app=await db.get('SELECT id FROM apps WHERE name=?',[appName]);
    if (!app) return interaction.editReply({content:'❌ App "'+appName+'" no encontrada.'});
    const user=await db.get('SELECT id FROM users WHERE app_id=? AND username=?',[app.id,username]);
    if (!user) return interaction.editReply({content:'❌ Usuario "'+username+'" no encontrado.'});
    await db.run('UPDATE users SET banned=1,ban_reason=? WHERE id=?',[reason,user.id]);
    const embed=new EmbedBuilder().setColor(0xEF4444).setTitle('🚫 Usuario Baneado')
      .addFields({name:'Usuario',value:username,inline:true},{name:'App',value:appName,inline:true},{name:'Razon',value:reason})
      .setTimestamp().setFooter({text:'LMAx27 Panel'});
    return interaction.editReply({embeds:[embed]});
  }

  if (cmd === 'unban') {
    const username=interaction.options.getString('usuario');
    const appName=interaction.options.getString('app');
    const app=await db.get('SELECT id FROM apps WHERE name=?',[appName]);
    if (!app) return interaction.editReply({content:'❌ App "'+appName+'" no encontrada.'});
    const user=await db.get('SELECT id FROM users WHERE app_id=? AND username=?',[app.id,username]);
    if (!user) return interaction.editReply({content:'❌ Usuario "'+username+'" no encontrado.'});
    await db.run('UPDATE users SET banned=0,ban_reason="" WHERE id=?',[user.id]);
    return interaction.editReply({embeds:[goldEmbed('✅ Usuario Desbaneado','**'+username+'** fue desbaneado de **'+appName+'**')]});
  }

  if (cmd === 'resetear-hwid') {
    const username=interaction.options.getString('usuario');
    const appName=interaction.options.getString('app');
    const app=await db.get('SELECT id FROM apps WHERE name=?',[appName]);
    if (!app) return interaction.editReply({content:'❌ App no encontrada.'});
    const user=await db.get('SELECT id FROM users WHERE app_id=? AND username=?',[app.id,username]);
    if (!user) return interaction.editReply({content:'❌ Usuario no encontrado.'});
    await db.run("UPDATE users SET hwid='' WHERE id=?",[user.id]);
    return interaction.editReply({embeds:[goldEmbed('🖥️ HWID Reseteado','HWID de **'+username+'** reseteado correctamente.')]});
  }

  if (cmd === 'extender') {
    const username=interaction.options.getString('usuario');
    const appName=interaction.options.getString('app');
    const dias=interaction.options.getInteger('dias');
    const app=await db.get('SELECT id FROM apps WHERE name=?',[appName]);
    if (!app) return interaction.editReply({content:'❌ App no encontrada.'});
    const user=await db.get('SELECT id FROM users WHERE app_id=? AND username=?',[app.id,username]);
    if (!user) return interaction.editReply({content:'❌ Usuario no encontrado.'});
    const now=Math.floor(Date.now()/1000);
    const sub=await db.get('SELECT * FROM subscriptions WHERE user_id=? AND app_id=?',[user.id,app.id]);
    if (sub) {
      const base=(sub.expiry&&sub.expiry>now)?sub.expiry:now;
      await db.run('UPDATE subscriptions SET expiry=? WHERE id=?',[base+(dias*86400),sub.id]);
    } else {
      await db.run("INSERT INTO subscriptions (id,user_id,app_id,name,expiry) VALUES (?,?,?,'default',?)",[uuidv4(),user.id,app.id,now+(dias*86400)]);
    }
    return interaction.editReply({embeds:[goldEmbed('⏳ Suscripcion Extendida','**'+username+'** recibio **'+dias+' dias** adicionales en **'+appName+'**')]});
  }

  if (cmd === 'buscar') {
    const username=interaction.options.getString('usuario');
    const users=await db.all('SELECT u.*,(SELECT name FROM subscriptions WHERE user_id=u.id LIMIT 1) as sub_name,(SELECT expiry FROM subscriptions WHERE user_id=u.id LIMIT 1) as sub_expiry,(SELECT name FROM apps WHERE id=u.app_id) as app_name FROM users u WHERE u.username LIKE ? LIMIT 5',['%'+username+'%']);
    if (!users.length) return interaction.editReply({content:'❌ Sin resultados para "'+username+'".'});
    const now=Math.floor(Date.now()/1000);
    const embed=goldEmbed('🔍 Resultados para "'+username+'"','');
    users.forEach(function(u){
      const estado=u.banned?'🚫 Baneado':!u.sub_expiry?'∞ Permanente':u.sub_expiry<now?'⏰ Expirado':'✅ Activo';
      embed.addFields({name:u.username,value:'App: `'+u.app_name+'` | Estado: '+estado+'| IP: `'+u.ip+'`',inline:false});
    });
    return interaction.editReply({embeds:[embed]});
  }

  if (cmd === 'anuncio') {
    const msg=interaction.options.getString('mensaje');
    const titulo=interaction.options.getString('titulo')||'📢 Anuncio';
    const config=await getConfig();
    if (!config.log_channel_id) return interaction.editReply({content:'❌ Sin canal de logs configurado.'});
    const ch=await botClient.channels.fetch(config.log_channel_id).catch(function(){return null;});
    if (!ch) return interaction.editReply({content:'❌ Canal no encontrado.'});
    await ch.send({embeds:[goldEmbed(titulo,msg)]});
    return interaction.editReply({embeds:[goldEmbed('✅ Anuncio Enviado','Mensaje enviado a <#'+config.log_channel_id+'>')]});
  }
}

// ─── Iniciar bot ──────────────────────────────────────────────────────────────
async function startBot(token, guildId) {
  // Limpiar bot anterior
  if (botClient) {
    try { botClient.destroy(); } catch(_){}
    botClient = null; botReady = false;
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    if (rpcInterval)   { clearInterval(rpcInterval);   rpcInterval = null; }
  }

  // Validar token básico antes de intentar conectar
  const cleanToken = token.replace(/[\s\n\r\t\u0000-\u001F\u007F-\u009F]/g, '');
  if (!cleanToken || cleanToken.length < 20) {
    return { ok: false, error: 'Token invalido (longitud: ' + (cleanToken ? cleanToken.length : 0) + ')' };
  }
  console.log('[Discord] Intentando conectar con token de ' + cleanToken.length + ' chars...');

  botClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  return new Promise(function(resolve) {
    // 45 segundos de timeout — suficiente para Render al despertar
    const timeout = setTimeout(function() {
      console.log('[Discord] Timeout al conectar bot');
      resolve({ ok: false, error: 'Timeout de conexion (45s). Verifica que el token sea correcto y que el bot no este en otro proceso.' });
    }, 45000);

    botClient.once('ready', async function() {
      clearTimeout(timeout);
      botReady = true;
      console.log('[Discord] Bot conectado como', botClient.user.tag);

      // Registrar slash commands
      if (guildId) {
        try { await registerCommands(token, guildId); }
        catch(e) { console.log('[Discord] Error commands:', e.message); }
      }

      // RPC rotativo cada 3s
      rpcIndex = 0;
      await rotateRPC();
      rpcInterval = setInterval(rotateRPC, 3000);

      // Canales stats cada 5 min
      statsInterval = setInterval(updateStatsChannels, 300000);
      setTimeout(updateStatsChannels, 5000);

      resolve({ ok: true, tag: botClient.user.tag });
    });

    botClient.on('interactionCreate', handleCommands);

    botClient.on('error', function(e) {
      console.log('[Discord] Error:', e.message);
    });

    // Intentar login con token limpio
    botClient.login(cleanToken).catch(function(e) {
      clearTimeout(timeout);
      let errorMsg = e.message;
      if (e.message.includes('TOKEN_INVALID') || e.message.includes('401')) {
        errorMsg = 'Token invalido — verifica que copiaste el token completo desde Discord Developer Portal';
      }
      resolve({ ok: false, error: errorMsg });
    });
  });
}

// Auto-iniciar al arrancar
setTimeout(async function() {
  try {
    const config = await getConfig();
    if (config && config.bot_token) {
      const r = await startBot(config.bot_token, config.guild_id);
      console.log('[Discord]', r.ok ? 'Bot iniciado: '+r.tag : 'Error: '+r.error);
    }
  } catch(e) { console.log('[Discord] Error auto-inicio:', e.message); }
}, 3000);

// ─── Notificacion exportable ──────────────────────────────────────────────────
async function notifyDiscord(type, data) {
  try {
    if (!botClient || !botReady) return;
    const config = await getConfig();
    if (!config || !config.log_channel_id) return;
    if (!config['notify_'+type]) return;
    const colors={login:0x22C55E,register:0xF5C518,ban:0xEF4444,keygen:0x3B82F6};
    const icons={login:'🔓',register:'📝',ban:'🚫',keygen:'🔑'};
    const embed=new EmbedBuilder().setColor(colors[type]||0xF5C518)
      .setTitle((icons[type]||'⚡')+' '+(data.title||type))
      .setDescription(data.description||'').setTimestamp().setFooter({text:'LMAx27 · '+(data.app||'')});
    if (data.fields) embed.addFields(data.fields);
    const ch=await botClient.channels.fetch(config.log_channel_id).catch(function(){return null;});
    if (ch) await ch.send({embeds:[embed]});
  } catch(_){}
}

// ─── ROUTES REST ─────────────────────────────────────────────────────────────

router.get('/invite', requireAdmin, async function(req, res) {
  try {
    if (!botClient || !botReady) return res.json({success:false, message:'Bot no iniciado'});
    const link = 'https://discord.com/api/oauth2/authorize?client_id=' + botClient.user.id + '&permissions=8&scope=bot%20applications.commands';
    res.json({success:true, link});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.get('/config', requireAdmin, async function(req, res) {
  try {
    const c = await getConfig();
    const safe = Object.assign({}, c);
    safe.has_token = !!(safe.bot_token && safe.bot_token.length > 5);
    safe.bot_token_preview = safe.has_token ? safe.bot_token.substring(0,6)+'...'+safe.bot_token.slice(-4) : '';
    safe.bot_token = '';
    safe.bot_online = botReady;
    safe.bot_tag = botReady && botClient ? botClient.user.tag : null;
    res.json({success:true, config:safe});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.post('/config', requireAdmin, async function(req, res) {
  try {
    const body = req.body;
    const config = await getConfig();
    const updates = []; const values = [];
    const add = function(k,v) { if (v !== undefined && v !== null) { updates.push(k+'=?'); values.push(v); } };
    if (body.bot_token) add('bot_token', body.bot_token);
    add('guild_id', body.guild_id);
    add('log_channel_id', body.log_channel_id);
    add('welcome_channel_id', body.welcome_channel_id);
    add('chan_online_id', body.chan_online_id);
    add('chan_users_id', body.chan_users_id);
    add('chan_keys_id', body.chan_keys_id);
    add('chan_apps_id', body.chan_apps_id);
    if (body.notify_login !== undefined)    add('notify_login', body.notify_login ? 1 : 0);
    if (body.notify_register !== undefined) add('notify_register', body.notify_register ? 1 : 0);
    if (body.notify_ban !== undefined)      add('notify_ban', body.notify_ban ? 1 : 0);
    if (body.notify_keygen !== undefined)   add('notify_keygen', body.notify_keygen ? 1 : 0);
    updates.push('updated_at=?'); values.push(Math.floor(Date.now()/1000));
    values.push(config.id);
    await db.run('UPDATE discord_config SET ' + updates.join(',') + ' WHERE id=?', values);
    if (body.bot_token) {
      const newCfg = await getConfig();
      const r = await startBot(newCfg.bot_token, newCfg.guild_id || body.guild_id);
      return res.json({success:r.ok, message: r.ok ? 'Bot conectado: '+r.tag : 'Error: '+r.error});
    }
    res.json({success:true, message:'Configuracion guardada'});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.post('/test', requireAdmin, async function(req, res) {
  try {
    if (!botClient || !botReady) return res.json({success:false, message:'Bot no iniciado'});
    const config = await getConfig();
    if (!config.log_channel_id) return res.json({success:false, message:'Sin canal de logs'});
    const ch = await botClient.channels.fetch(config.log_channel_id).catch(function(){return null;});
    if (!ch) return res.json({success:false, message:'Canal no encontrado'});
    await ch.send({embeds:[goldEmbed('⚡ Test — LMAx27', 'Bot funcionando correctamente!\nLatencia: **'+botClient.ws.ping+'ms**')]});
    res.json({success:true, message:'Enviado a #'+ch.name});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.get('/status', requireAdmin, async function(req, res) {
  try {
    const stats = await getStats();
    res.json({success:true, online:botReady, tag:botReady&&botClient?botClient.user.tag:null, ping:botReady&&botClient?botClient.ws.ping:null, stats});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.post('/update-stats', requireAdmin, async function(req, res) {
  try { await updateStatsChannels(); res.json({success:true, message:'Canales actualizados'}); }
  catch(e) { res.json({success:false, message:e.message}); }
});

// Reconectar bot con el token ya guardado en DB
router.post('/reconnect', requireAdmin, async function(req, res) {
  try {
    const config = await getConfig();
    if (!config || !config.bot_token) {
      return res.json({success:false, message:'No hay token guardado. Pega el token primero.'});
    }
    const r = await startBot(config.bot_token, config.guild_id);
    if (r.ok) return res.json({success:true, message:'Bot reconectado: ' + r.tag});
    return res.json({success:false, message:'Error al reconectar: ' + r.error});
  } catch(e) { res.json({success:false, message:e.message}); }
});

router.post('/send', requireAdmin, async function(req, res) {
  try {
    if (!botClient || !botReady) return res.json({success:false, message:'Bot no iniciado'});
    const { channel_id, title, message } = req.body;
    const config = await getConfig();
    const targetId = channel_id || config.log_channel_id;
    if (!targetId) return res.json({success:false, message:'Sin canal'});
    const ch = await botClient.channels.fetch(targetId).catch(function(){return null;});
    if (!ch) return res.json({success:false, message:'Canal no encontrado'});
    await ch.send({embeds:[goldEmbed(title||'📢 Anuncio', message||'')]});
    res.json({success:true, message:'Enviado a #'+ch.name});
  } catch(e) { res.json({success:false, message:e.message}); }
});

// ─── BOTS POR PARTNER ─────────────────────────────────────────────────────────
// Cada partner/owner puede tener su propio bot solo para su app asignada
// Admin controla: max_bots por partner (default 1)

// Mapa de clientes de bot activos por partner_id
var partnerBots = {};

// ─── BOTS POR PARTNER ─────────────────────────────────────────────────────────
// Sistema de permisos granular controlado por el admin
// Admin controla EXACTAMENTE qué puede hacer cada partner/owner

// Mapa de clientes de bot activos por partner_id
var partnerBots = {};

// Permisos por defecto (admin puede cambiar)
const DEFAULT_PERMISSIONS = {
  can_genkeys: true,       // Puede generar keys
  can_view_users: true,    // Puede ver usuarios
  can_ban_users: true,     // Puede banear
  can_view_logs: true,     // Puede ver logs
  can_reset_hwid: true,    // Puede resetear HWID
  can_extend_sub: true,    // Puede extender suscripciones
  max_keys_per_day: 100,   // Máximo keys por día
  max_key_duration: 365    // Máximo días por key (1 año)
};

async function getPartnerPermissions(partnerId, appId) {
  const perms = await db.get('SELECT * FROM partner_permissions WHERE partner_id=? AND app_id=?', [partnerId, appId]);
  return perms || DEFAULT_PERMISSIONS;
}

async function startPartnerBot(botId, token, guildId, appId, partnerId) {
  // Destruir si ya existe
  if (partnerBots[botId]) {
    try { partnerBots[botId].client.destroy(); } catch(_) {}
    delete partnerBots[botId];
  }
  const cleanToken = token.replace(/[\s\n\r\t\u0000-\u001F\u007F-\u009F]/g, '');
  if (!cleanToken || cleanToken.length < 20) return { ok: false, error: 'Token invalido' };

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  return new Promise(function(resolve) {
    const timeout = setTimeout(function() { resolve({ ok: false, error: 'Timeout de conexion (30s)' }); }, 30000);
    client.once('ready', async function() {
      clearTimeout(timeout);
      partnerBots[botId] = { client, appId, partnerId, ready: true };
      console.log('[PartnerBot] Bot conectado:', client.user.tag, 'para partner', partnerId);
      
      // Obtener permisos del partner
      const perms = await getPartnerPermissions(partnerId, appId);
      
      // Registrar comandos basados en permisos
      if (guildId) {
        try {
          const cmds = [
            new SlashCommandBuilder().setName('ping').setDescription('Latencia del bot'),
            new SlashCommandBuilder().setName('stats').setDescription('Stats de tu app')
          ];
          
          // Solo agregar comandos si tiene permisos
          if (perms.can_genkeys) {
            cmds.push(
              new SlashCommandBuilder().setName('keys').setDescription('Generar keys')
                .addIntegerOption(function(o){return o.setName('cantidad').setDescription('Cuantas keys').setRequired(true).setMinValue(1).setMaxValue(Math.min(50, perms.max_keys_per_day));})
                .addIntegerOption(function(o){return o.setName('dias').setDescription('Dias (0=permanente)').setRequired(false).setMinValue(0).setMaxValue(perms.max_key_duration);})
            );
          }
          
          if (perms.can_view_users) {
            cmds.push(
              new SlashCommandBuilder().setName('usuarios').setDescription('Ver usuarios de tu app')
                .addStringOption(function(o){return o.setName('buscar').setDescription('Buscar usuario').setRequired(false);})
            );
          }
          
          if (perms.can_ban_users) {
            cmds.push(
              new SlashCommandBuilder().setName('ban').setDescription('Banear usuario')
                .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true);})
                .addStringOption(function(o){return o.setName('razon').setDescription('Razon del ban').setRequired(false);}),
              new SlashCommandBuilder().setName('unban').setDescription('Desbanear usuario')
                .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true);})
            );
          }
          
          if (perms.can_reset_hwid) {
            cmds.push(
              new SlashCommandBuilder().setName('reset-hwid').setDescription('Resetear HWID de usuario')
                .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true);})
            );
          }
          
          if (perms.can_extend_sub) {
            cmds.push(
              new SlashCommandBuilder().setName('extender').setDescription('Extender suscripcion')
                .addStringOption(function(o){return o.setName('usuario').setDescription('Username').setRequired(true);})
                .addIntegerOption(function(o){return o.setName('dias').setDescription('Dias a agregar').setRequired(true).setMinValue(1).setMaxValue(365);})
            );
          }
          
          if (perms.can_view_logs) {
            cmds.push(
              new SlashCommandBuilder().setName('logs').setDescription('Ver logs de actividad')
                .addIntegerOption(function(o){return o.setName('ultimos').setDescription('Ultimos N registros').setRequired(false).setMinValue(1).setMaxValue(20);})
            );
          }
          
          const rest = new REST({version:'10'}).setToken(cleanToken);
          await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: cmds.map(c => c.toJSON()) });
          console.log('[PartnerBot]', cmds.length, 'comandos registrados con permisos para', partnerId);
        } catch(e) { console.log('[PartnerBot] Error registrando commands:', e.message); }
      }
      
      // RPC dinámico basado en la app
      const app = await db.get('SELECT name FROM apps WHERE id=?', [appId]);
      const appName = app ? app.name : 'LMAx27';
      try { 
        client.user.setPresence({ 
          status: 'online', 
          activities: [{ name: `${appName} - Sistema de Auth`, type: ActivityType.Watching }] 
        }); 
      } catch(_) {}

      // Manejador de comandos con verificación de permisos
      client.on('interactionCreate', async function(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const cmd = interaction.commandName;
        
        if (cmd === 'ping') return interaction.reply({ content: 'Pong! WS: **' + client.ws.ping + 'ms**', ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        
        // Verificar permisos antes de cada comando
        const perms = await getPartnerPermissions(partnerId, appId);
        
        if (cmd === 'stats') {
          const now = Math.floor(Date.now()/1000);
          const [users, keys, online, banned] = await Promise.all([
            db.get('SELECT COUNT(*) as c FROM users WHERE app_id=?', [appId]).then(function(r){return r?r.c:0;}),
            db.get('SELECT COUNT(*) as c FROM licenses WHERE app_id=?', [appId]).then(function(r){return r?r.c:0;}),
            db.get('SELECT COUNT(*) as c FROM sessions WHERE expires_at>? AND app_id=?', [now,appId]).then(function(r){return r?r.c:0;}),
            db.get('SELECT COUNT(*) as c FROM users WHERE app_id=? AND banned=1', [appId]).then(function(r){return r?r.c:0;})
          ]);
          const app = await db.get('SELECT name FROM apps WHERE id=?', [appId]);
          const embed = goldEmbed('📊 Stats — '+(app?app.name:'App'), '')
            .addFields(
              {name:'👥 Usuarios',value:'`'+users+'`',inline:true},
              {name:'🔑 Keys',value:'`'+keys+'`',inline:true},
              {name:'🟢 Online',value:'`'+online+'`',inline:true},
              {name:'🚫 Baneados',value:'`'+banned+'`',inline:true},
              {name:'⚡ Bot',value:'Partner Bot',inline:true},
              {name:'🎯 Permisos',value:Object.values(perms).filter(Boolean).length+'/8',inline:true}
            );
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'keys' && perms.can_genkeys) {
          const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [partnerId, appId]);
          if (!pa || !pa.can_genkeys) return interaction.editReply({ content: '❌ Sin permiso para generar keys' });
          
          const amount = interaction.options.getInteger('cantidad') || 1;
          const dias = interaction.options.getInteger('dias') || 0;
          
          // Verificar límite diario
          const today = new Date().toISOString().split('T')[0];
          const todayKeys = await db.get(
            'SELECT COUNT(*) as c FROM licenses WHERE app_id=? AND note LIKE ? AND date(created_at, "unixepoch") = ?',
            [appId, '%partner%', today]
          );
          if (todayKeys && todayKeys.c + amount > perms.max_keys_per_day) {
            return interaction.editReply({ content: `❌ Límite diario alcanzado (${todayKeys.c}/${perms.max_keys_per_day})` });
          }
          
          // Verificar duración máxima
          if (dias > perms.max_key_duration) {
            return interaction.editReply({ content: `❌ Duración máxima: ${perms.max_key_duration} días` });
          }
          
          // Verificar limite total del partner
          if (pa.key_limit > 0) {
            const left = pa.key_limit - (pa.keys_used || 0);
            if (left <= 0) return interaction.editReply({ content: 'Limite total alcanzado (' + pa.keys_used + '/' + pa.key_limit + ')' });
            if (amount > left) return interaction.editReply({ content: 'Solo puedes generar ' + left + ' key(s) más' });
          }
          
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          const seg = function(n){ let s=''; for(let i=0;i<n;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; };
          const created = [];
          
          for (let i = 0; i < amount; i++) {
            const kv = 'KEY-'+seg(5)+'-'+seg(5)+'-'+seg(5)+'-'+seg(5);
            await db.run('INSERT INTO licenses (id,app_id,key_value,note,duration,level,max_uses,created_at) VALUES (?,?,?,?,?,?,?,?)',
              [uuidv4(), appId, kv, `Partner ${partnerId} - Discord`, dias||null, 1, 1, Math.floor(Date.now()/1000)]);
            created.push(kv);
          }
          
          // Actualizar contador
          if (pa.key_limit > 0) await db.run('UPDATE partner_apps SET keys_used=keys_used+? WHERE partner_id=? AND app_id=?', [amount, partnerId, appId]);
          
          // Log de la acción
          await db.run('INSERT INTO logs (id,app_id,username,action,ip,created_at) VALUES (?,?,?,?,?,?)', [
            uuidv4(), appId, `Partner-${partnerId}`, `Generó ${amount} keys via Discord`, 'Discord Bot', Math.floor(Date.now()/1000)
          ]);
          
          const app = await db.get('SELECT name FROM apps WHERE id=?', [appId]);
          const embed = goldEmbed(`🔑 ${amount} Key(s) Generada(s) — ${app?app.name:'App'}`, 
            '```\n' + created.join('\n') + '\n```')
            .addFields(
              {name:'Duración',value:dias?dias+' días':'Permanente',inline:true},
              {name:'Restantes Hoy',value:`${perms.max_keys_per_day - (todayKeys.c + amount)}`,inline:true}
            );
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'usuarios' && perms.can_view_users) {
          const buscar = interaction.options.getString('buscar') || '';
          const query = buscar ? 
            'SELECT username,ip,createdate,banned,ban_reason FROM users WHERE app_id=? AND username LIKE ? ORDER BY createdate DESC LIMIT 10' :
            'SELECT username,ip,createdate,banned,ban_reason FROM users WHERE app_id=? ORDER BY createdate DESC LIMIT 10';
          const params = buscar ? [appId, `%${buscar}%`] : [appId];
          
          const users = await db.all(query, params);
          if (!users.length) return interaction.editReply({ content: '❌ No se encontraron usuarios' });
          
          const embed = goldEmbed(`👥 Usuarios${buscar ? ` (búsqueda: ${buscar})` : ''}`, '');
          users.forEach(u => {
            const status = u.banned ? '🚫 Baneado' : '✅ Activo';
            const fecha = new Date(u.createdate * 1000).toLocaleDateString();
            embed.addFields({
              name: u.username,
              value: `Estado: ${status} | IP: \`${u.ip}\` | Registro: ${fecha}${u.ban_reason ? ` | Razón: ${u.ban_reason}` : ''}`,
              inline: false
            });
          });
          
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'ban' && perms.can_ban_users) {
          const username = interaction.options.getString('usuario');
          const razon = interaction.options.getString('razon') || 'Baneado via Discord';
          
          const user = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [appId, username]);
          if (!user) return interaction.editReply({ content: '❌ Usuario no encontrado' });
          
          await db.run('UPDATE users SET banned=1, ban_reason=? WHERE id=?', [razon, user.id]);
          
          // Log
          await db.run('INSERT INTO logs (id,app_id,username,action,ip,created_at) VALUES (?,?,?,?,?,?)', [
            uuidv4(), appId, `Partner-${partnerId}`, `Baneó a ${username}: ${razon}`, 'Discord Bot', Math.floor(Date.now()/1000)
          ]);
          
          const embed = new EmbedBuilder().setColor(0xEF4444).setTitle('🚫 Usuario Baneado')
            .addFields({name:'Usuario',value:username,inline:true},{name:'Razón',value:razon,inline:false})
            .setTimestamp().setFooter({text:'LMAx27 Partner Bot'});
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'unban' && perms.can_ban_users) {
          const username = interaction.options.getString('usuario');
          
          const user = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [appId, username]);
          if (!user) return interaction.editReply({ content: '❌ Usuario no encontrado' });
          
          await db.run('UPDATE users SET banned=0, ban_reason="" WHERE id=?', [user.id]);
          
          // Log
          await db.run('INSERT INTO logs (id,app_id,username,action,ip,created_at) VALUES (?,?,?,?,?,?)', [
            uuidv4(), appId, `Partner-${partnerId}`, `Desbaneó a ${username}`, 'Discord Bot', Math.floor(Date.now()/1000)
          ]);
          
          const embed = goldEmbed('✅ Usuario Desbaneado', `**${username}** fue desbaneado correctamente`);
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'reset-hwid' && perms.can_reset_hwid) {
          const username = interaction.options.getString('usuario');
          
          const user = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [appId, username]);
          if (!user) return interaction.editReply({ content: '❌ Usuario no encontrado' });
          
          await db.run("UPDATE users SET hwid='' WHERE id=?", [user.id]);
          
          // Log
          await db.run('INSERT INTO logs (id,app_id,username,action,ip,created_at) VALUES (?,?,?,?,?,?)', [
            uuidv4(), appId, `Partner-${partnerId}`, `Reseteó HWID de ${username}`, 'Discord Bot', Math.floor(Date.now()/1000)
          ]);
          
          const embed = goldEmbed('🖥️ HWID Reseteado', `HWID de **${username}** reseteado correctamente`);
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'extender' && perms.can_extend_sub) {
          const username = interaction.options.getString('usuario');
          const dias = interaction.options.getInteger('dias');
          
          const user = await db.get('SELECT id FROM users WHERE app_id=? AND username=?', [appId, username]);
          if (!user) return interaction.editReply({ content: '❌ Usuario no encontrado' });
          
          const now = Math.floor(Date.now()/1000);
          const sub = await db.get('SELECT * FROM subscriptions WHERE user_id=? AND app_id=?', [user.id, appId]);
          
          if (sub) {
            const base = (sub.expiry && sub.expiry > now) ? sub.expiry : now;
            await db.run('UPDATE subscriptions SET expiry=? WHERE id=?', [base + (dias * 86400), sub.id]);
          } else {
            await db.run("INSERT INTO subscriptions (id,user_id,app_id,name,expiry) VALUES (?,?,?,'default',?)", [
              uuidv4(), user.id, appId, now + (dias * 86400)
            ]);
          }
          
          // Log
          await db.run('INSERT INTO logs (id,app_id,username,action,ip,created_at) VALUES (?,?,?,?,?,?)', [
            uuidv4(), appId, `Partner-${partnerId}`, `Extendió ${dias} días a ${username}`, 'Discord Bot', Math.floor(Date.now()/1000)
          ]);
          
          const embed = goldEmbed('⏳ Suscripción Extendida', `**${username}** recibió **${dias} días** adicionales`);
          return interaction.editReply({ embeds: [embed] });
        }
        
        if (cmd === 'logs' && perms.can_view_logs) {
          const limit = interaction.options.getInteger('ultimos') || 10;
          const logs = await db.all('SELECT username,action,ip,created_at FROM logs WHERE app_id=? ORDER BY created_at DESC LIMIT ?', [appId, limit]);
          
          if (!logs.length) return interaction.editReply({ content: '❌ No hay logs disponibles' });
          
          const embed = goldEmbed(`📋 Últimos ${logs.length} Logs`, '');
          logs.forEach(log => {
            const fecha = new Date(log.created_at * 1000).toLocaleString();
            embed.addFields({
              name: `${log.username} - ${fecha}`,
              value: `${log.action} (IP: ${log.ip})`,
              inline: false
            });
          });
          
          return interaction.editReply({ embeds: [embed] });
        }
        
        // Comandos sin permiso
        if (!perms[`can_${cmd.replace('-','_')}`]) {
          return interaction.editReply({ content: `❌ Sin permisos para usar /${cmd}` });
        }
      });

      resolve({ ok: true, tag: client.user.tag });
    });
    
    client.on('error', function(e) { console.log('[PartnerBot] Error:', e.message); });
    client.login(cleanToken).catch(function(e) {
      clearTimeout(timeout);
      resolve({ ok: false, error: e.message.includes('TOKEN_INVALID') ? 'Token invalido' : e.message });
    });
  });
}

// Auto-iniciar bots de partners al arrancar
setTimeout(async function() {
  try {
    const bots = await db.all('SELECT * FROM partner_discord_bots WHERE active=1 AND bot_token != ""');
    for (const bot of bots) {
      if (bot.bot_token) {
        const r = await startPartnerBot(bot.id, bot.bot_token, bot.guild_id, bot.app_id, bot.partner_id);
        console.log('[PartnerBot] Auto-init', bot.id, r.ok ? 'OK: '+r.tag : 'ERR: '+r.error);
      }
    }
  } catch(e) { console.log('[PartnerBot] Error auto-init:', e.message); }
}, 5000);

// GET /discord/partner-bots — ver bots del partner (o del admin: ver todos)
router.get('/partner-bots', requireAdmin, async function(req, res) {
  try {
    let bots;
    if (req.admin.role === 'partner') {
      bots = await db.all(
        'SELECT pb.*, a.name as app_name FROM partner_discord_bots pb JOIN apps a ON a.id=pb.app_id WHERE pb.partner_id=? ORDER BY pb.created_at DESC',
        [req.admin.id]
      );
    } else {
      bots = await db.all(
        'SELECT pb.*, a.name as app_name, p.username as partner_username FROM partner_discord_bots pb JOIN apps a ON a.id=pb.app_id JOIN partners p ON p.id=pb.partner_id ORDER BY pb.created_at DESC'
      );
    }
    // Enriquecer con estado online
    const result = bots.map(function(b) {
      return Object.assign({}, b, {
        bot_token: b.bot_token ? b.bot_token.substring(0,6)+'...'+b.bot_token.slice(-4) : '',
        online: !!(partnerBots[b.id] && partnerBots[b.id].ready)
      });
    });
    res.json({ success: true, bots: result });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// POST /discord/partner-bots — crear/conectar bot (partner solo puede crear 1 o su max_bots)
router.post('/partner-bots', requireAdmin, async function(req, res) {
  try {
    const { bot_token, app_id, guild_id, log_channel_id, chan_online_id, chan_users_id, chan_keys_id } = req.body;
    if (!bot_token || !app_id) return res.json({ success: false, message: 'Token y app_id requeridos' });

    let partnerId = req.admin.id;

    // Si es super admin, necesitamos crear/obtener un registro de partner para él
    if (req.admin.role === 'superadmin' || req.admin.role === 'admin') {
      // Verificar si ya existe como partner
      let adminAsPartner = await db.get('SELECT id FROM partners WHERE username=?', [req.admin.username]);
      if (!adminAsPartner) {
        // Crear registro de partner para el admin
        const bcrypt = require('bcryptjs');
        const adminPartnerId = uuidv4();
        const hashedPass = await bcrypt.hash('admin_partner', 10);
        await db.run('INSERT INTO partners (id, username, password, email, role, max_bots, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [adminPartnerId, req.admin.username + '_partner', hashedPass, 'admin@local.dev', 'admin_partner', 999, 1]);
        partnerId = adminPartnerId;
      } else {
        partnerId = adminAsPartner.id;
      }
    } else if (req.admin.role === 'partner') {
      // Verificar que tiene acceso a esa app
      const pa = await db.get('SELECT * FROM partner_apps WHERE partner_id=? AND app_id=?', [req.admin.id, app_id]);
      if (!pa) return res.status(403).json({ success: false, message: 'No tienes acceso a esa app' });
      // Verificar limite de bots
      const me = await db.get('SELECT max_bots FROM partners WHERE id=?', [req.admin.id]);
      const maxBots = (me && me.max_bots) || 1;
      const existing = await db.get('SELECT COUNT(*) as c FROM partner_discord_bots WHERE partner_id=?', [req.admin.id]);
      const count = (existing && existing.c) || 0;
      if (count >= maxBots) return res.json({ success: false, message: 'Limite de bots alcanzado (' + count + '/' + maxBots + '). El admin puede aumentar tu limite.' });
    }

    const id = uuidv4();
    const cleanToken = bot_token.replace(/[\s\n\r\t\u0000-\u001F\u007F-\u009F]/g, '');
    
    await db.run('INSERT INTO partner_discord_bots (id,partner_id,app_id,bot_token,guild_id,log_channel_id,chan_online_id,chan_users_id,chan_keys_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, partnerId, app_id, cleanToken, guild_id||'', log_channel_id||'', chan_online_id||'', chan_users_id||'', chan_keys_id||'']);

    const r = await startPartnerBot(id, cleanToken, guild_id, app_id, partnerId);
    if (r.ok) {
      await db.run('UPDATE partner_discord_bots SET bot_name=?,active=1 WHERE id=?', [r.tag, id]);
      return res.json({ success: true, message: 'Bot conectado: ' + r.tag, bot_id: id });
    } else {
      await db.run('DELETE FROM partner_discord_bots WHERE id=?', [id]);
      return res.json({ success: false, message: 'Error al conectar: ' + r.error });
    }
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// DELETE /discord/partner-bots/:id — desconectar y eliminar bot
router.delete('/partner-bots/:id', requireAdmin, async function(req, res) {
  try {
    const bot = req.admin.role === 'partner'
      ? await db.get('SELECT * FROM partner_discord_bots WHERE id=? AND partner_id=?', [req.params.id, req.admin.id])
      : await db.get('SELECT * FROM partner_discord_bots WHERE id=?', [req.params.id]);
    if (!bot) return res.json({ success: false, message: 'Bot no encontrado' });
    if (partnerBots[bot.id]) {
      try { partnerBots[bot.id].client.destroy(); } catch(_) {}
      delete partnerBots[bot.id];
    }
    await db.run('DELETE FROM partner_discord_bots WHERE id=?', [bot.id]);
    res.json({ success: true, message: 'Bot desconectado y eliminado' });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// POST /discord/partner-bots/:id/reconnect
router.post('/partner-bots/:id/reconnect', requireAdmin, async function(req, res) {
  try {
    const bot = req.admin.role === 'partner'
      ? await db.get('SELECT * FROM partner_discord_bots WHERE id=? AND partner_id=?', [req.params.id, req.admin.id])
      : await db.get('SELECT * FROM partner_discord_bots WHERE id=?', [req.params.id]);
    if (!bot) return res.json({ success: false, message: 'Bot no encontrado' });
    const r = await startPartnerBot(bot.id, bot.bot_token, bot.guild_id, bot.app_id, bot.partner_id);
    if (r.ok) {
      await db.run('UPDATE partner_discord_bots SET bot_name=?,active=1 WHERE id=?', [r.tag, bot.id]);
      return res.json({ success: true, message: 'Bot reconectado: ' + r.tag });
    }
    return res.json({ success: false, message: 'Error: ' + r.error });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// GET /discord/partner-bots/:id/invite — obtener link de invitación para bot de partner
router.get('/partner-bots/:id/invite', requireAdmin, async function(req, res) {
  try {
    const bot = req.admin.role === 'partner'
      ? await db.get('SELECT * FROM partner_discord_bots WHERE id=? AND partner_id=?', [req.params.id, req.admin.id])
      : await db.get('SELECT * FROM partner_discord_bots WHERE id=?', [req.params.id]);
    if (!bot) return res.json({ success: false, message: 'Bot no encontrado' });
    
    // Verificar si el bot está online y obtener su client_id
    if (partnerBots[bot.id] && partnerBots[bot.id].ready && partnerBots[bot.id].client) {
      const client = partnerBots[bot.id].client;
      const link = 'https://discord.com/api/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands';
      return res.json({ success: true, link });
    } else {
      return res.json({ success: false, message: 'Bot offline - reconéctalo primero' });
    }
  } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
module.exports.notifyDiscord = notifyDiscord;
