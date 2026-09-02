const db = require('../../src/db');
const Joi = require('joi');
const validator = require('validator');
const { logDataMod } = require('../services/advancedAuditLogService');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../logger');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});

const sanitizeToStorage = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return validator.stripLow(value.trim(), true);
};

const sanitizeForResponse = (value) => {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  return validator.escape(value);
};

const idSchema = Joi.string().trim().min(1).max(64).required();
const frequencySchema = Joi.string().trim().max(50).required();
const booleanSchema = Joi.boolean().required();
const optionalStringSchema = Joi.string().trim().max(2000).allow(null, '').optional();
const imageUrlSchema = Joi.string().trim().uri({ allowRelative: false }).max(2048).required();
const languageSchema = Joi.string().trim().max(10).required();
const timezoneSchema = Joi.string().trim().max(50).required();
const subscriptionSchema = Joi.string().trim().max(100).allow(null, '').optional();

const validateId = (id) => {
  const { error } = idSchema.validate(id);
  if (error) {
    const err = new Error('Invalid user identifier');
    err.status = 400;
    err.details = error.details;
    throw err;
  }
};

// プラットフォームユーザー一覧取得（検索・フィルタ・ページネーション対応）
exports.listUsers = asyncHandler(async (req, res) => {
  const { platform, status, search, limit = 50, offset = 0 } = req.query;

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const conditions = [];
  const params = [];

  if (platform) {
    conditions.push('platform = ?');
    params.push(platform);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('username LIKE ?');
    params.push(`%${sanitizeToStorage(search)}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await dbAll(
    `SELECT id, platform, username, status, warning_count, ban_until, mute_until
     FROM users ${whereClause} ORDER BY username ASC LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  const totalRow = await dbGet(`SELECT COUNT(*) as cnt FROM users ${whereClause}`, params);

  const sanitizedUsers = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sanitizeForResponse(value)]))
  );

  res.json({
    status: 200,
    data: {
      users: sanitizedUsers,
      total: totalRow?.cnt || 0,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + rows.length < (totalRow?.cnt || 0)
      }
    },
    message: 'Users fetched'
  });
});

exports.getUser = (req, res, next) => {
  const { id } = req.params;
  validateId(id);
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    if (!row) return next({ status: 404, message: 'User not found' });
    const sanitizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sanitizeForResponse(value)]));
    res.json({ status: 200, data: sanitizedRow, message: 'User fetched' });
  });
};

exports.updateUser = (req, res, next) => {
  const { id } = req.params;
  validateId(id);
  const { action, duration, reason } = req.body;
  let status = action;
  let banUntil = null;
  let muteUntil = null;
  if (action === 'ban') banUntil = new Date(Date.now() + (duration || 3600) * 1000).toISOString();
  if (action === 'mute') muteUntil = new Date(Date.now() + (duration || 300) * 1000).toISOString();
  const sql = 'UPDATE users SET status = ?, ban_until = ?, mute_until = ? WHERE id = ?';
  db.run(sql, [status, banUntil, muteUntil, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'status_update', id, { status, banUntil, muteUntil, reason: sanitizeToStorage(reason) });

    // R-28b: BAN をプラットフォーム側へ書き戻す。
    // これが無いと「ダッシュボードではBAN済みだが、当人は配信で発言し続けられる」
    // という状態になる（R-20の第一原理分析で発見した欠落の後半）。
    // 対象ユーザーのチャンネルIDは users には無いため、直近コメントから引く。
    // OAuth未設定/チャンネルID不明/配信監視なしのいずれでもローカルBANは維持する
    if (action !== 'ban') {
      return res.json({ status: 200, data: null, message: 'User updated' });
    }
    db.get(
      'SELECT author_channel_id FROM comments WHERE (user = ? OR user = (SELECT username FROM users WHERE id = ?)) AND platform = \'youtube\' AND author_channel_id IS NOT NULL ORDER BY timestamp DESC LIMIT 1',
      [id, id],
      async (lookupErr, row) => {
        let platformBan = { attempted: false, ok: false, reason: 'author_channel_id_unknown' };
        if (!lookupErr && row?.author_channel_id) {
          try {
            // eslint-disable-next-line global-require
            const youtubeIngestionService = require('../services/youtubeIngestionService');
            platformBan = await youtubeIngestionService.banUserOnActiveChats(row.author_channel_id, {
              type: banUntil ? 'temporary' : 'permanent',
              durationSeconds: duration || 3600
            });
          } catch (banErr) {
            platformBan = { attempted: true, ok: false, reason: 'error', error: banErr.message };
          }
        }
        if (!platformBan.ok) {
          logger.warn('[Users] Local ban applied but platform write-back did not', { id, reason: platformBan.reason });
        }
        res.json({
          status: 200,
          data: { platformBan },
          message: platformBan.ok ? 'User banned locally and on the platform' : 'User updated (platform ban not applied)'
        });
      }
    );
  });
};

