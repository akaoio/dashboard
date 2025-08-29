/**
 * Air P2P Memory Adapter for Dashboard
 * Optional adapter for distributed real-time sync via GUN database
 * Only used when Air/GUN is available and needed
 */

import { BaseMemoryAdapter, AdapterHealth } from './MemoryAdapter.js'

interface AirConfig {
  peers: string[]
  namespace?: string
  timeout?: number
}

export class AirAdapter extends BaseMemoryAdapter {
  name = 'air'
  version = '1.0.0'
  
  private config: AirConfig
  private gun: any = null
  private peer: any = null
  private connected: boolean = false
  
  constructor(config?: Partial<AirConfig>) {
    super()
    this.config = {
      peers: ['http://localhost:8765/gun'],
      namespace: 'dashboard',
      timeout: 5000,
      ...config
    }
  }
  
  async connect(): Promise<void> {
    try {
      // Dynamically import Air/GUN only if available
      const { Peer } = await import('@akaoio/air').catch(() => {
        console.log('⚠️ Air not available, skipping P2P adapter')
        throw new Error('Air module not available')
      })
      
      // Create peer connection
      this.peer = new Peer()
      await this.peer.connect({ peers: this.config.peers })
      
      // Get GUN instance
      this.gun = this.peer.gun
      
      this.connected = true
      this.ready = true
      console.log('✅ Air adapter connected to P2P network')
      
    } catch (error: any) {
      console.warn('⚠️ Air adapter failed to connect:', error.message)
      this.connected = false
      this.ready = false
      throw error
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.peer) {
      await this.peer.stop()
      this.peer = null
      this.gun = null
    }
    
    this.connected = false
    this.ready = false
    console.log('🔌 Air adapter disconnected')
  }
  
  isConnected(): boolean {
    return this.connected
  }
  
  async get(path: string): Promise<any> {
    if (!this.gun) throw new Error('Air not connected')
    
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(undefined), this.config.timeout)
      
      this.gun
        .get(this.config.namespace)
        .get(path)
        .once((data: any) => {
          clearTimeout(timeoutId)
          resolve(data)
        })
    })
  }
  
  async set(path: string, value: any): Promise<void> {
    if (!this.gun) throw new Error('Air not connected')
    
    return new Promise((resolve, reject) => {
      this.gun
        .get(this.config.namespace)
        .get(path)
        .put(value, (ack: any) => {
          if (ack.err) {
            reject(new Error(ack.err))
          } else {
            resolve()
          }
        })
    })
  }
  
  async delete(path: string): Promise<void> {
    if (!this.gun) throw new Error('Air not connected')
    
    // GUN doesn't truly delete, but we can set to null
    await this.set(path, null)
  }
  
  async exists(path: string): Promise<boolean> {
    const value = await this.get(path)
    return value !== undefined && value !== null
  }
  
  async list(prefix: string): Promise<string[]> {
    if (!this.gun) throw new Error('Air not connected')
    
    return new Promise((resolve) => {
      const results: string[] = []
      const timeoutId = setTimeout(() => resolve(results), this.config.timeout)
      
      this.gun
        .get(this.config.namespace)
        .map()
        .once((data: any, key: string) => {
          if (key && key.startsWith(prefix)) {
            results.push(key)
          }
        })
      
      // GUN doesn't have a proper "done" event, so we use timeout
      setTimeout(() => {
        clearTimeout(timeoutId)
        resolve(results)
      }, 1000)
    })
  }
  
  async query(filter: any): Promise<any[]> {
    if (!this.gun) throw new Error('Air not connected')
    
    return new Promise((resolve) => {
      const results: any[] = []
      const timeoutId = setTimeout(() => resolve(results), this.config.timeout)
      
      this.gun
        .get(this.config.namespace)
        .map()
        .once((data: any, key: string) => {
          if (data && this.matchesFilter(data, filter)) {
            results.push({ key, value: data })
          }
        })
      
      setTimeout(() => {
        clearTimeout(timeoutId)
        resolve(results)
      }, 1000)
    })
  }
  
  subscribe(path: string, callback: (data: any) => void): () => void {
    if (!this.gun) throw new Error('Air not connected')
    
    // GUN's .on() provides real-time updates
    const gunPath = this.gun
      .get(this.config.namespace)
      .get(path)
    
    gunPath.on((data: any) => {
      callback(data)
      this.notifySubscribers(path, data)
    })
    
    // Return unsubscribe function
    return () => {
      gunPath.off()
    }
  }
  
  async publish(channel: string, message: any): Promise<void> {
    if (!this.gun) throw new Error('Air not connected')
    
    // Publish to GUN channel
    const timestamp = Date.now()
    const msgId = `${timestamp}-${Math.random()}`
    
    await new Promise((resolve, reject) => {
      this.gun
        .get('channels')
        .get(channel)
        .get(msgId)
        .put({
          ...message,
          timestamp,
          id: msgId
        }, (ack: any) => {
          if (ack.err) {
            reject(new Error(ack.err))
          } else {
            resolve(undefined)
          }
        })
    })
  }
  
  async save(): Promise<void> {
    // Air/GUN automatically persists data
    console.log('💾 Air data is automatically persisted in P2P network')
  }
  
  async load(): Promise<void> {
    // Air/GUN automatically loads from peers
    console.log('📂 Air data loaded from P2P network')
  }
  
  async clear(): Promise<void> {
    if (!this.gun) throw new Error('Air not connected')
    
    // Clear namespace (set to null)
    await new Promise((resolve, reject) => {
      this.gun
        .get(this.config.namespace)
        .put(null, (ack: any) => {
          if (ack.err) {
            reject(new Error(ack.err))
          } else {
            resolve(undefined)
          }
        })
    })
  }
  
  async health(): Promise<AdapterHealth> {
    const start = Date.now()
    
    if (!this.connected) {
      return {
        status: 'unhealthy',
        latency: -1,
        storage: { used: 0, available: 0 },
        error: 'Not connected to Air network'
      }
    }
    
    try {
      // Test write/read
      const testKey = '.health-check'
      const testValue = { timestamp: Date.now(), random: Math.random() }
      
      await this.set(testKey, testValue)
      const retrieved = await this.get(testKey)
      
      if (!retrieved || retrieved.random !== testValue.random) {
        throw new Error('Read/write verification failed')
      }
      
      await this.delete(testKey)
      
      return {
        status: 'healthy',
        latency: Date.now() - start,
        storage: {
          used: 0, // P2P doesn't have local storage limits
          available: Number.MAX_SAFE_INTEGER
        }
      }
    } catch (error) {
      return {
        status: 'degraded',
        latency: Date.now() - start,
        storage: { used: 0, available: 0 },
        error: (error as Error).message
      }
    }
  }
  
  // Air-specific features
  async getPeers(): Promise<string[]> {
    if (!this.peer) return []
    
    // This would depend on the actual Air API
    return this.config.peers
  }
  
  async getNetworkStats(): Promise<any> {
    if (!this.peer) return null
    
    // Would return network statistics if Air provides them
    return {
      connected: this.connected,
      peers: await this.getPeers(),
      latency: 0
    }
  }
  
  private matchesFilter(obj: any, filter: any): boolean {
    for (const [key, expected] of Object.entries(filter)) {
      if (obj[key] !== expected) {
        return false
      }
    }
    return true
  }
}