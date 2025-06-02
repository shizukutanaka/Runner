const db = require('../../src/db');

exports.getUser = (req, res, next) => {
  const { id } = req.params;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    if (!row) return next({ status: 404, message: 'User not found' });
    res.json({ status: 200, data: row, message: 'User fetched' });
  });
};

exports.updateUser = (req, res, next) => {
  const { id } = req.params;
  const { action, duration, reason } = req.body;
  let status = action;
  let banUntil = null;
  let muteUntil = null;
  if (action === 'ban') banUntil = new Date(Date.now() + (duration || 3600) * 1000).toISOString();
  if (action === 'mute') muteUntil = new Date(Date.now() + (duration || 300) * 1000).toISOString();
  const sql = `UPDATE users SET status = ?, ban_until = ?, mute_until = ? WHERE id = ?`;
  db.run(sql, [status, banUntil, muteUntil, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'User updated' });
  });
};

exports.getUserHistory = (req, res, next) => {
  const { id } = req.params;
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
  const sql = `UPDATE users SET notification_frequency = ? WHERE id = ?`;
  db.run(sql, [frequency, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Notification frequency updated' });
  });
};

// ユーザーごとの外部連携ON/OFF
exports.setExternalIntegration = (req, res, next) => {
  const { id } = req.params;
  const { enabled } = req.body;
  const sql = `UPDATE users SET external_integration = ? WHERE id = ?`;
  db.run(sql, [enabled, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'External integration updated' });
  });
};

// ユーザーごとのプロフィール画像設定
exports.setProfileImage = (req, res, next) => {
  const { id } = req.params;
  const { imageUrl } = req.body;
  const sql = `UPDATE users SET profile_image = ? WHERE id = ?`;
  db.run(sql, [imageUrl, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Profile image updated' });
  });
};

// ユーザーごとの自己紹介文設定
exports.setBio = (req, res, next) => {
  const { id } = req.params;
  const { bio } = req.body;
  const sql = `UPDATE users SET bio = ? WHERE id = ?`;
  db.run(sql, [bio, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Bio updated' });
  });
};

// ユーザーごとの言語設定
exports.setLanguage = (req, res, next) => {
  const { id } = req.params;
  const { language } = req.body;
  const sql = `UPDATE users SET language = ? WHERE id = ?`;
  db.run(sql, [language, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Language preference updated' });
  });
};

// ユーザーごとのタイムゾーン設定
exports.setTimezone = (req, res, next) => {
  const { id } = req.params;
  const { timezone } = req.body;
  const sql = `UPDATE users SET timezone = ? WHERE id = ?`;
  db.run(sql, [timezone, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Timezone updated' });
  });
};

// ユーザーごとのサブスク状態管理
exports.setSubscription = (req, res, next) => {
  const { id } = req.params;
  const { subscription } = req.body;
  const sql = `UPDATE users SET subscription = ? WHERE id = ?`;
  db.run(sql, [subscription, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Subscription updated' });
  });
};

// ユーザーごとの認証履歴取得
exports.getAuthHistory = (req, res, next) => {
  const { id } = req.params;
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
  const sql = `UPDATE users SET two_factor = ?, email_verified = ? WHERE id = ?`;
  db.run(sql, [twoFactor, emailVerification, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Security settings updated' });
  });
};
