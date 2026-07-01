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

// 期間指定統計
exports.getPeriodStats = (req, res) => {
  res.json({ period: req.query, stats: { commentCount: 100, userCount: 10 } });
};

// ユーザー別統計
exports.getUserStats = (req, res) => {
  res.json({ user: req.params.id, stats: { comments: 12, bans: 1 } });
};

// コメント別統計
exports.getCommentStats = (req, res) => {
  res.json({ comment: req.params.id, stats: { likes: 5, pins: 1 } });
};

// AI判定別統計
exports.getModerationStats = (req, res) => {
  res.json({ ai: true, stats: { flagged: 7, passed: 93 } });
};

// エクスポート
exports.exportAnalytics = (req, res) => {
  res.json({ url: '/dummy/analytics.csv', message: 'エクスポートダミー' });
};

// インポート
exports.importAnalytics = (req, res) => {
  res.json({ success: true, message: 'インポートダミー' });
};

// 履歴取得
exports.getHistory = (req, res) => {
  res.json({ history: [], message: '履歴取得ダミー' });
};

// 外部連携
exports.externalIntegration = (req, res) => {
  res.json({ success: true, message: '外部連携ダミー' });
};

// 利用率取得
exports.getUsage = (req, res) => {
  res.json({ usage: 0.8, message: '利用率ダミー' });
};

// ピーク時取得
exports.getPeak = (req, res) => {
  res.json({ peak: '12:00', message: 'ピーク時ダミー' });
};

// トレンド取得
exports.getTrend = (req, res) => {
  res.json({ trend: 'up', message: 'トレンドダミー' });
};

// ランキング取得
exports.getRanking = (req, res) => {
  res.json({ ranking: [], message: 'ランキングダミー' });
};

// 異常検知
exports.detectAnomaly = (req, res) => {
  res.json({ anomaly: false, message: '異常検知ダミー' });
};
