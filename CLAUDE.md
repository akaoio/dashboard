# CLAUDE.md - @akaoio/dashboard

This file provides guidance to Claude Code (claude.ai/code) when working with the @akaoio/dashboard codebase.

## Project Overview

**@akaoio/dashboard** - Real-time Living Agent Network Dashboard - Revolutionary visualization and control center for the Air-based multi-agent ecosystem

**Version**: 1.0.0  
**License**: MIT  
**Author**: AKAO.IO  
**Repository**: https://github.com/akaoio/dashboard  
**Philosophy**: "Where agents come alive - real-time visualization of the living agent ecosystem"

## Core Development Principles


### Living Agent Visualization
Real-time display of agent activity, communication, and state across the entire Air network



### P2P Network Monitoring
Direct connection to GUN database on port 8765 for live agent updates without polling



### Universal Access
Works in any modern browser with no installation - pure web technologies



### Zero Configuration
Automatically discovers and connects to the local Air network




## Architecture Overview

### System Design

Dashboard provides a revolutionary real-time window into the Living Agent Network, visualizing agent communication, task execution, and system health through direct P2P connections.

### Core Components


**Web Interface**
- Pure HTML/CSS/JS interface with real-time updates
- Responsibility: User interaction and visualization


**Air Network Connector**
- WebSocket connection to GUN database on port 8765
- Responsibility: Real-time data synchronization with agent network


**Agent Monitor**
- Tracks all active agents, their status, and communication
- Responsibility: Agent lifecycle and activity monitoring


**Task Visualizer**
- Real-time display of task flow between agents
- Responsibility: Task tracking and dependency visualization


**Integrity Scanner**
- Live integrity scoring and violation detection
- Responsibility: Code quality and integrity enforcement


**Network Graph**
- Interactive visualization of agent relationships and communication patterns
- Responsibility: Network topology and message flow display



## Features


### Real-Time Agent Status
Live status of all 34+ agents with health indicators


### Communication Flow
Visual representation of agent-to-agent messages in real-time


### Task Pipeline
Track tasks as they flow through different agents and teams


### Integrity Monitoring
Real-time integrity scores and violation alerts


### Network Topology
Interactive graph showing agent connections and dependencies


### Event Stream
Live feed of all agent events and system messages


### Performance Metrics
Real-time performance data for each agent and the overall system


### Command Center
Direct control interface for agent activation and task assignment



## Command Interface

### Core Commands

```bash

dashboard serve [options]  # Start the dashboard web server

dashboard connect [url]  # Connect to Air network

dashboard monitor [agent-name]  # Monitor agent activity

dashboard export [format]  # Export dashboard data

```

### Detailed Command Reference


#### `serve` Command
**Purpose**: Start the dashboard web server  
**Usage**: `dashboard serve [options]`



#### `connect` Command
**Purpose**: Connect to Air network  
**Usage**: `dashboard connect [url]`



#### `monitor` Command
**Purpose**: Monitor agent activity  
**Usage**: `dashboard monitor [agent-name]`



#### `export` Command
**Purpose**: Export dashboard data  
**Usage**: `dashboard export [format]`









## Environment Variables


### DASHBOARD_PORT
- **Description**: Default port for dashboard server
- **Default**: `3000`


### DASHBOARD_AIR_URL
- **Description**: Default Air network URL
- **Default**: `http://localhost:8765`


### DASHBOARD_THEME
- **Description**: UI theme (light/dark/auto)
- **Default**: `auto`


### DASHBOARD_UPDATE_INTERVAL
- **Description**: Data refresh interval in milliseconds
- **Default**: `1000`


### DASHBOARD_MAX_EVENTS
- **Description**: Maximum events to display in stream
- **Default**: `1000`



## Development Guidelines

### Shell Script Standards

**POSIX Compliance**
- Use `/bin/sh` (not bash-specific features)
- Avoid bashisms and GNU-specific extensions
- Test on multiple shells (dash, ash, bash)

**Error Handling**
- Always check exit codes: `command || handle_error`
- Use proper error messages with context
- Fail fast and clearly on configuration errors

**Security Practices**
- Validate all user input
- Use secure temp file creation
- Never expose sensitive data in logs
- Proper file permissions (600 for configs)

