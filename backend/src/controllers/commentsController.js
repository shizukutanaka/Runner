const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');
const moderationService = require('../services/moderationService');
const commentService = require('../services/commentService');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Promisified wrapper for database get operation
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Database row or null
 */
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(row);
  });
});

/**
 * Promisified wrapper for database all operation
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of database rows
 */
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(rows || []);
  });
});

/**
 * Promisified wrapper for database run operation
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result with lastID and changes
 */
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function runCallback(err) {
    if (err) {
      reject(err);
      return;
    }
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

/**
 * Creates a 404 Not Found error
 * @param {string} message - Error message
 * @returns {Error} Error object with status 404
 */
const notFoundError = (message = 'Comment not found') => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const ALLOWED_COLUMNS = new Set([
  'avatar_url',
  'background_color',
  'highlight',
  'pinned',
  'auto_archive',
  'external_shared',
  'notification_frequency'
]);

/**
 * Converts value to boolean
 * @param {*} value - Value to convert
 * @returns {boolean} Boolean representation
 */
const toBoolean = (value) => value === 1 || value === true || value === '1';

/**
 * Converts value to integer boolean (0 or 1)
 * @param {*} value - Value to convert
 * @returns {number} 0 or 1
 */
const toIntegerBoolean = (value) => (value ? 1 : 0);

const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim();
};

const normalizeColumnValue = (column, value) => {
  if (typeof value !== 'string') {
    return value;
  }
  // カラム固有のバリデーションを追加
  switch (column) {
    case 'avatar_url':
      // URLバリデーションを強化
      if (value && !validator.isURL(value, { protocols: ['http', 'https'] })) {
        throw new Error('Invalid URL format for avatar_url');
      }
      return value.trim();
    case 'background_color':
      // カラーコードのバリデーション（例: #RGB, #RRGGBB）
      if (value && !/^#[0-9A-Fa-f]{3,8}$/.test(value)) {
        throw new Error('Invalid color format');
      }
      return value.trim();
    case 'notification_frequency':
      // 頻度のバリデーション（例: daily, weekly）
      const allowedFrequencies = ['immediate', 'daily', 'weekly', 'monthly'];
      if (value && !allowedFrequencies.includes(value)) {
        throw new Error('Invalid notification frequency');
      }
      return value.trim();
    default:
      return value.trim();
  }
};

const sanitizeForStorage = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return validator.stripLow(trimmed, true);
};

/**
 * Maps database row to comment object
 * @param {Object} row - Database row
 * @returns {Object|null} Mapped comment object or null
 */
const mapCommentRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    content: sanitizeForResponse(row.content),
    user: sanitizeForResponse(row.user),
    platform: row.platform,
    status: row.status,
    timestamp: row.timestamp,
    moderation: {
      reason: sanitizeForResponse(row.moderation_reason || null),
      timestamp: row.moderation_timestamp || null,
      score: row.moderation_score ?? null
    },
    presentation: {
      avatarUrl: sanitizeForResponse(row.avatar_url || null),
      backgroundColor: sanitizeForResponse(row.background_color || null),
      highlight: toBoolean(row.highlight),
      pinned: toBoolean(row.pinned)
    },
    automation: {
      autoArchive: toBoolean(row.auto_archive),
      externalShared: toBoolean(row.external_shared),
      notificationFrequency: sanitizeForResponse(row.notification_frequency || null)
    }
  };
};

/**
 * Gets the moderation rejection score from configuration
 * @returns {number} Rejection score threshold
 */
const getRejectionScore = () => {
  const raw = Number(config.getEnv('MODERATION_REJECTION_SCORE', 60));
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 60;
};

// スローモードチェック関数
const checkSlowMode = async (userId, platform) => {
  try {
    // ユーザーのスローモード設定を取得
    const settingsRow = await dbGet('SELECT settings FROM user_settings WHERE user_id = ?', [userId]);
    const settings = settingsRow ? JSON.parse(settingsRow.settings) : {};

    // スローモードが有効でない場合は許可
    if (!settings.slowMode || !settings.slowMode.enabled) {
      return { allowed: true };
    }

    // プラットフォーム固有の設定を確認
    const platformSettings = settings.slowMode.platformSpecific?.[platform.toLowerCase()];
    const intervalSeconds = platformSettings?.enabled ?
      platformSettings.intervalSeconds :
      settings.slowMode.intervalSeconds;

    // 設定されていない場合は許可
    if (!intervalSeconds || intervalSeconds <= 0) {
      return { allowed: true };
    }

    // ユーザーの最終コメント時刻を取得
    const userRow = await dbGet('SELECT last_comment_at FROM users WHERE id = ?', [userId]);
    const lastCommentAt = userRow?.last_comment_at;

    // 初回コメントの場合は許可
    if (!lastCommentAt) {
      return { allowed: true };
    }

    const lastCommentTime = new Date(lastCommentAt).getTime();
    const currentTime = new Date().getTime();
    const timeDiffSeconds = (currentTime - lastCommentTime) / 1000;

    // インターバルを超えている場合は許可
    if (timeDiffSeconds >= intervalSeconds) {
      return { allowed: true };
    }

    // インターバル内にコメントしようとしている場合は拒否
    const remainingTime = Math.ceil(intervalSeconds - timeDiffSeconds);
    const nextAllowedTime = new Date(lastCommentTime + (intervalSeconds * 1000)).toISOString();

    return {
      allowed: false,
      remainingTime,
      nextAllowedTime
    };
  } catch (error) {
    logger.error('[SlowMode] Error checking slow mode:', error);
    // エラーが発生した場合は安全側に倒して許可
    return { allowed: true };
  }
};

const updateCommentField = async (id, column, value) => {
  // カラム名のバリデーション（SQLインジェクション対策）
  if (!ALLOWED_COLUMNS.has(column)) {
    const error = new Error('Invalid column name');
    error.status = 400;
    throw error;
  }

  let updateValue = value;
  if (typeof updateValue === 'string') {
    updateValue = sanitizeForStorage(normalizeColumnValue(column, updateValue));
  }

  const result = await dbRun(`UPDATE comments SET ${column} = ? WHERE id = ?`, [updateValue, id]);
  if (result.changes === 0) {
    throw notFoundError();
  }
  const updated = await dbGet('SELECT * FROM comments WHERE id = ?', [id]);
  await commentService.invalidateCommentCache(id);
  await commentService.invalidateCommentListCache();
  return mapCommentRow(updated);
};

