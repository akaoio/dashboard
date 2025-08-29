/**
 * Local JSON Memory Adapter for Dashboard
 * Simple file-based storage using JSON files
 * Lightweight alternative when Composer/Air not needed
 */

import { BaseMemoryAdapter, AdapterHealth } from './MemoryAdapter.js'
import fs from 'fs/promises'
import path from 'path'
import { EventEmitter } from 'events'

interface LocalConfig {
  dataFile: string
  autoSave: boolean
  saveInterval: number
}

export class LocalAdapter extends BaseMemoryAdapter {
  name = 'local'
  version = '1.0.0'
  
  private config: LocalConfig
  private data: Map<string, any> = new Map()
  private events: EventEmitter = new EventEmitter()
  private saveTimer: NodeJS.Timer | null = null
  private isDirty: boolean = false
  
  constructor(config?: Partial<LocalConfig>) {
    super()
    this.config = {
      dataFile: path.join(process.cwd(), 'data', 'dashboard.json'),
      autoSave: true,
      saveInterval: 10000, // 10 seconds
      ...config
    }
  }
  
  async connect(): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(this.config.dataFile), { recursive: true })
    
    // Load existing data
    await this.load()
    
    // Start auto-save timer
    if (this.config.autoSave) {
      this.saveTimer = setInterval(() => {
        if (this.isDirty) {
          this.save().catch(console.error)
        }
      }, this.config.saveInterval)
    }
    
    this.ready = true
    console.log('✅ Local adapter connected')
  }
  
  async disconnect(): Promise<void> {
    // Stop auto-save timer
    if (this.saveTimer) {
      clearInterval(this.saveTimer)
      this.saveTimer = null
    }
    
    // Save final state
    if (this.isDirty) {
      await this.save()
    }
    
    this.ready = false
    console.log('🔌 Local adapter disconnected')
  }
  
  isConnected(): boolean {
    return this.ready
  }
  
  async get(path: string): Promise<any> {
    return this.getNestedValue(path)
  }
  
  async set(path: string, value: any): Promise<void> {
    this.setNestedValue(path, value)
    this.isDirty = true
    
    // Emit change event
    this.events.emit('change', path, value)
    this.notifySubscribers(path, value)
  }
  
  async delete(path: string): Promise<void> {
    this.deleteNestedValue(path)
    this.isDirty = true
    
    // Emit delete event
    this.events.emit('delete', path)
    this.notifySubscribers(path, undefined)
  }
  
  async exists(path: string): Promise<boolean> {
    return this.getNestedValue(path) !== undefined
  }
  
  async list(prefix: string): Promise<string[]> {
    const results: string[] = []
    const prefixParts = prefix.split('/')
    
    // Traverse data structure
    const traverse = (obj: any, currentPath: string[] = []): void => {
      if (typeof obj !== 'object' || obj === null) return
      
      for (const key in obj) {
        const newPath = [...currentPath, key]
        const fullPath = newPath.join('/')
        
        if (fullPath.startsWith(prefix)) {
          results.push(fullPath)
        }
        
        traverse(obj[key], newPath)
      }
    }
    
    const rootObj = this.pathToObject()
    traverse(rootObj)
    
    return results
  }
  
  async query(filter: any): Promise<any[]> {
    const results: any[] = []
    
    // Simple query by iterating all data
    const traverse = (obj: any, path: string[] = []): void => {
      if (typeof obj !== 'object' || obj === null) return
      
      // Check if current object matches filter
      if (this.matchesFilter(obj, filter)) {
        results.push({
          path: path.join('/'),
          value: obj
        })
      }
      
      // Recurse into nested objects
      for (const key in obj) {
        traverse(obj[key], [...path, key])
      }
    }
    
    const rootObj = this.pathToObject()
    traverse(rootObj)
    
    return results
  }
  
  subscribe(path: string, callback: (data: any) => void): () => void {
    // Add to base class subscribers
    const unsubscribe = super.subscribe(path, callback)
    
    // Also listen to events
    const changeHandler = (changedPath: string, value: any) => {
      if (changedPath === path || changedPath.startsWith(path + '/')) {
        callback(value)
      }
    }
    
    this.events.on('change', changeHandler)
    
    // Return combined unsubscribe
    return () => {
      unsubscribe()
      this.events.off('change', changeHandler)
    }
  }
  
  async publish(channel: string, message: any): Promise<void> {
    // Store in pub/sub namespace
    const channelPath = `pubsub/${channel}/messages`
    const messages = (await this.get(channelPath)) || []
    
    messages.push({
      ...message,
      timestamp: Date.now()
    })
    
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages.splice(0, messages.length - 100)
    }
    
    await this.set(channelPath, messages)
    
    // Emit to channel subscribers
    this.events.emit(`channel:${channel}`, message)
  }
  
  async save(): Promise<void> {
    const dataObj = this.pathToObject()
    const json = JSON.stringify(dataObj, null, 2)
    
    // Write atomically using temp file
    const tempFile = `${this.config.dataFile}.tmp`
    await fs.writeFile(tempFile, json, 'utf8')
    await fs.rename(tempFile, this.config.dataFile)
    
    this.isDirty = false
    console.log(`💾 Saved local data (${this.data.size} entries)`)
  }
  
  async load(): Promise<void> {
    try {
      const json = await fs.readFile(this.config.dataFile, 'utf8')
      const dataObj = JSON.parse(json)
      
      // Convert to Map structure
      this.objectToPath(dataObj)
      
      console.log(`📂 Loaded ${this.data.size} entries from local storage`)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet
        console.log('📝 Starting with empty local storage')
      } else {
        throw error
      }
    }
  }
  
  async clear(): Promise<void> {
    this.data.clear()
    this.isDirty = true
    
    // Delete file
    try {
      await fs.unlink(this.config.dataFile)
    } catch {
      // File might not exist
    }
    
    console.log('🗑️ Cleared local storage')
  }
  
  async health(): Promise<AdapterHealth> {
    const start = Date.now()
    
    try {
      // Test operations
      const testKey = '.health-check'
      await this.set(testKey, Date.now())
      await this.get(testKey)
      await this.delete(testKey)
      
      // Get file size
      const stats = await fs.stat(this.config.dataFile).catch(() => ({ size: 0 }))
      
      return {
        status: 'healthy',
        latency: Date.now() - start,
        storage: {
          used: stats.size,
          available: 1024 * 1024 * 100 // 100MB limit
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
        storage: { used: 0, available: 0 },
        error: (error as Error).message
      }
    }
  }
  
  // Helper methods
  private getNestedValue(path: string): any {
    return this.data.get(path)
  }
  
  private setNestedValue(path: string, value: any): void {
    this.data.set(path, value)
  }
  
  private deleteNestedValue(path: string): void {
    this.data.delete(path)
    
    // Also delete any nested paths
    const prefix = path + '/'
    for (const key of Array.from(this.data.keys())) {
      if (key.startsWith(prefix)) {
        this.data.delete(key)
      }
    }
  }
  
  private pathToObject(): any {
    const result: any = {}
    
    for (const [path, value] of this.data) {
      const parts = path.split('/')
      let current = result
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) {
          current[parts[i]] = {}
        }
        current = current[parts[i]]
      }
      
      current[parts[parts.length - 1]] = value
    }
    
    return result
  }
  
  private objectToPath(obj: any, prefix: string = ''): void {
    if (typeof obj !== 'object' || obj === null) {
      if (prefix) {
        this.data.set(prefix, obj)
      }
      return
    }
    
    for (const key in obj) {
      const path = prefix ? `${prefix}/${key}` : key
      const value = obj[key]
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recurse for nested objects
        this.objectToPath(value, path)
      } else {
        // Store primitive values and arrays
        this.data.set(path, value)
      }
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