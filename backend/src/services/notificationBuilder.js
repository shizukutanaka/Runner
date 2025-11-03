const db = require('../db');
const logger = require('../logger');
const NotificationTemplateEngine = require('./notificationTemplateEngine');
const NotificationChannelService = require('./notificationChannelService');

/**
 * 統一されたNotificationクラス（Laravel風）
 * 複数のチャネルに対して統一されたインターフェースを提供
 */
class Notification {
  constructor(templateId, variables = {}, options = {}) {
    this.templateId = templateId;
    this.variables = variables;
    this.options = {
      channels: ['websocket'],
      priority: 5,
      userId: null,
      targetUsers: null,
      scheduledAt: null,
      ...options
    };
    this.templateEngine = new NotificationTemplateEngine();
    this.channelService = new NotificationChannelService();
  }

  /**
   * 通知を指定されたチャネル経由で送信
   */
  async send(channels = null) {
    try {
      const targetChannels = channels || this.options.channels;

      // テンプレートからメッセージを生成
      const notificationData = await this.templateEngine.createNotification(
        this.templateId,
        this.variables,
        { channels: targetChannels, ...this.options }
      );

      if (!notificationData) {
        return { success: true, skipped: true, reason: 'Conditions not met' };
      }

      // Event-Driven Architectureでイベントを作成
      const result = await this.createNotificationEvent(notificationData);

      return {
        success: true,
        eventId: result.eventId,
        channels: targetChannels,
        message: 'Notification queued successfully'
      };

    } catch (error) {
      logger.error('[Notification] Send failed', {
        templateId: this.templateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メールチャネル経由で送信
   */
  async sendViaMail(userId) {
    this.options.channels = ['email'];
    this.options.userId = userId;
    return await this.send(['email']);
  }

  /**
   * SMSチャネル経由で送信
   */
  async sendViaSms(userId) {
    this.options.channels = ['sms'];
    this.options.userId = userId;
    return await this.send(['sms']);
  }

  /**
   * Slackチャネル経由で送信
   */
  async sendViaSlack() {
    this.options.channels = ['slack'];
    return await this.send(['slack']);
  }

  /**
   * Push通知経由で送信
   */
  async sendViaPush(userId) {
    this.options.channels = ['push'];
    this.options.userId = userId;
    return await this.send(['push']);
  }

  /**
   * WebSocket経由で送信（リアルタイム）
   */
  async sendViaWebSocket(userId) {
    this.options.channels = ['websocket'];
    this.options.userId = userId;
    return await this.send(['websocket']);
  }

  /**
   * 複数のチャネル経由で送信
   */
  async sendViaMultipleChannels(channels, userId) {
    this.options.channels = channels;
    this.options.userId = userId;
    return await this.send(channels);
  }

  /**
   * 通知イベントを作成
   */
  async createNotificationEvent(notificationData) {
    const { NotificationEventProcessor } = require('./notificationEventProcessor');

    return await NotificationEventProcessor.createEvent(
      notificationData.templateId,
      notificationData,
      {
        priority: notificationData.priority,
        userId: this.options.userId,
        targetUsers: this.options.targetUsers,
        scheduledAt: this.options.scheduledAt,
        deliveryChannels: this.options.channels
      }
    );
  }

  /**
   * 通知をスケジュール
   */
  schedule(channels = null, scheduledAt) {
    this.options.scheduledAt = scheduledAt;
    this.options.channels = channels || this.options.channels;
    return this;
  }

  /**
   * 優先度を設定
   */
  setPriority(priority) {
    this.options.priority = priority;
    return this;
  }

  /**
   * ターゲットユーザーを設定
   */
  setTargetUsers(userId) {
    this.options.userId = userId;
    return this;
  }

  /**
   * 複数のターゲットユーザーを設定
   */
  setTargetUsersList(targetUsers) {
    this.options.targetUsers = targetUsers;
    return this;
  }

  /**
   * メタデータを設定
   */
  setMetadata(metadata) {
    this.options.metadata = metadata;
    return this;
  }
}

/**
 * プリセット通知クラス
 */
class WelcomeNotification extends Notification {
  constructor(username, platform) {
    super('welcome_message', { username, platform }, { priority: 2 });
  }
}

class CommentNotification extends Notification {
  constructor(content, user, platform) {
    super('new_comment_advanced', { content, user, platform }, { priority: 3 });
  }
}

class ModerationNotification extends Notification {
  constructor(action, reason, moderator) {
    super('moderation_action_advanced', { action, reason, moderator }, { priority: 7 });
  }
}

class SecurityAlertNotification extends Notification {
  constructor(activity, ip, timestamp) {
    super('security_alert', { activity, ip, timestamp }, { priority: 10 });
  }
}

class UserBannedNotification extends Notification {
  constructor(user, reason, duration) {
    super('user_banned_advanced', { user, reason, duration }, { priority: 9 });
  }
}

/**
 * 通知ビルダー（Fluent Interface）
 */
class NotificationBuilder {
  constructor(templateId) {
    this.templateId = templateId;
    this.variables = {};
    this.options = {
      channels: ['websocket'],
      priority: 5,
      userId: null,
      targetUsers: null,
      scheduledAt: null,
      metadata: {}
    };
  }

  /**
   * 変数を設定
   */
  setVariable(key, value) {
    this.variables[key] = value;
    return this;
  }

  /**
   * 複数の変数を設定
   */
  setVariables(variables) {
    this.variables = { ...this.variables, ...variables };
    return this;
  }

  /**
   * チャネルを設定
   */
  setChannels(channels) {
    this.options.channels = channels;
    return this;
  }

  /**
   * 優先度を設定
   */
  setPriority(priority) {
    this.options.priority = priority;
    return this;
  }

  /**
   * ユーザーを設定
   */
  setUser(userId) {
    this.options.userId = userId;
    return this;
  }

  /**
   * 複数のターゲットユーザーを設定
   */
  setTargetUsers(targetUsers) {
    this.options.targetUsers = targetUsers;
    return this;
  }

  /**
   * スケジュールを設定
   */
  scheduleAt(scheduledAt) {
    this.options.scheduledAt = scheduledAt;
    return this;
  }

  /**
   * メタデータを設定
   */
  setMetadata(metadata) {
    this.options.metadata = metadata;
    return this;
  }

  /**
   * 通知を送信
   */
  async send() {
    const notification = new Notification(this.templateId, this.variables, this.options);
    return await notification.send();
  }

  /**
   * メールで送信
   */
  async sendViaMail() {
    this.setChannels(['email']);
    return await this.send();
  }

  /**
   * SMSで送信
   */
  async sendViaSms() {
    this.setChannels(['sms']);
    return await this.send();
  }

  /**
   * Slackで送信
   */
  async sendViaSlack() {
    this.setChannels(['slack']);
    return await this.send();
  }

  /**
   * Pushで送信
   */
  async sendViaPush() {
    this.setChannels(['push']);
    return await this.send();
  }
}

module.exports = {
  Notification,
  WelcomeNotification,
  CommentNotification,
  ModerationNotification,
  SecurityAlertNotification,
  UserBannedNotification,
  NotificationBuilder
};