const getComments = asyncHandler(async (req, res) => {
  const { platform, status, limit = 50, offset = 0, search } = req.query;

  const filters = [];
  const params = [];

  if (platform) {
    filters.push('platform = ?');
    params.push(platform);
  }

  if (status) {
    filters.push('status = ?');
    params.push(status);
  }

  if (search) {
    filters.push('(content LIKE ? OR user LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const paginationLimit = Math.min(Number(limit) || 50, 200);
  const paginationOffset = Math.max(Number(offset) || 0, 0);

  const totalRow = await dbGet(`SELECT COUNT(*) as total FROM comments ${whereClause}`, params);
  const rows = await dbAll(
    `SELECT * FROM comments ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [...params, paginationLimit, paginationOffset]
  );

  res.json({
    status: 200,
    data: {
      items: rows.map(mapCommentRow),
      pagination: {
        total: totalRow?.total ?? 0,
        limit: paginationLimit,
        offset: paginationOffset
      }
    },
    message: 'Comments fetched'
  });
});

const createComment = asyncHandler(async (req, res, next) => {
  const { content, user, platform } = req.body;
  const timestamp = new Date().toISOString();
  const commentId = uuidv4();
  const normalizedContent = sanitizeForStorage(normalizeText(content ?? ''));
  const normalizedUser = sanitizeForStorage(normalizeText(user ?? ''));

  try {
    // スローモードチェック
    const slowModeCheck = await checkSlowMode(normalizedUser, platform);
    if (!slowModeCheck.allowed) {
      return res.status(429).json({
        status: 429,
        data: {
          remainingTime: slowModeCheck.remainingTime,
          nextAllowedTime: slowModeCheck.nextAllowedTime
        },
        message: `スローモードが有効です。${slowModeCheck.remainingTime}秒後にコメントできます。`
      });
    }

    const moderation = await moderationService.analyzeComment(normalizedContent, platform, normalizedUser, timestamp);
    const rejectionScore = getRejectionScore();
    const shouldReject = moderation.isSpam || moderation.isOffensive || (moderation.score ?? 0) >= rejectionScore;

    if (shouldReject) {
      logger.warn('[Comments] Comment rejected by moderation', {
        user,
        platform,
        score: moderation.score,
        flaggedWords: moderation.flaggedWords
      });
      return res.status(422).json({
        status: 422,
        data: { moderation },
        message: 'Comment rejected by moderation policies'
      });
    }

    // メッセージ保留チェック（保留判定）
    const shouldHold = await checkMessageHold(normalizedContent, moderation, platform);
    if (shouldHold.hold) {
      // 保留メッセージとして保存
      const holdResult = await holdMessage({
        content: normalizedContent,
        user: normalizedUser,
        platform,
        moderationResult: moderation,
        holdReason: shouldHold.primaryReason,
        holdLevel: shouldHold.holdLevel,
        reasons: shouldHold.reasons
      });

      return res.status(202).json({
        status: 202,
        data: {
          holdId: holdResult.holdId,
          holdUntil: holdResult.holdUntil,
          holdLevel: shouldHold.holdLevel,
          reasons: shouldHold.reasons
        },
        message: 'メッセージが保留されました。モデレーターの確認をお待ちください。'
      });
    }

    await dbRun(
      'INSERT INTO comments (id, content, user, platform, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [commentId, normalizedContent, normalizedUser, platform, 'visible', timestamp]
    );

    // ユーザーの最終コメント時刻を更新
    await dbRun(
      'UPDATE users SET last_comment_at = ? WHERE id = ?',
      [timestamp, normalizedUser]
    );

    const created = await dbGet('SELECT * FROM comments WHERE id = ?', [commentId]);
    await commentService.invalidateCommentCache(commentId);
    await commentService.invalidateCommentListCache();
    res.status(201).json({
      status: 201,
      data: mapCommentRow(created),
      message: 'Comment created'
    });
  } catch (err) {
    next({ status: 500, message: 'Failed to create comment', details: err });
  }
});

const updateComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const timestamp = new Date().toISOString();

  try {
    const result = await dbRun(
      'UPDATE comments SET status = ?, moderation_reason = ?, moderation_timestamp = ? WHERE id = ?',
      [action, reason || null, timestamp, id]
    );

    if (result.changes === 0) {
      throw notFoundError();
    }

    const updated = await dbGet('SELECT * FROM comments WHERE id = ?', [id]);
    await commentService.invalidateCommentCache(id);
    await commentService.invalidateCommentListCache();
    res.json({
      status: 200,
      data: mapCommentRow(updated),
      message: 'Comment status updated'
    });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update comment status', details: err });
  }
});

const setAvatar = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { avatarUrl } = req.body;

  try {
    const updated = await updateCommentField(id, 'avatar_url', avatarUrl);
    res.json({ status: 200, data: updated, message: 'Avatar updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update avatar', details: err });
  }
});

const setBackgroundColor = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { color } = req.body;

  try {
    const updated = await updateCommentField(id, 'background_color', color);
    res.json({ status: 200, data: updated, message: 'Background color updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update background color', details: err });
  }
});

const setHighlight = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { highlight } = req.body;

  try {
    const updated = await updateCommentField(id, 'highlight', toIntegerBoolean(highlight));
    res.json({ status: 200, data: updated, message: 'Highlight updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update highlight', details: err });
  }
});

const setPin = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { pinned } = req.body;

  try {
    const updated = await updateCommentField(id, 'pinned', toIntegerBoolean(pinned));
    res.json({ status: 200, data: updated, message: 'Pin status updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update pin status', details: err });
  }
});

const setAutoArchive = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { autoArchive } = req.body;

  try {
    const updated = await updateCommentField(id, 'auto_archive', toIntegerBoolean(autoArchive));
    res.json({ status: 200, data: updated, message: 'Auto archive setting updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update auto archive setting', details: err });
  }
});

const setExternalShare = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { shared } = req.body;

  try {
    const updated = await updateCommentField(id, 'external_shared', toIntegerBoolean(shared));
    res.json({ status: 200, data: updated, message: 'External share setting updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update external share setting', details: err });
  }
});

const getEditHistory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  try {
    const history = await dbAll(
      'SELECT editor, previous_content, new_content, edited_at FROM comment_edits WHERE comment_id = ? ORDER BY edited_at DESC',
      [id]
    );

    if (history.length === 0) {
      const exists = await dbGet('SELECT id FROM comments WHERE id = ?', [id]);
      if (!exists) {
        throw notFoundError();
      }
    }

    res.json({
      status: 200,
      data: history.map((entry) => ({
        editor: entry.editor,
        previousContent: entry.previous_content,
        newContent: entry.new_content,
        editedAt: entry.edited_at
      })),
      message: 'Edit history fetched'
    });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to fetch edit history', details: err });
  }
});

const setNotificationFrequency = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { frequency } = req.body;

  try {
    const updated = await updateCommentField(id, 'notification_frequency', frequency);
    res.json({ status: 200, data: updated, message: 'Notification frequency updated' });
  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to update notification frequency', details: err });
  }
});

const deleteComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    reason,
    reasonCategory,
    evidence,
    reasonText
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const deletionSchema = Joi.object({
    reason: Joi.string().required(),
    reasonCategory: Joi.string().valid('spam', 'harassment', 'hate_speech', 'inappropriate_content', 'off_topic', 'duplicate', 'bot_activity', 'violation_rules', 'other').required(),
    evidence: Joi.string().max(1000).optional(),
    reasonText: Joi.string().max(500).optional()
  });

  const { error, value } = deletionSchema.validate({
    reason,
    reasonCategory,
    evidence,
    reasonText
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid deletion parameters',
      details: error.details
    });
  }

  try {
    const existing = await dbGet('SELECT * FROM comments WHERE id = ?', [id]);
    if (!existing) {
      throw notFoundError();
    }

    const timestamp = new Date().toISOString();

    // コメントを削除（ソフトデリートとしてマーク）
    const result = await dbRun(
      'UPDATE comments SET status = ?, deletion_reason = ?, deletion_reason_category = ?, deletion_moderator_id = ?, deletion_timestamp = ?, deletion_evidence = ? WHERE id = ?',
      ['deleted', value.reason, value.reasonCategory, moderatorId, timestamp, value.evidence || null, id]
    );

    if (result.changes === 0) {
      throw notFoundError();
    }

    // 削除履歴を記録
    await dbRun(`
      INSERT INTO comment_deletion_history
      (comment_id, moderator_id, action, reason, reason_category, evidence, previous_reason, previous_reason_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      moderatorId,
      'delete',
      value.reason,
      value.reasonCategory,
      value.evidence || null,
      existing.deletion_reason,
      existing.deletion_reason_category
    ]);

    await commentService.invalidateCommentCache(id);
    await commentService.invalidateCommentListCache();

    res.json({
      status: 200,
      data: {
        commentId: id,
        reason: value.reason,
        reasonCategory: value.reasonCategory,
        moderatorId,
        deletedAt: timestamp,
        evidence: value.evidence
      },
      message: 'Comment deleted with reason recorded'
    });

  } catch (err) {
    if (err.status === 404) {
      return next(err);
    }
    next({ status: 500, message: 'Failed to delete comment', details: err });
  }
});

const summarizeComments = asyncHandler(async (req, res) => {
  const { comments } = req.body;
  const total = comments.length;
  const platforms = comments.reduce((acc, comment) => {
    const key = comment.platform;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const sample = comments.slice(0, 3).map((comment) => comment.content);
  const summary = `Collected ${total} comments across ${Object.keys(platforms).length} platform(s).`;

  res.json({
    status: 200,
    data: {
      summary,
      statistics: {
        total,
        byPlatform: platforms,
        sampleComments: sample
      }
    },
    message: 'Summary generated'
  });
});

const autoAnswer = asyncHandler(async (req, res) => {
  const { comment, context = [] } = req.body;
  const knowledgeBase = [
    {
      keywords: ['schedule', 'time', 'when', '配信', '時間'],
      answer: '配信スケジュールはダッシュボードの「スケジュール」タブで確認できます。'
    },
    {
      keywords: ['ban', '解除', 'unban'],
      answer: 'ユーザーのBAN解除は「ユーザー管理」から対象ユーザーを選択して操作してください。'
    },
    {
      keywords: ['設定', 'settings', 'どこ'],
      answer: '設定は右上のギアアイコンからアクセスできます。'
    }
  ];

  const normalized = comment.toLowerCase();
  const match = knowledgeBase.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );

  const answer = match
    ? match.answer
    : '申し訳ありませんが、その質問には現在自動で回答できません。担当者へエスカレーションしてください。';

  res.json({
    status: 200,
    data: {
      answer,
      confidence: match ? 0.7 : 0.2,
      contextUsed: context.length
    },
    message: 'Auto answer generated'
  });
});

// メッセージ保留判定関数
const checkMessageHold = async (content, moderationResult, platform) => {
  try {
    // 保留設定が有効かチェック（実際の実装ではDBから取得）
    const holdSettings = {
      enabled: true,
      aiScoreThreshold: 0.6,
      suspiciousKeywords: ['urgent', 'emergency', 'winner', 'prize', 'million', 'billion'],
      maxLinksForHold: 2,
      repeatedCharsThreshold: 4,
      negativeSentimentThreshold: 0.8
    };

    if (!holdSettings.enabled) {
      return { hold: false };
    }

    const reasons = [];

    // AIスコアチェック
    if (moderationResult.score >= holdSettings.aiScoreThreshold) {
      reasons.push({
        type: 'ai_score',
        severity: 'high',
        score: moderationResult.score,
        threshold: holdSettings.aiScoreThreshold
      });
    }

    // 疑わしいキーワードチェック
    const lowerContent = content.toLowerCase();
    const foundKeywords = holdSettings.suspiciousKeywords.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    );
    if (foundKeywords.length > 0) {
      reasons.push({
        type: 'suspicious_keywords',
        severity: 'medium',
        keywords: foundKeywords
      });
    }

    // リンク数チェック
    if (moderationResult.linkCount >= holdSettings.maxLinksForHold) {
      reasons.push({
        type: 'multiple_links',
        severity: 'medium',
        linkCount: moderationResult.linkCount,
        threshold: holdSettings.maxLinksForHold
      });
    }

    // 繰り返し文字チェック
    const repeatedCharsMatch = content.match(/(.)\1{4,}/g);
    if (repeatedCharsMatch) {
      reasons.push({
        type: 'repeated_chars',
        severity: 'low',
        matches: repeatedCharsMatch.length
      });
    }

    // 感情分析チェック
    if (moderationResult.sentiment === 'negative' && moderationResult.sentimentScore >= holdSettings.negativeSentimentThreshold) {
      reasons.push({
        type: 'negative_sentiment',
        severity: 'medium',
        sentimentScore: moderationResult.sentimentScore,
        threshold: holdSettings.negativeSentimentThreshold
      });
    }

    const hold = reasons.length > 0;
    const holdLevel = hold ? reasons.reduce((max, reason) => {
      const levels = { low: 1, medium: 2, high: 3 };
      return levels[reason.severity] > levels[max] ? reason.severity : max;
    }, 'low') : null;

    const primaryReason = reasons.length > 0 ? reasons[0].type : null;

    return {
      hold,
      holdLevel,
      reasons,
      primaryReason,
      confidence: hold ? Math.min(0.9, reasons.length * 0.2 + 0.1) : 0
    };

  } catch (error) {
    logger.warn('[MessageHold] Error checking hold conditions:', error);
    return { hold: false, error: error.message };
  }
};

// メッセージ保留関数
const holdMessage = async (holdData) => {
  try {
    const {
      content,
      user,
      platform,
      moderationResult,
      holdReason,
      holdLevel,
      reasons
    } = holdData;

    // 保留期間計算
    const holdDurations = { low_risk: 300, medium_risk: 1800, high_risk: 3600 };
    const durationSeconds = holdDurations[`${holdLevel}_risk`] || holdDurations.medium_risk;
    const holdUntil = new Date(Date.now() + durationSeconds * 1000).toISOString();

    // 実際の実装ではデータベースに保存
    const holdRecord = {
      id: Date.now(), // 実際の実装ではDBのAUTO_INCREMENT
      messageId: `msg_${Date.now()}`,
      content,
      user,
      platform,
      holdReason,
      riskScore: moderationResult.score,
      aiAnalysis: JSON.stringify(moderationResult),
      holdUntil,
      status: 'pending',
      createdAt: new Date().toISOString(),
      reasons: JSON.stringify(reasons)
    };

    // ログ記録
    logger.info('[MessageHold] Message held for moderation', {
      user,
      platform,
      holdReason,
      holdLevel,
      riskScore: moderationResult.score
    });

    return {
      holdId: holdRecord.id,
      holdUntil,
      holdLevel,
      durationSeconds,
      reasons
    };

// コメント公開範囲設定
const setCommentVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    visibility,
    allowedRoles,
    allowedUsers,
    expiresAt,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const visibilitySchema = Joi.object({
    visibility: Joi.string().valid('public', 'followers', 'members', 'private', 'moderators').required(),
    allowedRoles: Joi.array().items(Joi.string()).optional(),
    allowedUsers: Joi.array().items(Joi.string()).optional(),
    expiresAt: Joi.date().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = visibilitySchema.validate({
    visibility,
    allowedRoles,
    allowedUsers,
    expiresAt,
    reason
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid visibility settings',
      details: error.details
    });
  }

  try {
    // 現在の設定を取得
    const current = await dbGet(
      'SELECT visibility, allowed_roles, allowed_users, visibility_expires_at FROM comments WHERE id = ?',
      [id]
    );

    if (!current) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    // 更新を実行
    const updateFields = [];
    const params = [];

    updateFields.push('visibility = ?');
    params.push(value.visibility);

    if (value.allowedRoles !== undefined) {
      updateFields.push('allowed_roles = ?');
      params.push(JSON.stringify(value.allowedRoles));
    }

    if (value.allowedUsers !== undefined) {
      updateFields.push('allowed_users = ?');
      params.push(JSON.stringify(value.allowedUsers));
    }

    if (value.expiresAt !== undefined) {
      updateFields.push('visibility_expires_at = ?');
      params.push(value.expiresAt);
    }

    updateFields.push('visibility_moderator_id = ?');
    params.push(moderatorId);

    updateFields.push('visibility_set_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

    await dbRun(sql, params);

    // 履歴を記録
    await dbRun(`
      INSERT INTO comment_visibility_history
      (comment_id, moderator_id, action, old_visibility, new_visibility, old_allowed_roles, new_allowed_roles, old_allowed_users, new_allowed_users, expires_at, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      moderatorId,
      'set',
      current.visibility,
      value.visibility,
      current.allowed_roles,
      JSON.stringify(value.allowedRoles || []),
      current.allowed_users,
      JSON.stringify(value.allowedUsers || []),
      value.expiresAt,
      value.reason || 'Manual visibility change'
    ]);

    res.json({
      status: 200,
      data: {
        commentId: id,
        visibility: value.visibility,
        allowedRoles: value.allowedRoles || [],
        allowedUsers: value.allowedUsers || [],
        expiresAt: value.expiresAt,
        moderatorId,
        setAt: new Date().toISOString()
      },
      message: 'Comment visibility updated'
    });

  } catch (error) {
    logger.error('[CommentVisibility] Error updating visibility:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to update comment visibility',
      details: error.message
    });
  }
});

// コメント公開範囲取得
const getCommentVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const visibility = await dbGet(`
      SELECT
        visibility,
        allowed_roles,
        allowed_users,
        visibility_expires_at,
        visibility_moderator_id,
        visibility_set_at
      FROM comments WHERE id = ?
    `, [id]);

    if (!visibility) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    res.json({
      status: 200,
      data: {
        visibility: visibility.visibility || 'public',
        allowedRoles: visibility.allowed_roles ? JSON.parse(visibility.allowed_roles) : [],
        allowedUsers: visibility.allowed_users ? JSON.parse(visibility.allowed_users) : [],
        expiresAt: visibility.visibility_expires_at,
        lastModifiedBy: visibility.visibility_moderator_id,
        lastModifiedAt: visibility.visibility_set_at
      },
      message: 'Comment visibility retrieved'
    });

  } catch (error) {
    logger.error('[CommentVisibility] Error getting visibility:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get comment visibility',
      details: error.message
    });
  }
});

// コメント公開範囲設定のバッチ更新
const batchUpdateCommentVisibility = asyncHandler(async (req, res) => {
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
    commentId: Joi.string().required(),
    visibility: Joi.string().valid('public', 'followers', 'members', 'private', 'moderators').required(),
    allowedRoles: Joi.array().items(Joi.string()).optional(),
    allowedUsers: Joi.array().items(Joi.string()).optional(),
    expiresAt: Joi.date().optional()
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
          'SELECT visibility, allowed_roles, allowed_users, visibility_expires_at FROM comments WHERE id = ?',
          [update.commentId]
        );

        if (!current) {
          failed++;
          results.push({ commentId: update.commentId, success: false, error: 'Comment not found' });
          continue;
        }

        // 更新を実行
        await dbRun(`
          UPDATE comments SET
            visibility = ?,
            allowed_roles = ?,
            allowed_users = ?,
            visibility_expires_at = ?,
            visibility_moderator_id = ?,
            visibility_set_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          update.visibility,
          JSON.stringify(update.allowedRoles || []),
          JSON.stringify(update.allowedUsers || []),
          update.expiresAt,
          moderatorId,
          update.commentId
        ]);

        // 履歴を記録
        await dbRun(`
          INSERT INTO comment_visibility_history
          (comment_id, moderator_id, action, old_visibility, new_visibility, old_allowed_roles, new_allowed_roles, old_allowed_users, new_allowed_users, expires_at, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          update.commentId,
          moderatorId,
          'batch_update',
          current.visibility,
          update.visibility,
          current.allowed_roles,
          JSON.stringify(update.allowedRoles || []),
          current.allowed_users,
          JSON.stringify(update.allowedUsers || []),
          update.expiresAt,
          reason || 'Batch visibility update'
        ]);

        completed++;
        results.push({ commentId: update.commentId, success: true });

      } catch (error) {
        failed++;
        results.push({ commentId: update.commentId, success: false, error: error.message });
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
    logger.error('[CommentVisibility] Error in batch update:', error);
    res.status(500).json({
      status: 500,
      message: 'Batch update failed',
      details: error.message
    });
  }
});

// コメント公開範囲設定履歴取得
const getCommentVisibilityHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const history = await dbAll(`
      SELECT
        moderator_id,
        action,
        old_visibility,
        new_visibility,
        expires_at,
        reason,
        created_at
      FROM comment_visibility_history
      WHERE comment_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), parseInt(offset)]);

    const formattedHistory = history.map(record => ({
      moderatorId: record.moderator_id,
      action: record.action,
      oldVisibility: record.old_visibility,
      newVisibility: record.new_visibility,
      expiresAt: record.expires_at,
      reason: record.reason,
      createdAt: record.created_at
    }));

    res.json({
      status: 200,
      data: {
        history: formattedHistory,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedHistory.length
        }
      },
      message: 'Comment visibility history retrieved'
    });

  } catch (error) {
    logger.error('[CommentVisibility] Error getting history:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get comment visibility history',
      details: error.message
    });
  }
});

