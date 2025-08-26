/**
 * Type definitions for @akaoio/dashboard
 */

export interface DashboardConfig {
  title?: string;
  width?: number;
  height?: number;
  peers?: string[];
  gunOptions?: any;
  theme?: DashboardTheme;
  refreshInterval?: number;
}

export interface DashboardTheme {
  primary?: string;
  secondary?: string;
  success?: string;
  warning?: string;
  error?: string;
  background?: string;
  text?: string;
}

export interface DashboardState {
  agents: Map<string, Agent>;
  messages: Message[];
  metrics: Metrics;
  startTime: number;
  isRunning: boolean;
}

export interface Agent {
  id: string;
  team: string;
  role: string;
  status: AgentStatus;
  lastSeen: number;
  metadata?: Record<string, any>;
}

export type AgentStatus = 'online' | 'offline' | 'busy' | 'error';

export interface Message {
  id: string;
  from: string;
  text: string;
  team?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Metrics {
  messageCount: number;
  agentCount: number;
  uptime: number;
  networkLatency: number;
  messagesPerSecond?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  activeConnections?: number;
  totalDataTransferred?: number;
  errorCount?: number;
}