const db = require('../../src/db');
const Joi = require('joi');
const validator = require('validator');
const { logDataMod } = require('../services/advancedAuditLogService');

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
  const sql = `UPDATE users SET status = ?, ban_until = ?, mute_until = ? WHERE id = ?`;
  db.run(sql, [status, banUntil, muteUntil, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    logDataMod(req.user?.id || 'system', 'users', 'status_update', id, { status, banUntil, muteUntil, reason: sanitizeToStorage(reason) });
    res.json({ status: 200, data: null, message: 'User updated' });
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

  const sql = `UPDATE users SET notification_frequency = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET external_integration = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET profile_image = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET bio = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET language = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET timezone = ? WHERE id = ?`;
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
  const sql = `UPDATE users SET subscription = ? WHERE id = ?`;
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

  const sql = `UPDATE users SET two_factor = ?, email_verified = ? WHERE id = ?`;
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
          const updateUserSql = `UPDATE users SET mute_until = ? WHERE id = ?`;
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
      const updateSql = `UPDATE user_timeouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(updateSql, ['removed', timeoutRecord.id], function(updateErr) {
        if (updateErr) return next({ status: 500, message: 'Database error removing timeout', details: updateErr });

        // 履歴を更新
        const historySql = `UPDATE user_timeout_history SET status = ?, ended_at = CURRENT_TIMESTAMP, notes = ? WHERE user_id = ? AND status = ?`;
        db.run(historySql, ['removed', notes || '', id, 'active'], function(historyErr) {
          if (historyErr) {
            logger.warn('[Timeout] Failed to update timeout history:', historyErr);
          }

          // ユーザーのミュート状態を解除
          const updateUserSql = `UPDATE users SET mute_until = NULL WHERE id = ?`;
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
        history: history.map(record => ({
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
        timeouts: timeouts.map(timeout => ({
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
      data: reasons.map(reason => ({
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
  const updateSql = `UPDATE user_timeouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE status = ? AND timeout_until <= ?`;
  db.run(updateSql, ['expired', 'active', currentTime], function(updateErr) {
    if (updateErr) return next({ status: 500, message: 'Database error updating expired timeouts', details: updateErr });

    const updatedCount = this.changes;

    // 対応する履歴も更新
    const historySql = `UPDATE user_timeout_history SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE status = ? AND timeout_until <= ?`;
    db.run(historySql, ['expired', 'active', currentTime], function(historyErr) {
      if (historyErr) {
        logger.warn('[Timeout] Failed to update timeout history:', historyErr);
      }

      // ユーザーのミュート状態も解除
      const userSql = `UPDATE users SET mute_until = NULL WHERE mute_until IS NOT NULL AND mute_until <= ?`;
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

        // モデレーション履歴を取得
        const moderationQuery = `
          SELECT
            action,
            reason,
            timestamp,
            moderator
          FROM moderation_history
          WHERE target_user = ?
          ORDER BY timestamp DESC
          LIMIT 20
        `;

        db.all(moderationQuery, [id], (modErr, modRows) => {
          if (modErr) return next({ status: 500, message: 'Failed to fetch moderation history', details: modErr });

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
            banCount: modRows.filter(m => m.action === 'ban').length,
            muteCount: modRows.filter(m => m.action === 'mute').length
          };

          // コメント統計を計算
          if (commentRows.length > 0) {
            stats.totalComments = commentRows.length;
            stats.visibleComments = commentRows.filter(c => c.status === 'visible').length;
            stats.hiddenComments = commentRows.filter(c => c.status === 'hidden').length;
            stats.deletedComments = commentRows.filter(c => c.status === 'deleted').length;
            stats.flaggedComments = commentRows.filter(c => c.status === 'flagged').length;

            const validScores = commentRows
              .filter(c => c.moderation_score !== null)
              .map(c => c.moderation_score);
            if (validScores.length > 0) {
              stats.averageRiskScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
            }

            stats.lastActivity = commentRows[0]?.timestamp;
          }

          // プラットフォーム別の統計
          const platformStats = {};
          commentRows.forEach(comment => {
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
            ...commentRows.slice(0, 10).map(comment => ({
              type: 'comment',
              timestamp: comment.timestamp,
              platform: comment.platform,
              content: comment.display_content,
              status: comment.status,
              riskScore: comment.moderation_score
            })),
            ...modRows.slice(0, 5).map(mod => ({
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
            recentComments: commentRows.map(comment => ({
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
const getExternalIntegrationStats = asyncHandler(async (req, res, next) => {
  const { period = '7d', serviceId } = req.query;

  try {
    // 日付範囲を計算
    const now = new Date();
    let startDate;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const startDateStr = startDate.toISOString().split('T')[0];

    let sql = `
      SELECT
        service_id,
        SUM(total_requests) as total_requests,
        SUM(successful_requests) as successful_requests,
        SUM(failed_requests) as failed_requests,
        AVG(avg_response_time_ms) as avg_response_time_ms
      FROM external_integration_stats
      WHERE date >= ?
    `;
    const params = [startDateStr];

    if (serviceId) {
      sql += ' AND service_id = ?';
      params.push(serviceId);
    }

    sql += ' GROUP BY service_id ORDER BY total_requests DESC';

    const stats = await dbAll(sql, params);

    // 全体統計も取得
    const totalStats = await dbGet(`
      SELECT
        COUNT(*) as total_logs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_logs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_logs,
        AVG(response_time_ms) as avg_response_time_ms
      FROM external_integration_logs
      WHERE created_at >= ?
    `, [startDate.toISOString()]);

    // サービス別統計も取得
    const serviceBreakdown = await dbAll(`
      SELECT
        ei.service_id,
        eis.name as service_name,
        COUNT(*) as total_logs,
        SUM(CASE WHEN ei.status = 'success' THEN 1 ELSE 0 END) as successful_logs,
        SUM(CASE WHEN ei.status = 'failed' THEN 1 ELSE 0 END) as failed_logs,
        AVG(ei.response_time_ms) as avg_response_time_ms
      FROM external_integration_logs ei
      LEFT JOIN external_integration_services eis ON ei.service_id = eis.id
      WHERE ei.created_at >= ?
      GROUP BY ei.service_id, eis.name
      ORDER BY total_logs DESC
    `, [startDate.toISOString()]);

    res.json({
      status: 200,
      data: {
        period,
        startDate: startDateStr,
        endDate: now.toISOString().split('T')[0],
        serviceStats: stats,
        serviceBreakdown,
        overallStats: {
          totalLogs: totalStats?.total_logs || 0,
          successfulLogs: totalStats?.successful_logs || 0,
          failedLogs: totalStats?.failed_logs || 0,
          avgResponseTimeMs: totalStats?.avg_response_time_ms || 0,
          successRate: totalStats?.total_logs > 0 ?
            ((totalStats.successful_logs / totalStats.total_logs) * 100).toFixed(2) : 0
        }
      },
      message: 'External integration statistics retrieved'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error getting statistics:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get external integration statistics',
      details: error.message
    });
  }
});

// 外部連携設定のバッチ更新
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
const getExternalIntegrationServices = asyncHandler(async (req, res, next) => {
  try {
    const services = await dbAll(`
      SELECT
        id,
        name,
        type,
        description,
        config_schema,
        enabled,
        created_at,
        updated_at
      FROM external_integration_services
      WHERE enabled = 1
      ORDER BY type, name ASC
    `);

    const formattedServices = services.map(service => ({
      id: service.id,
      name: service.name,
      type: service.type,
      description: service.description,
      configSchema: service.config_schema ? JSON.parse(service.config_schema) : null,
      enabled: Boolean(service.enabled),
      createdAt: service.created_at,
      updatedAt: service.updated_at
    }));

    res.json({
      status: 200,
      data: formattedServices,
      message: 'External integration services retrieved'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error getting services:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get external integration services',
      details: error.message
    });
  }
});

// 外部連携ログ取得
const getExternalIntegrationLogs = asyncHandler(async (req, res, next) => {
  const { userId, serviceId, status, limit = 50, offset = 0 } = req.query;

  try {
    let sql = `
      SELECT
        eil.id,
        eil.user_id,
        eil.service_id,
        eil.action,
        eil.status,
        eil.data,
        eil.error_message,
        eil.response_time_ms,
        eil.created_at,
        u.username as user_username,
        eis.name as service_name
      FROM external_integration_logs eil
      LEFT JOIN users u ON eil.user_id = u.id
      LEFT JOIN external_integration_services eis ON eil.service_id = eis.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND eil.user_id = ?';
      params.push(userId);
    }

    if (serviceId) {
      sql += ' AND eil.service_id = ?';
      params.push(serviceId);
    }

    if (status) {
      sql += ' AND eil.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY eil.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await dbAll(sql, params);

    const formattedLogs = logs.map(log => ({
      id: log.id,
      userId: log.user_id,
      serviceId: log.service_id,
      action: log.action,
      status: log.status,
      data: log.data ? JSON.parse(log.data) : null,
      errorMessage: log.error_message,
      responseTimeMs: log.response_time_ms,
      createdAt: log.created_at,
      user: {
        id: log.user_id,
        username: log.user_username
      },
      service: {
        id: log.service_id,
        name: log.service_name
      }
    }));

    res.json({
      status: 200,
      data: {
        logs: formattedLogs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedLogs.length
        }
      },
      message: 'External integration logs retrieved'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error getting logs:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get external integration logs',
      details: error.message
    });
  }
});

