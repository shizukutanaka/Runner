const db = require('../db');
const logger = require('../logger');
// E-35: BAN系列は audit_logs を読む。このサービスは require された時点で
// テーブルを作るので、ここで読み込んでおくこと自体が前提条件の充足になる
require('../services/auditLog');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

// ダッシュボード統計・グラフ用コントローラ
exports.getStats = async (req, res, next) => {
  try {
    // ミュート中の判定に `datetime('now')` を使ってはいけない。
    // `mute_until` は `new Date().toISOString()` 由来の 'YYYY-MM-DDTHH:MM:SS.sssZ' で、
    // SQLite の `datetime('now')` は 'YYYY-MM-DD HH:MM:SS'。10文字目が 'T'(0x54) と
    // ' '(0x20) で、日付が同じ場合は必ず ISO 側が大きくなる。既定のミュートは
    // 300秒＝同日中に切れるため、**期限切れのミュートが全部「継続中」に化ける**。
    // 既存の期限切れ処理（usersController の cleanupExpiredTimeouts）と同じく、
    // JS 側で生成した ISO 文字列を渡して同じ表現同士で比較する。
    const nowIso = new Date().toISOString();
    const [commentRow, userRow, bannedRow, activeRow, mutedRow] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM comments'),
      dbGet('SELECT COUNT(*) as cnt FROM users'),
      dbGet('SELECT COUNT(*) as cnt FROM users WHERE status = \'banned\''),
      dbGet('SELECT COUNT(*) as cnt FROM users WHERE status = \'active\''),
      // status='muted'（updateUser 経由）と mute_until（タイムアウト経由）の
      // どちらでもミュートになりうるため両方を数える。BAN はミュートに数えない
      dbGet(
        `SELECT COUNT(*) as cnt FROM users
         WHERE status != 'banned'
           AND (status = 'muted' OR (mute_until IS NOT NULL AND mute_until > ?))`,
        [nowIso]
      )
    ]);

    res.json({
      commentCount: commentRow?.cnt || 0,
      userCount: userRow?.cnt || 0,
      bannedCount: bannedRow?.cnt || 0,
      activeUsers: activeRow?.cnt || 0,
      mutedCount: mutedRow?.cnt || 0
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching stats', { error: err.message });
    next({ status: 500, message: '統計の取得中にエラーが発生しました', details: err });
  }
};

