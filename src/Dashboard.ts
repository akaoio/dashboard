/**
 * @akaoio/dashboard - Universal Communication CLI
 * For BOTH humans and agents to communicate via AIR network
 * Uses @akaoio/tui for proper terminal UI
 */

import Gun from '@akaoio/gun';
import { color, Color, reset, Viewport } from '@akaoio/tui';
import readline from 'readline';
import type { DashboardConfig, DashboardState } from './types.js';

export interface AgentMode {
  id: string;
  team: string;
  role: string;
}

export interface MessageOptions {
  to?: string;
  team?: boolean;
}

export class Dashboard {
  private agentMode: AgentMode | null;
  private gun: any;
  private agents: Map<string, any>;
  private messageCount: number;
  private startTime: number;
  private rl: readline.Interface | null;
  private state: DashboardState;
  private viewport: any;

  constructor(config: DashboardConfig = {}) {
    this.agentMode = config.agentMode || null;
    
    // Initialize viewport for responsive terminal handling
    this.viewport = Viewport.getInstance();
    
    this.gun = Gun({
      peers: config.peers || ['https://air.akao.io:8765/gun'],
      localStorage: false,
      radisk: false,
      file: false,
      web: false,
      multicast: false,
      axe: false,
      ...config.gunOptions
    });
    
    this.agents = new Map();
    this.messageCount = 0;
    this.startTime = Date.now();
    this.rl = null;
    
    // Initialize state with terminal info
    const dims = this.viewport.getDimensions();
    const caps = this.viewport.getCapabilities();
    
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
      isRunning: false,
      terminal: {
        width: dims.width,
        height: dims.height,
        capabilities: caps
      }
    };
    
