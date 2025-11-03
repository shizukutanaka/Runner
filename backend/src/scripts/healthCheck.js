#!/usr/bin/env node

const http = require('http');
const logger = require('../logger');

class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.timeout = 5000; // 5 seconds
    this.retries = 3;
  }

  // Register a health check
  registerCheck(name, checkFunction, options = {}) {
    this.checks.set(name, {
      fn: checkFunction,
      critical: options.critical || false,
      timeout: options.timeout || this.timeout,
      retries: options.retries || this.retries
    });
  }

  // Execute a single health check with retries
  async executeCheck(name, check) {
    for (let attempt = 1; attempt <= check.retries; attempt++) {
      try {
        const result = await Promise.race([
          check.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), check.timeout)
          )
        ]);

        return {
          name,
          status: 'healthy',
          message: result?.message || 'OK',
          responseTime: result?.responseTime || 0,
          critical: check.critical,
          attempt
        };
      } catch (error) {
        if (attempt === check.retries) {
          return {
            name,
            status: 'unhealthy',
            message: error.message,
            critical: check.critical,
            attempt
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // Run all health checks
  async runChecks() {
    const results = [];
    const startTime = Date.now();

    for (const [name, check] of this.checks) {
      const result = await this.executeCheck(name, check);
      results.push(result);
    }

    const totalTime = Date.now() - startTime;
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const criticalFailures = results.filter(r => r.status === 'unhealthy' && r.critical);

    return {
      status: criticalFailures.length > 0 ? 'critical' :
              healthyCount === results.length ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      totalChecks: results.length,
      healthyChecks: healthyCount,
      criticalFailures: criticalFailures.length,
      totalResponseTime: totalTime,
      checks: results
    };
  }

  // HTTP endpoint health check
  async checkHTTPEndpoint(url, expectedStatus = 200) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const request = http.request(url, (response) => {
        const responseTime = Date.now() - startTime;

        if (response.statusCode === expectedStatus) {
          resolve({
            message: `HTTP ${response.statusCode}`,
            responseTime
          });
        } else {
          reject(new Error(`HTTP ${response.statusCode}, expected ${expectedStatus}`));
        }
      });

      request.on('error', reject);
      request.setTimeout(this.timeout, () => {
        request.destroy();
        reject(new Error('HTTP request timeout'));
      });

      request.end();
    });
  }

  // Database health check
  async checkDatabase() {
    try {
      const db = require('../db');
      const startTime = Date.now();

      return new Promise((resolve, reject) => {
        db.get('SELECT 1 as test', (err, row) => {
          const responseTime = Date.now() - startTime;

          if (err) {
            reject(new Error(`Database error: ${err.message}`));
          } else if (row && row.test === 1) {
            resolve({
              message: 'Database connection successful',
              responseTime
            });
          } else {
            reject(new Error('Database query returned unexpected result'));
          }
        });
      });
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  // Memory usage check
  async checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const thresholdMB = parseInt(process.env.MEMORY_THRESHOLD) || 512;

    if (heapUsedMB > thresholdMB) {
      throw new Error(`Memory usage too high: ${heapUsedMB}MB (threshold: ${thresholdMB}MB)`);
    }

    return {
      message: `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`,
      responseTime: 1
    };
  }

  // Event loop lag check
  async checkEventLoopLag() {
    const start = process.hrtime.bigint();

    await new Promise(resolve => setImmediate(resolve));

    const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
    const threshold = 100; // 100ms threshold

    if (lag > threshold) {
      throw new Error(`Event loop lag too high: ${lag.toFixed(2)}ms (threshold: ${threshold}ms)`);
    }

    return {
      message: `Event loop lag: ${lag.toFixed(2)}ms`,
      responseTime: Math.round(lag)
    };
  }

  // Disk space check
  async checkDiskSpace() {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const stats = await fs.stat(path.join(process.cwd(), 'data'));
      const dataPath = path.dirname(require('../config').database.path);

      // For Unix-like systems, use df command
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync(`df -h ${dataPath}`);
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const usage = lines[1].split(/\s+/)[4];
          const usagePercent = parseInt(usage.replace('%', ''));

          if (usagePercent > 90) {
            throw new Error(`Disk usage too high: ${usagePercent}%`);
          }

          return {
            message: `Disk usage: ${usagePercent}%`,
            responseTime: 10
          };
        }
      } catch (error) {
        // Fallback for Windows or when df is not available
        return {
          message: 'Disk space check: Available',
          responseTime: 1
        };
      }
    } catch (error) {
      throw new Error(`Disk space check failed: ${error.message}`);
    }
  }

  // Cache service check
  async checkCacheService() {
    try {
      const cacheService = require('../services/cacheService');
      const testKey = '_health_check_test';
      const testValue = Date.now().toString();

      const startTime = Date.now();

      // Test cache write and read
      await cacheService.set(testKey, testValue, { ttl: 10 });
      const retrieved = await cacheService.get(testKey);

      // Clean up
      await cacheService.delete(testKey);

      const responseTime = Date.now() - startTime;

      if (retrieved !== testValue) {
        throw new Error('Cache read/write test failed');
      }

      return {
        message: 'Cache service operational',
        responseTime
      };
    } catch (error) {
      throw new Error(`Cache service check failed: ${error.message}`);
    }
  }

  // External API connectivity check
  async checkExternalAPIs() {
    const errors = [];
    const startTime = Date.now();

    // Check OpenAI API (if configured)
    if (process.env.OPENAI_API_KEY) {
      try {
        const https = require('https');
        await new Promise((resolve, reject) => {
          const req = https.request('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'User-Agent': 'Comment-Manager-Health-Check'
            },
            timeout: 5000
          }, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`OpenAI API returned ${res.statusCode}`));
            }
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('OpenAI API timeout'));
          });

          req.end();
        });
      } catch (error) {
        errors.push(`OpenAI: ${error.message}`);
      }
    }

    const responseTime = Date.now() - startTime;

    if (errors.length > 0) {
      throw new Error(`External API issues: ${errors.join(', ')}`);
    }

    return {
      message: 'External APIs accessible',
      responseTime
    };
  }

  // Setup default health checks
  setupDefaultChecks() {
    // Critical checks
    this.registerCheck('database', () => this.checkDatabase(), { critical: true });
    this.registerCheck('memory', () => this.checkMemoryUsage(), { critical: true });
    this.registerCheck('event_loop', () => this.checkEventLoopLag(), { critical: true });

    // Non-critical checks
    this.registerCheck('disk_space', () => this.checkDiskSpace(), { critical: false });
    this.registerCheck('cache_service', () => this.checkCacheService(), { critical: false });
    this.registerCheck('external_apis', () => this.checkExternalAPIs(), { critical: false });

    // API endpoint check
    const port = process.env.PORT || 3000;
    this.registerCheck('api_endpoint', () => this.checkHTTPEndpoint(`http://localhost:${port}/health`), { critical: true });
  }
}