// コメント通報
const reportComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    category,
    reason,
    description,
    evidence,
    priority = 'medium'
  } = req.body;

  const reporterId = req.user?.id || 'anonymous';

  // バリデーション
  const Joi = require('joi');
  const reportSchema = Joi.object({
    category: Joi.string().valid('spam', 'harassment', 'hate_speech', 'inappropriate_content', 'violence', 'self_harm', 'illegal_content', 'misinformation', 'copyright', 'other').required(),
    reason: Joi.string().required(),
    description: Joi.string().max(1000).optional(),
    evidence: Joi.string().max(1000).optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
  });

  const { error, value } = reportSchema.validate({
    category,
    reason,
    description,
    evidence,
    priority
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid report parameters',
      details: error.details
    });
  }

  try {
    // コメントの存在確認
    const comment = await dbGet('SELECT * FROM comments WHERE id = ?', [id]);
    if (!comment) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    // 既存の通報を確認（同じユーザーが同じコメントを重複通報しないようにする）
    const existingReport = await dbGet(
      'SELECT id FROM comment_reports WHERE comment_id = ? AND reporter_id = ? AND status != ?',
      [id, reporterId, 'dismissed']
    );

    if (existingReport) {
      return res.status(409).json({
        status: 409,
        message: 'You have already reported this comment'
      });
    }

    // 通報を作成
    const reportResult = await dbRun(`
      INSERT INTO comment_reports
      (comment_id, reporter_id, category, reason, description, evidence, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, reporterId, value.category, value.reason, value.description || null, value.evidence || null, value.priority, 'pending']);

    // コメントの通報数を更新
    await dbRun(`
      UPDATE comments SET
        report_count = report_count + 1,
        last_reported_at = CURRENT_TIMESTAMP,
        highest_report_priority = CASE
          WHEN highest_report_priority IS NULL THEN ?
          WHEN ? = 'urgent' THEN 'urgent'
          WHEN ? = 'high' AND highest_report_priority NOT IN ('urgent') THEN 'high'
          WHEN ? = 'medium' AND highest_report_priority = 'low' THEN 'medium'
          ELSE highest_report_priority
        END
      WHERE id = ?
    `, [value.priority, value.priority, value.priority, value.priority, id]);

    // 通報統計を更新
    const today = new Date().toISOString().split('T')[0];
    await dbRun(`
      INSERT OR REPLACE INTO report_statistics (date, category, total_reports)
      VALUES (?, ?, COALESCE((SELECT total_reports FROM report_statistics WHERE date = ? AND category = ?), 0) + 1)
    `, [today, value.category, today, value.category]);

    await commentService.invalidateCommentCache(id);
    await commentService.invalidateCommentListCache();

    res.status(201).json({
      status: 201,
      data: {
        reportId: reportResult.lastID,
        commentId: id,
        category: value.category,
        priority: value.priority,
        status: 'pending',
        reportedAt: new Date().toISOString()
      },
      message: 'Comment reported successfully'
    });

  } catch (error) {
    logger.error('[CommentReport] Error creating report:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to report comment',
      details: error.message
    });
  }
});

// コメント通報取得
const getCommentReports = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, limit = 50, offset = 0 } = req.query;

  try {
    let sql = `
      SELECT
        cr.id,
        cr.category,
        cr.reason,
        cr.description,
        cr.evidence,
        cr.status,
        cr.priority,
        cr.created_at,
        cr.updated_at,
        cr.resolved_at,
        u.username as reporter_username,
        u2.username as moderator_username
      FROM comment_reports cr
      LEFT JOIN users u ON cr.reporter_id = u.id
      LEFT JOIN users u2 ON cr.moderator_id = u2.id
      WHERE cr.comment_id = ?
    `;
    const params = [id];

    if (status) {
      sql += ' AND cr.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY cr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const reports = await dbAll(sql, params);

    const formattedReports = reports.map(report => ({
      id: report.id,
      category: report.category,
      reason: report.reason,
      description: report.description,
      evidence: report.evidence,
      status: report.status,
      priority: report.priority,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      resolvedAt: report.resolved_at,
      reporter: {
        id: report.reporter_id,
        username: report.reporter_username || 'anonymous'
      },
      moderator: report.moderator_id ? {
        id: report.moderator_id,
        username: report.moderator_username
      } : null
    }));

    res.json({
      status: 200,
      data: {
        reports: formattedReports,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedReports.length
        }
      },
      message: 'Comment reports retrieved'
    });

  } catch (error) {
    logger.error('[CommentReport] Error getting reports:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get comment reports',
      details: error.message
    });
  }
});

// 通報統計取得
const getReportStats = asyncHandler(async (req, res) => {
  const { period = '7d', category } = req.query;

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
        category,
        SUM(total_reports) as total_reports,
        SUM(resolved_reports) as resolved_reports,
        SUM(dismissed_reports) as dismissed_reports,
        AVG(avg_resolution_time_hours) as avg_resolution_time_hours
      FROM report_statistics
      WHERE date >= ?
    `;
    const params = [startDateStr];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' GROUP BY category ORDER BY total_reports DESC';

    const stats = await dbAll(sql, params);

    // 全体統計も取得
    const totalStats = await dbGet(`
      SELECT
        COUNT(*) as total_reports,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_reports,
        SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed_reports,
        AVG(CASE WHEN resolved_at IS NOT NULL THEN (strftime('%s', resolved_at) - strftime('%s', created_at)) / 3600.0 END) as avg_resolution_time_hours
      FROM comment_reports
      WHERE created_at >= ?
    `, [startDate.toISOString()]);

    res.json({
      status: 200,
      data: {
        period,
        startDate: startDateStr,
        endDate: now.toISOString().split('T')[0],
        categoryStats: stats,
        overallStats: {
          totalReports: totalStats?.total_reports || 0,
          resolvedReports: totalStats?.resolved_reports || 0,
          dismissedReports: totalStats?.dismissed_reports || 0,
          avgResolutionTimeHours: totalStats?.avg_resolution_time_hours || 0,
          resolutionRate: totalStats?.total_reports > 0 ?
            ((totalStats.resolved_reports + totalStats.dismissed_reports) / totalStats.total_reports * 100).toFixed(2) : 0
        }
      },
      message: 'Report statistics retrieved'
    });

  } catch (error) {
    logger.error('[CommentReport] Error getting stats:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get report statistics',
      details: error.message
    });
  }
});

