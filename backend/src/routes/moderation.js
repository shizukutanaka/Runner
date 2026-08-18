const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderationController');
const validate = require('../middleware/validation');
const moderationSchema = require('../validation/moderation');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/', requireRole('moderator'), validate(moderationSchema.moderate), moderationController.moderateComment);
router.put('/settings', requireRole('admin'), validate(moderationSchema.updateSettings), moderationController.updateSettings);

// AI判定閾値詳細設定
// AI判定自動学習ON/OFF
// AI判定モデル切替
// AI判定の再学習API
// AI判定の説明表示
// AI判定結果のエクスポート
// NGワード自動収集API
// NGワードごとの重み付け設定
// NGワードの履歴取得
// NGワードの外部連携API
// NGワードの自動翻訳API

// リンクブロック設定関連

// カスタムフィルタ関連

// 感情分析関連

// チャットボット関連

// 翻訳関連
router.post('/translation/translate', requireRole('moderator'), moderationController.translateText);
router.post('/translation/auto-translate', requireRole('moderator'), moderationController.autoTranslate);

// AIモデレーション関連
router.post('/ai-moderation/analyze', requireRole('moderator'), moderationController.performAIModeration);
router.post('/ai-moderation/multi-analyze', requireRole('moderator'), moderationController.performMultiProviderAIModeration);

// AI閾値設定関連
router.get('/ai-threshold/comments/:id', requireRole('moderator'), moderationController.getCommentAIThreshold);
router.put('/ai-threshold/comments/:id', requireRole('moderator'), moderationController.setCommentAIThreshold);
router.put('/ai-threshold/users/:id', requireRole('admin'), moderationController.setUserDefaultAIThreshold);
router.post('/ai-threshold/batch', requireRole('admin'), moderationController.batchUpdateAIThreshold);

// 保留メッセージキュー関連（getHeldMessages等は実装済みだったが、ルートが一度も追加されていなかった）
router.get('/held-messages', requireRole('moderator'), moderationController.getHeldMessages);
router.get('/held-messages/stats', requireRole('moderator'), moderationController.getMessageHoldStats);
router.put('/held-messages/:holdId', requireRole('moderator'), moderationController.processHeldMessage);
router.post('/held-messages/bulk', requireRole('moderator'), moderationController.bulkProcessHeldMessages);

module.exports = router;
