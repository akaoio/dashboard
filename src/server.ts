#!/usr/bin/env node

/**
 * Dashboard Server 3.0 - TypeScript Source
 * Persistent service with auto-update capability
 */

import { createServer } from 'http'
import { Peer } from '@akaoio/air'
import { WebSocketServer } from 'ws'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { WorkroomsService } from './services/WorkroomsService.js'
import { WorkroomUser, WorkroomCommand } from './types/workrooms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface DashboardConfig {
    port: number
    airPeers: string[]
    updateInterval: number
    healthCheckInterval: number
    dataDir: string
    lockFile: string
}

class DashboardService {
    private config: DashboardConfig
    private airClient: Peer | null = null
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
    private updateTimer: NodeJS.Timer | null = null
    private healthTimer: NodeJS.Timer | null = null
    
    constructor() {
        this.config = this.loadConfig()
        this.setupXDGPaths()
    }
    
    private loadConfig(): DashboardConfig {
        // Load from environment and defaults
        return {
            port: parseInt(process.env.DASHBOARD_PORT || '8767'),
            airPeers: (process.env.AIR_PEERS || 'http://localhost:8765/gun').split(','),
            updateInterval: parseInt(process.env.UPDATE_INTERVAL || '3600000'), // 1 hour
            healthCheckInterval: parseInt(process.env.HEALTH_INTERVAL || '30000'), // 30 seconds
            dataDir: this.getXDGDataPath(),
            lockFile: path.join(this.getXDGRuntimePath(), 'dashboard.lock')
        }
    }
    
    private setupXDGPaths(): void {
        // XDG Base Directory compliance
        const dirs = [
            this.config.dataDir,
            path.dirname(this.config.lockFile)
        ]
        
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
        return process.env.XDG_RUNTIME_DIR || 
               `/run/user/${process.getuid()}`
    }
    
    async start(): Promise<void> {
        console.log('🚀 Dashboard Service Starting...')
        console.log(`   Version: ${await this.getVersion()}`)
        console.log(`   Port: ${this.config.port}`)
        console.log(`   Data: ${this.config.dataDir}`)
        
        // Check singleton
        if (!this.checkSingleton()) {
            console.error('❌ Another Dashboard instance is already running')
            process.exit(1)
        }
        
        // Write PID to lock file
        this.writeLockFile()
        
        // Start HTTP/WebSocket server
        await this.startServer()
        
        // Connect to Air
        await this.connectToAir()
        
        // Start auto-update timer
        this.startAutoUpdate()
        
        // Start health monitoring
        this.startHealthMonitoring()
        
        // Handle shutdown gracefully
        this.setupShutdownHandlers()
        
        console.log('✅ Dashboard Service Ready')
    }
    
