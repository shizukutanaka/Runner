const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

// 基本的な通知機能
// 注意: リテラルパス（/read-all, /settings, /test, /read）は
// パラメータ化されたパス（/:id, /:id/read）より前に登録すること
router.get('/', requireRole('user'), ctrl.getNotifications);
router.post('/', requireRole('moderator'), ctrl.createNotification);
router.put('/read-all', requireRole('user'), ctrl.markAllAsRead);
router.delete('/read', requireRole('user'), ctrl.clearRead);
router.get('/settings', requireRole('user'), ctrl.getNotificationSettings);
router.put('/settings', requireRole('user'), ctrl.updateNotificationSettings);
router.post('/test', requireRole('user'), ctrl.sendTestNotification);
router.delete('/', requireRole('user'), ctrl.clearAllNotifications);
router.put('/:id/read', requireRole('user'), ctrl.markAsRead);
router.delete('/:id', requireRole('user'), ctrl.deleteNotification);

// Event-Driven通知機能
router.post('/events', requireRole('moderator'), ctrl.createNotificationEvent);
router.get('/events/status', requireRole('moderator'), ctrl.getEventStatus);

// ユーザーごとの通知設定機能
router.get('/users/:id/settings', requireRole('user'), ctrl.getUserNotificationSettings);
router.put('/users/:id/settings', requireRole('user'), ctrl.updateUserNotificationSettings);
router.get('/users/:id/history', requireRole('user'), ctrl.getUserNotificationHistory);
router.delete('/users/:id/history', requireRole('user'), ctrl.clearUserNotificationHistory);

// 通知テンプレート機能
router.get('/templates', requireRole('moderator'), ctrl.getNotificationTemplates);
router.put('/templates/:id', requireRole('moderator'), ctrl.updateNotificationTemplate);
router.post('/template', requireRole('moderator'), ctrl.createTemplateNotification);

// 通知チャネル管理
router.get('/channels', requireRole('admin'), ctrl.getNotificationChannels);
router.put('/channels/:id', requireRole('admin'), ctrl.updateNotificationChannel);

module.exports = router;
