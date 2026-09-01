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
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
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
    { name: 'notification_frequency', definition: 'TEXT' },
    { name: 'deletion_reason', definition: 'TEXT' },
    { name: 'deletion_reason_category', definition: 'TEXT' },
    { name: 'deletion_moderator_id', definition: 'TEXT' },
    { name: 'deletion_timestamp', definition: 'DATETIME' },
    { name: 'deletion_evidence', definition: 'TEXT' },
    { name: 'updated_at', definition: 'DATETIME' },
    // R-20: プラットフォーム側の識別子。モデレーション判断をプラットフォームへ
    // 書き戻す（liveChatMessages.delete / liveChatBans.insert）には、対象の
    // メッセージIDと著者チャンネルIDが必須。従来は取込時に捨てていたため、
    // 書き戻し機能を実装しようにも対象を指定できない状態だった
    { name: 'platform_message_id', definition: 'TEXT' },
    { name: 'author_channel_id', definition: 'TEXT' },
    // E-29: 公開範囲（/comments/:id/visibility）とAI閾値
    // （/moderation/ai-threshold/comments/:id）はどちらも mount 済みだが、
    // 参照する列が comments に一つも無く SQLITE_ERROR で必ず500になっていた。
    // 列が無いだけで、ハンドラの読み書きの対応は取れている
    { name: 'visibility', definition: 'TEXT NOT NULL DEFAULT \'public\'' },
    { name: 'allowed_roles', definition: 'TEXT' },
    { name: 'allowed_users', definition: 'TEXT' },
    { name: 'visibility_expires_at', definition: 'DATETIME' },
    { name: 'visibility_moderator_id', definition: 'TEXT' },
    { name: 'visibility_set_at', definition: 'DATETIME' },
    { name: 'ai_threshold_score', definition: 'REAL' },
    { name: 'ai_threshold_enabled', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'ai_threshold_custom_settings', definition: 'TEXT' },
    { name: 'ai_override_moderator_id', definition: 'TEXT' },
    { name: 'ai_override_timestamp', definition: 'DATETIME' }
  ]);
};

// R-28c: 保留メッセージにもプラットフォーム識別子を持たせる。
// これが無いと「保留 → 却下」したメッセージをYouTube上から消せない
// （保留経路だけ書き戻しの対象外という穴が残る）
const ensureHeldMessageColumns = () => {
  ensureColumnDefinitions('held_messages', [
    { name: 'platform_message_id', definition: 'TEXT' },
    { name: 'author_channel_id', definition: 'TEXT' },
    // E-29: 公開範囲（/comments/:id/visibility）とAI閾値
    // （/moderation/ai-threshold/comments/:id）はどちらも mount 済みだが、
    // 参照する列が comments に一つも無く SQLITE_ERROR で必ず500になっていた。
    // 列が無いだけで、ハンドラの読み書きの対応は取れている
    { name: 'visibility', definition: 'TEXT NOT NULL DEFAULT \'public\'' },
    { name: 'allowed_roles', definition: 'TEXT' },
    { name: 'allowed_users', definition: 'TEXT' },
    { name: 'visibility_expires_at', definition: 'DATETIME' },
    { name: 'visibility_moderator_id', definition: 'TEXT' },
    { name: 'visibility_set_at', definition: 'DATETIME' },
    { name: 'ai_threshold_score', definition: 'REAL' },
    { name: 'ai_threshold_enabled', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'ai_threshold_custom_settings', definition: 'TEXT' },
    { name: 'ai_override_moderator_id', definition: 'TEXT' },
    { name: 'ai_override_timestamp', definition: 'DATETIME' },
    // R-32: 保留の発生源。'internal'（本製品の判定）か 'twitch_automod'（Twitch AutoModが保留）。
    // 承認/却下の書き戻し先が変わる（AutoMod経由は削除ではなくALLOW/DENYを返す）ため必要
    { name: 'source', definition: 'TEXT DEFAULT \'internal\'' }
  ]);
};

