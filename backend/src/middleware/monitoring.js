const logger = require('../logger');
const config = require('../config');

class HealthCheck {
  constructor() {
    this.checks = new Map();
    this.status = 'healthy';
    this.lastCheck = null;
  }

  addCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      fn: checkFunction,
      timeout: options.timeout || 5000,
      critical: options.critical || false,
      lastResult: null,
      lastRun: null
    });
  }

  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const start = Date.now();
    try {
      const result = await Promise.race([
        check.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        )
      ]);

      const duration = Date.now() - start;
      check.lastResult = { status: 'healthy', result, duration };
      check.lastRun = new Date();

      return check.lastResult;
    } catch (error) {
      const duration = Date.now() - start;
      check.lastResult = {
        status: 'unhealthy',
        error: error.message,
        duration
      };
      check.lastRun = new Date();

      if (check.critical) {
        logger.error('[Health] Critical health check failed', {
          check: name,
          error: error.message
        });
      }

      return check.lastResult;
    }
  }

  async runAllChecks() {
    const results = {};
    let overallStatus = 'healthy';

    for (const [name, check] of this.checks) {
      try {
        results[name] = await this.runCheck(name);
        if (results[name].status === 'unhealthy' && check.critical) {
          overallStatus = 'unhealthy';
        }
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message
        };
        if (check.critical) {
          overallStatus = 'unhealthy';
        }
      }
    }

    this.status = overallStatus;
    this.lastCheck = new Date();

    return {
      status: overallStatus,
      timestamp: this.lastCheck,
      checks: results
    };
  }

  getStatus() {
    return {
      status: this.status,
      lastCheck: this.lastCheck,
      checks: Object.fromEntries(
        Array.from(this.checks.entries()).map(([name, check]) => [
          name,
          {
            status: check.lastResult?.status || 'not_run',
            lastRun: check.lastRun,
            critical: check.critical
          }
        ])
      )
    };
  }
}

const healthCheck = new HealthCheck();

// Database health check
healthCheck.addCheck('database', async () => {
  const db = require('../db');
  return new Promise((resolve, reject) => {
    db.get('SELECT 1 as test', (err, row) => {
      if (err) {
        reject(new Error(`Database error: ${err.message}`));
      } else {
        resolve({ connected: true, test: row.test });
      }
    });
  });
}, { critical: true, timeout: 3000 });

// Memory usage check
healthCheck.addCheck('memory', async () => {
  const usage = process.memoryUsage();
  const totalMB = Math.round(usage.rss / 1024 / 1024);
  const heapMB = Math.round(usage.heapUsed / 1024 / 1024);

  if (totalMB > 512) { // Alert if using more than 512MB
    throw new Error(`High memory usage: ${totalMB}MB`);
  }

  return {
    rss: `${totalMB}MB`,
    heap: `${heapMB}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`
  };
}, { critical: false, timeout: 1000 });

// Event loop lag check
healthCheck.addCheck('event_loop', async () => {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
      if (lag > 100) { // Alert if lag > 100ms
        resolve({ lag: `${lag.toFixed(2)}ms`, status: 'warning' });
      } else {
        resolve({ lag: `${lag.toFixed(2)}ms`, status: 'good' });
      }
    });
  });
}, { critical: false, timeout: 2000 });

