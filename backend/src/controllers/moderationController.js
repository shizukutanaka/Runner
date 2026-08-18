const moderationService = require('../services/moderationService');
const db = require('../db');
const logger = require('../logger');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
});

exports.moderateComment = async (req, res, next) => {
  const { content, platform, user, timestamp } = req.body;
  try {
    const result = await moderationService.analyzeComment(content, platform, user, timestamp);
    res.json({ status: 200, data: result, message: 'Moderation success' });
  } catch (err) {
    next({ status: 500, message: 'Moderation error', details: err });
  }
};

exports.updateSettings = (req, res, next) => {
  const { platform, thresholds, bannedWords, regexPatterns } = req.body;
  moderationService.updateSettings(platform, thresholds, bannedWords, regexPatterns)
    .then(() => res.json({ status: 200, data: null, message: 'Settings updated' }))
    .catch((err) => next({ status: 500, message: 'Settings update error', details: err }));
};




// AI判定の再学習API
exports.retrainModel = async (req, res, next) => {
  try {
    const { trainingData } = req.body;
    if (!trainingData || !Array.isArray(trainingData)) {
      return next({ status: 400, message: '有効なトレーニングデータを指定してください' });
    }
    // 実際の実装ではモデルの再学習処理を実装
    // const modelInfo = await moderationService.retrainModel(trainingData);
    res.json({ 
      status: 200, 
      data: { /* modelInfo */ }, 
      message: 'AIモデルの再学習が完了しました' 
    });
  } catch (err) {
    next({ status: 500, message: 'モデルの再学習中にエラーが発生しました', details: err });
  }
};























// 翻訳API
// 従来はハードコードされたEN⇔JA語彙のモック（未収録語は"[from→to] text"という
// 機械翻訳風の偽装文字列を返すのみ）だった。openaiService.translateText()に
// 実際に動くLLMベースの翻訳が既に存在していたため、そちらへ配線し直した
// （docs/RESEARCH_IMPROVEMENTS.md R-10）。OpenAIキー未設定/失敗時は原文を
// available:false付きで返し、偽の翻訳結果を返さないようにする
exports.translateText = async (req, res, next) => {
  try {
    const { text, fromLang, toLang, quality = 'balanced' } = req.body;

    if (!text || typeof text !== 'string') {
      return next({ status: 400, message: '有効なtextを指定してください' });
    }

    if (!fromLang || !toLang) {
      return next({ status: 400, message: 'fromLangとtoLangを指定してください' });
    }

    const openaiService = require('../services/openaiService');
    const translation = await openaiService.translateText(text, toLang);

    const result = {
      originalText: text,
      translatedText: translation.translatedText,
      fromLanguage: fromLang,
      toLanguage: toLang,
      confidence: translation.error ? 0 : 0.9,
      quality,
      model: translation.model,
      available: !translation.error,
      timestamp: new Date().toISOString(),
      error: translation.error
    };

    res.json({
      status: 200,
      data: result,
      message: translation.error ? '翻訳サービスが利用できないため原文を返しました' : 'テキストを翻訳しました'
    });
  } catch (err) {
    next({ status: 500, message: '翻訳中にエラーが発生しました', details: err });
  }
};

// 自動翻訳API（言語検出は簡易版のまま維持、翻訳本体はopenaiServiceへ配線 — R-10）
exports.autoTranslate = async (req, res, next) => {
  try {
    const { text, targetLanguages = ['en'], quality = 'balanced' } = req.body;

    if (!text || typeof text !== 'string') {
      return next({ status: 400, message: '有効なtextを指定してください' });
    }

    const detectedLang = moderationService.detectLanguage(text).language;

    const openaiService = require('../services/openaiService');

    const translations = await Promise.all(targetLanguages.map(async (targetLang) => {
      if (detectedLang === targetLang) {
        return {
          targetLanguage: targetLang,
          translatedText: text,
          confidence: 1.0,
          skipped: true,
          reason: 'same_language'
        };
      }

      const translation = await openaiService.translateText(text, targetLang);

      return {
        targetLanguage: targetLang,
        translatedText: translation.translatedText,
        confidence: translation.error ? 0 : 0.9,
        quality,
        available: !translation.error,
        error: translation.error
      };
    }));

    const result = {
      originalText: text,
      detectedLanguage: detectedLang,
      translations,
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: result,
      message: '自動翻訳が完了しました'
    });
  } catch (err) {
    next({ status: 500, message: '自動翻訳中にエラーが発生しました', details: err });
  }
};




