const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { randomUUID } = require('crypto');
const compression = require('compression');
const logger = require('./logger');
const authRouter = require('./routes/auth');
const commentsRouter = require('./routes/comments');
const usersRouter = require('./routes/users');
const moderationRouter = require('./routes/moderation');
const notificationsRouter = require('./routes/notifications');
const analyticsRouter = require('./routes/analytics');
const settingsRouter = require('./routes/settings');
const uiRouter = require('./routes/ui');
const billingRouter = require('./routes/billing');
const youtubeRouter = require('./routes/youtube');
const papersRouter = require('./routes/papers');
const integratedAnalysisRouter = require('./routes/integratedAnalysis');
const advancedAIServicesRouter = require('./routes/advancedAIServices');
const innovativeTechnologiesRouter = require('./routes/innovativeTechnologies');
const communityInsightsRouter = require('./routes/communityInsights');
const billingController = require('./controllers/billingController');
const config = require('./config');
const { errorHandler, notFoundHandler, requestTimeout } = require('./middleware/errorHandler');
const {
  metricsMiddleware,
  healthCheckHandler,
  detailedHealthCheckHandler,
  metricsHandler
} = require('./middleware/monitoring');
const {
  securityMiddleware,
  permissionsPolicy,
  additionalSecurityHeaders,
  validateOrigin,
  sanitizeInput,
  requestLogger,
  generalRateLimit,
  apiRateLimit
} = require('./middleware/security');
const { initializeI18n, setLanguage } = require('./i18n');

const app = express();
app.disable('x-powered-by');

const buildSessionOptions = () => {
  const baseOptions = {
    name: config.session.name,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: Boolean(config.session.rolling),
    proxy: Boolean(config.server.trustProxy),
    cookie: { ...config.session.cookie }
  };

  const { sessionStore } = config;
  if (sessionStore?.type === 'redis' && sessionStore.redisUrl) {
    try {
      const RedisStore = require('connect-redis').default;
      const { createClient } = require('redis');

      const redisClient = createClient({ url: sessionStore.redisUrl });

      redisClient.on('error', (error) => {
        logger.error('[Session] Redis client error', { error: error.message });
      });

      redisClient.on('ready', () => {
        logger.info('[Session] Redis client ready');
      });

      redisClient.connect().catch((error) => {
        logger.error('[Session] Failed to connect to Redis session store', { error: error.message });
      });

      baseOptions.store = new RedisStore({
        client: redisClient,
        prefix: sessionStore.prefix,
        disableTouch: !baseOptions.rolling
      });

      const cleanup = async () => {
        if (redisClient?.isOpen) {
          try {
            await redisClient.quit();
            logger.info('[Session] Redis client disconnected');
          } catch (error) {
            logger.warn('[Session] Redis client disconnect failed', { error: error.message });
          }
        }
      };

      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
      process.once('beforeExit', cleanup);
    } catch (error) {
      logger.error('[Session] Redis session store initialisation failed, falling back to memory store', {
        error: error.message
      });
    }
  }

  return baseOptions;
};

const sessionOptions = buildSessionOptions();

const isOriginAllowed = (origin = '') => {
  const allowed = config.security.allowedOrigins;

  return allowed.some((item) => {
    if (!item) {
      return false;
    }

    if (item === '*') {
      return true;
    }

    try {
      const normalizedOrigin = new URL(origin).origin;
      const normalizedAllowed = new URL(item).origin;
      return normalizedOrigin === normalizedAllowed;
    } catch (error) {
      return origin.startsWith(item);
    }
  });
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    logger.warn('[Security] CORS origin rejected', { origin });
    const corsError = new Error('Not allowed by CORS');
    corsError.status = 403;
    corsError.code = 'CORS_NOT_ALLOWED';
    corsError.origin = origin;
    return callback(corsError, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: config.security.corsMaxAge
};

// Trust proxy for deployments behind load balancers when configured
if (config.server.trustProxy) {
  app.set('trust proxy', config.server.trustProxy);
}

// Security middleware (applied first)
app.use(securityMiddleware);
app.use(permissionsPolicy);
app.use(additionalSecurityHeaders);
app.use(compression({ threshold: 1024 }));
app.use(requestLogger);
app.use(generalRateLimit);

// Session management
app.use(session(sessionOptions));

// Enforce HTTPS when requested
app.use((req, res, next) => {
  if (!config.security.enforceHttps) {
    return next();
  }

  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (!isSecure) {
    const target = `https://${req.headers.host}${req.originalUrl}`;
    return res.redirect(301, target);
  }

  return next();
});

app.use(validateOrigin);

// CORS and body parsing
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingController.handleWebhook);

// 入力サイズ制限（DoS対策）
app.use(express.json({
  limit: '1mb', // 1MBに制限（10MBから削減）
  verify: (req, res, buf, encoding) => {
    // 入力サイズの追加チェック
    if (buf.length > 1048576) { // 1MB
      throw new Error('Request entity too large');
    }

    if (buf?.length) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '1mb',
  parameterLimit: 100, // パラメータ数を100に制限
  verify: (req, res, buf, encoding) => {
    if (buf.length > 1048576) {
      throw new Error('Request entity too large');
    }

    if (buf?.length) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

app.use(sanitizeInput);

// Request timeout
app.use(requestTimeout(config.security.requestTimeoutMs));

// Request ID middleware
app.use((req, res, next) => {
  const requestId = randomUUID();
  req.id = requestId;
  res.set('X-Request-ID', requestId);
  next();
});

// Monitoring middleware
app.use(metricsMiddleware);

// Health check and metrics endpoints (before rate limiting)
app.get('/health', healthCheckHandler);
app.get('/health/detailed', detailedHealthCheckHandler);
app.get('/metrics', metricsHandler);

// API routes with rate limiting
app.use('/api', apiRateLimit);
app.use('/api/comments', commentsRouter);
// authRouter は usersRouter より先にマウントする（usersRouter の GET/PUT /:id が
// /register, /login, /me 等の静的パスを誤って捕捉するのを防ぐため）
app.use('/api/users', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ui', uiRouter);
app.use('/api/billing', billingRouter);
app.use('/api/youtube', youtubeRouter);
app.use('/api/papers', papersRouter);
app.use('/api/analysis', integratedAnalysisRouter);
app.use('/api/ai', advancedAIServicesRouter);
app.use('/api/innovative', innovativeTechnologiesRouter);
app.use('/api/insights',   communityInsightsRouter);
app.use('/api/monitoring', require('./routes/monitoring'));

// Fallback handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