exports.getGraph = async (req, res, next) => {
  // E-35: このグラフは「日別のコメント数とBAN数（直近7日）」として描画される。
  // 以前の BAN 系列は `users.ban_until` を日付にして数えていたが、
  // `ban_until` は **BANが切れる時刻**であって、BANした時刻ではない。
  //   - 1時間BAN → だいたい同じ日に出るので一見それらしく見える
  //   - 30日BAN → 30日後の日付に計上され、直近7日のグラフには**永久に出ない**
  // さらに系列を `bansByDay[コメントの日]` で引いていたため、
  // **コメントが1件も無い日のBANは、その日ごと存在しないことになっていた**。
  //
  // 「いつBANしたか」は既に audit_logs に記録されている（usersController.updateUser の
  // logDataMod 経由）。列を足すのではなく、実在する記録を読む。
  try {
    // comments.timestamp は new Date().toISOString() 由来の 'YYYY-MM-DDTHH:MM:SS.sssZ'。
    // SQLite の datetime('now','-7 days') は 'YYYY-MM-DD HH:MM:SS' で、10文字目が
    // 'T'(0x54) と ' '(0x20) のため同日なら必ずISO側が大きい。境界日の扱いが
    // ずれるので、比較はJS側で作ったISO文字列に揃える（getStats と同じ方針）
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = await dbAll(
      `SELECT date(timestamp) as day, COUNT(*) as commentCount
       FROM comments
       WHERE timestamp >= ?
       GROUP BY day
       ORDER BY day ASC`,
      [sinceIso]
    );

    // audit_logs.timestamp は CURRENT_TIMESTAMP 由来の 'YYYY-MM-DD HH:MM:SS' なので、
    // こちらは datetime() 同士で比較する（形式を混ぜないこと）
    let banRows = [];
    try {
      banRows = await dbAll(
        `SELECT date(timestamp) as day, COUNT(*) as banCount
         FROM audit_logs
         WHERE action = 'users.status_update'
           AND json_extract(metadata, '$.status') = 'ban'
           AND timestamp >= datetime('now', '-7 days')
         GROUP BY day
         ORDER BY day ASC`
      );
    } catch (auditErr) {
      // 監査ログのテーブルがまだ作られていない起動直後だけは空系列で返す。
      // それ以外のエラーは握りつぶさない（隠れた失敗を作らないため）
      if (!/no such table/i.test(auditErr.message)) throw auditErr;
      logger.warn('[Analytics] audit_logs not ready; ban series is empty', { error: auditErr.message });
    }

    const commentsByDay = Object.fromEntries(rows.map((r) => [r.day, r.commentCount]));
    const bansByDay = Object.fromEntries(banRows.map((r) => [r.day, r.banCount]));

    // ラベルは両方の和集合にする。コメントの無い日のBANが消えないようにするため
    const labels = Array.from(new Set([...Object.keys(commentsByDay), ...Object.keys(bansByDay)])).sort();

    res.json({
      labels,
      comments: labels.map((d) => commentsByDay[d] || 0),
      bans: labels.map((d) => bansByDay[d] || 0)
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching graph data', { error: err.message });
    next({ status: 500, message: 'グラフデータの取得中にエラーが発生しました', details: err });
  }
};

// 横断的なモデレーション操作履歴（E-38）
//
// モデレーター画面の「最近のモデレーションアクション」は、
// **サーバ側に横断的な履歴APIが無いという理由で、その画面で実行した分しか
// 出せなかった**（再読み込みで消える）。実際には E-36 で分かったとおり、
// 操作は全て audit_logs に残っている。無いのはAPIだけだった。
//
// 誰が・いつ・誰に・何を・なぜ、そしてBANについては
// **プラットフォーム側へ届いたか**まで返す。
// 届いたかどうかを記録していない古い行は `platformApplied: null` にする。
// false（届かなかった）と null（記録が無い）を混ぜないこと——
// 混ぜると「届かなかった」と誤って表示することになる。
exports.getModerationActions = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await dbAll(
      `SELECT a.id, a.action, a.actor_id, a.resource_id, a.timestamp, a.metadata,
              u.username, u.platform
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.resource_id
       WHERE a.resource_type = 'users'
         AND a.action IN ('users.status_update', 'users.timeout', 'users.timeout_remove')
       ORDER BY a.timestamp DESC
       LIMIT ?`,
      [limit]
    );

    const actions = rows.map((row) => {
      let meta = {};
      try {
        meta = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (parseErr) {
        meta = {};
      }
      const type = row.action === 'users.status_update'
        ? (meta.status || 'status_update')
        : row.action.replace(/^users\./, '');
      return {
        id: `audit-${row.id}`,
        type,
        userId: row.resource_id,
        user: row.username || row.resource_id,
        platform: row.platform || null,
        reason: meta.reason ?? null,
        moderator: row.actor_id,
        timestamp: row.timestamp,
        // 記録が無い行は null。false と区別する
        platformApplied: typeof meta.platformApplied === 'boolean' ? meta.platformApplied : null,
        platformReason: meta.platformReason ?? null
      };
    });

    res.json({ actions, count: actions.length });
  } catch (err) {
    logger.error('[Analytics] Error fetching moderation actions', { error: err.message });
    next({ status: 500, message: 'モデレーション履歴の取得中にエラーが発生しました', details: err });
  }
};

// 期間指定統計（from/to クエリで期間を絞ってコメント数・ユニークユーザー数を集計）
exports.getPeriodStats = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const clauses = [];
    const params = [];
    if (from) { clauses.push('timestamp >= ?'); params.push(from); }
    if (to)   { clauses.push('timestamp <= ?'); params.push(to); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const row = await dbGet(
      `SELECT COUNT(*) as commentCount, COUNT(DISTINCT user) as userCount FROM comments ${where}`,
      params
    );
    res.json({
      period: { from: from || null, to: to || null },
      stats: { commentCount: row?.commentCount || 0, userCount: row?.userCount || 0 }
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching period stats', { error: err.message });
    next({ status: 500, message: '期間統計の取得中にエラーが発生しました', details: err });
  }
};

// ユーザー別統計（コメント数・現在のステータス・BAN状況）
exports.getUserStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRow = await dbGet('SELECT id, username, status, ban_until FROM users WHERE id = ? OR username = ?', [id, id]);
    const matchKey = userRow?.username || id;
    const commentRow = await dbGet('SELECT COUNT(*) as cnt FROM comments WHERE user = ?', [matchKey]);
    res.json({
      user: id,
      stats: {
        comments: commentRow?.cnt || 0,
        status: userRow?.status || 'unknown',
        banned: !!(userRow?.ban_until && new Date(userRow.ban_until) > new Date())
      }
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching user stats', { error: err.message });
    next({ status: 500, message: 'ユーザー統計の取得中にエラーが発生しました', details: err });
  }
};

// コメント別統計（状態・モデレーション理由）
exports.getCommentStats = async (req, res, next) => {
  try {
    const row = await dbGet(
      'SELECT id, user, platform, status, timestamp, moderation_reason FROM comments WHERE id = ?',
      [req.params.id]
    );
    if (!row) {
      return next({ status: 404, message: '指定されたコメントが見つかりません' });
    }
    res.json({ comment: row.id, stats: row });
  } catch (err) {
    logger.error('[Analytics] Error fetching comment stats', { error: err.message });
    next({ status: 500, message: 'コメント統計の取得中にエラーが発生しました', details: err });
  }
};

// AI判定別統計（モデレーション状態ごとのコメント件数）
exports.getModerationStats = async (req, res, next) => {
  try {
    const rows = await dbAll('SELECT status, COUNT(*) as cnt FROM comments GROUP BY status');
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.cnt]));
    const flagged = (byStatus.deleted || 0) + (byStatus.hidden || 0) + (byStatus.flagged || 0) + (byStatus.muted || 0);
    const passed = byStatus.visible || 0;
    res.json({ ai: true, stats: { flagged, passed, byStatus } });
  } catch (err) {
    logger.error('[Analytics] Error fetching moderation stats', { error: err.message });
    next({ status: 500, message: 'モデレーション統計の取得中にエラーが発生しました', details: err });
  }
};

