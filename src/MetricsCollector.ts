/**
 * Metrics Collector Component
 * Collects and aggregates system metrics
 */

import { EventEmitter } from 'events';
import Gun from '@akaoio/gun';
import type { Metrics } from './types';

export class MetricsCollector extends EventEmitter {
  private gun: Gun;
  private metricsChannel: any;
  private metrics: Metrics;
  private collectInterval?: NodeJS.Timeout;
  
  constructor(gun: Gun) {
    super();
    this.gun = gun;
    this.metricsChannel = this.gun.get('metrics');
    this.metrics = {
      messageCount: 0,
      agentCount: 0,
      uptime: 0,
      networkLatency: 0,
      messagesPerSecond: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeConnections: 0,
      totalDataTransferred: 0,
      errorCount: 0
    };
  }
  
  async start(): Promise<void> {
    // Monitor metrics channel
    this.metricsChannel.map().on((data: any, key: string) => {
      if (data && key) {
        this.updateMetrics(key, data);
      }
    });
    
    // Start collection interval
    this.collectInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000);
    
    // Initial collection
    this.collectMetrics();
  }
  
  stop(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
    }
    this.removeAllListeners();
  }
  
  private collectMetrics(): void {
    // Collect process metrics
    const usage = process.memoryUsage();
    this.metrics.memoryUsage = Math.round(usage.heapUsed / 1024 / 1024); // MB
    
    // CPU usage (simplified)
    if (process.cpuUsage) {
      const cpuUsage = process.cpuUsage();
      this.metrics.cpuUsage = Math.round((cpuUsage.user + cpuUsage.system) / 1000000); // seconds
    }
    
    // Emit collected metrics
    this.emit('metrics', this.metrics);
    
    // Publish to network
    this.publishMetrics();
  }
  
  private async publishMetrics(): Promise<void> {
    const timestamp = Date.now();
    
    await new Promise((resolve, reject) => {
      this.metricsChannel.get('dashboard').get(timestamp.toString()).put({
        ...this.metrics,
        timestamp,
        source: 'dashboard'
      }, (ack: any) => {
        if (ack.err) reject(ack.err);
        else resolve(ack);
      });
    });
  }
  
  private updateMetrics(key: string, value: any): void {
    switch (key) {
      case 'messageCount':
        this.metrics.messageCount = value;
        break;
      case 'agentCount':
        this.metrics.agentCount = value;
        break;
      case 'networkLatency':
        this.metrics.networkLatency = value;
        break;
      case 'errorCount':
        this.metrics.errorCount = value;
        break;
      default:
        // Handle dynamic metrics
        if (typeof value === 'number') {
          (this.metrics as any)[key] = value;
        }
    }
  }
  
  incrementMessageCount(): void {
    this.metrics.messageCount++;
    this.emit('metrics:updated', { messageCount: this.metrics.messageCount });
  }
  
  incrementErrorCount(): void {
    this.metrics.errorCount++;
    this.emit('metrics:updated', { errorCount: this.metrics.errorCount });
  }
  
  updateAgentCount(count: number): void {
    this.metrics.agentCount = count;
    this.emit('metrics:updated', { agentCount: count });
  }
  
  updateNetworkLatency(latency: number): void {
    this.metrics.networkLatency = latency;
    this.emit('metrics:updated', { networkLatency: latency });
  }
  
  getMetrics(): Metrics {
    return { ...this.metrics };
  }
  
  resetMetrics(): void {
    this.metrics = {
      messageCount: 0,
      agentCount: 0,
      uptime: 0,
      networkLatency: 0,
      messagesPerSecond: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeConnections: 0,
      totalDataTransferred: 0,
      errorCount: 0
    };
    this.emit('metrics:reset');
  }
}