// Performance metrics collection
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        by_method: {},
        by_status: {},
        response_times: []
      },
      errors: {
        total: 0,
        by_type: {}
      },
      rateLimits: {
        total: 0,
        lastTriggeredAt: null,
        byLimiter: {}
      },
      uptime: process.uptime()
    };
  }

  recordRequest(method, status, responseTime) {
    this.metrics.requests.total++;
    this.metrics.requests.by_method[method] = (this.metrics.requests.by_method[method] || 0) + 1;
    this.metrics.requests.by_status[status] = (this.metrics.requests.by_status[status] || 0) + 1;

    // Keep only last 1000 response times for memory efficiency
    this.metrics.requests.response_times.push(responseTime);
    if (this.metrics.requests.response_times.length > 1000) {
      this.metrics.requests.response_times.shift();
    }
  }

  recordError(errorType) {
    this.metrics.errors.total++;
    this.metrics.errors.by_type[errorType] = (this.metrics.errors.by_type[errorType] || 0) + 1;
  }

  recordRateLimit(limiterName = 'unknown', clientKey, metadata = {}) {
    const limiterMetrics = this.metrics.rateLimits.byLimiter[limiterName] || {
      total: 0,
      lastClient: null,
      lastMethod: null,
      lastPath: null,
      lastTriggeredAt: null
    };

    limiterMetrics.total++;
    limiterMetrics.lastTriggeredAt = new Date().toISOString();
    if (clientKey) {
      limiterMetrics.lastClient = clientKey;
    }
    if (metadata.method) {
      limiterMetrics.lastMethod = metadata.method;
    }
    if (metadata.path) {
      limiterMetrics.lastPath = metadata.path;
    }

    this.metrics.rateLimits.byLimiter[limiterName] = limiterMetrics;
    this.metrics.rateLimits.total++;
    this.metrics.rateLimits.lastTriggeredAt = limiterMetrics.lastTriggeredAt;
  }

  getMetrics() {
    const responseTimes = this.metrics.requests.response_times;
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const rateLimitMetrics = {
      total: this.metrics.rateLimits.total,
      lastTriggeredAt: this.metrics.rateLimits.lastTriggeredAt,
      byLimiter: {}
    };

    for (const [limiterName, limiterMetrics] of Object.entries(this.metrics.rateLimits.byLimiter)) {
      rateLimitMetrics.byLimiter[limiterName] = { ...limiterMetrics };
    }

    return {
      ...this.metrics,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      requests: {
        ...this.metrics.requests,
        avg_response_time: Math.round(avgResponseTime * 100) / 100,
        response_times: undefined // Don't expose raw data
      },
      rateLimits: rateLimitMetrics
    };
  }

  reset() {
    this.metrics = {
      requests: { total: 0, by_method: {}, by_status: {}, response_times: [] },
      errors: { total: 0, by_type: {} },
      rateLimits: { total: 0, lastTriggeredAt: null, byLimiter: {} },
      uptime: process.uptime()
    };
  }
}

const metricsCollector = new MetricsCollector();

// Middleware for collecting metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - start;
    metricsCollector.recordRequest(req.method, res.statusCode, responseTime);

    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      metricsCollector.recordError(errorType);
    }
  });

  next();
};

// 詳細なヘルスチェックエンドポイント
const detailedHealthCheckHandler = async (req, res) => {
  try {
    const results = await healthCheck.runAllChecks();
    const metrics = metricsCollector.getMetrics();
    const config = require('../config');

    const healthData = {
      status: results.status,
      timestamp: results.timestamp,
      version: process.env.npm_package_version || '2.1.0',
      environment: config.environment,
      uptime: {
        process: Math.floor(process.uptime()),
        system: require('os').uptime()
      },
      checks: results.checks,
      metrics: {
        requests: {
          total: metrics.requests.total,
          by_method: metrics.requests.by_method,
          by_status: metrics.requests.by_status,
          avg_response_time: metrics.requests.avg_response_time
        },
        errors: metrics.errors,
        memory: {
          rss: `${Math.round(metrics.memory.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(metrics.memory.heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(metrics.memory.external / 1024 / 1024)}MB`
        }
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpus: require('os').cpus().length,
        totalMemory: `${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`,
        freeMemory: `${Math.round(require('os').freemem() / 1024 / 1024 / 1024)}GB`
      }
    };

    const status = results.status === 'healthy' ? 200 : 503;
    res.status(status).json(healthData);
  } catch (error) {
    logger.error('[Health] Health check failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date()
    });
  }
};

// シンプルなヘルスチェックエンドポイント（ロードバランサー用）
const healthCheckHandler = async (req, res) => {
  try {
    const results = await healthCheck.runAllChecks();
    const status = results.status === 'healthy' ? 200 : 503;
    res.status(status).json({
      status: results.status,
      timestamp: results.timestamp
    });
  } catch (error) {
    logger.error('[Health] Health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      timestamp: new Date()
    });
  }
};

// Metrics endpoint handler
const metricsHandler = (req, res) => {
  const metrics = metricsCollector.getMetrics();
  res.json(metrics);
};

module.exports = {
  HealthCheck,
  healthCheck,
  MetricsCollector,
  metricsCollector,
  metricsMiddleware,
  healthCheckHandler,
  detailedHealthCheckHandler,
  metricsHandler
};