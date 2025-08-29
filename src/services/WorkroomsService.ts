/**
 * Workrooms Service - Real-time collaborative spaces
 * Handles room management, messaging, and presence via Air P2P
 */

import { v4 as uuid } from 'uuid'
import { Peer } from '@akaoio/air'
import { 
    Workroom, 
    WorkroomMessage, 
    WorkroomUser, 
    WorkroomPresence, 
    WorkroomCommand,
    WorkroomEvent,
    WorkroomNotification
} from '../types/workrooms.js'

export class WorkroomsService {
    private airClient: Peer
    private currentUser: WorkroomUser
    private rooms: Map<string, Workroom> = new Map()
    private messages: Map<string, WorkroomMessage[]> = new Map()
    private presence: Map<string, Map<string, WorkroomPresence>> = new Map()
    private users: Map<string, WorkroomUser> = new Map()
    private eventHandlers: ((event: WorkroomEvent) => void)[] = []
    
    constructor(airClient: Peer, currentUser: WorkroomUser) {
        this.airClient = airClient
        this.currentUser = currentUser
        this.initializeDefaultRooms()
        this.subscribeToAir()
    }
    
    // Initialize default rooms for the system
    private initializeDefaultRooms(): void {
        // Global announcement room
        this.createRoom({
            name: 'global',
            type: 'global',
            description: 'System-wide announcements and updates',
            private: false,
            settings: {
                allowAgents: true,
                allowHumans: true,
                autoArchive: 0,
                maxMessages: 1000,
                notifications: true
            }
        })
        
        // Core technology project rooms
        const projects = ['composer', 'battle', 'builder', 'air', 'ui', 'access']
        projects.forEach(project => {
            this.createRoom({
                name: project,
                type: 'project',
                description: `${project} project collaboration`,
                projectId: project,
                private: false,
                settings: {
                    allowAgents: true,
                    allowHumans: true,
                    autoArchive: 30,
                    maxMessages: 5000,
                    notifications: true
                }
            })
        })
        
        // Team rooms
        const teams = [
            'core-fix', 'integration', 'feature-dev', 'security', 'integrity',
            'team-air', 'team-composer', 'team-battle', 'team-builder', 'team-ui'
        ]
        teams.forEach(team => {
            this.createRoom({
                name: team,
                type: 'team', 
                description: `${team} team coordination`,
                teamId: team,
                private: false,
                settings: {
                    allowAgents: true,
                    allowHumans: true,
                    autoArchive: 7,
                    maxMessages: 2000,
                    notifications: true
                }
            })
        })
    }
    
    // Subscribe to Air P2P data streams
    private subscribeToAir(): void {
        // Subscribe to rooms
        this.airClient.gun.get('workrooms').map().on((room: Workroom, id: string) => {
            if (room) {
                this.rooms.set(id, room)
                this.emit('room_updated', id, { room })
            }
        })
        
        // Subscribe to messages by room
        this.rooms.forEach((room, roomId) => {
            this.airClient.gun.get('workroom-messages').get(roomId).map().on(
                (message: WorkroomMessage, msgId: string) => {
                    if (message) {
                        if (!this.messages.has(roomId)) {
                            this.messages.set(roomId, [])
                        }
                        const roomMessages = this.messages.get(roomId)!
                        const existingIndex = roomMessages.findIndex(m => m.id === msgId)
                        
                        if (existingIndex >= 0) {
                            roomMessages[existingIndex] = message
                        } else {
                            roomMessages.push(message)
                            roomMessages.sort((a, b) => a.timestamp - b.timestamp)
                        }
                        
                        this.emit('message', roomId, { message })
                    }
                }
            )
        })
        
        // Subscribe to presence
        this.airClient.gun.get('workroom-presence').map().on(
            (presences: Record<string, WorkroomPresence>, roomId: string) => {
                if (presences) {
                    const roomPresence = new Map<string, WorkroomPresence>()
                    Object.entries(presences).forEach(([userId, presence]) => {
                        roomPresence.set(userId, presence)
                    })
                    this.presence.set(roomId, roomPresence)
                    this.emit('presence', roomId, { presences })
                }
            }
        )
        
        // Subscribe to users
        this.airClient.gun.get('workroom-users').map().on((user: WorkroomUser, id: string) => {
            if (user) {
                this.users.set(id, user)
            }
        })
        
        // Subscribe to typing indicators
        this.airClient.gun.get('workroom-typing').map().on(
            (typing: Record<string, number>, roomId: string) => {
                if (typing) {
                    this.emit('typing', roomId, { typing })
                }
            }
        )
    }
    
