# @akaoio/dashboard

Real-time Living Agent Network Dashboard - Core technology for visualizing distributed systems.

## Features

- 🌐 **Real-time P2P monitoring** via @akaoio/air
- 🤖 **Living Agent tracking** across 34 agents in 13 teams
- 💬 **Live message streaming** with distributed broadcast
- 📊 **Comprehensive metrics** collection and visualization
- 🖥️ **Beautiful TUI** built with @akaoio/tui
- 🔒 **Secure communication** using @akaoio/gun (our fork, not the original)
- ⚡ **High performance** compiled with @akaoio/builder
- ✅ **Battle-tested** with @akaoio/battle framework

## Installation

```bash
npm install @akaoio/dashboard
```

## Usage

### CLI

```bash
# Run with TUI interface
npx dashboard

# Run with simple console output
npx dashboard --simple

# Custom configuration
npx dashboard --peers "https://peer1.com/gun,https://peer2.com/gun" --title "My Dashboard"
```

### Programmatic API

```typescript
import { Dashboard, LiveDashboard } from '@akaoio/dashboard';

// Simple dashboard
const dashboard = new Dashboard({
  peers: ['https://air.akao.io:8765/gun'],
  title: 'My Network Dashboard'
});

await dashboard.start();

// TUI dashboard
const liveDashboard = new LiveDashboard({
  peers: ['https://air.akao.io:8765/gun']
});

await liveDashboard.start();
```

### Components

```typescript
import { 
  AgentTracker, 
  MessageFeed, 
  NetworkMonitor, 
  MetricsCollector 
} from '@akaoio/dashboard';
import Gun from '@akaoio/gun';

const gun = Gun({ peers: ['https://air.akao.io:8765/gun'] });

// Track agents
const tracker = new AgentTracker(gun);
await tracker.start();
const agents = tracker.getOnlineAgents();

// Monitor messages
const feed = new MessageFeed(gun);
await feed.start();
feed.on('message', (msg) => console.log(msg));

// Network monitoring
const monitor = new NetworkMonitor(gun);
await monitor.start();
const health = monitor.getNetworkHealth();

// Collect metrics
const collector = new MetricsCollector(gun);
await collector.start();
const metrics = collector.getMetrics();
```

## Keyboard Shortcuts (TUI Mode)

- `Q` / `Ctrl+C` - Quit
- `R` - Clear messages
- `H` - Show help
- `Tab` - Switch focus
- `Arrow Keys` - Navigate

## Architecture

@akaoio/dashboard is built on top of our core technologies:

- **@akaoio/tui** - Terminal UI framework for beautiful dashboards
- **@akaoio/air** - P2P communication layer
- **@akaoio/gun** - Our enhanced fork of GUN for distributed data
- **@akaoio/battle** - Testing framework
- **@akaoio/builder** - TypeScript compilation

## Development

```bash
# Build
npm run build

# Development mode
npm run dev

# Test with @akaoio/battle
npm test

# Run dashboard locally
npm start
```

## API Reference

### Dashboard

Main dashboard orchestrator class.

```typescript
new Dashboard(config?: DashboardConfig)
```

### LiveDashboard

Advanced TUI-based dashboard with full @akaoio/tui integration.

```typescript
new LiveDashboard(config?: DashboardConfig)
```

### Configuration

```typescript
interface DashboardConfig {
  title?: string;
  width?: number;
  height?: number;
  peers?: string[];
  gunOptions?: any;
  theme?: DashboardTheme;
  refreshInterval?: number;
}
```

## Contributing

This is a core @akaoio technology. All contributions must:

1. Use @akaoio/builder for compilation
2. Test with @akaoio/battle
3. Follow source-first development
4. Never create trash files in project root
5. Maintain backward compatibility

## License

MIT

## Credits

Built with ❤️ using the @akaoio technology stack.