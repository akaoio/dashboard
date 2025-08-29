# @akaoio/dashboard

Real-time Living Agent Network Dashboard - Revolutionary visualization and control center for the Air-based multi-agent ecosystem

> Where agents come alive - real-time visualization of the living agent ecosystem

**Version**: 1.0.0  
**License**: MIT  
**Repository**: https://github.com/akaoio/dashboard

## Overview

Dashboard provides a revolutionary real-time window into the Living Agent Network, visualizing agent communication, task execution, and system health through direct P2P connections.

## Core Principles


### Living Agent Visualization
Real-time display of agent activity, communication, and state across the entire Air network



### P2P Network Monitoring
Direct connection to GUN database on port 8765 for live agent updates without polling



### Universal Access
Works in any modern browser with no installation - pure web technologies



### Zero Configuration
Automatically discovers and connects to the local Air network




## Features


- **Real-Time Agent Status**: Live status of all 34+ agents with health indicators

- **Communication Flow**: Visual representation of agent-to-agent messages in real-time

- **Task Pipeline**: Track tasks as they flow through different agents and teams

- **Integrity Monitoring**: Real-time integrity scores and violation alerts

- **Network Topology**: Interactive graph showing agent connections and dependencies

- **Event Stream**: Live feed of all agent events and system messages

- **Performance Metrics**: Real-time performance data for each agent and the overall system

- **Command Center**: Direct control interface for agent activation and task assignment


## Installation

```bash
# Quick install with default settings
curl -sSL https://raw.githubusercontent.com/akaoio/manager/main/install.sh | sh

# Install as systemd service
curl -sSL https://raw.githubusercontent.com/akaoio/manager/main/install.sh | sh -s -- --systemd

# Install with custom prefix
curl -sSL https://raw.githubusercontent.com/akaoio/manager/main/install.sh | sh -s -- --prefix=/opt/manager
```

## Usage

```bash
# Initialize a new Manager-based project
manager init

# Configure settings
manager config set update.interval 3600

# Install application
manager install --systemd

# Check health
manager health

# Update application
manager update
```

## Commands


### `serve`
Start the dashboard web server

**Usage**: `dashboard serve [options]`



### `connect`
Connect to Air network

**Usage**: `dashboard connect [url]`



### `monitor`
Monitor agent activity

**Usage**: `dashboard monitor [agent-name]`



### `export`
Export dashboard data

**Usage**: `dashboard export [format]`









## Architecture Components


### Web Interface
Pure HTML/CSS/JS interface with real-time updates

**Responsibility**: User interaction and visualization


### Air Network Connector
WebSocket connection to GUN database on port 8765

**Responsibility**: Real-time data synchronization with agent network


### Agent Monitor
Tracks all active agents, their status, and communication

**Responsibility**: Agent lifecycle and activity monitoring


### Task Visualizer
Real-time display of task flow between agents

**Responsibility**: Task tracking and dependency visualization


### Integrity Scanner
Live integrity scoring and violation detection

**Responsibility**: Code quality and integrity enforcement


### Network Graph
Interactive visualization of agent relationships and communication patterns

**Responsibility**: Network topology and message flow display



## Use Cases



## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|

| `DASHBOARD_PORT` | Default port for dashboard server | `3000` |

| `DASHBOARD_AIR_URL` | Default Air network URL | `http://localhost:8765` |

| `DASHBOARD_THEME` | UI theme (light/dark/auto) | `auto` |

| `DASHBOARD_UPDATE_INTERVAL` | Data refresh interval in milliseconds | `1000` |

| `DASHBOARD_MAX_EVENTS` | Maximum events to display in stream | `1000` |


## 



### Benefits



## Development

Manager follows strict POSIX compliance and zero-dependency principles. All code must be pure POSIX shell without bashisms or GNU extensions.

### Contributing

1. Fork the repository
2. Create your feature branch
3. Ensure POSIX compliance
4. Add tests using the test framework
5. Submit a pull request

### Testing

```bash
# Run all tests
./tests/run-all.sh

# Run specific test suite
./tests/test-core.sh
```

## Support

- **Issues**: [GitHub Issues](https://github.com/akaoio/manager/issues)
- **Documentation**: [Wiki](https://github.com/akaoio/manager/wiki)
- **Community**: [Discussions](https://github.com/akaoio/manager/discussions)

---

*@akaoio/dashboard - The foundational framework that brings order to chaos*

*Built with zero dependencies for eternal reliability*