    // Create a new room
    async createRoom(options: Partial<Workroom> & { name: string, type: Workroom['type'] }): Promise<Workroom> {
        const room: Workroom = {
            id: uuid(),
            name: options.name,
            type: options.type,
            description: options.description || '',
            created: Date.now(),
            creator: this.currentUser.id,
            private: options.private || false,
            members: [this.currentUser.id],
            moderators: [this.currentUser.id],
            active: true,
            archived: false,
            lastActivity: Date.now(),
            messageCount: 0,
            projectId: options.projectId,
            teamId: options.teamId,
            taskId: options.taskId,
            settings: {
                allowAgents: true,
                allowHumans: true,
                autoArchive: 30,
                maxMessages: 1000,
                notifications: true,
                ...options.settings
            }
        }
        
        // Store in Air
        await this.airClient.gun.get('workrooms').get(room.id).put(room)
        
        // Store locally
        this.rooms.set(room.id, room)
        this.messages.set(room.id, [])
        
        // Join room immediately
        await this.joinRoom(room.id)
        
        this.emit('room_created', room.id, { room })
        
        return room
    }
    
    // Join a room
    async joinRoom(roomId: string): Promise<void> {
        const room = this.rooms.get(roomId)
        if (!room) throw new Error('Room not found')
        
        if (!room.members.includes(this.currentUser.id)) {
            room.members.push(this.currentUser.id)
            await this.airClient.gun.get('workrooms').get(roomId).put(room)
        }
        
        // Update presence
        const presence: WorkroomPresence = {
            roomId,
            userId: this.currentUser.id,
            joined: Date.now(),
            lastActivity: Date.now()
        }
        
        await this.airClient.gun.get('workroom-presence').get(roomId).get(this.currentUser.id).put(presence)
        
        this.emit('join', roomId, { userId: this.currentUser.id })
    }
    
    // Leave a room
    async leaveRoom(roomId: string): Promise<void> {
        const room = this.rooms.get(roomId)
        if (!room) return
        
        room.members = room.members.filter(id => id !== this.currentUser.id)
        await this.airClient.gun.get('workrooms').get(roomId).put(room)
        
        // Remove presence
        await this.airClient.gun.get('workroom-presence').get(roomId).get(this.currentUser.id).put(null)
        
        this.emit('leave', roomId, { userId: this.currentUser.id })
    }
    
    // Send a message
    async sendMessage(roomId: string, content: string, options?: { 
        to?: string, 
        thread?: string,
        attachments?: any[] 
    }): Promise<WorkroomMessage> {
        const room = this.rooms.get(roomId)
        if (!room) throw new Error('Room not found')
        
        if (!room.members.includes(this.currentUser.id)) {
            throw new Error('Not a member of this room')
        }
        
        const message: WorkroomMessage = {
            id: uuid(),
            roomId,
            from: this.currentUser.id,
            fromType: this.currentUser.type,
            to: options?.to,
            message: content,
            timestamp: Date.now(),
            thread: options?.thread,
            attachments: options?.attachments
        }
        
        // Store in Air
        await this.airClient.gun.get('workroom-messages').get(roomId).get(message.id).put(message)
        
        // Update room activity
        room.lastActivity = Date.now()
        room.messageCount++
        await this.airClient.gun.get('workrooms').get(roomId).put(room)
        
        // Update presence
        await this.updatePresence(roomId)
        
        return message
    }
    