// 通報カテゴリ取得
const getReportCategories = asyncHandler(async (req, res) => {
  try {
    const categories = await dbAll(`
      SELECT
        id,
        name,
        description,
        severity,
        enabled,
        created_at,
        updated_at
      FROM report_categories
      WHERE enabled = 1
      ORDER BY severity DESC, name ASC
    `);

    const formattedCategories = categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      severity: category.severity,
      enabled: Boolean(category.enabled),
      createdAt: category.created_at,
      updatedAt: category.updated_at
    }));

    res.json({
      status: 200,
      data: formattedCategories,
      message: 'Report categories retrieved'
    });

  } catch (error) {
    logger.error('[CommentReport] Error getting categories:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get report categories',
      details: error.message
    });
  }
});

// 通報カテゴリ更新
const updateReportCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    severity,
    enabled
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const categorySchema = Joi.object({
    name: Joi.string().max(100).optional(),
    description: Joi.string().max(500).optional(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    enabled: Joi.boolean().optional()
  });

  const { error, value } = categorySchema.validate({
    name,
    description,
    severity,
    enabled
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid category parameters',
      details: error.details
    });
  }

  try {
    const existing = await dbGet('SELECT * FROM report_categories WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        status: 404,
        message: 'Report category not found'
      });
    }

    // 更新するフィールドを構築
    const updateFields = [];
    const params = [];

    if (value.name !== undefined) {
      updateFields.push('name = ?');
      params.push(value.name);
    }

    if (value.description !== undefined) {
      updateFields.push('description = ?');
      params.push(value.description);
    }

    if (value.severity !== undefined) {
      updateFields.push('severity = ?');
      params.push(value.severity);
    }

    if (value.enabled !== undefined) {
      updateFields.push('enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    if (updateFields.length > 1) { // updated_at以外に更新がある場合
      const sql = `UPDATE report_categories SET ${updateFields.join(', ')} WHERE id = ?`;

      await dbRun(sql, params);

      res.json({
        status: 200,
        data: null,
        message: 'Report category updated'
      });
    } else {
      res.json({
        status: 200,
        data: null,
        message: 'No changes to update'
      });
    }

  } catch (error) {
    logger.error('[CommentReport] Error updating category:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to update report category',
      details: error.message
    });
  }
});