exports.getUserHistory = (req, res, next) => {
  const { id } = req.params;
  validateId(id);
  db.get('SELECT history FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    if (!row) return next({ status: 404, message: 'User not found' });
    try {
      const history = JSON.parse(row.history || '[]');
      res.json({ status: 200, data: history, message: 'User history fetched' });
    } catch (err) {
      next({ status: 500, message: 'Failed to parse history', details: err });
    }
  });
};

// ユーザーごとの通知頻度設定
exports.setNotificationFrequency = (req, res, next) => {
  const { id } = req.params;
  const { frequency } = req.body;
  validateId(id);

  const { error, value } = frequencySchema.validate(frequency);
  if (error) {
    return next({ status: 400, message: 'Invalid frequency', details: error.details });
  }

  const sql = 'UPDATE users SET notification_frequency = ? WHERE id = ?';
  db.run(sql, [sanitizeToStorage(value), id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'notification_frequency', id, { frequency: sanitizeToStorage(value) });
    res.json({ status: 200, data: null, message: 'Notification frequency updated' });
  });
};

// ユーザーごとの外部連携ON/OFF
exports.setExternalIntegration = (req, res, next) => {
  const { id } = req.params;
  const { enabled } = req.body;
  validateId(id);

  const { error, value } = booleanSchema.validate(enabled);
  if (error) {
    return next({ status: 400, message: 'enabled must be a boolean', details: error.details });
  }

  const sql = 'UPDATE users SET external_integration = ? WHERE id = ?';
  db.run(sql, [value ? 1 : 0, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'external_integration', id, { enabled: value });
    res.json({ status: 200, data: null, message: 'External integration updated' });
  });
};

// ユーザーごとのプロフィール画像設定
exports.setProfileImage = (req, res, next) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  validateId(id);

  const { error, value } = imageUrlSchema.validate(imageUrl);
  if (error) {
    return next({ status: 400, message: 'imageUrl must be a valid absolute URL up to 2048 characters', details: error.details });
  }

  const sql = 'UPDATE users SET profile_image = ? WHERE id = ?';
  db.run(sql, [sanitizeToStorage(value), id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'profile_image', id, { imageUrl: sanitizeForResponse(value) });
    res.json({ status: 200, data: null, message: 'Profile image updated' });
  });
};

// ユーザーごとの自己紹介文設定
exports.setBio = (req, res, next) => {
  const { id } = req.params;
  const { bio } = req.body;
  validateId(id);

  const { error, value } = optionalStringSchema.validate(bio);
  if (error) {
    return next({ status: 400, message: 'bio must be 2000 characters or fewer', details: error.details });
  }

  const sql = 'UPDATE users SET bio = ? WHERE id = ?';
  db.run(sql, [value ? sanitizeToStorage(value) : null, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'bio', id, { bio: sanitizeToStorage(value) });
    res.json({ status: 200, data: null, message: 'Bio updated' });
  });
};

// ユーザーごとの言語設定
exports.setLanguage = (req, res, next) => {
  const { id } = req.params;
  const { language } = req.body;
  validateId(id);

  const { error, value } = languageSchema.validate(language);
  if (error) {
    return next({ status: 400, message: 'language must be a non-empty string up to 10 characters', details: error.details });
  }

  const normalized = value.toLowerCase();

  const sql = 'UPDATE users SET language = ? WHERE id = ?';
  db.run(sql, [normalized, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'language', id, { language: normalized });
    res.json({ status: 200, data: null, message: 'Language preference updated' });
  });
};

// ユーザーごとのタイムゾーン設定
exports.setTimezone = (req, res, next) => {
  const { id } = req.params;
  const { timezone } = req.body;
  validateId(id);

  const { error, value } = timezoneSchema.validate(timezone);
  if (error) {
    return next({ status: 400, message: 'timezone must be a non-empty string up to 50 characters', details: error.details });
  }

  const sql = 'UPDATE users SET timezone = ? WHERE id = ?';
  db.run(sql, [value, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'timezone', id, { timezone: value });
    res.json({ status: 200, data: null, message: 'Timezone updated' });
  });
};

