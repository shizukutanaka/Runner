const db = require('../db');
const logger = require('../logger');

/**
 * インタラクティブ通知サービス（Swift iOS風）
 * 通知アクション、カテゴリ、ユーザー応答を管理
 */
class InteractiveNotificationService {
  constructor() {
    this.categories = new Map();
    this.actions = new Map();
    this.badgeSettings = new Map();
    this.soundSettings = new Map();
    this.initializeInteractiveSystem();
  }

  /**
   * インタラクティブシステムを初期化
   */
  async initializeInteractiveSystem() {
    await this.loadCategories();
    await this.loadActions();
    await this.loadBadgeSettings();
    await this.loadSoundSettings();
    logger.info('[InteractiveNotificationService] Interactive system initialized');
  }

  /**
   * カテゴリを読み込み
   */
  async loadCategories() {
    const sql = 'SELECT * FROM notification_categories';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.categories.set(row.category_id, {
            ...row,
            intentIdentifiers: row.intent_identifiers ? JSON.parse(row.intent_identifiers) : []
          });
        });
        resolve();
      });
    });
  }

  /**
   * アクションを読み込み
   */
  async loadActions() {
    const sql = 'SELECT * FROM notification_actions';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.actions.set(row.action_id, {
            ...row,
            parameters: row.parameters ? JSON.parse(row.parameters) : {},
            authenticationRequired: Boolean(row.authentication_required),
            destructive: Boolean(row.destructive)
          });
        });
        resolve();
      });
    });
  }

  /**
   * バッジ設定を読み込み
   */
  async loadBadgeSettings() {
    const sql = 'SELECT * FROM notification_badge_settings';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.badgeSettings.set(row.user_id, {
            ...row,
            showCount: Boolean(row.show_count),
            resetOnOpen: Boolean(row.reset_on_open)
          });
        });
        resolve();
      });
    });
  }

  /**
   * サウンド設定を読み込み
   */
  async loadSoundSettings() {
    const sql = 'SELECT * FROM notification_sound_settings';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.soundSettings.set(row.user_id, {
            ...row,
            soundEnabled: Boolean(row.sound_enabled),
            customSounds: row.custom_sounds ? JSON.parse(row.custom_sounds) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * インタラクティブ通知を作成
   */
  async createInteractiveNotification(userId, type, level, title, message, options = {}) {
    const {
      categoryId = 'system_alert',
      actions = [],
      badgeCount = 1,
      soundFile = 'default',
      metadata = {},
      expiresAt = null,
      interactiveData = {}
    } = options;

    // カテゴリとアクションを検証
    const category = this.categories.get(categoryId);
    if (!category) {
      throw new Error(`Category ${categoryId} not found`);
    }

    const availableActions = actions.length > 0 ? actions : this.getDefaultActionsForCategory(categoryId);

    // 通知を作成
    const sql = `
      INSERT INTO notifications
      (user_id, type, level, title, message, metadata, category_id, available_actions, badge_count, sound_file, interactive_data, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        userId,
        type,
        level,
        title,
        message,
        JSON.stringify(metadata),
        categoryId,
        JSON.stringify(availableActions),
        badgeCount,
        soundFile,
        JSON.stringify(interactiveData),
        expiresAt
      ], function(err) {
        if (err) return reject(err);

        const notificationId = this.lastID;

        // バッジカウントを更新
        this.updateBadgeCount(userId, badgeCount);

        // ユーザーアクションを記録
        this.logNotificationCreation(notificationId, userId, categoryId, availableActions);

        logger.info('[InteractiveNotificationService] Interactive notification created', {
          notificationId,
          userId,
          categoryId,
          actions: availableActions.length
        });

        resolve({
          id: notificationId,
          categoryId,
          availableActions,
          badgeCount,
          soundFile
        });
      });
    });
  }

  /**
   * カテゴリのデフォルトアクションを取得
   */
  getDefaultActionsForCategory(categoryId) {
    const sql = `
      SELECT action_id FROM notification_category_actions
      WHERE category_id = ?
      ORDER BY action_order
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [categoryId], (err, rows) => {
        if (err) return reject(err);

        const actions = rows.map(row => this.actions.get(row.action_id)).filter(Boolean);
        resolve(actions.map(action => action.action_id));
      });
    });
  }

  /**
   * ユーザーアクションを処理
   */
  async handleUserAction(notificationId, actionId, userId, actionData = {}) {
    // アクションを検証
    const action = this.actions.get(actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found`);
    }

    // 通知が存在するか確認
    const sql = 'SELECT * FROM notifications WHERE id = ? AND user_id = ?';
    return new Promise((resolve, reject) => {
      db.get(sql, [notificationId, userId], async (err, notification) => {
        if (err) return reject(err);
        if (!notification) {
          return reject(new Error('Notification not found'));
        }

        // ユーザーアクションを記録
        const userActionId = await this.logUserAction(notificationId, actionId, userId, actionData);

        // アクションに応じた処理を実行
        const result = await this.processAction(notification, action, actionData);

        // アクションを処理済みに更新
        await this.markActionProcessed(userActionId);

        logger.info('[InteractiveNotificationService] User action processed', {
          notificationId,
          actionId,
          userId,
          result: result.success
        });

        resolve({
          actionId,
          result,
          processed: true
        });
      });
    });
  }

  /**
   * ユーザーアクションをログ
   */
  async logUserAction(notificationId, actionId, userId, actionData) {
    const sql = `
      INSERT INTO notification_user_actions
      (notification_id, action_id, user_id, action_data, response_text)
      VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        notificationId,
        actionId,
        userId,
        JSON.stringify(actionData),
        actionData.responseText || null
      ], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  /**
   * アクションを処理
   */
  async processAction(notification, action, actionData) {
    const result = {
      success: true,
      action: action.action_id,
      data: actionData,
      timestamp: new Date()
    };

    try {
      switch (action.action_id) {
        case 'view_comment':
          result.url = actionData.url || `/comments/${actionData.commentId}`;
          break;

        case 'reply_comment':
          result.replyData = {
            commentId: actionData.commentId,
            text: actionData.responseText,
            timestamp: new Date()
          };
          break;

        case 'like_comment':
          result.likeData = {
            commentId: actionData.commentId,
            liked: actionData.value,
            timestamp: new Date()
          };
          break;

        case 'approve_content':
          result.approvalData = {
            contentId: actionData.contentId,
            status: 'approved',
            timestamp: new Date()
          };
          break;

        case 'reject_content':
          result.rejectionData = {
            contentId: actionData.contentId,
            reason: actionData.reason,
            timestamp: new Date()
          };
          break;

        case 'accept_friend':
          result.friendData = {
            friendId: actionData.friendId,
            status: 'accepted',
            timestamp: new Date()
          };
          break;

        case 'decline_friend':
          result.friendData = {
            friendId: actionData.friendId,
            status: 'declined',
            timestamp: new Date()
          };
          break;

        default:
          result.processed = true;
      }

      return result;

    } catch (error) {
      logger.error('[InteractiveNotificationService] Action processing failed', {
        actionId: action.action_id,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        action: action.action_id
      };
    }
  }

  /**
   * アクションを処理済みに更新
   */
  async markActionProcessed(userActionId) {
    const sql = 'UPDATE notification_user_actions SET processed = 1 WHERE id = ?';
    return new Promise((resolve, reject) => {
      db.run(sql, [userActionId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * バッジカウントを更新
   */
  async updateBadgeCount(userId, increment = 1) {
    let badgeSettings = this.badgeSettings.get(userId);

    if (!badgeSettings) {
      // デフォルト設定を作成
      badgeSettings = {
        userId,
        badgeCount: 0,
        showCount: true,
        maxCount: 99,
        resetOnOpen: true
      };

      await this.saveBadgeSettings(badgeSettings);
      this.badgeSettings.set(userId, badgeSettings);
    }

    // バッジカウントを増加
    badgeSettings.badgeCount = Math.min(badgeSettings.badgeCount + increment, badgeSettings.maxCount);

    await this.saveBadgeSettings(badgeSettings);
    return badgeSettings.badgeCount;
  }

  /**
   * バッジ設定を保存
   */
  async saveBadgeSettings(settings) {
    const sql = `
      INSERT OR REPLACE INTO notification_badge_settings
      (user_id, badge_count, show_count, max_count, reset_on_open)
      VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        settings.userId,
        settings.badgeCount,
        settings.showCount ? 1 : 0,
        settings.maxCount,
        settings.resetOnOpen ? 1 : 0
      ], function(err) {
        if (err) return reject(err);
        resolve({ badgeId: this.lastID });
      });
    });
  }

  /**
   * バッジカウントをリセット
   */
  async resetBadgeCount(userId) {
    const badgeSettings = this.badgeSettings.get(userId);
    if (!badgeSettings) return 0;

    badgeSettings.badgeCount = 0;
    await this.saveBadgeSettings(badgeSettings);

    return 0;
  }

  /**
   * サウンド設定を更新
   */
  async updateSoundSettings(userId, settings) {
    const {
      soundEnabled = true,
      defaultSound = 'default',
      customSounds = {},
      volumeLevel = 50
    } = settings;

    const sql = `
      INSERT OR REPLACE INTO notification_sound_settings
      (user_id, sound_enabled, default_sound, custom_sounds, volume_level)
      VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        userId,
        soundEnabled ? 1 : 0,
        defaultSound,
        JSON.stringify(customSounds),
        volumeLevel
      ], function(err) {
        if (err) return reject(err);

        // メモリ上の設定を更新
        this.soundSettings.set(userId, {
          userId,
          soundEnabled: Boolean(soundEnabled),
          defaultSound,
          customSounds,
          volumeLevel
        });

        resolve({ soundId: this.lastID });
      });
    });
  }

  /**
   * カテゴリを作成
   */
  async createCategory(categoryId, categoryName, options = {}) {
    const {
      hiddenPreviewsShowTitle = false,
      hiddenPreviewsShowSubtitle = false,
      intentIdentifiers = []
    } = options;

    const sql = `
      INSERT OR REPLACE INTO notification_categories
      (category_id, category_name, hidden_previews_show_title, hidden_previews_show_subtitle, intent_identifiers)
      VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        categoryId,
        categoryName,
        hiddenPreviewsShowTitle ? 1 : 0,
        hiddenPreviewsShowSubtitle ? 1 : 0,
        JSON.stringify(intentIdentifiers)
      ], function(err) {
        if (err) return reject(err);

        // メモリ上のカテゴリに追加
        this.categories.set(categoryId, {
          id: this.lastID,
          categoryId,
          categoryName,
          hiddenPreviewsShowTitle: Boolean(hiddenPreviewsShowTitle),
          hiddenPreviewsShowSubtitle: Boolean(hiddenPreviewsShowSubtitle),
          intentIdentifiers
        });

        resolve({ categoryId });
      });
    });
  }

  /**
   * アクションを作成
   */
  async createAction(actionId, actionTitle, actionType, options = {}) {
    const {
      style = 'default',
      activationMode = 'background',
      authenticationRequired = false,
      destructive = false,
      parameters = {},
      context = ''
    } = options;

    const sql = `
      INSERT OR REPLACE INTO notification_actions
      (action_id, action_title, action_type, style, activation_mode, authentication_required, destructive, parameters, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        actionId,
        actionTitle,
        actionType,
        style,
        activationMode,
        authenticationRequired ? 1 : 0,
        destructive ? 1 : 0,
        JSON.stringify(parameters),
        context
      ], function(err) {
        if (err) return reject(err);

        // メモリ上のアクションに追加
        this.actions.set(actionId, {
          id: this.lastID,
          actionId,
          actionTitle,
          actionType,
          style,
          activationMode,
          authenticationRequired: Boolean(authenticationRequired),
          destructive: Boolean(destructive),
          parameters,
          context
        });

        resolve({ actionId });
      });
    });
  }

  /**
   * カテゴリにアクションを追加
   */
  async addActionToCategory(categoryId, actionId, actionOrder = 1, required = false) {
    const sql = `
      INSERT OR REPLACE INTO notification_category_actions
      (category_id, action_id, action_order, required)
      VALUES (?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [categoryId, actionId, actionOrder, required ? 1 : 0], function(err) {
        if (err) return reject(err);
        resolve({ associationId: this.lastID });
      });
    });
  }

  /**
   * インタラクティブ通知をWebSocketで送信
   */
  sendInteractiveNotification(io, userId, notification) {
    const category = this.categories.get(notification.categoryId);
    const availableActions = JSON.parse(notification.availableActions || '[]');
    const actions = availableActions.map(actionId => this.actions.get(actionId)).filter(Boolean);

    const interactiveMessage = {
      id: notification.id,
      type: notification.type,
      level: notification.level,
      title: notification.title,
      message: notification.message,
      metadata: JSON.parse(notification.metadata || '{}'),
      category: {
        id: category?.categoryId,
        name: category?.categoryName,
        hiddenPreviews: {
          showTitle: Boolean(category?.hiddenPreviewsShowTitle),
          showSubtitle: Boolean(category?.hiddenPreviewsShowSubtitle)
        }
      },
      actions: actions.map(action => ({
        id: action.actionId,
        title: action.actionTitle,
        type: action.actionType,
        style: action.style,
        destructive: action.destructive,
        parameters: action.parameters
      })),
      badgeCount: notification.badgeCount,
      soundFile: notification.soundFile,
      interactiveData: JSON.parse(notification.interactiveData || '{}'),
      createdAt: notification.createdAt,
      expiresAt: notification.expiresAt
    };

    // ユーザーのWebSocketに送信
    const userSockets = Array.from(io.sockets.sockets.values())
      .filter(socket => socket.userId === userId);

    userSockets.forEach(socket => {
      socket.emit('interactive_notification', interactiveMessage);
    });

    return {
      sent: true,
      toSockets: userSockets.length,
      actions: actions.length
    };
  }

  /**
   * アクション応答を処理
   */
  async processActionResponse(userId, notificationId, actionId, responseData) {
    // アクションを処理
    const result = await this.handleUserAction(notificationId, actionId, userId, responseData);

    // バッジカウントをリセット（設定による）
    const badgeSettings = this.badgeSettings.get(userId);
    if (badgeSettings && badgeSettings.resetOnOpen) {
      await this.resetBadgeCount(userId);
    }

    // フレームワークイベントを発行
    const frameworkService = new FrameworkIntegrationService();
    await frameworkService.publishEvent('notification.interacted', {
      userId,
      notificationId,
      actionId,
      responseData,
      result
    }, {
      sourceComponent: 'interactive_notification_service'
    });

    return result;
  }

  /**
   * 通知作成をログ
   */
  async logNotificationCreation(notificationId, userId, categoryId, actions) {
    // 統計を記録
    logger.debug('[InteractiveNotificationService] Notification creation logged', {
      notificationId,
      userId,
      categoryId,
      actionCount: actions.length
    });
  }

  /**
   * インタラクティブ通知統計を取得
   */
  async getInteractiveStats() {
    const sql = `
      SELECT
        category_id,
        COUNT(*) as notification_count,
        SUM(badge_count) as total_badges
      FROM notifications
      WHERE category_id IS NOT NULL
      GROUP BY category_id
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        const stats = {
          totalInteractiveNotifications: rows.reduce((sum, row) => sum + row.notification_count, 0),
          totalBadgeCount: rows.reduce((sum, row) => sum + (row.total_badges || 0), 0),
          byCategory: {},
          totalCategories: this.categories.size,
          totalActions: this.actions.size,
          totalUsersWithBadgeSettings: this.badgeSettings.size,
          totalUsersWithSoundSettings: this.soundSettings.size
        };

        rows.forEach(row => {
          const category = this.categories.get(row.category_id);
          stats.byCategory[row.category_id] = {
            name: category?.categoryName || 'Unknown',
            count: row.notification_count,
            totalBadges: row.total_badges || 0
          };
        });

        resolve(stats);
      });
    });
  }
}

module.exports = InteractiveNotificationService;
