const db = require('../db');
const logger = require('../logger');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

// ダッシュボード統計・グラフ用コントローラ
exports.getStats = async (req, res, next) => {
  try {
    const [commentRow, userRow, bannedRow, activeRow] = await Promise.all([
      dbGet('SELECT COUNT(*) as cnt FROM comments'),
      dbGet('SELECT COUNT(*) as cnt FROM users'),
      dbGet("SELECT COUNT(*) as cnt FROM users WHERE status = 'banned'"),
      dbGet("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'")
    ]);

    res.json({
      commentCount: commentRow?.cnt || 0,
      userCount: userRow?.cnt || 0,
      bannedCount: bannedRow?.cnt || 0,
      activeUsers: activeRow?.cnt || 0
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching stats', { error: err.message });
    next({ status: 500, message: '統計の取得中にエラーが発生しました', details: err });
  }
};

exports.getGraph = async (req, res, next) => {
  try {
    // 直近7日間の日別コメント数とBAN数を集計
    const rows = await dbAll(`
      SELECT date(timestamp) as day, COUNT(*) as commentCount
      FROM comments
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY day
      ORDER BY day ASC
    `);
    const banRows = await dbAll(`
      SELECT date(ban_until) as day, COUNT(*) as banCount
      FROM users
      WHERE ban_until >= datetime('now', '-7 days')
      GROUP BY day
      ORDER BY day ASC
    `);

    const bansByDay = Object.fromEntries(banRows.map(r => [r.day, r.banCount]));

    res.json({
      labels: rows.map(r => r.day),
      comments: rows.map(r => r.commentCount),
      bans: rows.map(r => bansByDay[r.day] || 0)
    });
  } catch (err) {
    logger.error('[Analytics] Error fetching graph data', { error: err.message });
    next({ status: 500, message: 'グラフデータの取得中にエラーが発生しました', details: err });
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
    const byStatus = Object.fromEntries(rows.map(r => [r.status, r.cnt]));
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
      dbGet("SELECT COUNT(*) as cnt FROM users WHERE status = 'active'")
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
      distribution: rows.map(r => ({ hour: `${r.hour}:00`, count: r.cnt }))
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
      dbGet("SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime('now', '-1 day')"),
      dbGet("SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime('now', '-2 day') AND timestamp < datetime('now', '-1 day')")
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
      dbGet("SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime('now', '-1 hour')"),
      dbGet("SELECT COUNT(*) as cnt FROM comments WHERE timestamp >= datetime('now', '-1 day')")
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