// ユーザーごとのサブスク状態管理
exports.setSubscription = (req, res, next) => {
  const { id } = req.params;
  const { subscription } = req.body;
  validateId(id);

  const { error, value } = subscriptionSchema.validate(subscription);
  if (error) {
    return next({ status: 400, message: 'subscription must be a string or null up to 100 characters', details: error.details });
  }

  const normalized = value == null || value === '' ? null : value;
  const sql = 'UPDATE users SET subscription = ? WHERE id = ?';
  db.run(sql, [normalized, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'subscription', id, { subscription: normalized });
    res.json({ status: 200, data: null, message: 'Subscription updated' });
  });
};

// ユーザーごとの認証履歴取得
exports.getAuthHistory = (req, res, next) => {
  const { id } = req.params;
  validateId(id);
  db.get('SELECT auth_history FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    if (!row) return next({ status: 404, message: 'User not found' });
    try {
      const history = JSON.parse(row.auth_history || '[]');
      res.json({ status: 200, data: history, message: 'Auth history fetched' });
    } catch (err) {
      next({ status: 500, message: 'Failed to parse auth history', details: err });
    }
  });
};

// ユーザーごとのセキュリティ設定
exports.setSecurity = (req, res, next) => {
  const { id } = req.params;
  const { twoFactor, emailVerification } = req.body;
  validateId(id);

  const boolSchema = Joi.object({
    twoFactor: Joi.boolean().required(),
    emailVerification: Joi.boolean().required()
  });

  const { error, value } = boolSchema.validate({ twoFactor, emailVerification });
  if (error) {
    return next({ status: 400, message: 'twoFactor and emailVerification must both be boolean values', details: error.details });
  }

  const sql = 'UPDATE users SET two_factor = ?, email_verified = ? WHERE id = ?';
  db.run(sql, [value.twoFactor ? 1 : 0, value.emailVerification ? 1 : 0, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'security', id, value);
    res.json({ status: 200, data: null, message: 'Security settings updated' });
  });
};

// ユーザータイムアウト機能
exports.timeoutUser = (req, res, next) => {
  const { id } = req.params;
  const { duration, reason, platform, moderatorId, notes } = req.body;
  validateId(id);

  // バリデーション
  const timeoutSchema = Joi.object({
    duration: Joi.number().integer().min(60).max(604800).required(), // 1分から1週間
    reason: Joi.string().trim().min(1).max(500).required(),
    platform: Joi.string().trim().min(1).max(50).required(),
    moderatorId: Joi.string().trim().min(1).max(64).optional(),
    notes: Joi.string().trim().max(1000).allow('').optional()
  });

  const { error, value } = timeoutSchema.validate({ duration, reason, platform, moderatorId, notes });
  if (error) {
    return next({ status: 400, message: 'Invalid timeout parameters', details: error.details });
  }

  const moderator = value.moderatorId || req.user?.id || 'system';
  const timeoutUntil = new Date(Date.now() + value.duration * 1000).toISOString();

  try {
    // 既存のアクティブタイムアウトを確認
    db.get('SELECT id FROM user_timeouts WHERE user_id = ? AND status = ? AND timeout_until > ?', [id, 'active', new Date().toISOString()], (checkErr, existingTimeout) => {
      if (checkErr) return next({ status: 500, message: 'Database error checking existing timeout', details: checkErr });

      if (existingTimeout) {
        return next({ status: 409, message: 'User already has an active timeout' });
      }

      // 新しいタイムアウトを作成
      const insertSql = `
        INSERT INTO user_timeouts (user_id, moderator_id, platform, reason, timeout_duration, timeout_until, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      db.run(insertSql, [id, moderator, value.platform, value.reason, value.duration, timeoutUntil], function(insertErr) {
        if (insertErr) return next({ status: 500, message: 'Database error creating timeout', details: insertErr });

        // タイムアウト履歴にも記録
        const historySql = `
          INSERT INTO user_timeout_history (user_id, moderator_id, platform, reason, timeout_duration, timeout_until, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        db.run(historySql, [id, moderator, value.platform, value.reason, value.duration, timeoutUntil, 'active'], function(historyErr) {
          if (historyErr) {
            logger.warn('[Timeout] Failed to create timeout history:', historyErr);
            // 履歴作成失敗でもタイムアウト自体は成功として扱う
          }

          // ユーザーのミュート状態を更新（もし必要な場合）
          const updateUserSql = 'UPDATE users SET mute_until = ? WHERE id = ?';
          db.run(updateUserSql, [timeoutUntil, id], function(updateErr) {
            if (updateErr) {
              logger.warn('[Timeout] Failed to update user mute status:', updateErr);
            }

            logDataMod(moderator, 'users', 'timeout', id, {
              duration: value.duration,
              reason: value.reason,
              timeoutUntil,
              platform: value.platform
            });

            res.json({
              status: 200,
              data: {
                timeoutId: this.lastID,
                userId: id,
                moderatorId: moderator,
                duration: value.duration,
                timeoutUntil,
                reason: value.reason,
                platform: value.platform
              },
              message: 'User timeout applied successfully'
            });
          });
        });
      });
    });
  } catch (error) {
    next({ status: 500, message: 'Failed to apply user timeout', details: error });
  }
};

