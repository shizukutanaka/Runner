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

// リンクブロック設定関連
router.get('/link-block/settings', moderationController.getLinkBlockSettings);
router.put('/link-block/settings', moderationController.updateLinkBlockSettings);
router.get('/link-block/stats', moderationController.getLinkBlockStats);

// カスタムフィルタ関連
router.get('/custom-filters', moderationController.getCustomFilters);
router.post('/custom-filters', moderationController.createCustomFilter);
router.put('/custom-filters/:filterId', moderationController.updateCustomFilter);
router.delete('/custom-filters/:filterId', moderationController.deleteCustomFilter);
router.post('/custom-filters/test', moderationController.testCustomFilter);
router.get('/custom-filters/stats', moderationController.getCustomFilterStats);

// 感情分析関連
router.post('/sentiment/analyze', moderationController.analyzeSentiment);
router.get('/sentiment/stats', moderationController.getSentimentStats);

// チャットボット関連
router.post('/chatbot/generate', moderationController.generateChatbotResponse);
router.get('/chatbot/settings', moderationController.getChatbotSettings);
router.put('/chatbot/settings', moderationController.updateChatbotSettings);
router.get('/chatbot/stats', moderationController.getChatbotStats);

// 翻訳関連
router.post('/translation/translate', moderationController.translateText);
router.post('/translation/auto-translate', moderationController.autoTranslate);
router.get('/translation/settings', moderationController.getTranslationSettings);
router.put('/translation/settings', moderationController.updateTranslationSettings);
router.get('/translation/stats', moderationController.getTranslationStats);

// AIモデレーション関連
router.post('/ai-moderation/analyze', moderationController.performAIModeration);
router.post('/ai-moderation/multi-analyze', moderationController.performMultiProviderAIModeration);
router.get('/ai-moderation/settings', moderationController.getAIModerationSettings);
router.put('/ai-moderation/settings', moderationController.updateAIModerationSettings);
router.get('/ai-moderation/stats', moderationController.getAIModerationStats);
router.get('/ai-moderation/status', moderationController.checkAIModerationStatus);

// AI閾値設定関連
router.get('/ai-threshold/comments/:id', moderationController.getCommentAIThreshold);
router.put('/ai-threshold/comments/:id', moderationController.setCommentAIThreshold);
router.put('/ai-threshold/users/:id', moderationController.setUserDefaultAIThreshold);
router.post('/ai-threshold/batch', moderationController.batchUpdateAIThreshold);

module.exports = router;