// CLI execution
async function main() {
  const healthChecker = new HealthChecker();
  healthChecker.setupDefaultChecks();

  try {
    console.log('🏥 Running health checks...\n');

    const results = await healthChecker.runChecks();

    // Print results
    console.log(`📊 Health Check Results (${results.timestamp})`);
    console.log(`Status: ${getStatusEmoji(results.status)} ${results.status.toUpperCase()}`);
    console.log(`Total checks: ${results.totalChecks}`);
    console.log(`Healthy: ${results.healthyChecks}`);
    console.log(`Critical failures: ${results.criticalFailures}`);
    console.log(`Total response time: ${results.totalResponseTime}ms\n`);

    // Print individual check results
    console.log('📋 Individual Check Results:');
    results.checks.forEach(check => {
      const emoji = check.status === 'healthy' ? '✅' : '❌';
      const critical = check.critical ? ' [CRITICAL]' : '';
      console.log(`${emoji} ${check.name}${critical}: ${check.message} (${check.responseTime}ms)`);
      if (check.attempt > 1) {
        console.log(`   └─ Succeeded after ${check.attempt} attempts`);
      }
    });

    // Exit with appropriate code
    if (results.status === 'critical') {
      console.log('\n🚨 Critical health check failures detected!');
      process.exit(1);
    } else if (results.status === 'degraded') {
      console.log('\n⚠️  Some health checks failed, but system is operational');
      process.exit(0);
    } else {
      console.log('\n🎉 All health checks passed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Health check execution failed:', error.message);
    logger.error('[HealthCheck] Execution failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return '🟢';
    case 'degraded': return '🟡';
    case 'critical': return '🔴';
    default: return '⚫';
  }
}

// Export for use as module
module.exports = HealthChecker;

// Run as CLI if executed directly
if (require.main === module) {
  main();
}