// ユーザータイムアウト解除
exports.removeTimeout = (req, res, next) => {
  const { id } = req.params;
  const { reason, moderatorId, notes } = req.body;
  validateId(id);

  const moderator = moderatorId || req.user?.id || 'system';

  try {
    // アクティブなタイムアウトを取得
    db.get('SELECT * FROM user_timeouts WHERE user_id = ? AND status = ? AND timeout_until > ?',
      [id, 'active', new Date().toISOString()], (selectErr, timeoutRecord) => {
        if (selectErr) return next({ status: 500, message: 'Database error finding timeout', details: selectErr });
        if (!timeoutRecord) return next({ status: 404, message: 'No active timeout found for user' });

        // タイムアウトを解除
        const updateSql = 'UPDATE user_timeouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        db.run(updateSql, ['removed', timeoutRecord.id], function(updateErr) {
          if (updateErr) return next({ status: 500, message: 'Database error removing timeout', details: updateErr });

          // 履歴を更新
          const historySql = 'UPDATE user_timeout_history SET status = ?, ended_at = CURRENT_TIMESTAMP, notes = ? WHERE user_id = ? AND status = ?';
          db.run(historySql, ['removed', notes || '', id, 'active'], function(historyErr) {
            if (historyErr) {
              logger.warn('[Timeout] Failed to update timeout history:', historyErr);
            }

            // ユーザーのミュート状態を解除
            const updateUserSql = 'UPDATE users SET mute_until = NULL WHERE id = ?';
            db.run(updateUserSql, [id], function(userErr) {
              if (userErr) {
                logger.warn('[Timeout] Failed to update user mute status:', userErr);
              }

              logDataMod(moderator, 'users', 'timeout_remove', id, {
                originalTimeoutId: timeoutRecord.id,
                reason: reason || 'Manual removal',
                removedAt: new Date().toISOString()
              });

              res.json({
                status: 200,
                data: {
                  userId: id,
                  timeoutId: timeoutRecord.id,
                  removedAt: new Date().toISOString(),
                  originalTimeoutUntil: timeoutRecord.timeout_until
                },
                message: 'User timeout removed successfully'
              });
            });
          });
        });
      });
  } catch (error) {
    next({ status: 500, message: 'Failed to remove user timeout', details: error });
  }
};

// ユーザーのアクティブタイムアウト取得
exports.getUserTimeout = (req, res, next) => {
  const { id } = req.params;
  validateId(id);

  db.get('SELECT * FROM user_timeouts WHERE user_id = ? AND status = ? AND timeout_until > ?',
    [id, 'active', new Date().toISOString()], (err, timeout) => {
      if (err) return next({ status: 500, message: 'Database error', details: err });

      if (timeout) {
        res.json({
          status: 200,
          data: {
            id: timeout.id,
            userId: timeout.user_id,
            moderatorId: timeout.moderator_id,
            platform: timeout.platform,
            reason: timeout.reason,
            timeoutDuration: timeout.timeout_duration,
            timeoutUntil: timeout.timeout_until,
            createdAt: timeout.created_at
          },
          message: 'Active timeout found'
        });
      } else {
        res.json({
          status: 200,
          data: null,
          message: 'No active timeout found'
        });
      }
    });
};

