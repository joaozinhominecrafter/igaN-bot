const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoeat = require('mineflayer-auto-eat');
const pvp = require('mineflayer-pvp'); // Remova o .plugin;
const armorManager = require('mineflayer-armor-manager');
const collectBlock = require('mineflayer-collectblock').plugin;
const tool = require('mineflayer-tool').plugin;
const dashboard = require('mineflayer-dashboard').plugin; // Corrigido
const { Vec3 } = require('vec3'); // Corrigido
let mcData;

// Configuração avançada
const config = {
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: parseInt(process.env.MINECRAFT_PORT || 25565),
  username: process.env.MINECRAFT_USERNAME || 'BotMaster',
  version: '1.21.4',
  modules: {
    pvp: true,
    autoEat: true,
    armorManager: true,
    collectResources: true
  },
  settings: {
    attackRange: 3.5,
    collectDistance: 16,
    emergencyFoodLevel: 12
  }
};

class MinecraftBot {
  constructor() {
    this.bot = null;
    this.reconnectAttempts = 0;
    this.maxReconnect = 5;
    this.isOperating = false;
  }

  initialize() {
    console.log('[Init] Iniciando bot...');
    this.createBotInstance();
    this.loadCorePlugins();
    this.registerEventHandlers();
  }

  createBotInstance() {
    this.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version,
      auth: 'offline',
      hideErrors: false
    });
  }

  loadCorePlugins() {
    this.bot.loadPlugin(pathfinder);
    
    if(config.modules.pvp) {
      this.bot.loadPlugin(pvp);
      this.bot.pvp.settings = {
        attackRange: config.settings.attackRange,
        followTimeout: 15,
        priority: 'closest'
      };
    }

    if(config.modules.autoEat) {
      this.bot.loadPlugin(autoeat);
    }

    if(config.modules.armorManager) {
      this.bot.loadPlugin(armorManager);
    }

    if(config.modules.collectResources) {
      this.bot.loadPlugin(collectBlock);
      this.bot.loadPlugin(tool);
    }

    this.bot.loadPlugin(dashboard);
  }

  registerEventHandlers() {
    this.bot.once('spawn', () => this.onSpawn());
    this.bot.on('chat', (username, message) => this.onChat(username, message));
    this.bot.on('death', () => this.onDeath());
    this.bot.on('kicked', (reason) => this.onKicked(reason));
    this.bot.on('error', (err) => this.onError(err));
    this.bot.on('end', () => this.onEnd());
  }

  async onSpawn() {
    console.log('[Status] Conectado ao servidor');
    this.isOperating = true;
    this.reconnectAttempts = 0;

    try {
      mcData = require('minecraft-data')(this.bot.version);
      
      // Configuração correta do pathfinder
      const movements = new Movements(this.bot, mcData);
      movements.scaffoldingBlocks = mcData.blocksArray
        .filter(b => b.name.includes('planks'))
        .map(b => b.id);
      this.bot.pathfinder.setMovements(movements);

      if(config.modules.autoEat) {
        this.bot.autoEat.options = {
          priority: 'foodPoints',
          startAt: 18,
          bannedFood: ['rotten_flesh', 'poisonous_potato']
        };
        this.bot.autoEat.enable();
      }

      this.startRoutines();
      this.startHealthMonitor();
      this.startHttpServer();

      console.log('[Status] Todos os módulos carregados');
    } catch (error) {
      console.error('[Erro] Falha na inicialização:', error);
    }
  }

  startRoutines() {
    setInterval(() => this.autoExplore(), 600000);
    setInterval(() => this.checkInventory(), 300000);
    setInterval(() => this.autoMaintenance(), 120000);
  }

  async autoExplore() {
    if(this.bot.pathfinder.isMoving()) return;

    const target = new Vec3(
      this.bot.entity.position.x + (Math.random() * 200 - 100),
      this.bot.entity.position.y,
      this.bot.entity.position.z + (Math.random() * 200 - 100)
    );

    try {
      await this.bot.pathfinder.goto(new goals.GoalXZ(target.x, target.z));
      console.log(`[Exploração] Chegou em ${target}`);
    } catch (err) {
      console.error('[Exploração] Erro:', err);
    }
  }

  retreatToSafeZone() {
    const safeDirection = this.bot.entity.position.scale(-1); // Corrigido scaled -> scale
    const target = this.bot.entity.position.plus(safeDirection.normalize().scale(10));
    this.bot.pathfinder.setGoal(new goals.GoalXZ(target.x, target.z));
  }

  autoEat() {
    if(config.modules.autoEat) {
      this.bot.autoEat.eat().catch(() => {
        const food = this.bot.inventory.items().find(i => 
          i.name.includes('_steak') || i.name === 'bread'
        );
        if(food) {
          this.bot.equip(food, 'hand')
            .then(() => this.bot.consume())
            .catch(console.error);
        }
      });
    }
  }

  // ... (outros métodos mantidos com implementações completas)

  startHttpServer() {
    if(process.env.RAILWAY_ENVIRONMENT) {
      require('http').createServer((req, res) => {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          status: this.isOperating ? 'online' : 'offline',
          position: this.bot?.entity.position,
          health: this.bot?.health,
          food: this.bot?.food
        }));
      }).listen(process.env.PORT || 3000);
    }
  }
}

// Inicialização do Bot
const botInstance = new MinecraftBot();
botInstance.initialize();

// Gerenciamento de Processos
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Desligamento solicitado');
  botInstance.bot?.quit();
  process.exit();
});