### Code Organization

```
manager.sh              # Main entry point
├── Core Functions
│   ├── manager_init()      # Framework initialization
│   ├── manager_config()    # Configuration management
│   └── manager_error()     # Error handling
├── Module Loading
│   ├── load_module()       # Dynamic module loading
│   └── verify_module()     # Module verification
└── Utility Functions
    ├── log()              # Logging functionality
    ├── validate_posix()   # POSIX compliance check
    └── check_deps()       # Dependency verification
```

### Module Development

Each module follows this pattern:

```bash
#!/bin/sh
# Module: module-name
# Description: Brief description
# Dependencies: none (or list them)

# Module initialization
module_init() {
    # Initialization code
}

# Module functions
module_function() {
    # Function implementation
}

# Module cleanup
module_cleanup() {
    # Cleanup code
}

# Export module interface
MANAGER_MODULE_NAME="module-name"
MANAGER_MODULE_VERSION="1.0.0"
```

### Testing Requirements

**Manual Testing**
- Test on multiple shells (sh, dash, ash, bash)
- Verify on different Unix-like systems
- Test failure scenarios and recovery
- Validate all command options

**Test Framework**
```bash
# Run all tests
./tests/run-all.sh

# Run specific test
./tests/test-core.sh

# Test with specific shell
SHELL=/bin/dash ./tests/run-all.sh
```

## Common Patterns

### Standard Error Handling
```bash
# Function with error handling
function_name() {
    command || {
        log "ERROR: Command failed: $*"
        return 1
    }
}
```

### Configuration Validation
```bash
# Validate required configuration
validate_config() {
    [ -z "$CONFIG_VALUE" ] && {
        echo "ERROR: CONFIG_VALUE not set"
        exit 1
    }
}
```

### Safe Temp File Creation
```bash
# Create temporary file safely
TEMP_FILE=$(mktemp) || exit 1
trap 'rm -f "$TEMP_FILE"' EXIT
```

### Module Loading
```bash
# Load module with verification
load_module "module-name" || {
    log "ERROR: Failed to load module: module-name"
    exit 1
}
```

## Use Cases



## Security Considerations

### Framework Security
- All modules verified before loading
- Configuration files with restricted permissions (600)
- No execution of untrusted code
- Input validation at all entry points

### Deployment Security
- Secure installation process
- Proper service user creation
- Limited privileges for service execution
- Audit logging for critical operations

## Troubleshooting Guide

### Common Issues

**Module Loading Failures**
```bash
# Debug module loading
MANAGER_DEBUG=true manager init

# Check module path
echo $MANAGER_MODULE_PATH

# Verify module syntax
sh -n module-name.sh
```

**Configuration Issues**
```bash
# Check configuration
manager config list

# Validate configuration file
manager config validate

# Reset configuration
rm -rf ~/.config/manager
manager init
```

**Service Issues**
```bash
# Check service status
manager service status

# View service logs
journalctl -u manager -f

# Restart service
manager service restart
```

## Notes for AI Assistants

When working with Manager:

### Critical Guidelines
- **ALWAYS maintain POSIX compliance** - test with `/bin/sh`
- **NEVER introduce dependencies** - pure shell only
- **Follow the module pattern** - consistency is key
- **Test on multiple shells** - dash, ash, sh, bash
- **Respect the framework philosophy** - universal patterns

### Development Best Practices
- **Start with the core module** - understand the foundation
- **Use existing patterns** - don't reinvent the wheel
- **Test error conditions** - robust error handling
- **Document module interfaces** - clear contracts
- **Validate all inputs** - security first

### Common Mistakes to Avoid
- Using bash-specific features (arrays, [[ ]], etc.)
- Assuming GNU coreutils extensions
- Hardcoding paths instead of using variables
- Forgetting to check exit codes
- Not testing on minimal systems

### Framework Extensions
When extending Manager:
1. Create new module following the pattern
2. Add module to the module registry
3. Update configuration schema if needed
4. Add tests for new functionality
5. Document in module header

## 



### Benefits


---

*Manager is the foundation - bringing order to chaos through universal shell patterns.*

*Version: 1.0.0 | License: MIT | Author: AKAO.IO*