// 外部連携同期実行
const triggerExternalIntegrationSync = asyncHandler(async (req, res, next) => {
  const { userId, serviceId } = req.body;

  try {
    if (!userId || !serviceId) {
      return res.status(400).json({
        status: 400,
        message: 'userId and serviceId are required'
      });
    }

    // ユーザーの連携設定を確認
    const integration = await dbGet(`
      SELECT external_integration_enabled, external_integration_services
      FROM users WHERE id = ?
    `, [userId]);

    if (!integration || !integration.external_integration_enabled) {
      return res.status(400).json({
        status: 400,
        message: 'External integration is not enabled for this user'
      });
    }

    const services = integration.external_integration_services ? JSON.parse(integration.external_integration_services) : [];
    if (!services.includes(serviceId)) {
      return res.status(400).json({
        status: 400,
        message: 'Service is not enabled for this user'
      });
    }

    // 同期を実行（実際の実装では外部サービスとの連携処理）
    const syncResult = {
      userId,
      serviceId,
      status: 'success',
      syncedAt: new Date().toISOString(),
      recordsProcessed: 0,
      errors: []
    };

    // ログを記録
    await dbRun(`
      INSERT INTO external_integration_logs
      (user_id, service_id, action, status, data)
      VALUES (?, ?, ?, ?, ?)
    `, [
      userId,
      serviceId,
      'sync',
      'success',
      JSON.stringify(syncResult)
    ]);

    // 最終同期時刻を更新
    await dbRun(`
      UPDATE users SET external_integration_last_sync = CURRENT_TIMESTAMP WHERE id = ?
    `, [userId]);

    res.json({
      status: 200,
      data: syncResult,
      message: 'External integration sync triggered successfully'
    });

  } catch (error) {
    logger.error('[ExternalIntegration] Error triggering sync:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to trigger external integration sync',
      details: error.message
    });
  }
});

