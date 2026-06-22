// WebSocket Scaling with Redis Pub/Sub
// Enables horizontal scaling for Socket.io across multiple server instances

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('../logger');
const config = require('../config');

let pubClient = null;
let subClient = null;
let isInitialized = false;

/**
 * Initialize Redis Pub/Sub adapter for Socket.io
 * Enables multi-instance WebSocket scaling
 *
 * @param {Server} io - Socket.io server instance
 * @returns {Promise<boolean>} Success status
 */
async function initializeRedisAdapter(io) {
  if (!config.redis || !config.redis.url) {
    logger.warn('[WebSocket Scaling] Redis not configured, running in single-instance mode');
    return false;
  }

  try {
    logger.info('[WebSocket Scaling] Initializing Redis Pub/Sub adapter...');

    // Create Redis clients for pub/sub
    pubClient = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('[WebSocket Scaling] Too many Redis reconnection attempts');
            return new Error('Too many retries');
          }
          const delay = Math.min(retries * 50, 2000);
          logger.info(`[WebSocket Scaling] Reconnecting to Redis in ${delay}ms...`);
          return delay;
        }
      }
    });

    subClient = pubClient.duplicate();

    // Error handling
    pubClient.on('error', (err) => {
      logger.error('[WebSocket Scaling] Redis Pub Client error:', err.message);
    });

    subClient.on('error', (err) => {
      logger.error('[WebSocket Scaling] Redis Sub Client error:', err.message);
    });

    // Connection events
    pubClient.on('connect', () => {
      logger.info('[WebSocket Scaling] Redis Pub Client connected');
    });

    subClient.on('connect', () => {
      logger.info('[WebSocket Scaling] Redis Sub Client connected');
    });

    pubClient.on('ready', () => {
      logger.info('[WebSocket Scaling] Redis Pub Client ready');
    });

    subClient.on('ready', () => {
      logger.info('[WebSocket Scaling] Redis Sub Client ready');
    });

    // Connect both clients
    await Promise.all([
      pubClient.connect(),
      subClient.connect()
    ]);

    // Create and attach Redis adapter
    const redisAdapter = createAdapter(pubClient, subClient, {
      key: config.redis.wsAdapterKey || 'socket.io',
      requestsTimeout: 5000
    });

    io.adapter(redisAdapter);

    isInitialized = true;
    logger.info('[WebSocket Scaling] Redis adapter initialized successfully');

    // Monitor adapter events
    io.of('/').adapter.on('create-room', (room) => {
      logger.debug(`[WebSocket Scaling] Room created: ${room}`);
    });

    io.of('/').adapter.on('join-room', (room, id) => {
      logger.debug(`[WebSocket Scaling] Socket ${id} joined room: ${room}`);
    });

    io.of('/').adapter.on('leave-room', (room, id) => {
      logger.debug(`[WebSocket Scaling] Socket ${id} left room: ${room}`);
    });

    io.of('/').adapter.on('delete-room', (room) => {
      logger.debug(`[WebSocket Scaling] Room deleted: ${room}`);
    });

    // Add custom broadcast methods with Redis
    addCustomBroadcastMethods(io);

    return true;

  } catch (error) {
    logger.error('[WebSocket Scaling] Failed to initialize Redis adapter:', error.message);
    isInitialized = false;

    // Cleanup on failure
    if (pubClient) {
      try {
        await pubClient.quit();
      } catch (e) {
        logger.warn('[WebSocket Scaling] Failed to close pub client:', e.message);
      }
    }

    if (subClient) {
      try {
        await subClient.quit();
      } catch (e) {
        logger.warn('[WebSocket Scaling] Failed to close sub client:', e.message);
      }
    }

    return false;
  }
}

/**
 * Add custom broadcast methods for optimized messaging
 */
function addCustomBroadcastMethods(io) {
  /**
   * Broadcast to all connected instances efficiently
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  io.broadcastToAll = function(event, data) {
    io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
      serverId: process.pid
    });
  };

  /**
   * Broadcast to specific room across all instances
   * @param {string} room - Room name
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  io.broadcastToRoom = function(room, event, data) {
    io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
      serverId: process.pid
    });
  };

  /**
   * Get connection count across all instances
   * @returns {Promise<number>} Total connection count
   */
  io.getGlobalConnectionCount = async function() {
    try {
      const sockets = await io.fetchSockets();
      return sockets.length;
    } catch (error) {
      logger.error('[WebSocket Scaling] Failed to get global connection count:', error.message);
      return 0;
    }
  };

  /**
   * Get room member count across all instances
   * @param {string} room - Room name
   * @returns {Promise<number>} Member count
   */
  io.getRoomMemberCount = async function(room) {
    try {
      const sockets = await io.in(room).fetchSockets();
      return sockets.length;
    } catch (error) {
      logger.error('[WebSocket Scaling] Failed to get room member count:', error.message);
      return 0;
    }
  };

  logger.info('[WebSocket Scaling] Custom broadcast methods added');
}

/**
 * Get scaling statistics
 * @returns {Object} Scaling statistics
 */
async function getScalingStats() {
  if (!isInitialized) {
    return {
      enabled: false,
      message: 'Redis adapter not initialized'
    };
  }

  try {
    // Get Redis info
    const info = await pubClient.info('server');
    const stats = await pubClient.info('stats');

    return {
      enabled: true,
      redis: {
        connected: pubClient.isOpen && subClient.isOpen,
        pubClientReady: pubClient.isReady,
        subClientReady: subClient.isReady,
        serverInfo: parseRedisInfo(info),
        stats: parseRedisInfo(stats)
      },
      serverId: process.pid,
      uptime: process.uptime()
    };
  } catch (error) {
    logger.error('[WebSocket Scaling] Failed to get scaling stats:', error.message);
    return {
      enabled: true,
      error: error.message
    };
  }
}

/**
 * Parse Redis INFO command output
 * @param {string} info - Redis INFO output
 * @returns {Object} Parsed info
 */
function parseRedisInfo(info) {
  const lines = info.split('\r\n');
  const parsed = {};

  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        parsed[key] = value;
      }
    }
  }

  return parsed;
}

/**
 * Cleanup Redis connections
 * @returns {Promise<void>}
 */
async function cleanup() {
  logger.info('[WebSocket Scaling] Cleaning up Redis connections...');

  const closePromises = [];

  if (pubClient && pubClient.isOpen) {
    closePromises.push(
      pubClient.quit()
        .then(() => logger.info('[WebSocket Scaling] Pub client disconnected'))
        .catch(err => logger.warn('[WebSocket Scaling] Pub client disconnect error:', err.message))
    );
  }

  if (subClient && subClient.isOpen) {
    closePromises.push(
      subClient.quit()
        .then(() => logger.info('[WebSocket Scaling] Sub client disconnected'))
        .catch(err => logger.warn('[WebSocket Scaling] Sub client disconnect error:', err.message))
    );
  }

  await Promise.allSettled(closePromises);
  isInitialized = false;
  logger.info('[WebSocket Scaling] Cleanup completed');
}

// Graceful shutdown handlers
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
process.once('beforeExit', cleanup);

module.exports = {
  initializeRedisAdapter,
  getScalingStats,
  cleanup,
  isInitialized: () => isInitialized
};
