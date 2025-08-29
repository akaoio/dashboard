/**
 * Memory Adapter Interface for Dashboard
 * Allows pluggable storage backends (Composer, Air, File, Redis, etc.)
 */

export interface MemoryAdapter {
  // Adapter metadata
  name: string
  version: string
  ready: boolean
  
  // Connection management
  connect(config?: any): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // Basic CRUD operations
  get(path: string): Promise<any>
  set(path: string, value: any): Promise<void>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  
  // Collection operations
  list(prefix: string): Promise<string[]>
  query(filter: any): Promise<any[]>
  
  // Real-time subscriptions
  subscribe(path: string, callback: (data: any) => void): () => void
  publish(channel: string, message: any): Promise<void>
  
  // Batch operations
  batch(operations: BatchOperation[]): Promise<void>
  
  // Persistence
  save(): Promise<void>
  load(): Promise<void>
  clear(): Promise<void>
  
  // Health check
  health(): Promise<AdapterHealth>
}

export interface BatchOperation {
  type: 'set' | 'delete'
  path: string
  value?: any
}

export interface AdapterHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  latency: number
  storage: {
    used: number
    available: number
  }
  error?: string
}

// Base adapter with common functionality
export abstract class BaseMemoryAdapter implements MemoryAdapter {
  abstract name: string
  abstract version: string
  ready: boolean = false
  
  protected subscribers: Map<string, Set<(data: any) => void>> = new Map()
  
  abstract connect(config?: any): Promise<void>
  abstract disconnect(): Promise<void>
  abstract isConnected(): boolean
  
  abstract get(path: string): Promise<any>
  abstract set(path: string, value: any): Promise<void>
  abstract delete(path: string): Promise<void>
  abstract exists(path: string): Promise<boolean>
  
  abstract list(prefix: string): Promise<string[]>
  abstract query(filter: any): Promise<any[]>
  
  // Default subscribe implementation using polling
  subscribe(path: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set())
    }
    
    this.subscribers.get(path)!.add(callback)
    
    // Start polling if needed
    this.startPolling(path)
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(path)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscribers.delete(path)
          this.stopPolling(path)
        }
      }
    }
  }
  
  protected notifySubscribers(path: string, data: any): void {
    const subs = this.subscribers.get(path)
    if (subs) {
      subs.forEach(callback => callback(data))
    }
  }
  
  protected startPolling(path: string): void {
    // Override in subclass if needed
  }
  
  protected stopPolling(path: string): void {
    // Override in subclass if needed
  }
  
  abstract publish(channel: string, message: any): Promise<void>
  
  async batch(operations: BatchOperation[]): Promise<void> {
    // Default implementation - execute sequentially
    for (const op of operations) {
      if (op.type === 'set') {
        await this.set(op.path, op.value)
      } else if (op.type === 'delete') {
        await this.delete(op.path)
      }
    }
  }
  
  abstract save(): Promise<void>
  abstract load(): Promise<void>
  abstract clear(): Promise<void>
  abstract health(): Promise<AdapterHealth>
}

// Adapter registry
export class AdapterRegistry {
  private static adapters: Map<string, MemoryAdapter> = new Map()
  private static primaryAdapter: string | null = null
  
  static register(adapter: MemoryAdapter): void {
    this.adapters.set(adapter.name, adapter)
    
    // First adapter becomes primary by default
    if (!this.primaryAdapter) {
      this.primaryAdapter = adapter.name
    }
  }
  
  static get(name: string): MemoryAdapter | undefined {
    return this.adapters.get(name)
  }
  
  static getPrimary(): MemoryAdapter | undefined {
    return this.primaryAdapter ? this.adapters.get(this.primaryAdapter) : undefined
  }
  
  static setPrimary(name: string): void {
    if (this.adapters.has(name)) {
      this.primaryAdapter = name
    } else {
      throw new Error(`Adapter ${name} not found`)
    }
  }
  
  static list(): string[] {
    return Array.from(this.adapters.keys())
  }
  
  static async connectAll(config?: any): Promise<void> {
    const promises = Array.from(this.adapters.values()).map(adapter => 
      adapter.connect(config).catch(err => {
        console.warn(`Failed to connect ${adapter.name}:`, err.message)
      })
    )
    await Promise.all(promises)
  }
  
  static async healthCheck(): Promise<Record<string, AdapterHealth>> {
    const results: Record<string, AdapterHealth> = {}
    
    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.health()
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          latency: -1,
          storage: { used: 0, available: 0 },
          error: (error as Error).message
        }
      }
    }
    
    return results
  }
}