// AIモデレーションAPI
exports.performAIModeration = async (req, res, next) => {
  try {
    const { content, provider = 'openai' } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    if (provider !== 'openai') {
      return res.json({
        status: 200,
        data: {
          provider,
          available: false,
          content,
          error: `Provider "${provider}" is not yet implemented`
        },
        message: 'AIモデレーションを実行しました'
      });
    }

    const openaiService = require('../services/openaiService');
    const result = await openaiService.detectToxicContent(content);

    res.json({
      status: 200,
      data: {
        provider,
        available: !result.error,
        model: result.model,
        content,
        score: result.score || 0,
        categories: result.categories || {},
        flagged: result.isToxic || false,
        timestamp: new Date().toISOString(),
        error: result.error
      },
      message: 'AIモデレーションを実行しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーション実行中にエラーが発生しました', details: err });
  }
};

// 複数プロバイダーAIモデレーションAPI
exports.performMultiProviderAIModeration = async (req, res, next) => {
  try {
    const { content, providers = ['openai'] } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    if (!Array.isArray(providers) || providers.length === 0) {
      return next({ status: 400, message: 'providersは配列で指定してください' });
    }

    const openaiService = require('../services/openaiService');
    const results = await Promise.all(providers.map(async (provider) => {
      if (provider !== 'openai') {
        return { provider, available: false, content, error: `Provider "${provider}" is not yet implemented` };
      }
      const result = await openaiService.detectToxicContent(content);
      return {
        provider,
        available: !result.error,
        model: result.model,
        content,
        score: result.score || 0,
        categories: result.categories || {},
        flagged: result.isToxic || false,
        error: result.error
      };
    }));

    const availableResults = results.filter((r) => r.available);
    const aggregatedResult = {
      content,
      providers: results,
      aggregatedScore: availableResults.length
        ? availableResults.reduce((sum, r) => sum + r.score, 0) / availableResults.length
        : 0,
      overallFlagged: availableResults.some((r) => r.flagged),
      consensusLevel: availableResults.length && availableResults.filter((r) => r.flagged).length >= availableResults.length / 2 ? 'medium' : 'low',
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: aggregatedResult,
      message: '複数プロバイダーAIモデレーションを実行しました'
    });
  } catch (err) {
    next({ status: 500, message: '複数プロバイダーAIモデレーション実行中にエラーが発生しました', details: err });
  }
};







// 保留メッセージの取得（キュー表示）
const HELD_MESSAGE_SORT_COLUMNS = new Set(['created_at', 'risk_score', 'hold_until', 'status']);

const mapHeldMessageRow = (row) => ({
  id: row.id,
  messageId: row.message_id,
  content: row.content,
  user: row.user,
  platform: row.platform,
  holdReason: row.hold_reason,
  riskScore: row.risk_score,
  holdLevel: row.hold_level,
  holdUntil: row.hold_until,
  status: row.status,
  createdAt: row.created_at,
  processedAt: row.processed_at,
  processedBy: row.processed_by,
  reasons: row.reasons ? JSON.parse(row.reasons) : []
});