    private checkSingleton(): boolean {
        try {
            if (fs.existsSync(this.config.lockFile)) {
                const pid = parseInt(fs.readFileSync(this.config.lockFile, 'utf8'))
                try {
                    // Check if process exists
                    process.kill(pid, 0)
                    return false // Process exists
                } catch {
                    // Stale lock file
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
            version: this.data.version
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
                resolve()
            })
        })
    }
    
    private async connectToAir(): Promise<void> {
        try {
            console.log('📡 Connecting to Air...')
            this.airClient = new Peer()
            await this.airClient.connect({
                peers: this.config.airPeers
            })
            console.log('✅ Connected to Air')
            
            // Subscribe to data streams
            this.subscribeToAir()
            
            // Initialize Workrooms after Air connection
            await this.initializeWorkrooms()
            
        } catch (error: any) {
            console.warn('⚠️ Could not connect to Air:', error.message)
            console.log('   Running in standalone mode')
            this.data.system = { 
                status: 'standalone',
                airConnection: 'disconnected' 
            }
            
            // Retry connection after delay
            setTimeout(() => this.connectToAir(), 30000)
        }
    }
    
    private subscribeToAir(): void {
        if (!this.airClient) return
        
        // Subscribe to agents
        this.airClient.gun.get('agents').map().on((agent: any, id: string) => {
            this.data.agents[id] = {
                ...agent,
                lastUpdate: Date.now()
            }
            this.broadcast({ type: 'agent-update', id, agent })
        })
        
        // Subscribe to system
        this.airClient.gun.get('system').on((system: any) => {
            this.data.system = { ...this.data.system, ...system }
            this.broadcast({ type: 'system-update', system })
        })
        
        // Subscribe to metrics
        this.airClient.gun.get('metrics').on((metrics: any) => {
            this.data.metrics = metrics
            this.broadcast({ type: 'metrics-update', metrics })
        })
        
        // Subscribe to integrity
        this.airClient.gun.get('integrity').map().on((score: number, id: string) => {
            this.data.integrity[id] = score
            this.broadcast({ type: 'integrity-update', id, score })
        })
        
        // Subscribe to broadcasts
        this.airClient.gun.get('broadcast').on((msg: any) => {
            if (msg && msg.message) {
                this.addLog(msg)
                this.broadcast({ type: 'log', message: msg })
            }
        })
    }
    
    private addLog(msg: any): void {
        this.data.logs.push({
            timestamp: Date.now(),
            ...msg
        })
        
        // Keep only last 1000 logs
        if (this.data.logs.length > 1000) {
            this.data.logs = this.data.logs.slice(-1000)
        }
        
        // Persist logs to disk
        this.saveLogs()
    }
    
    private saveLogs(): void {
        const logFile = path.join(this.config.dataDir, 'logs.json')
        fs.writeFileSync(logFile, JSON.stringify(this.data.logs, null, 2))
    }
    
    private startAutoUpdate(): void {
        // Check for updates periodically
        this.updateTimer = setInterval(async () => {
            await this.checkForUpdates()
        }, this.config.updateInterval)
        
        // Also check on start
        setTimeout(() => this.checkForUpdates(), 5000)
    }
    
    private async checkForUpdates(): Promise<void> {
        try {
            console.log('🔄 Checking for updates...')
            
            const projectDir = path.resolve(__dirname, '..')
            
            // Fetch latest changes
            execSync('git fetch', { cwd: projectDir })
            
            // Check if update needed
            const status = execSync('git status -uno', { 
                cwd: projectDir,
                encoding: 'utf8'
            })
            
            if (status.includes('Your branch is behind')) {
                console.log('📦 Update available, applying...')
                
                // Pull latest changes
                execSync('git pull --rebase', { cwd: projectDir })
                
                // Install dependencies
                execSync('npm install --production', { cwd: projectDir })
                
                // Build
                execSync('npm run build', { cwd: projectDir })
                
                console.log('✅ Update complete, restarting...')
                
                // Systemd will restart us
                process.exit(0)
            } else {
                console.log('✅ Dashboard is up to date')
            }
            
        } catch (error: any) {
            console.error('❌ Update check failed:', error.message)
        }
    }
    
    private startHealthMonitoring(): void {
        this.healthTimer = setInterval(() => {
            const health = this.getHealth()
            
            // Write health status
            const healthFile = path.join(this.config.dataDir, 'health.json')
            fs.writeFileSync(healthFile, JSON.stringify(health, null, 2))
            
            // Broadcast health
            this.broadcast({ type: 'health', data: health })
            
            // Log to systemd journal
            if (!health.healthy) {
                console.error('⚠️ Health check failed:', health)
            }
            
        }, this.config.healthCheckInterval)
    }
    
    private getHealth(): any {
        const memUsage = process.memoryUsage()
        const uptime = process.uptime()
        
        return {
            healthy: true,
            timestamp: Date.now(),
            uptime,
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024),
                total: Math.round(memUsage.heapTotal / 1024 / 1024)
            },
            services: {
                dashboard: 'running',
                air: this.airClient ? 'connected' : 'disconnected',
                websocket: this.wss ? 'active' : 'inactive'
            },
            agents: Object.keys(this.data.agents).length,
            version: this.data.version
        }
    }
    
    private handleHttpRequest(req: any, res: any): void {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        
        const url = new URL(req.url, `http://localhost:${this.config.port}`)
        
        // Route handlers
        const routes: Record<string, () => any> = {
            '/status': () => ({
                status: 'running',
                air: this.airClient ? 'connected' : 'disconnected',
                agents: Object.keys(this.data.agents).length,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: this.data.version,
                timestamp: Date.now()
            }),
            '/agents': () => this.data.agents,
            '/metrics': () => this.data.metrics,
            '/system': () => this.data.system,
            '/integrity': () => this.data.integrity,
            '/logs': () => this.data.logs.slice(-100),
            '/health': () => this.getHealth(),
            '/version': () => ({ 
                version: this.data.version,
                node: process.version,
                uptime: process.uptime()
            }),
            '/workrooms': () => this.data.workrooms.rooms || [],
            '/workrooms/online': () => this.data.workrooms.onlineUsers || [],
            '/workrooms/messages': () => {
                const roomId = url.searchParams.get('room')
                if (!roomId || !this.workrooms) return []
                return this.workrooms.getRoomMessages(roomId, 50)
            }
        }
        
        const handler = routes[url.pathname]
        if (handler) {
            res.end(JSON.stringify(handler(), null, 2))
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
            
            // Handle messages
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
        if (!this.airClient) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Air not connected'
            }))
            return
        }
        
        switch (cmd.type) {
            case 'update-agent':
                this.airClient.gun.get('agents').get(cmd.id).put(cmd.data)
                break
                
            case 'broadcast':
                this.airClient.gun.get('broadcast').put({
                    from: 'dashboard',
                    message: cmd.message,
                    timestamp: Date.now()
                })
                break
                
            case 'command':
                // Execute agent command
                this.executeAgentCommand(cmd, ws)
                break
                
            case 'refresh':
                ws.send(JSON.stringify({
                    type: 'state-update',
                    data: this.data
                }))
                break
                
            case 'workroom-command':
                // Handle workroom commands
                this.handleWorkroomCommand(cmd.command, ws)
                break
        }
    }
    
    private async initializeWorkrooms(): Promise<void> {
        if (!this.airClient) return
        
        console.log('🏠 Initializing Workrooms...')
        
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
        
        // Initialize Workrooms service
        this.workrooms = new WorkroomsService(this.airClient, dashboardUser)
        
        // Subscribe to workroom events
        this.workrooms.onEvent((event) => {
            // Broadcast workroom events to all WebSocket clients
            this.broadcast({
                type: `workroom-${event.type}`,
                data: event
            })
            
            // Update local data
            this.updateWorkroomsData()
        })
        
        console.log('✅ Workrooms initialized')
    }
    
    private updateWorkroomsData(): void {
        if (!this.workrooms) return
        
        this.data.workrooms = {
            rooms: this.workrooms.getUserRooms(),
            onlineUsers: this.workrooms.getOnlineUsers()
        }
    }
    
    private async handleWorkroomCommand(command: WorkroomCommand, ws: any): Promise<void> {
        try {
            if (!this.workrooms) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Workrooms not initialized'
                }))
                return
            }
            
            const result = await this.workrooms.handleCommand(command)
            
            ws.send(JSON.stringify({
                type: 'workroom-result',
                command: command.action,
                result
            }))
            
        } catch (error: any) {
            ws.send(JSON.stringify({
                type: 'workroom-error',
                command: command.action,
                error: error.message
            }))
        }
    }
    
    private executeAgentCommand(cmd: any, ws: any): void {
        // Send command to specific agent via Air
        if (this.airClient) {
            this.airClient.gun.get('commands').get(cmd.agent).put({
                command: cmd.command,
                args: cmd.args,
                from: 'dashboard',
                timestamp: Date.now()
            })
            
            ws.send(JSON.stringify({
                type: 'command-sent',
                agent: cmd.agent,
                command: cmd.command
            }))
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
    
    private async getVersion(): Promise<string> {
        try {
            const packageJson = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
            )
            this.data.version = packageJson.version
            return packageJson.version
        } catch {
            return 'unknown'
        }
    }
    
    private setupShutdownHandlers(): void {
        const shutdown = async () => {
            console.log('\n🛑 Dashboard shutting down...')
            
            // Clear timers
            if (this.updateTimer) clearInterval(this.updateTimer)
            if (this.healthTimer) clearInterval(this.healthTimer)
            
            // Close connections
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
        process.on('SIGHUP', () => {
            console.log('📝 Reloading configuration...')
            this.config = this.loadConfig()
        })
    }
}

// Start service
const dashboard = new DashboardService()
dashboard.start().catch(error => {
    console.error('Failed to start Dashboard:', error)
    process.exit(1)
})