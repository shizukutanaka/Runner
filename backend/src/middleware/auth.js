// ロール認証ミドルウェア（ダミー実装）
module.exports = (role) => (req, res, next) => {
  // 本来はJWTやセッションからロール判定
  const userRole = req.headers['x-user-role'] || 'user';
  if (role && userRole !== role) {
    return res.status(403).json({ error: 'Forbidden (role required)' });
  }
  next();
};
