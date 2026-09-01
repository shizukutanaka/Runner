const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');
const moderationService = require('../services/moderationService');
const commentService = require('../services/commentService');
const departureDetector = require('../services/silentDepartureDetector');
const raidDetector = require('../services/raidDetector');
const { asyncHandler } = require('../middleware/errorHandler');

// HTTP経由のコメント作成/更新をWebSocketクライアントへブロードキャストする。
// 従来はsocket.io側のinboundイベント(newComment等)からのみ配信されており、
// POST/PUT /api/comments 経由の変更はリアルタイムに反映されなかった。
// server.js経由で起動していないテスト環境では io が未設定のため何もしない。
const broadcastCommentToIo = (io, type, comment) => {
  if (!io || !comment) {
    return;
  }
  const payload = { type, data: comment, timestamp: new Date().toISOString() };
  if (comment.platform) {
    io.to(`platform:${comment.platform}`).emit('commentUpdate', payload);
  }
  io.to('dashboard').emit('commentUpdate', payload);
};

const broadcastCommentUpdate = (req, type, comment) => {
  broadcastCommentToIo(req.app.get('io'), type, comment);
};

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
  case 'notification_frequency': {
    // 頻度のバリデーション（例: daily, weekly）
    const allowedFrequencies = ['immediate', 'daily', 'weekly', 'monthly'];
    if (value && !allowedFrequencies.includes(value)) {
      throw new Error('Invalid notification frequency');
    }
    return value.trim();
  }
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

const sanitizeForResponse = (value) => {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  return validator.escape(value);
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

const getComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const row = await dbGet('SELECT * FROM comments WHERE id = ?', [id]);
  if (!row) {
    return next(notFoundError());
  }

  res.json({
    status: 200,
    data: mapCommentRow(row),
    message: 'Comment fetched'
  });
});

/**
 * Runs a comment through the full moderation/hold/insert/broadcast pipeline.
 * Shared by the HTTP POST /api/comments handler and platform ingestion
 * services (e.g. YouTube) so both paths get identical moderation behavior.
 * @param {{content: string, user: string, platform: string, timestamp?: string}} commentData
 * @param {{io?: object}} [options]
 * @returns {Promise<object>} outcome descriptor: 'rate_limited' | 'rejected' | 'held' | 'created'
 */
