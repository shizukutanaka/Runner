const db = require('../db');
const logger = require('../logger');
const NotificationEventProcessor = require('../services/notificationEventProcessor');
const NotificationChannelService = require('../services/notificationChannelService');
const NotificationTemplateEngine = require('../services/notificationTemplateEngine');

const serializeNotification = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  type: row.type,
  level: row.level,
  read: Boolean(row.read),
  metadata: row.metadata ? JSON.parse(row.metadata) : null,
  createdAt: row.created_at,
  readAt: row.read_at,
  expiresAt: row.expires_at
});

// ユーザーごとの通知設定更新
exports.updateUserNotificationSettings = (req, res, next) => {
  const { id } = req.params;
  const {
    soundEnabled,
    desktopEnabled,
    emailEnabled,
    frequency,
    soundVolume,
    keywords,
    filters
  } = req.body;

  // バリデーション
  const Joi = require('joi');
  const settingsSchema = Joi.object({
    soundEnabled: Joi.boolean().optional(),
    desktopEnabled: Joi.boolean().optional(),
    emailEnabled: Joi.boolean().optional(),
    frequency: Joi.string().valid('immediate', 'hourly', 'daily', 'weekly', 'disabled').optional(),
    soundVolume: Joi.number().integer().min(0).max(100).optional(),
    keywords: Joi.array().items(Joi.string()).optional(),
    filters: Joi.object().optional()
  });

  const { error, value } = settingsSchema.validate({
    soundEnabled,
    desktopEnabled,
    emailEnabled,
    frequency,
    soundVolume,
    keywords,
    filters
  });

  if (error) {
    return next({ status: 400, message: 'Invalid notification settings', details: error.details });
  }

  // 更新するフィールドを動的に構築
  const updateFields = [];
  const params = [];

  if (value.soundEnabled !== undefined) {
    updateFields.push('notification_sound_enabled = ?');
    params.push(value.soundEnabled ? 1 : 0);
  }

  if (value.desktopEnabled !== undefined) {
    updateFields.push('notification_desktop_enabled = ?');
    params.push(value.desktopEnabled ? 1 : 0);
  }

  if (value.emailEnabled !== undefined) {
    updateFields.push('notification_email_enabled = ?');
    params.push(value.emailEnabled ? 1 : 0);
  }

  if (value.frequency !== undefined) {
    updateFields.push('notification_frequency = ?');
    params.push(value.frequency);
  }

  if (value.soundVolume !== undefined) {
    updateFields.push('notification_sound_volume = ?');
    params.push(value.soundVolume);
  }

  if (value.keywords !== undefined) {
    updateFields.push('notification_keywords = ?');
    params.push(JSON.stringify(value.keywords));
  }

  if (value.filters !== undefined) {
    updateFields.push('notification_filters = ?');
    params.push(JSON.stringify(value.filters));
  }

  if (updateFields.length === 0) {
    return next({ status: 400, message: 'No settings to update' });
  }

  const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  params.push(id);

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Settings update error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to update notification settings', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'User not found' });
    }

    res.json({
      status: 200,
      data: null,
      message: 'Notification settings updated'
    });
  });
};

// ユーザーごとの通知履歴取得
exports.getUserNotificationHistory = (req, res, next) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, type } = req.query;

  let sql = 'SELECT * FROM notification_history WHERE user_id = ?';
  const params = [id];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] History fetch error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to fetch notification history', details: err });
    }

    const history = rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : null,
      read: Boolean(row.read_at),
      createdAt: row.created_at,
      readAt: row.read_at
    }));

    res.json({
      status: 200,
      data: {
        history,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: history.length
        }
      },
      message: 'Notification history fetched'
    });
  });
};

// ユーザーごとの通知履歴削除
exports.clearUserNotificationHistory = (req, res, next) => {
  const { id } = req.params;
  const { before, type } = req.query;

  let sql = 'DELETE FROM notification_history WHERE user_id = ?';
  const params = [id];

  if (before) {
    sql += ' AND created_at < ?';
    params.push(before);
  }

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] History clear error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to clear notification history', details: err });
    }

    res.json({
      status: 200,
      data: { deleted: this.changes },
      message: 'Notification history cleared'
    });
  });
};