// コメント公開期限設定
const setCommentExpiry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    expiresAt,
    expiryReason,
    autoDeleteOnExpiry,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const expirySchema = Joi.object({
    expiresAt: Joi.date().min('now').optional(),
    expiryReason: Joi.string().max(500).optional(),
    autoDeleteOnExpiry: Joi.boolean().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = expirySchema.validate({
    expiresAt,
    expiryReason,
    autoDeleteOnExpiry,
    reason
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid expiry parameters',
      details: error.details
    });
  }

  try {
    // 現在の設定を取得
    const current = await dbGet(
      'SELECT expires_at, expiry_reason, auto_delete_on_expiry FROM comments WHERE id = ?',
      [id]
    );

    if (!current) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    // 更新を実行
    const updateFields = [];
    const params = [];

    if (value.expiresAt !== undefined) {
      updateFields.push('expires_at = ?');
      params.push(value.expiresAt);
    }

    if (value.expiryReason !== undefined) {
      updateFields.push('expiry_reason = ?');
      params.push(value.expiryReason);
    }

    if (value.autoDeleteOnExpiry !== undefined) {
      updateFields.push('auto_delete_on_expiry = ?');
      params.push(value.autoDeleteOnExpiry ? 1 : 0);
    }

    updateFields.push('expiry_moderator_id = ?');
    params.push(moderatorId);

    updateFields.push('expiry_set_at = CURRENT_TIMESTAMP');
    params.push(id);

    if (updateFields.length > 2) { // moderator_idとexpiry_set_at以外に更新がある場合
      const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

      await dbRun(sql, params);

      // 履歴を記録
      await dbRun(`
        INSERT INTO comment_expiry_history
        (comment_id, moderator_id, action, old_expires_at, new_expires_at, old_expiry_reason, new_expiry_reason, old_auto_delete, new_auto_delete, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        moderatorId,
        'set',
        current.expires_at,
        value.expiresAt,
        current.expiry_reason,
        value.expiryReason,
        Boolean(current.auto_delete_on_expiry),
        Boolean(value.autoDeleteOnExpiry),
        value.reason || 'Manual expiry setting'
      ]);

      await commentService.invalidateCommentCache(id);
      await commentService.invalidateCommentListCache();

      res.json({
        status: 200,
        data: {
          commentId: id,
          expiresAt: value.expiresAt,
          expiryReason: value.expiryReason,
          autoDeleteOnExpiry: Boolean(value.autoDeleteOnExpiry),
          moderatorId,
          setAt: new Date().toISOString()
        },
        message: 'Comment expiry updated'
      });
    } else {
      res.json({
        status: 200,
        data: null,
        message: 'No changes to update'
      });
    }

  } catch (error) {
    logger.error('[CommentExpiry] Error setting expiry:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to set comment expiry',
      details: error.message
    });
  }
});

// コメント公開期限取得
const getCommentExpiry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const expiry = await dbGet(`
      SELECT
        expires_at,
        expiry_reason,
        expiry_moderator_id,
        expiry_set_at,
        auto_delete_on_expiry
      FROM comments WHERE id = ?
    `, [id]);

    if (!expiry) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    res.json({
      status: 200,
      data: {
        expiresAt: expiry.expires_at,
        expiryReason: expiry.expiry_reason,
        autoDeleteOnExpiry: Boolean(expiry.auto_delete_on_expiry),
        lastModifiedBy: expiry.expiry_moderator_id,
        lastModifiedAt: expiry.expiry_set_at,
        isExpired: expiry.expires_at ? new Date(expiry.expires_at) < new Date() : false
      },
      message: 'Comment expiry retrieved'
    });

  } catch (error) {
    logger.error('[CommentExpiry] Error getting expiry:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get comment expiry',
      details: error.message
    });
  }
});

// 公開期限設定のバッチ更新
const batchUpdateCommentExpiry = asyncHandler(async (req, res) => {
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
    commentId: Joi.string().required(),
    expiresAt: Joi.date().min('now').optional(),
    expiryReason: Joi.string().max(500).optional(),
    autoDeleteOnExpiry: Joi.boolean().optional()
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
          'SELECT expires_at, expiry_reason, auto_delete_on_expiry FROM comments WHERE id = ?',
          [update.commentId]
        );

        if (!current) {
          failed++;
          results.push({ commentId: update.commentId, success: false, error: 'Comment not found' });
          continue;
        }

        // 更新を実行
        await dbRun(`
          UPDATE comments SET
            expires_at = ?,
            expiry_reason = ?,
            auto_delete_on_expiry = ?,
            expiry_moderator_id = ?,
            expiry_set_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          update.expiresAt,
          update.expiryReason,
          update.autoDeleteOnExpiry !== undefined ? (update.autoDeleteOnExpiry ? 1 : 0) : current.auto_delete_on_expiry,
          moderatorId,
          update.commentId
        ]);

        // 履歴を記録
        await dbRun(`
          INSERT INTO comment_expiry_history
          (comment_id, moderator_id, action, old_expires_at, new_expires_at, old_expiry_reason, new_expiry_reason, old_auto_delete, new_auto_delete, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          update.commentId,
          moderatorId,
          'batch_update',
          current.expires_at,
          update.expiresAt,
          current.expiry_reason,
          update.expiryReason,
          Boolean(current.auto_delete_on_expiry),
          Boolean(update.autoDeleteOnExpiry),
          reason || 'Batch expiry update'
        ]);

        completed++;
        results.push({ commentId: update.commentId, success: true });

        await commentService.invalidateCommentCache(update.commentId);
        await commentService.invalidateCommentListCache();

      } catch (error) {
        failed++;
        results.push({ commentId: update.commentId, success: false, error: error.message });
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
    logger.error('[CommentExpiry] Error in batch update:', error);
    res.status(500).json({
      status: 500,
      message: 'Batch update failed',
      details: error.message
    });
  }
});

// 期限切れコメントクリーンアップ
const cleanupExpiredComments = asyncHandler(async (req, res) => {
  try {
    const { deleteAfterDays = 7 } = req.body;

    // クリーンアップ設定を取得・更新
    const cleanupSettings = await dbGet('SELECT * FROM expiry_cleanup_settings WHERE id = 1');
    if (!cleanupSettings) {
      return res.status(500).json({
        status: 500,
        message: 'Cleanup settings not found'
      });
    }

    // 期限切れコメントを取得
    const expiredComments = await dbAll(`
      SELECT id, expires_at, auto_delete_on_expiry, created_at
      FROM comments
      WHERE expires_at IS NOT NULL
      AND expires_at < ?
      AND (auto_delete_on_expiry = 1 OR created_at < ?)
    `, [
      new Date().toISOString(),
      new Date(Date.now() - deleteAfterDays * 24 * 60 * 60 * 1000).toISOString()
    ]);

    let deleted = 0;
    let skipped = 0;

    // 期限切れコメントを処理
    for (const comment of expiredComments) {
      if (comment.auto_delete_on_expiry) {
        // 自動削除が有効な場合は削除
        await dbRun('DELETE FROM comments WHERE id = ?', [comment.id]);
        await commentService.invalidateCommentCache(comment.id);
        deleted++;
      } else {
        // 自動削除が無効な場合は非公開に設定
        await dbRun(`
          UPDATE comments SET
            status = 'hidden',
            expiry_reason = '自動非公開（期限切れ）'
          WHERE id = ?
        `, [comment.id]);
        await commentService.invalidateCommentCache(comment.id);
        skipped++;
      }
    }

    // クリーンアップ設定を更新
    await dbRun(`
      UPDATE expiry_cleanup_settings SET
        last_cleanup_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    await commentService.invalidateCommentListCache();

    res.json({
      status: 200,
      data: {
        totalExpired: expiredComments.length,
        deleted,
        skipped,
        deleteAfterDays,
        cleanupAt: new Date().toISOString(),
        nextCleanup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      message: `${expiredComments.length} expired comments processed (${deleted} deleted, ${skipped} hidden)`
    });

  } catch (error) {
    logger.error('[CommentExpiry] Error in cleanup:', error);
    res.status(500).json({
      status: 500,
      message: 'Cleanup failed',
      details: error.message
    });
  }
});

// 期限切れコメントの取得（プレビュー用）
const getExpiringComments = asyncHandler(async (req, res) => {
  const { withinHours = 24, limit = 50, offset = 0 } = req.query;

  try {
    const futureDate = new Date(Date.now() + withinHours * 60 * 60 * 1000).toISOString();

    const comments = await dbAll(`
      SELECT
        id,
        content,
        user,
        platform,
        expires_at,
        expiry_reason,
        auto_delete_on_expiry,
        created_at
      FROM comments
      WHERE expires_at IS NOT NULL
      AND expires_at BETWEEN ? AND ?
      AND status = 'visible'
      ORDER BY expires_at ASC
      LIMIT ? OFFSET ?
    `, [
      new Date().toISOString(),
      futureDate,
      parseInt(limit),
      parseInt(offset)
    ]);

    const formattedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      user: comment.user,
      platform: comment.platform,
      expiresAt: comment.expires_at,
      expiryReason: comment.expiry_reason,
      autoDeleteOnExpiry: Boolean(comment.auto_delete_on_expiry),
      createdAt: comment.created_at,
      timeUntilExpiry: Math.round((new Date(comment.expires_at) - new Date()) / (1000 * 60 * 60)) // 時間単位
    }));

    res.json({
      status: 200,
      data: {
        comments: formattedComments,
        withinHours: parseInt(withinHours),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedComments.length
        }
      },
      message: 'Expiring comments retrieved'
    });

  } catch (error) {
    logger.error('[CommentExpiry] Error getting expiring comments:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get expiring comments',
      details: error.message
    });
  }
});

