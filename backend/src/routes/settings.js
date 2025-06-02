const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validation');
const settingsSchema = require('../validation/settings');

router.get('/', ctrl.getSettings);
router.put('/', auth('admin'), ctrl.updateSettings);

// テーマ色設定
router.put('/theme', auth('admin'), validate(settingsSchema.setTheme), ctrl.setTheme);
// レイアウト設定
router.put('/layout', auth('admin'), validate(settingsSchema.setLayout), ctrl.setLayout);
// 通知ON/OFF
router.put('/notifications', auth('admin'), validate(settingsSchema.setNotifications), ctrl.setNotifications);
// デフォルト言語設定
router.put('/default-language', auth('admin'), validate(settingsSchema.setDefaultLanguage), ctrl.setDefaultLanguage);
// タイムゾーン設定
router.put('/timezone', auth('admin'), validate(settingsSchema.setTimezone), ctrl.setTimezone);
// 管理者メール設定
router.put('/admin-email', auth('admin'), validate(settingsSchema.setAdminEmail), ctrl.setAdminEmail);
// APIキー管理
router.put('/api-keys', auth('admin'), validate(settingsSchema.manageApiKeys), ctrl.manageApiKeys);
// 外部連携設定
router.put('/external-integration', auth('admin'), validate(settingsSchema.setExternalIntegration), ctrl.setExternalIntegration);
// UIカスタム設定
router.put('/ui-custom', auth('admin'), validate(settingsSchema.setUICustomization), ctrl.setUICustomization);
// 自動バックアップ設定
router.put('/auto-backup', auth('admin'), validate(settingsSchema.setAutoBackup), ctrl.setAutoBackup);
// 設定エクスポート
router.get('/export', auth('admin'), validate(settingsSchema.exportSettings), ctrl.exportSettings);
// 設定インポート
router.post('/import', auth('admin'), validate(settingsSchema.importSettings), ctrl.importSettings);
// バージョン取得
router.get('/version', ctrl.getVersion);
// 利用規約取得
router.get('/terms', ctrl.getTerms);
// ヘルプ取得
router.get('/help', ctrl.getHelp);

module.exports = router;
