const db = require('../db');
const logger = require('../logger');
const NotificationEventService = require('./notificationEventService');
const NotificationChannelService = require('./notificationChannelService');

/**
 * 通知イベントプロセッサ
 * 通知イベントを処理し、適切なチャネル経由で配信
 */
class NotificationEventProcessor {
  constructor(io) {
    this.io = io;
    this.channelService = new NotificationChannelService();
    this.isProcessing = false;
    this.processInterval = 1000; // 1秒ごとにチェック
  }

  /**
   * プロセッサを開始
   */
  start() {
    if (this.isProcessing) {
      logger.warn('[NotificationProcessor] Already processing');
      return;
    }

    this.isProcessing = true;
    logger.info('[NotificationProcessor] Started');

    this.processLoop();
  }

  /**
   * プロセッサを停止
   */
  stop() {
    this.isProcessing = false;
    logger.info('[NotificationProcessor] Stopped');
  }

  /**
   * 処理ループ
   */
  async processLoop() {
    while (this.isProcessing) {
      try {
        await this.processPendingEvents();
        await new Promise(resolve => setTimeout(resolve, this.processInterval));
      } catch (error) {
        logger.error('[NotificationProcessor] Process loop error', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000)); // エラー時は5秒待機
      }
    }
  }

  /**
   * 保留中のイベントを処理
   */
  async processPendingEvents() {
    const events = await NotificationEventService.getPendingEvents(5);

    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        logger.error('[NotificationProcessor] Event processing error', {
          eventId: event.id,
          error: error.message
        });
      }
    }
  }

  /**
   * 単一のイベントを処理
   */
  async processEvent(event) {
    // イベントを処理中に更新
    await NotificationEventService.markEventProcessed(event.id, 'processing');

    logger.info('[NotificationProcessor] Processing event', {
      eventId: event.id,
      eventType: event.event_type,
      priority: event.priority
    });

    try {
      // 通知を作成
      const notificationId = await this.createNotificationFromEvent(event);

      // 各チャネル経由で配信
      const deliveryChannels = event.eventData.deliveryChannels || ['websocket'];
      const targetUsers = this.getTargetUsers(event);

      for (const userId of targetUsers) {
        try {
          const results = await this.channelService.deliverMultiChannel(
            deliveryChannels,
            userId,
            { id: notificationId, ...event.eventData },
            this.io
          );

          // 配信ログを記録
          for (const result of results) {
            await NotificationEventService.logDelivery(
              notificationId,
              event.id,
              result.channelId,
              userId,
              {
                deliveryStatus: result.success ? 'sent' : 'failed',
                deliveryMethod: result.channelType,
                providerResponse: result.provider || null,
                errorMessage: result.error || null
              }
            );
          }
        } catch (error) {
          logger.error('[NotificationProcessor] Delivery error', {
            eventId: event.id,
            userId,
            error: error.message
          });
        }
      }

      // イベントを完了に更新
      await NotificationEventService.markEventProcessed(event.id, 'completed');

      logger.info('[NotificationProcessor] Event completed', {
        eventId: event.id,
        notificationId
      });

    } catch (error) {
      logger.error('[NotificationProcessor] Event failed', {
        eventId: event.id,
        error: error.message
      });

      await NotificationEventService.markEventProcessed(event.id, 'failed');
    }
  }

  /**
   * イベントから通知を作成
   */
  async createNotificationFromEvent(event) {
    const sql = `
      INSERT INTO notifications
      (user_id, type, level, title, message, metadata, event_id, delivery_channels, grouped)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      event.user_id,
      event.event_type,
      this.getLevelFromPriority(event.priority),
      event.eventData.title || event.eventData.message,
      event.eventData.message || event.eventData.title,
      JSON.stringify(event.eventData.metadata || {}),
      event.id,
      JSON.stringify(event.eventData.deliveryChannels || ['websocket']),
      0
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('[NotificationProcessor] Create notification error', { error: err.message });
          return reject(err);
        }

        resolve(this.lastID);
      });
    });
  }

  /**
   * 優先度からレベルを決定
   */
  getLevelFromPriority(priority) {
    if (priority >= 8) return 'urgent';
    if (priority >= 6) return 'high';
    if (priority >= 4) return 'normal';
    if (priority >= 2) return 'low';
    return 'normal';
  }

  /**
   * ターゲットユーザーを取得
   */
  getTargetUsers(event) {
    if (event.user_id) {
      return [event.user_id];
    }

    if (event.targetUsers) {
      return event.targetUsers;
    }

    // デフォルトはイベント作成者
    return [event.user_id];
  }

  /**
   * イベントを作成（外部API用）
   */
  static async createEvent(eventType, eventData, options = {}) {
    return await NotificationEventService.createEvent(eventType, eventData, options);
  }

  /**
   * 即時通知を作成（従来のAPIとの互換性のため）
   */
  static async createImmediateNotification(userId, type, level, title, message, metadata = {}) {
    return await this.createEvent(type, {
      title,
      message,
      metadata,
      deliveryChannels: ['websocket']
    }, {
      userId,
      level,
      priority: this.getPriorityFromLevel(level)
    });
  }

  /**
   * レベルから優先度を取得
   */
  static getPriorityFromLevel(level) {
    switch (level) {
      case 'urgent': return 10;
      case 'high': return 8;
      case 'normal': return 5;
      case 'low': return 3;
      default: return 5;
    }
  }
}

module.exports = NotificationEventProcessor;
