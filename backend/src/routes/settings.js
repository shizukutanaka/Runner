const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validation');
const settingsSchema = require('../validation/settings');

const requireUserParam = validate({ params: settingsSchema.userIdParam });
const validateUserBody = (bodySchema) =>
  validate({ params: settingsSchema.userIdParam, body: bodySchema });
const validateUserQuery = (querySchema) =>
  validate({ params: settingsSchema.userIdParam, query: querySchema });
const validateCommentQuery = (querySchema) =>
  validate({ params: settingsSchema.commentIdParam, query: querySchema });

// バージョン/利用規約などの静的リソース
router.get('/version', ctrl.getVersion);
router.get('/terms', ctrl.getTerms);

router.use(authenticateToken);

// 設定のエクスポート/インポート
router.get('/export', requireRole('admin'), validate({ query: settingsSchema.exportSettings }), ctrl.exportSettings);
router.post('/import', requireRole('admin'), validate(settingsSchema.importSettings), ctrl.importSettings);

// ユーザー単位の設定操作
router.get('/user/:userId', requireRole('admin'), requireUserParam, ctrl.getSettings);
router.put('/user/:userId', requireRole('admin'), requireUserParam, ctrl.updateSettings);

// テーマ色設定
router.put('/user/:userId/theme', requireRole('admin'), validateUserBody(settingsSchema.setTheme), ctrl.setTheme);
// レイアウト設定
router.put('/user/:userId/layout', requireRole('admin'), validateUserBody(settingsSchema.setLayout), ctrl.setLayout);
// 通知ON/OFF
router.put('/user/:userId/notifications', requireRole('admin'), validateUserBody(settingsSchema.setNotifications), ctrl.setNotifications);
// デフォルト言語設定
router.put('/user/:userId/default-language', requireRole('admin'), validateUserBody(settingsSchema.setDefaultLanguage), ctrl.setDefaultLanguage);
// タイムゾーン設定
router.put('/user/:userId/timezone', requireRole('admin'), validateUserBody(settingsSchema.setTimezone), ctrl.setTimezone);
// 管理者メール設定
router.put('/user/:userId/admin-email', requireRole('admin'), validateUserBody(settingsSchema.setAdminEmail), ctrl.setAdminEmail);
// APIキー管理
router.put('/user/:userId/api-keys', requireRole('admin'), validateUserBody(settingsSchema.manageApiKeys), ctrl.manageApiKeys);
// 外部連携設定
router.put('/user/:userId/external-integration', requireRole('admin'), validateUserBody(settingsSchema.setExternalIntegration), ctrl.setExternalIntegration);
// UIカスタム設定
router.put('/user/:userId/ui-custom', requireRole('admin'), validateUserBody(settingsSchema.setUICustomization), ctrl.setUICustomization);
// 自動バックアップ設定
router.put('/user/:userId/auto-backup', requireRole('admin'), validateUserBody(settingsSchema.setAutoBackup), ctrl.setAutoBackup);
// コメント最大文字数設定
router.put('/user/:userId/comment-max-length', requireRole('admin'), validateUserBody(settingsSchema.setCommentMaxLength), ctrl.setCommentMaxLength);
// コメント自動翻訳設定
router.put('/user/:userId/auto-translation', requireRole('admin'), validateUserBody(settingsSchema.setAutoTranslation), ctrl.setAutoTranslation);
// コメントピン固定数設定
router.put('/user/:userId/pin-limit', requireRole('admin'), validateUserBody(settingsSchema.setPinLimit), ctrl.setPinLimit);
// コメント自動削除時間設定
router.put('/user/:userId/auto-delete-time', requireRole('admin'), validateUserBody(settingsSchema.setAutoDeleteTime), ctrl.setAutoDeleteTime);
// NGワード自動追加設定
router.put('/user/:userId/auto-ng-word', requireRole('admin'), validateUserBody(settingsSchema.setAutoNGWordAddition), ctrl.setAutoNGWordAddition);
// AI閾値個別設定
router.put('/user/:userId/individual-ai-threshold', requireRole('admin'), validateUserBody(settingsSchema.setIndividualAIThreshold), ctrl.setIndividualAIThreshold);
// ユーザーごとのテーマ設定
router.put('/user/:userId/user-theme', requireRole('admin'), validateUserBody(settingsSchema.setUserTheme), ctrl.setUserTheme);
// ユーザーごとのBAN理由記録
router.put('/user/:userId/ban-reason', requireRole('admin'), validateUserBody(settingsSchema.setBanReason), ctrl.setBanReason);
// ユーザーごとのミュート期間設定
router.put('/user/:userId/user-mute-duration', requireRole('admin'), validateUserBody(settingsSchema.setUserMuteDuration), ctrl.setUserMuteDuration);
// ユーザーごとのコメント色設定
router.put('/user/:userId/user-comment-color', requireRole('admin'), validateUserBody(settingsSchema.setUserCommentColor), ctrl.setUserCommentColor);
// コメントごとのリアクション設定
router.put('/user/:userId/comment-reaction', requireRole('admin'), validateUserBody(settingsSchema.setCommentReaction), ctrl.setCommentReaction);
// コメントごとのタグ付与
router.put('/user/:userId/comment-tag', requireRole('admin'), validateUserBody(settingsSchema.setCommentTag), ctrl.setCommentTag);

// AI判定ログ取得
router.get('/ai-moderation-logs/:commentId', requireRole('admin'), validateCommentQuery(settingsSchema.getAIModerationLogs), ctrl.getAIModerationLogs);
// コメント編集履歴取得
router.get('/comment-edit-history/:commentId', requireRole('admin'), validateCommentQuery(settingsSchema.getCommentEditHistory), ctrl.getCommentEditHistory);

// 設定ごとの自動復元
router.put('/user/:userId/auto-restore', requireRole('admin'), validateUserBody(settingsSchema.setAutoRestore), ctrl.setAutoRestore);
// 設定ごとのアクセス権限設定
router.put('/user/:userId/access-permissions', requireRole('admin'), validateUserBody(settingsSchema.setAccessPermissions), ctrl.setAccessPermissions);
// 設定ごとの通知設定
router.put('/user/:userId/notification-settings', requireRole('admin'), validateUserBody(settingsSchema.setNotificationSettings), ctrl.setNotificationSettings);
// 設定ごとのUIテーマ設定
router.put('/user/:userId/ui-theme-settings', requireRole('admin'), validateUserBody(settingsSchema.setUIThemeSettings), ctrl.setUIThemeSettings);
// 設定ごとの自動適用
router.put('/user/:userId/auto-apply', requireRole('admin'), validateUserBody(settingsSchema.setAutoApply), ctrl.setAutoApply);
// 設定ごとの有効期限設定
router.put('/user/:userId/expiration-settings', requireRole('admin'), validateUserBody(settingsSchema.setExpirationSettings), ctrl.setExpirationSettings);
// 設定の自動復元実行
router.post('/user/:userId/execute-restore', requireRole('admin'), validateUserBody(settingsSchema.executeAutoRestore), ctrl.executeAutoRestore);
// アクセス権限チェック
router.post('/user/:userId/check-permission', requireRole('admin'), validateUserBody(settingsSchema.checkAccessPermission), ctrl.checkAccessPermission);
// スローモード設定
router.get('/user/:userId/slow-mode', requireRole('admin'), requireUserParam, ctrl.getSlowModeSettings);
router.put('/user/:userId/slow-mode', requireRole('admin'), requireUserParam, ctrl.updateSlowModeSettings);

module.exports = router;