// ユーザーのタイムアウト履歴取得
exports.getUserTimeoutHistory = (req, res, next) => {
  const { id } = req.params;
  const { limit = 20, offset = 0 } = req.query;
  validateId(id);

  const sql = `
    SELECT * FROM user_timeout_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.all(sql, [id, parseInt(limit), parseInt(offset)], (err, history) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });

    res.json({
      status: 200,
      data: {
        history: history.map((record) => ({
          id: record.id,
          moderatorId: record.moderator_id,
          platform: record.platform,
          reason: record.reason,
          timeoutDuration: record.timeout_duration,
          timeoutUntil: record.timeout_until,
          actualEndTime: record.actual_end_time,
          status: record.status,
          createdAt: record.created_at,
          endedAt: record.ended_at,
          notes: record.notes
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      },
      message: 'User timeout history retrieved'
    });
  });
};

// 全ユーザーのアクティブタイムアウト取得
exports.getAllActiveTimeouts = (req, res, next) => {
  const { platform, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT ut.*, u.username
    FROM user_timeouts ut
    LEFT JOIN users u ON ut.user_id = u.id
    WHERE ut.status = ? AND ut.timeout_until > ?
  `;
  let params = ['active', new Date().toISOString()];

  if (platform) {
    sql += ' AND ut.platform = ?';
    params.push(platform);
  }

  sql += ' ORDER BY ut.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, timeouts) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });

    res.json({
      status: 200,
      data: {
        timeouts: timeouts.map((timeout) => ({
          id: timeout.id,
          userId: timeout.user_id,
          username: timeout.username,
          moderatorId: timeout.moderator_id,
          platform: timeout.platform,
          reason: timeout.reason,
          timeoutDuration: timeout.timeout_duration,
          timeoutUntil: timeout.timeout_until,
          createdAt: timeout.created_at
        })),
        total: timeouts.length,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      },
      message: 'Active timeouts retrieved'
    });
  });
};

// タイムアウト理由テンプレート取得
exports.getTimeoutReasons = (req, res, next) => {
  db.all('SELECT * FROM user_timeout_reasons WHERE enabled = 1 ORDER BY severity DESC, reason_text ASC', (err, reasons) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });

    res.json({
      status: 200,
      data: reasons.map((reason) => ({
        id: reason.id,
        code: reason.reason_code,
        text: reason.reason_text,
        defaultDuration: reason.default_duration,
        severity: reason.severity,
        enabled: reason.enabled === 1
      })),
      message: 'Timeout reasons retrieved'
    });
  });
};

// 期限切れタイムアウトのクリーンアップ
exports.cleanupExpiredTimeouts = (req, res, next) => {
  const currentTime = new Date().toISOString();

  // 期限切れタイムアウトを更新
  const updateSql = 'UPDATE user_timeouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE status = ? AND timeout_until <= ?';
  db.run(updateSql, ['expired', 'active', currentTime], function(updateErr) {
    if (updateErr) return next({ status: 500, message: 'Database error updating expired timeouts', details: updateErr });

    const updatedCount = this.changes;

    // 対応する履歴も更新
    const historySql = 'UPDATE user_timeout_history SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE status = ? AND timeout_until <= ?';
    db.run(historySql, ['expired', 'active', currentTime], function(historyErr) {
      if (historyErr) {
        logger.warn('[Timeout] Failed to update timeout history:', historyErr);
      }

      // ユーザーのミュート状態も解除
      const userSql = 'UPDATE users SET mute_until = NULL WHERE mute_until IS NOT NULL AND mute_until <= ?';
      db.run(userSql, [currentTime], function(userErr) {
        if (userErr) {
          logger.warn('[Timeout] Failed to update user mute status:', userErr);
        }

        res.json({
          status: 200,
          data: {
            expiredTimeouts: updatedCount,
            cleanedAt: new Date().toISOString()
          },
          message: `${updatedCount} expired timeouts cleaned up`
        });
      });
    });
  });
};

