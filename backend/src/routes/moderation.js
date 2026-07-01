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
router.put('/thresholds', requireRole('admin'), moderationController.setThresholds);
// AI判定自動学習ON/OFF
router.put('/auto-learning', requireRole('admin'), moderationController.setAutoLearning);
// AI判定モデル切替
router.put('/switch-model', requireRole('admin'), moderationController.switchModel);
// AI判定の再学習API
router.post('/retrain', requireRole('admin'), moderationController.retrainModel);
// AI判定の説明表示
router.get('/explanation', requireRole('moderator'), moderationController.getExplanation);
// AI判定結果のエクスポート
router.get('/export', requireRole('moderator'), moderationController.exportResults);
// NGワード自動収集API
router.get('/collect-banned-words', requireRole('moderator'), moderationController.collectBannedWords);
// NGワードごとの重み付け設定
router.put('/word-weights', requireRole('admin'), moderationController.setWordWeights);
// NGワードの履歴取得
router.get('/banned-word-history', requireRole('moderator'), moderationController.getBannedWordHistory);
// NGワードの外部連携API
router.post('/external-banned-words', requireRole('admin'), moderationController.externalBannedWords);
// NGワードの自動翻訳API
router.post('/translate-banned-words', requireRole('admin'), moderationController.translateBannedWords);

// リンクブロック設定関連
router.get('/link-block/settings', requireRole('moderator'), moderationController.getLinkBlockSettings);
router.put('/link-block/settings', requireRole('admin'), moderationController.updateLinkBlockSettings);
router.get('/link-block/stats', requireRole('moderator'), moderationController.getLinkBlockStats);

// カスタムフィルタ関連
router.get('/custom-filters', requireRole('moderator'), moderationController.getCustomFilters);
router.post('/custom-filters', requireRole('admin'), moderationController.createCustomFilter);
router.put('/custom-filters/:filterId', requireRole('admin'), moderationController.updateCustomFilter);
router.delete('/custom-filters/:filterId', requireRole('admin'), moderationController.deleteCustomFilter);
router.post('/custom-filters/test', requireRole('moderator'), moderationController.testCustomFilter);
router.get('/custom-filters/stats', requireRole('moderator'), moderationController.getCustomFilterStats);

// 感情分析関連
router.post('/sentiment/analyze', requireRole('moderator'), moderationController.analyzeSentiment);
router.get('/sentiment/stats', requireRole('moderator'), moderationController.getSentimentStats);

// チャットボット関連
router.post('/chatbot/generate', requireRole('moderator'), moderationController.generateChatbotResponse);
router.get('/chatbot/settings', requireRole('moderator'), moderationController.getChatbotSettings);
router.put('/chatbot/settings', requireRole('admin'), moderationController.updateChatbotSettings);
router.get('/chatbot/stats', requireRole('moderator'), moderationController.getChatbotStats);

// 翻訳関連
router.post('/translation/translate', requireRole('moderator'), moderationController.translateText);
router.post('/translation/auto-translate', requireRole('moderator'), moderationController.autoTranslate);
router.get('/translation/settings', requireRole('moderator'), moderationController.getTranslationSettings);
router.put('/translation/settings', requireRole('admin'), moderationController.updateTranslationSettings);
router.get('/translation/stats', requireRole('moderator'), moderationController.getTranslationStats);

// AIモデレーション関連
router.post('/ai-moderation/analyze', requireRole('moderator'), moderationController.performAIModeration);
router.post('/ai-moderation/multi-analyze', requireRole('moderator'), moderationController.performMultiProviderAIModeration);
router.get('/ai-moderation/settings', requireRole('moderator'), moderationController.getAIModerationSettings);
router.put('/ai-moderation/settings', requireRole('admin'), moderationController.updateAIModerationSettings);
router.get('/ai-moderation/stats', requireRole('moderator'), moderationController.getAIModerationStats);
router.get('/ai-moderation/status', requireRole('moderator'), moderationController.checkAIModerationStatus);

// AI閾値設定関連
router.get('/ai-threshold/comments/:id', requireRole('moderator'), moderationController.getCommentAIThreshold);
router.put('/ai-threshold/comments/:id', requireRole('moderator'), moderationController.setCommentAIThreshold);
router.put('/ai-threshold/users/:id', requireRole('admin'), moderationController.setUserDefaultAIThreshold);
router.post('/ai-threshold/batch', requireRole('admin'), moderationController.batchUpdateAIThreshold);

module.exports = router;
