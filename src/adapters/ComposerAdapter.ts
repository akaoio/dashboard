/**
 * Composer Memory Adapter for Dashboard
 * Uses @akaoio/composer for YAML, JSON, MD file handling
 * Provides atomic document composition and template rendering
 */

import { BaseMemoryAdapter, AdapterHealth } from './MemoryAdapter.js'
import fs from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'
import { watch } from 'chokidar'

interface ComposerConfig {
  dataDir: string
  atomsDir?: string
  templatesDir?: string
  outputDir?: string
  watchFiles?: boolean
}

export class ComposerAdapter extends BaseMemoryAdapter {
  name = 'composer'
  version = '1.0.0'
  
  private config: ComposerConfig
  private data: Map<string, any> = new Map()
  private watchers: Map<string, any> = new Map()
  private pollingIntervals: Map<string, NodeJS.Timer> = new Map()
  
  constructor(config?: Partial<ComposerConfig>) {
    super()
    this.config = {
      dataDir: path.join(process.cwd(), 'data'),
      atomsDir: path.join(process.cwd(), 'data', 'atoms'),
      templatesDir: path.join(process.cwd(), 'data', 'templates'),
      outputDir: path.join(process.cwd(), 'data', 'output'),
      watchFiles: true,
      ...config
    }
  }
  
  async connect(): Promise<void> {
    // Create necessary directories
    await this.ensureDirectories()
    
    // Load existing data
    await this.load()
    
    // Setup file watchers if enabled
    if (this.config.watchFiles) {
      this.setupWatchers()
    }
    
    this.ready = true
    console.log('✅ Composer adapter connected')
  }
  