const ensureNotificationColumns = () => {
  ensureColumnDefinitions('notifications', [
    { name: 'user_id', definition: 'TEXT' },
    { name: 'expires_at', definition: 'DATETIME' }
  ]);
};

const ensureUserColumns = () => {
  ensureColumnDefinitions('users', [
    { name: 'history', definition: 'TEXT DEFAULT \'[]\'' },
    { name: 'ban_until', definition: 'TEXT' },
    { name: 'mute_until', definition: 'TEXT' },
    { name: 'last_comment_at', definition: 'DATETIME' },
    { name: 'notification_frequency', definition: 'TEXT' },
    { name: 'notification_sound_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_desktop_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_email_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_sound_volume', definition: 'INTEGER' },
    { name: 'notification_keywords', definition: 'TEXT' },
    { name: 'notification_filters', definition: 'TEXT' },
    { name: 'external_integration', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'profile_image', definition: 'TEXT' },
    { name: 'bio', definition: 'TEXT' },
    { name: 'language', definition: 'TEXT' },
    { name: 'timezone', definition: 'TEXT' },
    { name: 'subscription', definition: 'TEXT' },
    { name: 'auth_history', definition: 'TEXT DEFAULT \'[]\'' },
    { name: 'two_factor', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'email_verified', definition: 'INTEGER NOT NULL DEFAULT 0' },
    // E-29: PUT /moderation/ai-threshold/users/:id が読み書きする列。
    // comments 側と同じく、mount 済みなのに列が無く必ず500だった
    { name: 'ai_default_threshold', definition: 'REAL' },
    { name: 'ai_threshold_enabled', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'ai_threshold_settings', definition: 'TEXT' }
  ]);
};

