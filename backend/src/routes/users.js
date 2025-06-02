const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const validate = require('../middleware/validation');
const userSchema = require('../validation/user');

router.get('/:id', usersController.getUser);
router.put('/:id', validate(userSchema.update), usersController.updateUser);
router.get('/:id/history', usersController.getUserHistory);

// ユーザーごとの通知頻度設定
router.put('/:id/notification-frequency', usersController.setNotificationFrequency);
// ユーザーごとの外部連携ON/OFF
router.put('/:id/external-integration', usersController.setExternalIntegration);
// ユーザーごとのプロフィール画像設定
router.put('/:id/profile-image', usersController.setProfileImage);
// ユーザーごとの自己紹介文設定
router.put('/:id/bio', usersController.setBio);
// ユーザーごとの言語設定
router.put('/:id/language', usersController.setLanguage);
// ユーザーごとのタイムゾーン設定
router.put('/:id/timezone', usersController.setTimezone);
// ユーザーごとのサブスク状態管理
router.put('/:id/subscription', usersController.setSubscription);
// ユーザーごとの認証履歴取得
router.get('/:id/auth-history', usersController.getAuthHistory);
// ユーザーごとのセキュリティ設定
router.put('/:id/security', usersController.setSecurity);

module.exports = router;