// エクスポート／インポート／外部連携: 未実装の外部I/O。ダミーの成功を返さず
// 501 Not Implemented を明示的に返す（偽装レスポンスの排除・E-1/E-2/W-4）
const notImplemented = (feature) => (req, res) => {
  res.status(501).json({
    status: 501,
    message: `${feature} はまだ実装されていません`,
    implemented: false
  });
};
exports.exportAnalytics = notImplemented('分析データのエクスポート');
exports.importAnalytics = notImplemented('分析データのインポート');
exports.externalIntegration = notImplemented('外部サービス連携');

// 履歴取得（直近のモデレーション操作の履歴）
exports.getHistory = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await dbAll(
      `SELECT id, user, platform, status, moderation_reason, moderation_timestamp
       FROM comments
       WHERE moderation_timestamp IS NOT NULL
       ORDER BY moderation_timestamp DESC
       LIMIT ?`,
      [limit]
    );
    res.json({ history: rows, count: rows.length });
  } catch (err) {
    logger.error('[Analytics] Error fetching history', { error: err.message });
    next({ status: 500, message: '履歴の取得中にエラーが発生しました', details: err });
  }
};

// 利用率取得（アクティブユーザー / 全ユーザー）
exports.getUsage = async (req, res, next) => {
  try {
    const [totalRow, activeRow] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM users'),
      dbGet('SELECT COUNT(*) as cnt FROM users WHERE status = \'active\'')
    ]);
    const total = totalRow?.cnt || 0;
    const active = activeRow?.cnt || 0;
    res.json({ usage: total > 0 ? Math.round((active / total) * 100) / 100 : 0, active, total });
  } catch (err) {
    logger.error('[Analytics] Error fetching usage', { error: err.message });
    next({ status: 500, message: '利用率の取得中にエラーが発生しました', details: err });
  }
};