// ユーザーごとの通知設定取得
exports.getUserNotificationSettings = (req, res, next) => {
  const { id } = req.params;

  const sql = `
    SELECT
      notification_sound_enabled,
      notification_desktop_enabled,
      notification_email_enabled,
      notification_frequency,
      notification_sound_volume,
      notification_keywords,
      notification_filters
    FROM users WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      logger.error('[Notifications] Settings fetch error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to fetch notification settings', details: err });
    }

    if (!row) {
      return next({ status: 404, message: 'User not found' });
    }

    const settings = {
      soundEnabled: Boolean(row.notification_sound_enabled),
      desktopEnabled: Boolean(row.notification_desktop_enabled),
      emailEnabled: Boolean(row.notification_email_enabled),
      frequency: row.notification_frequency || 'immediate',
      soundVolume: row.notification_sound_volume || 50,
      keywords: row.notification_keywords ? JSON.parse(row.notification_keywords) : [],
      filters: row.notification_filters ? JSON.parse(row.notification_filters) : {}
    };

    res.json({
      status: 200,
      data: settings,
      message: 'Notification settings fetched'
    });
  });
};

// 通知テンプレート取得
exports.getNotificationTemplates = (req, res, next) => {
  const sql = 'SELECT * FROM notification_templates ORDER BY type, id';

  db.all(sql, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Templates fetch error', { error: err.message });
      return next({ status: 500, message: 'Failed to fetch notification templates', details: err });
    }

    const templates = rows.map(row => ({
      id: row.id,
      type: row.type,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      variables: row.variables ? JSON.parse(row.variables) : [],
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      status: 200,
      data: templates,
      message: 'Notification templates fetched'
    });
  });
};

// 通知テンプレート更新
exports.updateNotificationTemplate = (req, res, next) => {
  const { id } = req.params;
  const {
    titleTemplate,
    messageTemplate,
    variables,
    enabled
  } = req.body;

  // バリデーション
  const Joi = require('joi');
  const templateSchema = Joi.object({
    titleTemplate: Joi.string().required(),
    messageTemplate: Joi.string().required(),
    variables: Joi.array().items(Joi.string()).optional(),
    enabled: Joi.boolean().optional()
  });

  const { error, value } = templateSchema.validate({
    titleTemplate,
    messageTemplate,
    variables,
    enabled
  });

  if (error) {
    return next({ status: 400, message: 'Invalid template data', details: error.details });
  }

  const updateFields = [];
  const params = [];

  updateFields.push('title_template = ?');
  params.push(value.titleTemplate);

  updateFields.push('message_template = ?');
  params.push(value.messageTemplate);

  updateFields.push('updated_at = CURRENT_TIMESTAMP');

  if (value.variables !== undefined) {
    updateFields.push('variables = ?');
    params.push(JSON.stringify(value.variables));
  }

  if (value.enabled !== undefined) {
    updateFields.push('enabled = ?');
    params.push(value.enabled ? 1 : 0);
  }

  params.push(id);

  const sql = `UPDATE notification_templates SET ${updateFields.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Template update error', { error: err.message, templateId: id });
      return next({ status: 500, message: 'Failed to update notification template', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification template not found' });
    }

  });
};

// 通知一覧取得
exports.getNotifications = (req, res, next) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, type, level, read, unreadOnly = false } = req.query;

  let sql = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }

  if (read === 'true') {
    sql += ' AND read = 1';
  } else if (read === 'false' || unreadOnly === 'true') {
    sql += ' AND read = 0';
  }

  // 期限切れの通知は除外
  sql += ' AND (expires_at IS NULL OR expires_at > datetime("now"))';

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Get notifications error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to fetch notifications', details: err });
    }

    const notifications = rows.map(serializeNotification);

    // 未読数を計算
    const unreadSql = 'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND read = 0 AND (expires_at IS NULL OR expires_at > datetime("now"))';
    db.get(unreadSql, [userId], (err, row) => {
      if (err) {
        logger.error('[Notifications] Get unread count error', { error: err.message, userId });
        // エラーがあっても通知一覧は返す
        return res.json({
          notifications,
          total: notifications.length,
          unread: 0,
          limit: Number(limit),
          offset: Number(offset)
        });
      }

      res.json({
        notifications,
        total: notifications.length,
        unread: row ? row.unread : 0,
        limit: Number(limit),
        offset: Number(offset)
      });
    });
  });
};

