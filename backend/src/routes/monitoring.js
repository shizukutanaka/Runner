const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/monitoringController');
const auth = require('../middleware/auth');
const { healthCheck, metricsCollector } = require('../middleware/monitoring');
const { requireRole } = require('../middleware/auth');

// システム統計情報取得
router.get('/system/stats', auth('admin'), ctrl.getSystemStats);

// アプリケーション統計情報取得
router.get('/app/stats', auth('admin'), ctrl.getAppStats);

// ログ情報取得
router.get('/logs', auth('admin'), ctrl.getLogs);

// パフォーマンスメトリクス取得
router.get('/metrics', auth('admin'), ctrl.getPerformanceMetrics);

// アラート情報取得
router.get('/alerts', auth('admin'), ctrl.getAlerts);

// アラートの確認
router.put('/alerts/:alertId/acknowledge', auth('admin'), ctrl.acknowledgeAlert);

// システムヘルスチェック
router.get('/health', ctrl.getHealthStatus);

// 監視設定取得
router.get('/settings', auth('admin'), ctrl.getMonitoringSettings);

// 監視設定更新
router.put('/settings', auth('admin'), ctrl.updateMonitoringSettings);

// Detailed health check (admin only)
router.get('/health/detailed', requireRole('admin'), async (req, res) => {
  try {
    const results = await healthCheck.runAllChecks();
    const detailed = {
      ...results,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        version: process.version,
        env: process.env.NODE_ENV
      },
      metrics: metricsCollector.getMetrics()
    };
    res.json(detailed);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get detailed health status',
      message: error.message
    });
  }
});

// Reset metrics (admin only)
router.post('/metrics/reset', requireRole('admin'), (req, res) => {
  metricsCollector.reset();
  res.json({ message: 'Metrics reset successfully' });
});

// Get specific health check
router.get('/health/check/:name', requireRole('moderator'), async (req, res) => {
  const { name } = req.params;

  try {
    const result = await healthCheck.runCheck(name);
    res.json({ check: name, ...result });
  } catch (error) {
    res.status(404).json({
      error: 'Health check not found',
      available: Array.from(healthCheck.checks.keys())
    });
  }
});

module.exports = router;