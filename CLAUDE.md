# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NekoNekoStatus is a hybrid server monitoring application combining Node.js (main dashboard) and Go (monitoring agents). It provides real-time server monitoring, statistics visualization, SSH integration, and Telegram notifications.

## Architecture

### Core Components
- **Main Server**: `nekonekostatus.js` - Express.js web server with WebSocket support
- **Go Agent**: `neko-status/main.go` - System monitoring agent with HTTP API
- **Database**: SQLite with Better-SQLite3 for server configs, statistics, and settings
- **Frontend**: Nunjucks templates with Material Design UI

### Data Flow
1. Go agents collect system metrics on monitored servers
2. Node.js server polls agent APIs and stores data in SQLite
3. Frontend displays real-time data via WebSocket connections
4. Telegram bot sends notifications for server issues

## Development Commands

### Node.js Application
```bash
# Start development server
npm start
# or
node nekonekostatus.js

# Install dependencies
npm install
```

### Go Agent Development
```bash
# Build for current platform
cd neko-status
go build -o neko-status

# Build for all platforms
./build.sh

# Run with config
./neko-status -c config.yaml
```

### Docker Development
```bash
# Build Docker image
./build-docker.sh

# Run container
docker run -p 5555:5555 -d nekonekostatus
```

### Service Management
```bash
# Install as systemd service
./install.sh

# Control service
./run.sh      # Start
./restart.sh  # Restart  
./stop.sh     # Stop
```

## Key Directories

- `/database/` - SQLite models and database operations
- `/modules/` - Auto-loaded feature modules (servers, stats, settings, ssh_scripts)
- `/neko-status/` - Go monitoring agent source
- `/views/` - Nunjucks HTML templates
- `/static/` - CSS and JavaScript assets
- `/bot/` - Telegram bot integration

## Database Schema

- `servers` - Server configurations and metadata
- `setting` - Application settings (key-value)
- `traffic` - Network traffic statistics over time
- `load_m`/`load_h` - CPU/memory load data (minute/hour intervals)
- `ssh_scripts` - SSH script storage

## Configuration

- Default port: 5555
- Default password: `nekonekostatus` (change after installation!)
- Go agent config: `neko-status/config.yaml`
- Database backup location: `database/db.db`

## API Endpoints

### Node.js Server
- `/admin/*` - Administrative interface (authentication required)
- `/stats/data` - JSON statistics endpoint
- `/stats/:sid` - Individual server statistics
- WebSocket endpoints for real-time updates

### Go Agent  
- `/stat` - System statistics (CPU, memory, network)
- `/iperf3` - Network performance testing
- `/walled` - Additional monitoring data

## Module System

The application uses auto-loaded modules from `/modules/`. Each module exports:
- `router` - Express router for HTTP endpoints
- `SocketHandler` - WebSocket message handlers
- Template files for UI components

## Authentication

- Cookie-based authentication with UUID tokens
- Admin access required for server management
- API key authentication for Go agent communication

## Agent Auto-Registration

### Quick Setup (No Manual Configuration)
```bash
# Basic auto-registration
curl -sSL http://panel-url:5555/install-agent.sh | bash -s -- --panel=http://panel-url:5555

# With custom group and name
curl -sSL http://panel-url:5555/install-agent.sh | bash -s -- --panel=http://panel-url:5555 --group=Production --name=Web-01
```

### Manual Agent Registration
```bash
# Build and run Go agent with auto-registration
cd neko-status
go build -o neko-status
./neko-status --auto-register --panel=http://panel-url:5555 --group=Production --name=Server-01
```

### Auto-Registration API
- `POST /api/auto-register` - Accept agent registration requests
- `GET /admin/auto-registered` - View auto-registered servers
- Supports automatic group assignment and server naming
- No manual token management required

### Features
- Zero-configuration deployment
- Automatic server discovery
- Group-based organization
- Duplicate registration protection
- System information collection