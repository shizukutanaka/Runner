const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/monitoringController');
const { healthCheck, metricsCollector } = require('../middleware/monitoring');
const { authenticateToken, requireRole } = require('../middleware/auth');

// requireRoleはreq.userの存在を前提とするが、このルーターにはこれまで
// authenticateTokenが一切配線されておらず、req.userが常にundefinedのため
// 全エンドポイントが誰に対しても401 'Authentication required'を返し続けていた
// （/healthのみ意図的に無認証公開のため、router.use()による一括適用ではなく
// 各保護対象ルートに個別に追加する）

// システム統計情報取得
router.get('/system/stats', authenticateToken, requireRole('admin'), ctrl.getSystemStats);

// アプリケーション統計情報取得
router.get('/app/stats', authenticateToken, requireRole('admin'), ctrl.getAppStats);

// ログ情報取得
router.get('/logs', authenticateToken, requireRole('admin'), ctrl.getLogs);

// パフォーマンスメトリクス取得
router.get('/metrics', authenticateToken, requireRole('admin'), ctrl.getPerformanceMetrics);

// アラート情報取得
router.get('/alerts', authenticateToken, requireRole('admin'), ctrl.getAlerts);

// アラートの確認
router.put('/alerts/:alertId/acknowledge', authenticateToken, requireRole('admin'), ctrl.acknowledgeAlert);

// システムヘルスチェック
router.get('/health', ctrl.getHealthStatus);

// 監視設定取得
router.get('/settings', authenticateToken, requireRole('admin'), ctrl.getMonitoringSettings);

// 監視設定更新
router.put('/settings', authenticateToken, requireRole('admin'), ctrl.updateMonitoringSettings);

// Detailed health check (admin only)
router.get('/health/detailed', authenticateToken, requireRole('admin'), async (req, res) => {
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
router.post('/metrics/reset', authenticateToken, requireRole('admin'), (req, res) => {
  metricsCollector.reset();
  res.json({ message: 'Metrics reset successfully' });
});

// Get specific health check
router.get('/health/check/:name', authenticateToken, requireRole('moderator'), async (req, res) => {
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

// OpenAI コスト統計 (admin only)
router.get('/ai/costs', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const openaiService = require('../services/openaiService');
    res.json({
      success: true,
      data: openaiService.getCostStats()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get AI cost stats', message: error.message });
  }
});

module.exports = router;