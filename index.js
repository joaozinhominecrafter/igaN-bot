require('dotenv').config();
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const goals = require('mineflayer-pathfinder').goals;
const autoeat = require('mineflayer-auto-eat');
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const dashboard = require('mineflayer-dashboard').plugin;
const vec3 = require('vec3').Vec3;
const mcData = require('minecraft-data')('1.21.4');

// Configuração inicial do bot
const bot = mineflayer.createBot({
  host: process.env.MINECRAFT_HOST,
  port: parseInt(process.env.MINECRAFT_PORT),
  username: process.env.MINECRAFT_USERNAME || 'Bot',
  version: '1.21.4',
  auth: 'offline'
});

// Carregar plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(autoeat);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);
bot.loadPlugin(collectBlock);
bot.loadPlugin(tool);
bot.loadPlugin(dashboard);

// Healthcheck para Railway
if (process.env.RAILWAY_ENVIRONMENT) {
  const http = require('http');
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot online!');
  }).listen(process.env.PORT || 3000);
}

// Configuração do pathfinder
bot.once('spawn', () => {
  console.log('[Status] Bot spawnou no mundo!');
  
  const movements = new Movements(bot, mcData);
  movements.allowSprinting = true;
  movements.scaffoldingBlocks = mcData.blocksArray.filter(b => b.name.includes('planks')).map(b => b.id);
  bot.pathfinder.setMovements(movements);

  // Configuração do auto-eat
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 16,
    bannedFood: []
  };

  // Equipar armadura automaticamente
  bot.armorManager.equipAll().catch(console.error);
});

// Sistema de reconexão
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

bot.on('end', () => {
  if (reconnectAttempts < MAX_RECONNECT) {
    console.log(`[Conexão] Tentando reconectar (${++reconnectAttempts}/${MAX_RECONNECT})`);
    setTimeout(() => bot.initialize(), 5000);
  } else {
    console.log('[Conexão] Máximo de tentativas atingido');
  }
});

// Comandos via chat
bot.on('chat', (username, message) => {
  if (username === bot.username) return;

  const args = message.split(' ');
  const command = args[0].toLowerCase();

  switch(command) {
    case 'vem':
      const player = bot.players[username]?.entity;
      if (player) {
        bot.pathfinder.setGoal(new goals.GoalFollow(player, 1));
        bot.chat(`Indo até você, ${username}!`);
      }
      break;

    case 'pula':
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
      break;

    case 'madeira':
      const logBlock = bot.findBlock({
        matching: block => block.name.endsWith('_log'),
        maxDistance: 32
      });
      
      if (logBlock) {
        bot.collectBlock.collect(logBlock, err => {
          if (err) bot.chat('Não consegui pegar madeira 😕');
          else bot.chat('Madeira coletada! 🌳');
        });
      }
      break;

    case 'status':
      const pos = bot.entity.position.floored();
      bot.chat(`Vida: ${bot.health.toFixed(1)} | Comida: ${bot.food} | Posição: X${pos.x} Y${pos.y} Z${pos.z}`);
      break;
  }
});

// Sistema de combate automático
bot.on('entitySpawn', entity => {
  if (entity.type === 'mob' && 
      ['zombie', 'skeleton', 'spider'].includes(entity.mobType) &&
      entity.position.distanceTo(bot.entity.position) < 16) {
    bot.pvp.attack(entity);
  }
});

// Tratamento de erros
bot.on('error', err => {
  console.error('[Erro]', err);
  bot.quit();
});

// Dashboard de controle
bot.dashboard.command('info', () => ({
  status: 'online',
  position: bot.entity.position,
  health: bot.health,
  food: bot.food
}));

console.log('[Init] Bot inicializado com sucesso!');
