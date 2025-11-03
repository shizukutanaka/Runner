const db = require('../db');
const logger = require('../logger');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Actorシステムサービス（Scala Akka風）
 * メッセージパッシング、状態管理、階層構造を提供
 */
class ActorSystemService extends EventEmitter {
  constructor() {
    super();
    this.actorRegistry = new Map();
    this.messageQueues = new Map();
    this.routingTable = new Map();
    this.watchedActors = new Map();
    this.systems = new Map();
    this.dispatcher = new ActorDispatcher();
    this.maxMailboxSize = 1000;
    this.messageProcessingInterval = 100; // 100msごとのメッセージ処理
    this.initializeSystem();
  }

  /**
   * システムを初期化
   */
  async initializeSystem() {
    await this.loadActorSystems();
    await this.loadActorRegistry();
    await this.loadRoutingTable();
    await this.startSystem('default');
    logger.info('[ActorSystemService] Actor system initialized');
  }

  /**
   * アクターシステムを読み込み
   */
  async loadActorSystems() {
    const sql = 'SELECT * FROM notification_actor_system WHERE status = "active"';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.systems.set(row.system_name, {
            ...row,
            config: row.config ? JSON.parse(row.config) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * アクターレジストリを読み込み
   */
  async loadActorRegistry() {
    const sql = 'SELECT * FROM notification_actor_registry WHERE status != "stopped"';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.actorRegistry.set(row.actor_path, {
            ...row,
            stateData: row.state_data ? JSON.parse(row.state_data) : {},
            metadata: row.metadata ? JSON.parse(row.metadata) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * ルーティングテーブルを読み込み
   */
  async loadRoutingTable() {
    const sql = 'SELECT * FROM notification_actor_routing WHERE enabled = 1';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          if (!this.routingTable.has(row.route_pattern)) {
            this.routingTable.set(row.route_pattern, []);
          }
          this.routingTable.get(row.route_pattern).push({
            targetActorPath: row.target_actor_path,
            routerType: row.router_type,
            routerConfig: row.router_config ? JSON.parse(row.router_config) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * アクターシステムを開始
   */
  async startSystem(systemName) {
    const system = this.systems.get(systemName);
    if (!system) {
      throw new Error(`Actor system '${systemName}' not found`);
    }

    logger.info('[ActorSystemService] Starting actor system', { systemName });

    // ルートガーディアンを開始
    await this.startActor('/user', 'RootGuardian', systemName, {
      description: 'Root guardian actor'
    });

    // メッセージ処理ディスパッチャーを開始
    this.dispatcher.start();

    return { systemName, status: 'started' };
  }

  /**
   * アクターを作成
   */
  async createActor(actorPath, actorClass, parentPath = '/user', props = {}) {
    const actorId = uuidv4();
    const fullPath = parentPath === '/user' ? `${parentPath}/${actorId}` : `${parentPath}/${actorPath}`;

    try {
      // アクターを登録
      await this.registerActor({
        actorId,
        actorPath: fullPath,
        actorClass,
        parentPath,
        stateData: props.initialState || {},
        metadata: props
      });

      // アクターインスタンスを作成
      const actorInstance = await this.createActorInstance(actorClass, fullPath, props);

      // メッセージボックスを初期化
      this.messageQueues.set(fullPath, {
        queue: [],
        processing: false,
        lastProcessed: new Date()
      });

      // アクターを監視可能に設定
      this.watchedActors.set(fullPath, new Set());

      // 親アクターに子アクターを通知
      if (parentPath !== '/user') {
        this.sendMessage(parentPath, 'system', {
          type: 'child_created',
          childPath: fullPath,
          childClass: actorClass
        });
      }

      logger.info('[ActorSystemService] Actor created', {
        actorPath: fullPath,
        actorClass,
        parentPath
      });

      return { actorPath: fullPath, actorId };

    } catch (error) {
      logger.error('[ActorSystemService] Failed to create actor', {
        actorPath: fullPath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * アクターを登録
   */
  async registerActor(actorInfo) {
    const sql = `
      INSERT OR REPLACE INTO notification_actor_registry
      (actor_id, actor_path, actor_class, parent_path, system_name, state_data, metadata, status)
      VALUES (?, ?, ?, ?, 'default', ?, ?, 'started')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        actorInfo.actorId,
        actorInfo.actorPath,
        actorInfo.actorClass,
        actorInfo.parentPath,
        JSON.stringify(actorInfo.stateData),
        JSON.stringify(actorInfo.metadata)
      ], function(err) {
        if (err) return reject(err);

        // メモリ上のレジストリに追加
        this.actorRegistry.set(actorInfo.actorPath, {
          ...actorInfo,
          id: this.lastID,
          status: 'started',
          startedAt: new Date(),
          mailboxSize: 0,
          restartCount: 0
        });

        resolve({ actorId: this.lastID });
      });
    });
  }

  /**
   * アクターインスタンスを作成
   */
  async createActorInstance(actorClass, actorPath, props) {
    switch (actorClass) {
      case 'NotificationRouter':
        return new NotificationRouterActor(actorPath, props);
      case 'DeliveryCoordinator':
        return new DeliveryCoordinatorActor(actorPath, props);
      case 'ChannelManager':
        return new ChannelManagerActor(actorPath, props);
      case 'TemplateManager':
        return new TemplateManagerActor(actorPath, props);
      case 'NotificationWorker':
        return new NotificationWorkerActor(actorPath, props);
      default:
        return new BaseActor(actorPath, props);
    }
  }

  /**
   * アクターにメッセージを送信
   */
  async tell(actorPath, message, options = {}) {
    const {
      senderPath = 'system',
      priority = 5,
      scheduledAt = null
    } = options;

    const messageId = uuidv4();

    // ルーティングを解決
    const targetPath = await this.resolveRoute(actorPath, message);

    // メッセージをキューに追加
    const actorMessage = {
      messageId,
      senderPath,
      receiverPath: targetPath,
      messageType: message.type || 'user',
      messageData: message,
      priority,
      scheduledAt,
      createdAt: new Date()
    };

    await this.enqueueMessage(actorMessage);

    logger.debug('[ActorSystemService] Message sent', {
      messageId,
      from: senderPath,
      to: targetPath,
      type: message.type
    });

    return { messageId };
  }

  /**
   * ルーティングを解決
   */
  async resolveRoute(actorPath, message) {
    // ルーティングパターンを検索
    for (const [pattern, routes] of this.routingTable.entries()) {
      if (this.matchRoute(pattern, actorPath)) {
        const route = this.selectRoute(routes, message);
        if (route) {
          return route.targetActorPath;
        }
      }
    }

    // デフォルトは指定されたパス
    return actorPath;
  }

  /**
   * ルートパターンをマッチ
   */
  matchRoute(pattern, path) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return regex.test(path);
  }

  /**
   * ルートを選択
   */
  selectRoute(routes, message) {
    if (routes.length === 0) return null;

    // ルータータイプに応じて選択
    const route = routes[0]; // 簡易実装

    // ルーターがアクティブかチェック
    const actor = this.actorRegistry.get(route.targetActorPath);
    return actor && actor.status === 'started' ? route : null;
  }

  /**
   * メッセージをキューに追加
   */
  async enqueueMessage(actorMessage) {
    const { receiverPath } = actorMessage;

    if (!this.messageQueues.has(receiverPath)) {
      this.messageQueues.set(receiverPath, {
        queue: [],
        processing: false,
        lastProcessed: new Date()
      });
    }

    const mailbox = this.messageQueues.get(receiverPath);

    // メールボックスサイズ制限
    if (mailbox.queue.length >= this.maxMailboxSize) {
      logger.warn('[ActorSystemService] Mailbox full, dropping message', { receiverPath });
      return;
    }

    // 優先度順に挿入
    const insertIndex = mailbox.queue.findIndex(msg => msg.priority < actorMessage.priority);
    if (insertIndex === -1) {
      mailbox.queue.push(actorMessage);
    } else {
      mailbox.queue.splice(insertIndex, 0, actorMessage);
    }

    mailbox.lastProcessed = new Date();

    // データベースに記録
    await this.logActorMessage(actorMessage);

    // アクターにメッセージ到着を通知
    this.notifyActor(receiverPath);
  }

  /**
   * アクターメッセージをログ
   */
  async logActorMessage(actorMessage) {
    const sql = `
      INSERT INTO notification_actor_messages
      (message_id, sender_path, receiver_path, message_type, message_data, priority, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        actorMessage.messageId,
        actorMessage.senderPath,
        actorMessage.receiverPath,
        actorMessage.messageType,
        JSON.stringify(actorMessage.messageData),
        actorMessage.priority,
        actorMessage.scheduledAt
      ], function(err) {
        if (err) return reject(err);
        resolve({ messageId: this.lastID });
      });
    });
  }

  /**
   * アクターに通知
   */
  notifyActor(actorPath) {
    const mailbox = this.messageQueues.get(actorPath);
    if (!mailbox || mailbox.processing) return;

    // メッセージ処理を開始
    this.processMailbox(actorPath);
  }

  /**
   * メールボックスを処理
   */
  async processMailbox(actorPath) {
    const mailbox = this.messageQueues.get(actorPath);
    if (!mailbox || mailbox.queue.length === 0) return;

    mailbox.processing = true;
    const actor = this.actorRegistry.get(actorPath);

    if (!actor) {
      mailbox.processing = false;
      return;
    }

    try {
      // メッセージを処理
      while (mailbox.queue.length > 0) {
        const message = mailbox.queue.shift();

        // スケジュール時間をチェック
        if (message.scheduledAt && new Date(message.scheduledAt) > new Date()) {
          // スケジュール済みメッセージは後で処理
          mailbox.queue.unshift(message);
          break;
        }

        await this.deliverMessage(actor, message);
        mailbox.lastProcessed = new Date();
      }

    } catch (error) {
      logger.error('[ActorSystemService] Mailbox processing failed', {
        actorPath,
        error: error.message
      });
    } finally {
      mailbox.processing = false;

      // まだメッセージがあれば再処理
      if (mailbox.queue.length > 0) {
        setTimeout(() => this.processMailbox(actorPath), 10);
      }
    }
  }

  /**
   * メッセージを配信
   */
  async deliverMessage(actor, message) {
    try {
      const actorInstance = await this.getActorInstance(actor.actor_path);
      if (!actorInstance) return;

      // メッセージを処理
      const response = await actorInstance.receive(message.messageData, {
        sender: message.senderPath,
        messageId: message.messageId
      });

      // レスポンスが必要な場合は送信
      if (response && message.messageType === 'call') {
        this.sendMessage(message.senderPath, actor.actor_path, {
          type: 'response',
          originalMessageId: message.messageId,
          data: response
        });
      }

      // メッセージを処理済みに更新
      await this.markMessageProcessed(message.messageId);

    } catch (error) {
      logger.error('[ActorSystemService] Message delivery failed', {
        messageId: message.messageId,
        actorPath: actor.actor_path,
        error: error.message
      });

      await this.markMessageFailed(message.messageId, error.message);
    }
  }

  /**
   * メッセージを処理済みに更新
   */
  async markMessageProcessed(messageId) {
    const sql = `
      UPDATE notification_actor_messages
      SET status = 'delivered', processed_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [messageId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * メッセージを失敗に更新
   */
  async markMessageFailed(messageId, errorMessage) {
    const sql = `
      UPDATE notification_actor_messages
      SET status = 'failed', processed_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [messageId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * アクターインスタンスを取得
   */
  async getActorInstance(actorPath) {
    const actorInfo = this.actorRegistry.get(actorPath);
    if (!actorInfo) return null;

    // ここで実際のアクターインスタンスを生成またはキャッシュから取得
    return await this.createActorInstance(actorInfo.actor_class, actorPath, actorInfo.metadata);
  }

  /**
   * アクターを監視（Akka風）
   */
  async watch(watcherPath, watchedPath) {
    // 監視関係を記録
    const sql = `
      INSERT INTO notification_actor_monitoring
      (watcher_path, watched_path, watch_type)
      VALUES (?, ?, 'death_watch')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [watcherPath, watchedPath], function(err) {
        if (err) return reject(err);

        // メモリ上の監視関係に追加
        if (!this.watchedActors.has(watchedPath)) {
          this.watchedActors.set(watchedPath, new Set());
        }
        this.watchedActors.get(watchedPath).add(watcherPath);

        resolve({ watchId: this.lastID });
      });
    });
  }

  /**
   * アクターの状態を取得
   */
  async getActorState(actorPath) {
    const actor = this.actorRegistry.get(actorPath);
    if (!actor) return null;

    return {
      actorPath,
      actorClass: actor.actor_class,
      stateData: actor.stateData,
      status: actor.status,
      mailboxSize: this.messageQueues.get(actorPath)?.queue.length || 0,
      watchedBy: this.watchedActors.get(actorPath)?.size || 0
    };
  }

  /**
   * アクターを停止
   */
  async stopActor(actorPath) {
    const actor = this.actorRegistry.get(actorPath);
    if (!actor) return;

    logger.info('[ActorSystemService] Stopping actor', { actorPath });

    // メッセージボックスをクリア
    this.messageQueues.delete(actorPath);

    // 監視関係をクリア
    this.watchedActors.delete(actorPath);

    // アクターを停止状態に更新
    const sql = 'UPDATE notification_actor_registry SET status = "stopped", stopped_at = CURRENT_TIMESTAMP WHERE actor_path = ?';
    await new Promise((resolve, reject) => {
      db.run(sql, [actorPath], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });

    // メモリから削除
    this.actorRegistry.delete(actorPath);

    return { actorPath, status: 'stopped' };
  }

  /**
   * システム統計を取得
   */
  async getSystemStats() {
    const sql = `
      SELECT
        system_name,
        COUNT(*) as actor_count,
        SUM(CASE WHEN status = 'started' THEN 1 ELSE 0 END) as active_actors,
        AVG(mailbox_size) as avg_mailbox_size
      FROM notification_actor_registry
      GROUP BY system_name
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        const stats = {
          totalActors: rows.reduce((sum, row) => sum + row.actor_count, 0),
          totalActive: rows.reduce((sum, row) => sum + row.active_actors, 0),
          systems: rows,
          messageQueues: this.messageQueues.size,
          averageMailboxSize: 0
        };

        let totalMailboxSize = 0;
        let totalQueues = 0;

        for (const mailbox of this.messageQueues.values()) {
          totalMailboxSize += mailbox.queue.length;
          totalQueues++;
        }

        stats.averageMailboxSize = totalQueues > 0 ? totalMailboxSize / totalQueues : 0;

        resolve(stats);
      });
    });
  }
}

/**
 * アクターディスパッチャー
 */
class ActorDispatcher {
  constructor() {
    this.isRunning = false;
    this.processors = new Map();
  }

  start() {
    this.isRunning = true;
    this.processMessages();
  }

  stop() {
    this.isRunning = false;
  }

  async processMessages() {
    while (this.isRunning) {
      try {
        // 各アクターのメッセージを処理
        for (const [actorPath, mailbox] of this.processors.entries()) {
          if (mailbox.queue.length > 0 && !mailbox.processing) {
            await this.processActorMailbox(actorPath, mailbox);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error('[ActorDispatcher] Message processing error', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async processActorMailbox(actorPath, mailbox) {
    mailbox.processing = true;

    try {
      const message = mailbox.queue.shift();
      if (message) {
        await this.deliverToActor(actorPath, message);
      }
    } finally {
      mailbox.processing = false;
    }
  }

  async deliverToActor(actorPath, message) {
    // 実際のアクターにメッセージを配信
    logger.debug('[ActorDispatcher] Delivering message', { actorPath, messageId: message.messageId });
  }
}

/**
 * ベースアクタークラス（Akka風）
 */
class BaseActor {
  constructor(actorPath, props = {}) {
    this.path = actorPath;
    this.props = props;
    this.state = props.initialState || {};
    this.children = new Map();
    this.context = {
      system: null,
      parent: null,
      self: this,
      sender: null
    };
  }

  async receive(message, context) {
    this.context.sender = context.sender;

    switch (message.type) {
      case 'initialize':
        return await this.onInitialize(message.data);
      case 'terminate':
        return await this.onTerminate(message.data);
      case 'get_state':
        return this.state;
      case 'update_state':
        return await this.onUpdateState(message.data);
      default:
        return await this.onMessage(message);
    }
  }

  async onInitialize(data) {
    logger.info('[BaseActor] Initialized', { path: this.path });
  }

  async onTerminate(data) {
    logger.info('[BaseActor] Terminated', { path: this.path });
  }

  async onUpdateState(newState) {
    this.state = { ...this.state, ...newState };
  }

  async onMessage(message) {
    // サブクラスでオーバーライド
    logger.debug('[BaseActor] Received message', { path: this.path, message });
  }

  async send(toPath, message) {
    // メッセージ送信
  }
}

/**
 * 通知ルーターアクター
 */
class NotificationRouterActor extends BaseActor {
  async onMessage(message) {
    // ルーティングロジック
    switch (message.type) {
      case 'route_notification':
        return await this.routeNotification(message.data);
      case 'add_route':
        return await this.addRoute(message.data);
      default:
        return { error: 'Unknown message type' };
    }
  }

  async routeNotification(notification) {
    // 通知を適切なワーカーにルーティング
    return { routed: true, target: 'worker_1' };
  }
}

/**
 * 配信コーディネーターアクター
 */
class DeliveryCoordinatorActor extends BaseActor {
  async onMessage(message) {
    switch (message.type) {
      case 'coordinate_delivery':
        return await this.coordinateDelivery(message.data);
      case 'track_delivery':
        return await this.trackDelivery(message.data);
      default:
        return { error: 'Unknown message type' };
    }
  }

  async coordinateDelivery(deliveryRequest) {
    // 配信を調整
    return { coordinated: true, channels: deliveryRequest.channels };
  }
}

/**
 * チャネルマネージャーアクター
 */
class ChannelManagerActor extends BaseActor {
  async onMessage(message) {
    switch (message.type) {
      case 'register_channel':
        return await this.registerChannel(message.data);
      case 'update_channel':
        return await this.updateChannel(message.data);
      default:
        return { error: 'Unknown message type' };
    }
  }

  async registerChannel(channelInfo) {
    // チャネルを登録
    return { registered: true, channelId: channelInfo.id };
  }
}

/**
 * テンプレートマネージャーアクター
 */
class TemplateManagerActor extends BaseActor {
  async onMessage(message) {
    switch (message.type) {
      case 'render_template':
        return await this.renderTemplate(message.data);
      case 'validate_template':
        return await this.validateTemplate(message.data);
      default:
        return { error: 'Unknown message type' };
    }
  }

  async renderTemplate(templateRequest) {
    // テンプレートをレンダリング
    return { rendered: true, content: templateRequest.content };
  }
}

/**
 * 通知ワーカーアクター
 */
class NotificationWorkerActor extends BaseActor {
  async onMessage(message) {
    switch (message.type) {
      case 'process_notification':
        return await this.processNotification(message.data);
      case 'batch_notifications':
        return await this.batchProcess(message.data);
      default:
        return { error: 'Unknown message type' };
    }
  }

  async processNotification(notification) {
    // 通知を処理
    return { processed: true, notificationId: notification.id };
  }
}

module.exports = ActorSystemService;
