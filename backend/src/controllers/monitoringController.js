/**
 * 監視・モニタリングAPIコントローラー
 * システムパフォーマンス、ログ、統計情報を提供
 */

const db = require('../db');
const os = require('os');
const si = require('systeminformation');
const logger = require('../logger');
const { metricsCollector } = require('../middleware/monitoring');

// システム統計情報取得
exports.getSystemStats = async (req, res, next) => {
  try {
    const [cpuUsage, memInfo, fsInfo, networkInfo, processes] = await Promise.all([
      si.currentLoad().catch(error => {
        logger.warn('[Monitoring] Failed to collect CPU load', { error: error.message });
        return {};
      }),
      si.mem().catch(error => {
        logger.warn('[Monitoring] Failed to collect memory stats', { error: error.message });
        return {};
      }),
      si.fsSize().catch(error => {
        logger.warn('[Monitoring] Failed to collect filesystem stats', { error: error.message });
        return [];
      }),
      si.networkStats().catch(error => {
        logger.warn('[Monitoring] Failed to collect network stats', { error: error.message });
        return [];
      }),
      si.processes().catch(error => {
        logger.warn('[Monitoring] Failed to collect process stats', { error: error.message });
        return {};
      })
    ]);

    const rateLimitMetrics = metricsCollector?.getMetrics?.().rateLimits || {
      total: 0,
      lastTriggeredAt: null,
      byLimiter: {}
    };

    const safeCpuUsage = cpuUsage || {};
    const safeMemInfo = {
      total: Number(memInfo?.total) || 0,
      used: Number(memInfo?.used) || 0,
      free: Number(memInfo?.free) || 0,
      available: Number(memInfo?.available) || 0,
      buffers: Number(memInfo?.buffers) || 0,
      cached: Number(memInfo?.cached) || 0
    };

    const diskInfo = Array.isArray(fsInfo) ? fsInfo : [];
    const networkStats = Array.isArray(networkInfo) ? networkInfo : [];
    const processInfo = processes || {};

    const memoryUsagePercent = safeMemInfo.total > 0
      ? Math.round((safeMemInfo.used / safeMemInfo.total) * 100)
      : 0;

    const systemStats = {
      cpu: {
        usage: Math.round(safeCpuUsage.currentLoad || 0),
        cores: Array.isArray(safeCpuUsage.cpus) && safeCpuUsage.cpus.length > 0
          ? safeCpuUsage.cpus.length
          : os.cpus().length,
        temperature: Array.isArray(safeCpuUsage.temperatures)
          ? safeCpuUsage.temperatures[0]
          : null,
        loadAverage: os.loadavg()
      },
      memory: {
        total: safeMemInfo.total,
        used: safeMemInfo.used,
        free: safeMemInfo.free,
        usagePercent: memoryUsagePercent,
        available: safeMemInfo.available,
        buffers: safeMemInfo.buffers,
        cached: safeMemInfo.cached
      },
      disk: diskInfo.map(fs => ({
        filesystem: fs.fs,
        size: Number(fs.size) || 0,
        used: Number(fs.used) || 0,
        available: Number(fs.available) || 0,
        usePercent: Number.isFinite(fs.use) ? Math.round(fs.use) : 0,
        mount: fs.mount
      })),
      network: {
        interfaces: networkStats.map(net => ({
          interface: net.iface,
          rx_bytes: Number(net.rx_bytes) || 0,
          tx_bytes: Number(net.tx_bytes) || 0,
          rx_sec: Number(net.rx_sec) || 0,
          tx_sec: Number(net.tx_sec) || 0,
          operstate: net.operstate,
          speed: Number(net.speed) || 0
        })),
        totalRxBytes: networkStats.reduce((sum, net) => sum + (Number(net.rx_bytes) || 0), 0),
        totalTxBytes: networkStats.reduce((sum, net) => sum + (Number(net.tx_bytes) || 0), 0)
      },
      processes: {
        total: Number(processInfo.all) || 0,
        running: Number(processInfo.running) || 0,
        sleeping: Number(processInfo.sleeping) || 0,
        blocked: Number(processInfo.blocked) || 0,
        list: Array.isArray(processInfo.list)
          ? processInfo.list.slice(0, 10)
          : [] // トップ10プロセス
      },
      rateLimits: rateLimitMetrics,
      system: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: systemStats,
      message: 'システム統計情報を取得しました'
    });
  } catch (error) {
    logger.error('[Monitoring] System stats retrieval failed', {
      error: error.message,
      stack: error.stack
    });
    next({
      status: 500,
      message: 'システム統計情報の取得に失敗しました',
      details: error.message
    });
  }
};

