/**
 * マルチテナント管理コントローラー
 * テナントの作成、管理、データ分離を担当
 */

const db = require('../db');
const crypto = require('crypto');
const logger = require('../logger');

// テナント作成
exports.createTenant = async (req, res, next) => {
  try {
    const {
      name,
      domain,
      description,
      maxUsers,
      maxCommentsPerDay,
      features,
      settings
    } = req.body;

    // バリデーション
    if (!name || !domain) {
      return next({
        status: 400,
        message: 'テナント名とドメインは必須です'
      });
    }

    // ドメインの重複チェック
    const existingTenant = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM tenants WHERE domain = ?', [domain], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingTenant) {
      return next({
        status: 409,
        message: 'このドメインは既に使用されています'
      });
    }

    // テナントIDの生成
    const tenantId = crypto.randomUUID();
    const apiKey = crypto.randomBytes(32).toString('hex');

    const tenantData = {
      id: tenantId,
      name,
      domain,
      description: description || '',
      apiKey,
      maxUsers: maxUsers || 100,
      maxCommentsPerDay: maxCommentsPerDay || 10000,
      features: JSON.stringify(features || {
        aiModeration: true,
        analytics: true,
        export: true,
        customThemes: false,
        apiAccess: true
      }),
      settings: JSON.stringify(settings || {
        theme: 'default',
        language: 'ja',
        timezone: 'Asia/Tokyo',
        moderation: {
          autoModeration: true,
          spamThreshold: 0.8,
          offensiveThreshold: 0.9
        }
      }),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // データベースにテナントを作成
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO tenants (
          id, name, domain, description, api_key, max_users,
          max_comments_per_day, features, settings, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tenantData.id,
        tenantData.name,
        tenantData.domain,
        tenantData.description,
        tenantData.apiKey,
        tenantData.maxUsers,
        tenantData.maxCommentsPerDay,
        tenantData.features,
        tenantData.settings,
        tenantData.status,
        tenantData.createdAt,
        tenantData.updatedAt
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // デフォルトの管理者ユーザーを作成
    const adminUserId = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO users (
          id, tenant_id, username, email, display_name, role,
          status, settings, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        adminUserId,
        tenantId,
        'admin',
        `${domain}@admin.local`, // 実際のメールアドレスは後で設定
        '管理者',
        'admin',
        'active',
        JSON.stringify({ theme: 'default', notifications: true }),
        new Date().toISOString(),
        new Date().toISOString()
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // テナント用のデータベーススキーマを作成（SQLiteの場合）
    await createTenantDatabase(tenantId);

    logger.info(`Tenant created: ${tenantId} - ${name} (${domain})`);

    res.status(201).json({
      status: 201,
      data: {
        id: tenantData.id,
        name: tenantData.name,
        domain: tenantData.domain,
        apiKey: tenantData.apiKey,
        status: tenantData.status,
        createdAt: tenantData.createdAt
      },
      message: 'テナントが作成されました'
    });

  } catch (error) {
    logger.error('Error creating tenant:', error);
    next({
      status: 500,
      message: 'テナントの作成に失敗しました',
      details: error.message
    });
  }
};

// テナント情報取得
exports.getTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          id, name, domain, description, max_users,
          max_comments_per_day, features, settings, status,
          created_at, updated_at
        FROM tenants
        WHERE id = ?
      `, [tenantId], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Tenant not found'));
        else resolve(row);
      });
    });

    // 使用状況の統計を取得
    const stats = await getTenantStats(tenantId);

    res.json({
      status: 200,
      data: {
        ...tenant,
        stats,
        features: JSON.parse(tenant.features),
        settings: JSON.parse(tenant.settings)
      },
      message: 'テナント情報を取得しました'
    });

  } catch (error) {
    if (error.message === 'Tenant not found') {
      next({ status: 404, message: 'テナントが見つかりません' });
    } else {
      logger.error('Error getting tenant:', error);
      next({
        status: 500,
        message: 'テナント情報の取得に失敗しました',
        details: error.message
      });
    }
  }
};

// テナント一覧取得
exports.getTenants = async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        id, name, domain, description, max_users,
        max_comments_per_day, status, created_at, updated_at
      FROM tenants
    `;
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tenants = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 各テナントの統計情報を取得
    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const stats = await getTenantStats(tenant.id);
        return { ...tenant, stats };
      })
    );

    res.json({
      status: 200,
      data: tenantsWithStats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: tenants.length
      },
      message: 'テナント一覧を取得しました'
    });

  } catch (error) {
    logger.error('Error getting tenants:', error);
    next({
      status: 500,
      message: 'テナント一覧の取得に失敗しました',
      details: error.message
    });
  }
};