    // Handle terminal resize events
    this.viewport.onResize((newDims) => {
      this.state.terminal = {
        width: newDims.width,
        height: newDims.height,
        capabilities: this.viewport.getCapabilities()
      };
      this.handleResize();
    });
  }
  
  // CLI mode for agents
  sendAgentMessage(message: string, options: MessageOptions = {}): void {
    const agentId = this.agentMode!.id;
    const team = this.agentMode!.team;
    
    if (options.to) {
      // Direct message
      this.gun.get('agents').get(options.to).get('inbox').get(Date.now()).put({
        from: agentId,
        to: options.to,
        message: message,
        timestamp: Date.now()
      });
      console.log(`➡️ Sent to ${options.to}: ${message}`);
      
    } else if (options.team) {
      // Team broadcast
      this.gun.get('teams').get(team).get('messages').get(Date.now()).put({
        from: agentId,
        message: message,
        timestamp: Date.now()
      });
      console.log(`📣 Broadcast to team ${team}: ${message}`);
      
    } else {
      // Global broadcast
      const msg = {
        from: agentId,
        team: team,
        message: message,
        timestamp: Date.now()
      };
      
      this.gun.get('broadcast').get(Date.now()).put(msg);
      this.gun.get('air-dashboard').get('messages').get(Date.now()).put(msg);
      console.log(`🌐 Global broadcast: ${message}`);
    }
    
    process.exit(0);
  }
  
  // Monitor mode - just watch
  async start(): Promise<void> {
    this.state.isRunning = true;
    console.clear();
    this.printHeader();
    
    // Monitor agents
    this.gun.get('agents').map().on((data: any, key: string) => {
      if (data && key) {
        this.agents.set(key, data);
        this.state.agents.set(key, data);
        this.state.metrics.agentCount = this.agents.size;
        this.render();
      }
    });
    
    // Monitor all messages
    this.gun.get('air-dashboard').get('messages').map().on((data: any) => {
      if (data && data.from && data.message) {
        this.messageCount++;
        this.state.metrics.messageCount = this.messageCount;
        this.state.messages.push({
          from: data.from,
          text: data.message,
          timestamp: new Date().toLocaleTimeString()
        });
        if (this.state.messages.length > 100) {
          this.state.messages.shift();
        }
        this.logMessage(data.from, data.message, data.team);
      }
    });
    
    // Monitor broadcasts
    this.gun.get('broadcast').map().on((data: any) => {
      if (data && data.from && data.message) {
        this.messageCount++;
        this.state.metrics.messageCount = this.messageCount;
        this.logMessage(data.from, data.message, data.team || 'broadcast');
      }
    });
    
    // Update uptime
    setInterval(() => {
      this.state.metrics.uptime = Math.floor((Date.now() - this.startTime) / 1000);
      this.render();
    }, 1000);
    
    this.render();
  }
  
  // Interactive mode for humans
  startInteractive(): void {
    if (this.agentMode) {
      this.startAgentInteractive();
    } else {
      this.startHumanInteractive();
    }
  }
  
  private startHumanInteractive(): void {
    console.clear();
    this.printHeader();
    console.log('');
    console.log('📡 Connecting to AIR network...');
    console.log('Type your message and press Enter. Type /help for commands.\n');
    
    // Monitor agents
    this.gun.get('agents').map().on((data: any, key: string) => {
      if (data && key) {
        this.agents.set(key, data);
        this.render();
      }
    });
    
    // Monitor messages
    this.gun.get('air-dashboard').get('messages').map().on((data: any) => {
      if (data && data.from && data.message) {
        this.messageCount++;
        this.logMessage(data.from, data.message, data.team);
      }
    });
    
    // Setup input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });
    
    this.rl.prompt();
    
    this.rl.on('line', (line: string) => {
      const cmd = line.trim();
      
      if (cmd === '/help') {
        console.log('\nCommands:');
        console.log('  /to <agent> <message>  - Send direct message');
        console.log('  /team <team> <message> - Broadcast to team');
        console.log('  /agents               - List online agents');
        console.log('  /clear                - Clear screen');
        console.log('  /exit                 - Exit dashboard\n');
        
      } else if (cmd.startsWith('/to ')) {
        const parts = cmd.substring(4).split(' ');
        const target = parts[0];
        const msg = parts.slice(1).join(' ');
        this.sendHumanMessage(msg, { to: target });
        
      } else if (cmd.startsWith('/team ')) {
        const parts = cmd.substring(6).split(' ');
        const team = parts[0];
        const msg = parts.slice(1).join(' ');
        this.sendHumanMessage(msg, { team: true });
        
      } else if (cmd === '/agents') {
        console.log('\n📊 Online Agents:');
        this.agents.forEach((data, id) => {
          console.log(`  ${id} (${data.team}): ${data.status}`);
        });
        console.log('');
        
      } else if (cmd === '/clear') {
        console.clear();
        
      } else if (cmd === '/exit') {
        console.log('\n👋 Goodbye!');
        process.exit(0);
        
      } else if (cmd) {
        // Default to global broadcast
        this.sendHumanMessage(cmd);
      }
      
      this.rl!.prompt();
    });
    
    this.rl.on('SIGINT', () => {
      console.log('\n👋 Dashboard shutting down...');
      process.exit(0);
    });
  }
  
  private startAgentInteractive(): void {
    // Agent interactive mode - listen and respond
    console.log(`🤖 ${this.agentMode!.id} connected to AIR network`);
    console.log('Listening for messages...\n');
    
    // Register agent
    this.gun.get('agents').get(this.agentMode!.id).put({
      team: this.agentMode!.team,
      role: this.agentMode!.role,
      status: 'online',
      timestamp: Date.now()
    });
    
    // Listen for direct messages
    this.gun.get('agents').get(this.agentMode!.id).get('inbox').map().on((msg: any) => {
      if (msg && msg.from && msg.message) {
        console.log(`📨 Direct from ${msg.from}: ${msg.message}`);
        
        // Auto-respond
        if (msg.message.includes('status')) {
          this.sendAgentMessage(`Status: Online and operational`, { to: msg.from });
        }
      }
    });
    
    // Listen for team messages
    this.gun.get('teams').get(this.agentMode!.team).get('messages').map().on((msg: any) => {
      if (msg && msg.from !== this.agentMode!.id) {
        console.log(`📢 Team ${this.agentMode!.team} from ${msg.from}: ${msg.message}`);
      }
    });
    
    // Keep running
    setInterval(() => {
      process.stdout.write('.');
    }, 10000);
  }
  
  private sendHumanMessage(message: string, options: MessageOptions = {}): void {
    const msg = {
      from: 'human',
      message: message,
      team: options.team ? 'dashboard' : undefined,
      timestamp: Date.now()
    };
    
    if (options.to) {
      // Direct message
      this.gun.get('agents').get(options.to).get('inbox').get(Date.now()).put({
        from: 'human',
        to: options.to,
        message: message,
        timestamp: Date.now()
      });
      console.log(`➡️ Sent to ${options.to}: ${message}`);
    } else {
      // Broadcast
      this.gun.get('air-dashboard').get('messages').get(Date.now()).put(msg);
      console.log(`🌐 Broadcast: ${message}`);
    }
  }
  
  private render(): void {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const dims = this.viewport.getDimensions();
    const breakpoint = this.viewport.getBreakpoint();
    
    // Adaptive status line based on terminal size
    let statusLine;
    if (dims.width < 60) {
      // Compact mobile view
      statusLine = `📊 ${this.agents.size}/34 | ${this.messageCount}msg | ${uptime}s >`;
    } else if (dims.width < 100) {
      // Standard view
      statusLine = `📊 Agents: ${this.agents.size}/34 | Messages: ${this.messageCount} | ${uptime}s >`;
    } else {
      // Extended view with terminal info
      const caps = this.viewport.getCapabilities();
      const terminalInfo = caps.terminalProgram ? ` | ${caps.terminalProgram}` : '';
      statusLine = `📊 Agents: ${this.agents.size}/34 | Messages: ${this.messageCount} | Uptime: ${uptime}s | Terminal: ${dims.width}×${dims.height} (${breakpoint})${terminalInfo} >`;
    }
    
    process.stdout.write(`\r${statusLine}`);
  }
  
  private handleResize(): void {
    // Clear screen and re-render on resize
    console.clear();
    this.printHeader();
    this.render();
  }
  
  private printHeader(): void {
    const dims = this.viewport.getDimensions();
    const caps = this.viewport.getCapabilities();
    
    // Responsive header based on terminal size
    if (dims.width < 60) {
      // Mobile header
      console.log('🌐 AIR Dashboard');
      console.log('air.akao.io:8765');
    } else {
      // Full header
      const borderLength = Math.min(dims.width, 70);
      const border = '═'.repeat(borderLength);
      console.log('╔' + border + '╗');
      console.log('║            🌐 AIR Living Agent Network Dashboard                    ║');
      console.log('║                  https://air.akao.io:8765/gun                      ║');
      console.log('╚' + border + '╝');
    }
    
    console.log('');
    
    // Show terminal capabilities in debug mode
    if (process.env.DEBUG?.includes('dashboard')) {
      console.log(`🖥️  Terminal: ${dims.width}×${dims.height}, ${caps.terminalProgram || 'Unknown'}, Breakpoint: ${this.viewport.getBreakpoint()}`);
    }
    
    console.log('📡 Monitoring AIR network (read-only)...\n');
  }
  
  private logMessage(from: string, message: string, team?: string): void {
    const time = new Date().toLocaleTimeString();
    let coloredMessage: string;
    
    // Use @akaoio/tui color functions for team colors
    if (team === 'meta') {
      coloredMessage = `${color.call(this, Color.Magenta)}[${time}] ${from}: ${message}${reset()}`;
    } else if (team === 'core-fix') {
      coloredMessage = `${color.call(this, Color.Red)}[${time}] ${from}: ${message}${reset()}`;
    } else if (team === 'security') {
      coloredMessage = `${color.call(this, Color.Yellow)}[${time}] ${from}: ${message}${reset()}`;
    } else if (team === 'air' || team === 'team-air') {
      coloredMessage = `${color.call(this, Color.Cyan)}[${time}] ${from}: ${message}${reset()}`;
    } else {
      coloredMessage = `${color.call(this, Color.White)}[${time}] ${from}: ${message}${reset()}`;
    }
    
    console.log('\n' + coloredMessage);
    this.render();
  }
  
  // Public API methods
  public stop(): void {
    this.state.isRunning = false;
    if (this.rl) {
      this.rl.close();
    }
  }
  
  public getState(): DashboardState {
    return { ...this.state };
  }
  
  public clearMessages(): void {
    this.state.messages = [];
    this.messageCount = 0;
    this.state.metrics.messageCount = 0;
    this.render();
  }
  
  public async connectAgent(agentId: string, agentData: any): Promise<void> {
    this.gun.get('agents').get(agentId).put({
      ...agentData,
      timestamp: Date.now()
    });
  }
  
  public async sendMessage(from: string, text: string, metadata?: any): Promise<void> {
    const msg = {
      from: from,
      message: text,
      ...metadata,
      timestamp: Date.now()
    };
    
    this.gun.get('air-dashboard').get('messages').get(Date.now()).put(msg);
  }
}

export default Dashboard;