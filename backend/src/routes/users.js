const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const validate = require('../middleware/validation');
const userSchema = require('../validation/user');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', requireRole('moderator'), usersController.listUsers);
router.get('/:id', requireRole('moderator'), usersController.getUser);
router.put('/:id', requireRole('admin'), validate(userSchema.update), usersController.updateUser);
router.get('/:id/history', requireRole('moderator'), usersController.getUserHistory);

// ユーザーごとの通知頻度設定
router.put('/:id/notification-frequency', requireRole('admin'), usersController.setNotificationFrequency);
// ユーザーごとの外部連携ON/OFF
router.put('/:id/external-integration', requireRole('admin'), usersController.setExternalIntegration);
// ユーザーごとのプロフィール画像設定
router.put('/:id/profile-image', requireRole('admin'), usersController.setProfileImage);
// ユーザーごとの自己紹介文設定
router.put('/:id/bio', requireRole('admin'), usersController.setBio);
// ユーザーごとの言語設定
router.put('/:id/language', requireRole('admin'), usersController.setLanguage);
// ユーザーごとのタイムゾーン設定
router.put('/:id/timezone', requireRole('admin'), usersController.setTimezone);
// ユーザーごとのサブスク状態管理
router.put('/:id/subscription', requireRole('admin'), usersController.setSubscription);
// ユーザーごとの認証履歴取得
router.get('/:id/auth-history', requireRole('moderator'), usersController.getAuthHistory);
// ユーザーごとのセキュリティ設定
router.put('/:id/security', requireRole('admin'), usersController.setSecurity);

// ユーザータイムアウト関連
router.post('/:id/timeout', requireRole('moderator'), usersController.timeoutUser);
router.delete('/:id/timeout', requireRole('moderator'), usersController.removeTimeout);
router.get('/:id/timeout', requireRole('moderator'), usersController.getUserTimeout);
router.get('/:id/timeout-history', requireRole('moderator'), usersController.getUserTimeoutHistory);

// 全ユーザータイムアウト関連
router.get('/timeouts/active', requireRole('moderator'), usersController.getAllActiveTimeouts);
router.get('/timeouts/reasons', requireRole('moderator'), usersController.getTimeoutReasons);
router.post('/timeouts/cleanup', requireRole('admin'), usersController.cleanupExpiredTimeouts);

// ユーザーのチャンネルアクティビティと詳細情報取得
router.get('/:id/channel-activity', requireRole('moderator'), usersController.getUserChannelActivity);

module.exports = router;