// ユーザー認証履歴取得
const getUserAuthHistory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, action, startDate, endDate, success } = req.query;

  try {
    let sql = `
      SELECT
        uah.id,
        uah.session_id,
        uah.action,
        uah.ip_address,
        uah.user_agent,
        uah.device_fingerprint,
        uah.location,
        uah.timestamp,
        uah.success,
        uah.failure_reason,
        uah.metadata,
        df.device_info,
        df.trusted as device_trusted,
        se.event_type as security_event,
        se.severity as security_severity
      FROM user_auth_history uah
      LEFT JOIN device_fingerprints df ON uah.device_fingerprint = df.fingerprint_hash AND uah.user_id = df.user_id
      LEFT JOIN security_events se ON uah.id = (
        SELECT id FROM security_events
        WHERE user_id = uah.user_id
        AND created_at >= uah.timestamp
        AND created_at <= datetime(uah.timestamp, '+1 hour')
        ORDER BY created_at ASC
        LIMIT 1
      )
      WHERE uah.user_id = ?
    `;
    const params = [id];

    if (action) {
      sql += ' AND uah.action = ?';
      params.push(action);
    }

    if (startDate) {
      sql += ' AND uah.timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND uah.timestamp <= ?';
      params.push(endDate);
    }

    if (success !== undefined) {
      sql += ' AND uah.success = ?';
      params.push(success === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY uah.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const history = await dbAll(sql, params);

    const formattedHistory = history.map(record => ({
      id: record.id,
      sessionId: record.session_id,
      action: record.action,
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      deviceFingerprint: record.device_fingerprint,
      location: record.location,
      timestamp: record.timestamp,
      success: Boolean(record.success),
      failureReason: record.failure_reason,
      metadata: record.metadata ? JSON.parse(record.metadata) : null,
      device: record.device_info ? {
        info: JSON.parse(record.device_info),
        trusted: Boolean(record.device_trusted)
      } : null,
      securityEvent: record.security_event ? {
        type: record.security_event,
        severity: record.security_severity
      } : null
    }));

    res.json({
      status: 200,
      data: {
        history: formattedHistory,
        userId: id,
        filters: {
          action,
          startDate,
          endDate,
          success
        },
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedHistory.length
        }
      },
      message: 'User authentication history retrieved'
    });

  } catch (error) {
    logger.error('[AuthHistory] Error getting user auth history:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get user authentication history',
      details: error.message
    });
  }
});

