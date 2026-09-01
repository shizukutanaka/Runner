/**
 * 監視・モニタリングAPIコントローラー
 * システムパフォーマンス、ログ、統計情報を提供
 */

const db = require('../db');
const os = require('os');
const si = require('systeminformation');
const logger = require('../logger');
const { metricsCollector } = require('../middleware/monitoring');
const fs = require('fs').promises;
const path = require('path');

// システム統計情報取得
exports.getSystemStats = async (req, res, next) => {
  try {
    const [cpuUsage, memInfo, fsInfo, networkInfo, processes] = await Promise.all([
      si.currentLoad().catch((error) => {
        logger.warn('[Monitoring] Failed to collect CPU load', { error: error.message });
        return {};
      }),
      si.mem().catch((error) => {
        logger.warn('[Monitoring] Failed to collect memory stats', { error: error.message });
        return {};
      }),
      si.fsSize().catch((error) => {
        logger.warn('[Monitoring] Failed to collect filesystem stats', { error: error.message });
        return [];
      }),
      si.networkStats().catch((error) => {
        logger.warn('[Monitoring] Failed to collect network stats', { error: error.message });
        return [];
      }),
      si.processes().catch((error) => {
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
      disk: diskInfo.map((fs) => ({
        filesystem: fs.fs,
        size: Number(fs.size) || 0,
        used: Number(fs.used) || 0,
        available: Number(fs.available) || 0,
        usePercent: Number.isFinite(fs.use) ? Math.round(fs.use) : 0,
        mount: fs.mount
      })),
      network: {
        interfaces: networkStats.map((net) => ({
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
  // E-29: ここは存在しないテーブル `logs` を引いており、監視ダッシュボードの
  // 「最近のログ」タブは**必ず失敗**していた（画面にはエラーが出る）。
  //
  // ログを溜める場所を新設するのではなく、**既に書かれている場所を読む**。
  // winston-daily-rotate-file が `backend/logs/application-YYYY-MM-DD.log` に
  // 1行1JSONで書き出しているので、それが唯一の実在するログである。
  // DBにテーブルを足しても、そこへ書く経路が無い以上いつまでも空のままになる。
  try {
    const { level = 'all', limit = 100, offset = 0, startDate, endDate } = req.query;
    const max = Math.min(parseInt(limit, 10) || 100, 500);
    const skip = Math.max(parseInt(offset, 10) || 0, 0);

    const logDir = path.resolve(__dirname, '..', '..', 'logs');
    let files = [];
    try {
      files = (await fs.readdir(logDir))
        .filter((f) => f.startsWith('application-') && f.endsWith('.log'))
        .sort()
        .reverse();
    } catch (dirErr) {
      // ログディレクトリがまだ無いのは異常ではない（初回起動直後など）。
      // 「取得できない」ではなく「まだ無い」として空で返す
      if (dirErr.code !== 'ENOENT') throw dirErr;
    }

    const wanted = level === 'all' ? null : String(level).toLowerCase();
    const from = startDate ? new Date(startDate).getTime() : null;
    const to = endDate ? new Date(endDate).getTime() : null;
    const stats = { total: 0, errors: 0, warnings: 0, infos: 0, debugs: 0 };
    const collected = [];

    // 新しい日付のファイルから読み、必要な件数が集まったら止める。
    // 1ファイルあたりの読み込みは末尾から見る（新しい行が下にある）
    for (const file of files) {
      if (collected.length >= skip + max) break;
      let text;
      try {
        text = await fs.readFile(path.join(logDir, file), 'utf8');
      } catch (readErr) {
        // ローテーション中に消えることがある。1ファイルの失敗で全体を落とさない
        if (readErr.code === 'ENOENT') continue;
        throw readErr;
      }

      const lines = text.split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        let entry;
        try {
          entry = JSON.parse(line);
        } catch (parseErr) {
          continue; // 開発時のテキスト形式など、JSONでない行は飛ばす
        }

        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : null;
        if (from !== null && (ts === null || ts < from)) continue;
        if (to !== null && (ts === null || ts > to)) continue;

        const lvl = String(entry.level || 'info').toLowerCase();
        stats.total += 1;
        if (lvl === 'error') stats.errors += 1;
        else if (lvl === 'warn') stats.warnings += 1;
        else if (lvl === 'info') stats.infos += 1;
        else if (lvl === 'debug') stats.debugs += 1;

        if (wanted && lvl !== wanted) continue;
        collected.push({
          timestamp: entry.timestamp || null,
          level: lvl,
          message: entry.message || '',
          source: entry.service || entry.source || 'runner-backend'
        });
      }
    }

    res.json({
      status: 200,
      data: {
        logs: collected.slice(skip, skip + max),
        stats,
        pagination: { limit: max, offset: skip, total: collected.length }
      },
      message: 'ログ情報を取得しました'
    });
  } catch (error) {
    logger.error('[Monitoring] Error fetching logs', { error: error.message });
    next({ status: 500, message: 'ログ情報の取得中にエラーが発生しました', details: error });
  }
};

exports.getPerformanceMetrics = async (req, res, next) => {
  // E-29: ここは存在しない `performance_metrics` テーブルを引いていた。
  // 追加しても**書く経路が無い**（リクエストの計測はプロセス内の
  // metricsCollector が持っており、DBには一切保存していない）ので、
  // テーブルを足せば永久に空のグラフが出るだけになる。実在する集計を返す。
  //
  // 制約は正直に書いておく: metricsCollector はプロセス内のメモリなので、
  // **再起動で消え、期間指定もできない**（保持は直近1000リクエスト）。
  // 期間を指定しても同じ集計を返すため、応答に period と、
  // 期間で絞れないことを示す `windowed: false` を含める。
  try {
    const { period = '1h' } = req.query;
    const metrics = metricsCollector.getMetrics();

    const statusCodes = metrics.requests.by_status || {};
    const errorResponses = Object.entries(statusCodes)
      .filter(([code]) => Number(code) >= 400)
      .reduce((sum, [, count]) => sum + count, 0);
    const totalRequests = metrics.requests.total || 0;

    res.json({
      status: 200,
      data: {
        period,
        // プロセス内メモリのため期間で絞り込めない。UI がこれを見て注記できる
        windowed: false,
        source: 'in-process',
        uptimeSeconds: Math.round(metrics.uptime),
        totalRequests,
        averageResponseTime: metrics.requests.avg_response_time || 0,
        statusCodes,
        methods: metrics.requests.by_method || {},
        errors: {
          total: metrics.errors.total || 0,
          byType: metrics.errors.by_type || {},
          rate: totalRequests ? Math.round((errorResponses / totalRequests) * 10000) / 100 : 0
        },
        memory: metrics.memory
      },
      message: 'パフォーマンスメトリクスを取得しました'
    });
  } catch (error) {
    logger.error('[Monitoring] Error fetching performance metrics', { error: error.message });
    next({ status: 500, message: 'パフォーマンスメトリクスの取得中にエラーが発生しました', details: error });
  }
};

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

    // 外部API（OpenAI等）の状態。
    // 旧実装は `checks.external_apis = true` を無条件に代入しており、
    // それが overallHealth の算出にも入っていた。つまり **OpenAIが完全に落ちていても
    // ヘルスチェックは「健全」と報告する**という、監視として最も危険な嘘だった。
    // 実際にpingする実装はレイテンシとコストを伴うため、ここでは
    // **「設定されているか」という検証可能な事実のみ**を報告し、
    // 未検証の項目を健全性の判定に混ぜない（別フィールドに分離する）
    // eslint-disable-next-line global-require
    const openaiService = require('../services/openaiService');
    const externalServices = {
      openai: openaiService.isAvailable() ? 'configured' : 'not_configured',
      note: 'liveness is not probed; this reports configuration only'
    };

    // ディスク容量チェック
    const fsInfo = await si.fsSize();
    const diskUsage = fsInfo.reduce((acc, fs) => acc + fs.use, 0) / fsInfo.length;
    checks.disk_space = diskUsage < 90;

    // メモリチェック
    const memInfo = await si.mem();
    const memoryUsage = (memInfo.used / memInfo.total) * 100;
    checks.memory = memoryUsage < 90;

    const overallHealth = Object.values(checks).every((check) => check);

    res.json({
      status: overallHealth ? 200 : 503,
      data: {
        healthy: overallHealth,
        checks,
        // 実際に検証した項目(checks)と、設定状態のみを報告する項目を分けて返す
        externalServices,
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
    // E-29: 読み側は `settings` という列を期待していたが、書き側
    // （updateMonitoringSettings）は (category, key, value, type) で書いている。
    // テーブルが存在しなかったため誰も気づかなかった食い違い。書き側に合わせる。
    const settings = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, value, updated_at
        FROM system_settings
        WHERE category = 'monitoring' AND key = 'config'
        LIMIT 1
      `, (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          let parsed = null;
          try {
            parsed = JSON.parse(row.value);
          } catch (parseErr) {
            parsed = null; // 壊れた値は既定値で上書きせず、既定値を返す
          }
          if (parsed) {
            resolve({ id: row.id, settings: parsed, updated_at: row.updated_at });
            return;
          }
        }

        // 未設定なら既定値を返す（500にはしない）
        resolve({
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
