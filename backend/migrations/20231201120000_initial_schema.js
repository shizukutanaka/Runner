/**
 * Migration: Initial database schema
 * Version: 20231201120000
 * Description: Create initial database tables for YouTube & Twitch Comment Manager
 */

module.exports = {
  up: async (db) => {
    console.log('Migration initial_schema: up');

    // コメントテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        user TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('youtube', 'twitch')),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'moderated', 'deleted')),
        parent_id TEXT,
        likes INTEGER DEFAULT 0,
        dislikes INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES comments(id)
      )
    `);

    // ユーザーテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        platform TEXT NOT NULL CHECK (platform IN ('youtube', 'twitch', 'system')),
        role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'banned', 'muted')),
        settings TEXT,
        last_activity DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // モデレーションログテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        moderator_id TEXT,
        action TEXT NOT NULL CHECK (action IN ('approve', 'hide', 'delete', 'ban', 'mute')),
        reason TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id),
        FOREIGN KEY (moderator_id) REFERENCES users(id)
      )
    `);

    // 設定テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        user_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // ユーザー設定テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // コメントリアクションテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reaction_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(comment_id, user_id, reaction_type)
      )
    `);

    // コメントタグテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS comment_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id),
        UNIQUE(comment_id, tag)
      )
    `);

    // コメント編集履歴テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS comment_edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        previous_content TEXT NOT NULL,
        edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        editor_id TEXT,
        FOREIGN KEY (comment_id) REFERENCES comments(id),
        FOREIGN KEY (editor_id) REFERENCES users(id)
      )
    `);

    // AIモデレーションログテーブル
    db.run(`
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
      )
    `);

    // 統計テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        platform TEXT NOT NULL,
        total_comments INTEGER DEFAULT 0,
        moderated_comments INTEGER DEFAULT 0,
        unique_users INTEGER DEFAULT 0,
        top_users TEXT,
        top_words TEXT,
        sentiment_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, platform)
      )
    `);

    // セッションテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // バックアップテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        restored_at DATETIME,
        status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'restored'))
      )
    `);

    // インデックスの作成
    db.run('CREATE INDEX IF NOT EXISTS idx_comments_platform_timestamp ON comments(platform, timestamp DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user)');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform)');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_moderation_logs_comment ON moderation_logs(comment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comment_tags_comment ON comment_tags(comment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_ai_moderation_logs_comment ON ai_moderation_logs(comment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_analytics_date_platform ON analytics(date, platform)');
    db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');

    console.log('All tables and indexes created successfully');
    return true;
  },

  down: async (db) => {
    console.log('Migration initial_schema: down');

    // テーブルの削除（逆順）
    const tables = [
      'comment_reactions',
      'comment_tags',
      'comment_edit_history',
      'ai_moderation_logs',
      'moderation_logs',
      'comments',
      'sessions',
      'user_settings',
      'settings',
      'backups',
      'analytics',
      'users'
    ];

    for (const table of tables) {
      db.run(`DROP TABLE IF EXISTS ${table}`);
    }

    // マイグレーションテーブルの削除
    db.run('DROP TABLE IF EXISTS schema_migrations');

    console.log('All tables dropped successfully');
    return true;
  }
};
