const db = require('../db');
const logger = require('../logger');
const { v4: uuidv4 } = require('uuid');

/**
 * 通知ジョブキューサービス（Laravel風）
 * 非同期ジョブ処理システム
 */
class NotificationJobQueue {
  constructor() {
    this.workers = new Map();
    this.jobProcessors = new Map();
    this.batchProcessors = new Map();
    this.isProcessing = false;
    this.processInterval = 1000;
  }

  /**
   * ジョブをキューに追加
   */
  async dispatch(jobType, payload, options = {}) {
    const {
      queueName = 'default',
      priority = 5,
      maxRetries = 3,
      scheduledAt = null,
      metadata = {},
      dependencies = []
    } = options;

    const jobId = uuidv4();

    const sql = `
      INSERT INTO notification_jobs
      (job_id, job_type, payload, queue_name, priority, max_retries, scheduled_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      jobId,
      jobType,
      JSON.stringify(payload),
      queueName,
      priority,
      maxRetries,
      scheduledAt,
      JSON.stringify(metadata)
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, params, async function(err) {
        if (err) return reject(err);

        // 依存関係を追加
        if (dependencies.length > 0) {
          for (const depJobId of dependencies) {
            await this.addJobDependency(jobId, depJobId);
          }
        }

        logger.info('[NotificationJobQueue] Job dispatched', { jobId, jobType, queueName });
        resolve({ jobId, jobType, queueName });
      });
    });
  }

  /**
   * ジョブ依存関係を追加
   */
  async addJobDependency(jobId, dependsOnJobId) {
    const sql = `
      INSERT INTO notification_job_dependencies (job_id, depends_on_job_id)
      VALUES (?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [jobId, dependsOnJobId], function(err) {
        if (err) return reject(err);
        resolve({ dependencyId: this.lastID });
      });
    });
  }

  /**
   * バッチジョブを作成
   */
  async createBatch(batchName, jobs, options = {}) {
    const batchId = uuidv4();
    const totalJobs = jobs.length;

    // バッチレコードを作成
    const batchSql = `
      INSERT INTO notification_job_batches (batch_id, batch_name, total_jobs)
      VALUES (?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      db.run(batchSql, [batchId, batchName, totalJobs], async function(err) {
        if (err) return reject(err);

        // 各ジョブをバッチに追加
        for (const job of jobs) {
          await this.dispatch(job.jobType, job.payload, {
            ...job.options,
            metadata: {
              ...job.options.metadata,
              batchId,
              batchName
            }
          });
        }

        logger.info('[NotificationJobQueue] Batch created', { batchId, batchName, totalJobs });
        resolve({ batchId, batchName, totalJobs });
      });
    });
  }

  /**
   * 保留中のジョブを取得（優先度順）
   */
  async getPendingJobs(queueName = 'default', limit = 10) {
    const sql = `
      SELECT * FROM notification_jobs
      WHERE queue_name = ? AND status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
      AND retry_count < max_retries
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [queueName, limit], (err, rows) => {
        if (err) return reject(err);

        const jobs = rows.map(row => ({
          ...row,
          payload: JSON.parse(row.payload),
          metadata: row.metadata ? JSON.parse(row.metadata) : {}
        }));

        resolve(jobs);
      });
    });
  }

  /**
   * ジョブを処理中に更新
   */
  async markJobProcessing(jobId, workerId) {
    const sql = `
      UPDATE notification_jobs
      SET status = 'processing', worker_id = ?, processed_at = datetime('now'), updated_at = datetime('now')
      WHERE job_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [workerId, jobId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * ジョブを完了に更新
   */
  async markJobCompleted(jobId) {
    const sql = `
      UPDATE notification_jobs
      SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE job_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [jobId], async function(err) {
        if (err) return reject(err);

        // バッチ更新
        await this.updateBatchProgress(jobId);

        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * ジョブを失敗に更新
   */
  async markJobFailed(jobId, errorMessage) {
    const sql = `
      UPDATE notification_jobs
      SET status = 'failed', failed_at = datetime('now'), error_message = ?,
          retry_count = retry_count + 1, updated_at = datetime('now')
      WHERE job_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [errorMessage, jobId], async function(err) {
        if (err) return reject(err);

        // バッチ更新
        await this.updateBatchProgress(jobId);

        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * バッチの進行状況を更新
   */
  async updateBatchProgress(jobId) {
    // ジョブのバッチIDを取得
    const jobSql = 'SELECT metadata FROM notification_jobs WHERE job_id = ?';
    const batchId = await new Promise((resolve, reject) => {
      db.get(jobSql, [jobId], (err, row) => {
        if (err) return reject(err);
        if (!row || !row.metadata) return resolve(null);

        const metadata = JSON.parse(row.metadata);
        resolve(metadata.batchId);
      });
    });

    if (!batchId) return;

    // バッチの統計を更新
    const statsSql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM notification_jobs
      WHERE metadata LIKE ?
    `;

    return new Promise((resolve, reject) => {
      db.get(statsSql, [`%${batchId}%`], (err, stats) => {
        if (err) return reject(err);

        let batchStatus = 'processing';
        if (stats.completed === stats.total) {
          batchStatus = 'completed';
        } else if (stats.failed > 0) {
          batchStatus = 'failed';
        }

        const updateSql = `
          UPDATE notification_job_batches
          SET processed_jobs = ?, failed_jobs = ?, status = ?, updated_at = datetime('now')
          WHERE batch_id = ?
        `;

        db.run(updateSql, [stats.completed, stats.failed, batchStatus, batchId], function(err) {
          if (err) return reject(err);
          resolve({ batchId, status: batchStatus });
        });
      });
    });
  }

  /**
   * ジョブプロセッサを登録
   */
  registerJobProcessor(jobType, processor) {
    this.jobProcessors.set(jobType, processor);
    logger.info('[NotificationJobQueue] Job processor registered', { jobType });
  }

  /**
   * バッチプロセッサを登録
   */
  registerBatchProcessor(batchType, processor) {
    this.batchProcessors.set(batchType, processor);
    logger.info('[NotificationJobQueue] Batch processor registered', { batchType });
  }

  /**
   * ワーカーを開始
   */
  startWorker(queueName = 'default', workerId = null) {
    const worker = {
      id: workerId || uuidv4(),
      queueName,
      isActive: true,
      startedAt: new Date(),
      processedCount: 0
    };

    this.workers.set(worker.id, worker);
    this.processJobs(worker);

    logger.info('[NotificationJobQueue] Worker started', { workerId: worker.id, queueName });
    return worker;
  }

  /**
   * ジョブを処理
   */
  async processJobs(worker) {
    while (worker.isActive) {
      try {
        const jobs = await this.getPendingJobs(worker.queueName, 5);

        for (const job of jobs) {
          await this.processJob(job, worker);
        }

        await new Promise(resolve => setTimeout(resolve, this.processInterval));
      } catch (error) {
        logger.error('[NotificationJobQueue] Worker error', { workerId: worker.id, error: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * 単一のジョブを処理
   */
  async processJob(job, worker) {
    try {
      // ジョブを処理中に更新
      await this.markJobProcessing(job.job_id, worker.id);

      // プロセッサを取得
      const processor = this.jobProcessors.get(job.job_type);
      if (!processor) {
        throw new Error(`No processor found for job type: ${job.job_type}`);
      }

      // ジョブを実行
      const result = await processor(job.payload, job);

      if (result.success) {
        await this.markJobCompleted(job.job_id);
        worker.processedCount++;
      } else {
        await this.markJobFailed(job.job_id, result.error || 'Processing failed');
      }

      logger.info('[NotificationJobQueue] Job processed', {
        jobId: job.job_id,
        success: result.success,
        workerId: worker.id
      });

    } catch (error) {
      logger.error('[NotificationJobQueue] Job processing failed', {
        jobId: job.job_id,
        error: error.message
      });

      await this.markJobFailed(job.job_id, error.message);
    }
  }

  /**
   * 依存関係をチェック
   */
  async checkDependencies(jobId) {
    const sql = `
      SELECT depends_on_job_id FROM notification_job_dependencies
      WHERE job_id = ?
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [jobId], (err, rows) => {
        if (err) return reject(err);

        if (rows.length === 0) {
          resolve(true); // 依存関係なし
        }

        // すべての依存ジョブが完了しているかチェック
        const checkSql = `
          SELECT COUNT(*) as incomplete FROM notification_jobs
          WHERE job_id IN (${rows.map(() => '?').join(',')})
          AND status NOT IN ('completed', 'cancelled')
        `;

        db.get(checkSql, rows.map(row => row.depends_on_job_id), (err, result) => {
          if (err) return reject(err);
          resolve(result.incomplete === 0);
        });
      });
    });
  }

  /**
   * ジョブ統計を取得
   */
  async getJobStats() {
    const sql = `
      SELECT
        queue_name,
        status,
        COUNT(*) as count,
        AVG(priority) as avg_priority
      FROM notification_jobs
      GROUP BY queue_name, status
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        const stats = {
          totalJobs: rows.reduce((sum, row) => sum + row.count, 0),
          byQueue: {},
          byStatus: {}
        };

        rows.forEach(row => {
          if (!stats.byQueue[row.queue_name]) {
            stats.byQueue[row.queue_name] = { total: 0, byStatus: {} };
          }
          stats.byQueue[row.queue_name].total += row.count;
          stats.byQueue[row.queue_name].byStatus[row.status] = row.count;

          if (!stats.byStatus[row.status]) {
            stats.byStatus[row.status] = 0;
          }
          stats.byStatus[row.status] += row.count;
        });

        resolve(stats);
      });
    });
  }

  /**
   * 失敗したジョブをリトライ
   */
  async retryFailedJobs(queueName = 'default', maxRetries = 3) {
    const sql = `
      UPDATE notification_jobs
      SET status = 'pending', retry_count = 0, error_message = NULL,
          updated_at = datetime('now')
      WHERE queue_name = ? AND status = 'failed' AND retry_count < ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [queueName, maxRetries], function(err) {
        if (err) return reject(err);

        logger.info('[NotificationJobQueue] Failed jobs retried', {
          queueName,
          retriedCount: this.changes
        });

        resolve({ retriedCount: this.changes });
      });
    });
  }

  /**
   * 古いジョブをクリーンアップ
   */
  async cleanupOldJobs(daysOld = 7) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      DELETE FROM notification_jobs
      WHERE status IN ('completed', 'cancelled', 'failed')
      AND created_at < ?
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [cutoffDate], function(err) {
        if (err) return reject(err);

        logger.info('[NotificationJobQueue] Old jobs cleaned up', {
          deletedCount: this.changes,
          cutoffDate
        });

        resolve({ deletedCount: this.changes });
      });
    });
  }
}

module.exports = NotificationJobQueue;
