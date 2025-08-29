#!/bin/sh
# Dashboard - POSIX-compliant service management for System Dashboard
# Real-time Living Agent Network Dashboard - Core technology for visualizing distributed systems

VERSION="3.0.0"

# Color support (Access style)
if [ "${FORCE_COLOR:-0}" = "1" ] || { [ -t 1 ] && [ "${NO_COLOR:-0}" != "1" ] && [ "${TERM:-}" != "dumb" ]; }; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    DIM=''
    NC=''
fi

# XDG Base Directory Specification compliance
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Dashboard directories following XDG standard
DASHBOARD_CONFIG_HOME="${DASHBOARD_CONFIG_HOME:-$XDG_CONFIG_HOME/dashboard}"
DASHBOARD_DATA_HOME="${DASHBOARD_DATA_HOME:-$XDG_DATA_HOME/dashboard}"
DASHBOARD_RUNTIME_DIR="${DASHBOARD_RUNTIME_DIR:-$XDG_RUNTIME_DIR}"

# Configuration files (XDG-compliant)
DASHBOARD_CONFIG="${DASHBOARD_CONFIG:-$DASHBOARD_CONFIG_HOME/config.json}"
DASHBOARD_LOG="${DASHBOARD_LOG:-$DASHBOARD_DATA_HOME/dashboard.log}"
DASHBOARD_LOCK="${DASHBOARD_LOCK:-$DASHBOARD_RUNTIME_DIR/dashboard.lock}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure XDG-compliant directories exist
mkdir -p "$DASHBOARD_CONFIG_HOME"
mkdir -p "$DASHBOARD_DATA_HOME"
mkdir -p "$DASHBOARD_RUNTIME_DIR"

# Service configuration
SERVICE_NAME="dashboard"
SERVICE_USER="${USER:-$(whoami)}"
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}@.service"

# Dashboard configuration defaults
DASHBOARD_PORT="${DASHBOARD_PORT:-8767}"
# AIR_PEERS now handled by smart discovery in server.js
# Leave empty for auto-discovery, or set manually to override
AIR_PEERS="${AIR_PEERS:-}"
UPDATE_INTERVAL="${UPDATE_INTERVAL:-3600}"

# Logging functions (Access style)
log_success() {
    echo "${GREEN}✓${NC} $*"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $*" >> "$DASHBOARD_LOG"
}

log_info() {
    echo "${BLUE}ℹ${NC} $*"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*" >> "$DASHBOARD_LOG"
}

log_warn() {
    echo "${YELLOW}⚠${NC} $*"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >> "$DASHBOARD_LOG"
}

log_error() {
    echo "${RED}✗${NC} $*" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >> "$DASHBOARD_LOG"
}

# Check if running as root
is_root() {
    [ "$(id -u)" -eq 0 ]
}

# Check if systemctl is available
has_systemd() {
    command -v systemctl >/dev/null 2>&1
}

# Get current Dashboard status
get_status() {
    if [ -f "$DASHBOARD_LOCK" ]; then
        PID=$(cat "$DASHBOARD_LOCK" 2>/dev/null || echo "")
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            return 0  # Running
        else
            rm -f "$DASHBOARD_LOCK" 2>/dev/null
            return 1  # Not running
        fi
    else
        return 1  # Not running
    fi
}

# Generate systemd service file
generate_service_file() {
    cat << EOF
[Unit]
Description=AKAO Dashboard Service - Real-time System Monitor
Documentation=https://github.com/akaoio/dashboard
After=network.target
Wants=network.target

[Service]
Type=simple
User=%i
Group=%i
WorkingDirectory=$SCRIPT_DIR

# Environment
Environment="NODE_ENV=production"
Environment="DASHBOARD_PORT=$DASHBOARD_PORT"
Environment="AIR_DOMAIN=${AIR_DOMAIN:-akao.io}"
Environment="AIR_PREFIX=${AIR_PREFIX:-peer}"
Environment="AIR_PORT=${AIR_PORT:-8765}"
Environment="AIR_PROTOCOL=${AIR_PROTOCOL:-https}"
Environment="AIR_PEERS=$AIR_PEERS"

# Auto-update on start (optional)
ExecStartPre=/bin/sh -c 'cd $SCRIPT_DIR && { git stash && git pull --rebase && git stash pop || true; } && npm install --omit=dev >/dev/null 2>&1 || true'

# Start Dashboard server
ExecStart=/usr/bin/node $SCRIPT_DIR/server.js

# Restart policy
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=3

# Resource limits
MemoryMax=512M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dashboard

[Install]
WantedBy=multi-user.target
EOF
}

