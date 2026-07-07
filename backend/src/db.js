const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const logger = require('./logger');
const { executeWithMonitoring, getQueryOptimizer } = require('./utils/queryOptimizer');
const cron = require('node-cron');

const dbPath = config.database.path;

// データベース接続設定
let db;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 1000;

// トランザクションヘルパー
const runInTransaction = async (callback) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          logger.error('[Database] Failed to begin transaction', { error: err.message });
          return reject(err);
        }

        Promise.resolve(callback())
          .then((result) => {
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                logger.error('[Database] Failed to commit transaction', { error: commitErr.message });
                return reject(commitErr);
              }
              resolve(result);
            });
          })
          .catch((error) => {
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                logger.error('[Database] Failed to rollback transaction', { error: rollbackErr.message });
              }
              reject(error);
            });
          });
      });
    });
  });
};

const connectDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        logger.error('[Database] Connection error', {
          error: err.message,
          stack: err.stack,
          attempt: connectionAttempts + 1
        });
        reject(err);
      } else {
        logger.info('[Database] Connected', { path: dbPath });

        // パフォーマンス最適化設定
        db.configure('busyTimeout', 10000); // 10秒のビジータイムアウト（増加）

        // PRAGMAを順次実行
        const pragmas = [
          'PRAGMA journal_mode = WAL',       // Write-Ahead Loggingモード
          'PRAGMA synchronous = NORMAL',      // バランスの取れた同期モード
          'PRAGMA foreign_keys = ON',         // 外部キー制約を有効化（OWASP推奨）
          'PRAGMA cache_size = -64000',       // 64MBのキャッシュ（負の値はKB単位）
          'PRAGMA temp_store = MEMORY',       // メモリに一時データ保存
          'PRAGMA mmap_size = 268435456',     // 256MBのメモリマップ
          'PRAGMA page_size = 4096',          // 4KBページサイズ
          'PRAGMA auto_vacuum = INCREMENTAL'  // インクリメンタル自動バキューム
        ];

        const executePragmas = (index = 0) => {
          if (index >= pragmas.length) {
            return resolve(db);
          }

          db.run(pragmas[index], (pragmaErr) => {
            if (pragmaErr) {
              logger.warn(`[Database] Failed to set pragma: ${pragmas[index]}`, { error: pragmaErr.message });
            }
            executePragmas(index + 1);
          });
        };

        executePragmas();
      }
    });
  });
};

// データベース接続のリトライロジック
const initializeDatabaseWithRetry = async () => {
  while (connectionAttempts < MAX_RETRY_ATTEMPTS) {
    try {
      await connectDatabase();
      connectionAttempts = 0; // 成功したらカウンターリセット
      return;
    } catch (err) {
      connectionAttempts++;
      if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
        logger.error('[Database] Max retry attempts reached. Exiting.', { error: err.message });
        process.exit(1);
      }
      logger.warn(`[Database] Retrying connection in ${RETRY_DELAY}ms...`, {
        attempt: connectionAttempts
      });
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
};

// エラーハンドラー
const handleDatabaseError = (err) => {
  logger.error('[Database] Unexpected error', { error: err.message, stack: err.stack });

  // 致命的なエラーの場合は再接続を試みる
  if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
    logger.warn('[Database] Database locked, will retry automatically');
  } else if (err.code === 'SQLITE_CORRUPT') {
    logger.error('[Database] Database corruption detected. Manual intervention required.');
    process.exit(1);
  }
};

