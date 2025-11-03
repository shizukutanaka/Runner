const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');
const helmet = require('helmet');
const xss = require('xss');
const config = require('../config');
const logger = require('../logger');
const { metricsCollector } = require('./monitoring');
const monitoringService = require('../services/monitoringService');

let sharedRedisClient = null;
let cleanupRegistered = false;

const registerCleanup = () => {
  if (cleanupRegistered || !sharedRedisClient) {
    return;
  }

  const shutdown = async () => {
    try {
      if (sharedRedisClient?.isOpen) {
        await sharedRedisClient.quit();
        logger.info('[RateLimit] Redis client disconnected');
      }
    } catch (error) {
      logger.warn('[RateLimit] Failed to disconnect Redis client', { error: error.message });
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('beforeExit', shutdown);
  cleanupRegistered = true;
};

const getRedisClient = () => {
  if (sharedRedisClient || config.rateLimit.store !== 'redis') {
    return sharedRedisClient;
  }

  try {
    const client = createClient({ url: config.rateLimit.redisUrl });
    client.on('error', (error) => {
      logger.error('[RateLimit] Redis client error', { error: error.message });
    });
    client.connect().catch((error) => {
      logger.error('[RateLimit] Failed to connect Redis client', { error: error.message });
    });
    sharedRedisClient = client;
    registerCleanup();
  } catch (error) {
    logger.error('[RateLimit] Redis client initialization failed', { error: error.message });
    sharedRedisClient = null;
  }

  return sharedRedisClient;
};

const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests from this IP, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    standardHeaders = true,
    legacyHeaders = false,
    keyGenerator = (req) => {
      // Use X-Forwarded-For header if available (for proxy/load balancer)
      const forwarded = req.headers['x-forwarded-for'];
      const realIP = req.headers['x-real-ip'];
      const clientIP = req.headers['x-client-ip'] || req.ip || req.connection.remoteAddress;
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
      return clientIP;
    }
  } = options;

  const limiterOptions = {
    windowMs,
    max,
    message: { error: message },
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator,
    handler: (req, res) => {
      const context = {
        forwardedIP: req.headers['x-forwarded-for'],
        realIP: req.headers['x-real-ip'],
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl
      };

      logger
        .createRequestLogger(req)
        .withContext(context)
        .warn('[Security] Rate limit exceeded');

      if (metricsCollector?.recordRateLimit) {
        try {
          const clientKey = keyGenerator(req);
          metricsCollector.recordRateLimit(options.limiterName || 'shared', clientKey, {
            method: req.method,
            path: req.originalUrl
          });
        } catch (error) {
          logger.debug('[Security] Failed to record rate limit metric', { error: error.message });
        }
      }

      if (monitoringService?.recordRateLimitViolation) {
        monitoringService.recordRateLimitViolation({
          limiter: options.limiterName || 'shared',
          clientKey: req.headers['x-forwarded-for'] || req.ip,
          method: req.method,
          path: req.originalUrl,
          timestamp: new Date().toISOString()
        });
      }

      // Add delay for repeated violations
      const retryAfter = Math.min(windowMs / 1000, 3600); // Max 1 hour
      res.set('Retry-After', retryAfter.toString());
      res.status(429).json({
        error: message,
        retryAfter: retryAfter
      });
    }
  };

  if (config.rateLimit.store === 'redis') {
    const client = getRedisClient();
    if (client) {
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => client.sendCommand(args),
        prefix: config.rateLimit.redisPrefix
      });
    }
  }

  return rateLimit(limiterOptions);
};

const noopLimiter = (req, res, next) => next();

const buildLimiter = (configNode, extra = {}) => {
  if (!config.rateLimit.enabled) {
    return noopLimiter;
  }
  return createRateLimiter({ ...configNode, ...extra });
};

const strictRateLimit = buildLimiter(config.rateLimit.strict, {
  limiterName: 'strict',
  message: 'Rate limit exceeded for sensitive operations'
});

const generalRateLimit = buildLimiter(config.rateLimit.general, {
  limiterName: 'general'
});

const apiRateLimit = buildLimiter(config.rateLimit.api, {
  limiterName: 'api',
  skipSuccessfulRequests: true
});

const allowedOrigins = config.security?.allowedOrigins || [];
const cspConnectSources = Array.from(new Set(["'self'", ...allowedOrigins, 'https:', 'wss:', 'ws:']));

const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      scriptSrc: ["'self'"],
      connectSrc: cspConnectSources,
      upgradeInsecureRequests: config.environment === 'production' ? [] : null,
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

const validateOrigin = (req, res, next) => {
  const origin = req.get('Origin');
  const referer = req.get('Referer');

  const isAllowed = (candidate) => {
    if (!candidate) {
      return false;
    }

    return allowedOrigins.some((allowed) => {
      if (!allowed) {
        return false;
      }

      if (allowed === '*') {
        return true;
      }

      try {
        const normalizedCandidate = new URL(candidate).origin;
        const normalizedAllowed = new URL(allowed).origin;
        return normalizedCandidate === normalizedAllowed;
      } catch (error) {
        return candidate.startsWith(allowed);
      }
    });
  };

  // Allow requests without origin (mobile apps, etc.)
  if (!origin && !referer) {
    return next();
  }

  // Check origin header
  if (origin && !isAllowed(origin)) {
    logger.warn('[Security] Invalid origin blocked', { 
      origin, 
      referer,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(403).json({ error: 'Forbidden: Invalid origin' });
  }

  // Additional check for referer if origin is missing
  if (!origin && referer) {
    const refererUrl = new URL(referer);
    if (!isAllowed(refererUrl.origin)) {
      logger.warn('[Security] Invalid referer blocked', { 
        referer, 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(403).json({ error: 'Forbidden: Invalid referer' });
    }
  }

  next();
};

const sanitizeInput = (req, res, next) => {
  const sanitize = (value) => {
    if (typeof value === 'string') {
      return xss(value.trim(), {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'iframe', 'style']
      });
    }

    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, sanitize(nestedValue)])
      );
    }

    return value;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('[Request]', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });

  next();
};

module.exports = {
  strictRateLimit,
  generalRateLimit,
  apiRateLimit,
  securityMiddleware,
  validateOrigin,
  sanitizeInput,
  requestLogger,
  createRateLimiter
};