/**
 * Constants for @akaoio/dashboard
 */

export const DEFAULT_PEERS = [
  'wss://air.akao.io:8765/gun'
];

export const AGENT_TEAMS = [
  'meta',
  'core-fix',
  'integration',
  'feature-dev',
  'security',
  'integrity',
  'team-access',
  'team-air',
  'team-battle',
  'team-builder',
  'team-composer',
  'team-tui',
  'team-ui'
] as const;

export const AGENT_ROLES = [
  'orchestrator',
  'coordinator',
  'fixer',
  'integrator',
  'architect',
  'developer',
  'tester',
  'auditor',
  'hardener',
  'sentinel',
  'enforcer',
  'inspector',
  'validator',
  'guardian',
  'maintainer',
  'optimizer',
  'designer',
  'accessibility'
] as const;

export const TOTAL_AGENTS = 34;

export const REFRESH_INTERVALS = {
  UI: 1000,          // 1 second
  METRICS: 5000,     // 5 seconds
  PING: 10000,       // 10 seconds
  HEALTH: 30000      // 30 seconds
} as const;

export const MESSAGE_LIMITS = {
  DISPLAY: 20,
  STORAGE: 1000,
  BATCH: 100
} as const;

export const NETWORK_THRESHOLDS = {
  EXCELLENT: 100,    // < 100ms
  GOOD: 500,         // < 500ms
  POOR: 1000,        // < 1000ms
  CRITICAL: 5000     // > 5000ms
} as const;