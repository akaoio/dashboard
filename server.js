#!/usr/bin/env node

/**
 * Dashboard Server 3.0
 * Persistent service that connects to Air as client
 * Provides CLI and TUI interfaces for system monitoring
 */

import { createServer } from 'http'
import { Peer } from '../air/dist/peer.js'
import { WebSocketServer } from 'ws'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class DashboardServer {
    constructor() {
        this.port = 8767
        this.airClient = null
        this.data = {
            agents: {},
            system: {},
            metrics: {},
            logs: [],
            integrity: {}
        }
        this.lockFile = '/run/user/' + process.getuid() + '/dashboard.lock'
    }
    
    async start() {
        console.log('🚀 Dashboard Server 3.0 Starting...')
        
        // Check singleton
        if (!this.checkSingleton()) {
            console.error('❌ Another Dashboard instance is already running')
            process.exit(1)
        }
        
        // Write PID to lock file
        fs.writeFileSync(this.lockFile, process.pid.toString())
        
        // Start HTTP server first (Dashboard always runs)
        this.server = createServer((req, res) => {
            this.handleHttpRequest(req, res)
        })
        
        // Add WebSocket for TUI
        this.wss = new WebSocketServer({ server: this.server })
        this.setupWebSocket()
        
        // Start server
        this.server.listen(this.port, () => {
            console.log(`📊 Dashboard server running on port ${this.port}`)
            console.log('   CLI: http://localhost:8767/[endpoint]')
            console.log('   TUI: ws://localhost:8767')
        })
        
        // Try to connect to Air (optional)
        try {
            console.log('📡 Connecting to Air server...')
            this.airClient = new Peer()
            // Smart peer discovery following Access patterns
            const airPeers = await this.discoverAirPeers()
            await this.airClient.connect({
                peers: airPeers
            })
            console.log('✅ Connected to Air as client')
            
            // Subscribe to Air data
            this.subscribeToAir()
            
        } catch (error) {
            console.warn('⚠️ Could not connect to Air:', error.message)
            console.log('   Dashboard running in standalone mode')
            this.data.system = { status: 'Air disconnected' }
        }
        
        // Handle shutdown
        process.on('SIGTERM', () => this.shutdown())
        process.on('SIGINT', () => this.shutdown())
    }
    
    checkSingleton() {
        try {
            if (fs.existsSync(this.lockFile)) {
                const pid = parseInt(fs.readFileSync(this.lockFile, 'utf8'))
                // Check if process is still running
                try {
                    process.kill(pid, 0)
                    return false // Process exists
                } catch {
                    // Process doesn't exist, remove stale lock
                    fs.unlinkSync(this.lockFile)
                }
            }
            return true
        } catch {
            return true
        }
    }
    
    subscribeToAir() {
        // Subscribe to agents data
        this.airClient.gun.get('agents').map().on((agent, id) => {
            this.data.agents[id] = {
                ...agent,
                lastUpdate: Date.now()
            }
            this.broadcast({ type: 'agent-update', id, agent })
        })
        
        // Subscribe to system status
        this.airClient.gun.get('system').on(system => {
            this.data.system = system
            this.broadcast({ type: 'system-update', system })
        })
        
        // Subscribe to metrics
        this.airClient.gun.get('metrics').on(metrics => {
            this.data.metrics = metrics
            this.broadcast({ type: 'metrics-update', metrics })
        })
        
        // Subscribe to integrity scores
        this.airClient.gun.get('integrity').map().on((score, id) => {
            this.data.integrity[id] = score
            this.broadcast({ type: 'integrity-update', id, score })
        })
        
        // Subscribe to broadcast messages
        this.airClient.gun.get('broadcast').on(msg => {
            if (msg && msg.message) {
                this.data.logs.push({
                    timestamp: Date.now(),
                    ...msg
                })
                // Keep only last 100 logs
                if (this.data.logs.length > 100) {
                    this.data.logs = this.data.logs.slice(-100)
                }
                this.broadcast({ type: 'log', message: msg })
            }
        })
    }
    
    handleHttpRequest(req, res) {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        
        const url = new URL(req.url, `http://localhost:${this.port}`)
        
        switch(url.pathname) {
            case '/status':
                res.end(JSON.stringify({
                    status: 'running',
                    air: 'connected',
                    agents: Object.keys(this.data.agents).length,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    timestamp: Date.now()
                }, null, 2))
                break
                
            case '/agents':
                res.end(JSON.stringify(this.data.agents, null, 2))
                break
                
            case '/metrics':
                res.end(JSON.stringify(this.data.metrics, null, 2))
                break
                
            case '/system':
                res.end(JSON.stringify(this.data.system, null, 2))
                break
                
            case '/integrity':
                res.end(JSON.stringify(this.data.integrity, null, 2))
                break
                
            case '/logs':
                res.end(JSON.stringify(this.data.logs, null, 2))
                break
                
            case '/health':
                res.end(JSON.stringify({
                    healthy: true,
                    services: {
                        air: this.airClient ? 'connected' : 'disconnected',
                        dashboard: 'running'
                    }
                }, null, 2))
                break
                
            default:
                res.statusCode = 404
                res.end(JSON.stringify({
                    error: 'Not found',
                    available: [
                        '/status',
                        '/agents', 
                        '/metrics',
                        '/system',
                        '/integrity',
                        '/logs',
                        '/health'
                    ]
                }, null, 2))
        }
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('🔌 TUI client connected')
            
            // Send initial state
            ws.send(JSON.stringify({
                type: 'initial-state',
                data: this.data
            }))
            
            // Handle commands from TUI
            ws.on('message', (message) => {
                try {
                    const cmd = JSON.parse(message.toString())
                    this.handleCommand(cmd, ws)
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }))
                }
            })
            
            ws.on('close', () => {
                console.log('🔌 TUI client disconnected')
            })
        })
    }
    
    handleCommand(cmd, ws) {
        switch(cmd.type) {
            case 'update-agent':
                // Write to Air
                this.airClient.gun.get('agents').get(cmd.id).put(cmd.data)
                break
                
            case 'broadcast':
                // Broadcast message through Air
                this.airClient.gun.get('broadcast').put({
                    from: 'dashboard',
                    message: cmd.message,
                    timestamp: Date.now()
                })
                break
                
            case 'refresh':
                // Send current state
                ws.send(JSON.stringify({
                    type: 'state-update',
                    data: this.data
                }))
                break
        }
    }
    
    broadcast(message) {
        const msg = JSON.stringify(message)
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(msg)
            }
        })
    }
    
    // Smart Air peer discovery following Access patterns
    async discoverAirPeers() {
        const domain = process.env.AIR_DOMAIN || 'akao.io'
        const prefix = process.env.AIR_PREFIX || 'peer'
        const port = process.env.AIR_PORT || '8765'
        const protocol = process.env.AIR_PROTOCOL || 'https'
        const maxPeers = 5  // Check first 5 peers
        
        console.log(`🔍 Discovering Air peers: ${prefix}0.${domain} through ${prefix}${maxPeers-1}.${domain} on port ${port}`)
        
        // Check for manual override first
        if (process.env.AIR_PEERS) {
            const manualPeers = process.env.AIR_PEERS.split(',')
            console.log(`📋 Using manual peer list: ${manualPeers.join(', ')}`)
            return manualPeers
        }
        
        const peers = []
        const timeout = 2000  // 2 second timeout per peer
        
        // Try to discover active peers
        for (let slot = 0; slot < maxPeers; slot++) {
            const peerDomain = `${prefix}${slot}.${domain}`
            const peerUrl = `${protocol}://${peerDomain}:${port}/gun`
            
            try {
                // Test if peer is accessible
                const response = await this.testPeerConnection(peerUrl, timeout)
                if (response) {
                    console.log(`✅ Found active Air peer: ${peerDomain}`)
                    peers.push(peerUrl)
                }
            } catch (error) {
                console.log(`❌ Peer ${peerDomain} not accessible: ${error.message}`)
            }
        }
        
        // Fallback strategies
        if (peers.length === 0) {
            console.log(`⚠️ No Air peers discovered, trying fallbacks...`)
            
            // Try peer0 as default
            const defaultPeer = `${protocol}://${prefix}0.${domain}:${port}/gun`
            console.log(`🔄 Fallback: ${defaultPeer}`)
            peers.push(defaultPeer)
            
            // Also try localhost for development
            if (process.env.NODE_ENV !== 'production') {
                const localPeer = `http://localhost:${port}/gun`
                console.log(`🔄 Development fallback: ${localPeer}`)
                peers.push(localPeer)
            }
        }
        
        console.log(`📡 Final peer list: ${peers.join(', ')}`)
        return peers
    }
    
    // Test if a peer connection works
    async testPeerConnection(url, timeout = 2000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Connection timeout'))
            }, timeout)
            
            // Try to fetch the GUN endpoint
            import('node-fetch').then(({ default: fetch }) => {
                fetch(url, { 
                    method: 'GET', 
                    timeout: timeout,
                    headers: {
                        'User-Agent': 'Dashboard-Client/3.0'
                    }
                })
                .then(response => {
                    clearTimeout(timer)
                    if (response.ok) {
                        resolve(true)
                    } else {
                        reject(new Error(`HTTP ${response.status}`))
                    }
                })
                .catch(error => {
                    clearTimeout(timer)
                    reject(error)
                })
            }).catch(error => {
                clearTimeout(timer)
                reject(error)
            })
        })
    }
    
    cleanup() {
        try {
            if (fs.existsSync(this.lockFile)) {
                fs.unlinkSync(this.lockFile)
            }
        } catch {}
    }
    
    async shutdown() {
        console.log('\n🛑 Dashboard shutting down...')
        this.cleanup()
        if (this.server) {
            this.server.close()
        }
        if (this.wss) {
            this.wss.close()
        }
        process.exit(0)
    }
}

// Start Dashboard server
const dashboard = new DashboardServer()
dashboard.start().catch(error => {
    console.error('Failed to start:', error)
    process.exit(1)
})