// ユーザーの詳細なチャンネル情報と活動履歴を取得（YouTube Channel Activity風）
exports.getUserChannelActivity = (req, res, next) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;
  validateId(id);

  try {
    // ユーザーの基本情報を取得
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, userRow) => {
      if (err) return next({ status: 500, message: 'Database error', details: err });
      if (!userRow) return next({ status: 404, message: 'User not found' });

      // ユーザーのコメント履歴を取得
      const commentQuery = `
        SELECT
          c.content,
          c.platform,
          c.timestamp,
          c.status,
          c.moderation_score,
          CASE WHEN c.status = 'deleted' THEN '[削除済みコメント]' ELSE c.content END as display_content
        FROM comments c
        WHERE c.user = ?
        ORDER BY c.timestamp DESC
        LIMIT ? OFFSET ?
      `;

      db.all(commentQuery, [id, parseInt(limit), parseInt(offset)], (commentErr, commentRows) => {
        if (commentErr) return next({ status: 500, message: 'Failed to fetch comments', details: commentErr });

        // モデレーション履歴を取得。
        //
        // E-36: ここは `moderation_history` テーブルを読んでいたが、
        // **そのテーブルに書き込むコードは製品のどこにも無かった**。
        // つまり昨日BANしたユーザーを開いても
        // 「モデレーション操作 0件 / BAN 0回 / ミュート 0回」と出続ける。
        // 常に空を返す読み取りは、履歴が無いことの証明ではなく、記録の断線である。
        //
        // 履歴は既に `audit_logs` にある（updateUser と timeout 系が logDataMod で
        // 書いている）。書き手の無いテーブルを増やさず、実在する記録を読む。
        const moderationQuery = `
          SELECT action, actor_id, timestamp, metadata
          FROM audit_logs
          WHERE resource_type = 'users'
            AND resource_id = ?
            AND action IN ('users.status_update', 'users.timeout', 'users.timeout_remove')
          ORDER BY timestamp DESC
          LIMIT 20
        `;

        db.all(moderationQuery, [id], (modErr, rawModRows) => {
          if (modErr) return next({ status: 500, message: 'Failed to fetch moderation history', details: modErr });

          // audit_logs の行を、この画面が読む {action, reason, timestamp, moderator} に写す。
          // status_update の実際の操作は metadata.status（ban/mute/warn/active）にある
          const modRows = (rawModRows || []).map((row) => {
            let meta = {};
            try {
              meta = row.metadata ? JSON.parse(row.metadata) : {};
            } catch (parseErr) {
              meta = {};
            }
            const action = row.action === 'users.status_update'
              ? (meta.status || 'status_update')
              : row.action.replace(/^users\./, '');
            return {
              action,
              reason: meta.reason ?? null,
              timestamp: row.timestamp,
              moderator: row.actor_id
            };
          });

          // 統計情報を計算
          const stats = {
            totalComments: 0,
            visibleComments: 0,
            hiddenComments: 0,
            deletedComments: 0,
            flaggedComments: 0,
            averageRiskScore: 0,
            lastActivity: null,
            joinDate: userRow.created_at,
            totalModerationActions: modRows.length,
            banCount: modRows.filter((m) => m.action === 'ban').length,
            muteCount: modRows.filter((m) => m.action === 'mute').length
          };

          // コメント統計を計算
          if (commentRows.length > 0) {
            stats.totalComments = commentRows.length;
            stats.visibleComments = commentRows.filter((c) => c.status === 'visible').length;
            stats.hiddenComments = commentRows.filter((c) => c.status === 'hidden').length;
            stats.deletedComments = commentRows.filter((c) => c.status === 'deleted').length;
            stats.flaggedComments = commentRows.filter((c) => c.status === 'flagged').length;

            const validScores = commentRows
              .filter((c) => c.moderation_score !== null)
              .map((c) => c.moderation_score);
            if (validScores.length > 0) {
              stats.averageRiskScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
            }

            stats.lastActivity = commentRows[0]?.timestamp;
          }

          // プラットフォーム別の統計
          const platformStats = {};
          commentRows.forEach((comment) => {
            if (!platformStats[comment.platform]) {
              platformStats[comment.platform] = {
                total: 0,
                visible: 0,
                hidden: 0,
                deleted: 0,
                flagged: 0
              };
            }
            platformStats[comment.platform].total++;
            if (comment.status === 'visible') platformStats[comment.platform].visible++;
            else if (comment.status === 'hidden') platformStats[comment.platform].hidden++;
            else if (comment.status === 'deleted') platformStats[comment.platform].deleted++;
            else if (comment.status === 'flagged') platformStats[comment.platform].flagged++;
          });

          // 最近のアクティビティ（コメントとモデレーションを統合）
          const recentActivity = [
            ...commentRows.slice(0, 10).map((comment) => ({
              type: 'comment',
              timestamp: comment.timestamp,
              platform: comment.platform,
              content: comment.display_content,
              status: comment.status,
              riskScore: comment.moderation_score
            })),
            ...modRows.slice(0, 5).map((mod) => ({
              type: 'moderation',
              timestamp: mod.timestamp,
              action: mod.action,
              reason: mod.reason,
              moderator: mod.moderator
            }))
          ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);

          const channelActivity = {
            user: {
              id: userRow.id,
              username: userRow.username || userRow.id,
              avatar: userRow.avatar_url,
              status: userRow.status,
              joinDate: userRow.created_at,
              lastSeen: userRow.last_seen,
              subscriberCount: userRow.subscriber_count || 0,
              isVerified: userRow.is_verified === 1,
              badges: userRow.badges ? JSON.parse(userRow.badges) : []
            },
            statistics: stats,
            platformBreakdown: platformStats,
            recentComments: commentRows.map((comment) => ({
              id: comment.id,
              content: comment.display_content,
              platform: comment.platform,
              timestamp: comment.timestamp,
              status: comment.status,
              riskScore: comment.moderation_score
            })),
            moderationHistory: modRows,
            recentActivity: recentActivity,
            pagination: {
              limit: parseInt(limit),
              offset: parseInt(offset),
              hasMore: commentRows.length === parseInt(limit)
            }
          };

          res.json({
            status: 200,
            data: channelActivity,
            message: 'User channel activity fetched successfully'
          });
        });
      });
    });
  } catch (error) {
    next({ status: 500, message: 'Failed to fetch channel activity', details: error });
  }
};