// R-20: platformMessageId / authorChannelId は、モデレーション判断をプラット
// フォーム側へ書き戻す（YouTubeの liveChatMessages.delete / liveChatBans.insert）
// ために必須の識別子。取込元が提供する場合のみ保存する（HTTP経由の投稿では未指定）
const ingestComment = async ({ content, user, platform, timestamp, platformMessageId, authorChannelId }, { io } = {}) => {
  const ts = timestamp || new Date().toISOString();
  const commentId = uuidv4();
  const normalizedContent = sanitizeForStorage(normalizeText(content ?? ''));
  const normalizedUser = sanitizeForStorage(normalizeText(user ?? ''));

  // スローモードチェック
  const slowModeCheck = await checkSlowMode(normalizedUser, platform);
  if (!slowModeCheck.allowed) {
    return {
      outcome: 'rate_limited',
      remainingTime: slowModeCheck.remainingTime,
      nextAllowedTime: slowModeCheck.nextAllowedTime
    };
  }

  // R-25: レイド検知への記録と防御判定は **モデレーションより前** に行う。
  // 理由は2つ:
  //  (1) 防御モード中の攻撃メッセージを、個別モデレーションを待たずに即座に隔離するため
  //  (2) 個別モデレーションで拒否されるメッセージも検知器へ寄与させるため
  //      （従来は記録がINSERT後にあり、拒否された攻撃は協調攻撃の証拠として
  //        カウントされていなかった）
  try {
    raidDetector.record(platform, 'default', normalizedUser, normalizedContent, ts);
    const raidAlert = raidDetector.checkForAlert(platform, 'default');
    if (raidAlert && io) {
      io.to('dashboard').emit('raidAlert', raidAlert);
      io.to(`platform:${platform}`).emit('raidAlert', raidAlert);
    }
  } catch (raidErr) {
    logger.warn('[Comments] Failed to record activity for raid detection', { error: raidErr.message });
  }

  // 防御モード中の自動隔離。**拒否ではなく保留**（人間のレビューへ回す）に留める。
  // 根拠: Han et al. (CSCW 2023) の moderation-by-design。ガバナンス制約により
  // 自動処罰はせず、モデレーターは防御モードをいつでも手動解除できる
  try {
    const quarantine = raidDetector.shouldQuarantine(platform, 'default', normalizedUser, normalizedContent);
    if (quarantine.quarantine) {
      const raidStatus = raidDetector.analyze(platform, 'default');
      const holdResult = await holdMessage({
        content: normalizedContent,
        user: normalizedUser,
        platform,
        // holdMessage が参照するのは .score のみ（risk_score列へ格納）
        moderationResult: { score: raidStatus.score },
        platformMessageId,
        authorChannelId,
        holdReason: 'raid_defense',
        holdLevel: 'high',
        reasons: [{
          type: 'raid_defense',
          severity: 'high',
          trigger: quarantine.trigger,
          raidScore: raidStatus.score
        }]
      });
      logger.warn('[Comments] Comment quarantined by raid defense', {
        user: normalizedUser, platform, trigger: quarantine.trigger
      });
      return {
        outcome: 'held',
        holdId: holdResult.holdId,
        holdUntil: holdResult.holdUntil,
        holdLevel: holdResult.holdLevel,
        reasons: holdResult.reasons
      };
    }
  } catch (defErr) {
    // 防御の失敗が通常の取込を妨げてはならない（フェイルセーフ規約）
    logger.warn('[Comments] Raid defense check failed', { error: defErr.message });
  }

  const moderation = await moderationService.analyzeComment(normalizedContent, platform, normalizedUser, ts);
  const rejectionScore = getRejectionScore();
  const shouldReject = moderation.isSpam || moderation.isOffensive || (moderation.score ?? 0) >= rejectionScore;

  if (shouldReject) {
    logger.warn('[Comments] Comment rejected by moderation', {
      user,
      platform,
      score: moderation.score,
      flaggedWords: moderation.flaggedWords,
      flaggedCategories: moderation.flaggedCategories // R-14: 拒否理由のカテゴリを運用ログにも残す
    });
    return { outcome: 'rejected', moderation };
  }

  // メッセージ保留チェック（保留判定）
  const shouldHold = await checkMessageHold(normalizedContent, moderation, platform, normalizedUser);
  if (shouldHold.hold) {
    // 保留メッセージとして保存
    const holdResult = await holdMessage({
      content: normalizedContent,
      user: normalizedUser,
      platform,
      moderationResult: moderation,
      platformMessageId,
      authorChannelId,
      holdReason: shouldHold.primaryReason,
      holdLevel: shouldHold.holdLevel,
      reasons: shouldHold.reasons
    });

    return {
      outcome: 'held',
      holdId: holdResult.holdId,
      holdUntil: holdResult.holdUntil,
      holdLevel: shouldHold.holdLevel,
      reasons: shouldHold.reasons
    };
  }

  await dbRun(
    'INSERT INTO comments (id, content, user, platform, status, timestamp, platform_message_id, author_channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [commentId, normalizedContent, normalizedUser, platform, 'visible', ts, platformMessageId || null, authorChannelId || null]
  );

  // ユーザーの最終コメント時刻を更新
  await dbRun(
    'UPDATE users SET last_comment_at = ? WHERE id = ?',
    [ts, normalizedUser]
  );

  // サイレント離脱検知へアクティビティを記録する（R-19）。従来この検知器は
  // 手動の /record-activity エンドポイントからしかデータを受け取れず、通常の
  // コメント投稿では一切データが供給されていなかった（＝機能が実質的に空回り）。
  // insightsのUIは channelId='default' で問い合わせるため、それに合わせて記録する。
  // 検知器はin-memoryのため失敗しても本処理に影響させない
  try {
    departureDetector.record(platform, 'default', normalizedUser, ts);
  } catch (recordErr) {
    logger.warn('[Comments] Failed to record activity for departure detection', { error: recordErr.message });
  }

  // R-25: レイド検知への記録・通知は ingestComment の冒頭（モデレーション前）へ移動した。
  // 拒否されたメッセージも協調攻撃の証拠としてカウントするためで、ここでは何もしない。

  const created = await dbGet('SELECT * FROM comments WHERE id = ?', [commentId]);
  await commentService.invalidateCommentCache(commentId);
  await commentService.invalidateCommentListCache();
  const mapped = mapCommentRow(created);
  broadcastCommentToIo(io, 'new', mapped);
  return { outcome: 'created', comment: mapped };
};

