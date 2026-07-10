const logger = require('../logger');
const config = require('../config');
const { withRetry } = require('../utils/retryMechanism');

const isDevelopment = config.environment === 'development';

const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Enhanced error classification
// Enhanced error messages for better UX
const getErrorMessage = (errorType, error) => {
  switch (errorType) {
    case ErrorTypes.VALIDATION_ERROR:
      return '入力データに問題があります。必要項目を確認してください。';
    case ErrorTypes.AUTHENTICATION_ERROR:
      return '認証が必要です。ログインしてください。';
    case ErrorTypes.AUTHORIZATION_ERROR:
      return 'この操作を実行する権限がありません。';
    case ErrorTypes.NOT_FOUND_ERROR:
      return 'リクエストされたリソースが見つかりません。';
    case ErrorTypes.CONFLICT_ERROR:
      return 'リソースの競合が発生しました。';
    case ErrorTypes.RATE_LIMIT_ERROR:
      return 'リクエストが多すぎます。しばらく待ってから再試行してください。';
    case ErrorTypes.DATABASE_ERROR:
      return 'データベースエラーが発生しました。しばらく待ってから再試行してください。';
    case ErrorTypes.NETWORK_ERROR:
      return 'ネットワークエラーが発生しました。接続を確認してください。';
    case ErrorTypes.EXTERNAL_API_ERROR:
      return '外部サービスエラーが発生しました。しばらく待ってから再試行してください。';
    default:
      return '予期しないエラーが発生しました。サポートチームにお問い合わせください。';
  }
};

// Error recovery strategies
const RecoveryStrategies = {
  RETRY: 'retry',
  DEGRADATION: 'degradation',
  FALLBACK: 'fallback',
  ALERT: 'alert',
  IGNORE: 'ignore'
};

// Error classification function
function classifyError(error) {
  if (error.name === 'ValidationError' || error.status === 400) {
    return ErrorTypes.VALIDATION_ERROR;
  }

  if (error.status === 401 || error.name === 'UnauthorizedError') {
    return ErrorTypes.AUTHENTICATION_ERROR;
  }

  if (error.status === 403 || error.name === 'ForbiddenError') {
    return ErrorTypes.AUTHORIZATION_ERROR;
  }

  if (error.status === 404 || error.name === 'NotFoundError') {
    return ErrorTypes.NOT_FOUND_ERROR;
  }

  if (error.status === 409 || error.name === 'ConflictError') {
    return ErrorTypes.CONFLICT_ERROR;
  }

  if (error.status === 429 || error.name === 'RateLimitError') {
    return ErrorTypes.RATE_LIMIT_ERROR;
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return ErrorTypes.NETWORK_ERROR;
  }

  if (error.code?.startsWith('SQLITE_') || error.message?.includes('database')) {
    return ErrorTypes.DATABASE_ERROR;
  }

  if (error.message?.includes('API') || error.status >= 500) {
    return ErrorTypes.EXTERNAL_API_ERROR;
  }

  return ErrorTypes.UNKNOWN_ERROR;
}

// Recovery strategy selector
function getRecoveryStrategy(errorType, error, req) {
  switch (errorType) {
    case ErrorTypes.NETWORK_ERROR:
    case ErrorTypes.EXTERNAL_API_ERROR:
      return RecoveryStrategies.RETRY;

    case ErrorTypes.DATABASE_ERROR:
      // Check if it's a temporary database issue
      if (error.code === 'SQLITE_BUSY' || error.message?.includes('locked')) {
        return RecoveryStrategies.RETRY;
      }
      return RecoveryStrategies.ALERT;

    case ErrorTypes.RATE_LIMIT_ERROR:
      return RecoveryStrategies.DEGRADATION;

    case ErrorTypes.CONFIGURATION_ERROR:
      return RecoveryStrategies.ALERT;

    case ErrorTypes.VALIDATION_ERROR:
    case ErrorTypes.AUTHENTICATION_ERROR:
    case ErrorTypes.AUTHORIZATION_ERROR:
    case ErrorTypes.NOT_FOUND_ERROR:
    case ErrorTypes.CONFLICT_ERROR:
      return RecoveryStrategies.IGNORE; // These are client errors

    default:
      return RecoveryStrategies.ALERT;
  }
}

// 最近のリトライ追跡（メモリ内、本番はRedis推奨）
const recentRetries = new Map();
const RETRY_WINDOW_MS = 60_000;
const MAX_RETRIES = 3;

