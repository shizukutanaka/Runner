/**
 * Migration: Add advanced user features
 * Version: 20231201130000
 * Description: Add advanced user management features including roles, permissions, and audit trails
 */

module.exports = {
  up: async (db) => {
    console.log('Migration add_advanced_user_features: up');

    // ロールと権限テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions TEXT NOT NULL, -- JSON array of permissions
        color TEXT,
        is_system BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // デフォルトロールの作成
    db.run(`
      INSERT OR IGNORE INTO roles (id, name, description, permissions, color, is_system)
      VALUES
        ('admin', '管理者', 'システム管理者', '["admin", "moderate", "manage_users", "view_analytics", "system_config"]', '#ff0000', 1),
        ('moderator', 'モデレーター', 'コンテンツモデレーター', '["moderate", "view_analytics"]', '#ff9800', 1),
        ('user', 'ユーザー', '一般ユーザー', '["comment", "view"]', '#4caf50', 1)
    `);

    // ユーザー権限テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        granted_by TEXT,
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (granted_by) REFERENCES users(id),
        UNIQUE(user_id, permission, resource_type, resource_id)
      )
    `);

    // 監査ログテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 通知テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        is_read BOOLEAN DEFAULT 0,
        read_at DATETIME,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // ユーザーアクティビティテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS user_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // レート制限テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT NOT NULL, -- IP address or user ID
        endpoint TEXT NOT NULL,
        request_count INTEGER DEFAULT 1,
        window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        window_end DATETIME,
        is_blocked BOOLEAN DEFAULT 0,
        UNIQUE(identifier, endpoint, window_start)
      )
    `);

    // システム設定テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json', 'array')),
        description TEXT,
        is_public BOOLEAN DEFAULT 0,
        is_encrypted BOOLEAN DEFAULT 0,
        validation_rules TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key)
      )
    `);

    // インデックスの作成
    db.run('CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)');
    db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)');
    db.run('CREATE INDEX IF NOT EXISTS idx_user_activities_user ON user_activities(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier)');
    db.run('CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category)');

    // デフォルトのシステム設定を挿入
    db.run(`
      INSERT OR IGNORE INTO system_settings (category, key, value, type, description, is_public)
      VALUES
        ('general', 'site_name', 'YouTube & Twitch Comment Manager', 'string', 'サイト名', 1),
        ('general', 'site_description', 'YouTubeとTwitchのコメントを統合管理', 'string', 'サイト説明', 1),
        ('general', 'maintenance_mode', 'false', 'boolean', 'メンテナンスモード', 0),
        ('security', 'max_login_attempts', '5', 'number', '最大ログイン試行回数', 0),
        ('security', 'lockout_duration', '300', 'number', 'ロックアウト時間（秒）', 0),
        ('rate_limit', 'comments_per_minute', '30', 'number', '1分あたりのコメント数制限', 0),
        ('rate_limit', 'api_requests_per_hour', '1000', 'number', '1時間あたりのAPIリクエスト制限', 0),
        ('features', 'ai_moderation_enabled', 'true', 'boolean', 'AIモデレーション有効化', 0),
        ('features', 'auto_translation_enabled', 'false', 'boolean', '自動翻訳有効化', 0),
        ('features', 'analytics_enabled', 'true', 'boolean', 'アナリティクス有効化', 0)
    `);

    console.log('Advanced user features tables created successfully');
    return true;
  },

  down: async (db) => {
    console.log('Migration add_advanced_user_features: down');

    // テーブルの削除（逆順）
    const tables = [
      'system_settings',
      'rate_limits',
      'user_activities',
      'notifications',
      'audit_logs',
      'user_permissions',
      'roles'
    ];

    for (const table of tables) {
      db.run(`DROP TABLE IF EXISTS ${table}`);
    }

    console.log('Advanced user features tables dropped successfully');
    return true;
  }
};