// ダッシュボード運用者アカウント自身の通知設定
// （usersテーブルの列は「運用者が管理対象のプラットフォームユーザーの通知設定を操作する」
//   別機能で使用中のため、認証中のaccounts行に対する自己設定はaccountsテーブル側に持たせる）
const ensureAccountColumns = () => {
  ensureColumnDefinitions('accounts', [
    // reset_token_hash〜refresh_token_expiresはCREATE TABLE本体にも書かれているが、
    // CREATE TABLE IF NOT EXISTSは既存テーブルには何も追加しない（no-op）ため、
    // これらの機能が追加される前から存在するaccountsテーブルを持つ既存DBでは
    // 実際には列が無く、パスワードリセット/2FA/リフレッシュトークンが
    // 軒並みSQLITE_ERRORで機能しなかった（ログイン自体が500になるケースを含む）。
    // 新規DBではCREATE TABLE側で既に存在するため、ここでの追加は無害なno-op
    { name: 'reset_token_hash', definition: 'TEXT' },
    { name: 'reset_token_expires', definition: 'DATETIME' },
    { name: 'totp_secret', definition: 'TEXT' },
    { name: 'totp_enabled', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'refresh_token_hash', definition: 'TEXT' },
    { name: 'refresh_token_expires', definition: 'DATETIME' },
    { name: 'notification_email_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_push_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_desktop_enabled', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'notification_types', definition: 'TEXT' }
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

    CREATE TABLE IF NOT EXISTS comment_deletion_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      moderator_id TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      reason_category TEXT,
      evidence TEXT,
      previous_reason TEXT,
      previous_reason_category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE INDEX IF NOT EXISTS idx_comment_deletion_history_comment_id ON comment_deletion_history(comment_id);

    CREATE INDEX IF NOT EXISTS idx_analytics_captured_at ON analytics_snapshots(captured_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT,
      data TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      acknowledged_by TEXT,
      acknowledged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

    CREATE TABLE IF NOT EXISTS culture_profiles (
      channel_key TEXT PRIMARY KEY,
      culture_type TEXT NOT NULL,
      custom_overrides TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ------------------------------------------------------------------
    -- E-29: ルーティング済みなのにテーブルが無く、必ず500になっていた分
    -- ------------------------------------------------------------------
    -- 下の6テーブルは、routes に mount 済みのハンドラが SELECT/INSERT していたが
    -- **スキーマに一度も存在しなかった**。実サーバーで
    -- GET /api/users/timeouts/active を叩くと SQLITE_ERROR で 500 が返る。
    -- 「実装されているが動かない」ではなく「呼べば必ず落ちる」状態だった。
    -- 列はハンドラが実際に読み書きしている列から起こしている。

    -- タイムアウト（一時的な発言停止）。ban/mute と別に、期限と理由を持つ
    CREATE TABLE IF NOT EXISTS user_timeouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      moderator_id TEXT,
      platform TEXT,
      reason TEXT,
      timeout_duration INTEGER,
      timeout_until DATETIME,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_user_timeouts_user ON user_timeouts(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_user_timeouts_until ON user_timeouts(timeout_until);

    CREATE TABLE IF NOT EXISTS user_timeout_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      moderator_id TEXT,
      platform TEXT,
      reason TEXT,
      timeout_duration INTEGER,
      timeout_until DATETIME,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_user_timeout_history_user ON user_timeout_history(user_id);

    -- タイムアウト理由のテンプレート。空でも API は 200 と空配列を返す
    CREATE TABLE IF NOT EXISTS user_timeout_reasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reason_code TEXT NOT NULL UNIQUE,
      reason_text TEXT NOT NULL,
      default_duration INTEGER DEFAULT 300,
      severity INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1
    );

    -- AI閾値の変更履歴（誰がいつ何を変えたか）
    CREATE TABLE IF NOT EXISTS ai_threshold_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT,
      user_id TEXT,
      moderator_id TEXT,
      action TEXT,
      old_threshold REAL,
      new_threshold REAL,
      old_settings TEXT,
      new_settings TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ai_threshold_history_comment ON ai_threshold_history(comment_id);

    -- 外部連携の操作ログ
    CREATE TABLE IF NOT EXISTS external_integration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      service_id TEXT,
      action TEXT,
      status TEXT,
      data TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_external_integration_logs_created ON external_integration_logs(created_at);

    -- ユーザーへのモデレーション履歴（チャンネル活動の集計に使う）
    CREATE TABLE IF NOT EXISTS moderation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      moderator TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_history_target ON moderation_history(target_user, timestamp DESC);

    -- コメントの公開範囲の変更履歴。setCommentVisibility が書き、
    -- getCommentVisibilityHistory が読む。両方 mount 済みだった
    CREATE TABLE IF NOT EXISTS comment_visibility_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      moderator_id TEXT,
      action TEXT,
      old_visibility TEXT,
      new_visibility TEXT,
      old_allowed_roles TEXT,
      new_allowed_roles TEXT,
      old_allowed_users TEXT,
      new_allowed_users TEXT,
      expires_at DATETIME,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_comment_visibility_history_comment
      ON comment_visibility_history(comment_id, created_at DESC);

    -- 監視設定の永続化。updateMonitoringSettings が
    -- INSERT OR REPLACE INTO system_settings (category, key, value, type, updated_at)
    -- で書く形に合わせている（読み側は E-29 でこの形に直した）
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      type TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, key)
    );
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
    ensureHeldMessageColumns();
    ensureNotificationColumns();
    ensureAccountColumns();
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
    // テスト環境では process.exit するとJestランナー全体が即死し、
    // 無関係なスイートまで巻き込んで落ちる（テスト後のハンドルclose起因の
    // SQLITE_MISUSE でも発生する）。本番のみ異常終了させる。
    if (process.env.NODE_ENV !== 'test') process.exit(1);
  }
})();

module.exports = db;
// Promise版のヘルパ。各コントローラがそれぞれ同じ3行のラッパーを private に
// 抱えている状態だったため、サービス層から使えるよう共通の入口をここに置く
// （既存のローカル定義は挙動が同一なのでそのままにしてある）
module.exports.dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function callback(err) {
    if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
  });
});
module.exports.dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
module.exports.dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
module.exports.closeDatabase = closeDatabase;
module.exports.runInTransaction = runInTransaction;
module.exports.getQueryOptimizer = getQueryOptimizer;
module.exports.executeWithMonitoring = executeWithMonitoring;