// アプリケーション統計情報取得
exports.getAppStats = async (req, res, next) => {
  try {
    const { period = '24h' } = req.query;

    // 期間の計算
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case '1h':
        startDate.setHours(now.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 1);
    }

    // コメント集計データ取得
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `
          SELECT
            DATE(created_at) as date,
            platform,
            COUNT(*) as total_comments,
            COUNT(CASE WHEN status = 'moderated' THEN 1 END) as moderated_comments,
            COUNT(DISTINCT user) as unique_users,
            AVG(CASE WHEN LENGTH(content) > 0 THEN LENGTH(content) END) as avg_content_length
          FROM comments
          WHERE created_at >= ?
          GROUP BY DATE(created_at), platform
          ORDER BY date DESC
          LIMIT 100
        `,
        [startDate.toISOString()],
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result || []);
        }
      );
    });

    const uniqueUsersRow = await new Promise((resolve, reject) => {
      db.get(
        `
          SELECT COUNT(DISTINCT user) as unique_users
          FROM comments
          WHERE created_at >= ?
        `,
        [startDate.toISOString()],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row || { unique_users: 0 });
        }
      );
    });

    const activeConnections = req.app.get('io')?.sockets?.sockets?.size || 0;
    const totalComments = rows.reduce((sum, row) => sum + row.total_comments, 0);
    const totalModerated = rows.reduce((sum, row) => sum + row.moderated_comments, 0);

    const appStats = {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      data: rows,
      summary: {
        activeConnections,
        totalComments,
        totalModerated,
        uniqueUsers: uniqueUsersRow.unique_users || 0
      },
      timestamp: now.toISOString()
    };

    res.json({
      status: 200,
      data: appStats,
      message: 'アプリケーション統計情報を取得しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: 'アプリケーション統計情報の取得に失敗しました',
      details: error.message
    });
  }
};

// ログ情報取得
exports.getLogs = async (req, res, next) => {
  try {
    const {
      level = 'all',
      limit = 100,
      offset = 0,
      startDate,
      endDate,
      source = 'all'
    } = req.query;

    let query = `
      SELECT
        id,
        timestamp,
        level,
        message,
        source,
        metadata,
        user_id,
        ip_address,
        user_agent
      FROM logs
      WHERE 1=1
    `;

    const params = [];

    // レベルフィルタ
    if (level !== 'all') {
      query += ' AND level = ?';
      params.push(level.toLowerCase());
    }

    // ソースフィルタ
    if (source !== 'all') {
      query += ' AND source = ?';
      params.push(source);
    }

    // 日付範囲フィルタ
    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });

    // ログ統計
    const logStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN level = 'error' THEN 1 END) as errors,
          COUNT(CASE WHEN level = 'warn' THEN 1 END) as warnings,
          COUNT(CASE WHEN level = 'info' THEN 1 END) as infos,
          COUNT(CASE WHEN level = 'debug' THEN 1 END) as debugs
        FROM logs
        WHERE timestamp >= datetime('now', '-24 hours')
      `, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });

    res.json({
      status: 200,
      data: {
        logs,
        stats: logStats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: logStats.total
        }
      },
      message: 'ログ情報を取得しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: 'ログ情報の取得に失敗しました',
      details: error.message
    });
  }
};

// パフォーマンスメトリクス取得
exports.getPerformanceMetrics = async (req, res, next) => {
  try {
    const { period = '1h' } = req.query;

    // 期間の計算
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case '5m':
        startDate.setMinutes(now.getMinutes() - 5);
        break;
      case '1h':
        startDate.setHours(now.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      default:
        startDate.setMinutes(now.getMinutes() - 5);
    }

    // パフォーマンスメトリクスを取得
    const metrics = await new Promise((resolve, reject) => {
      db.all(`
        SELECT
          timestamp,
          response_time,
          status_code,
          endpoint,
          method,
          user_agent,
          ip_address
        FROM performance_metrics
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 1000
      `, [startDate.toISOString()], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // メトリクスの集計
        const aggregated = {
          totalRequests: rows.length,
          averageResponseTime: rows.reduce((sum, row) => sum + (row.response_time || 0), 0) / rows.length || 0,
          statusCodes: {},
          endpoints: {},
          responseTimeRanges: {
            '<100ms': 0,
            '100-500ms': 0,
            '500-1000ms': 0,
            '1000-2000ms': 0,
            '>2000ms': 0
          }
        };

        rows.forEach(row => {
          // ステータスコード集計
          aggregated.statusCodes[row.status_code] = (aggregated.statusCodes[row.status_code] || 0) + 1;

          // エンドポイント集計
          aggregated.endpoints[row.endpoint] = (aggregated.endpoints[row.endpoint] || 0) + 1;

          // レスポンスタイム範囲集計
          const rt = row.response_time || 0;
          if (rt < 100) aggregated.responseTimeRanges['<100ms']++;
          else if (rt < 500) aggregated.responseTimeRanges['100-500ms']++;
          else if (rt < 1000) aggregated.responseTimeRanges['500-1000ms']++;
          else if (rt < 2000) aggregated.responseTimeRanges['1000-2000ms']++;
          else aggregated.responseTimeRanges['>2000ms']++;
        });

        resolve({
          period,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
          data: rows,
          aggregated,
          timestamp: now.toISOString()
        });
      });
    });

    res.json({
      status: 200,
      data: metrics,
      message: 'パフォーマンスメトリクスを取得しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: 'パフォーマンスメトリクスの取得に失敗しました',
      details: error.message
    });
  }
};

// アラート情報取得
exports.getAlerts = async (req, res, next) => {
  try {
    const {
      status = 'all',
      severity = 'all',
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        id,
        type,
        severity,
        title,
        message,
        data,
        status,
        acknowledged_by,
        acknowledged_at,
        created_at,
        resolved_at
      FROM alerts
      WHERE 1=1
    `;

    const params = [];

    // ステータスフィルタ
    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    // 重要度フィルタ
    if (severity !== 'all') {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const alerts = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });

    // アラート統計
    const alertStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'acknowledged' THEN 1 END) as acknowledged,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
          COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warnings,
          COUNT(CASE WHEN severity = 'info' THEN 1 END) as infos
        FROM alerts
      `, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });

    res.json({
      status: 200,
      data: {
        alerts,
        stats: alertStats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: alertStats.total
        }
      },
      message: 'アラート情報を取得しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: 'アラート情報の取得に失敗しました',
      details: error.message
    });
  }
};

// アラートの確認
exports.acknowledgeAlert = async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.body;

    const result = await new Promise((resolve, reject) => {
      db.run(`
        UPDATE alerts
        SET status = 'acknowledged',
            acknowledged_by = ?,
            acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [userId, alertId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error('Alert not found'));
          return;
        }

        resolve({ alertId, acknowledged: true });
      });
    });

    res.json({
      status: 200,
      data: result,
      message: 'アラートを確認しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: 'アラートの確認に失敗しました',
      details: error.message
    });
  }
};