  async disconnect(): Promise<void> {
    // Stop all watchers
    for (const watcher of this.watchers.values()) {
      await watcher.close()
    }
    this.watchers.clear()
    
    // Stop polling intervals
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval)
    }
    this.pollingIntervals.clear()
    
    // Save final state
    await this.save()
    
    this.ready = false
    console.log('🔌 Composer adapter disconnected')
  }
  
  isConnected(): boolean {
    return this.ready
  }
  
  async get(path: string): Promise<any> {
    // Check in-memory cache first
    if (this.data.has(path)) {
      return this.data.get(path)
    }
    
    // Try to load from file
    const filePath = this.pathToFile(path)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const data = this.parseFile(filePath, content)
      this.data.set(path, data)
      return data
    } catch (error) {
      return undefined
    }
  }
  
  async set(pathKey: string, value: any): Promise<void> {
    // Store in memory
    this.data.set(pathKey, value)
    
    // Persist to file
    const filePath = this.pathToFile(pathKey)
    await this.ensureDir(path.dirname(filePath))
    
    const content = this.serializeFile(filePath, value)
    await fs.writeFile(filePath, content, 'utf8')
    
    // Notify subscribers
    this.notifySubscribers(pathKey, value)
  }
  
  async delete(path: string): Promise<void> {
    this.data.delete(path)
    
    const filePath = this.pathToFile(path)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      // File might not exist
    }
    
    this.notifySubscribers(path, undefined)
  }
  
  async exists(path: string): Promise<boolean> {
    if (this.data.has(path)) {
      return true
    }
    
    const filePath = this.pathToFile(path)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
  
  async list(prefix: string): Promise<string[]> {
    const results: string[] = []
    
    // From memory
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        results.push(key)
      }
    }
    
    // From filesystem
    const dirPath = this.pathToFile(prefix)
    try {
      const files = await this.walkDir(dirPath)
      for (const file of files) {
        const key = this.fileToPath(file)
        if (!results.includes(key)) {
          results.push(key)
        }
      }
    } catch {
      // Directory might not exist
    }
    
    return results.sort()
  }
  
  async query(filter: any): Promise<any[]> {
    const results: any[] = []
    
    for (const [key, value] of this.data) {
      if (this.matchesFilter(value, filter)) {
        results.push({ key, value })
      }
    }
    
    return results
  }
  
  async publish(channel: string, message: any): Promise<void> {
    // Store message in channel history
    const channelPath = `channels/${channel}/messages`
    const messages = (await this.get(channelPath)) || []
    messages.push({
      ...message,
      timestamp: Date.now()
    })
    
    // Keep only last 1000 messages
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000)
    }
    
    await this.set(channelPath, messages)
    
    // Notify channel subscribers
    this.notifySubscribers(`channel:${channel}`, message)
  }
  
  async save(): Promise<void> {
    // Save entire memory state to a snapshot file
    const snapshot = {
      version: this.version,
      timestamp: Date.now(),
      data: Object.fromEntries(this.data)
    }
    
    const snapshotPath = path.join(this.config.dataDir, '.snapshot.json')
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
  }
  
  async load(): Promise<void> {
    // Load snapshot if exists
    const snapshotPath = path.join(this.config.dataDir, '.snapshot.json')
    try {
      const content = await fs.readFile(snapshotPath, 'utf8')
      const snapshot = JSON.parse(content)
      
      // Restore data
      this.data = new Map(Object.entries(snapshot.data))
      console.log(`📂 Loaded ${this.data.size} entries from snapshot`)
    } catch {
      // No snapshot, scan directories
      await this.scanDataDir()
    }
  }
  
  async clear(): Promise<void> {
    this.data.clear()
    
    // Clear all files in data directory
    try {
      const files = await this.walkDir(this.config.dataDir)
      for (const file of files) {
        await fs.unlink(file)
      }
    } catch {
      // Directory might not exist
    }
  }
  
  async health(): Promise<AdapterHealth> {
    const start = Date.now()
    
    try {
      // Test write/read
      const testKey = '.health-check'
      await this.set(testKey, { timestamp: Date.now() })
      await this.get(testKey)
      await this.delete(testKey)
      
      const stats = await fs.stat(this.config.dataDir)
      
      return {
        status: 'healthy',
        latency: Date.now() - start,
        storage: {
          used: this.data.size * 1024, // Rough estimate
          available: 1024 * 1024 * 1024 // 1GB placeholder
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
  
  // Composer-specific features (simplified without direct Template usage)
  async renderTemplate(templateName: string, data: any): Promise<string> {
    // Load template file and render with data
    const templatePath = path.join(this.config.templatesDir!, `${templateName}.hbs`)
    try {
      const template = await fs.readFile(templatePath, 'utf8')
      // Simple template replacement (basic implementation)
      let result = template
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{${key}}}`, 'g')
        result = result.replace(regex, String(value))
      }
      return result
    } catch (error) {
      throw new Error(`Template ${templateName} not found`)
    }
  }
  
  async composeDocument(atoms: string[]): Promise<any> {
    // Load and merge atom files
    const composed: any = {}
    
    for (const atomName of atoms) {
      const atomPath = path.join(this.config.atomsDir!, `${atomName}.yaml`)
      try {
        const content = await fs.readFile(atomPath, 'utf8')
        const data = yaml.load(content) as any
        Object.assign(composed, data)
      } catch (error) {
        console.warn(`Atom ${atomName} not found`)
      }
    }
    
    return composed
  }
  
  // Helper methods
  private pathToFile(key: string): string {
    // Convert path to file path
    // e.g., "workrooms/global/config" -> "data/workrooms/global/config.yaml"
    const parts = key.split('/')
    const filename = parts.pop()
    const dir = parts.join('/')
    
    return path.join(this.config.dataDir, dir, `${filename}.yaml`)
  }
  
  private fileToPath(filePath: string): string {
    // Convert file path to key
    const relative = path.relative(this.config.dataDir, filePath)
    const withoutExt = relative.replace(/\.(yaml|yml|json|md)$/, '')
    return withoutExt.replace(/\\/g, '/')
  }
  
  private parseFile(filePath: string, content: string): any {
    const ext = path.extname(filePath).toLowerCase()
    
    switch (ext) {
      case '.json':
        return JSON.parse(content)
      case '.yaml':
      case '.yml':
        return yaml.load(content)
      case '.md':
        // Extract frontmatter and content
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/)
        if (match) {
          return {
            metadata: yaml.load(match[1]),
            content: match[2]
          }
        }
        return { content }
      default:
        return content
    }
  }
  
  private serializeFile(filePath: string, value: any): string {
    const ext = path.extname(filePath).toLowerCase()
    
    switch (ext) {
      case '.json':
        return JSON.stringify(value, null, 2)
      case '.yaml':
      case '.yml':
        return yaml.dump(value, { indent: 2 })
      case '.md':
        if (value.metadata && value.content) {
          const frontmatter = yaml.dump(value.metadata, { indent: 2 })
          return `---\n${frontmatter}---\n${value.content}`
        }
        return value.content || String(value)
      default:
        return String(value)
    }
  }
  
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.dataDir,
      this.config.atomsDir!,
      this.config.templatesDir!,
      this.config.outputDir!
    ]
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true })
    }
  }
  
  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
  }
  
  private async walkDir(dir: string): Promise<string[]> {
    const files: string[] = []
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          const subFiles = await this.walkDir(fullPath)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          files.push(fullPath)
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    return files
  }
  
  private async scanDataDir(): Promise<void> {
    const files = await this.walkDir(this.config.dataDir)
    
    for (const file of files) {
      // Skip hidden files and snapshots
      if (path.basename(file).startsWith('.')) continue
      
      try {
        const content = await fs.readFile(file, 'utf8')
        const data = this.parseFile(file, content)
        const key = this.fileToPath(file)
        this.data.set(key, data)
      } catch (error) {
        console.warn(`Failed to load ${file}:`, error)
      }
    }
    
    console.log(`📂 Scanned ${this.data.size} files from data directory`)
  }
  
  private setupWatchers(): void {
    if (!this.config.watchFiles) return
    
    const watcher = watch(this.config.dataDir, {
      ignored: /(^|[\/\\])\../, // Ignore dot files
      persistent: true,
      ignoreInitial: true
    })
    
    watcher
      .on('add', (filePath) => this.onFileAdded(filePath))
      .on('change', (filePath) => this.onFileChanged(filePath))
      .on('unlink', (filePath) => this.onFileRemoved(filePath))
    
    this.watchers.set('main', watcher)
  }
  
  private async onFileAdded(filePath: string): Promise<void> {
    const key = this.fileToPath(filePath)
    const content = await fs.readFile(filePath, 'utf8')
    const data = this.parseFile(filePath, content)
    
    this.data.set(key, data)
    this.notifySubscribers(key, data)
  }
  
  private async onFileChanged(filePath: string): Promise<void> {
    const key = this.fileToPath(filePath)
    const content = await fs.readFile(filePath, 'utf8')
    const data = this.parseFile(filePath, content)
    
    this.data.set(key, data)
    this.notifySubscribers(key, data)
  }
  
  private onFileRemoved(filePath: string): void {
    const key = this.fileToPath(filePath)
    this.data.delete(key)
    this.notifySubscribers(key, undefined)
  }
  
  private matchesFilter(value: any, filter: any): boolean {
    // Simple filter matching
    for (const [key, expected] of Object.entries(filter)) {
      if (value[key] !== expected) {
        return false
      }
    }
    return true
  }
  
  protected startPolling(path: string): void {
    if (this.pollingIntervals.has(path)) return
    
    // Poll every 5 seconds for changes
    const interval = setInterval(async () => {
      const value = await this.get(path)
      this.notifySubscribers(path, value)
    }, 5000)
    
    this.pollingIntervals.set(path, interval)
  }
  
  protected stopPolling(path: string): void {
    const interval = this.pollingIntervals.get(path)
    if (interval) {
      clearInterval(interval)
      this.pollingIntervals.delete(path)
    }
  }
}