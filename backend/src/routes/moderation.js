const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderationController');
const validate = require('../middleware/validation');
const moderationSchema = require('../validation/moderation');

router.post('/', validate(moderationSchema.moderate), moderationController.moderateComment);
router.put('/settings', validate(moderationSchema.updateSettings), moderationController.updateSettings);

// AI判定閾値詳細設定
router.put('/thresholds', moderationController.setThresholds);
// AI判定自動学習ON/OFF
router.put('/auto-learning', moderationController.setAutoLearning);
// AI判定モデル切替
router.put('/switch-model', moderationController.switchModel);
// AI判定の再学習API
router.post('/retrain', moderationController.retrainModel);
// AI判定の説明表示
router.get('/explanation', moderationController.getExplanation);
// AI判定結果のエクスポート
router.get('/export', moderationController.exportResults);
// NGワード自動収集API
router.get('/collect-banned-words', moderationController.collectBannedWords);
// NGワードごとの重み付け設定
router.put('/word-weights', moderationController.setWordWeights);
// NGワードの履歴取得
router.get('/banned-word-history', moderationController.getBannedWordHistory);
// NGワードの外部連携API
router.post('/external-banned-words', moderationController.externalBannedWords);
// NGワードの自動翻訳API
router.post('/translate-banned-words', moderationController.translateBannedWords);

module.exports = router;
