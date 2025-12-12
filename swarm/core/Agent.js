import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base Agent class for F1 Strategy Optimizer Swarm
 * All specialized agents inherit from this base class
 */
export class Agent extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id || uuidv4();
    this.type = config.type;
    this.priority = config.priority || 2;
    this.enabled = config.enabled !== false;
    this.config = config.config || {};
    this.state = 'idle';
    this.lastUpdate = null;
    this.decisions = [];
    this.confidence = 0;
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    this.state = 'initializing';
    this.emit('state-change', { state: this.state });
    console.log(`[${this.type}] Initializing agent ${this.id}...`);

    await this.setup();

    this.state = 'ready';
    this.emit('state-change', { state: this.state });
    console.log(`[${this.type}] Agent ${this.id} ready`);
  }

  /**
   * Override this method in child classes for custom setup
   */
  async setup() {
    // Default implementation
  }

  /**
   * Process incoming data and make decisions
   */
  async process(data) {
    this.state = 'processing';
    this.emit('state-change', { state: this.state });

    try {
      const result = await this.analyze(data);
      this.lastUpdate = new Date();
      this.state = 'ready';
      this.emit('state-change', { state: this.state });

      return result;
    } catch (error) {
      this.state = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Override this method in child classes for custom analysis
   */
  async analyze(data) {
    throw new Error('analyze() must be implemented by child class');
  }

  /**
   * Make a decision based on analysis
   */
  makeDecision(analysis, confidence) {
    const decision = {
      id: uuidv4(),
      agentId: this.id,
      agentType: this.type,
      timestamp: new Date(),
      analysis,
      confidence,
      priority: this.priority
    };

    this.decisions.push(decision);
    this.confidence = confidence;
    this.emit('decision', decision);

    return decision;
  }

  /**
   * Communicate with other agents
   */
  sendMessage(channel, message) {
    this.emit('message', {
      channel,
      from: this.id,
      message,
      timestamp: new Date()
    });
  }

  /**
   * Receive message from other agents
   */
  receiveMessage(message) {
    this.emit('message-received', message);
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      priority: this.priority,
      enabled: this.enabled,
      lastUpdate: this.lastUpdate,
      confidence: this.confidence,
      decisionsCount: this.decisions.length
    };
  }

  /**
   * Shutdown the agent
   */
  async shutdown() {
    this.state = 'shutdown';
    this.emit('state-change', { state: this.state });
    console.log(`[${this.type}] Agent ${this.id} shutting down`);
  }
}

export default Agent;