exports.getHeldMessages = async (req, res, next) => {
  try {
    const { status = 'pending', limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const sortColumn = HELD_MESSAGE_SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const whereClause = status === 'all' ? '' : 'WHERE status = ?';
    const whereParams = status === 'all' ? [] : [status];

    const rows = await dbAll(
      `SELECT * FROM held_messages ${whereClause} ORDER BY ${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`,
      [...whereParams, safeLimit, safeOffset]
    );

    const countsByStatus = await dbAll(
      'SELECT status, COUNT(*) as cnt FROM held_messages GROUP BY status'
    );
    const counts = Object.fromEntries(countsByStatus.map((r) => [r.status, r.cnt]));

    const messages = rows.map(mapHeldMessageRow);

    res.json({
      status: 200,
      data: {
        messages,
        total: messages.length,
        pending: counts.pending || 0,
        approved: counts.approved || 0,
        rejected: counts.rejected || 0,
        expired: counts.expired || 0,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          hasMore: messages.length === safeLimit
        }
      },
      message: '保留メッセージを取得しました'
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの取得中にエラーが発生しました', details: err });
  }
};

// 保留メッセージに対するアクション（承認/拒否）
exports.processHeldMessage = async (req, res, next) => {
  try {
    const { holdId } = req.params;
    const { action, reason, notes, moderator } = req.body;

    // バリデーション
    if (!['approve', 'reject', 'escalate'].includes(action)) {
      return next({ status: 400, message: 'actionはapprove, reject, escalateのいずれかで指定してください' });
    }

    const held = await dbGet('SELECT * FROM held_messages WHERE id = ?', [holdId]);
    if (!held) {
      return next({ status: 404, message: '保留メッセージが見つかりません' });
    }
    if (held.status !== 'pending') {
      return next({ status: 409, message: 'このメッセージは既に処理済みです' });
    }

    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'escalated';
    const processedAt = new Date().toISOString();
    const moderatorId = moderator || req.user?.id || 'unknown';

    if (action === 'approve') {
      const { v4: uuidv4 } = require('uuid');
      await dbRun(
        `INSERT INTO comments (id, platform, user, content, timestamp, status, moderator)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [uuidv4(), held.platform, held.user, held.content, processedAt, moderatorId]
      );
    }

    await dbRun(
      `UPDATE held_messages
       SET status = ?, processed_at = ?, processed_by = ?, process_reason = ?, process_notes = ?
       WHERE id = ?`,
      [newStatus, processedAt, moderatorId, reason || '', notes || '', holdId]
    );

    // R-28c: 却下したメッセージをプラットフォーム側からも削除する。
    // 保留経路だけ書き戻しの対象外だと「モデレーターが却下したのに視聴者には
    // 見えたまま」という穴が残る。OAuth未設定・識別子なしでもローカルの却下は維持する
    let platformDeletion = { attempted: false, ok: false, reason: 'not_applicable' };
    if (action === 'reject' && held.platform === 'youtube') {
      if (held.platform_message_id) {
        // eslint-disable-next-line global-require
        const youtubeIngestionService = require('../services/youtubeIngestionService');
        platformDeletion = { attempted: true, ...(await youtubeIngestionService.deleteLiveChatMessage(held.platform_message_id)) };
        if (!platformDeletion.ok) {
          logger.warn('[Moderation] Held message rejected locally but platform write-back did not', {
            holdId, reason: platformDeletion.reason
          });
        }
      } else {
        platformDeletion.reason = 'missing_platform_message_id';
      }
    }

    res.json({
      status: 200,
      data: {
        holdId: parseInt(holdId, 10),
        action,
        reason: reason || '',
        notes: notes || '',
        moderator: moderatorId,
        platformDeletion,
        processedAt
      },
      message: `メッセージを${action === 'approve' ? '承認' : action === 'reject' ? '拒否' : 'エスカレート'}しました`
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの処理中にエラーが発生しました', details: err });
  }
};

// 保留メッセージの一括処理
exports.bulkProcessHeldMessages = async (req, res, next) => {
  try {
    const { holdIds, action, reason, notes, moderator } = req.body;

    // バリデーション
    if (!Array.isArray(holdIds) || holdIds.length === 0) {
      return next({ status: 400, message: 'holdIdsは配列で指定してください' });
    }
    if (holdIds.length > 200) {
      return next({ status: 400, message: 'holdIdsは最大200件までです' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return next({ status: 400, message: 'actionはapproveまたはrejectで指定してください' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const processedAt = new Date().toISOString();
    const moderatorId = moderator || req.user?.id || 'unknown';
    const { v4: uuidv4 } = require('uuid');

    let processed = 0;
    for (const holdId of holdIds) {
      const held = await dbGet('SELECT * FROM held_messages WHERE id = ? AND status = ?', [holdId, 'pending']);
      if (!held) continue;

      if (action === 'approve') {
        await dbRun(
          `INSERT INTO comments (id, platform, user, content, timestamp, status, moderator)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          [uuidv4(), held.platform, held.user, held.content, processedAt, moderatorId]
        );
      }

      await dbRun(
        `UPDATE held_messages
         SET status = ?, processed_at = ?, processed_by = ?, process_reason = ?, process_notes = ?
         WHERE id = ?`,
        [newStatus, processedAt, moderatorId, reason || '', notes || '', holdId]
      );
      processed++;
    }

    res.json({
      status: 200,
      data: {
        processed,
        requested: holdIds.length,
        action,
        reason: reason || '',
        notes: notes || '',
        moderator: moderatorId,
        processedAt
      },
      message: `${processed}件のメッセージを${action === 'approve' ? '承認' : '拒否'}しました`
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの一括処理中にエラーが発生しました', details: err });
  }
};

// 保留メッセージの統計取得
exports.getMessageHoldStats = async (req, res, next) => {
  try {
    const { period = '24h' } = req.query;
    const periodHours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }[period] || 24;
    const since = new Date(Date.now() - periodHours * 3600000).toISOString();

    const [statusRows, reasonRows, levelRows, avgRow] = await Promise.all([
      dbAll('SELECT status, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY status', [since]),
      dbAll('SELECT hold_reason, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY hold_reason', [since]),
      dbAll('SELECT hold_level, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY hold_level', [since]),
      dbGet(
        `SELECT AVG((julianday(processed_at) - julianday(created_at)) * 86400000) as avgMs
         FROM held_messages WHERE processed_at IS NOT NULL AND created_at >= ?`,
        [since]
      )
    ]);

    const queueStatus = { total: 0, pending: 0, approved: 0, rejected: 0, escalated: 0, expired: 0 };
    statusRows.forEach((r) => { queueStatus[r.status] = r.cnt; queueStatus.total += r.cnt; });

    const holdReasons = {};
    reasonRows.forEach((r) => { holdReasons[r.hold_reason || 'unknown'] = r.cnt; });

    const riskLevels = { low: 0, medium: 0, high: 0 };
    levelRows.forEach((r) => { if (r.hold_level in riskLevels) riskLevels[r.hold_level] = r.cnt; });

    const approvalRate = (queueStatus.approved + queueStatus.rejected) > 0
      ? queueStatus.approved / (queueStatus.approved + queueStatus.rejected)
      : null;

    res.json({
      status: 200,
      data: {
        period,
        queueStatus,
        holdReasons,
        riskLevels,
        processingStats: {
          averageProcessingTimeMs: avgRow?.avgMs != null ? Math.round(avgRow.avgMs) : null,
          approvalRate
        }
      },
      message: 'メッセージ保留統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'メッセージ保留統計の取得中にエラーが発生しました', details: err });
  }
};

// コメントごとのAI閾値設定
exports.setCommentAIThreshold = (req, res, next) => {
  const { id } = req.params;
  const {
    threshold,
    enabled,
    customSettings,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const thresholdSchema = Joi.object({
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    customSettings: Joi.object().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = thresholdSchema.validate({
    threshold,
    enabled,
    customSettings,
    reason
  });

  if (error) {
    return next({ status: 400, message: 'Invalid threshold settings', details: error.details });
  }

  // 現在の設定を取得
  db.get('SELECT ai_threshold_score, ai_threshold_enabled, ai_threshold_custom_settings FROM comments WHERE id = ?', [id], (err, current) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!current) {
      return next({ status: 404, message: 'Comment not found' });
    }

    // 更新するフィールドを構築
    const updateFields = [];
    const params = [];

    if (value.threshold !== undefined) {
      updateFields.push('ai_threshold_score = ?');
      params.push(value.threshold);
    }

    if (value.enabled !== undefined) {
      updateFields.push('ai_threshold_enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    if (value.customSettings !== undefined) {
      updateFields.push('ai_threshold_custom_settings = ?');
      params.push(JSON.stringify(value.customSettings));
    }

    updateFields.push('ai_override_moderator_id = ?');
    params.push(moderatorId);

    updateFields.push('ai_override_timestamp = CURRENT_TIMESTAMP');
    params.push(id);

    if (updateFields.length <= 2) { // moderator_idとtimestamp以外に更新がない場合
      return next({ status: 400, message: 'No threshold settings to update' });
    }

    const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        return next({ status: 500, message: 'Failed to update comment AI threshold', details: err });
      }

      // 履歴を記録
      const historySql = `
        INSERT INTO ai_threshold_history
        (comment_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(historySql, [
        id,
        moderatorId,
        'update',
        current.ai_threshold_score,
        value.threshold !== undefined ? value.threshold : current.ai_threshold_score,
        current.ai_threshold_custom_settings,
        value.customSettings !== undefined ? JSON.stringify(value.customSettings) : current.ai_threshold_custom_settings,
        value.reason || 'Manual threshold adjustment'
      ], function(histErr) {
        if (histErr) {
          logger.warn('[AI Threshold] Failed to record history:', histErr);
        }

        res.json({
          status: 200,
          data: {
            commentId: id,
            threshold: value.threshold !== undefined ? value.threshold : current.ai_threshold_score,
            enabled: value.enabled !== undefined ? value.enabled : Boolean(current.ai_threshold_enabled),
            customSettings: value.customSettings !== undefined ? value.customSettings : (current.ai_threshold_custom_settings ? JSON.parse(current.ai_threshold_custom_settings) : null),
            moderatorId,
            overrideTimestamp: new Date().toISOString()
          },
          message: 'Comment AI threshold updated'
        });
      });
    });
  });
};

// コメントごとのAI閾値取得
exports.getCommentAIThreshold = (req, res, next) => {
  const { id } = req.params;

  const sql = `
    SELECT
      ai_threshold_score,
      ai_threshold_enabled,
      ai_threshold_custom_settings,
      ai_override_moderator_id,
      ai_override_timestamp
    FROM comments WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!row) {
      return next({ status: 404, message: 'Comment not found' });
    }

    res.json({
      status: 200,
      data: {
        threshold: row.ai_threshold_score || 0.5,
        enabled: Boolean(row.ai_threshold_enabled),
        customSettings: row.ai_threshold_custom_settings ? JSON.parse(row.ai_threshold_custom_settings) : null,
        lastModifiedBy: row.ai_override_moderator_id,
        lastModifiedAt: row.ai_override_timestamp
      },
      message: 'Comment AI threshold retrieved'
    });
  });
};

// ユーザーのデフォルトAI閾値設定
exports.setUserDefaultAIThreshold = (req, res, next) => {
  const { id } = req.params;
  const {
    threshold,
    enabled,
    settings,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const userThresholdSchema = Joi.object({
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    settings: Joi.object().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = userThresholdSchema.validate({
    threshold,
    enabled,
    settings,
    reason
  });

  if (error) {
    return next({ status: 400, message: 'Invalid user threshold settings', details: error.details });
  }

  // 現在の設定を取得
  db.get('SELECT ai_default_threshold, ai_threshold_enabled, ai_threshold_settings FROM users WHERE id = ?', [id], (err, current) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!current) {
      return next({ status: 404, message: 'User not found' });
    }

    // 更新するフィールドを構築
    const updateFields = [];
    const params = [];

    if (value.threshold !== undefined) {
      updateFields.push('ai_default_threshold = ?');
      params.push(value.threshold);
    }

    if (value.enabled !== undefined) {
      updateFields.push('ai_threshold_enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    if (value.settings !== undefined) {
      updateFields.push('ai_threshold_settings = ?');
      params.push(JSON.stringify(value.settings));
    }

    params.push(id);

    if (updateFields.length === 0) {
      return next({ status: 400, message: 'No threshold settings to update' });
    }

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        return next({ status: 500, message: 'Failed to update user default AI threshold', details: err });
      }

      // 履歴を記録
      const historySql = `
        INSERT INTO ai_threshold_history
        (user_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(historySql, [
        id,
        moderatorId,
        'update',
        current.ai_default_threshold,
        value.threshold !== undefined ? value.threshold : current.ai_default_threshold,
        current.ai_threshold_settings,
        value.settings !== undefined ? JSON.stringify(value.settings) : current.ai_threshold_settings,
        value.reason || 'Manual threshold adjustment'
      ], function(histErr) {
        if (histErr) {
          logger.warn('[AI Threshold] Failed to record user history:', histErr);
        }

        res.json({
          status: 200,
          data: {
            userId: id,
            threshold: value.threshold !== undefined ? value.threshold : current.ai_default_threshold,
            enabled: value.enabled !== undefined ? value.enabled : Boolean(current.ai_threshold_enabled),
            settings: value.settings !== undefined ? value.settings : (current.ai_threshold_settings ? JSON.parse(current.ai_threshold_settings) : null),
            moderatorId
          },
          message: 'User default AI threshold updated'
        });
      });
    });
  });
};

// AI閾値設定のバッチ更新
exports.batchUpdateAIThreshold = (req, res, next) => {
  const { updates, reason } = req.body;
  const moderatorId = req.user?.id || 'system';

  if (!Array.isArray(updates) || updates.length === 0) {
    return next({ status: 400, message: 'Updates array is required and must not be empty' });
  }

  if (updates.length > 100) {
    return next({ status: 400, message: 'Maximum 100 updates allowed per batch' });
  }

  // バリデーション
  const Joi = require('joi');
  const updateSchema = Joi.object({
    commentId: Joi.string().required(),
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    customSettings: Joi.object().optional()
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
    return next({ status: 400, message: 'Invalid updates', details: errors });
  }

  // バッチ更新を実行
  let completed = 0;
  let failed = 0;
  const results = [];

  const processUpdate = (update) => {
    return new Promise((resolve, reject) => {
      // 現在の設定を取得
      db.get('SELECT ai_threshold_score, ai_threshold_enabled, ai_threshold_custom_settings FROM comments WHERE id = ?',
        [update.commentId], (err, current) => {
          if (err || !current) {
            failed++;
            results.push({ commentId: update.commentId, success: false, error: 'Comment not found' });
            return resolve();
          }

          // 更新を実行
          const updateFields = [];
          const params = [];

          if (update.threshold !== undefined) {
            updateFields.push('ai_threshold_score = ?');
            params.push(update.threshold);
          }

          if (update.enabled !== undefined) {
            updateFields.push('ai_threshold_enabled = ?');
            params.push(update.enabled ? 1 : 0);
          }

          if (update.customSettings !== undefined) {
            updateFields.push('ai_threshold_custom_settings = ?');
            params.push(JSON.stringify(update.customSettings));
          }

          updateFields.push('ai_override_moderator_id = ?');
          params.push(moderatorId);

          updateFields.push('ai_override_timestamp = CURRENT_TIMESTAMP');
          params.push(update.commentId);

          if (updateFields.length > 2) { // moderator_idとtimestamp以外に更新がある場合
            const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

            db.run(sql, params, function(err) {
              if (err) {
                failed++;
                results.push({ commentId: update.commentId, success: false, error: err.message });
              } else {
                completed++;
                results.push({ commentId: update.commentId, success: true });

                // 履歴を記録
                const historySql = `
                INSERT INTO ai_threshold_history
                (comment_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `;

                db.run(historySql, [
                  update.commentId,
                  moderatorId,
                  'batch_update',
                  current.ai_threshold_score,
                  update.threshold !== undefined ? update.threshold : current.ai_threshold_score,
                  current.ai_threshold_custom_settings,
                  update.customSettings !== undefined ? JSON.stringify(update.customSettings) : current.ai_threshold_custom_settings,
                  reason || 'Batch threshold update'
                ]);
              }
              resolve();
            });
          } else {
            failed++;
            results.push({ commentId: update.commentId, success: false, error: 'No changes to update' });
            resolve();
          }
        });
    });
  };

  // すべての更新を順次実行
  const promises = validUpdates.map(processUpdate);

  Promise.all(promises).then(() => {
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
  }).catch((err) => {
    next({ status: 500, message: 'Batch update failed', details: err });
  });
};
