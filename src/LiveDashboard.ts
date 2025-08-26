/**
 * Live Dashboard Component
 * Advanced TUI-based dashboard with full @akaoio/tui integration
 */

import { 
  TUI, 
  Screen, 
  Component,
  Box,
  List,
  Table,
  ProgressBar,
  Chart,
  Layout
} from '@akaoio/tui';
import { Dashboard } from './Dashboard';
import type { DashboardConfig } from './types';

export class LiveDashboard extends Dashboard {
  private layout!: Layout;
  private agentTable!: Table;
  private messageList!: List;
  private metricsChart!: Chart;
  private statusBar!: Box;
  private networkIndicator!: Box;
  
  constructor(config: DashboardConfig = {}) {
    super(config);
    this.initializeUI();
  }
  
  private initializeUI(): void {
    // Create main layout
    this.layout = new Layout({
      parent: this.screen,
      width: '100%',
      height: '100%',
      layout: 'grid',
      rows: 12,
      cols: 12
    });
    
    // Title bar
    const titleBar = new Box({
      parent: this.layout,
      row: 0,
      col: 0,
      rowSpan: 1,
      colSpan: 12,
      content: '{center}🌐 AIR Living Agent Network Dashboard{/center}',
      style: {
        fg: 'cyan',
        bold: true,
        border: { type: 'line', fg: 'cyan' }
      }
    });
    
    // Agent table (left side)
    this.agentTable = new Table({
      parent: this.layout,
      row: 1,
      col: 0,
      rowSpan: 5,
      colSpan: 6,
      label: ' 🤖 Agents ',
      headers: ['Agent', 'Team', 'Status', 'Last Seen'],
      style: {
        border: { type: 'line', fg: 'green' },
        header: { fg: 'cyan', bold: true }
      }
    });
    
    // Message feed (right side)
    this.messageList = new List({
      parent: this.layout,
      row: 1,
      col: 6,
      rowSpan: 5,
      colSpan: 6,
      label: ' 💬 Messages ',
      scrollable: true,
      style: {
        border: { type: 'line', fg: 'yellow' },
        selected: { bg: 'blue' }
      }
    });
    
    // Metrics chart (bottom left)
    this.metricsChart = new Chart({
      parent: this.layout,
      row: 6,
      col: 0,
      rowSpan: 4,
      colSpan: 6,
      label: ' 📊 Metrics ',
      type: 'line',
      style: {
        border: { type: 'line', fg: 'magenta' },
        line: 'yellow',
        text: 'green',
        baseline: 'black'
      }
    });
    
    // Network indicator (bottom right)
    this.networkIndicator = new Box({
      parent: this.layout,
      row: 6,
      col: 6,
      rowSpan: 4,
      colSpan: 6,
      label: ' 🌍 Network ',
      style: {
        border: { type: 'line', fg: 'blue' }
      }
    });
    
    // Status bar
    this.statusBar = new Box({
      parent: this.layout,
      row: 10,
      col: 0,
      rowSpan: 2,
      colSpan: 12,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });
    
    // Keyboard shortcuts
    this.screen.key(['q', 'C-c'], () => {
      this.stop();
      process.exit(0);
    });
    
    this.screen.key(['r'], () => {
      this.clearMessages();
      this.updateUI();
    });
    
    this.screen.key(['h'], () => {
      this.showHelp();
    });
    
    // Focus management
    this.messageList.focus();
  }
  
  protected render(): void {
    // Override parent render to use TUI components
    this.updateUI();
  }
  
  private updateUI(): void {
    const state = this.getState();
    
    // Update agent table
    const agentData = Array.from(state.agents.values()).map(agent => [
      agent.id,
      agent.team,
      agent.status === 'online' ? '🟢 Online' : '⚫ Offline',
      new Date(agent.lastSeen).toLocaleTimeString()
    ]);
    
    this.agentTable.setData({
      headers: ['Agent', 'Team', 'Status', 'Last Seen'],
      data: agentData
    });
    
    // Update message list
    const messages = state.messages.slice(-20).map(msg => 
      `[${msg.timestamp}] ${msg.from}: ${msg.text}`
    );
    
    this.messageList.setItems(messages);
    
    // Update metrics chart
    this.updateMetricsChart();
    
    // Update network indicator
    this.updateNetworkIndicator();
    
    // Update status bar
    const { agentCount, messageCount, uptime, networkLatency } = state.metrics;
    this.statusBar.setContent(
      ` Agents: ${agentCount}/34 | Messages: ${messageCount} | Uptime: ${uptime}s | Latency: ${networkLatency}ms | Press H for help`
    );
    
    // Render screen
    this.screen.render();
  }
  
  private updateMetricsChart(): void {
    const state = this.getState();
    
    // Create time series data for chart
    const data = {
      title: 'Messages/sec',
      x: Array.from({ length: 10 }, (_, i) => i.toString()),
      y: Array.from({ length: 10 }, () => Math.random() * 10)
    };
    
    this.metricsChart.setData([data]);
  }
  
  private updateNetworkIndicator(): void {
    const state = this.getState();
    const { networkLatency } = state.metrics;
    
    const status = networkLatency < 100 ? '🟢 Excellent' :
                   networkLatency < 500 ? '🟡 Good' : '🔴 Poor';
    
    const content = `
Network Status: ${status}
Latency: ${networkLatency}ms
Endpoint: https://air.akao.io:8765/gun
Protocol: GUN P2P
    `.trim();
    
    this.networkIndicator.setContent(content);
  }
  
  private showHelp(): void {
    const helpBox = new Box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      content: `
        Keyboard Shortcuts:
        
        Q / Ctrl+C : Quit
        R         : Clear messages
        H         : Show this help
        Tab       : Switch focus
        Arrow Keys: Navigate
        
        Press any key to close...
      `,
      style: {
        border: { type: 'line', fg: 'cyan' },
        fg: 'white',
        bg: 'black'
      }
    });
    
    helpBox.focus();
    helpBox.once('keypress', () => {
      helpBox.destroy();
      this.screen.render();
    });
    
    this.screen.render();
  }
}