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

/**
 * Enhanced Security Middleware with OWASP Compliance
 *
 * Implements comprehensive security headers including:
 * - Content Security Policy (CSP) with strict directives
 * - HTTP Strict Transport Security (HSTS) with preload
 * - Permissions Policy for feature control
 * - Enhanced XSS and clickjacking protection
 *
 * Security Improvements:
 * - OWASP Top 10 compliance
 * - HSTS Preload eligible
 * - Subresource Integrity (SRI) ready
 * - Modern browser security features
 */
const securityMiddleware = helmet({
  // Content Security Policy - Strict configuration
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      // Script sources - Consider adding nonce or hash for inline scripts
      scriptSrc: [
        "'self'",
        // Add 'nonce-{random}' or specific hashes for inline scripts in production
        // Example: "'sha256-{hash}'" for specific inline scripts
      ],

      // Style sources - Allow inline styles for Material-UI
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Material-UI and dynamic styles
        'https://fonts.googleapis.com'
      ],

      // Font sources
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'data:' // For inline font data
      ],

      // Image sources
      imgSrc: [
        "'self'",
        'data:',
        'https:',
        'blob:'
      ],

      // Connection sources (API, WebSocket)
      connectSrc: cspConnectSources,

      // Media sources
      mediaSrc: ["'self'"],

      // Worker sources
      workerSrc: ["'self'", 'blob:'],

      // Child frame sources
      childSrc: ["'self'"],

      // Frame ancestors - Prevent clickjacking
      frameAncestors: ["'none'"],

      // Object sources - Block plugins
      objectSrc: ["'none'"],

      // Base URI restriction
      baseUri: ["'self'"],

      // Form action restriction
      formAction: ["'self'"],

      // Upgrade insecure requests in production
      upgradeInsecureRequests: config.environment === 'production' ? [] : null,

      // Block all mixed content
      blockAllMixedContent: config.environment === 'production' ? [] : null
    },

    // Report CSP violations (optional - requires endpoint)
    reportOnly: false
  },

  // HTTP Strict Transport Security (HSTS) with Preload
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true // Eligible for HSTS preload list
  },

  // X-Frame-Options (additional protection)
  frameguard: {
    action: 'deny'
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-Download-Options
  ieNoOpen: true,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false
  },

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  },

  // Cross-Origin policies
  crossOriginEmbedderPolicy: false, // Set to true if using SharedArrayBuffer
  crossOriginResourcePolicy: {
    policy: 'cross-origin' // Allow cross-origin resource sharing
  },
  crossOriginOpenerPolicy: {
    policy: 'same-origin'
  },

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },

  // Hide X-Powered-By header
  hidePoweredBy: true
});

/**
 * Permissions Policy (formerly Feature Policy)
 *
 * Controls which browser features can be used in the application.
 * Follows principle of least privilege.
 */
const permissionsPolicy = (req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=(self)',
      'battery=()',
      'camera=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'execution-while-not-rendered=()',
      'execution-while-out-of-viewport=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'navigation-override=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=(self)',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()'
    ].join(', ')
  );
  next();
};

/**
 * Additional Security Headers
 *
 * Adds extra security headers not covered by helmet
 */
const additionalSecurityHeaders = (req, res, next) => {
  // Expect-CT header (Certificate Transparency)
  if (config.environment === 'production') {
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }

  // X-XSS-Protection (legacy but still useful for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Clear-Site-Data on logout endpoints
  if (req.path === '/api/auth/logout' || req.path === '/api/users/logout') {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  }

  next();
};

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
      const sanitized = xss(value.trim(), {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'iframe', 'style']
      });
      // タグ除去で生じた連続空白（例: "Hello <script>...</script> world" -> "Hello  world"）を1つに正規化
      return sanitized.replace(/\s+/g, ' ').trim();
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
  permissionsPolicy,
  additionalSecurityHeaders,
  validateOrigin,
  sanitizeInput,
  requestLogger,
  createRateLimiter
};