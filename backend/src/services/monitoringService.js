const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const config = require('../config');
const EventEmitter = require('events');

/**
 * Advanced Monitoring and Alerting Service
 * Provides comprehensive system monitoring and real-time alerting
 */

class MonitoringService extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      system: {
        cpu: { usage: 0, loadAverage: [0, 0, 0] },
        memory: { used: 0, total: 0, percentage: 0, heapUsed: 0, heapTotal: 0 },
        disk: { used: 0, total: 0, percentage: 0 },
        network: { bytesIn: 0, bytesOut: 0 },
        uptime: 0
      },
      application: {
        requests: { total: 0, success: 0, errors: 0, rate: 0 },
        responses: { avg: 0, p95: 0, p99: 0 },
        database: { connections: 0, queries: 0, errors: 0 },
        cache: { hits: 0, misses: 0, hitRate: 0 },
        websockets: { connections: 0, messages: 0 }
      },
      security: {
        failedLogins: [],
        rateLimitViolations: []
      },
      alerts: []
    };

    this.thresholds = {
      cpu: 80,
      memory: 85,
      disk: 90,
      responseTime: 2000,
      errorRate: 5,
      dbConnections: 50
    };

    this.responseTimes = [];
    this.maxResponseTimeHistory = 1000;
    this.alertHistory = [];
    this.maxAlertHistory = 100;

    this.collectors = new Map();
    this.alertChannels = [];
    this.isCollecting = false;
    this.collectionInterval = 30000; // 30 seconds

    this.startCollection();
  }

  // Start metric collection
  startCollection() {
    if (this.isCollecting) return;

    this.isCollecting = true;
    this.collectionTimer = setInterval(() => {
      this.collectMetrics();
    }, this.collectionInterval);

    logger.info('[MonitoringService] Metric collection started', {
      interval: this.collectionInterval
    });
  }

  // Stop metric collection
  stopCollection() {
    if (!this.isCollecting) return;

    this.isCollecting = false;
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    logger.info('[MonitoringService] Metric collection stopped');
  }

  // Collect all metrics with improved error handling
  async collectMetrics() {
    const errors = [];

    try {
      await Promise.all([
        this.collectSystemMetrics().catch(err => {
          logger.warn('[MonitoringService] System metrics collection failed', { error: err.message });
          errors.push({ type: 'system', error: err.message });
        }),
        this.collectApplicationMetrics().catch(err => {
          logger.warn('[MonitoringService] Application metrics collection failed', { error: err.message });
          errors.push({ type: 'application', error: err.message });
        }),
        this.collectDatabaseMetrics().catch(err => {
          logger.warn('[MonitoringService] Database metrics collection failed', { error: err.message });
          errors.push({ type: 'database', error: err.message });
        })
      ]);

      this.checkAlerts();
      this.runCustomCollectors();
      this.checkSecurityMetrics();

      logger.debug('[MonitoringService] Metrics collected', {
        timestamp: new Date().toISOString(),
        cpu: this.metrics.system.cpu.usage,
        memory: this.metrics.system.memory.percentage,
        requests: this.metrics.application.requests.total,
        errors: errors.length
      });

      // Log errors if any occurred
      if (errors.length > 0) {
        logger.warn('[MonitoringService] Some metrics collection failed', { errors });
      }
    } catch (error) {
      logger.error('[MonitoringService] Metric collection failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Collect system metrics
  async collectSystemMetrics() {
    // CPU usage
    const cpuUsage = await this.getCPUUsage();
    this.metrics.system.cpu.usage = cpuUsage;
    this.metrics.system.cpu.loadAverage = os.loadavg();

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    this.metrics.system.memory = {
      used: usedMemory,
      total: totalMemory,
      percentage: (usedMemory / totalMemory) * 100,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal
    };

    // Disk usage
    try {
      const diskUsage = await this.getDiskUsage();
      this.metrics.system.disk = diskUsage;
    } catch (error) {
      logger.warn('[MonitoringService] Failed to get disk usage', {
        error: error.message
      });
    }

    // System uptime
    this.metrics.system.uptime = os.uptime();
  }

  // Collect database metrics
  async collectDatabaseMetrics() {
    try {
      // Database statistics
      const dbStats = {
        size: 0,
        tables: {},
        connections: 0,
        queries: 0,
        errors: 0
      };

      // Get database file size
      try {
        const stats = await fs.stat(path.join(process.cwd(), 'data', 'database.db'));
        dbStats.size = stats.size;
      } catch (error) {
        logger.warn('[Monitoring] Failed to get database file size', { error: error.message });
      }

      // Get table statistics (for SQLite) - optimized version
      try {
        const { db } = require('../db');
        const tables = await new Promise((resolve, reject) => {
          db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        // Use Promise.all for concurrent table counting
        const tableStats = await Promise.all(
          tables.map(async (table) => {
            try {
              const count = await new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
                  if (err) reject(err);
                  else resolve(row?.count || 0);
                });
              });
              return { [table.name]: count };
            } catch (error) {
              logger.warn(`[Monitoring] Failed to get count for table ${table.name}`, { error: error.message });
              return { [table.name]: 0 };
            }
          })
        );

        // Merge table statistics
        tableStats.forEach(stat => {
          Object.assign(dbStats.tables, stat);
        });
      } catch (error) {
        logger.warn('[Monitoring] Failed to get database table stats', { error: error.message });
      }

      this.metrics.application.database = dbStats;
    } catch (error) {
      logger.error('[Monitoring] Database metrics collection failed', { error: error.message });
    }
  }

  // Collect application metrics
  async collectApplicationMetrics() {
    // Database metrics
    if (global.databaseService) {
      const dbMetrics = global.databaseService.getMetrics();
      this.metrics.application.database = {
        connections: dbMetrics.activeConnections || 0,
        queries: dbMetrics.totalQueries || 0,
        errors: dbMetrics.failedQueries || 0
      };
    }

    // Cache metrics
    if (global.cacheService) {
      const cacheStats = global.cacheService.getStatistics();
      this.metrics.application.cache = {
        hits: cacheStats.hits || 0,
        misses: cacheStats.misses || 0,
        hitRate: parseFloat(cacheStats.hitRate) || 0
      };
    }

    // Response time metrics
    if (this.responseTimes.length > 0) {
      const sorted = [...this.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);

      this.metrics.application.responses = {
        avg: this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length,
        p95: sorted[p95Index] || 0,
        p99: sorted[p99Index] || 0
      };

      // Keep only recent response times
      if (this.responseTimes.length > this.maxResponseTimeHistory) {
        this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeHistory);
      }
    }
  }

  // Get CPU usage
  getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();

      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime.bigint();

        const deltaTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        const totalCpuTime = (endUsage.user + endUsage.system) / 1000; // Convert to microseconds

        const cpuPercent = (totalCpuTime / deltaTime) * 100;
        resolve(Math.round(cpuPercent * 100) / 100);
      }, 100);
    });
  }

  // Get disk usage
  async getDiskUsage() {
    const dataPath = path.dirname(config.database?.path || './data');

    try {
      const stats = await fs.stat(dataPath);
      if (!stats.isDirectory()) {
        throw new Error('Data path is not a directory');
      }

      // Use more efficient disk usage calculation
      if (process.platform === 'win32') {
        // Windows implementation using wmic or fs.stat for available space
        return this.getWindowsDiskUsage(dataPath);
      } else {
        // Unix-like systems using statvfs
        return this.getUnixDiskUsage(dataPath);
      }
    } catch (error) {
      logger.warn('[MonitoringService] Failed to get disk usage', { error: error.message });
      return { total: 0, used: 0, percentage: 0 };
    }
  }

  // Windows disk usage calculation
  async getWindowsDiskUsage(dataPath) {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        // Use wmic to get disk information
        exec(`wmic logicaldisk where name="${path.resolve(dataPath).substring(0, 2)}" get size,freespace`, (error, stdout) => {
          if (error || !stdout) {
            resolve({ total: 0, used: 0, percentage: 0 });
            return;
          }

          const lines = stdout.trim().split('\n');
          if (lines.length >= 2) {
            const parts = lines[1].trim().split(/\s+/);
            const total = parseInt(parts[0]) || 0;
            const free = parseInt(parts[1]) || 0;
            const used = total - free;
            const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

            resolve({ total, used, percentage });
          } else {
            resolve({ total: 0, used: 0, percentage: 0 });
          }
        });
      });
    } catch (error) {
      return { total: 0, used: 0, percentage: 0 };
    }
  }

  // Unix disk usage calculation
  async getUnixDiskUsage(dataPath) {
    try {
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const df = spawn('df', ['-k', dataPath]);
        let output = '';

        df.stdout.on('data', (data) => {
          output += data.toString();
        });

        df.on('close', (code) => {
          if (code === 0) {
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
              const parts = lines[1].split(/\s+/);
              const total = parseInt(parts[1]) * 1024; // Convert KB to bytes
              const used = parseInt(parts[2]) * 1024;  // Convert KB to bytes
              const percentage = parseInt(parts[4]) || 0;

              resolve({ total, used, percentage });
            } else {
              resolve({ total: 0, used: 0, percentage: 0 });
            }
          } else {
            resolve({ total: 0, used: 0, percentage: 0 });
          }
        });

        df.on('error', () => {
          resolve({ total: 0, used: 0, percentage: 0 });
        });
      });
    } catch (error) {
      return { total: 0, used: 0, percentage: 0 };
    }
  }

  // Check for alert conditions
  checkAlerts() {
    const alerts = [];

    // CPU alert
    if (this.metrics.system.cpu.usage > this.thresholds.cpu) {
      alerts.push({
        type: 'cpu',
        level: 'warning',
        message: `High CPU usage: ${this.metrics.system.cpu.usage.toFixed(2)}%`,
        value: this.metrics.system.cpu.usage,
        threshold: this.thresholds.cpu,
        timestamp: Date.now()
      });
    }

    // Memory alert
    if (this.metrics.system.memory.percentage > this.thresholds.memory) {
      alerts.push({
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${this.metrics.system.memory.percentage.toFixed(2)}%`,
        value: this.metrics.system.memory.percentage,
        threshold: this.thresholds.memory,
        timestamp: Date.now()
      });
    }

    // Disk alert
    if (this.metrics.system.disk.percentage > this.thresholds.disk) {
      alerts.push({
        type: 'disk',
        level: 'critical',
        message: `High disk usage: ${this.metrics.system.disk.percentage}%`,
        value: this.metrics.system.disk.percentage,
        threshold: this.thresholds.disk,
        timestamp: Date.now()
      });
    }

    // Response time alert
    if (this.metrics.application.responses.p95 > this.thresholds.responseTime) {
      alerts.push({
        type: 'response_time',
        level: 'warning',
        message: `High response time (P95): ${this.metrics.application.responses.p95.toFixed(2)}ms`,
        value: this.metrics.application.responses.p95,
        threshold: this.thresholds.responseTime,
        timestamp: Date.now()
      });
    }

    // Database connections alert
    if (this.metrics.application.database.connections > this.thresholds.dbConnections) {
      alerts.push({
        type: 'database',
        level: 'warning',
        message: `High database connections: ${this.metrics.application.database.connections}`,
        value: this.metrics.application.database.connections,
        threshold: this.thresholds.dbConnections,
        timestamp: Date.now()
      });
    }

    // Update alerts
    this.metrics.alerts = alerts;

    // Log new alerts
    for (const alert of alerts) {
      if (!this.isAlertRecentlyFired(alert)) {
        logger.warn(`[MonitoringService] Alert: ${alert.message}`, {
          type: alert.type,
          level: alert.level,
          value: alert.value,
          threshold: alert.threshold
        });

        this.addToAlertHistory(alert);
      }
    }
  }

  // Check security metrics
  checkSecurityMetrics() {
    // Check failed logins in last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentFailedLogins = this.metrics.security.failedLogins.filter(
      timestamp => timestamp > fiveMinutesAgo
    );

    if (recentFailedLogins.length >= 5) { // 5 failed logins in 5 minutes
      const alert = {
        type: 'security_login',
        level: 'critical',
        message: `Suspicious Login Activity: ${recentFailedLogins.length} failed attempts`,
        value: recentFailedLogins.length,
        threshold: 5,
        timestamp: Date.now(),
        details: { timeWindow: '5 minutes' }
      };

      if (!this.isAlertRecentlyFired(alert)) {
        this.metrics.alerts.push(alert);
        this.addToAlertHistory(alert);
        logger.error(`[MonitoringService] Alert: ${alert.message}`, {
          type: alert.type,
          level: alert.level,
          value: alert.value,
          threshold: alert.threshold
        });
        this.emit('alert', alert);
        this.sendAlertToChannels(alert);
      }
    }

    // Check rate limit violations in last minute
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentViolations = this.metrics.security.rateLimitViolations.filter(
      timestamp => timestamp > oneMinuteAgo
    );

    if (recentViolations.length >= 10) { // 10 violations in 1 minute
      const alert = {
        type: 'security_ratelimit',
        level: 'warning',
        message: `High Rate Limit Violations: ${recentViolations.length} violations`,
        value: recentViolations.length,
        threshold: 10,
        timestamp: Date.now(),
        details: { timeWindow: '1 minute' }
      };

      if (!this.isAlertRecentlyFired(alert)) {
        this.metrics.alerts.push(alert);
        this.addToAlertHistory(alert);
        logger.warn(`[MonitoringService] Alert: ${alert.message}`, {
          type: alert.type,
          level: alert.level,
          value: alert.value,
          threshold: alert.threshold
        });
        this.emit('alert', alert);
        this.sendAlertToChannels(alert);
      }
    }

    // Clean up old security metrics (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.metrics.security.failedLogins = this.metrics.security.failedLogins.filter(
      timestamp => timestamp > oneHourAgo
    );
    this.metrics.security.rateLimitViolations = this.metrics.security.rateLimitViolations.filter(
      timestamp => timestamp > oneHourAgo
    );
  }
  isAlertRecentlyFired(alert) {
    const recentTime = Date.now() - (5 * 60 * 1000); // 5 minutes
    return this.alertHistory.some(historical =>
      historical.type === alert.type &&
      historical.timestamp > recentTime
    );
  }

  // Add alert to history
  addToAlertHistory(alert) {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory = this.alertHistory.slice(0, this.maxAlertHistory);
    }
  }

  // Run custom metric collectors
  runCustomCollectors() {
    for (const [name, collector] of this.collectors) {
      try {
        const result = collector();
        if (result && typeof result === 'object') {
          this.metrics.custom = this.metrics.custom || {};
          this.metrics.custom[name] = result;
        }
      } catch (error) {
        logger.error('[MonitoringService] Custom collector failed', {
          name,
          error: error.message
        });
      }
    }
  }

  // Record request metrics
  recordRequest(success = true, responseTime = 0) {
    this.metrics.application.requests.total++;

    if (success) {
      this.metrics.application.requests.success++;
    } else {
      this.metrics.application.requests.errors++;
    }

    if (responseTime > 0) {
      this.responseTimes.push(responseTime);
    }

    // Calculate request rate (requests per minute)
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps || [];
    this.requestTimestamps.push(now);

    // Keep only requests from last minute
    const oneMinuteAgo = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);

    this.metrics.application.requests.rate = this.requestTimestamps.length;
  }

  // Record WebSocket metrics
  recordWebSocketConnection(connected = true) {
    if (connected) {
      this.metrics.application.websockets.connections++;
    } else {
      this.metrics.application.websockets.connections = Math.max(0,
        this.metrics.application.websockets.connections - 1
      );
    }
  }

    // Record failed login attempt
    recordFailedLogin() {
      this.metrics.security.failedLogins.push(Date.now());
    }

    // Record rate limit violation
    recordRateLimitViolation() {
      this.metrics.security.rateLimitViolations.push(Date.now());
    }

  // Register custom metric collector
  registerCollector(name, collectorFunction) {
    if (typeof collectorFunction !== 'function') {
      throw new Error('Collector must be a function');
    }

    this.collectors.set(name, collectorFunction);
    logger.info('[MonitoringService] Custom collector registered', { name });
  }

  // Unregister custom collector
  unregisterCollector(name) {
    this.collectors.delete(name);
    logger.info('[MonitoringService] Custom collector unregistered', { name });
  }

  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      collectionInterval: this.collectionInterval,
      isCollecting: this.isCollecting
    };
  }

  // Get health status
  getHealthStatus() {
    const alerts = this.metrics.alerts || [];
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    const warningAlerts = alerts.filter(a => a.level === 'warning');

    let status = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (warningAlerts.length > 0) {
      status = 'warning';
    }

    return {
      status,
      alerts: alerts.length,
      critical: criticalAlerts.length,
      warnings: warningAlerts.length,
      uptime: this.metrics.system.uptime,
      timestamp: Date.now()
    };
  }

  // Export metrics to file
  async exportMetrics(filePath) {
    try {
      const metrics = this.getMetrics();
      await fs.writeFile(filePath, JSON.stringify(metrics, null, 2));
      logger.info('[MonitoringService] Metrics exported', { filePath });
    } catch (error) {
      logger.error('[MonitoringService] Failed to export metrics', {
        filePath,
        error: error.message
      });
      throw error;
    }
  }

  // Get metrics summary for dashboard
  getSummary() {
    return {
      system: {
        cpu: Math.round(this.metrics.system.cpu.usage),
        memory: Math.round(this.metrics.system.memory.percentage),
        disk: this.metrics.system.disk.percentage,
        uptime: Math.round(this.metrics.system.uptime / 3600) // hours
      },
      application: {
        requests: this.metrics.application.requests.total,
        errors: this.metrics.application.requests.errors,
        avgResponseTime: Math.round(this.metrics.application.responses.avg || 0),
        dbConnections: this.metrics.application.database.connections,
        cacheHitRate: this.metrics.application.cache.hitRate
      },
      alerts: {
        total: this.metrics.alerts.length,
        critical: this.metrics.alerts.filter(a => a.level === 'critical').length,
        warnings: this.metrics.alerts.filter(a => a.level === 'warning').length
      },
      timestamp: Date.now()
    };
  }

  // Update thresholds
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('[MonitoringService] Thresholds updated', {
      thresholds: this.thresholds
    });
  }

  // Get alert history
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(0, limit);
  }

  // Clear alert history
  clearAlertHistory() {
    this.alertHistory = [];
    logger.info('[MonitoringService] Alert history cleared');
  }

  // Middleware for request monitoring
  requestMonitoringMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;

        this.recordRequest(success, responseTime);

        // Add response time header
        res.set('X-Response-Time', `${responseTime}ms`);
      });

      next();
    };
  }

  // Send alert to all configured channels
  sendAlertToChannels(alert) {
    for (const channel of this.alertChannels) {
      try {
        channel.send(alert);
      } catch (error) {
        logger.error('[MonitoringService] Failed to send alert to channel', {
          channel: channel.name,
          error: error.message
        });
      }
    }
  }

  // Add alert channel
  addAlertChannel(channel) {
    this.alertChannels.push(channel);
    logger.info('[MonitoringService] Alert channel added', { channel: channel.name });
  }

  // Remove alert channel
  removeAlertChannel(channelName) {
    this.alertChannels = this.alertChannels.filter(ch => ch.name !== channelName);
    logger.info('[MonitoringService] Alert channel removed', { channel: channelName });
  }
}

/**
 * WebSocket Alert Channel
 */
class WebSocketAlertChannel {
  constructor(io) {
    this.name = 'websocket';
    this.io = io;
  }

  send(alert) {
    if (this.io) {
      this.io.emit('system:alert', alert);
    }
  }
}

/**
 * Email Alert Channel (placeholder)
 */
class EmailAlertChannel {
  constructor(config) {
    this.name = 'email';
    this.config = config;
  }

  send(alert) {
    // Implement email sending logic
    logger.info('[EmailAlert] Would send alert', {
      to: this.config.recipients,
      alert: alert.message
    });
  }
}

module.exports = {
  monitoringService: new MonitoringService(),
  WebSocketAlertChannel,
  EmailAlertChannel
};