const createComment = asyncHandler(async (req, res, next) => {
  const { content, user, platform } = req.body;

  try {
    const result = await ingestComment({ content, user, platform }, { io: req.app.get('io') });

    switch (result.outcome) {
    case 'rate_limited':
      return res.status(429).json({
        status: 429,
        data: {
          remainingTime: result.remainingTime,
          nextAllowedTime: result.nextAllowedTime
        },
        message: `スローモードが有効です。${result.remainingTime}秒後にコメントできます。`
      });
    case 'rejected':
      return res.status(422).json({
        status: 422,
        data: { moderation: result.moderation },
        message: 'Comment rejected by moderation policies'
      });
    case 'held':
      return res.status(202).json({
        status: 202,
        data: {
          holdId: result.holdId,
          holdUntil: result.holdUntil,
          holdLevel: result.holdLevel,
          reasons: result.reasons
        },
        message: 'メッセージが保留されました。モデレーターの確認をお待ちください。'
      });
    default:
      return res.status(201).json({
        status: 201,
        data: result.comment,
        message: 'Comment created'
      });
    }
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
    broadcastCommentUpdate(req, 'update', mapCommentRow(updated));
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
    // E-29: ここは存在しないテーブル `comment_edits` を、存在しない列
    // （`editor` / `new_content`）で引いていたため**必ず500**だった。
    // 実体は `comment_edit_history(comment_id, previous_content, edited_at, editor_id)`
    // で、書き込んでいるのは commentService.js。`new_content` は保存されていない
    // （編集後の本文は comments.content が持つ）ので、応答からも落とす。
    // 編集そのものは未実装なので通常この配列は空になるが、**空配列と500は違う**。
    const history = await dbAll(
      'SELECT editor_id, previous_content, edited_at FROM comment_edit_history WHERE comment_id = ? ORDER BY edited_at DESC',
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
        editor: entry.editor_id,
        previousContent: entry.previous_content,
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

    // R-28: プラットフォーム側へ削除を書き戻す。
    // これが無いと「ダッシュボードでは削除済み・YouTube上では見えたまま」という
    // 製品の中核価値が成立しない状態になる（R-20の第一原理分析で発見した欠落）。
    // OAuth未設定・識別子なし・クォータ超過のいずれでも**ローカル削除は維持**し、
    // 結果を platformDeletion としてレスポンスに含めて透明性を担保する
    let platformDeletion = { attempted: false, ok: false, reason: 'not_attempted' };
    if (existing.platform === 'youtube' && existing.platform_message_id) {
      // 遅延require: youtubeIngestionService は commentsController を require するため、
      // トップレベルで読むと循環参照になり一方が未初期化のまま解決される
      // eslint-disable-next-line global-require
      const youtubeIngestionService = require('../services/youtubeIngestionService');
      platformDeletion = { attempted: true, ...(await youtubeIngestionService.deleteLiveChatMessage(existing.platform_message_id)) };
      if (!platformDeletion.ok) {
        logger.warn('[Comments] Local delete succeeded but platform write-back did not', {
          id, reason: platformDeletion.reason
        });
      }
    } else if (existing.platform === 'youtube') {
      platformDeletion.reason = 'missing_platform_message_id';
    } else {
      platformDeletion.reason = 'unsupported_platform';
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
        evidence: value.evidence,
        // R-28: プラットフォーム側へ実際に反映できたかを必ず返す。
        // 「ダッシュボードでは消えたがYouTubeでは残っている」状態を
        // モデレーターが検知できるようにするため（黙って失敗させない）
        platformDeletion
      },
      message: platformDeletion.ok
        ? 'Comment deleted locally and on the platform'
        : 'Comment deleted locally (platform write-back not applied)'
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
// R-26: 累犯エスカレーション
//
// 関連ソフトウェア（Nightbot / Moobot / StreamElements 等の主要モデレーションBot）は
// いずれも「警告 → タイムアウト → BAN」という**段階的な処罰**を標準機能として持つ。
// 一方、本製品の自動判定は**初犯と常習犯をまったく同じに扱っていた**（同じコメントなら
// 過去に何度フラグされていても結果は同一）。同一の発言でも、繰り返す相手には
// より強い対応を取るのがモデレーションの基本であり、この層が欠けていた。
//
// 直近ウィンドウ内の違反回数を数えて重大度を上げる。**BANは自動で行わず**、
// 保留（人間レビュー）とモデレーターへの推奨提示に留める（R-24/R-25と同じガバナンス制約）。
const VIOLATION_WINDOW_HOURS = 24;

const countRecentViolations = async (user, platform) => {
  try {
    const since = new Date(Date.now() - VIOLATION_WINDOW_HOURS * 3600 * 1000).toISOString();
    const [commentRow, heldRow] = await Promise.all([
      dbGet(
        `SELECT COUNT(*) as cnt FROM comments
         WHERE user = ? AND platform = ? AND timestamp >= ?
           AND status IN ('deleted','hidden','flagged','muted')`,
        [user, platform, since]
      ),
      dbGet(
        `SELECT COUNT(*) as cnt FROM held_messages
         WHERE user = ? AND platform = ? AND created_at >= ? AND status IN ('pending','rejected')`,
        [user, platform, since]
      )
    ]);
    return (commentRow?.cnt || 0) + (heldRow?.cnt || 0);
  } catch (err) {
    // 履歴が引けなくても通常のモデレーションは続行する（フェイルセーフ規約）
    logger.warn('[Comments] Failed to count recent violations', { user, error: err.message });
    return 0;
  }
};

// 違反回数から推奨アクションを決める。実際の処罰は人間が行う
const escalationFor = (violations) => {
  if (violations >= 5) return { level: 'ban_recommended', severity: 'high', action: 'BANを検討してください' };
  if (violations >= 3) return { level: 'timeout_recommended', severity: 'high', action: 'タイムアウトを検討してください' };
  if (violations >= 1) return { level: 'warned', severity: 'medium', action: '経過を注視してください' };
  return { level: 'first_offense', severity: 'low', action: null };
};

const checkMessageHold = async (content, moderationResult, platform, user) => {
  try {
    // 保留のしきい値。現状はコード内定数（実際に判定へ使われる実値であり
    // プレースホルダではない）。運用者がUIから調整できるようにする場合は
    // 設定テーブルからの読み込みに置き換える
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
    const foundKeywords = holdSettings.suspiciousKeywords.filter((keyword) =>
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
    // R-23: sentimentScore は「感情価（valence）」で、**低いほどネガティブ**（negative=0.2 /
    // neutral=0.5 / positive=0.75）。一方 negativeSentimentThreshold(0.8) は
    // 「どれだけネガティブか」の強度を意味する。旧実装は valence をそのまま
    // `>= 0.8` と比較していたため、ネガティブ判定時のスコアは常に0.2で
    // **条件が成立しえず、この保留ルールは一度も発火していなかった**。
    // valence を強度（negativity = 1 - valence）へ変換してから比較する
    const negativity = 1 - (moderationResult.sentimentScore ?? 0.5);
    if (moderationResult.sentiment === 'negative' && negativity >= holdSettings.negativeSentimentThreshold) {
      reasons.push({
        type: 'negative_sentiment',
        severity: 'medium',
        sentimentScore: moderationResult.sentimentScore,
        negativity: Math.round(negativity * 100) / 100,
        threshold: holdSettings.negativeSentimentThreshold
      });
    }

    // R-26: 累犯エスカレーション。**エスカレーションは既存の疑いを強めるものであって、
    // それ単体で保留を発生させてはならない**。当初これを無条件に追加したところ、
    // 過去に1件でも違反のあるユーザーの「無害なコメントまで全て保留」される
    // 過剰な挙動になり既存テストが12件失敗した（実測）。主要Bot（Nightbot等）でも
    // エスカレーションは「フィルタに引っかかったとき」に段階が上がる設計である。
    // よって他の理由が1つ以上ある場合にのみ、重大度と推奨アクションを付与する
    if (user && reasons.length > 0) {
      const violations = await countRecentViolations(user, platform);
      if (violations >= 1) {
        const esc = escalationFor(violations);
        reasons.push({
          type: 'repeat_offender',
          severity: esc.severity,
          violations,
          windowHours: VIOLATION_WINDOW_HOURS,
          escalation: esc.level,
          recommendedAction: esc.action
        });
      }
    }

    // R-14: NGワードのカテゴリ（abuse/threat/spam）が判明している場合は
    // 構造化された理由としてキューに残す（モデレーターがなぜ保留されたかを即座に把握できる）
    if (Array.isArray(moderationResult.flaggedCategories) && moderationResult.flaggedCategories.length > 0) {
      reasons.push({
        type: 'ng_word_category',
        severity: moderationResult.flaggedCategories.includes('threat') ? 'high' : 'medium',
        categories: moderationResult.flaggedCategories,
        words: moderationResult.flaggedWords || []
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
      reasons,
      // R-28c: 却下時にプラットフォームへ書き戻すための識別子
      platformMessageId,
      authorChannelId
    } = holdData;

    // 保留期間計算
    const holdDurations = { low_risk: 300, medium_risk: 1800, high_risk: 3600 };
    const durationSeconds = holdDurations[`${holdLevel}_risk`] || holdDurations.medium_risk;
    const holdUntil = new Date(Date.now() + durationSeconds * 1000).toISOString();
    const messageId = `msg_${Date.now()}`;

    const insertResult = await dbRun(
      `INSERT INTO held_messages
        (message_id, content, user, platform, hold_reason, risk_score, hold_level, reasons, status, hold_until, platform_message_id, author_channel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [messageId, content, user, platform, holdReason, moderationResult.score, holdLevel, JSON.stringify(reasons), holdUntil,
        platformMessageId || null, authorChannelId || null]
    );

    // ログ記録
    logger.info('[MessageHold] Message held for moderation', {
      user,
      platform,
      holdReason,
      holdLevel,
      riskScore: moderationResult.score
    });

    return {
      holdId: insertResult.lastID,
      holdUntil,
      holdLevel,
      durationSeconds,
      reasons
    };
  } catch (error) {
    logger.error('[MessageHold] Error holding message:', error);
    throw error;
  }
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

    const formattedHistory = history.map((record) => ({
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
// ---------------------------------------------------------------------------
// 削除記録（2026-09-01・E-28）
// ---------------------------------------------------------------------------
// ここには「通報」「有効期限」「ピン留め表示」の3機能・15ハンドラ・1,410行があった。
// いずれもルーティングされておらず、外部から到達不能だった。それだけなら
// 「未接続の実装」だが、実態はもっと悪く、参照している8テーブル
// （comment_reports / report_categories / report_statistics /
//  expiry_cleanup_settings / pinning_display_settings /
//  comment_expiry_history / comment_pinning_display_history）が
// **db.js のスキーマに1つも存在しない**。つまり仮に配線しても
// 全て "no such table" で落ちる。動いたことは一度も無い。
//
// 読んだ人に「通報機能はある（あとは繋ぐだけ）」と思わせるコストの方が
// 高いので削除した。必要になったらスキーマから設計し直すこと。
// 全文は git log に残っている。

module.exports = {
  getComments,
  getComment,
  createComment,
  ingestComment,
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
  setCommentVisibility,
  getCommentVisibility,
  batchUpdateCommentVisibility,
  getCommentVisibilityHistory
};
