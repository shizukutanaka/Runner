const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analyticsController');
const { cacheMiddleware } = require('../middleware/cache');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', requireRole('analyst'), cacheMiddleware({ ttl: 30000 }), ctrl.getStats);
router.get('/graph', requireRole('analyst'), cacheMiddleware({ ttl: 30000 }), ctrl.getGraph);

// 期間指定統計
router.get('/period-stats', requireRole('analyst'), ctrl.getPeriodStats);
// ユーザー別統計
router.get('/user/:id', requireRole('analyst'), ctrl.getUserStats);
// コメント別統計
router.get('/comment/:id', requireRole('analyst'), ctrl.getCommentStats);
// AI判定別統計
router.get('/moderation', requireRole('analyst'), ctrl.getModerationStats);
// エクスポート
router.get('/export', requireRole('admin'), ctrl.exportAnalytics);
// インポート
router.post('/import', requireRole('admin'), ctrl.importAnalytics);
// 履歴取得
router.get('/history', requireRole('analyst'), ctrl.getHistory);
// 外部連携
router.post('/external', requireRole('admin'), ctrl.externalIntegration);
// 利用率取得
router.get('/usage', requireRole('analyst'), ctrl.getUsage);
// ピーク時取得
router.get('/peak', requireRole('analyst'), ctrl.getPeak);
// トレンド取得
router.get('/trend', requireRole('analyst'), ctrl.getTrend);
// ランキング取得
router.get('/ranking', requireRole('analyst'), ctrl.getRanking);
// 異常検知
router.get('/anomaly', requireRole('analyst'), ctrl.detectAnomaly);

module.exports = router;