const ensureColumnDefinitions = (table, columns) => {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) {
      logger.error('[Database] Failed to inspect table schema', {
        table,
        error: err.message,
        stack: err.stack
      });
      return;
    }

    const existing = new Set(rows.map((row) => row.name));
    columns.forEach(({ name, definition }) => {
      if (existing.has(name)) {
        return;
      }

      db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`, (alterErr) => {
        if (alterErr) {
          logger.error('[Database] Failed to add missing column', {
            table,
            column: name,
            error: alterErr.message,
            stack: alterErr.stack
          });
          return;
        }

        logger.info('[Database] Added missing column', { table, column: name });
      });
    });
  });
};

const ensureCommentColumns = () => {
  ensureColumnDefinitions('comments', [
    { name: 'moderation_score', definition: 'REAL' },
    { name: 'avatar_url', definition: 'TEXT' },
    { name: 'background_color', definition: 'TEXT' },
    { name: 'highlight', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'pinned', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'auto_archive', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'external_shared', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'notification_frequency', definition: 'TEXT' }
  ]);
};

const ensureUserColumns = () => {
  ensureColumnDefinitions('users', [
    { name: 'history', definition: "TEXT DEFAULT '[]'" },
    { name: 'ban_until', definition: 'TEXT' },
    { name: 'mute_until', definition: 'TEXT' },
    { name: 'notification_frequency', definition: 'TEXT' },
    { name: 'external_integration', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'profile_image', definition: 'TEXT' },
    { name: 'bio', definition: 'TEXT' },
    { name: 'language', definition: 'TEXT' },
    { name: 'timezone', definition: 'TEXT' },
    { name: 'subscription', definition: 'TEXT' },
    { name: 'auth_history', definition: "TEXT DEFAULT '[]'" },
    { name: 'two_factor', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'email_verified', definition: 'INTEGER NOT NULL DEFAULT 0' }
  ]);
};

// データベース初期化
const initializeDB = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      user TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      status TEXT DEFAULT 'active',
      moderation_reason TEXT,
      moderation_timestamp DATETIME,
      moderator TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_comments_platform ON comments(platform);
    CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user);
    CREATE INDEX IF NOT EXISTS idx_comments_timestamp ON comments(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
    CREATE INDEX IF NOT EXISTS idx_comments_platform_status ON comments(platform, status);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      warning_count INTEGER DEFAULT 0,
      ban_until DATETIME,
      mute_until DATETIME,
      history TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_platform_status ON users(platform, status);

    -- モデレーター/管理者のダッシュボードアカウント（プラットフォーム上のコメント投稿者=usersテーブルとは別概念）
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'moderator',
      status TEXT NOT NULL DEFAULT 'active',
      reset_token_hash TEXT,
      reset_token_expires DATETIME,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      refresh_token_hash TEXT,
      refresh_token_expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

    CREATE TABLE IF NOT EXISTS moderation_settings (
      platform TEXT PRIMARY KEY,
      thresholds TEXT,
      banned_words TEXT,
      regex_patterns TEXT,
      last_updated DATETIME
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at DATETIME NOT NULL,
      total_comments INTEGER NOT NULL DEFAULT 0,
      active_comments INTEGER NOT NULL DEFAULT 0,
      hidden_comments INTEGER NOT NULL DEFAULT 0,
      muted_comments INTEGER NOT NULL DEFAULT 0,
      total_users INTEGER NOT NULL DEFAULT 0,
      banned_users INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan_id TEXT,
      status TEXT,
      current_period_start DATETIME,
      current_period_end DATETIME,
      cancel_at DATETIME,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON user_subscriptions(plan_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      level TEXT NOT NULL DEFAULT 'info',
      read INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

    CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS comment_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS comment_edit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      previous_content TEXT NOT NULL,
      edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      editor_id TEXT,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS ai_moderation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      ai_score REAL NOT NULL,
      ai_decision TEXT NOT NULL,
      confidence REAL NOT NULL,
      processing_time INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS held_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      content TEXT NOT NULL,
      user TEXT NOT NULL,
      platform TEXT NOT NULL,
      hold_reason TEXT,
      risk_score REAL,
      hold_level TEXT,
      reasons TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      hold_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      processed_by TEXT,
      process_reason TEXT,
      process_notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_held_messages_status ON held_messages(status);
    CREATE INDEX IF NOT EXISTS idx_held_messages_created_at ON held_messages(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_analytics_captured_at ON analytics_snapshots(captured_at DESC);
  `;

  try {
    await new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          logger.error('[Database] Initialization error', { error: err.message, stack: err.stack });
          handleDatabaseError(err);
          reject(err);
        } else {
          logger.info('[Database] Initialization complete');
          resolve();
        }
      });
    });

    ensureCommentColumns();
    ensureUserColumns();
  } catch (err) {
    logger.error('[Database] Failed to initialize database', { error: err.message });
    throw err;
  }
};

// グレースフルシャットダウンのための接続クローズ
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error('[Database] Error closing database', { error: err.message });
          reject(err);
        } else {
          logger.info('[Database] Connection closed gracefully');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

// データベース最適化: ANALYZE実行
const runAnalyze = () => {
  if (!db) {
    logger.warn('[Database] Cannot run ANALYZE - database not initialized');
    return;
  }

  db.run('ANALYZE', (err) => {
    if (err) {
      logger.error('[Database] Failed to run ANALYZE', { error: err.message });
    } else {
      logger.info('[Database] ANALYZE completed successfully - query planner statistics updated');
    }
  });
};

// 定期的なデータベース最適化スケジュール
const scheduleDatabaseOptimization = () => {
  // 毎日深夜2時にANALYZEを実行（日本時間基準）
  cron.schedule('0 2 * * *', () => {
    logger.info('[Database] Starting scheduled ANALYZE optimization');
    runAnalyze();
  }, {
    timezone: 'Asia/Tokyo'
  });

  logger.info('[Database] Scheduled daily ANALYZE at 2:00 AM JST');
};

// データベース初期化（非同期）
(async () => {
  try {
    await initializeDatabaseWithRetry();
    await initializeDB();

    // 初回起動時にもANALYZEを実行
    logger.info('[Database] Running initial ANALYZE optimization');
    runAnalyze();

    // 定期実行スケジュール開始
    scheduleDatabaseOptimization();
  } catch (err) {
    logger.error('[Database] Fatal initialization error', { error: err.message });
    process.exit(1);
  }
})();

module.exports = db;
module.exports.closeDatabase = closeDatabase;
module.exports.runInTransaction = runInTransaction;
module.exports.getQueryOptimizer = getQueryOptimizer;
module.exports.executeWithMonitoring = executeWithMonitoring;