// Error recovery executor
async function executeRecovery(strategy, error, req, res) {
  const key = `${req.method}:${req.originalUrl}`;

  switch (strategy) {
    case RecoveryStrategies.RETRY: {
      const now = Date.now();
      const entry = recentRetries.get(key) || { count: 0, firstAt: now };
      if (now - entry.firstAt > RETRY_WINDOW_MS) {
        entry.count = 0;
        entry.firstAt = now;
      }
      entry.count++;
      recentRetries.set(key, entry);

      logger.warn('[ErrorHandler] Retry strategy', {
        error: error.message,
        url: req.originalUrl,
        retryCount: entry.count,
        maxRetries: MAX_RETRIES
      });

      // リトライ回数をレスポンスヘッダーで通知
      if (res && !res.headersSent) {
        const retryAfter = Math.min(entry.count * 2, 30);
        res.setHeader('Retry-After', retryAfter);
      }
      break;
    }

    case RecoveryStrategies.DEGRADATION:
      logger.warn('[ErrorHandler] Degradation mode - returning partial response', {
        error: error.message,
        url: req.originalUrl
      });
      // 縮退サービス: Retry-After ヘッダーで再試行を促す
      if (res && !res.headersSent) {
        res.setHeader('Retry-After', '30');
        res.setHeader('X-Degraded-Mode', 'true');
      }
      break;

    case RecoveryStrategies.FALLBACK:
      logger.warn('[ErrorHandler] Fallback activated', {
        error: error.message,
        url: req.originalUrl
      });
      break;

    case RecoveryStrategies.ALERT:
      // 重大エラー: 詳細ログ記録
      logger.error('[ErrorHandler] ALERT - critical error requires attention', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errorCode: error.code,
        timestamp: new Date().toISOString()
      });
      break;

    case RecoveryStrategies.IGNORE:
    default:
      logger.debug('[ErrorHandler] Error handled normally', {
        error: error.message,
        url: req.originalUrl
      });
      break;
  }
}

// Circuit breaker for handling cascading failures
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

const circuitBreaker = new CircuitBreaker();

// Error tracking for monitoring
const errorMetrics = {
  total: 0,
  by_status: {},
  by_type: {},
  recent_errors: [],
  max_recent: 100
};

