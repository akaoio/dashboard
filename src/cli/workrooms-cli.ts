#!/usr/bin/env node

/**
 * Workrooms CLI - Command line interface for real-time collaboration
 * Global dashboard tool with chat, rooms, and agent coordination
 */

import { program } from 'commander'
import blessed from 'blessed'
import WebSocket from 'ws'
import chalk from 'chalk'
import { WorkroomCommand } from '../types/workrooms.js'

const DASHBOARD_PORT = process.env.DASHBOARD_PORT || '8767'
const DASHBOARD_URL = process.env.DASHBOARD_URL || `ws://localhost:${DASHBOARD_PORT}`

class DashboardCLI {
    private ws: WebSocket | null = null
    private screen: blessed.Widgets.Screen | null = null
    private data: any = {
        rooms: {},
        agents: {},
        messages: {},
        presence: {}
    }
    
    async connectToDashboard(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(DASHBOARD_URL)
            
            this.ws.on('open', () => {
                console.log(chalk.green('✅ Connected to Dashboard'))
                resolve()
            })
            
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString())
                    this.handleMessage(message)
                } catch (error) {
                    console.error('Failed to parse message:', error)
                }
            })
            
            this.ws.on('error', (error) => {
                console.error(chalk.red('❌ Dashboard connection failed:'), error.message)
                reject(error)
            })
            
            this.ws.on('close', () => {
                console.log(chalk.yellow('🔌 Dashboard connection closed'))
                if (this.screen) this.screen.destroy()
                process.exit(0)
            })
        })
    }
    
    private handleMessage(message: any): void {
        switch (message.type) {
            case 'initial-state':
                this.data = { ...this.data, ...message.data }
                break
                
            case 'workroom-message':
                if (!this.data.messages[message.data.roomId]) {
                    this.data.messages[message.data.roomId] = []
                }
                this.data.messages[message.data.roomId].push(message.data.message)
                this.updateUI()
                break
                
            case 'workroom-update':
                this.data.rooms[message.data.roomId] = message.data.room
                this.updateUI()
                break
                
            case 'presence-update':
                this.data.presence[message.data.roomId] = message.data.presence
                this.updateUI()
                break
        }
    }
    
    private sendCommand(command: WorkroomCommand): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'workroom-command',
                command
            }))
        }
    }
    
    // Main dashboard TUI
    async showDashboard(): Promise<void> {
        await this.connectToDashboard()
        
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'AKAO.IO Dashboard - Workrooms'
        })
        
        // Layout containers
        const mainContainer = blessed.box({
            parent: this.screen,
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } }
        })
        
        // Header
        const header = blessed.box({
            parent: mainContainer,
            left: 0,
            top: 0,
            width: '100%',
            height: 3,
            content: chalk.cyan.bold('🚀 AKAO.IO DASHBOARD - Real-time Agent Collaboration'),
            style: { fg: 'cyan', bold: true }
        })
        
        // Three column layout
        const leftPanel = blessed.box({
            parent: mainContainer,
            label: ' WORKROOMS ',
            left: 0,
            top: 3,
            width: '25%',
            height: '100%-6',
            border: { type: 'line' },
            style: { border: { fg: 'green' } },
            scrollable: true
        })
        
        const centerPanel = blessed.box({
            parent: mainContainer,
            label: ' ACTIVE ROOM ',
            left: '25%',
            top: 3,
            width: '50%',
            height: '100%-6',
            border: { type: 'line' },
            style: { border: { fg: 'yellow' } },
            scrollable: true
        })
        
        const rightPanel = blessed.box({
            parent: mainContainer,
            label: ' AGENTS & SYSTEM ',
            left: '75%',
            top: 3,
            width: '25%',
            height: '100%-6',
            border: { type: 'line' },
            style: { border: { fg: 'magenta' } },
            scrollable: true
        })
        
        // Input box at bottom
        const inputBox = blessed.textbox({
            parent: mainContainer,
            label: ' Message ',
            left: '25%',
            top: '100%-3',
            width: '50%',
            height: 3,
            border: { type: 'line' },
            style: { border: { fg: 'white' } },
            inputOnFocus: true
        })
        
        // Status bar
        const statusBar = blessed.box({
            parent: mainContainer,
            left: 0,
            top: '100%-3',
            width: '25%',
            height: 3,
            content: chalk.green('● Connected | ESC: Exit'),
            style: { fg: 'green' }
        })
        
        // Initialize content
        this.updatePanels(leftPanel, centerPanel, rightPanel)
        
        // Input handling
        inputBox.on('submit', (text: string) => {
            if (text.trim()) {
                // Send message to active room
                const activeRoom = this.getActiveRoom()
                if (activeRoom) {
                    this.sendCommand({
                        action: 'message',
                        roomId: activeRoom.id,
                        message: text.trim()
                    })
                }
                inputBox.clearValue()
                this.screen!.render()
            }
        })
        
        // Key bindings
        this.screen.key(['escape', 'C-c'], () => {
            process.exit(0)
        })
        
        this.screen.key(['tab'], () => {
            inputBox.focus()
        })
        
        // Auto-refresh every 2 seconds
        setInterval(() => {
            this.updatePanels(leftPanel, centerPanel, rightPanel)
            this.screen!.render()
        }, 2000)
        
        this.screen.render()
        inputBox.focus()
    }
    
    private updatePanels(leftPanel: any, centerPanel: any, rightPanel: any): void {
        // Left panel - Workrooms
        const rooms = Object.values(this.data.rooms || {})
        const roomsList = rooms.map((room: any) => {
            const unread = this.getUnreadCount(room.id)
            const indicator = room.type === 'dm' ? '💬' : room.type === 'project' ? '📦' : '👥'
            const unreadStr = unread > 0 ? chalk.red(` (${unread})`) : ''
            return `${indicator} ${room.name}${unreadStr}`
        }).join('\\n')
        
        leftPanel.setContent(roomsList || 'No rooms available')
        
        // Center panel - Active room messages
        const activeRoom = this.getActiveRoom()
        if (activeRoom) {
            const messages = this.data.messages[activeRoom.id] || []
            const messagesList = messages.slice(-20).map((msg: any) => {
                const time = new Date(msg.timestamp).toLocaleTimeString()
                const sender = msg.fromType === 'agent' ? chalk.cyan(msg.from) : chalk.green(msg.from)
                return `[${time}] ${sender}: ${msg.message}`
            }).join('\\n')
            
            centerPanel.setContent(messagesList || 'No messages')
        } else {
            centerPanel.setContent('Select a room to view messages')
        }
        
        // Right panel - Agents and system info
        const agents = Object.values(this.data.agents || {})
        const onlineAgents = agents.filter((agent: any) => agent.online)
        const agentsList = onlineAgents.map((agent: any) => {
            const status = agent.status === 'active' ? '🟢' : agent.status === 'busy' ? '🔴' : '🟡'
            return `${status} ${agent.name} (${agent.role || 'agent'})`
        }).join('\\n')
        
        const systemInfo = [
            chalk.bold('📊 SYSTEM STATUS'),
            `Agents Online: ${onlineAgents.length}/${agents.length}`,
            `Active Rooms: ${Object.keys(this.data.rooms || {}).length}`,
            `Health: ${this.data.system?.health || 'Unknown'}`,
            '',
            chalk.bold('🤖 ONLINE AGENTS'),
            agentsList || 'No agents online'
        ].join('\\n')
        
        rightPanel.setContent(systemInfo)
    }
    
    private updateUI(): void {
        // Update will be handled by the interval timer
    }
    
    private getActiveRoom(): any {
        // For now, return the first room. Later we'll track selected room
        const rooms = Object.values(this.data.rooms || {})
        return rooms[0] || null
    }
    
    private getUnreadCount(roomId: string): number {
        // Placeholder - implement unread message counting
        return 0
    }
}

