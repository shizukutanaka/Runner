const db = require('../db');
const logger = require('../logger');

/**
 * 通知チャネルサービス
 * 複数の通知チャネル（Email, SMS, Slack, Pushなど）の管理
 */
class NotificationChannelService {
  constructor() {
    this.channels = new Map();
    this.initializeChannels();
  }

  /**
   * チャネルを初期化
   */
  async initializeChannels() {
    const sql = 'SELECT * FROM notification_channels WHERE enabled = 1';

    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) {
          logger.error('[NotificationChannel] Initialize error', { error: err.message });
          return reject(err);
        }

        rows.forEach(row => {
          this.channels.set(row.id, {
            ...row,
            config: row.config ? JSON.parse(row.config) : {}
          });
        });

        logger.info('[NotificationChannel] Channels initialized', { count: this.channels.size });
        resolve();
      });
    });
  }

  /**
   * チャネル情報を取得
   */
  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  /**
   * 利用可能なチャネルを取得
   */
  getAvailableChannels() {
    return Array.from(this.channels.values());
  }

  /**
   * WebSocketチャネル経由で通知を送信
   */
  async sendWebSocket(io, userId, notification) {
    return new Promise((resolve) => {
      const userSockets = Array.from(io.sockets.sockets.values())
        .filter(socket => socket.userId === userId);

      if (userSockets.length === 0) {
        resolve({ success: false, reason: 'No active sockets' });
        return;
      }

      const message = {
        id: notification.id,
        type: notification.type,
        level: notification.level,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
        read: false
      };

      userSockets.forEach(socket => {
        socket.emit('notification', message);
      });

      resolve({ success: true, deliveredTo: userSockets.length });
    });
  }

  /**
   * Emailチャネル経由で通知を送信
   */
  async sendEmail(userEmail, notification, config) {
    // 実際のEmail送信実装（nodemailerなどを使用）
    logger.info('[NotificationChannel] Email notification', {
      to: userEmail,
      title: notification.title,
      config: config
    });

    // ここに実際のEmail送信ロジックを実装
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransporter(config);

    return new Promise((resolve) => {
      // シミュレーション
      setTimeout(() => {
        resolve({
          success: true,
          messageId: 'simulated-' + Date.now(),
          provider: 'simulated'
        });
      }, 100);
    });
  }

  /**
   * SMSチャネル経由で通知を送信
   */
  async sendSMS(phoneNumber, notification, config) {
    logger.info('[NotificationChannel] SMS notification', {
      to: phoneNumber,
      message: notification.message,
      config: config
    });

    return new Promise((resolve) => {
      // シミュレーション
      setTimeout(() => {
        resolve({
          success: true,
          messageId: 'simulated-sms-' + Date.now(),
          provider: 'simulated'
        });
      }, 100);
    });
  }

  /**
   * Slackチャネル経由で通知を送信
   */
  async sendSlack(notification, config) {
    logger.info('[NotificationChannel] Slack notification', {
      message: notification.message,
      config: config
    });

    return new Promise((resolve) => {
      // シミュレーション
      setTimeout(() => {
        resolve({
          success: true,
          messageId: 'simulated-slack-' + Date.now(),
          provider: 'simulated'
        });
      }, 100);
    });
  }

  /**
   * Push通知を送信
   */
  async sendPush(userId, notification, config) {
    logger.info('[NotificationChannel] Push notification', {
      userId: userId,
      title: notification.title,
      config: config
    });

    return new Promise((resolve) => {
      // シミュレーション
      setTimeout(() => {
        resolve({
          success: true,
          messageId: 'simulated-push-' + Date.now(),
          provider: 'simulated'
        });
      }, 100);
    });
  }

  /**
   * 指定されたチャネル経由で通知を配信
   */
  async deliverNotification(channelId, userId, notification, io) {
    const channel = this.getChannel(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found or disabled`);
    }

    // レート制限をチェック
    const rateLimitOk = await this.constructor.checkRateLimit(channelId, userId);
    if (!rateLimitOk) {
      throw new Error(`Rate limit exceeded for channel ${channel.name}`);
    }

    let result;

    try {
      switch (channel.type) {
        case 'websocket':
          result = await this.sendWebSocket(io, userId, notification);
          break;
        case 'email':
          // ユーザーのEmailアドレスを取得
          const userSql = 'SELECT email FROM users WHERE id = ?';
          const user = await new Promise((resolve, reject) => {
            db.get(userSql, [userId], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          if (!user || !user.email) {
            throw new Error('User email not found');
          }

          result = await this.sendEmail(user.email, notification, channel.config);
          break;
        case 'sms':
          // ユーザーの電話番号を取得
          const phoneSql = 'SELECT phone FROM users WHERE id = ?';
          const phoneUser = await new Promise((resolve, reject) => {
            db.get(phoneSql, [userId], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          if (!phoneUser || !phoneUser.phone) {
            throw new Error('User phone not found');
          }

          result = await this.sendSMS(phoneUser.phone, notification, channel.config);
          break;
        case 'slack':
          result = await this.sendSlack(notification, channel.config);
          break;
        case 'push':
          result = await this.sendPush(userId, notification, channel.config);
          break;
        default:
          throw new Error(`Unsupported channel type: ${channel.type}`);
      }

      return {
        channelId,
        channelType: channel.type,
        success: true,
        ...result
      };

    } catch (error) {
      logger.error('[NotificationChannel] Delivery failed', {
        channelId,
        userId,
        error: error.message
      });

      return {
        channelId,
        channelType: channel.type,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 複数のチャネル経由で通知を配信
   */
  async deliverMultiChannel(channels, userId, notification, io) {
    const results = [];

    for (const channelId of channels) {
      try {
        const result = await this.deliverNotification(channelId, userId, notification, io);
        results.push(result);

        // 成功した場合、少し待機（レート制限対策）
        if (result.success) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        results.push({
          channelId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * チャネル別のレート制限をチェック（静的メソッド）
   */
  static async checkRateLimit(channelId, userId) {
    // 実際の実装ではDBからレート制限を取得
    const sql = `
      SELECT COUNT(*) as count FROM notification_deliveries
      WHERE channel_id = ? AND user_id = ? AND created_at > datetime('now', '-1 minute')
    `;

    return new Promise((resolve, reject) => {
      db.get(sql, [channelId, userId], (err, row) => {
        if (err) {
          logger.error('[NotificationChannel] Rate limit check error', { error: err.message });
          return reject(err);
        }

        // デフォルト制限：1分間に10件
        resolve(row.count < 10);
      });
    });
  }
}

module.exports = NotificationChannelService;
