const express = require('express');
const router = express.Router();
const HealthChecker = require('../scripts/healthCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');

// Create health checker instance
const healthChecker = new HealthChecker();
healthChecker.setupDefaultChecks();

// Basic health check endpoint
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  try {
    // Quick basic checks only
    const quickChecker = new HealthChecker();
    quickChecker.registerCheck('database', () => healthChecker.checkDatabase(), { critical: true });
    quickChecker.registerCheck('memory', () => healthChecker.checkMemoryUsage(), { critical: true });

    const results = await quickChecker.runChecks();
    const responseTime = Date.now() - startTime;

    const response = {
      status: results.status,
      timestamp: results.timestamp,
      uptime: process.uptime(),
      responseTime,
      version: process.env.APP_VERSION || '2.1.0',
      environment: process.env.NODE_ENV || 'development'
    };

    const statusCode = results.status === 'critical' ? 503 :
                      results.status === 'degraded' ? 200 : 200;

    res.status(statusCode).json(response);
  } catch (error) {
    res.status(503).json({
      status: 'critical',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
}));

// Detailed health check endpoint (admin only)
router.get('/detailed', requireRole('admin'), asyncHandler(async (req, res) => {
  const results = await healthChecker.runChecks();

  // Add system information
  const systemInfo = {
    ...results,
    system: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      ppid: process.ppid,
      uid: process.getuid ? process.getuid() : null,
      gid: process.getgid ? process.getgid() : null
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      version: process.env.APP_VERSION || '2.1.0'
    }
  };

  const statusCode = results.status === 'critical' ? 503 :
                    results.status === 'degraded' ? 200 : 200;

  res.status(statusCode).json(systemInfo);
}));

// Ready check endpoint (for Kubernetes readiness probe)
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check only critical services for readiness
    const readyChecker = new HealthChecker();
    readyChecker.registerCheck('database', () => healthChecker.checkDatabase(), { critical: true });

    const results = await readyChecker.runChecks();

    if (results.status === 'critical') {
      return res.status(503).json({
        ready: false,
        timestamp: results.timestamp,
        message: 'Service not ready'
      });
    }

    res.json({
      ready: true,
      timestamp: results.timestamp,
      message: 'Service ready'
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}));

// Live check endpoint (for Kubernetes liveness probe)
router.get('/live', asyncHandler(async (req, res) => {
  // Simple liveness check - just verify the process is responding
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
}));

// Metrics endpoint
router.get('/metrics', asyncHandler(async (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const eventLoopLag = await measureEventLoopLag();

  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    eventLoop: {
      lag: eventLoopLag.average,
      lagMs: eventLoopLag.average,
      maxLagMs: eventLoopLag.max,
      minLagMs: eventLoopLag.min,
      samples: eventLoopLag.samples
    },
    gc: getGCStats()
  };

  // Add application-specific metrics
  if (global.monitoringService) {
    const appMetrics = global.monitoringService.getMetrics();
    metrics.application = appMetrics;
  }

  res.json(metrics);
}));

// Prometheus metrics endpoint
router.get('/metrics/prometheus', asyncHandler(async (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const eventLoopLag = await measureEventLoopLag();

  let prometheusMetrics = `# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}

# HELP process_memory_rss_bytes Resident Set Size memory
# TYPE process_memory_rss_bytes gauge
process_memory_rss_bytes ${memUsage.rss}

# HELP process_memory_heap_total_bytes Total heap memory
# TYPE process_memory_heap_total_bytes gauge
process_memory_heap_total_bytes ${memUsage.heapTotal}

# HELP process_memory_heap_used_bytes Used heap memory
# TYPE process_memory_heap_used_bytes gauge
process_memory_heap_used_bytes ${memUsage.heapUsed}

# HELP process_cpu_user_seconds_total User CPU time
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP process_cpu_system_seconds_total System CPU time
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total ${cpuUsage.system / 1000000}

# HELP event_loop_lag_seconds Average event loop lag
# TYPE event_loop_lag_seconds gauge
event_loop_lag_seconds ${eventLoopLag.average / 1000}
`;

  // Add application metrics if available
  if (global.monitoringService) {
    const appMetrics = global.monitoringService.getMetrics();

    prometheusMetrics += `
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total ${appMetrics.application.requests.total}

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum ${appMetrics.application.responses.avg * appMetrics.application.requests.total / 1000}
http_request_duration_seconds_count ${appMetrics.application.requests.total}

# HELP database_connections_active Active database connections
# TYPE database_connections_active gauge
database_connections_active ${appMetrics.application.database.connections}

# HELP cache_hit_ratio Cache hit ratio
# TYPE cache_hit_ratio gauge
cache_hit_ratio ${appMetrics.application.cache.hitRate / 100}
`;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(prometheusMetrics);
}));

// Measure event loop lag (ms) using multiple samples for stability
async function measureEventLoopLag(sampleCount = 5) {
  if (sampleCount <= 0) {
    return { average: 0, max: 0, min: 0, samples: 0 };
  }

  const delays = [];

  // Sequential sampling to avoid skew from concurrent timers
  for (let i = 0; i < sampleCount; i += 1) {
    const start = process.hrtime.bigint();

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setImmediate(() => {
        const diffMs = Number(process.hrtime.bigint() - start) / 1e6;
        delays.push(diffMs);
        resolve();
      });
    });
  }

  const total = delays.reduce((acc, value) => acc + value, 0);
  const average = delays.length ? total / delays.length : 0;

  return {
    average,
    max: delays.length ? Math.max(...delays) : 0,
    min: delays.length ? Math.min(...delays) : 0,
    samples: delays.length
  };
}

// Get garbage collection stats
function getGCStats() {
  try {
    if (global.gc && typeof global.gc === 'function') {
      const gcStats = process.memoryUsage();
      return {
        heapUsed: gcStats.heapUsed,
        heapTotal: gcStats.heapTotal,
        external: gcStats.external
      };
    }
  } catch (error) {
    // GC stats not available
  }
  return null;
}

module.exports = router;