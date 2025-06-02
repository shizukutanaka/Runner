const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analyticsController');

router.get('/stats', ctrl.getStats);
router.get('/graph', ctrl.getGraph);

// 期間指定統計
router.get('/period-stats', ctrl.getPeriodStats);
// ユーザー別統計
router.get('/user/:id', ctrl.getUserStats);
// コメント別統計
router.get('/comment/:id', ctrl.getCommentStats);
// AI判定別統計
router.get('/moderation', ctrl.getModerationStats);
// エクスポート
router.get('/export', ctrl.exportAnalytics);
// インポート
router.post('/import', ctrl.importAnalytics);
// 履歴取得
router.get('/history', ctrl.getHistory);
// 外部連携
router.post('/external', ctrl.externalIntegration);
// 利用率取得
router.get('/usage', ctrl.getUsage);
// ピーク時取得
router.get('/peak', ctrl.getPeak);
// トレンド取得
router.get('/trend', ctrl.getTrend);
// ランキング取得
router.get('/ranking', ctrl.getRanking);
// 異常検知
router.get('/anomaly', ctrl.detectAnomaly);

module.exports = router;
