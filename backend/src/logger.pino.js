/**
 * Pino Logger Implementation (High Performance Alternative to Winston)
 *
 * Performance Benefits:
 * - 3-5x faster than Winston
 * - Lower CPU usage
 * - Smaller memory footprint
 * - Built-in serializers for common objects
 *
 * Installation:
 * npm install pino pino-pretty
 *
 * Usage:
 * Replace require('./logger') with require('./logger.pino') throughout the codebase
 */

const pino = require('pino');
const config = require('./config');

// Pino logger configuration
const logger = pino({
  level: config.logging?.level || process.env.LOG_LEVEL || 'info',

  // Development mode with pretty printing
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,

  // Base context for all logs
  base: {
    service: 'runner-backend',
    environment: config.environment || process.env.NODE_ENV || 'development',
    hostname: require('os').hostname()
  },

  // Automatic serializers for common objects
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  },

  // Format timestamps
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

/**
 * Create child logger with request context
 * @param {Object} req - Express request object
 * @returns {Object} Pino child logger
 */
const createRequestLogger = (req) => {
  return logger.child({
    requestId: req.id || req.headers?.['x-request-id'] || null,
    correlationId: req.headers?.['x-correlation-id'] || null,
    userId: req.user?.id || null,
    ip: req.ip || null,
    userAgent: typeof req.get === 'function' ? req.get('User-Agent') : null,
    method: req.method || null,
    path: req.originalUrl || req.url || null
  });
};

/**
 * Create child logger with custom context
 * @param {Object} context - Additional context for logging
 * @returns {Object} Pino child logger
 */
const withContext = (context = {}) => {
  return logger.child(context);
};

/**
 * Build request context object (for compatibility with Winston logger)
 * @param {Object} req - Express request object
 * @returns {Object} Request context
 */
const buildRequestContext = (req = {}) => ({
  requestId: req.id || req.headers?.['x-request-id'] || null,
  correlationId: req.headers?.['x-correlation-id'] || null,
  userId: req.user?.id || null,
  ip: req.ip || null,
  userAgent: typeof req.get === 'function' ? req.get('User-Agent') : null,
  method: req.method || null,
  path: req.originalUrl || req.url || null
});

// Add compatibility methods for Winston API
logger.withContext = withContext;
logger.buildRequestContext = buildRequestContext;
logger.createRequestLogger = createRequestLogger;

// Example usage:
// logger.info('Server started successfully', { port: 4000 });
// logger.error('Database connection failed', { error: err.message });
// logger.warn('Rate limit exceeded', { userId: 123, path: '/api/comments' });
// logger.debug('Cache hit', { key: 'comments:list', ttl: 300 });
//
// With request context:
// const reqLogger = logger.createRequestLogger(req);
// reqLogger.info('User logged in successfully');

module.exports = logger;
