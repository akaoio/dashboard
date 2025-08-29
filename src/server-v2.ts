#!/usr/bin/env node

/**
 * Dashboard Server v2 - With Pluggable Memory Adapters
 * Uses Composer as primary adapter, Air as optional P2P adapter
 */

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

// Memory Adapters
import { AdapterRegistry } from './adapters/MemoryAdapter.js'
import { ComposerAdapter } from './adapters/ComposerAdapter.js'
import { LocalAdapter } from './adapters/LocalAdapter.js'
import { AirAdapter } from './adapters/AirAdapter.js'

// Services
import { WorkroomsService } from './services/WorkroomsService.js'
import { WorkroomUser } from './types/workrooms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface DashboardConfig {
    port: number
    dataDir: string
    lockFile: string
    adapters: {
        primary: 'composer' | 'local' | 'air'
        enableAir: boolean
        enableComposer: boolean
        enableLocal: boolean
    }
}

class DashboardServerV2 {
    private config: DashboardConfig
    private server: any
    private wss: any
    private workrooms: WorkroomsService | null = null
    private data: any = {
        agents: {},
        system: {},
        metrics: {},
        logs: [],
        integrity: {},
        version: null,
        workrooms: {}
    }
    
    constructor() {
        this.config = this.loadConfig()
        this.setupXDGPaths()
    }
    
    private loadConfig(): DashboardConfig {
        return {
            port: parseInt(process.env.DASHBOARD_PORT || '8767'),
            dataDir: this.getXDGDataPath(),
            lockFile: path.join(this.getXDGRuntimePath(), 'dashboard.lock'),
            adapters: {
                primary: (process.env.DASHBOARD_ADAPTER || 'composer') as any,
                enableComposer: process.env.ENABLE_COMPOSER !== 'false',
                enableLocal: process.env.ENABLE_LOCAL !== 'false',
                enableAir: process.env.ENABLE_AIR === 'true' // Air is opt-in
            }
        }
    }
    
