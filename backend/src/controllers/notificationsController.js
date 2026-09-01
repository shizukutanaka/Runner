// ---------------------------------------------------------------------------
// 削除記録（2026-09-01・E-29）
// ---------------------------------------------------------------------------
// ここには通知テンプレート／チャネル管理／イベント配信／ユーザー別履歴の
// 9ハンドラ（386行）があり、routes にも mount されていた。
// しかし参照するテーブル8種（notification_templates / notification_channels /
// notification_events / notification_history / notification_deliveries /
// notification_groups / notification_variable_schemas /
// notification_conditions）が**スキーマに1つも無く、呼べば必ず500**だった。
//
// テーブルを足す選択肢もあったが、要件から疑い直した:
// 本製品は個人〜小規模の配信者が自分のチャットを見るためのもので、
// 「テンプレート変数のスキーマ管理」「配信チャネルのルーティング」は
// 課金・マルチテナントと同じ、**存在しない規模のための足場**である。
// 実際に必要な通知（一覧・既読・設定・テスト送信）は notifications テーブルで
// 動いており、そちらは残してある。
//
// 全文は git log に残っている。
// ---------------------------------------------------------------------------

const db = require('../db');
const logger = require('../logger');

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

        res.status(201).json({
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

  const sql = 'UPDATE notifications SET read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND read = 0';

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