// 認証履歴統計取得
const getAuthHistoryStats = asyncHandler(async (req, res, next) => {
  const { period = '7d', userId } = req.query;

  try {
    // 日付範囲を計算
    const now = new Date();
    let startDate;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const startDateStr = startDate.toISOString().split('T')[0];

    // 全体統計を取得
    let sql = `
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_events,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips,
        AVG(CASE WHEN success = 1 THEN (strftime('%s', 'now') - strftime('%s', timestamp)) / 60.0 END) as avg_session_duration_minutes
      FROM user_auth_history
      WHERE timestamp >= ?
    `;
    const params = [startDate.toISOString()];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    const overallStats = await dbGet(sql, params);

    // アクション別統計を取得
    const actionStats = await dbAll(`
      SELECT
        action,
        COUNT(*) as count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
      FROM user_auth_history
      WHERE timestamp >= ?
      ${userId ? 'AND user_id = ?' : ''}
      GROUP BY action
      ORDER BY count DESC
    `, userId ? [startDate.toISOString(), userId] : [startDate.toISOString()]);

    // 失敗理由別統計を取得
    const failureStats = await dbAll(`
      SELECT
        failure_reason,
        COUNT(*) as count
      FROM user_auth_history
      WHERE timestamp >= ?
      AND success = 0
      ${userId ? 'AND user_id = ?' : ''}
      GROUP BY failure_reason
      ORDER BY count DESC
      LIMIT 10
    `, userId ? [startDate.toISOString(), userId] : [startDate.toISOString()]);

    // セキュリティイベント統計を取得
    const securityStats = await dbAll(`
      SELECT
        event_type,
        severity,
        COUNT(*) as count,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
      FROM security_events
      WHERE created_at >= ?
      ${userId ? 'AND user_id = ?' : ''}
      GROUP BY event_type, severity
      ORDER BY count DESC
    `, userId ? [startDate.toISOString(), userId] : [startDate.toISOString()]);

    res.json({
      status: 200,
      data: {
        period,
        startDate: startDateStr,
        endDate: now.toISOString().split('T')[0],
        overallStats: {
          totalEvents: overallStats?.total_events || 0,
          successfulEvents: overallStats?.successful_events || 0,
          failedEvents: overallStats?.failed_events || 0,
          uniqueUsers: overallStats?.unique_users || 0,
          uniqueIps: overallStats?.unique_ips || 0,
          avgSessionDurationMinutes: overallStats?.avg_session_duration_minutes || 0,
          successRate: overallStats?.total_events > 0 ?
            ((overallStats.successful_events / overallStats.total_events) * 100).toFixed(2) : 0
        },
        actionBreakdown: actionStats,
        failureReasons: failureStats,
        securityEvents: securityStats,
        userId: userId || null
      },
      message: 'Authentication history statistics retrieved'
    });

  } catch (error) {
    logger.error('[AuthHistory] Error getting statistics:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get authentication history statistics',
      details: error.message
    });
  }
});