// ユーザー外部連携設定
const setExternalIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    enabled,
    services,
    webhookUrl,
    apiKey,
    syncFrequency,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const integrationSchema = Joi.object({
    enabled: Joi.boolean().optional(),
    services: Joi.array().items(Joi.string()).optional(),
    webhookUrl: Joi.string().uri({ allowRelative: false }).max(2048).optional(),
    apiKey: Joi.string().max(1000).optional(),
    syncFrequency: Joi.string().valid('manual', 'realtime', 'hourly', 'daily', 'weekly').optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = integrationSchema.validate({
    enabled,
    services,
    webhookUrl,
    apiKey,
    syncFrequency,
    reason
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid external integration parameters',
      details: error.details
    });
  }

  try {
    // 現在の設定を取得
    const current = await dbGet(
      'SELECT external_integration_enabled, external_integration_services, external_integration_webhook_url, external_integration_api_key, external_integration_sync_frequency FROM users WHERE id = ?',
      [id]
    );

    if (!current) {
      return res.status(404).json({
        status: 404,
        message: 'User not found'
      });
    }

    // 更新を実行
    const updateFields = [];
    const params = [];

    if (value.enabled !== undefined) {
      updateFields.push('external_integration_enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    if (value.services !== undefined) {
      updateFields.push('external_integration_services = ?');
      params.push(JSON.stringify(value.services));
    }

    if (value.webhookUrl !== undefined) {
      updateFields.push('external_integration_webhook_url = ?');
      params.push(value.webhookUrl);
    }

    if (value.apiKey !== undefined) {
      updateFields.push('external_integration_api_key = ?');
      params.push(value.apiKey);
    }

    if (value.syncFrequency !== undefined) {
      updateFields.push('external_integration_sync_frequency = ?');
      params.push(value.syncFrequency);
    }

    params.push(id);

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 400,
        message: 'No integration settings to update'
      });
    }

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    await dbRun(sql, params);

    // ログを記録
    await dbRun(`
      INSERT INTO external_integration_logs
      (user_id, service_id, action, status, data, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      id,
      'system',
      'integration_settings_updated',
      'success',
      JSON.stringify({
        enabled: value.enabled,
        services: value.services,
        syncFrequency: value.syncFrequency
      }),
      value.reason || 'Manual integration settings update'
    ]);

    res.json({
      status: 200,
      data: {
        userId: id,
        enabled: Boolean(value.enabled),
        services: value.services || [],
        webhookUrl: value.webhookUrl,
        syncFrequency: value.syncFrequency,
        moderatorId,
        updatedAt: new Date().toISOString()
      },
      message: 'External integration settings updated'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error updating integration settings:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to update external integration settings',
      details: error.message
    });
  }
});

// ユーザー外部連携取得
const getExternalIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  try {
    const integration = await dbGet(`
      SELECT
        external_integration_enabled,
        external_integration_services,
        external_integration_webhook_url,
        external_integration_api_key,
        external_integration_last_sync,
        external_integration_sync_frequency
      FROM users WHERE id = ?
    `, [id]);

    if (!integration) {
      return res.status(404).json({
        status: 404,
        message: 'User not found'
      });
    }

    res.json({
      status: 200,
      data: {
        enabled: Boolean(integration.external_integration_enabled),
        services: integration.external_integration_services ? JSON.parse(integration.external_integration_services) : [],
        webhookUrl: integration.external_integration_webhook_url,
        apiKey: integration.external_integration_api_key,
        lastSync: integration.external_integration_last_sync,
        syncFrequency: integration.external_integration_sync_frequency || 'manual'
      },
      message: 'External integration settings retrieved'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error getting integration settings:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get external integration settings',
      details: error.message
    });
  }
});

// 外部連携統計取得
// ---------------------------------------------------------------------------
// 削除記録（2026-09-01・E-29）
// ---------------------------------------------------------------------------
// ここには外部連携の統計／サービス一覧／操作ログと、認証履歴の取得・集計・
// 絞り込み・エクスポート・掃除の8ハンドラ（788行）があった。
// いずれも **routes に mount されておらず外部から到達不能**な上、
// 参照するテーブル5種（external_integration_stats /
// external_integration_services / user_auth_history / device_fingerprints /
// security_events）がスキーマに1つも存在しない。配線しても動かない。
//
// 認証履歴そのものは `GET /:id/auth-history`（getAuthHistory）が
// 実在するデータで動いており、そちらは残してある。
// 全文は git log に残っている。
// ---------------------------------------------------------------------------

const batchUpdateExternalIntegration = asyncHandler(async (req, res, next) => {
  const { updates, reason } = req.body;
  const moderatorId = req.user?.id || 'system';

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'Updates array is required and must not be empty'
    });
  }

  if (updates.length > 100) {
    return res.status(400).json({
      status: 400,
      message: 'Maximum 100 updates allowed per batch'
    });
  }

  // バリデーション
  const Joi = require('joi');
  const updateSchema = Joi.object({
    userId: Joi.string().required(),
    enabled: Joi.boolean().optional(),
    services: Joi.array().items(Joi.string()).optional(),
    webhookUrl: Joi.string().uri({ allowRelative: false }).max(2048).optional(),
    apiKey: Joi.string().max(1000).optional(),
    syncFrequency: Joi.string().valid('manual', 'realtime', 'hourly', 'daily', 'weekly').optional()
  });

  const errors = [];
  const validUpdates = [];

  updates.forEach((update, index) => {
    const { error, value } = updateSchema.validate(update);
    if (error) {
      errors.push({ index, message: error.details[0].message });
    } else {
      validUpdates.push(value);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid updates',
      details: errors
    });
  }

  try {
    let completed = 0;
    let failed = 0;
    const results = [];

    // すべての更新を順次実行
    for (const update of validUpdates) {
      try {
        // 現在の設定を取得
        const current = await dbGet(
          'SELECT external_integration_enabled, external_integration_services, external_integration_webhook_url, external_integration_api_key, external_integration_sync_frequency FROM users WHERE id = ?',
          [update.userId]
        );

        if (!current) {
          failed++;
          results.push({ userId: update.userId, success: false, error: 'User not found' });
          continue;
        }

        // 更新を実行
        await dbRun(`
          UPDATE users SET
            external_integration_enabled = ?,
            external_integration_services = ?,
            external_integration_webhook_url = ?,
            external_integration_api_key = ?,
            external_integration_sync_frequency = ?
          WHERE id = ?
        `, [
          update.enabled !== undefined ? (update.enabled ? 1 : 0) : current.external_integration_enabled,
          update.services !== undefined ? JSON.stringify(update.services) : current.external_integration_services,
          update.webhookUrl !== undefined ? update.webhookUrl : current.external_integration_webhook_url,
          update.apiKey !== undefined ? update.apiKey : current.external_integration_api_key,
          update.syncFrequency !== undefined ? update.syncFrequency : current.external_integration_sync_frequency,
          update.userId
        ]);

        // ログを記録
        await dbRun(`
          INSERT INTO external_integration_logs
          (user_id, service_id, action, status, data, reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          update.userId,
          'batch_update',
          'integration_settings_updated',
          'success',
          JSON.stringify({
            enabled: update.enabled,
            services: update.services,
            syncFrequency: update.syncFrequency
          }),
          reason || 'Batch integration settings update'
        ]);

        completed++;
        results.push({ userId: update.userId, success: true });

      } catch (error) {
        failed++;
        results.push({ userId: update.userId, success: false, error: error.message });
      }
    }

    res.json({
      status: 200,
      data: {
        total: updates.length,
        completed,
        failed,
        results
      },
      message: `Batch update completed: ${completed} succeeded, ${failed} failed`
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error in batch update:', error);
    res.status(500).json({
      status: 500,
      message: 'Batch update failed',
      details: error.message
    });
  }
});

// 外部連携サービス一覧取得