// 通知作成
exports.createNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  if (typeof title !== 'string' || !title.trim() || typeof message !== 'string' || !message.trim()) {
    return next({ status: 400, message: 'title and message are required strings' });
  }

  try {
    const sql = `
      INSERT INTO notifications (user_id, title, message, type, level, read, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now'))
    `;
    const params = [
      userId,
      title,
      message,
      type,
      level,
      metadata !== undefined ? JSON.stringify(metadata) : null
    ];

    db.run(sql, params, function(err) {
      if (err) {
        logger.error('[Notifications] Create notification error', { error: err.message, userId });
        return next({ status: 500, message: 'Failed to create notification', details: err.message });
      }

      db.get('SELECT * FROM notifications WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) {
          logger.error('[Notifications] Fetch created notification error', { error: getErr.message, userId });
          return next({ status: 500, message: 'Failed to fetch created notification', details: getErr.message });
        }

        res.json({
          status: 201,
          data: serializeNotification(row),
          message: 'Notification created successfully'
        });
      });
    });
  } catch (error) {
    logger.error('[Notifications] Create notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create notification',
      details: error.message
    });
  }
};

// テンプレートエンジン通知作成（Laravel風）
exports.createTemplateNotification = async (req, res, next) => {
  const { templateId, variables, userId, channels = ['websocket'] } = req.body;

  try {
    const templateEngine = new NotificationTemplateEngine();
    const result = await templateEngine.createNotification(
      templateId,
      variables,
      { userId, channels }
    );

    res.json({
      status: 201,
      data: result,
      message: 'Template notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create template notification error', { error: error.message, userId, templateId });
    return next({
      status: 500,
      message: 'Failed to create template notification',
      details: error.message
    });
  }
};

// 通知を既読にする
exports.markAsRead = (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const sql = `
    UPDATE notifications
    SET read = 1, read_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `;

  db.run(sql, [id, userId], function(err) {
    if (err) {
      logger.error('[Notifications] Mark as read error', { error: err.message, userId, notificationId: id });
      return next({ status: 500, message: 'Failed to mark notification as read', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification not found' });
    }

    db.get('SELECT * FROM notifications WHERE id = ?', [id], (getErr, row) => {
      if (getErr || !row) {
        logger.error('[Notifications] Fetch after mark-as-read error', { error: getErr?.message, userId, notificationId: id });
        return res.json({ id, read: true });
      }
      res.json(serializeNotification(row));
    });
  });
};

// 全ての通知を既読にする
exports.markAllAsRead = (req, res, next) => {
  const userId = req.user.id;

  const sql = "UPDATE notifications SET read = 1, read_at = datetime('now') WHERE user_id = ? AND read = 0";

  db.run(sql, [userId], function(err) {
    if (err) {
      logger.error('[Notifications] Mark all as read error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to mark all notifications as read', details: err });
    }

    res.json({ success: true, updated: this.changes });
  });
};

// 通知を削除
exports.deleteNotification = (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) {
      logger.error('[Notifications] Delete notification error', { error: err.message, userId, notificationId: id });
      return next({ status: 500, message: 'Failed to delete notification', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification not found' });
    }

    res.json({ success: true });
  });
};

// 全ての通知を削除
exports.clearAllNotifications = (req, res, next) => {
  const userId = req.user.id;

  db.run('DELETE FROM notifications WHERE user_id = ?', [userId], function(err) {
    if (err) {
      logger.error('[Notifications] Clear all notifications error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to clear notifications', details: err });
    }

    res.json({ success: true, deleted: this.changes });
  });
};