// システムヘルスチェック
exports.getHealthStatus = async (req, res, next) => {
  try {
    const checks = {
      database: false,
      websocket: false,
      external_apis: false,
      disk_space: false,
      memory: false
    };

    // データベースチェック
    try {
      await new Promise((resolve, reject) => {
        db.get('SELECT 1', (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
      checks.database = true;
    } catch (error) {
      checks.database = false;
    }

    // WebSocketチェック
    const io = req.app.get('io');
    checks.websocket = io !== undefined;

    // 外部APIチェック（OpenAIなど）
    // 実際の実装ではAPIのヘルスチェックを行う
    checks.external_apis = true;

    // ディスク容量チェック
    const fsInfo = await si.fsSize();
    const diskUsage = fsInfo.reduce((acc, fs) => acc + fs.use, 0) / fsInfo.length;
    checks.disk_space = diskUsage < 90;

    // メモリチェック
    const memInfo = await si.mem();
    const memoryUsage = (memInfo.used / memInfo.total) * 100;
    checks.memory = memoryUsage < 90;

    const overallHealth = Object.values(checks).every(check => check);

    res.json({
      status: overallHealth ? 200 : 503,
      data: {
        healthy: overallHealth,
        checks,
        timestamp: new Date().toISOString()
      },
      message: overallHealth ? 'システムは正常です' : 'システムに問題があります'
    });
  } catch (error) {
    next({
      status: 503,
      message: 'ヘルスチェックに失敗しました',
      details: error.message
    });
  }
};

// 監視設定取得
exports.getMonitoringSettings = async (req, res, next) => {
  try {
    const settings = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          id,
          settings,
          updated_at
        FROM system_settings
        WHERE category = 'monitoring'
        ORDER BY updated_at DESC
        LIMIT 1
      `, (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row || {
          settings: {
            enabled: true,
            intervals: {
              system: 10000,
              application: 5000,
              logs: 30000
            },
            thresholds: {
              cpu: 80,
              memory: 85,
              disk: 90,
              responseTime: 1000,
              errorRate: 5
            },
            notifications: {
              enabled: true,
              channels: ['dashboard', 'email', 'slack'],
              severity: ['critical', 'warning']
            },
            retention: {
              logs: 30,
              metrics: 90,
              alerts: 365
            }
          }
        });
      });
    });

    res.json({
      status: 200,
      data: settings,
      message: '監視設定を取得しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: '監視設定の取得に失敗しました',
      details: error.message
    });
  }
};

// 監視設定更新
exports.updateMonitoringSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;

    const result = await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO system_settings (category, key, value, type, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        'monitoring',
        'config',
        JSON.stringify(settings),
        'json'
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ id: this.lastID, updated: true });
      });
    });

    res.json({
      status: 200,
      data: result,
      message: '監視設定を更新しました'
    });
  } catch (error) {
    next({
      status: 500,
      message: '監視設定の更新に失敗しました',
      details: error.message
    });
  }
};
