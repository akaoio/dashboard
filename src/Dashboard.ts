/**
 * @akaoio/dashboard - Universal Communication CLI
 * For BOTH humans and agents to communicate via AIR network
 * Uses blessed for professional terminal UI
 */

import Gun from '@akaoio/gun';
import readline from 'readline';
import blessed from 'blessed';
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
  private screen: blessed.Widgets.Screen;
  private agentList: blessed.Widgets.ListElement;
  private messageLog: blessed.Widgets.LogElement;
  private statusBar: blessed.Widgets.BoxElement;

  constructor(config: DashboardConfig = {}) {
    this.agentMode = config.agentMode || null;
    
    // Initialize blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'AIR Dashboard'
    });
    
    // Create UI components
    this.setupUI();
    
    // Connect directly to remote GUN network - no local server
    const gunConfig = {
      peers: config.peers || ['https://air.akao.io:8765/gun'],
      localStorage: false,
      radisk: false,
      file: false,
      web: false,
      multicast: false,
      axe: false
    };
    
    console.log('🔧 DEBUG: Creating GUN instance with config:', gunConfig);
    this.gun = Gun(gunConfig);
    
    // Add connection debug
    this.gun.on('hi', (peer: any) => {
      console.log('🔧 DEBUG: GUN peer connected:', peer);
    });
    
    this.gun.on('bye', (peer: any) => {
      console.log('🔧 DEBUG: GUN peer disconnected:', peer);
    });
    
    this.agents = new Map();
    this.messageCount = 0;
    this.startTime = Date.now();
    this.rl = null;
    
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
      isRunning: false,
      terminal: {
        width: process.stdout.columns || 80,
        height: process.stdout.rows || 24,
        capabilities: { terminalProgram: process.env.TERM || 'unknown' }
      }
    };
    
    // Handle screen resize
    this.screen.on('resize', () => {
      this.render();
    });
    
    // Handle exit
    this.screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });
  }
  
  private setupUI(): void {
    // Status bar at top
    this.statusBar = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: 'AIR Dashboard - Connecting...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: '#f0f0f0'
        }
      }
    });
    
    // Agent list on left
    this.agentList = blessed.list({
      label: 'Active Agents',
      top: 3,
      left: 0,
      width: '50%',
      height: '80%',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: '#f0f0f0'
        },
        selected: {
          bg: 'blue'
        }
      },
      keys: true,
      vi: true
    });
    
    // Message log on right
    this.messageLog = blessed.log({
      label: 'Messages',
      top: 3,
      left: '50%',
      width: '50%',
      height: '80%',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: '#f0f0f0'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });
    
    // Help text at bottom
    const helpBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: 'Keys: [q/ESC] Exit, [↑/↓] Navigate agents, [Mouse] Scroll messages',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'cyan',
        bg: 'black',
        border: {
          fg: '#f0f0f0'
        }
      }
    });
    
    // Append all widgets to screen
    this.screen.append(this.statusBar);
    this.screen.append(this.agentList);
    this.screen.append(this.messageLog);
    this.screen.append(helpBox);
    
    // Initial render
    this.screen.render();
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
    
    // Show initial connecting status
    this.statusBar.setContent('{center}📡 Connecting to AIR network...{/center}');
    this.messageLog.log('Connecting to remote AIR network...');
    this.screen.render();
    
    // Wait for peer connection before loading data
    let peerConnected = false;
    this.gun.on('hi', (peer: any) => {
      this.messageLog.log('GUN peer connected');
      peerConnected = true;
      
      // Now load existing data after connection is established
      setTimeout(() => {
        this.loadExistingData();
      }, 1000); // Give 1 second for graph sync
    });
    
    // Fallback: load data after 3 seconds even if no peer event
    setTimeout(() => {
      if (!peerConnected) {
        this.messageLog.log('No peer event received, loading data anyway...');
        this.loadExistingData();
      }
    }, 3000);
    
    this.setupRealtimeListeners();
    
    // Start the uptime counter
    setInterval(() => {
      this.state.metrics.uptime = Math.floor((Date.now() - this.startTime) / 1000);
      this.render();
    }, 1000);
    
    this.render();
  }
  
  private loadExistingData(): void {
    console.log('🔧 DEBUG: Loading existing data...');
    
    // Try direct access to test if the problem is with the callback firing
    const agentsRef = this.gun.get('agents');
    const messagesRef = this.gun.get('air-dashboard').get('messages');
    const broadcastRef = this.gun.get('broadcast');
    
    console.log('🔧 DEBUG: Created references, now setting up .once() callbacks...');
    
    // Load existing agents with better error handling
    agentsRef.once((data: any, key: string) => {
      console.log('🔧 DEBUG: agents .once() callback fired! key:', key, 'data:', data ? 'present' : 'null');
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(k => {
          if (k !== '_' && data[k] && typeof data[k] === 'object') {
            this.agents.set(k, data[k]);
            this.state.agents.set(k, data[k]);
          }
        });
        this.state.metrics.agentCount = this.agents.size;
        console.log('🔧 DEBUG: Loaded', this.agents.size, 'existing agents');
        this.render();
      } else {
        console.log('🔧 DEBUG: No existing agents found or data is not an object');
      }
    }, { wait: 0 }); // Force immediate execution
    
    // Load existing air-dashboard messages
    messagesRef.once((data: any, key: string) => {
      console.log('🔧 DEBUG: air-dashboard messages .once() callback fired! key:', key, 'data:', data ? 'present' : 'null');
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(k => {
          if (k !== '_' && data[k] && data[k].from && data[k].message) {
            this.messageCount++;
            this.state.metrics.messageCount = this.messageCount;
            this.state.messages.push({
              from: data[k].from,
              text: data[k].message,
              timestamp: new Date().toLocaleTimeString()
            });
            this.logMessage(data[k].from, data[k].message, data[k].team);
          }
        });
        console.log('🔧 DEBUG: Loaded', this.messageCount, 'existing air-dashboard messages');
        this.render();
      } else {
        console.log('🔧 DEBUG: No existing air-dashboard messages found or data is not an object');
      }
    }, { wait: 0 });
    
    // Load existing broadcast messages
    broadcastRef.once((data: any, key: string) => {
      console.log('🔧 DEBUG: broadcast .once() callback fired! key:', key, 'data:', data ? 'present' : 'null');
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(k => {
          if (k !== '_' && data[k] && data[k].from && data[k].message) {
            this.messageCount++;
            this.state.metrics.messageCount = this.messageCount;
            this.logMessage(data[k].from, data[k].message, data[k].team || 'broadcast');
          }
        });
        console.log('🔧 DEBUG: Loaded existing broadcast messages, total:', this.messageCount);
        this.render();
      } else {
        console.log('🔧 DEBUG: No existing broadcast messages found or data is not an object');
      }
    }, { wait: 0 });
    
    console.log('🔧 DEBUG: All .once() callbacks have been set up');
  }
  
  private setupRealtimeListeners(): void {
    console.log('🔧 DEBUG: Setting up real-time listeners...');
    
    // Try simple .on() listeners instead of .map().on() for broader detection
    this.gun.get('broadcast').on((data: any, key: string) => {
      console.log('🔧 DEBUG: broadcast .on() listener fired! key:', key, 'data:', data ? 'present' : 'null');
      if (data && typeof data === 'object') {
        // Iterate through all properties of broadcast
        Object.keys(data).forEach(k => {
          if (k !== '_' && data[k] && data[k].from && data[k].message) {
            console.log('🔧 DEBUG: Found broadcast message:', k, data[k]);
            this.messageCount++;
            this.state.metrics.messageCount = this.messageCount;
            this.logMessage(data[k].from, data[k].message, data[k].team || 'broadcast');
          }
        });
      }
    });
    
    this.gun.get('air-dashboard').get('messages').on((data: any, key: string) => {
      console.log('🔧 DEBUG: air-dashboard messages .on() listener fired! key:', key, 'data:', data ? 'present' : 'null');
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(k => {
          if (k !== '_' && data[k] && data[k].from && data[k].message) {
            console.log('🔧 DEBUG: Found air-dashboard message:', k, data[k]);
            this.messageCount++;
            this.state.metrics.messageCount = this.messageCount;
            this.state.messages.push({
              from: data[k].from,
              text: data[k].message,
              timestamp: new Date().toLocaleTimeString()
            });
            if (this.state.messages.length > 100) {
              this.state.messages.shift();
            }
            this.logMessage(data[k].from, data[k].message, data[k].team);
          }
        });
      }
    });
    
    // Also keep the map listeners as backup
    this.gun.get('agents').map().on((data: any, key: string) => {
      if (data && key && !this.agents.has(key)) {
        console.log('🔧 DEBUG: New agent via .map():', key, data);
        this.agents.set(key, data);
        this.state.agents.set(key, data);
        this.state.metrics.agentCount = this.agents.size;
        this.render();
      }
    });
    
    this.gun.get('air-dashboard').get('messages').map().on((data: any, key: string) => {
      if (data && data.from && data.message) {
        console.log('🔧 DEBUG: New air-dashboard message via .map():', key, data);
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
    
    this.gun.get('broadcast').map().on((data: any, key: string) => {
      if (data && data.from && data.message) {
        console.log('🔧 DEBUG: New broadcast message via .map():', key, data);
        this.messageCount++;
        this.state.metrics.messageCount = this.messageCount;
        this.logMessage(data.from, data.message, data.team || 'broadcast');
      }
    });
    
    console.log('🔧 DEBUG: All real-time listeners set up (.on() + .map().on())');
  }
  
  // Interactive mode for humans
  startInteractive(): void {
    if (this.agentMode) {
      this.startAgentInteractive();
    } else {
      this.startHumanInteractive();
    }
  }
  
  private printHeader(): void {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║            🌐 AIR Living Agent Network Dashboard            ║');
    console.log('║                  https://air.akao.io:8765/gun                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
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
    
    // Update status bar
    const statusText = `{center}🌐 AIR Dashboard | Agents: ${this.agents.size}/34 | Messages: ${this.messageCount} | Uptime: ${uptime}s{/center}`;
    this.statusBar.setContent(statusText);
    
    // Update agent list
    const agentItems = Array.from(this.agents.entries()).map(([id, data]) => {
      const status = data.status || 'unknown';
      const team = data.team || 'none';
      return `${id} (${team}) - ${status}`;
    });
    this.agentList.setItems(agentItems);
    
    // Render screen
    this.screen.render();
  }
  
  
  private logMessage(from: string, message: string, team?: string): void {
    const time = new Date().toLocaleTimeString();
    let coloredMessage: string;
    
    // Blessed color tags for team colors
    if (team === 'meta') {
      coloredMessage = `{magenta-fg}[${time}] ${from}: ${message}{/magenta-fg}`;
    } else if (team === 'core-fix') {
      coloredMessage = `{red-fg}[${time}] ${from}: ${message}{/red-fg}`;
    } else if (team === 'security') {
      coloredMessage = `{yellow-fg}[${time}] ${from}: ${message}{/yellow-fg}`;
    } else if (team === 'air' || team === 'team-air') {
      coloredMessage = `{cyan-fg}[${time}] ${from}: ${message}{/cyan-fg}`;
    } else {
      coloredMessage = `{white-fg}[${time}] ${from}: ${message}{/white-fg}`;
    }
    
    // Add message to blessed log
    this.messageLog.log(coloredMessage);
    this.render();
  }
  
  // Public API methods
  public stop(): void {
    this.state.isRunning = false;
    if (this.rl) {
      this.rl.close();
    }
    this.screen.destroy();
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