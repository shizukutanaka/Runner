const db = require('../db');
const logger = require('../logger');
const { v4: uuidv4 } = require('uuid');

/**
 * コルーチンサービス（Kotlin風）
 * 軽量な並行処理、async/await、チャネルを提供
 */
class CoroutineService {
  constructor() {
    this.contexts = new Map();
    this.channels = new Map();
    this.jobs = new Map();
    this.delayedJobs = new Map();
    this.dispatchers = {
      default: new CoroutineDispatcher('default'),
      io: new CoroutineDispatcher('io'),
      cpu: new CoroutineDispatcher('cpu'),
      main: new CoroutineDispatcher('main')
    };
    this.maxConcurrency = 1000;
    this.jobTimeout = 30000;
    this.initializeSystem();
  }

  /**
   * システムを初期化
   */
  async initializeSystem() {
    await this.loadContexts();
    await this.loadChannels();
    this.startJobScheduler();
    this.startDelayedJobProcessor();
    logger.info('[CoroutineService] Coroutine system initialized');
  }

  /**
   * コルーチンコンテキストを読み込み
   */
  async loadContexts() {
    const sql = 'SELECT * FROM notification_coroutine_contexts WHERE status = "active"';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.contexts.set(row.context_id, {
            ...row,
            jobData: row.job_data ? JSON.parse(row.job_data) : {},
            dispatcher: this.dispatchers[row.dispatcher_type] || this.dispatchers.default
          });
        });
        resolve();
      });
    });
  }

  /**
   * チャネルを読み込み
   */
  async loadChannels() {
    const sql = 'SELECT * FROM notification_coroutine_channels WHERE status = "open"';
    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.channels.set(row.channel_id, {
            ...row,
            buffer: [],
            senders: new Set(),
            receivers: new Set()
          });
        });
        resolve();
      });
    });
  }

  /**
   * 非同期関数を実行（Kotlinのasyncに相当）
   */
  async async(block, contextId = 'default') {
    const jobId = uuidv4();
    const context = this.contexts.get(contextId) || this.contexts.get('default');

    const job = {
      jobId,
      contextId,
      block,
      status: 'pending',
      createdAt: new Date()
    };

    // ジョブを登録
    await this.registerJob(job);

    // ディスパッチャーにジョブを送信
    context.dispatcher.enqueue(job);

    return jobId;
  }

  /**
   * ジョブを登録
   */
  async registerJob(job) {
    const sql = `
      INSERT OR REPLACE INTO notification_coroutine_jobs
      (job_id, context_id, job_type, job_data, status, priority)
      VALUES (?, ?, 'async', ?, 'pending', 5)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [
        job.jobId,
        job.contextId,
        JSON.stringify({ block: job.block.toString() })
      ], function(err) {
        if (err) return reject(err);

        // メモリ上のジョブに追加
        this.jobs.set(job.jobId, {
          ...job,
          id: this.lastID,
          status: 'pending'
        });

        resolve({ jobId: this.lastID });
      });
    });
  }

  /**
   * 遅延実行（Kotlinのdelayに相当）
   */
  async delay(delayMs, contextId = 'default') {
    return new Promise(resolve => {
      setTimeout(resolve, delayMs);
    });
  }

  /**
   * チャネルを作成
   */
  async createChannel(channelName, channelType = 'rendezvous', bufferSize = 0) {
    const channelId = uuidv4();

    const sql = `
      INSERT INTO notification_coroutine_channels
      (channel_id, channel_name, channel_type, buffer_size, status)
      VALUES (?, ?, ?, ?, 'open')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [channelId, channelName, channelType, bufferSize], function(err) {
        if (err) return reject(err);

        // メモリ上のチャネルに追加
        this.channels.set(channelId, {
          id: this.lastID,
          channelId,
          channelName,
          channelType,
          bufferSize,
          buffer: [],
          senders: new Set(),
          receivers: new Set(),
          status: 'open'
        });

        resolve({ channelId, channelName });
      });
    });
  }

  /**
   * チャネルに送信
   */
  async send(channelId, message, contextId = null) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    if (channel.status !== 'open') {
      throw new Error(`Channel ${channelId} is closed`);
    }

    const messageId = uuidv4();

    if (channel.channelType === 'rendezvous') {
      // ランデブーチャネル：送信と受信が同期
      return new Promise((resolve, reject) => {
        const receiver = channel.receivers.values().next().value;
        if (receiver) {
          this.deliverMessage(channelId, messageId, message, contextId);
          channel.receivers.delete(receiver);
          resolve({ messageId });
        } else {
          // 受信待ちがない場合はバッファに保存
          channel.buffer.push({ messageId, message, contextId, timestamp: new Date() });
          resolve({ messageId });
        }
      });
    } else {
      // バッファドチャネル
      if (channel.buffer.length >= channel.bufferSize && channel.bufferSize > 0) {
        throw new Error(`Channel buffer full`);
      }

      this.deliverMessage(channelId, messageId, message, contextId);
      return { messageId };
    }
  }

  /**
   * メッセージを配信
   */
  async deliverMessage(channelId, messageId, message, contextId) {
    const channel = this.channels.get(channelId);

    // チャネルメッセージを記録
    const sql = `
      INSERT INTO notification_channel_messages
      (channel_id, message_data, sender_context_id, status)
      VALUES (?, ?, ?, 'delivered')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [channelId, JSON.stringify(message), contextId], function(err) {
        if (err) return reject(err);

        // メモリ上のチャネルにメッセージを追加
        channel.buffer.push({
          messageId,
          message,
          senderContextId: contextId,
          deliveredAt: new Date()
        });

        resolve({ messageId: this.lastID });
      });
    });
  }

  /**
   * チャネルから受信
   */
  async receive(channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    if (channel.status !== 'open') {
      throw new Error(`Channel ${channelId} is closed`);
    }

    if (channel.channelType === 'rendezvous') {
      // ランデブーチャネル
      if (channel.buffer.length > 0) {
        const message = channel.buffer.shift();
        await this.markMessageConsumed(message.messageId);
        return message.message;
      } else {
        // 送信待ちがない場合は待機
        return new Promise((resolve) => {
          channel.receivers.add('waiting');
          // 実際にはイベントやポーリングで待機
        });
    } else {
      // バッファドチャネル
      if (channel.buffer.length > 0) {
        const message = channel.buffer.shift();
        await this.markMessageConsumed(message.messageId);
        return message.message;
      } else {
        // バッファが空の場合は待機またはnull
        return null;
      }
    }
  }

  /**
   * メッセージを消費済みに更新
   */
  async markMessageConsumed(messageId) {
    const sql = 'UPDATE notification_channel_messages SET status = "consumed", consumed_at = CURRENT_TIMESTAMP WHERE id = ?';
    return new Promise((resolve, reject) => {
      db.run(sql, [messageId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * コルーチンコンテキストでジョブを実行
   */
  async withContext(contextId, block) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }

    const jobId = uuidv4();

    return new Promise(async (resolve, reject) => {
      try {
        const result = await context.dispatcher.execute(block, contextId);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 並行実行（Kotlinのlaunchに相当）
   */
  async launch(block, contextId = 'default') {
    return await this.async(block, contextId);
  }

  /**
   * 遅延ジョブをスケジュール
   */
  async scheduleDelayedJob(targetContextId, delayMs, jobData) {
    const jobId = uuidv4();
    const delayUntil = new Date(Date.now() + delayMs);

    const sql = `
      INSERT INTO notification_delayed_jobs
      (job_id, target_context_id, delay_until, job_data, status)
      VALUES (?, ?, ?, ?, 'waiting')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [jobId, targetContextId, delayUntil.toISOString(), JSON.stringify(jobData)], function(err) {
        if (err) return reject(err);

        // メモリ上の遅延ジョブに追加
        this.delayedJobs.set(jobId, {
          jobId,
          targetContextId,
          delayUntil,
          jobData,
          status: 'waiting',
          createdAt: new Date()
        });

        resolve({ jobId });
      });
    });
  }

  /**
   * ジョブスケジューラーを開始
   */
  startJobScheduler() {
    setInterval(async () => {
      try {
        await this.processPendingJobs();
      } catch (error) {
        logger.error('[CoroutineService] Job scheduler error', { error: error.message });
      }
    }, 1000); // 1秒ごとのチェック
  }

  /**
   * 保留中のジョブを処理
   */
  async processPendingJobs() {
    const sql = `
      SELECT * FROM notification_coroutine_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 50
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, async (err, rows) => {
        if (err) return reject(err);

        for (const job of rows) {
          await this.executeJob(job);
        }

        resolve({ processed: rows.length });
      });
    });
  }

  /**
   * ジョブを実行
   */
  async executeJob(job) {
    const context = this.contexts.get(job.context_id);
    if (!context) return;

    try {
      // ジョブを処理中に更新
      await this.markJobRunning(job.job_id);

      // ジョブを実行
      const jobData = JSON.parse(job.job_data);
      const result = await context.dispatcher.execute(jobData.block, job.context_id);

      // ジョブを完了に更新
      await this.markJobCompleted(job.job_id, result);

    } catch (error) {
      logger.error('[CoroutineService] Job execution failed', {
        jobId: job.job_id,
        error: error.message
      });

      await this.markJobFailed(job.job_id, error.message);
    }
  }

  /**
   * ジョブを処理中に更新
   */
  async markJobRunning(jobId) {
    const sql = 'UPDATE notification_coroutine_jobs SET status = "running", started_at = CURRENT_TIMESTAMP WHERE job_id = ?';
    return new Promise((resolve, reject) => {
      db.run(sql, [jobId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * ジョブを完了に更新
   */
  async markJobCompleted(jobId, result) {
    const sql = 'UPDATE notification_coroutine_jobs SET status = "completed", completed_at = CURRENT_TIMESTAMP, result_data = ? WHERE job_id = ?';
    return new Promise((resolve, reject) => {
      db.run(sql, [JSON.stringify(result), jobId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * ジョブを失敗に更新
   */
  async markJobFailed(jobId, errorMessage) {
    const sql = 'UPDATE notification_coroutine_jobs SET status = "failed", completed_at = CURRENT_TIMESTAMP, error_message = ? WHERE job_id = ?';
    return new Promise((resolve, reject) => {
      db.run(sql, [errorMessage, jobId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * 遅延ジョブプロセッサーを開始
   */
  startDelayedJobProcessor() {
    setInterval(async () => {
      try {
        await this.processDelayedJobs();
      } catch (error) {
        logger.error('[CoroutineService] Delayed job processor error', { error: error.message });
      }
    }, 1000); // 1秒ごとのチェック
  }

  /**
   * 遅延ジョブを処理
   */
  async processDelayedJobs() {
    const now = new Date().toISOString();

    const sql = `
      SELECT * FROM notification_delayed_jobs
      WHERE delay_until <= ? AND status = 'waiting'
      ORDER BY delay_until ASC
      LIMIT 20
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [now], async (err, rows) => {
        if (err) return reject(err);

        for (const job of rows) {
          await this.executeDelayedJob(job);
        }

        resolve({ processed: rows.length });
      });
    });
  }

  /**
   * 遅延ジョブを実行
   */
  async executeDelayedJob(job) {
    try {
      const context = this.contexts.get(job.target_context_id);
      if (!context) return;

      // ジョブを実行
      await context.dispatcher.execute(job.job_data, job.target_context_id);

      // ジョブを完了に更新
      const sql = 'UPDATE notification_delayed_jobs SET status = "executed", executed_at = CURRENT_TIMESTAMP WHERE job_id = ?';
      await new Promise((resolve, reject) => {
        db.run(sql, [job.job_id], function(err) {
          if (err) return reject(err);
          resolve();
        });
      });

      // メモリから削除
      this.delayedJobs.delete(job.job_id);

    } catch (error) {
      logger.error('[CoroutineService] Delayed job execution failed', {
        jobId: job.job_id,
        error: error.message
      });
    }
  }

  /**
   * コルーチンで通知を処理
   */
  async processNotificationWithCoroutines(notification, processors) {
    const contextId = 'notification_context';

    return await this.async(async () => {
      try {
        // 並行処理で各チャネルを処理
        const channelResults = await Promise.all(
          processors.map(async (processor) => {
            return await this.withContext('io', async () => {
              return await processor(notification);
            });
          })
        );

        return {
          success: true,
          results: channelResults,
          processedAt: new Date()
        };

      } catch (error) {
        logger.error('[CoroutineService] Notification processing failed', {
          notificationId: notification.id,
          error: error.message
        });

        return {
          success: false,
          error: error.message,
          processedAt: new Date()
        };
      }
    }, contextId);
  }

  /**
   * チャネルベースの通知配信
   */
  async deliverNotificationViaChannel(notification, channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // チャネル経由で配信
    await this.send(channelId, {
      type: 'notification',
      data: notification,
      timestamp: new Date()
    });

    return { delivered: true, channelId };
  }

  /**
   * ブロードキャスト（Kotlinのbroadcastに相当）
   */
  async broadcast(channelId, message) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // すべての受信者にブロードキャスト
    for (const receiver of channel.receivers) {
      await this.send(channelId, message, receiver);
    }

    return { broadcasted: true, receivers: channel.receivers.size };
  }

  /**
   * システム統計を取得
   */
  async getSystemStats() {
    const sql = `
      SELECT
        dispatcher_type,
        COUNT(*) as context_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_contexts
      FROM notification_coroutine_contexts
      GROUP BY dispatcher_type
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        const stats = {
          totalContexts: rows.reduce((sum, row) => sum + row.context_count, 0),
          totalActiveContexts: rows.reduce((sum, row) => sum + row.active_contexts, 0),
          totalChannels: this.channels.size,
          totalJobs: this.jobs.size,
          totalDelayedJobs: this.delayedJobs.size,
          dispatchers: Object.keys(this.dispatchers),
          contexts: rows
        };

        resolve(stats);
      });
    });
  }
}

/**
 * コルーチンディスパッチャー
 */
class CoroutineDispatcher {
  constructor(type) {
    this.type = type;
    this.jobQueue = [];
    this.isProcessing = false;
    this.maxConcurrency = type === 'cpu' ? 10 : 50;
  }

  enqueue(job) {
    this.jobQueue.push(job);

    if (!this.isProcessing) {
      this.processJobs();
    }
  }

  async processJobs() {
    this.isProcessing = true;

    while (this.jobQueue.length > 0 && this.jobQueue.length <= this.maxConcurrency) {
      const job = this.jobQueue.shift();

      try {
        await this.executeJob(job);
      } catch (error) {
        logger.error('[CoroutineDispatcher] Job execution failed', {
          jobId: job.jobId,
          error: error.message
        });
      }
    }

    this.isProcessing = false;

    // まだジョブがあれば再処理
    if (this.jobQueue.length > 0) {
      setTimeout(() => this.processJobs(), 10);
    }
  }

  async executeJob(job) {
    // 実際のジョブ実行ロジック
    logger.debug('[CoroutineDispatcher] Executing job', {
      jobId: job.jobId,
      dispatcherType: this.type
    });

    // ジョブのブロックを実行
    if (typeof job.block === 'function') {
      return await job.block();
    }

    return { executed: true };
  }
}

module.exports = CoroutineService;
