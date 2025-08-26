#!/usr/bin/env node

/**
 * CLI entry point for @akaoio/dashboard
 */

import { LiveDashboard } from './LiveDashboard';
import { DEFAULT_PEERS } from './constants';

// Parse command line arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const showVersion = args.includes('--version') || args.includes('-v');
const useLive = !args.includes('--simple');

if (showHelp) {
  console.log(`
@akaoio/dashboard - Real-time Living Agent Network Dashboard

Usage:
  dashboard [options]

Options:
  --help, -h      Show this help message
  --version, -v   Show version
  --simple        Use simple console output instead of TUI
  --peers <urls>  Comma-separated list of GUN peers
  --title <text>  Custom dashboard title

Examples:
  dashboard
  dashboard --simple
  dashboard --peers "https://peer1.com/gun,https://peer2.com/gun"
  dashboard --title "My Custom Dashboard"

Keyboard shortcuts (TUI mode):
  Q, Ctrl+C  Quit
  R          Clear messages
  H          Show help
  Tab        Switch focus
  Arrow Keys Navigate

Powered by @akaoio technologies:
  - @akaoio/tui for terminal UI
  - @akaoio/air for P2P communication
  - @akaoio/gun for distributed data
  - @akaoio/battle for testing
  - @akaoio/builder for compilation
  `.trim());
  process.exit(0);
}

if (showVersion) {
  console.log('@akaoio/dashboard v1.0.0');
  process.exit(0);
}

// Parse peers
let peers = DEFAULT_PEERS;
const peersIndex = args.indexOf('--peers');
if (peersIndex !== -1 && args[peersIndex + 1]) {
  peers = args[peersIndex + 1].split(',');
}

// Parse title
let title = 'AIR Living Agent Network Dashboard';
const titleIndex = args.indexOf('--title');
if (titleIndex !== -1 && args[titleIndex + 1]) {
  title = args[titleIndex + 1];
}

// Start dashboard
async function main() {
  console.log('🚀 Starting dashboard...\n');
  
  try {
    if (useLive) {
      // Use full TUI dashboard
      const dashboard = new LiveDashboard({
        title,
        peers
      });
      
      await dashboard.start();
      
      console.log('Dashboard running in TUI mode. Press Q to quit.\n');
    } else {
      // Use simple console dashboard
      const { Dashboard } = await import('./Dashboard');
      const dashboard = new Dashboard({
        title,
        peers
      });
      
      await dashboard.start();
      
      console.log('Dashboard running in simple mode. Press Ctrl+C to quit.\n');
    }
  } catch (error) {
    console.error('❌ Failed to start dashboard:', error);
    process.exit(1);
  }
}

// Handle signals
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down dashboard...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down dashboard...');
  process.exit(0);
});

// Run
main().catch(console.error);