/**
 * Message Feed Component
 * Handles real-time message streaming and broadcasting
 */

import { EventEmitter } from 'events';
import Gun from '@akaoio/gun';
import type { Message } from './types';

export class MessageFeed extends EventEmitter {
  private gun: Gun;
  private messagesChannel: any;
  private broadcastChannel: any;
  private messages: Message[] = [];
  private maxMessages: number;
  
  constructor(gun: Gun, maxMessages: number = 1000) {
    super();
    this.gun = gun;
    this.maxMessages = maxMessages;
    this.messagesChannel = this.gun.get('air-dashboard').get('messages');
    this.broadcastChannel = this.gun.get('broadcast');
  }
  
  async start(): Promise<void> {
    // Monitor message channels
    this.messagesChannel.map().on((data: any, key: string) => {
      if (data && data.from && data.message) {
        this.handleMessage(data);
      }
    });
    
    // Monitor broadcast channel
    this.broadcastChannel.map().on((data: any, key: string) => {
      if (data && data.from && data.message) {
        this.handleMessage(data);
      }
    });
  }
  
  stop(): void {
    this.removeAllListeners();
  }
  
  private handleMessage(data: any): void {
    const message: Message = {
      id: data.id || Date.now().toString(),
      from: data.from,
      text: data.message,
      team: data.team || 'unknown',
      timestamp: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
      metadata: data.metadata || {}
    };
    
    this.messages.push(message);
    
    // Trim messages array
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
    
    this.emit('message', message);
  }
  
  async broadcast(from: string, text: string, metadata?: any): Promise<void> {
    const message = {
      id: Date.now().toString(),
      from,
      message: text,
      timestamp: Date.now(),
      metadata: metadata || {}
    };
    
    // Send to both channels
    await Promise.all([
      new Promise((resolve, reject) => {
        this.messagesChannel.get(message.id).put(message, (ack: any) => {
          if (ack.err) reject(ack.err);
          else resolve(ack);
        });
      }),
      new Promise((resolve, reject) => {
        this.broadcastChannel.get(message.id).put(message, (ack: any) => {
          if (ack.err) reject(ack.err);
          else resolve(ack);
        });
      })
    ]);
  }
  
  getMessages(): Message[] {
    return [...this.messages];
  }
  
  getRecentMessages(count: number = 10): Message[] {
    return this.messages.slice(-count);
  }
  
  getMessagesByAgent(agentId: string): Message[] {
    return this.messages.filter(m => m.from === agentId);
  }
  
  getMessagesByTeam(team: string): Message[] {
    return this.messages.filter(m => m.team === team);
  }
  
  clearMessages(): void {
    this.messages = [];
    this.emit('messages:cleared');
  }
  
  searchMessages(query: string): Message[] {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(m => 
      m.text.toLowerCase().includes(lowerQuery) ||
      m.from.toLowerCase().includes(lowerQuery)
    );
  }
}