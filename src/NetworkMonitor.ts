/**
 * Network Monitor Component
 * Monitors P2P network health and connectivity
 */

import { EventEmitter } from 'events';
import Gun from '@akaoio/gun';

export class NetworkMonitor extends EventEmitter {
  private gun: any;
  private peers: Map<string, PeerStatus>;
  private pingInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  
  constructor(gun: any) {
    super();
    this.gun = gun;
    this.peers = new Map();
  }
  
  async start(): Promise<void> {
    this.isRunning = true;
    
    // Monitor peer connections
    this.monitorPeers();
    
    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingPeers();
    }, 5000);
    
    // Initial ping
    await this.pingPeers();
  }
  
  stop(): void {
    this.isRunning = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }
  
  private monitorPeers(): void {
    // Monitor GUN peer connections
    const gunRoot = this.gun._.root;
    
    if (gunRoot.opt.peers) {
      Object.keys(gunRoot.opt.peers).forEach(peer => {
        if (!this.peers.has(peer)) {
          this.peers.set(peer, {
            id: peer,
            connected: false,
            latency: 0,
            lastSeen: Date.now()
          });
        }
      });
    }
  }
  
  private async pingPeers(): Promise<void> {
    const pingPromises = Array.from(this.peers.keys()).map(async (peerId) => {
      const start = Date.now();
      
      try {
        // Ping via GUN message
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), 3000);
          
          this.gun.get('ping').get(Date.now().toString()).put({
            from: 'dashboard',
            peer: peerId,
            timestamp: Date.now()
          }, (ack: any) => {
            clearTimeout(timeout);
            if (ack.err) reject(ack.err);
            else resolve(ack);
          });
        });
        
        const latency = Date.now() - start;
        
        this.peers.set(peerId, {
          id: peerId,
          connected: true,
          latency,
          lastSeen: Date.now()
        });
        
        this.emit('peer:connected', peerId);
        this.emit('latency', latency);
        
      } catch (error) {
        this.peers.set(peerId, {
          id: peerId,
          connected: false,
          latency: 0,
          lastSeen: this.peers.get(peerId)?.lastSeen || 0
        });
        
        this.emit('peer:disconnected', peerId);
      }
    });
    
    await Promise.allSettled(pingPromises);
    
    // Calculate average latency
    const connectedPeers = Array.from(this.peers.values()).filter(p => p.connected);
    if (connectedPeers.length > 0) {
      const avgLatency = connectedPeers.reduce((sum, p) => sum + p.latency, 0) / connectedPeers.length;
      this.emit('latency', Math.round(avgLatency));
    }
  }
  
  public getPeers(): PeerStatus[] {
    return Array.from(this.peers.values());
  }
  
  public getConnectedPeers(): PeerStatus[] {
    return Array.from(this.peers.values()).filter(p => p.connected);
  }
  
  public getNetworkHealth(): NetworkHealth {
    const peers = Array.from(this.peers.values());
    const connected = peers.filter(p => p.connected);
    const avgLatency = connected.length > 0
      ? connected.reduce((sum, p) => sum + p.latency, 0) / connected.length
      : 0;
    
    return {
      totalPeers: peers.length,
      connectedPeers: connected.length,
      averageLatency: Math.round(avgLatency),
      status: connected.length === 0 ? 'disconnected' :
              avgLatency < 100 ? 'excellent' :
              avgLatency < 500 ? 'good' : 'poor'
    };
  }
}

interface PeerStatus {
  id: string;
  connected: boolean;
  latency: number;
  lastSeen: number;
}

interface NetworkHealth {
  totalPeers: number;
  connectedPeers: number;
  averageLatency: number;
  status: 'disconnected' | 'poor' | 'good' | 'excellent';
}