// CLI Commands
program
    .name('dashboard')
    .description('AKAO.IO Dashboard - Real-time agent collaboration')
    .version('3.0.0')

// Main dashboard command
program
    .command('show', { isDefault: true })
    .alias('dashboard')
    .description('Show the main dashboard interface')
    .action(async () => {
        const cli = new DashboardCLI()
        await cli.showDashboard()
    })

// Room management commands
const roomCmd = program
    .command('room')
    .description('Room management commands')

roomCmd
    .command('list')
    .description('List all available rooms')
    .action(async () => {
        console.log('🏠 Available Workrooms:')
        // TODO: Implement room listing
    })

roomCmd
    .command('create <name>')
    .description('Create a new room')
    .option('-t, --type <type>', 'Room type (project|team|task|dm)', 'task')
    .option('-p, --private', 'Make room private')
    .option('-d, --description <desc>', 'Room description')
    .action(async (name, options) => {
        console.log(`Creating room: ${name}`)
        // TODO: Implement room creation
    })

roomCmd
    .command('join <name>')
    .description('Join a room')
    .action(async (name) => {
        console.log(`Joining room: ${name}`)
        // TODO: Implement room joining
    })

// Messaging commands
program
    .command('msg <room> <message>')
    .description('Send a message to a room')
    .option('-f, --from <agent>', 'Send message as agent')
    .action(async (room, message, options) => {
        console.log(`Sending to ${room}: ${message}`)
        // TODO: Implement messaging
    })

program
    .command('dm <user> <message>')
    .alias('@')
    .description('Send direct message to user/agent')
    .action(async (user, message) => {
        console.log(`DM to ${user}: ${message}`)
        // TODO: Implement direct messaging
    })

// Status commands
program
    .command('online')
    .description('Show online agents and users')
    .action(async () => {
        console.log('👥 Online Users:')
        // TODO: Implement online users listing
    })

program
    .command('history <room>')
    .description('Show message history for a room')
    .option('-l, --limit <count>', 'Number of messages to show', '50')
    .option('-s, --since <time>', 'Show messages since time (1h, 1d, etc)')
    .action(async (room, options) => {
        console.log(`History for ${room}:`)
        // TODO: Implement history display
    })

// Quick commands
program
    .command('status')
    .description('Show dashboard and system status')
    .action(async () => {
        console.log('📊 Dashboard Status:')
        try {
            // Quick status check
            const response = await fetch('http://localhost:8767/status')
            const status = await response.json()
            console.log(JSON.stringify(status, null, 2))
        } catch (error) {
            console.error(chalk.red('❌ Dashboard not running'))
        }
    })

// Error handling
program.configureOutput({
    outputError: (str, write) => write(chalk.red(str))
})

// Run CLI
program.parse()