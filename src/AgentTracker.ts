/**
 * Agent Tracker Component
 * Tracks all agents in the Living Agent Network
 */

import { EventEmitter } from 'events';
import Gun from '@akaoio/gun';
import type { Agent, AgentStatus } from './types';

export class AgentTracker extends EventEmitter {
  private gun: Gun;
  private agents: Map<string, Agent>;
  private agentsChannel: any;
  
  constructor(gun: Gun) {
    super();
    this.gun = gun;
    this.agents = new Map();
    this.agentsChannel = this.gun.get('agents');
  }
  
  async start(): Promise<void> {
    // Monitor all agents
    this.agentsChannel.map().on((data: any, key: string) => {
      if (data && key) {
        const agent: Agent = {
          id: key,
          team: data.team || 'unknown',
          role: data.role || 'unknown',
          status: data.status || 'offline',
          lastSeen: data.timestamp || Date.now(),
          metadata: data.metadata || {}
        };
        
        const existingAgent = this.agents.get(key);
        this.agents.set(key, agent);
        
        if (!existingAgent || existingAgent.status !== agent.status) {
          if (agent.status === 'online') {
            this.emit('agent:connected', agent);
          } else {
            this.emit('agent:disconnected', key);
          }
        }
        
        this.emit('agent:updated', agent);
      }
    });
    
    // Periodic health check
    setInterval(() => {
      this.checkAgentHealth();
    }, 10000);
  }
  
  stop(): void {
    // Clean up listeners
    this.removeAllListeners();
  }
  
  private checkAgentHealth(): void {
    const now = Date.now();
    const timeout = 30000; // 30 seconds
    
    this.agents.forEach((agent, id) => {
      if (agent.status === 'online' && now - agent.lastSeen > timeout) {
        agent.status = 'offline';
        this.agents.set(id, agent);
        this.emit('agent:timeout', id);
        this.emit('agent:disconnected', id);
      }
    });
  }
  
  async registerAgent(id: string, data: Partial<Agent>): Promise<void> {
    const agent: Agent = {
      id,
      team: data.team || 'unknown',
      role: data.role || 'unknown',
      status: 'online',
      lastSeen: Date.now(),
      metadata: data.metadata || {}
    };
    
    // Store locally
    this.agents.set(id, agent);
    
    // Broadcast to network
    await new Promise((resolve, reject) => {
      this.agentsChannel.get(id).put({
        ...agent,
        timestamp: Date.now()
      }, (ack: any) => {
        if (ack.err) reject(ack.err);
        else resolve(ack);
      });
    });
    
    this.emit('agent:connected', agent);
  }
  
  async updateAgentStatus(id: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      agent.lastSeen = Date.now();
      
      await new Promise((resolve, reject) => {
        this.agentsChannel.get(id).get('status').put(status, (ack: any) => {
          if (ack.err) reject(ack.err);
          else resolve(ack);
        });
      });
      
      this.emit('agent:updated', agent);
    }
  }
  
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }
  
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
  
  getOnlineAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'online');
  }
  
  getAgentsByTeam(team: string): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.team === team);
  }
  
  getAgentsByRole(role: string): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.role === role);
  }
  
  getTeams(): string[] {
    const teams = new Set<string>();
    this.agents.forEach(agent => teams.add(agent.team));
    return Array.from(teams);
  }
  
  getStats(): AgentStats {
    const agents = Array.from(this.agents.values());
    const online = agents.filter(a => a.status === 'online');
    const teams = this.getTeams();
    
    return {
      total: agents.length,
      online: online.length,
      offline: agents.length - online.length,
      teams: teams.length,
      byTeam: teams.reduce((acc, team) => {
        acc[team] = this.getAgentsByTeam(team).length;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

interface AgentStats {
  total: number;
  online: number;
  offline: number;
  teams: number;
  byTeam: Record<string, number>;
}