# Install Dashboard service
cmd_install() {
    log_info "Installing Dashboard service..."
    
    # Check if we're root for system installation
    if ! is_root; then
        log_error "Installation requires root privileges"
        echo "Please run: sudo $0 install"
        exit 1
    fi
    
    # Check systemd availability
    if ! has_systemd; then
        log_error "Systemd is required but not available"
        exit 1
    fi
    
    # Check Node.js availability
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    
    # Install dependencies
    log_info "Installing Dashboard dependencies..."
    cd "$SCRIPT_DIR"
    npm install --omit=dev >/dev/null 2>&1 || {
        log_error "Failed to install Node.js dependencies"
        exit 1
    }
    
    # Generate and install service file
    log_info "Creating systemd service..."
    generate_service_file > "$SERVICE_FILE" || {
        log_error "Failed to create service file"
        exit 1
    }
    
    # Create global dashboard command
    DASHBOARD_BIN="$INSTALL_DIR/dashboard"
    cat << 'EOF' > "$DASHBOARD_BIN"
#!/bin/sh
# Dashboard CLI wrapper
exec /usr/bin/node /home/x/core/projects/dashboard/cli.js "$@"
EOF
    chmod +x "$DASHBOARD_BIN"
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}@${SERVICE_USER}.service" || {
        log_error "Failed to enable Dashboard service"
        exit 1
    }
    
    # Start service
    systemctl start "${SERVICE_NAME}@${SERVICE_USER}.service" || {
        log_error "Failed to start Dashboard service"
        exit 1
    }
    
    # Wait for service to start
    sleep 3
    
    # Verify installation
    if systemctl is-active --quiet "${SERVICE_NAME}@${SERVICE_USER}.service"; then
        log_success "Dashboard service installed and running"
        log_info "Service: ${SERVICE_NAME}@${SERVICE_USER}.service"
        log_info "HTTP API: http://localhost:$DASHBOARD_PORT"
        log_info "CLI: dashboard status"
    else
        log_error "Dashboard service failed to start"
        echo "Check logs: journalctl -u ${SERVICE_NAME}@${SERVICE_USER} -n 20"
        exit 1
    fi
}

# Uninstall Dashboard service
cmd_uninstall() {
    log_info "Uninstalling Dashboard service..."
    
    if ! is_root; then
        log_error "Uninstallation requires root privileges"
        echo "Please run: sudo $0 uninstall"
        exit 1
    fi
    
    # Stop and disable service
    if has_systemd; then
        systemctl stop "${SERVICE_NAME}@${SERVICE_USER}.service" 2>/dev/null || true
        systemctl disable "${SERVICE_NAME}@${SERVICE_USER}.service" 2>/dev/null || true
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
    fi
    
    # Remove CLI command
    rm -f "$INSTALL_DIR/dashboard"
    
    # Clean up lock files
    rm -f "$DASHBOARD_LOCK"
    
    log_success "Dashboard service uninstalled"
    log_info "Data preserved at: $DASHBOARD_DATA_HOME"
}

# Start Dashboard (foreground)
cmd_start() {
    if get_status; then
        log_warn "Dashboard is already running"
        exit 1
    fi
    
    log_info "Starting Dashboard server..."
    exec node "$SCRIPT_DIR/server.js"
}

# Stop Dashboard
cmd_stop() {
    if ! get_status; then
        log_warn "Dashboard is not running"
        exit 1
    fi
    
    PID=$(cat "$DASHBOARD_LOCK")
    log_info "Stopping Dashboard (PID: $PID)..."
    
    kill "$PID" 2>/dev/null || {
        log_error "Failed to stop Dashboard"
        exit 1
    }
    
    # Wait for process to exit
    for i in 1 2 3 4 5; do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    
    rm -f "$DASHBOARD_LOCK"
    log_success "Dashboard stopped"
}

