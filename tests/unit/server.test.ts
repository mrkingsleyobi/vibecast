/**
 * Tests for VibeCast Server
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { VibeCastServer, createServer, DEFAULT_CONFIG } from '../../src/server/index.js';
import { BoundedContext } from '../../src/common/events.js';

describe('VibeCast Server', () => {
  let server: VibeCastServer;

  beforeEach(() => {
    server = createServer({ nodeId: 1, port: 5433 });
  });

  it('should create with default config', () => {
    const s = createServer();
    expect(s.getConfig().port).toBe(DEFAULT_CONFIG.port);
    expect(s.getConfig().nodeId).toBe(DEFAULT_CONFIG.nodeId);
  });

  it('should merge custom config with defaults', () => {
    expect(server.getConfig().nodeId).toBe(1);
    expect(server.getConfig().port).toBe(5433);
    expect(server.getConfig().maxConnections).toBe(DEFAULT_CONFIG.maxConnections);
  });

  it('should start and stop', async () => {
    expect(server.isRunning()).toBe(false);
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  it('should not double-start', async () => {
    await server.start();
    await server.start(); // should be no-op
    expect(server.isRunning()).toBe(true);
  });

  it('should not double-stop', async () => {
    await server.stop(); // should be no-op when not running
    expect(server.isRunning()).toBe(false);
  });

  it('should provide event bus', () => {
    const bus = server.getEventBus();
    expect(bus).toBeDefined();
    expect(typeof bus.emit).toBe('function');
  });

  it('should report healthy status initially', () => {
    const health = server.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.metrics.totalEvents).toBe(0);
  });

  it('should track context health', () => {
    server.setContextStatus(BoundedContext.Storage, 'degraded');
    const health = server.getHealth();
    expect(health.status).toBe('degraded');
    expect(health.contexts[BoundedContext.Storage].status).toBe('degraded');
  });

  it('should report unhealthy when context is down', () => {
    server.setContextStatus(BoundedContext.Consensus, 'down');
    const health = server.getHealth();
    expect(health.status).toBe('unhealthy');
  });

  it('should emit events on start', async () => {
    const events: string[] = [];
    server.getEventBus().onAll((e) => events.push(e.eventType));
    await server.start();
    expect(events).toContain('ServerStarted');
  });

  it('should track uptime', async () => {
    await server.start();
    const health = server.getHealth();
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should count events in health metrics', async () => {
    const bus = server.getEventBus();
    const { createEvent } = await import('../../src/common/events.js');
    await bus.emit(createEvent('Test1', BoundedContext.Storage, {}));
    await bus.emit(createEvent('Test2', BoundedContext.Query, {}));
    const health = server.getHealth();
    expect(health.metrics.totalEvents).toBe(2);
  });
});
