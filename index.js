const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const autoeat = require('mineflayer-auto-eat')
const pvp = require('mineflayer-pvp').plugin
const armorManager = require('mineflayer-armor-manager')
const collectBlock = require('mineflayer-collectblock').plugin
const tool = require('mineflayer-tool').plugin
const dashboard = require('mineflayer-dashboard').plugin
const vec3 = require('vec3')
const mcData = require('minecraft-data')('1.21.4')

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
    collectResources: true,
    crafting: true,
    farming: true
  },
  settings: {
    attackRange: 3.5,
    collectDistance: 16,
    emergencyFoodLevel: 12
  }
}

class MinecraftBot {
  constructor() {
    this.bot = null
    this.reconnectAttempts = 0
    this.maxReconnect = 5
    this.isOperating = false
  }

  initialize() {
    console.log('[Init] Iniciando bot...')
    this.createBotInstance()
    this.loadCorePlugins()
    this.registerEventHandlers()
    this.startHealthMonitor()
    this.startHttpServer()
  }

  createBotInstance() {
    this.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version,
      auth: 'offline',
      hideErrors: false
    })
  }

  loadCorePlugins() {
    // Sistema de navegação
    this.bot.loadPlugin(pathfinder)
    const movements = new Movements(this.bot, mcData)
    movements.scaffoldingBlocks = mcData.blocksArray.filter(b => b.name.includes('planks')).map(b => b.id)
    this.bot.pathfinder.setMovements(movements)

    // Módulos opcionais
    if(config.modules.pvp) {
      this.bot.loadPlugin(pvp)
      this.bot.pvp.settings = {
        attackRange: config.settings.attackRange,
        followTimeout: 15,
        priority: 'closest'
      }
    }

    if(config.modules.autoEat) {
      this.bot.loadPlugin(autoeat)
      this.bot.autoEat.options = {
        priority: 'foodPoints',
        startAt: 18,
        bannedFood: ['rotten_flesh', 'poisonous_potato']
      }
    }

    if(config.modules.armorManager) {
      this.bot.loadPlugin(armorManager)
    }

    if(config.modules.collectResources) {
      this.bot.loadPlugin(collectBlock)
      this.bot.loadPlugin(tool)
    }

    // Dashboard de controle
    this.bot.loadPlugin(dashboard)
  }

  registerEventHandlers() {
    this.bot.once('spawn', () => this.onSpawn())
    this.bot.on('chat', (username, message) => this.onChat(username, message))
    this.bot.on('death', () => this.onDeath())
    this.bot.on('kicked', (reason) => this.onKicked(reason))
    this.bot.on('error', (err) => this.onError(err))
    this.bot.on('end', () => this.onEnd())
  }

  async onSpawn() {
    console.log('[Status] Conectado ao servidor')
    this.isOperating = true
    this.reconnectAttempts = 0

    try {
      await this.initializeModules()
      this.startRoutines()
      console.log('[Status] Todos os módulos carregados')
    } catch (error) {
      console.error('[Erro] Falha na inicialização:', error)
    }
  }

  async initializeModules() {
    // Inicialização assíncrona de módulos
    const initTasks = []
    
    if(config.modules.armorManager) {
      initTasks.push(this.bot.armorManager.equipAll())
    }

    await Promise.all(initTasks)
  }

  startRoutines() {
    // Rotinas automáticas
    setInterval(() => this.autoExplore(), 600000)
    setInterval(() => this.checkInventory(), 300000)
    setInterval(() => this.autoMaintenance(), 120000)
  }

  // Módulo de Exploração Automática
  async autoExplore() {
    if(this.bot.pathfinder.isMoving()) return

    const target = vec3(
      this.bot.entity.position.x + (Math.random() * 200 - 100),
      this.bot.entity.position.y,
      this.bot.entity.position.z + (Math.random() * 200 - 100)
    )

    try {
      await this.bot.pathfinder.goto(new goals.GoalXZ(target.x, target.z))
      console.log(`[Exploração] Chegou em ${target}`)
    } catch (err) {
      console.error('[Exploração] Erro:', err)
    }
  }

  // Módulo de Gerenciamento de Inventário
  async checkInventory() {
    const items = {
      madeira: mcData.blocksArray.filter(b => b.name.endsWith('_log')).map(b => b.id),
      minérios: ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore']
    }

    const inventoryManager = {
      sortInventory: () => {/* ... */},
      discardJunk: () => {/* ... */},
      organizeChests: () => {/* ... */}
    }

    await inventoryManager.sortInventory()
  }

  // Módulo de Manutenção Automática
  async autoMaintenance() {
    if(this.bot.health < 8) this.retreatToSafeZone()
    if(this.bot.food < 15) this.autoEat()
    this.bot.armorManager.equipAll().catch(console.error)
  }

  // Sistema de Combate Avançado
  async handleCombat(target) {
    const combatStrategies = {
      melee: async () => {
        await this.bot.pvp.attack(target)
      },
      ranged: async () => {
        const bow = this.bot.inventory.items().find(i => i.name.includes('bow'))
        if(bow) {
          await this.bot.equip(bow, 'hand')
          await this.bot.lookAt(target.position)
          await this.bot.activateItem()
        }
      }
    }

    const distance = this.bot.entity.position.distanceTo(target.position)
    const strategy = distance > 5 ? 'ranged' : 'melee'
    
    await combatStrategies[strategy]()
  }

  // Sistema de Crafting Automático
  async autoCraft(item, quantity) {
    const recipes = mcData.recipes[item]
    if(!recipes) throw new Error('Receita não encontrada')

    const craftingTable = this.bot.findBlock({
      matching: mcData.blocksByName.crafting_table.id,
      maxDistance: 32
    })

    if(craftingTable) {
      await this.bot.pathfinder.goto(new goals.GoalGetToBlock(
        craftingTable.position.x,
        craftingTable.position.y,
        craftingTable.position.z
      ))
    }

    // Lógica complexa de crafting aqui
  }

  // Interface de Chat
  onChat(username, message) {
    if(username === this.bot.username) return

    const commandInterface = {
      '!vem': () => this.summonToPlayer(username),
      '!minerar': () => this.startMiningOperation(),
      '!craft': (args) => this.autoCraft(args[0], parseInt(args[1])),
      '!construir': () => this.startBuildingTask(),
      '!defender': () => this.activateDefenseMode()
    }

    const [command, ...args] = message.split(' ')
    if(commandInterface[command]) {
      commandInterface[command](args)
    }
  }

  // Sistema de Reconexão Inteligente
  scheduleReconnect() {
    if(this.reconnectAttempts >= this.maxReconnect) {
      console.error('[Conexão] Máximo de tentativas atingido')
      return
    }

    const delay = Math.min(30000, this.reconnectAttempts * 2000)
    this.reconnectAttempts++

    setTimeout(() => {
      console.log(`[Conexão] Tentativa ${this.reconnectAttempts}`)
      this.initialize()
    }, delay)
  }

  // Monitoramento de Saúde
  startHealthMonitor() {
    setInterval(() => {
      if(this.bot.health < 6) this.emergencyProtocol()
      if(this.bot.food < 10) this.autoEat()
    }, 5000)
  }

  emergencyProtocol() {
    this.bot.chat('Ativando protocolo de emergência!')
    this.retreatToSafeZone()
    this.autoEat()
    this.bot.armorManager.equipAll()
  }

  // Servidor Web para Monitoramento
  startHttpServer() {
    if(process.env.RAILWAY_ENVIRONMENT) {
      require('http').createServer((req, res) => {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({
          status: this.isOperating ? 'online' : 'offline',
          position: this.bot?.entity.position,
          health: this.bot?.health,
          food: this.bot?.food
        }))
      }).listen(process.env.PORT || 3000)
    }
  }

  // Handlers de Eventos
  onDeath() {
    console.log('[Status] Bot morreu')
    this.isOperating = false
    this.scheduleReconnect()
  }

  onKicked(reason) {
    console.log(`[Conexão] Kickado: ${reason}`)
    this.scheduleReconnect()
  }

  onError(err) {
    console.error('[Erro]', err)
    this.scheduleReconnect()
  }

  onEnd() {
    if(this.isOperating) {
      console.log('[Conexão] Desconectado')
      this.scheduleReconnect()
    }
  }
}

// Inicialização do Bot
const botInstance = new MinecraftBot()
botInstance.initialize()

// Gerenciamento de Processos
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Desligamento solicitado')
  botInstance.bot?.quit()
  process.exit()
})