    // Update typing indicator
    async setTyping(roomId: string, typing: boolean): Promise<void> {
        const timestamp = typing ? Date.now() : 0
        await this.airClient.gun.get('workroom-typing').get(roomId).get(this.currentUser.id).put(timestamp)
        
        // Auto-clear typing after 3 seconds
        if (typing) {
            setTimeout(() => this.setTyping(roomId, false), 3000)
        }
    }
    
    // Update presence
    private async updatePresence(roomId: string): Promise<void> {
        const presence: WorkroomPresence = {
            roomId,
            userId: this.currentUser.id,
            joined: Date.now(),
            lastActivity: Date.now()
        }
        
        await this.airClient.gun.get('workroom-presence').get(roomId).get(this.currentUser.id).put(presence)
    }
    
    // Get room messages
    getRoomMessages(roomId: string, limit?: number): WorkroomMessage[] {
        const messages = this.messages.get(roomId) || []
        return limit ? messages.slice(-limit) : messages
    }
    
    // Get room members with presence
    getRoomMembers(roomId: string): Array<WorkroomUser & { presence?: WorkroomPresence }> {
        const room = this.rooms.get(roomId)
        if (!room) return []
        
        const roomPresence = this.presence.get(roomId) || new Map()
        
        return room.members.map(memberId => {
            const user = this.users.get(memberId)
            const presence = roomPresence.get(memberId)
            
            return {
                ...user,
                presence
            } as WorkroomUser & { presence?: WorkroomPresence }
        }).filter(Boolean)
    }
    
    // Get all rooms for current user
    getUserRooms(): Workroom[] {
        return Array.from(this.rooms.values())
            .filter(room => room.members.includes(this.currentUser.id))
            .sort((a, b) => b.lastActivity - a.lastActivity)
    }
    
    // Handle CLI commands
    async handleCommand(command: WorkroomCommand): Promise<any> {
        switch (command.action) {
            case 'create':
                return this.createRoom({
                    name: command.roomId!,
                    type: 'task',
                    ...command.options
                })
                
            case 'join':
                await this.joinRoom(command.roomId!)
                return { success: true, message: `Joined room ${command.roomId}` }
                
            case 'leave':
                await this.leaveRoom(command.roomId!)
                return { success: true, message: `Left room ${command.roomId}` }
                
            case 'message':
                const message = await this.sendMessage(command.roomId!, command.message!, {
                    to: command.to
                })
                return { success: true, message: message }
                
            case 'list':
                return this.getUserRooms()
                
            case 'history':
                const limit = command.options?.limit || 50
                return this.getRoomMessages(command.roomId!, limit)
                
            default:
                throw new Error(`Unknown command: ${command.action}`)
        }
    }
    
    // Event system
    onEvent(handler: (event: WorkroomEvent) => void): void {
        this.eventHandlers.push(handler)
    }
    
    private emit(type: WorkroomEvent['type'], roomId: string, data: any): void {
        const event: WorkroomEvent = {
            type,
            roomId,
            userId: this.currentUser.id,
            data,
            timestamp: Date.now()
        }
        
        this.eventHandlers.forEach(handler => handler(event))
    }
    
    // Get online users
    getOnlineUsers(): WorkroomUser[] {
        return Array.from(this.users.values())
            .filter(user => user.online)
            .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    }
    
    // Create direct message room
    async createDirectMessage(userId: string): Promise<Workroom> {
        const otherUser = this.users.get(userId)
        if (!otherUser) throw new Error('User not found')
        
        // Check if DM room already exists
        const existingDM = Array.from(this.rooms.values()).find(room => 
            room.type === 'dm' && 
            room.members.includes(this.currentUser.id) &&
            room.members.includes(userId) &&
            room.members.length === 2
        )
        
        if (existingDM) return existingDM
        
        // Create new DM room
        return this.createRoom({
            name: `${this.currentUser.name} ⟷ ${otherUser.name}`,
            type: 'dm',
            description: 'Direct message',
            private: true,
            members: [this.currentUser.id, userId],
            settings: {
                allowAgents: true,
                allowHumans: true,
                autoArchive: 0,
                maxMessages: 10000,
                notifications: true
            }
        })
    }
}