// ピーク時取得（コメントが最も多い時間帯）
exports.getPeak = async (req, res, next) => {
  try {
    const rows = await dbAll(
      `SELECT strftime('%H', timestamp) as hour, COUNT(*) as cnt
       FROM comments GROUP BY hour ORDER BY cnt DESC`
    );
    const top = rows[0];
    res.json({
      peak: top ? `${top.hour}:00` : null,
      peakCount: top?.cnt || 0,
      distribution: rows.map((r) => ({ hour: `${r.hour}:00`, count: r.cnt }))
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching peak', { error: err.message });
    next({ status: 500, message: 'ピーク時の取得中にエラーが発生しました', details: err });
  }
};

// トレンド取得（直近24時間 vs その前24時間のコメント数比較）
exports.getTrend = async (req, res, next) => {
  try {
    const [recentRow, priorRow] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime(\'now\', \'-1 day\')'),
      dbGet('SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime(\'now\', \'-2 day\') AND timestamp < datetime(\'now\', \'-1 day\')')
    ]);
    const recent = recentRow?.cnt || 0;
    const prior = priorRow?.cnt || 0;
    let trend = 'stable';
    if (recent > prior * 1.1) trend = 'up';
    else if (recent < prior * 0.9) trend = 'down';
    res.json({ trend, recent, prior });
  } catch (err) {
    logger.error('[Analytics] Error fetching trend', { error: err.message });
    next({ status: 500, message: 'トレンドの取得中にエラーが発生しました', details: err });
  }
};

// ランキング取得（コメント数上位ユーザー）
exports.getRanking = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const rows = await dbAll(
      `SELECT user, COUNT(*) as commentCount
       FROM comments GROUP BY user ORDER BY commentCount DESC LIMIT ?`,
      [limit]
    );
    res.json({ ranking: rows.map((r, i) => ({ rank: i + 1, user: r.user, commentCount: r.commentCount })) });
  } catch (err) {
    logger.error('[Analytics] Error fetching ranking', { error: err.message });
    next({ status: 500, message: 'ランキングの取得中にエラーが発生しました', details: err });
  }
};

// 異常検知（直近1時間のコメント量が過去24時間の平均時間量の3倍を超えるか）
exports.detectAnomaly = async (req, res, next) => {
  try {
    const [lastHourRow, dayRow] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime(\'now\', \'-1 hour\')'),
      dbGet('SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime(\'now\', \'-1 day\')')
    ]);
    const lastHour = lastHourRow?.cnt || 0;
    const hourlyAvg = (dayRow?.cnt || 0) / 24;
    const anomaly = hourlyAvg > 0 && lastHour > hourlyAvg * 3;
    res.json({
      anomaly,
      lastHour,
      hourlyAverage: Math.round(hourlyAvg * 100) / 100,
      threshold: Math.round(hourlyAvg * 3 * 100) / 100
    });
  } catch (err) {
    logger.error('[Analytics] Error detecting anomaly', { error: err.message });
    next({ status: 500, message: '異常検知の処理中にエラーが発生しました', details: err });
  }
};