# Show Dashboard status
cmd_status() {
    if has_systemd && systemctl is-active --quiet "${SERVICE_NAME}@${SERVICE_USER}.service" 2>/dev/null; then
        echo "${GREEN}●${NC} Dashboard service is ${GREEN}active (running)${NC}"
        echo "   Service: ${SERVICE_NAME}@${SERVICE_USER}.service"
        echo "   Started: $(systemctl show "${SERVICE_NAME}@${SERVICE_USER}.service" --property=ActiveEnterTimestamp --value)"
        echo "   HTTP API: http://localhost:$DASHBOARD_PORT"
        
        # Check HTTP endpoint
        if command -v curl >/dev/null 2>&1; then
            if curl -s -f "http://localhost:$DASHBOARD_PORT/health" >/dev/null 2>&1; then
                echo "   Health: ${GREEN}healthy${NC}"
            else
                echo "   Health: ${YELLOW}unhealthy${NC}"
            fi
        fi
        
    elif get_status; then
        PID=$(cat "$DASHBOARD_LOCK")
        echo "${GREEN}●${NC} Dashboard is ${GREEN}running${NC} (PID: $PID)"
        echo "   HTTP API: http://localhost:$DASHBOARD_PORT"
        
    else
        echo "${RED}●${NC} Dashboard is ${RED}inactive (dead)${NC}"
        
        # Check if service is configured but not running
        if has_systemd && systemctl list-unit-files "${SERVICE_NAME}@${SERVICE_USER}.service" --quiet 2>/dev/null; then
            echo "   Service: ${SERVICE_NAME}@${SERVICE_USER}.service (configured but not running)"
            echo "   Start with: sudo systemctl start ${SERVICE_NAME}@${SERVICE_USER}.service"
        else
            echo "   Install with: sudo $0 install"
        fi
    fi
}

# Show version
cmd_version() {
    echo "Dashboard $VERSION"
    echo "Real-time Living Agent Network Dashboard"
    
    if command -v node >/dev/null 2>&1; then
        echo "Node.js: $(node --version)"
    fi
    
    if [ -f "$SCRIPT_DIR/package.json" ]; then
        PACKAGE_VERSION=$(grep '"version"' "$SCRIPT_DIR/package.json" | cut -d'"' -f4)
        echo "Package: v$PACKAGE_VERSION"
    fi
}

# Show help
cmd_help() {
    cat << EOF
${BOLD}Dashboard - System Monitoring Service${NC}

${BOLD}USAGE:${NC}
    $0 [COMMAND]

${BOLD}COMMANDS:${NC}
    ${GREEN}status${NC}      Show Dashboard status
    ${GREEN}start${NC}       Start Dashboard (foreground)
    ${GREEN}stop${NC}        Stop Dashboard
    ${GREEN}install${NC}     Install as systemd service (requires root)
    ${GREEN}uninstall${NC}   Uninstall service (requires root)
    ${GREEN}version${NC}     Show version information
    ${GREEN}help${NC}        Show this help

${BOLD}SERVICE MANAGEMENT:${NC}
    sudo systemctl start dashboard@$SERVICE_USER     # Start service
    sudo systemctl stop dashboard@$SERVICE_USER      # Stop service
    sudo systemctl restart dashboard@$SERVICE_USER   # Restart service
    sudo systemctl status dashboard@$SERVICE_USER    # Check service status
    journalctl -u dashboard@$SERVICE_USER -f         # View logs

${BOLD}CLI USAGE (after installation):${NC}
    dashboard status     # Show system status
    dashboard agents     # List active agents  
    dashboard health     # Health check
    dashboard help       # Show CLI help

${BOLD}CONFIGURATION:${NC}
    Config: $DASHBOARD_CONFIG
    Data:   $DASHBOARD_DATA_HOME
    Logs:   $DASHBOARD_LOG
    Port:   $DASHBOARD_PORT

${BOLD}EXAMPLES:${NC}
    # Install Dashboard service
    sudo $0 install
    
    # Check status
    $0 status
    
    # View service logs
    journalctl -u dashboard@$SERVICE_USER -f

EOF
}

# Main command dispatcher
main() {
    case "${1:-status}" in
        "install")
            cmd_install
            ;;
        "uninstall")
            cmd_uninstall
            ;;
        "start")
            cmd_start
            ;;
        "stop")
            cmd_stop
            ;;
        "status")
            cmd_status
            ;;
        "version")
            cmd_version
            ;;
        "help"|"-h"|"--help")
            cmd_help
            ;;
        *)
            log_error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"