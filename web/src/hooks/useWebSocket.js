import { useState, useEffect, useCallback, useRef } from 'react';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [strategy, setStrategy] = useState(null);
  const [raceData, setRaceData] = useState(null);
  const [agentDecisions, setAgentDecisions] = useState([]);
  const [simulationStatus, setSimulationStatus] = useState({
    running: false,
    currentLap: 0,
    totalLaps: 0
  });
  const [swarmStatus, setSwarmStatus] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || 3000}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  }, []);

  const handleMessage = (message) => {
    const { type, data } = message;

    switch (type) {
      case 'connection':
        console.log('Connection established:', message.message);
        break;

      case 'strategy':
        setStrategy(data);
        break;

      case 'lap-update':
        setRaceData(data.raceData);
        setSimulationStatus({
          running: true,
          currentLap: data.lap,
          totalLaps: data.totalLaps
        });
        break;

      case 'agent-decision':
        setAgentDecisions(prev => [...prev.slice(-20), data]); // Keep last 20
        break;

      case 'status':
        setSwarmStatus(data);
        break;

      case 'simulation-started':
        setSimulationStatus({
          running: true,
          currentLap: data.currentLap,
          totalLaps: data.totalLaps
        });
        break;

      case 'simulation-stopped':
      case 'simulation-completed':
        setSimulationStatus(prev => ({
          ...prev,
          running: false
        }));
        break;

      case 'initialized':
        console.log('Swarm initialized');
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  };

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    connected,
    strategy,
    raceData,
    agentDecisions,
    simulationStatus,
    swarmStatus,
    sendMessage
  };
}
