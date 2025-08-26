/**
 * Tests for @akaoio/dashboard using @akaoio/battle
 */

import { test, expect, describe, beforeEach, afterEach } from '@akaoio/battle';
import { Dashboard } from '../src/Dashboard';
import { AgentTracker } from '../src/AgentTracker';
import { MessageFeed } from '../src/MessageFeed';
import { MetricsCollector } from '../src/MetricsCollector';
import { NetworkMonitor } from '../src/NetworkMonitor';

describe('Dashboard Core', () => {
  let dashboard: Dashboard;
  
  beforeEach(() => {
    dashboard = new Dashboard({
      peers: ['http://localhost:8765/gun'] // Local test peer
    });
  });
  
  afterEach(() => {
    dashboard.stop();
  });
  
  test('should initialize with default config', () => {
    const state = dashboard.getState();
    expect(state.agents.size).toBe(0);
    expect(state.messages.length).toBe(0);
    expect(state.isRunning).toBe(false);
  });
  
  test('should start and stop correctly', async () => {
    await dashboard.start();
    const state = dashboard.getState();
    expect(state.isRunning).toBe(true);
    
    dashboard.stop();
    const stoppedState = dashboard.getState();
    expect(stoppedState.isRunning).toBe(false);
  });
  
  test('should clear messages', async () => {
    await dashboard.start();
    await dashboard.sendMessage('test', 'Hello world');
    
    let state = dashboard.getState();
    expect(state.messages.length).toBeGreaterThan(0);
    
    dashboard.clearMessages();
    state = dashboard.getState();
    expect(state.messages.length).toBe(0);
  });
  
  test('should register and track agents', async () => {
    await dashboard.start();
    await dashboard.connectAgent('test-agent', {
      team: 'test',
      role: 'tester'
    });
    
    const state = dashboard.getState();
    expect(state.agents.size).toBeGreaterThan(0);
  });
});

describe('AgentTracker', () => {
  let tracker: AgentTracker;
  let gun: any;
  
  beforeEach(() => {
    gun = {
      get: jest.fn(() => ({
        map: jest.fn(() => ({
          on: jest.fn()
        })),
        put: jest.fn((data, callback) => callback({ err: null }))
      }))
    };
    tracker = new AgentTracker(gun);
  });
  
  test('should track agents', async () => {
    await tracker.registerAgent('agent-1', {
      team: 'test',
      role: 'tester'
    });
    
    const agent = tracker.getAgent('agent-1');
    expect(agent).toBeDefined();
    expect(agent?.team).toBe('test');
    expect(agent?.role).toBe('tester');
  });
  
  test('should filter agents by team', async () => {
    await tracker.registerAgent('agent-1', { team: 'alpha' });
    await tracker.registerAgent('agent-2', { team: 'beta' });
    await tracker.registerAgent('agent-3', { team: 'alpha' });
    
    const alphaAgents = tracker.getAgentsByTeam('alpha');
    expect(alphaAgents.length).toBe(2);
  });
  
  test('should get online agents', async () => {
    await tracker.registerAgent('agent-1', { status: 'online' });
    await tracker.registerAgent('agent-2', { status: 'offline' });
    
    const onlineAgents = tracker.getOnlineAgents();
    expect(onlineAgents.length).toBe(1);
  });
});

describe('MessageFeed', () => {
  let feed: MessageFeed;
  let gun: any;
  
  beforeEach(() => {
    gun = {
      get: jest.fn(() => ({
        get: jest.fn(() => ({
          map: jest.fn(() => ({
            on: jest.fn()
          })),
          put: jest.fn((data, callback) => callback({ err: null }))
        }))
      }))
    };
    feed = new MessageFeed(gun);
  });
  
  test('should broadcast messages', async () => {
    await feed.broadcast('sender', 'Test message');
    // Message should be handled internally
    expect(gun.get).toHaveBeenCalled();
  });
  
  test('should search messages', () => {
    // Simulate some messages
    const messages = feed.searchMessages('test');
    expect(Array.isArray(messages)).toBe(true);
  });
  
  test('should get recent messages', () => {
    const recent = feed.getRecentMessages(5);
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeLessThanOrEqual(5);
  });
});

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  let gun: any;
  
  beforeEach(() => {
    gun = {
      get: jest.fn(() => ({
        map: jest.fn(() => ({
          on: jest.fn()
        })),
        get: jest.fn(() => ({
          put: jest.fn((data, callback) => callback({ err: null }))
        }))
      }))
    };
    collector = new MetricsCollector(gun);
  });
  
  test('should collect metrics', () => {
    const metrics = collector.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.messageCount).toBe(0);
    expect(metrics.agentCount).toBe(0);
  });
  
  test('should increment counters', () => {
    collector.incrementMessageCount();
    collector.incrementErrorCount();
    
    const metrics = collector.getMetrics();
    expect(metrics.messageCount).toBe(1);
    expect(metrics.errorCount).toBe(1);
  });
  
  test('should reset metrics', () => {
    collector.incrementMessageCount();
    collector.resetMetrics();
    
    const metrics = collector.getMetrics();
    expect(metrics.messageCount).toBe(0);
  });
});

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;
  let gun: any;
  
  beforeEach(() => {
    gun = {
      _: {
        root: {
          opt: {
            peers: {
              'peer1': {},
              'peer2': {}
            }
          }
        }
      },
      get: jest.fn(() => ({
        get: jest.fn(() => ({
          put: jest.fn((data, callback) => callback({ err: null }))
        }))
      }))
    };
    monitor = new NetworkMonitor(gun);
  });
  
  test('should get network health', () => {
    const health = monitor.getNetworkHealth();
    expect(health).toBeDefined();
    expect(health.status).toBeDefined();
  });
  
  test('should track peers', () => {
    const peers = monitor.getPeers();
    expect(Array.isArray(peers)).toBe(true);
  });
});