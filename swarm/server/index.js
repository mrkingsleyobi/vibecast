import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SwarmOrchestrator } from '../orchestrator/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../../web/dist')));

// Initialize orchestrator
let orchestrator = null;
let currentRaceData = null;
let isSimulating = false;
let simulationInterval = null;

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to F1 Strategy Optimizer Swarm'
  }));

  // Send current status if orchestrator is initialized
  if (orchestrator) {
    ws.send(JSON.stringify({
      type: 'status',
      data: orchestrator.getStatus()
    }));
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleClientMessage(data, ws);
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

async function handleClientMessage(data, ws) {
  const { type, payload } = data;

  switch (type) {
    case 'initialize':
      await initializeOrchestrator();
      broadcast({ type: 'initialized', message: 'Swarm initialized successfully' });
      break;

    case 'start-simulation':
      await startSimulation();
      break;

    case 'stop-simulation':
      stopSimulation();
      break;

    case 'process-data':
      if (orchestrator && payload) {
        const strategy = await orchestrator.processRaceData(payload);
        ws.send(JSON.stringify({ type: 'strategy', data: strategy }));
      }
      break;

    case 'get-status':
      if (orchestrator) {
        ws.send(JSON.stringify({
          type: 'status',
          data: orchestrator.getStatus()
        }));
      }
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${type}`
      }));
  }
}

async function initializeOrchestrator() {
  if (!orchestrator) {
    orchestrator = new SwarmOrchestrator();
    await orchestrator.initialize();

    // Listen to agent decisions
    orchestrator.on('agent-decision', (data) => {
      broadcast({
        type: 'agent-decision',
        data
      });
    });
  }
}

async function startSimulation() {
  if (isSimulating) {
    return;
  }

  await initializeOrchestrator();
  isSimulating = true;

  let currentLap = 1;
  const totalLaps = 52;

  broadcast({
    type: 'simulation-started',
    data: { currentLap, totalLaps }
  });

  simulationInterval = setInterval(async () => {
    if (currentLap > totalLaps) {
      stopSimulation();
      broadcast({
        type: 'simulation-completed',
        data: { message: 'Race simulation completed' }
      });
      return;
    }

    const lapData = generateLapData(currentLap, totalLaps);
    currentRaceData = lapData;

    // Broadcast lap update
    broadcast({
      type: 'lap-update',
      data: { lap: currentLap, totalLaps, raceData: lapData }
    });

    // Process through swarm
    const strategy = await orchestrator.processRaceData(lapData);

    // Broadcast strategy
    broadcast({
      type: 'strategy',
      data: strategy
    });

    currentLap++;
  }, 3000); // Update every 3 seconds
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  isSimulating = false;

  broadcast({
    type: 'simulation-stopped',
    data: { message: 'Simulation stopped' }
  });
}

function generateLapData(currentLap, totalLaps) {
  const baseScenario = {
    track: 'Silverstone Circuit',
    currentLap,
    totalLaps,
    position: 5 + Math.floor(Math.random() * 3 - 1),
    tireAge: currentLap > 1 ? (currentLap - 1) % 25 : 0,
    currentCompound: currentLap < 20 ? 'C3' : (currentLap < 40 ? 'C2' : 'C3'),
    gapToCarAhead: 2.0 + Math.random() * 2,
    gapToCarBehind: 1.5 + Math.random() * 2,
    currentWeather: 'cloudy',
    temperature: 22 + Math.random() * 3,
    humidity: 65 + Math.random() * 10,
    windSpeed: 15 + Math.random() * 5,
    windDirection: 'SW',
    pressure: 1013 - Math.random() * 5,
    trackTemp: 38 + Math.random() * 5,
    trackPosition: 'mid-field',
    trackCondition: 'dry',
    engineTemp: 95 + Math.random() * 10,
    brakeTemps: {
      frontLeft: 400 + Math.random() * 100,
      frontRight: 400 + Math.random() * 100,
      rearLeft: 350 + Math.random() * 80,
      rearRight: 350 + Math.random() * 80
    },
    tireTemps: {
      frontLeft: 85 + Math.random() * 15,
      frontRight: 85 + Math.random() * 15,
      rearLeft: 82 + Math.random() * 15,
      rearRight: 82 + Math.random() * 15
    },
    tirePressures: {
      frontLeft: 23.0 + Math.random() * 1,
      frontRight: 23.0 + Math.random() * 1,
      rearLeft: 20.5 + Math.random() * 1,
      rearRight: 20.5 + Math.random() * 1
    },
    fuelRemaining: 110 - (currentLap * 1.8),
    ersCharge: 2000000 + Math.random() * 2000000,
    speed: 250 + Math.random() * 50,
    gear: Math.floor(Math.random() * 8) + 1,
    throttle: 0.7 + Math.random() * 0.3,
    brake: Math.random() > 0.8 ? Math.random() * 0.5 : 0,
    drs: Math.random() > 0.5,
    lapTime: 89.0 + Math.random() * 2,
    targetLapTime: 89.8,
    sector: Math.floor(Math.random() * 3) + 1,
    safetyCarOut: false,
    virtualSafetyCar: false,
    yellowFlag: false
  };

  return baseScenario;
}

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  });
}

// REST API Endpoints
app.get('/api/status', (req, res) => {
  if (!orchestrator) {
    return res.json({ initialized: false });
  }

  res.json({
    initialized: true,
    status: orchestrator.getStatus(),
    isSimulating,
    currentLap: currentRaceData?.currentLap || 0
  });
});

app.post('/api/initialize', async (req, res) => {
  try {
    await initializeOrchestrator();
    res.json({ success: true, message: 'Orchestrator initialized' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/simulation/start', async (req, res) => {
  try {
    await startSimulation();
    res.json({ success: true, message: 'Simulation started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/simulation/stop', (req, res) => {
  stopSimulation();
  res.json({ success: true, message: 'Simulation stopped' });
});

app.post('/api/process', async (req, res) => {
  try {
    if (!orchestrator) {
      await initializeOrchestrator();
    }

    const strategy = await orchestrator.processRaceData(req.body);
    res.json({ success: true, strategy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/dist/index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`\n🏎️  F1 Strategy Optimizer Swarm - Web Server`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready for connections\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  stopSimulation();
  if (orchestrator) {
    await orchestrator.shutdown();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