// テナント更新
exports.updateTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const updateData = req.body;

    // 更新可能なフィールド
    const allowedFields = [
      'name', 'description', 'maxUsers', 'maxCommentsPerDay',
      'features', 'settings', 'status'
    ];

    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(updateData[field]);
      }
    }

    if (updates.length === 0) {
      return next({
        status: 400,
        message: '更新するフィールドがありません'
      });
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(tenantId);

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`,
        params,
        function(err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Tenant not found'));
          else resolve();
        }
      );
    });

    logger.info(`Tenant updated: ${tenantId}`);
    res.json({
      status: 200,
      message: 'テナントが更新されました'
    });

  } catch (error) {
    if (error.message === 'Tenant not found') {
      next({ status: 404, message: 'テナントが見つかりません' });
    } else {
      logger.error('Error updating tenant:', error);
      next({
        status: 500,
        message: 'テナントの更新に失敗しました',
        details: error.message
      });
    }
  }
};

// テナント削除
exports.deleteTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    // テナントの存在確認
    const tenant = await new Promise((resolve, reject) => {
      db.get('SELECT id, status FROM tenants WHERE id = ?', [tenantId], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Tenant not found'));
        else resolve(row);
      });
    });

    if (tenant.status === 'active') {
      return next({
        status: 400,
        message: 'アクティブなテナントは削除できません。まず無効化してください。'
      });
    }

    // トランザクションで削除
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // テナントに関連するデータを削除
        const tables = [
          'users', 'comments', 'moderation_logs', 'comment_reactions',
          'comment_tags', 'comment_edit_history', 'ai_moderation_logs',
          'analytics', 'sessions', 'user_settings', 'settings'
        ];

        let completed = 0;
        const total = tables.length + 1; // +1 for tenant deletion

        const checkComplete = () => {
          completed++;
          if (completed === total) {
            db.run('COMMIT', (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        };

        // 各テーブルからテナントデータを削除
        tables.forEach(table => {
          db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId], checkComplete);
        });

        // テナントを削除
        db.run('DELETE FROM tenants WHERE id = ?', [tenantId], checkComplete);
      });
    });

    logger.info(`Tenant deleted: ${tenantId}`);
    res.json({
      status: 200,
      message: 'テナントが削除されました'
    });

  } catch (error) {
    if (error.message === 'Tenant not found') {
      next({ status: 404, message: 'テナントが見つかりません' });
    } else {
      logger.error('Error deleting tenant:', error);
      next({
        status: 500,
        message: 'テナントの削除に失敗しました',
        details: error.message
      });
    }
  }
};

// テナントAPIキー再生成
exports.regenerateApiKey = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const newApiKey = crypto.randomBytes(32).toString('hex');

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE tenants SET api_key = ?, updated_at = ? WHERE id = ?',
        [newApiKey, new Date().toISOString(), tenantId],
        function(err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Tenant not found'));
          else resolve();
        }
      );
    });

    logger.info(`API key regenerated for tenant: ${tenantId}`);
    res.json({
      status: 200,
      data: { apiKey: newApiKey },
      message: 'APIキーが再生成されました'
    });

  } catch (error) {
    if (error.message === 'Tenant not found') {
      next({ status: 404, message: 'テナントが見つかりません' });
    } else {
      logger.error('Error regenerating API key:', error);
      next({
        status: 500,
        message: 'APIキーの再生成に失敗しました',
        details: error.message
      });
    }
  }
};

// テナント使用状況取得
exports.getTenantUsage = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { period = '24h' } = req.query;

    // 期間の計算
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case '1h':
        startDate.setHours(now.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 1);
    }

    const usage = await getTenantStats(tenantId, startDate, now);

    res.json({
      status: 200,
      data: {
        tenantId,
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        ...usage
      },
      message: 'テナント使用状況を取得しました'
    });

  } catch (error) {
    logger.error('Error getting tenant usage:', error);
    next({
      status: 500,
      message: 'テナント使用状況の取得に失敗しました',
      details: error.message
    });
  }
};

// テナントの統計情報を取得
async function getTenantStats(tenantId, startDate = null, endDate = null) {
  const now = new Date();
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const stats = await new Promise((resolve, reject) => {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND status = 'active') as active_users,
        (SELECT COUNT(*) FROM comments WHERE tenant_id = ? AND created_at >= ?) as total_comments,
        (SELECT COUNT(*) FROM comments WHERE tenant_id = ? AND created_at >= ? AND status = 'moderated') as moderated_comments,
        (SELECT COUNT(DISTINCT user) FROM comments WHERE tenant_id = ? AND created_at >= ?) as unique_users,
        (SELECT COUNT(*) FROM comments WHERE tenant_id = ? AND created_at >= ? AND platform = 'youtube') as youtube_comments,
        (SELECT COUNT(*) FROM comments WHERE tenant_id = ? AND created_at >= ? AND platform = 'twitch') as twitch_comments,
        (SELECT AVG(LENGTH(content)) FROM comments WHERE tenant_id = ? AND created_at >= ?) as avg_content_length
    `;

    const params = [
      tenantId, tenantId, start.toISOString(),
      tenantId, start.toISOString(),
      tenantId, start.toISOString(),
      tenantId, start.toISOString(),
      tenantId, start.toISOString(),
      tenantId, start.toISOString()
    ];

    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || {});
    });
  });

  return stats;
}

// テナント用のデータベーススキーマを作成
async function createTenantDatabase(tenantId) {
  // SQLiteの場合、テナントIDをプレフィックスとして使用
  // 実際のマルチテナント実装では、別データベースやスキーマを使用する

  // テナント用のテーブルにtenant_idカラムを追加
  const tables = [
    'comments',
    'users',
    'moderation_logs',
    'comment_reactions',
    'comment_tags',
    'comment_edit_history',
    'ai_moderation_logs',
    'analytics',
    'sessions',
    'user_settings',
    'settings'
  ];

  for (const table of tables) {
    // テナントIDカラムが存在しない場合は追加
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

// テナント認証ミドルウェア
exports.authenticateTenant = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return next({
        status: 401,
        message: 'APIキーが必要です'
      });
    }

    const tenant = await new Promise((resolve, reject) => {
      db.get('SELECT id, name, status, features, settings FROM tenants WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!tenant) {
      return next({
        status: 401,
        message: '無効なAPIキーです'
      });
    }

    if (tenant.status !== 'active') {
      return next({
        status: 403,
        message: 'テナントが無効化されています'
      });
    }

    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      features: JSON.parse(tenant.features),
      settings: JSON.parse(tenant.settings)
    };

    next();

  } catch (error) {
    logger.error('Error authenticating tenant:', error);
    next({
      status: 500,
      message: 'テナント認証に失敗しました',
      details: error.message
    });
  }
};
