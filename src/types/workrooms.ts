/**
 * Workrooms - Real-time collaborative spaces for agents and humans
 * Air P2P distributed chat system with rooms, direct messages, and presence
 */

export interface WorkroomMessage {
  id: string
  roomId: string
  from: string
  fromType: 'agent' | 'human'
  to?: string  // For direct messages
  message: string
  timestamp: number
  edited?: number
  reactions?: Record<string, string[]>  // emoji -> [userIds]
  thread?: string  // Reply to message ID
  attachments?: WorkroomAttachment[]
}

export interface WorkroomAttachment {
  type: 'file' | 'image' | 'code' | 'log' | 'task'
  name: string
  url?: string
  content?: string
  size?: number
}

export interface Workroom {
  id: string
  name: string
  type: 'project' | 'team' | 'task' | 'dm' | 'global'
  description?: string
  created: number
  creator: string
  
  // Access control
  private: boolean
  members: string[]  // agent/human IDs
  moderators: string[]
  
  // Room state
  active: boolean
  archived: boolean
  lastActivity: number
  messageCount: number
  
  // Project/team specific
  projectId?: string  // For project rooms
  teamId?: string     // For team rooms  
  taskId?: string     // For task rooms
  
  // Room settings
  settings: {
    allowAgents: boolean
    allowHumans: boolean
    autoArchive: number  // Days of inactivity
    maxMessages: number
    notifications: boolean
  }
}

export interface WorkroomUser {
  id: string
  name: string
  type: 'agent' | 'human'
  
  // Presence
  online: boolean
  lastSeen: number
  status: 'active' | 'away' | 'busy' | 'offline'
  statusMessage?: string
  
  // Agent specific
  team?: string
  role?: string
  capabilities?: string[]
  
  // Human specific  
  email?: string
  avatar?: string
  timezone?: string
}

export interface WorkroomPresence {
  roomId: string
  userId: string
  joined: number
  typing?: boolean
  lastActivity: number
}

export interface WorkroomNotification {
  id: string
  userId: string
  roomId: string
  messageId: string
  type: 'mention' | 'dm' | 'room_invite' | 'task_assigned'
  read: boolean
  timestamp: number
}

// Air P2P Schema for distributed synchronization
export interface WorkroomsAirSchema {
  // Rooms registry
  'workrooms': Record<string, Workroom>
  
  // Messages by room
  'workroom-messages': Record<string, Record<string, WorkroomMessage>>
  
  // User presence  
  'workroom-presence': Record<string, Record<string, WorkroomPresence>>
  
  // User profiles
  'workroom-users': Record<string, WorkroomUser>
  
  // Notifications
  'workroom-notifications': Record<string, WorkroomNotification[]>
  
  // Room typing indicators
  'workroom-typing': Record<string, Record<string, number>>
  
  // Room invites
  'workroom-invites': Record<string, {
    roomId: string
    from: string
    to: string
    timestamp: number
    accepted?: boolean
  }>
}

// CLI Command types
export interface WorkroomCommand {
  action: 'create' | 'join' | 'leave' | 'message' | 'list' | 'history' | 'invite' | 'kick'
  roomId?: string
  message?: string
  from?: string
  to?: string
  userId?: string
  options?: Record<string, any>
}

// Dashboard events
export interface WorkroomEvent {
  type: 'message' | 'join' | 'leave' | 'typing' | 'presence' | 'room_created' | 'room_updated'
  roomId: string
  userId?: string
  data: any
  timestamp: number
}