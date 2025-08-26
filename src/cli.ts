#!/usr/bin/env node

/**
 * CLI entry point for @akaoio/dashboard
 * Provides command-line interface for agents and humans
 * Uses @akaoio/builder for TypeScript compilation
 * Global installation: npm install -g @akaoio/dashboard
 */

import { program } from 'commander';
import { Dashboard } from './Dashboard.js';
import { DEFAULT_PEERS } from './constants.js';

// CLI setup using commander
program
  .name('dashboard')
  .description('AIR Living Agent Network Dashboard - Communication hub for agents and humans')
  .version('2.0.0');

program
  .command('chat')
  .description('Interactive chat mode for humans')
  .option('-p, --peers <peers>', 'Comma-separated list of GUN peers', DEFAULT_PEERS.join(','))
  .option('-t, --title <title>', 'Custom dashboard title')
  .action((options: any) => {
    const peers = options.peers ? options.peers.split(',') : DEFAULT_PEERS;
    const dashboard = new Dashboard({
      peers,
      title: options.title
    });
    dashboard.startInteractive();
  });

program
  .command('agent <id>')
  .description('Agent mode - for automated agent communication')
  .requiredOption('-t, --team <team>', 'Agent team')
  .requiredOption('-r, --role <role>', 'Agent role')
  .option('-m, --message <message>', 'Message to send')
  .option('--to <agent>', 'Send direct message to specific agent')
  .option('--team-broadcast', 'Broadcast to team only')
  .option('--listen', 'Start in listening mode')
  .option('-p, --peers <peers>', 'Comma-separated list of GUN peers', DEFAULT_PEERS.join(','))
  .action((id: string, options: any) => {
    const peers = options.peers ? options.peers.split(',') : DEFAULT_PEERS;
    const dashboard = new Dashboard({
      peers,
      agentMode: {
        id: id,
        team: options.team,
        role: options.role
      }
    });
    
    if (options.listen) {
      dashboard.startInteractive();
    } else if (options.message) {
      dashboard.sendAgentMessage(options.message, {
        to: options.to,
        team: options.teamBroadcast
      });
    } else {
      console.error('Error: Must specify --message or --listen');
      process.exit(1);
    }
  });

program
  .command('monitor')
  .description('Monitor mode - watch all network activity')
  .option('-p, --peers <peers>', 'Comma-separated list of GUN peers', DEFAULT_PEERS.join(','))
  .option('-t, --title <title>', 'Custom dashboard title')
  .action((options: any) => {
    const peers = options.peers ? options.peers.split(',') : DEFAULT_PEERS;
    const dashboard = new Dashboard({
      peers,
      title: options.title
    });
    dashboard.start();
  });

// Legacy simple mode command for backward compatibility
program
  .command('simple')
  .description('Legacy simple dashboard mode (deprecated - use monitor instead)')
  .option('-p, --peers <peers>', 'Comma-separated list of GUN peers', DEFAULT_PEERS.join(','))
  .action((options: any) => {
    console.warn('⚠️  "simple" command is deprecated. Use "monitor" instead.');
    const peers = options.peers ? options.peers.split(',') : DEFAULT_PEERS;
    const dashboard = new Dashboard({ peers });
    dashboard.start();
  });

// Default to chat if no command
if (process.argv.length === 2) {
  const dashboard = new Dashboard({ peers: DEFAULT_PEERS });
  dashboard.startInteractive();
} else {
  program.parse();
}

// Handle signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Dashboard shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Dashboard shutting down...');
  process.exit(0);
});

export default program;