// backend/src/controllers/healthController.js
const os = require('os');
const { sequelize, healthCheck, getPoolStats } = require('../config/database');
const cacheService = require('../services/cacheService');
const { logger, logPerformance } = require('../utils/enhancedLogger');

/**
 * ヘルスチェックコントローラー
 */
class HealthController {
  /**
   * 基本的なヘルスチェックエンドポイント
   */
  async basicHealth(req, res) {
    const startTime = Date.now();

    try {
      const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        memory: this.getMemoryUsage(),
        cpu: this.getCpuUsage()
      };

      logPerformance('health_check_basic', Date.now() - startTime, {
        status: 'ok',
        responseTime: `${Date.now() - startTime}ms`
      });

      res.status(200).json(healthData);
    } catch (error) {
      logger.error('ヘルスチェックエラー:', error);

      logPerformance('health_check_basic', Date.now() - startTime, {
        status: 'error',
        error: error.message
      });

      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * 詳細なヘルスチェックエンドポイント
   */
  async detailedHealth(req, res) {
    const startTime = Date.now();

    try {
      // データベースヘルスチェック
      const dbHealth = await healthCheck();
      const dbPoolStats = getPoolStats();

      // キャッシュヘルスチェック
      const cacheHealth = await cacheService.healthCheck();

      // システム情報
      const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      };

      // プロセス情報
      const processInfo = {
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsage: this.getDetailedMemoryUsage(),
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION
      };

      // 依存関係のヘルスチェック
      const dependencies = await this.checkDependencies();

      const healthData = {
        status: this.calculateOverallHealth(dbHealth, cacheHealth, dependencies),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${Date.now() - startTime}ms`,
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        system: systemInfo,
        process: processInfo,
        database: {
          ...dbHealth,
          pool: dbPoolStats
        },
        cache: cacheHealth,
        dependencies: dependencies
      };

      const statusCode = healthData.status === 'healthy' ? 200 : 503;

      logPerformance('health_check_detailed', Date.now() - startTime, {
        status: healthData.status,
        responseTime: healthData.responseTime
      });

      res.status(statusCode).json(healthData);
    } catch (error) {
      logger.error('詳細ヘルスチェックエラー:', error);

      logPerformance('health_check_detailed', Date.now() - startTime, {
        status: 'error',
        error: error.message
      });

      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
        uptime: process.uptime()
      });
    }
  }

  /**
   * 依存関係のヘルスチェック
   */
  async checkDependencies() {
    const dependencies = [];

    // データベースチェック
    try {
      const dbStart = Date.now();
      await sequelize.authenticate();
      dependencies.push({
        name: 'database',
        status: 'healthy',
        responseTime: `${Date.now() - dbStart}ms`,
        type: 'postgresql'
      });
    } catch (error) {
      dependencies.push({
        name: 'database',
        status: 'unhealthy',
        error: error.message,
        type: 'postgresql'
      });
    }

    // Redisチェック
    try {
      const cacheStart = Date.now();
      await cacheService.healthCheck();
      dependencies.push({
        name: 'redis',
        status: 'healthy',
        responseTime: `${Date.now() - cacheStart}ms`,
        type: 'cache'
      });
    } catch (error) {
      dependencies.push({
        name: 'redis',
        status: 'unhealthy',
        error: error.message,
        type: 'cache'
      });
    }

    return dependencies;
  }

  /**
   * 全体的なヘルスステータスの計算
   */
  calculateOverallHealth(dbHealth, cacheHealth, dependencies) {
    const criticalComponents = [dbHealth, cacheHealth];
    const allComponents = [...criticalComponents, ...dependencies];

    // 重要なコンポーネントが一つでも不健康なら全体を不健康に
    if (criticalComponents.some(component => component.status !== 'healthy')) {
      return 'unhealthy';
    }

    // 依存関係に不健康なものがあれば警告レベルに
    if (dependencies.some(dep => dep.status !== 'healthy')) {
      return 'warning';
    }

    return 'healthy';
  }

  /**
   * メモリ使用量の取得
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: this.formatBytes(usage.rss),
      heapTotal: this.formatBytes(usage.heapTotal),
      heapUsed: this.formatBytes(usage.heapUsed),
      external: this.formatBytes(usage.external)
    };
  }

  /**
   * 詳細なメモリ使用量の取得
   */
  getDetailedMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: {
        bytes: usage.rss,
        formatted: this.formatBytes(usage.rss)
      },
      heapTotal: {
        bytes: usage.heapTotal,
        formatted: this.formatBytes(usage.heapTotal)
      },
      heapUsed: {
        bytes: usage.heapUsed,
        formatted: this.formatBytes(usage.heapUsed)
      },
      external: {
        bytes: usage.external,
        formatted: this.formatBytes(usage.external)
      },
      heapUsagePercentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
    };
  }

  /**
   * CPU使用量の取得（簡易版）
   */
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;

    return {
      usage: Math.round(((total - idle) / total) * 100),
      cores: cpus.length
    };
  }

  /**
   * バイト数を人間が読みやすい形式に変換
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * メトリクスエンドポイント（Prometheus互換）
   */
  async metrics(req, res) {
    try {
      const metrics = {
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        database: {
          pool: getPoolStats()
        },
        cache: await cacheService.getStats(),
        requests: {
          total: req.app.locals.requestCount || 0,
          active: req.app.locals.activeRequests || 0
        }
      };

      res.set('Content-Type', 'application/json');
      res.status(200).json(metrics);
    } catch (error) {
      logger.error('メトリクス取得エラー:', error);
      res.status(500).json({
        error: 'メトリクス取得中にエラーが発生しました',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * ライブネスプローブ（Kubernetes対応）
   */
  async liveness(req, res) {
    try {
      // 基本的なプロセス状態チェック
      const isHealthy = process.uptime() > 0 && !process._exiting;

      if (isHealthy) {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      } else {
        res.status(500).json({
          status: 'dead',
          timestamp: new Date().toISOString(),
          error: 'プロセスが異常な状態です'
        });
      }
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * レディネスプローブ（Kubernetes対応）
   */
  async readiness(req, res) {
    try {
      // データベース接続チェック
      const dbHealth = await healthCheck();

      if (dbHealth.status === 'healthy') {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          database: 'connected'
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          database: dbHealth
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * システム情報のエンドポイント
   */
  async systemInfo(req, res) {
    try {
      const systemInfo = {
        platform: {
          name: os.platform(),
          version: os.release(),
          architecture: os.arch(),
          hostname: os.hostname()
        },
        hardware: {
          cpus: os.cpus().length,
          totalMemory: this.formatBytes(os.totalmem()),
          freeMemory: this.formatBytes(os.freemem()),
          loadAverage: os.loadavg()
        },
        process: {
          nodeVersion: process.version,
          pid: process.pid,
          platform: process.platform,
          memoryUsage: this.getDetailedMemoryUsage(),
          uptime: process.uptime(),
          version: process.env.APP_VERSION || '1.0.0'
        },
        environment: {
          nodeEnv: process.env.NODE_ENV,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: process.env.LANG || process.env.LC_ALL || '不明'
        }
      };

      res.status(200).json(systemInfo);
    } catch (error) {
      logger.error('システム情報取得エラー:', error);
      res.status(500).json({
        error: 'システム情報取得中にエラーが発生しました',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// コントローラーインスタンスをエクスポート
const healthController = new HealthController();

module.exports = healthController;