// 認証履歴クリーンアップ
const cleanupAuthHistory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { olderThanDays = 90 } = req.body;

  try {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    // クリーンアップ対象のレコード数を確認
    const countResult = await dbGet(`
      SELECT COUNT(*) as count FROM user_auth_history
      WHERE user_id = ? AND timestamp < ?
    `, [id, cutoffDate]);

    if (countResult.count === 0) {
      return res.json({
        status: 200,
        data: {
          deleted: 0,
          cutoffDate,
          message: 'No records to clean up'
        },
        message: 'Authentication history cleanup completed (no records to clean)'
      });
    }

    // 認証履歴を削除
    const deleteResult = await dbRun(`
      DELETE FROM user_auth_history
      WHERE user_id = ? AND timestamp < ?
    `, [id, cutoffDate]);

    // 関連するデバイスフィンガープリントも更新
    await dbRun(`
      UPDATE device_fingerprints
      SET login_count = (
        SELECT COUNT(*) FROM user_auth_history
        WHERE user_id = device_fingerprints.user_id
        AND device_fingerprint = device_fingerprints.fingerprint_hash
      )
      WHERE user_id = ?
    `, [id]);

    // 使用されていないデバイスフィンガープリントを削除
    await dbRun(`
      DELETE FROM device_fingerprints
      WHERE user_id = ? AND login_count = 0
    `, [id]);

    res.json({
      status: 200,
      data: {
        deleted: deleteResult.changes,
        cutoffDate,
        olderThanDays,
        cleanupAt: new Date().toISOString()
      },
      message: `Authentication history cleanup completed (${deleteResult.changes} records deleted)`
    });

  } catch (error) {
    logger.error('[AuthHistory] Error cleaning up auth history:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to cleanup authentication history',
      details: error.message
    });
  }
});