    private setupXDGPaths(): void {
        const dirs = [this.config.dataDir, path.dirname(this.config.lockFile)]
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }
        })
    }
    
    private getXDGDataPath(): string {
        return process.env.XDG_DATA_HOME || 
               path.join(os.homedir(), '.local', 'share', 'dashboard')
    }
    
    private getXDGRuntimePath(): string {
        return process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`
    }
    
    async start(): Promise<void> {
        console.log('🚀 Dashboard Server v2 Starting...')
        console.log(`   Port: ${this.config.port}`)
        console.log(`   Data: ${this.config.dataDir}`)
        
        // Check singleton
        if (!this.checkSingleton()) {
            console.error('❌ Another Dashboard instance is already running')
            process.exit(1)
        }
        
        this.writeLockFile()
        
        // Initialize memory adapters
        await this.initializeAdapters()
        
        // Start HTTP/WebSocket server
        await this.startServer()
        
        // Initialize services
        await this.initializeServices()
        
        // Setup shutdown handlers
        this.setupShutdownHandlers()
        
        console.log('✅ Dashboard Server v2 Ready')
        console.log(`   Primary adapter: ${this.config.adapters.primary}`)
        console.log(`   Available adapters: ${AdapterRegistry.list().join(', ')}`)
    }
    
    private async initializeAdapters(): Promise<void> {
        console.log('🔌 Initializing memory adapters...')
        
        // Always register local adapter as fallback
        if (this.config.adapters.enableLocal) {
            const localAdapter = new LocalAdapter({
                dataFile: path.join(this.config.dataDir, 'dashboard.json')
            })
            AdapterRegistry.register(localAdapter)
        }
        
        // Register Composer adapter if enabled
        if (this.config.adapters.enableComposer) {
            try {
                const composerAdapter = new ComposerAdapter({
                    dataDir: path.join(this.config.dataDir, 'composer'),
                    atomsDir: path.join(this.config.dataDir, 'composer', 'atoms'),
                    templatesDir: path.join(this.config.dataDir, 'composer', 'templates'),
                    outputDir: path.join(this.config.dataDir, 'composer', 'output')
                })
                AdapterRegistry.register(composerAdapter)
                console.log('✅ Composer adapter registered')
            } catch (error) {
                console.warn('⚠️ Composer adapter failed:', error)
            }
        }
        
        // Register Air adapter if enabled (optional)
        if (this.config.adapters.enableAir) {
            try {
                const airAdapter = new AirAdapter({
                    peers: (process.env.AIR_PEERS || 'http://localhost:8765/gun').split(','),
                    namespace: 'dashboard'
                })
                AdapterRegistry.register(airAdapter)
                console.log('✅ Air P2P adapter registered')
            } catch (error) {
                console.warn('⚠️ Air adapter not available:', error)
            }
        }
        
        // Set primary adapter
        AdapterRegistry.setPrimary(this.config.adapters.primary)
        
        // Connect all adapters
        await AdapterRegistry.connectAll()
        
        // Load initial data from primary adapter
        await this.loadDataFromAdapters()
    }
    
    private async loadDataFromAdapters(): Promise<void> {
        const primary = AdapterRegistry.getPrimary()
        if (!primary) return
        
        // Load core data
        this.data.agents = (await primary.get('agents')) || {}
        this.data.system = (await primary.get('system')) || {}
        this.data.metrics = (await primary.get('metrics')) || {}
        this.data.logs = (await primary.get('logs')) || []
        this.data.integrity = (await primary.get('integrity')) || {}
        
        // Subscribe to changes
        primary.subscribe('agents', (data) => {
            this.data.agents = data || {}
            this.broadcast({ type: 'agents-update', data: this.data.agents })
        })
        
        primary.subscribe('system', (data) => {
            this.data.system = data || {}
            this.broadcast({ type: 'system-update', data: this.data.system })
        })
        
        primary.subscribe('metrics', (data) => {
            this.data.metrics = data || {}
            this.broadcast({ type: 'metrics-update', data: this.data.metrics })
        })
    }
    
    private async initializeServices(): Promise<void> {
        console.log('🏠 Initializing Workrooms...')
        
        // Create a mock Air client that uses our adapter system
        const createGunNode = (currentPath: string = ''): any => {
            const node = {
                get: (subpath: string) => createGunNode(currentPath ? `${currentPath}/${subpath}` : subpath),
                put: async (value: any) => {
                    const adapter = AdapterRegistry.getPrimary()
                    if (adapter && currentPath) {
                        await adapter.set(currentPath, value)
                    }
                },
                on: (callback: (data: any) => void) => {
                    const adapter = AdapterRegistry.getPrimary()
                    if (adapter && currentPath) {
                        return adapter.subscribe(currentPath, callback)
                    }
                },
                once: async (callback: (data: any) => void) => {
                    const adapter = AdapterRegistry.getPrimary()
                    if (adapter && currentPath) {
                        const value = await adapter.get(currentPath)
                        if (callback) callback(value)
                    }
                },
                map: () => ({
                    on: (callback: (data: any, key: string) => void) => {
                        const adapter = AdapterRegistry.getPrimary()
                        if (adapter && currentPath) {
                            adapter.list(currentPath).then(keys => {
                                keys.forEach(async key => {
                                    const value = await adapter.get(key)
                                    callback(value, key.split('/').pop() || key)
                                })
                            })
                        }
                    }
                })
            }
            return node
        }
        
        const mockAirClient = {
            gun: {
                get: (path: string) => createGunNode(path)
            }
        }
        
        // Create dashboard user
        const dashboardUser: WorkroomUser = {
            id: 'dashboard-server',
            name: 'Dashboard Server',
            type: 'agent',
            online: true,
            lastSeen: Date.now(),
            status: 'active',
            role: 'system',
            capabilities: ['room-management', 'system-monitoring']
        }
        
        // Initialize Workrooms with mock Air client
        this.workrooms = new WorkroomsService(mockAirClient as any, dashboardUser)
        
        // Subscribe to workroom events
        this.workrooms.onEvent((event) => {
            this.broadcast({
                type: `workroom-${event.type}`,
                data: event
            })
            this.updateWorkroomsData()
        })
        
        console.log('✅ Workrooms initialized with adapter system')
    }
    
    private updateWorkroomsData(): void {
        if (!this.workrooms) return
        
        this.data.workrooms = {
            rooms: this.workrooms.getUserRooms(),
            onlineUsers: this.workrooms.getOnlineUsers()
        }
        
        // Save to primary adapter
        const adapter = AdapterRegistry.getPrimary()
        if (adapter) {
            adapter.set('workrooms', this.data.workrooms).catch(console.error)
        }
    }
    
    private checkSingleton(): boolean {
        try {
            if (fs.existsSync(this.config.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.config.lockFile, 'utf8'))
                try {
                    process.kill(lockData.pid, 0)
                    return false // Process exists
                } catch {
                    fs.unlinkSync(this.config.lockFile)
                }
            }
            return true
        } catch {
            return true
        }
    }
    
    private writeLockFile(): void {
        const lockData = {
            pid: process.pid,
            started: new Date().toISOString(),
            version: '2.0.0'
        }
        fs.writeFileSync(this.config.lockFile, JSON.stringify(lockData, null, 2))
    }
    
    private async startServer(): Promise<void> {
        return new Promise((resolve) => {
            this.server = createServer((req, res) => {
                this.handleHttpRequest(req, res)
            })
            
            this.wss = new WebSocketServer({ server: this.server })
            this.setupWebSocket()
            
            this.server.listen(this.config.port, () => {
                console.log(`📊 Dashboard server running on port ${this.config.port}`)
                console.log(`   HTTP API: http://localhost:${this.config.port}`)
                console.log(`   WebSocket: ws://localhost:${this.config.port}`)
                resolve()
            })
        })
    }
    
    private handleHttpRequest(req: any, res: any): void {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        
        const url = new URL(req.url, `http://localhost:${this.config.port}`)
        
        // Route handlers
        const routes: Record<string, () => any> = {
            '/status': () => ({
                status: 'running',
                adapters: AdapterRegistry.list(),
                primaryAdapter: this.config.adapters.primary,
                agents: Object.keys(this.data.agents).length,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: '2.0.0',
                timestamp: Date.now()
            }),
            '/agents': () => this.data.agents,
            '/metrics': () => this.data.metrics,
            '/system': () => this.data.system,
            '/integrity': () => this.data.integrity,
            '/logs': () => this.data.logs.slice(-100),
            '/workrooms': () => this.data.workrooms.rooms || [],
            '/workrooms/online': () => this.data.workrooms.onlineUsers || [],
            '/health': async () => {
                const adaptersHealth = await AdapterRegistry.healthCheck()
                return {
                    healthy: true,
                    adapters: adaptersHealth,
                    services: {
                        dashboard: 'running',
                        workrooms: this.workrooms ? 'active' : 'inactive'
                    }
                }
            }
        }
        
        const handler = routes[url.pathname]
        if (handler) {
            Promise.resolve(handler()).then(result => {
                res.end(JSON.stringify(result, null, 2))
            }).catch(error => {
                res.statusCode = 500
                res.end(JSON.stringify({ error: error.message }))
            })
        } else {
            res.statusCode = 404
            res.end(JSON.stringify({
                error: 'Not found',
                available: Object.keys(routes)
            }, null, 2))
        }
    }
    
    private setupWebSocket(): void {
        this.wss.on('connection', (ws: any) => {
            console.log('🔌 Client connected via WebSocket')
            
            // Send initial state
            ws.send(JSON.stringify({
                type: 'initial-state',
                data: this.data
            }))
            
            ws.on('message', (message: string) => {
                try {
                    const cmd = JSON.parse(message)
                    this.handleCommand(cmd, ws)
                } catch (error: any) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }))
                }
            })
            
            ws.on('close', () => {
                console.log('🔌 Client disconnected')
            })
        })
    }
    
    private handleCommand(cmd: any, ws: any): void {
        switch (cmd.type) {
            case 'refresh':
                ws.send(JSON.stringify({
                    type: 'state-update',
                    data: this.data
                }))
                break
                
            case 'workroom-command':
                if (this.workrooms) {
                    this.workrooms.handleCommand(cmd.command).then(result => {
                        ws.send(JSON.stringify({
                            type: 'workroom-result',
                            result
                        }))
                    }).catch(error => {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: error.message
                        }))
                    })
                }
                break
        }
    }
    
    private broadcast(message: any): void {
        const msg = JSON.stringify(message)
        this.wss.clients.forEach((client: any) => {
            if (client.readyState === 1) {
                client.send(msg)
            }
        })
    }
    
    private setupShutdownHandlers(): void {
        const shutdown = async () => {
            console.log('\n🛑 Dashboard shutting down...')
            
            // Disconnect all adapters
            const adapters = AdapterRegistry.list()
            for (const name of adapters) {
                const adapter = AdapterRegistry.get(name)
                if (adapter) {
                    await adapter.disconnect()
                }
            }
            
            // Close server
            if (this.wss) this.wss.close()
            if (this.server) this.server.close()
            
            // Remove lock file
            try {
                fs.unlinkSync(this.config.lockFile)
            } catch {}
            
            process.exit(0)
        }
        
        process.on('SIGTERM', shutdown)
        process.on('SIGINT', shutdown)
    }
}

// Start server
const dashboard = new DashboardServerV2()
dashboard.start().catch(error => {
    console.error('Failed to start Dashboard:', error)
    process.exit(1)
})