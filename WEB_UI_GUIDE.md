# F1 Strategy Optimizer Swarm - Web UI Guide 🌐

## Overview

The F1 Strategy Optimizer Swarm now includes a modern web interface with real-time visualization and interactive controls.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Web Browser                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              React Frontend (Vite)                   │  │
│  │  - Dashboard with real-time updates                  │  │
│  │  - Agent status monitoring                           │  │
│  │  - Strategy visualization                            │  │
│  │  - Telemetry displays                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕ WebSocket                        │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - WebSocket Server (real-time communication)        │  │
│  │  - REST API endpoints                                │  │
│  │  - Serves React build                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Swarm Orchestrator                         │  │
│  │  - Coordinates 6 AI agents                           │  │
│  │  - Processes race data                               │  │
│  │  - Generates strategies                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Install Dependencies

```bash
# Install root dependencies (backend + orchestrator)
npm install

# Install web app dependencies (frontend)
npm run web:install

# Or install everything at once
npm run setup
```

### 2. Start the Application

#### Option A: Development Mode (Recommended)

Run backend and frontend simultaneously with hot-reload:

```bash
npm run web-app
```

This starts:
- Backend server on `http://localhost:3000`
- Frontend dev server on `http://localhost:5173`

#### Option B: Production Mode

Build and serve from single server:

```bash
# Build the React app
npm run build

# Start the server (serves both API and React build)
npm run server
```

Access at `http://localhost:3000`

#### Option C: Separate Servers

Terminal 1 - Backend:
```bash
npm run server:dev
```

Terminal 2 - Frontend:
```bash
npm run web
```

## Features

### 1. Real-Time Dashboard

The dashboard displays:
- **Race Information**: Current lap, position, gaps, tire data
- **Strategy Consensus**: Agent recommendations with confidence scores
- **Agent Status**: Live status of all 6 AI agents
- **Telemetry**: Engine temps, brake temps, tire data, ERS/fuel levels
- **Decision Log**: Real-time feed of agent decisions

### 2. Interactive Controls

- **Initialize Swarm**: Activate all AI agents
- **Start Simulation**: Begin automated race simulation
- **Stop Simulation**: Pause the simulation
- Connection status indicator

### 3. Live Updates

All data updates automatically via WebSocket:
- Strategy recommendations every lap
- Agent status changes
- Telemetry updates
- Decision notifications

## API Endpoints

### REST API

```
GET  /api/status              - Get swarm status
POST /api/initialize          - Initialize orchestrator
POST /api/simulation/start    - Start race simulation
POST /api/simulation/stop     - Stop race simulation
POST /api/process             - Process race data (send JSON body)
```

### WebSocket Messages

**Client → Server:**

```javascript
// Initialize swarm
{ type: 'initialize' }

// Start simulation
{ type: 'start-simulation' }

// Stop simulation
{ type: 'stop-simulation' }

// Process custom data
{ type: 'process-data', payload: { ...raceData } }

// Get status
{ type: 'get-status' }
```

**Server → Client:**

```javascript
// Connection confirmation
{ type: 'connection', message: 'Connected...' }

// Strategy update
{ type: 'strategy', data: { consensus, recommendations, ... } }

// Lap update
{ type: 'lap-update', data: { lap, totalLaps, raceData } }

// Agent decision
{ type: 'agent-decision', data: { agentId, decision } }

// Status update
{ type: 'status', data: { orchestrator, agents } }

// Simulation events
{ type: 'simulation-started', data: { currentLap, totalLaps } }
{ type: 'simulation-stopped', data: { message } }
{ type: 'simulation-completed', data: { message } }
```

## Components

### Frontend Structure

```
web/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Header.jsx       # Top navigation bar
│   │   ├── RaceInfo.jsx     # Race stats panel
│   │   ├── StrategyPanel.jsx # Strategy display
│   │   ├── AgentStatus.jsx   # Agent monitoring
│   │   ├── TelemetryPanel.jsx # Telemetry data
│   │   └── AgentDecisions.jsx # Decision log
│   ├── pages/
│   │   └── Dashboard.jsx     # Main dashboard layout
│   ├── hooks/
│   │   └── useWebSocket.js   # WebSocket connection hook
│   ├── App.jsx               # Root component
│   └── main.jsx             # Entry point
├── index.html
├── vite.config.js
└── package.json
```

### Backend Structure

```
swarm/
├── server/
│   └── index.js             # Express + WebSocket server
├── orchestrator/
│   ├── index.js             # Swarm orchestrator
│   └── simulate.js          # CLI simulation
├── agents/                   # 6 AI agents
└── config/
    └── swarm.config.json    # Agent configuration
```

## Development

### Custom Race Data

Send custom race data via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.send(JSON.stringify({
  type: 'process-data',
  payload: {
    currentLap: 30,
    totalLaps: 52,
    position: 3,
    tireAge: 15,
    currentCompound: 'C3',
    // ... more data
  }
}));
```

### Customizing the UI

All component styles are in separate CSS files:
- `Header.css` - Top bar styling
- `Dashboard.css` - Grid layout
- `*.css` - Component-specific styles

Color scheme:
- Primary: `#e10600` (F1 Red)
- Secondary: `#ff6b00` (Orange)
- Background: `#0a0e27` → `#1a1f3a` (Dark gradient)
- Success: `#00ff00` (Green)
- Accent: `#667eea` (Purple)

### Adding New Panels

1. Create component in `web/src/components/`
2. Add to `Dashboard.jsx`
3. Update grid layout in `Dashboard.css`
4. Add WebSocket message handling in `useWebSocket.js`

## Deployment

### Build for Production

```bash
npm run build
```

This creates `web/dist/` with optimized files.

### Deploy to Hosting

The server serves both API and static files. Deploy options:

1. **Node.js Hosting** (Heroku, Railway, Render):
   ```bash
   npm run build
   npm start
   ```

2. **Docker**:
   ```dockerfile
   FROM node:18
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   RUN cd web && npm install && npm run build
   EXPOSE 3000
   CMD ["npm", "run", "server"]
   ```

3. **Static + Serverless**:
   - Deploy `web/dist` to Vercel/Netlify
   - Deploy backend to serverless function
   - Update WebSocket URL in frontend

## Troubleshooting

### WebSocket Connection Issues

- Ensure backend is running on port 3000
- Check browser console for errors
- Verify firewall settings

### Port Already in Use

```bash
# Change port in swarm/server/index.js
const PORT = process.env.PORT || 3001;

# Or set environment variable
PORT=3001 npm run server
```

### Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules web/node_modules
npm run setup
```

## Performance

- **WebSocket**: < 10ms latency for updates
- **Dashboard**: 60fps rendering
- **Simulation**: Updates every 3 seconds (configurable)
- **Concurrent Agents**: 6 agents processing in parallel

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Screenshots

*The web interface features:*
- Modern dark theme with F1-inspired design
- Real-time telemetry visualization
- Agent status indicators with color coding
- Interactive strategy recommendations
- Live decision feed

## Next Steps

- [ ] Add historical lap time charts
- [ ] Implement 3D track visualization
- [ ] Add user authentication
- [ ] Create race replay feature
- [ ] Export strategy reports
- [ ] Mobile-responsive layout improvements

---

**Access the web UI at**: `http://localhost:3000` (production) or `http://localhost:5173` (development)
