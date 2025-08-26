/**
 * Main Dashboard Class
 * Orchestrates all dashboard components
 */

import { TUI, Screen, Component } from '@akaoio/tui';
import Gun from '@akaoio/gun';
import { NetworkMonitor } from './NetworkMonitor';
import { AgentTracker } from './AgentTracker';
import { MessageFeed } from './MessageFeed';
import { MetricsCollector } from './MetricsCollector';
import type { DashboardConfig, DashboardState } from './types';

export class Dashboard {
  private tui: TUI;
  private screen: Screen;
  private gun: Gun;
  private state: DashboardState;
  private components: Map<string, Component>;
  
  // Core components
  private networkMonitor: NetworkMonitor;
  private agentTracker: AgentTracker;
  private messageFeed: MessageFeed;
  private metricsCollector: MetricsCollector;
  
  constructor(config: DashboardConfig = {}) {
    // Initialize TUI
    this.tui = new TUI();
    this.screen = new Screen({
      title: config.title || 'AIR Living Agent Network Dashboard',
      width: config.width || process.stdout.columns || 80,
      height: config.height || process.stdout.rows || 24
    });
    
    // Initialize GUN with @akaoio/gun
    this.gun = Gun({
      peers: config.peers || ['https://air.akao.io:8765/gun'],
      localStorage: false,
      radisk: false,
      ...config.gunOptions
    });
    
    // Initialize state
    this.state = {
      agents: new Map(),
      messages: [],
      metrics: {
        messageCount: 0,
        agentCount: 0,
        uptime: 0,
        networkLatency: 0
      },
      startTime: Date.now(),
      isRunning: false
    };
    
    this.components = new Map();
    
    // Initialize core components
    this.networkMonitor = new NetworkMonitor(this.gun);
    this.agentTracker = new AgentTracker(this.gun);
    this.messageFeed = new MessageFeed(this.gun);
    this.metricsCollector = new MetricsCollector(this.gun);
    
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Agent updates
    this.agentTracker.on('agent:connected', (agent) => {
      this.state.agents.set(agent.id, agent);
      this.state.metrics.agentCount = this.state.agents.size;
      this.render();
    });
    
    this.agentTracker.on('agent:disconnected', (agentId) => {
      this.state.agents.delete(agentId);
      this.state.metrics.agentCount = this.state.agents.size;
      this.render();
    });
    
    // Message updates
    this.messageFeed.on('message', (message) => {
      this.state.messages.push(message);
      if (this.state.messages.length > 100) {
        this.state.messages.shift();
      }
      this.state.metrics.messageCount++;
      this.render();
    });
    
    // Network updates
    this.networkMonitor.on('latency', (latency) => {
      this.state.metrics.networkLatency = latency;
      this.render();
    });
    
    // Metrics updates
    this.metricsCollector.on('metrics', (metrics) => {
      Object.assign(this.state.metrics, metrics);
      this.render();
    });
  }
  
  public async start(): Promise<void> {
    this.state.isRunning = true;
    
    // Start all components
    await Promise.all([
      this.networkMonitor.start(),
      this.agentTracker.start(),
      this.messageFeed.start(),
      this.metricsCollector.start()
    ]);
    
    // Initial render
    this.render();
    
    // Setup refresh interval
    setInterval(() => {
      this.state.metrics.uptime = Math.floor((Date.now() - this.state.startTime) / 1000);
      this.render();
    }, 1000);
  }
  
  public stop(): void {
    this.state.isRunning = false;
    
    // Stop all components
    this.networkMonitor.stop();
    this.agentTracker.stop();
    this.messageFeed.stop();
    this.metricsCollector.stop();
  }
  
  private render(): void {
    if (!this.state.isRunning) return;
    
    // Clear screen
    console.clear();
    
    // Header
    this.renderHeader();
    
    // Stats bar
    this.renderStats();
    
    // Agent list
    this.renderAgents();
    
    // Message feed
    this.renderMessages();
    
    // Network status
    this.renderNetworkStatus();
  }
  
  private renderHeader(): void {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║         🌐 AIR Living Agent Network Dashboard                      ║');
    console.log('║         Powered by @akaoio/dashboard                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('');
  }
  
  private renderStats(): void {
    const { agentCount, messageCount, uptime, networkLatency } = this.state.metrics;
    console.log(`📊 Agents: ${agentCount}/34 | Messages: ${messageCount} | Uptime: ${uptime}s | Latency: ${networkLatency}ms`);
    console.log('');
  }
  
  private renderAgents(): void {
    console.log('🤖 Connected Agents:');
    if (this.state.agents.size === 0) {
      console.log('  ⏳ Waiting for agents...');
    } else {
      this.state.agents.forEach((agent) => {
        const status = agent.status === 'online' ? '🟢' : '⚫';
        console.log(`  ${status} ${agent.id} [${agent.team}] - ${agent.role}`);
      });
    }
    console.log('');
  }
  
  private renderMessages(): void {
    console.log('💬 Recent Messages:');
    const recentMessages = this.state.messages.slice(-5);
    if (recentMessages.length === 0) {
      console.log('  ⏳ No messages yet...');
    } else {
      recentMessages.forEach((msg) => {
        console.log(`  [${msg.timestamp}] ${msg.from}: ${msg.text}`);
      });
    }
    console.log('');
  }
  
  private renderNetworkStatus(): void {
    const status = this.state.metrics.networkLatency < 100 ? '🟢 Excellent' :
                   this.state.metrics.networkLatency < 500 ? '🟡 Good' : '🔴 Poor';
    console.log(`🌍 Network Status: ${status}`);
  }
  
  // Public API for external control
  public getState(): DashboardState {
    return { ...this.state };
  }
  
  public clearMessages(): void {
    this.state.messages = [];
    this.render();
  }
  
  public async connectAgent(agentId: string, agentData: any): Promise<void> {
    await this.agentTracker.registerAgent(agentId, agentData);
  }
  
  public async sendMessage(from: string, text: string, metadata?: any): Promise<void> {
    await this.messageFeed.broadcast(from, text, metadata);
  }
}