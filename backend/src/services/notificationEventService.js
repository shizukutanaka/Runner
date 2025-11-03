const db = require('../db');
const logger = require('../logger');

/**
 * 通知イベントサービス
 * Event-Driven Architectureによる通知システム
 */
class NotificationEventService {
  /**
   * 通知イベントを作成
   */
  static async createEvent(eventType, eventData, options = {}) {
    const {
      priority = 5,
      userId,
      targetUsers,
      scheduledAt,
      deliveryChannels = ['websocket']
    } = options;

    const sql = `
      INSERT INTO notification_events (event_type, event_data, priority, user_id, target_users, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;

    const params = [
      eventType,
      JSON.stringify(eventData),
      priority,
      userId || null,
      targetUsers ? JSON.stringify(targetUsers) : null,
      scheduledAt || null
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('[NotificationEvent] Create event error', { error: err.message, eventType });
          return reject(err);
        }

        const eventId = this.lastID;

        // 配信チャネル情報を更新
        if (deliveryChannels.length > 0) {
          const updateSql = `
            UPDATE notification_events
            SET event_data = json_insert(event_data, '$.deliveryChannels', json(?))
            WHERE id = ?
          `;
          db.run(updateSql, [JSON.stringify(deliveryChannels), eventId]);
        }

        logger.info('[NotificationEvent] Event created', { eventId, eventType, priority });
        resolve({ eventId, eventType, priority });
      });
    });
  }

  /**
   * 保留中のイベントを取得（優先度順）
   */
  static async getPendingEvents(limit = 10) {
    const sql = `
      SELECT * FROM notification_events
      WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [limit], (err, rows) => {
        if (err) {
          logger.error('[NotificationEvent] Get pending events error', { error: err.message });
          return reject(err);
        }

        const events = rows.map(row => ({
          ...row,
          eventData: JSON.parse(row.event_data),
          targetUsers: row.target_users ? JSON.parse(row.target_users) : null
        }));

        resolve(events);
      });
    });
  }

  /**
   * イベントを処理済みに更新
   */
  static async markEventProcessed(eventId, status = 'completed') {
    const sql = `
      UPDATE notification_events
      SET status = ?, processed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [status, eventId], function(err) {
        if (err) {
          logger.error('[NotificationEvent] Mark processed error', { error: err.message, eventId });
          return reject(err);
        }

        resolve({ eventId, status, changes: this.changes });
      });
    });
  }

  /**
   * 通知配信ログを作成
   */
  static async logDelivery(notificationId, eventId, channelId, userId, options = {}) {
    const {
      deliveryStatus = 'pending',
      deliveryMethod,
      providerResponse,
      errorMessage
    } = options;

    const sql = `
      INSERT INTO notification_deliveries
      (notification_id, event_id, channel_id, user_id, delivery_status, delivery_method, provider_response, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      notificationId,
      eventId,
      channelId,
      userId,
      deliveryStatus,
      deliveryMethod,
      providerResponse,
      errorMessage
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('[NotificationEvent] Log delivery error', { error: err.message, notificationId });
          return reject(err);
        }

        resolve({ deliveryId: this.lastID });
      });
    });
  }

  /**
   * 配信ログを更新
   */
  static async updateDeliveryLog(deliveryId, updates) {
    const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const params = Object.values(updates);
    params.push(deliveryId);

    const sql = `
      UPDATE notification_deliveries
      SET ${updateFields}, updated_at = datetime('now')
      WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('[NotificationEvent] Update delivery log error', { error: err.message, deliveryId });
          return reject(err);
        }

        resolve({ deliveryId, changes: this.changes });
      });
    });
  }

  /**
   * 通知グループを作成または更新
   */
  static async createOrUpdateGroup(groupKey, title, message, type, level, userId, notificationId) {
    const sql = `
      INSERT OR REPLACE INTO notification_groups
      (group_key, title, message, type, level, user_id, notification_ids, count, last_notification_at, expires_at)
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        COALESCE((SELECT notification_ids FROM notification_groups WHERE group_key = ?), '') || ? || ',',
        COALESCE((SELECT count FROM notification_groups WHERE group_key = ?), 0) + 1,
        datetime('now'),
        datetime('now', '+1 hour')
      )
    `;

    const params = [groupKey, title, message, type, level, userId, groupKey, notificationId, groupKey];

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('[NotificationEvent] Create/update group error', { error: err.message, groupKey });
          return reject(err);
        }

        resolve({ groupId: this.lastID, groupKey });
      });
    });
  }

  /**
   * チャネル別のレート制限をチェック
   */
  static async checkRateLimit(channelId, userId) {
    // 1分間の制限をチェック
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const sql = `
      SELECT COUNT(*) as count FROM notification_deliveries
      WHERE channel_id = ? AND user_id = ? AND created_at > ?
    `;

    return new Promise((resolve, reject) => {
      db.get(sql, [channelId, userId, oneMinuteAgo], (err, row) => {
        if (err) {
          logger.error('[NotificationEvent] Rate limit check error', { error: err.message });
          return reject(err);
        }

        // チャネルの制限を取得
        const channelSql = 'SELECT rate_limit_per_minute FROM notification_channels WHERE id = ?';
        db.get(channelSql, [channelId], (err, channelRow) => {
          if (err) {
            return reject(err);
          }

          const limit = channelRow ? channelRow.rate_limit_per_minute : 60;
          resolve(row.count < limit);
        });
      });
    });
  }
}

module.exports = NotificationEventService;