// コメント固定表示設定
const setCommentPinningDisplay = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    pinnedDisplay,
    displayOrder,
    pinningReason,
    expiresAt,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const pinningSchema = Joi.object({
    pinnedDisplay: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().min(0).max(1000).optional(),
    pinningReason: Joi.string().max(500).optional(),
    expiresAt: Joi.date().min('now').optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = pinningSchema.validate({
    pinnedDisplay,
    displayOrder,
    pinningReason,
    expiresAt,
    reason
  });

  if (error) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid pinning parameters',
      details: error.details
    });
  }

  try {
    // 現在の設定を取得
    const current = await dbGet(
      'SELECT pinned_display, pinned_display_order, pinned_display_reason, pinned_display_expires_at FROM comments WHERE id = ?',
      [id]
    );

    if (!current) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    // 固定表示設定の制限を確認
    const pinningSettings = await dbGet('SELECT * FROM pinning_display_settings WHERE id = 1');
    if (!pinningSettings) {
      return res.status(500).json({
        status: 500,
        message: 'Pinning settings not found'
      });
    }

    // 新しい固定表示コメント数をチェック
    if (value.pinnedDisplay && !current.pinned_display) {
      const currentPinnedCount = await dbGet('SELECT COUNT(*) as count FROM comments WHERE pinned_display = 1');
      if (currentPinnedCount.count >= pinningSettings.max_pinned_comments) {
        return res.status(409).json({
          status: 409,
          message: `Maximum pinned comments limit (${pinningSettings.max_pinned_comments}) reached`
        });
      }
    }

    // 更新を実行
    const updateFields = [];
    const params = [];

    if (value.pinnedDisplay !== undefined) {
      updateFields.push('pinned_display = ?');
      params.push(value.pinnedDisplay ? 1 : 0);
    }

    if (value.displayOrder !== undefined) {
      updateFields.push('pinned_display_order = ?');
      params.push(value.displayOrder);
    }

    if (value.pinningReason !== undefined) {
      updateFields.push('pinned_display_reason = ?');
      params.push(value.pinningReason);
    }

    if (value.expiresAt !== undefined) {
      updateFields.push('pinned_display_expires_at = ?');
      params.push(value.expiresAt);
    }

    updateFields.push('pinned_display_moderator_id = ?');
    params.push(moderatorId);

    updateFields.push('pinned_display_set_at = CURRENT_TIMESTAMP');
    params.push(id);

    if (updateFields.length > 2) { // moderator_idとpinned_display_set_at以外に更新がある場合
      const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

      await dbRun(sql, params);

      // 履歴を記録
      await dbRun(`
        INSERT INTO comment_pinning_display_history
        (comment_id, moderator_id, action, old_pinned_display, new_pinned_display, old_display_order, new_display_order, old_expires_at, new_expires_at, old_reason, new_reason, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        moderatorId,
        'pin',
        Boolean(current.pinned_display),
        Boolean(value.pinnedDisplay),
        current.pinned_display_order,
        value.displayOrder,
        current.pinned_display_expires_at,
        value.expiresAt,
        current.pinned_display_reason,
        value.pinningReason,
        value.reason || 'Manual pinning display setting'
      ]);

      await commentService.invalidateCommentCache(id);
      await commentService.invalidateCommentListCache();

      res.json({
        status: 200,
        data: {
          commentId: id,
          pinnedDisplay: Boolean(value.pinnedDisplay),
          displayOrder: value.displayOrder,
          pinningReason: value.pinningReason,
          expiresAt: value.expiresAt,
          moderatorId,
          setAt: new Date().toISOString()
        },
        message: 'Comment pinning display updated'
      });
    } else {
      res.json({
        status: 200,
        data: null,
        message: 'No changes to update'
      });
    }

  } catch (error) {
    logger.error('[CommentPinningDisplay] Error setting pinning display:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to set comment pinning display',
      details: error.message
    });
  }
});

// コメント固定表示取得
const getCommentPinningDisplay = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const pinning = await dbGet(`
      SELECT
        pinned_display,
        pinned_display_order,
        pinned_display_reason,
        pinned_display_expires_at,
        pinned_display_moderator_id,
        pinned_display_set_at
      FROM comments WHERE id = ?
    `, [id]);

    if (!pinning) {
      return res.status(404).json({
        status: 404,
        message: 'Comment not found'
      });
    }

    res.json({
      status: 200,
      data: {
        pinnedDisplay: Boolean(pinning.pinned_display),
        displayOrder: pinning.pinned_display_order || 0,
        pinningReason: pinning.pinned_display_reason,
        expiresAt: pinning.pinned_display_expires_at,
        lastModifiedBy: pinning.pinned_display_moderator_id,
        lastModifiedAt: pinning.pinned_display_set_at,
        isExpired: pinning.pinned_display_expires_at ? new Date(pinning.pinned_display_expires_at) < new Date() : false
      },
      message: 'Comment pinning display retrieved'
    });

  } catch (error) {
    logger.error('[CommentPinningDisplay] Error getting pinning display:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get comment pinning display',
      details: error.message
    });
  }
});

// 固定表示設定のバッチ更新
const batchUpdatePinningDisplay = asyncHandler(async (req, res) => {
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
    commentId: Joi.string().required(),
    pinnedDisplay: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().min(0).max(1000).optional(),
    pinningReason: Joi.string().max(500).optional(),
    expiresAt: Joi.date().min('now').optional()
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

    // 固定表示設定を取得
    const pinningSettings = await dbGet('SELECT * FROM pinning_display_settings WHERE id = 1');
    if (!pinningSettings) {
      return res.status(500).json({
        status: 500,
        message: 'Pinning settings not found'
      });
    }

    // すべての更新を順次実行
    for (const update of validUpdates) {
      try {
        // 現在の設定を取得
        const current = await dbGet(
          'SELECT pinned_display, pinned_display_order, pinned_display_reason, pinned_display_expires_at FROM comments WHERE id = ?',
          [update.commentId]
        );

        if (!current) {
          failed++;
          results.push({ commentId: update.commentId, success: false, error: 'Comment not found' });
          continue;
        }

        // 新しい固定表示コメント数をチェック
        if (update.pinnedDisplay && !current.pinned_display) {
          const currentPinnedCount = await dbGet('SELECT COUNT(*) as count FROM comments WHERE pinned_display = 1');
          if (currentPinnedCount.count >= pinningSettings.max_pinned_comments) {
            failed++;
            results.push({ commentId: update.commentId, success: false, error: 'Maximum pinned comments limit reached' });
            continue;
          }
        }

        // 更新を実行
        await dbRun(`
          UPDATE comments SET
            pinned_display = ?,
            pinned_display_order = ?,
            pinned_display_reason = ?,
            pinned_display_expires_at = ?,
            pinned_display_moderator_id = ?,
            pinned_display_set_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          update.pinnedDisplay !== undefined ? (update.pinnedDisplay ? 1 : 0) : current.pinned_display,
          update.displayOrder !== undefined ? update.displayOrder : current.pinned_display_order,
          update.pinningReason !== undefined ? update.pinningReason : current.pinned_display_reason,
          update.expiresAt,
          moderatorId,
          update.commentId
        ]);

        // 履歴を記録
        await dbRun(`
          INSERT INTO comment_pinning_display_history
          (comment_id, moderator_id, action, old_pinned_display, new_pinned_display, old_display_order, new_display_order, old_expires_at, new_expires_at, old_reason, new_reason, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          update.commentId,
          moderatorId,
          'batch_update',
          Boolean(current.pinned_display),
          Boolean(update.pinnedDisplay),
          current.pinned_display_order,
          update.displayOrder,
          current.pinned_display_expires_at,
          update.expiresAt,
          current.pinned_display_reason,
          update.pinningReason,
          reason || 'Batch pinning display update'
        ]);

        completed++;
        results.push({ commentId: update.commentId, success: true });

        await commentService.invalidateCommentCache(update.commentId);
        await commentService.invalidateCommentListCache();

      } catch (error) {
        failed++;
        results.push({ commentId: update.commentId, success: false, error: error.message });
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
    logger.error('[CommentPinningDisplay] Error in batch update:', error);
    res.status(500).json({
      status: 500,
      message: 'Batch update failed',
      details: error.message
    });
  }
});

// 固定表示コメント一覧取得
const getPinnedComments = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, platform, orderBy = 'display_order' } = req.query;

  try {
    let sql = `
      SELECT
        c.id,
        c.content,
        c.user,
        c.platform,
        c.pinned_display,
        c.pinned_display_order,
        c.pinned_display_reason,
        c.pinned_display_expires_at,
        c.pinned_display_set_at,
        c.created_at,
        u.username as moderator_username
      FROM comments c
      LEFT JOIN users u ON c.pinned_display_moderator_id = u.id
      WHERE c.pinned_display = 1
    `;
    const params = [];

    if (platform) {
      sql += ' AND c.platform = ?';
      params.push(platform);
    }

    // ソート順を決定
    let orderClause = 'ORDER BY c.pinned_display_order ASC';
    switch (orderBy) {
      case 'recent':
        orderClause = 'ORDER BY c.pinned_display_set_at DESC';
        break;
      case 'oldest':
        orderClause = 'ORDER BY c.pinned_display_set_at ASC';
        break;
      case 'alphabetical':
        orderClause = 'ORDER BY c.content ASC';
        break;
      case 'platform':
        orderClause = 'ORDER BY c.platform ASC, c.pinned_display_order ASC';
        break;
      case 'display_order':
      default:
        orderClause = 'ORDER BY c.pinned_display_order ASC';
        break;
    }

    sql += ` ${orderClause} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const comments = await dbAll(sql, params);

    const formattedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      user: comment.user,
      platform: comment.platform,
      pinnedDisplay: Boolean(comment.pinned_display),
      displayOrder: comment.pinned_display_order || 0,
      pinningReason: comment.pinned_display_reason,
      expiresAt: comment.pinned_display_expires_at,
      setAt: comment.pinned_display_set_at,
      createdAt: comment.created_at,
      moderator: {
        id: comment.pinned_display_moderator_id,
        username: comment.moderator_username
      },
      isExpired: comment.pinned_display_expires_at ? new Date(comment.pinned_display_expires_at) < new Date() : false
    }));

    res.json({
      status: 200,
      data: {
        comments: formattedComments,
        orderBy,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: formattedComments.length
        }
      },
      message: 'Pinned comments retrieved'
    });

  } catch (error) {
    logger.error('[CommentPinningDisplay] Error getting pinned comments:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to get pinned comments',
      details: error.message
    });
  }
});