// 認証履歴の詳細フィルタリング
const filterAuthHistory = asyncHandler(async (req, res, next) => {
  const {
    userId,
    action,
    success,
    ipAddress,
    deviceFingerprint,
    location,
    startDate,
    endDate,
    limit = 50,
    offset = 0
  } = req.query;

  try {
    let sql = `
      SELECT
        uah.id,
        uah.user_id,
        uah.session_id,
        uah.action,
        uah.ip_address,
        uah.user_agent,
        uah.device_fingerprint,
        uah.location,
        uah.timestamp,
        uah.success,
        uah.failure_reason,
        uah.metadata,
        u.username as user_username
      FROM user_auth_history uah
      LEFT JOIN users u ON uah.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND uah.user_id = ?';
      params.push(userId);
    }

    if (action) {
      sql += ' AND uah.action = ?';
      params.push(action);
    }

    if (success !== undefined) {
      sql += ' AND uah.success = ?';
      params.push(success === 'true' ? 1 : 0);
    }

    if (ipAddress) {
      sql += ' AND uah.ip_address = ?';
      params.push(ipAddress);
    }

    if (deviceFingerprint) {
      sql += ' AND uah.device_fingerprint = ?';
      params.push(deviceFingerprint);
    }

    if (location) {
      sql += ' AND uah.location LIKE ?';
      params.push(`%${location}%`);
    }

    if (startDate) {
      sql += ' AND uah.timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND uah.timestamp <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY uah.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const history = await dbAll(sql, params);

    const formattedHistory = history.map(record => ({
      id: record.id,
      userId: record.user_id,
      username: record.user_username,
      sessionId: record.session_id,
      action: record.action,
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      deviceFingerprint: record.device_fingerprint,
      location: record.location,
      timestamp: record.timestamp,
      success: Boolean(record.success),
      failureReason: record.failure_reason,
      metadata: record.metadata ? JSON.parse(record.metadata) : null
    }));

    res.json({
      status: 200,
      data: {
        history: formattedHistory,
        filters: {
          userId,
          action,
          success,
          ipAddress,
          deviceFingerprint,
          location,
          startDate,
          endDate
        },
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedHistory.length
        }
      },
      message: 'Filtered authentication history retrieved'
    });

  } catch (error) {
    logger.error('[AuthHistory] Error filtering auth history:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to filter authentication history',
      details: error.message
    });
  }
});

// 認証履歴エクスポート
const exportAuthHistory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { format = 'json', startDate, endDate, action } = req.query;

  try {
    let sql = `
      SELECT
        uah.id,
        uah.session_id,
        uah.action,
        uah.ip_address,
        uah.user_agent,
        uah.device_fingerprint,
        uah.location,
        uah.timestamp,
        uah.success,
        uah.failure_reason,
        uah.metadata,
        u.username as user_username
      FROM user_auth_history uah
      LEFT JOIN users u ON uah.user_id = u.id
      WHERE uah.user_id = ?
    `;
    const params = [id];

    if (startDate) {
      sql += ' AND uah.timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND uah.timestamp <= ?';
      params.push(endDate);
    }

    if (action) {
      sql += ' AND uah.action = ?';
      params.push(action);
    }

    sql += ' ORDER BY uah.timestamp DESC';

    const history = await dbAll(sql, params);

    const formattedHistory = history.map(record => ({
      id: record.id,
      sessionId: record.session_id,
      action: record.action,
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      deviceFingerprint: record.device_fingerprint,
      location: record.location,
      timestamp: record.timestamp,
      success: Boolean(record.success),
      failureReason: record.failure_reason,
      metadata: record.metadata ? JSON.parse(record.metadata) : null,
      user: record.user_username
    }));

    // エクスポート形式に応じてレスポンスを調整
    if (format === 'csv') {
      // CSV形式でエクスポート
      const csvHeaders = ['ID', 'Session ID', 'Action', 'IP Address', 'User Agent', 'Device Fingerprint', 'Location', 'Timestamp', 'Success', 'Failure Reason', 'User'];
      const csvRows = formattedHistory.map(record => [
        record.id,
        record.sessionId || '',
        record.action,
        record.ipAddress || '',
        record.userAgent || '',
        record.deviceFingerprint || '',
        record.location || '',
        record.timestamp,
        record.success ? 'Success' : 'Failed',
        record.failureReason || '',
        record.user || ''
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="auth-history-${id}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);

    } else {
      // JSON形式でエクスポート
      res.json({
        status: 200,
        data: {
          userId: id,
          exportFormat: format,
          exportedAt: new Date().toISOString(),
          filters: {
            startDate,
            endDate,
            action
          },
          history: formattedHistory
        },
        message: 'Authentication history exported'
      });
    }

  } catch (error) {
    logger.error('[AuthHistory] Error exporting auth history:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to export authentication history',
      details: error.message
    });
  }
});
