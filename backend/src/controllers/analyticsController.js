// ダッシュボード統計・グラフ用コントローラ（ダミー実装）
exports.getStats = (req, res) => {
  res.json({
    commentCount: 1234,
    userCount: 56,
    bannedCount: 3,
    activeUsers: 42,
  });
};

exports.getGraph = (req, res) => {
  res.json({
    labels: ['6/1','6/2','6/3'],
    comments: [200, 300, 400],
    bans: [2, 1, 0],
  });
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