// 固定表示設定のクリーンアップ（期限切れの固定表示を解除）
const cleanupExpiredPinningDisplay = asyncHandler(async (req, res) => {
  try {
    // 期限切れの固定表示コメントを取得
    const expiredComments = await dbAll(`
      SELECT id, pinned_display_expires_at
      FROM comments
      WHERE pinned_display = 1
      AND pinned_display_expires_at IS NOT NULL
      AND pinned_display_expires_at < ?
    `, [new Date().toISOString()]);

    let unPinned = 0;

    // 期限切れの固定表示を解除
    for (const comment of expiredComments) {
      await dbRun(`
        UPDATE comments SET
          pinned_display = 0,
          pinned_display_reason = '自動解除（期限切れ）',
          pinned_display_moderator_id = 'system',
          pinned_display_set_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [comment.id]);

      // 履歴を記録
      await dbRun(`
        INSERT INTO comment_pinning_display_history
        (comment_id, moderator_id, action, old_pinned_display, new_pinned_display, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [comment.id, 'system', 'unpin', 1, 0, 'Automatic unpinning due to expiry']);

      await commentService.invalidateCommentCache(comment.id);
      unPinned++;
    }

    await commentService.invalidateCommentListCache();

    res.json({
      status: 200,
      data: {
        totalExpired: expiredComments.length,
        unPinned,
        cleanupAt: new Date().toISOString()
      },
      message: `${expiredComments.length} expired pinned displays cleaned up (${unPinned} unpinned)`
    });

  } catch (error) {
    logger.error('[CommentPinningDisplay] Error in cleanup:', error);
    res.status(500).json({
      status: 500,
      message: 'Cleanup failed',
      details: error.message
    });
  }
});

module.exports = {
  getComments,
  createComment,
  updateComment,
  setAvatar,
  setBackgroundColor,
  setHighlight,
  setPin,
  setAutoArchive,
  setExternalShare,
  getEditHistory,
  setNotificationFrequency,
  deleteComment,
  summarizeComments,
  autoAnswer,
  checkMessageHold,
  holdMessage,
  setCommentVisibility,
  getCommentVisibility,
  batchUpdateCommentVisibility,
  getCommentVisibilityHistory,
  reportComment,
  getCommentReports,
  getReportStats,
  getReportCategories,
  updateReportCategory,
  setCommentExpiry,
  getCommentExpiry,
  batchUpdateCommentExpiry,
  cleanupExpiredComments,
  getExpiringComments,
  setCommentPinningDisplay,
  getCommentPinningDisplay,
  batchUpdatePinningDisplay,
  getPinnedComments,
  cleanupExpiredPinningDisplay
};