// 既読通知をクリア（読了済みのみ・管理系エンドポイントから利用）
exports.clearRead = (req, res, next) => {
  const userId = req.user.id;
  const { before } = req.query;

  let sql = 'DELETE FROM notifications WHERE user_id = ? AND read = 1';
  const params = [userId];

  if (before) {
    sql += ' AND read_at < ?';
    params.push(before);
  }

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Clear read notifications error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to clear read notifications', details: err });
    }

    res.json({
      status: 200,
      data: { deleted: this.changes },
      message: 'Read notifications cleared'
    });
  });
};

// 通知設定取得（ログイン中ユーザー自身のシンプルな設定）
exports.getNotificationSettings = (req, res, next) => {
  const userId = req.user.id;

  const sql = `
    SELECT notification_email_enabled, notification_push_enabled, notification_desktop_enabled, notification_types
    FROM accounts WHERE id = ?
  `;

  db.get(sql, [userId], (err, row) => {
    if (err) {
      logger.error('[Notifications] Get settings error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to fetch notification settings', details: err });
    }

    if (!row) {
      return next({ status: 404, message: 'Account not found' });
    }

    res.json({
      email: row.notification_email_enabled === null ? true : Boolean(row.notification_email_enabled),
      push: row.notification_push_enabled === null ? true : Boolean(row.notification_push_enabled),
      desktop: row.notification_desktop_enabled === null ? true : Boolean(row.notification_desktop_enabled),
      types: row.notification_types
        ? JSON.parse(row.notification_types)
        : { comment: true, moderation: true, system: true }
    });
  });
};

