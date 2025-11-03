const rateLimit = require('express-rate-limit');
const { createClient } = require('redis');
const RedisStore = require('rate-limit-redis').default;
const logger = require('../logger');
const config = require('../config');

// Redis client for distributed rate limiting
let redisClient = null;
if (config.getEnv('REDIS_URL')) {
  redisClient = createClient({
    url: config.getEnv('REDIS_URL'),
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
    }
  });

  redisClient.on('error', (err) => logger.error('[RateLimiter] Redis error:', err));
  redisClient.connect().catch((err) => {
    logger.error('[RateLimiter] Failed to connect to Redis:', err);
    redisClient = null;
  });
}

// Security headers for rate limiting
const securityHeaders = (req, res, next) => {
  res.setHeader('X-RateLimit-Policy', 'fixed-window');
  res.setHeader('X-RateLimit-Service', 'comment-manager');
  next();
};

// Create rate limiter with Redis store for distributed systems
const createLimiter = (options) => {
  const defaultOptions = {
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('[RateLimiter] Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.id
      });
      res.status(429).json({
        status: 429,
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  };

  if (redisClient) {
    return rateLimit({
      ...defaultOptions,
      ...options,
      store: new RedisStore({
        client: redisClient,
        prefix: `rl:${options.prefix || 'default'}:`
      })
    });
  }

  return rateLimit({
    ...defaultOptions,
    ...options
  });
};

// Different rate limiters for different endpoints
const limiters = {
  // Strict limit for auth endpoints
  auth: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    prefix: 'auth',
    skipSuccessfulRequests: false
  }),

  // Standard API rate limit
  api: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    prefix: 'api',
    skip: (req) => req.user?.role === 'admin'
  }),

  // Comments creation limit
  createComment: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    prefix: 'comment-create',
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // AI moderation limit
  moderation: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    prefix: 'moderation'
  }),

  // File upload limit
  upload: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    prefix: 'upload'
  }),

  // Export/download limit
  export: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    prefix: 'export'
  }),

  // WebSocket connection limit
  websocket: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    prefix: 'websocket'
  })
};

// Dynamic rate limiting based on user tier
const dynamicRateLimiter = (req, res, next) => {
  const userTier = req.user?.tier || 'free';
  const tierLimits = {
    enterprise: 10000,
    pro: 1000,
    standard: 500,
    free: 100
  };

  const limiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: tierLimits[userTier],
    prefix: `tier-${userTier}`,
    keyGenerator: (req) => req.user?.id || req.ip
  });

  limiter(req, res, next);
};

// Distributed DDoS protection
const ddosProtection = createLimiter({
  windowMs: 1000, // 1 second
  max: 50, // 50 requests per second max
  prefix: 'ddos',
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.error('[DDoS] Potential attack detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    res.status(503).json({
      status: 503,
      error: 'Service temporarily unavailable'
    });
  }
});

// Cleanup on shutdown
const cleanup = async () => {
  if (redisClient) {
    await redisClient.quit();
  }
};

module.exports = {
  securityHeaders,
  limiters,
  dynamicRateLimiter,
  ddosProtection,
  cleanup
};