// Track error patterns
const trackError = (error, req) => {
  errorMetrics.total++;

  const status = error.status || error.statusCode || 500;
  errorMetrics.by_status[status] = (errorMetrics.by_status[status] || 0) + 1;

  const type = error.name || 'UnknownError';
  errorMetrics.by_type[type] = (errorMetrics.by_type[type] || 0) + 1;

  // Keep recent errors for analysis
  errorMetrics.recent_errors.unshift({
    timestamp: Date.now(),
    status,
    type,
    message: error.message,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  if (errorMetrics.recent_errors.length > errorMetrics.max_recent) {
    errorMetrics.recent_errors.pop();
  }
};

// Get error metrics
const getErrorMetrics = () => ({
  ...errorMetrics,
  circuit_breaker: circuitBreaker.getState()
});

const errorHandler = (err, req, res, next) => {
  const requestId = req.id || req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const details = err.details || null;

  // Classify the error and determine recovery strategy
  const errorType = classifyError(err);
  const recoveryStrategy = getRecoveryStrategy(errorType, err, req);

  // Track error metrics
  trackError(err, req);

  // Execute recovery strategy
  executeRecovery(recoveryStrategy, err, req, res);

  // Circuit breaker logic for cascading failures
  if (status >= 500) {
    circuitBreaker.recordFailure();
  } else {
    circuitBreaker.recordSuccess();
  }

  // Check if circuit breaker is open
  if (!circuitBreaker.canExecute() && status >= 500) {
    logger.error('[ErrorHandler] Circuit breaker is OPEN', {
      requestId,
      circuitState: circuitBreaker.getState()
    });

    return res.status(503).json({
      error: {
        status: 503,
        type: 'service_unavailable',
        message: 'Service temporarily unavailable due to high error rate',
        requestId,
        timestamp: new Date().toISOString(),
        retry_after: 60
      }
    });
  }

  // Enhanced logging context
  const logContext = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    sessionId: req.session?.id,
    errorType: err.name,
    status,
    correlationId: req.headers['x-correlation-id'],
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    processingTime: req.processingTime || 0
  };

  if (status >= 500) {
    logger.error('[ErrorHandler] Server error', {
      ...logContext,
      error: err.message,
      stack: err.stack,
      details
    });
  } else {
    logger.warn('[ErrorHandler] Client error', {
      ...logContext,
      error: err.message,
      details
    });
  }

  // Prepare response
  const response = {
    error: {
      status,
      message,
      requestId,
      timestamp: new Date().toISOString()
    }
  };

  // Add details for validation errors
  if (err.name === 'ValidationError' && details) {
    response.error.details = details;
  }

  // Add stack trace in development and detailed error info
  if (isDevelopment && status >= 500) {
    response.error.stack = err.stack;
    // detailsは文字列で渡されることが大半（例: `details: error.message`が56箇所）。
    // 文字列をそのままスプレッドすると文字ごとのインデックス付きオブジェクトに
    // 化けてしまう（{"0":"S","1":"Q",...}）ため、オブジェクトの場合のみスプレッドする
    const detailsObject = details && typeof details === 'object' ? details : { message: details };
    response.error.details = {
      ...detailsObject,
      requestBody: req.body,
      queryParams: req.query,
      headers: req.headers
    };
  }

  // Add correlation ID for distributed tracing
  if (req.headers['x-correlation-id']) {
    response.error.correlationId = req.headers['x-correlation-id'];
  }

  // Add retry information for recoverable errors
  if (status === 503 || status === 502 || status === 504) {
    response.error.retryable = true;
    response.error.retryAfter = 30;
  }

  // Handle different error types
  switch (err.name) {
    case 'ValidationError':
      response.error.type = 'validation_error';
      break;
    case 'NotFoundError':
      response.error.type = 'not_found';
      break;
    case 'UnauthorizedError':
      response.error.type = 'unauthorized';
      break;
    case 'ForbiddenError':
      response.error.type = 'forbidden';
      break;
    case 'ConflictError':
      response.error.type = 'conflict';
      break;
    case 'CastError':
    case 'SyntaxError':
      response.error.type = 'invalid_request';
      response.error.status = 400;
      response.error.message = 'Invalid request format';
      break;
    case 'JsonWebTokenError':
      response.error.type = 'invalid_token';
      response.error.status = 401;
      response.error.message = 'Invalid authentication token';
      break;
    case 'TokenExpiredError':
      response.error.type = 'expired_token';
      response.error.status = 401;
      response.error.message = 'Authentication token has expired';
      break;
    default:
      response.error.type = status >= 500 ? 'server_error' : 'client_error';
  }

  // Handle database errors
  if (err.code) {
    switch (err.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
      case 'UNIQUE_CONSTRAINT':
        response.error.status = 409;
        response.error.type = 'conflict';
        response.error.message = 'Resource already exists';
        break;
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      case 'FOREIGN_KEY_CONSTRAINT':
        response.error.status = 400;
        response.error.type = 'invalid_reference';
        response.error.message = 'Invalid reference to related resource';
        break;
      case 'SQLITE_BUSY':
      case 'DATABASE_BUSY':
        response.error.status = 503;
        response.error.type = 'database_busy';
        response.error.message = 'Database is temporarily busy';
        response.error.retryable = true;
        response.error.retryAfter = 5;
        break;
      case 'SQLITE_CORRUPT':
      case 'DATABASE_CORRUPT':
        response.error.status = 500;
        response.error.type = 'database_error';
        response.error.message = 'Database corruption detected';
        logger.error('[ErrorHandler] Database corruption detected', logContext);
        break;
      case 'ENOTFOUND':
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
        response.error.status = 503;
        response.error.type = 'external_service_unavailable';
        response.error.message = 'External service temporarily unavailable';
        response.error.retryable = true;
        response.error.retryAfter = 30;
        break;
      case 'EMFILE':
      case 'ENFILE':
        response.error.status = 503;
        response.error.type = 'resource_exhaustion';
        response.error.message = 'Server resources temporarily exhausted';
        response.error.retryable = true;
        response.error.retryAfter = 60;
        break;
    }
  }

  // Handle specific Node.js errors
  if (err.syscall) {
    switch (err.syscall) {
      case 'listen':
        response.error.type = 'port_in_use';
        response.error.message = 'Port is already in use';
        break;
      case 'connect':
        response.error.type = 'connection_failed';
        response.error.message = 'Failed to connect to external service';
        break;
    }
  }

  // Security headers for error responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Request-ID', requestId);

  // Don't cache error responses
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.status(response.error.status).json(response);
};

// Handle 404 for unmatched routes
const notFoundHandler = (req, res) => {
  const response = {
    error: {
      status: 404,
      type: 'not_found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    }
  };

  logger.warn('[ErrorHandler] Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  res.status(404).json(response);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`[ErrorHandler] Received ${signal}, starting graceful shutdown...`);

  // Close server gracefully
  if (global.server) {
    global.server.close(() => {
      logger.info('[ErrorHandler] HTTP server closed');
    });
  }

  // Close database connections
  if (global.database) {
    global.database.close((err) => {
      if (err) {
        logger.error('[ErrorHandler] Error closing database', { error: err.message });
      } else {
        logger.info('[ErrorHandler] Database connection closed');
      }
    });
  }

  // Force exit after timeout
  setTimeout(() => {
    logger.error('[ErrorHandler] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('[ErrorHandler] Uncaught exception', {
    error: err.message,
    stack: err.stack
  });

  // Try to close gracefully, then exit
  gracefulShutdown('uncaughtException');

  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[ErrorHandler] Unhandled promise rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Memory usage monitoring
const memoryMonitorTimer = setInterval(() => {
  const usage = process.memoryUsage();
  const threshold = 500 * 1024 * 1024; // 500MB

  if (usage.heapUsed > threshold) {
    logger.warn('[ErrorHandler] High memory usage detected', {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB'
    });
  }
}, 60000); // Check every minute
memoryMonitorTimer.unref(); // Don't keep the process (or Jest) alive just for this

// Request timeout handler
const requestTimeout = (timeout = 30000) => {
  return (req, res, next) => {
    req.setTimeout(timeout, () => {
      const err = new Error('Request timeout');
      err.status = 408;
      err.type = 'request_timeout';
      next(err);
    });
    next();
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  getErrorMetrics,
  circuitBreaker,
  requestTimeout,
  gracefulShutdown
};