// 通知設定更新（ログイン中ユーザー自身のシンプルな設定）
exports.updateNotificationSettings = (req, res, next) => {
  const userId = req.user.id;
  const { email, push, desktop, types } = req.body;

  const Joi = require('joi');
  const settingsSchema = Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    desktop: Joi.boolean().optional(),
    types: Joi.object({
      comment: Joi.boolean(),
      moderation: Joi.boolean(),
      system: Joi.boolean()
    }).optional()
  });

  const { error, value } = settingsSchema.validate({ email, push, desktop, types });

  if (error) {
    return next({ status: 400, message: 'Invalid notification settings', details: error.details });
  }

  const updateFields = [];
  const params = [];

  if (value.email !== undefined) {
    updateFields.push('notification_email_enabled = ?');
    params.push(value.email ? 1 : 0);
  }
  if (value.push !== undefined) {
    updateFields.push('notification_push_enabled = ?');
    params.push(value.push ? 1 : 0);
  }
  if (value.desktop !== undefined) {
    updateFields.push('notification_desktop_enabled = ?');
    params.push(value.desktop ? 1 : 0);
  }
  if (value.types !== undefined) {
    updateFields.push('notification_types = ?');
    params.push(JSON.stringify(value.types));
  }

  if (updateFields.length === 0) {
    return next({ status: 400, message: 'No settings to update' });
  }

  params.push(userId);

  db.run(`UPDATE accounts SET ${updateFields.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) {
      logger.error('[Notifications] Update settings error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to update notification settings', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Account not found' });
    }

    res.json({
      email: value.email,
      push: value.push,
      desktop: value.desktop,
      types: value.types
    });
  });
};

// テスト通知を送信（自分宛て）
exports.sendTestNotification = async (req, res, next) => {
  const userId = req.user.id;
  const { type = 'system' } = req.body;

  const sql = `
    INSERT INTO notifications (user_id, title, message, type, level, read, created_at)
    VALUES (?, ?, ?, ?, 'info', 0, datetime('now'))
  `;

  db.run(sql, [userId, 'Test notification', `This is a test ${type} notification`, type], (err) => {
    if (err) {
      logger.error('[Notifications] Send test notification error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to send test notification', details: err });
    }

    res.json({ success: true, message: 'Test notification sent' });
  });
};

// Event-Driven API: 通知イベントを作成
exports.createNotificationEvent = async (req, res, next) => {
  const { eventType, eventData, priority = 5, userId, targetUsers, scheduledAt, deliveryChannels } = req.body;

  // バリデーション
  const Joi = require('joi');
  const eventSchema = Joi.object({
    eventType: Joi.string().required(),
    eventData: Joi.object().required(),
    priority: Joi.number().integer().min(1).max(10).optional(),
    userId: Joi.string().optional(),
    targetUsers: Joi.array().items(Joi.string()).optional(),
    scheduledAt: Joi.date().optional(),
    deliveryChannels: Joi.array().items(Joi.string()).default(['websocket'])
  });

  const { error, value } = eventSchema.validate({
    eventType,
    eventData,
    priority,
    userId,
    targetUsers,
    scheduledAt,
    deliveryChannels
  });

  if (error) {
    return next({ status: 400, message: 'Invalid event data', details: error.details });
  }

  try {
    const result = await NotificationEventProcessor.createEvent(
      value.eventType,
      value.eventData,
      {
        priority: value.priority,
        userId: value.userId,
        targetUsers: value.targetUsers,
        scheduledAt: value.scheduledAt,
        deliveryChannels: value.deliveryChannels
      }
    );

    res.json({
      status: 201,
      data: result,
      message: 'Notification event created successfully'
    });
  } catch (error) {
    logger.error('[Notifications] Create event error', { error: error.message, eventType: value.eventType });
    return next({ status: 500, message: 'Failed to create notification event', details: error.message });
  }
};

// Event-Driven API: イベントステータスを取得
exports.getEventStatus = async (req, res, next) => {
  const { limit = 20, offset = 0, status } = req.query;

  let sql = 'SELECT * FROM notification_events';
  const params = [];

  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Get event status error', { error: err.message });
      return next({ status: 500, message: 'Failed to fetch event status', details: err.message });
    }

    const events = rows.map(row => ({
      ...row,
      eventData: JSON.parse(row.event_data),
      targetUsers: row.target_users ? JSON.parse(row.target_users) : null
    }));

    res.json({
      status: 200,
      data: {
        events,
        pagination: {
          limit: Number(limit),
          offset: Number(offset)
        }
      },
      message: 'Event status fetched'
    });
  });
};

// 通知チャネルを取得
exports.getNotificationChannels = async (req, res, next) => {
  const channelService = new NotificationChannelService();
  const channels = channelService.getAvailableChannels();

  res.json({
    status: 200,
    data: channels,
    message: 'Notification channels fetched'
  });
};

// 通知チャネルを更新
exports.updateNotificationChannel = async (req, res, next) => {
  const { id } = req.params;
  const { enabled, config, rateLimitPerMinute, rateLimitPerHour } = req.body;

  // バリデーション
  const Joi = require('joi');
  const channelSchema = Joi.object({
    enabled: Joi.boolean().optional(),
    config: Joi.object().optional(),
    rateLimitPerMinute: Joi.number().integer().min(1).optional(),
    rateLimitPerHour: Joi.number().integer().min(1).optional()
  });

  const { error, value } = channelSchema.validate({
    enabled,
    config,
    rateLimitPerMinute,
    rateLimitPerHour
  });

  if (error) {
    return next({ status: 400, message: 'Invalid channel data', details: error.details });
  }

  const updateFields = [];
  const params = [];

  if (value.enabled !== undefined) {
    updateFields.push('enabled = ?');
    params.push(value.enabled ? 1 : 0);
  }

  if (value.config !== undefined) {
    updateFields.push('config = ?');
    params.push(JSON.stringify(value.config));
  }

  if (value.rateLimitPerMinute !== undefined) {
    updateFields.push('rate_limit_per_minute = ?');
    params.push(value.rateLimitPerMinute);
  }

  if (value.rateLimitPerHour !== undefined) {
    updateFields.push('rate_limit_per_hour = ?');
    params.push(value.rateLimitPerHour);
  }

  if (updateFields.length === 0) {
    return next({ status: 400, message: 'No fields to update' });
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `UPDATE notification_channels SET ${updateFields.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Channel update error', { error: err.message, channelId: id });
      return next({ status: 500, message: 'Failed to update notification channel', details: err.message });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification channel not found' });
    }

    res.json({
      status: 200,
      data: null,
      message: 'Notification channel updated'
    });
  });
};
