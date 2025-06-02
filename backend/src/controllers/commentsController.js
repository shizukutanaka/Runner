const db = require('../../src/db');
const crypto = require('crypto');

exports.getComments = (req, res, next) => {
  const { platform, limit = 50, offset = 0 } = req.query;
  const sql = `SELECT * FROM comments WHERE platform = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  db.all(sql, [platform, limit, offset], (err, rows) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: rows, message: 'Comments fetched' });
  });
};

exports.createComment = async (req, res, next) => {
  const { content, user, platform } = req.body;
  const sql = `INSERT INTO comments (content, user, platform, timestamp) VALUES (?, ?, ?, datetime('now'))`;
  const result = await aiModeration(content);
  if (result.isNg || isNgComment(content)) {
    return next({ status: 403, message: 'Comment is not allowed' });
  }
  db.run(sql, [content, user, platform], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 201, data: { id: this.lastID }, message: 'Comment created' });
  });
};

exports.getTwitchComments = async (req, res, next) => {
  // 本来はIRC/WebSocketで受信しDB保存したものを返す
  let twitchChatLog = [
    { id: '1', user: 'TwitchUser1', message: 'Hello Twitch!', timestamp: new Date().toISOString() },
    { id: '2', user: 'TwitchUser2', message: 'Nice stream!', timestamp: new Date().toISOString() }
  ];

  const items = await Promise.all(twitchChatLog.map(async c => {
    let status = 'visible';
    let isNg = isNgComment(c.message);
    if (!isNg) {
      const aiResult = await aiModeration(c.message);
      isNg = aiResult.isNg;
    }
    if (isNg) {
      handleUserViolation(c.user);
      status = 'hidden';
    } else if (isUserMuted(c.user)) {
      status = 'muted';
    }
    return {
      ...c,
      status
    };
  }));
  res.json({
    status: 200,
    data: { items },
    message: 'Twitchコメント取得'
  });
};

exports.updateComment = (req, res, next) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const timestamp = new Date().toISOString();
  const sql = `UPDATE comments SET status = ?, moderation_reason = ?, moderation_timestamp = ? WHERE id = ?`;
  db.run(sql, [action, reason, timestamp, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Comment updated' });
  });
};

// コメントごとのアバター設定
exports.setAvatar = (req, res, next) => {
  const { id } = req.params;
  const { avatarUrl } = req.body;
  const sql = `UPDATE comments SET avatar_url = ? WHERE id = ?`;
  db.run(sql, [avatarUrl, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Avatar updated' });
  });
};

// コメントごとの背景色設定
exports.setBackgroundColor = (req, res, next) => {
  const { id } = req.params;
  const { color } = req.body;
  const sql = `UPDATE comments SET background_color = ? WHERE id = ?`;
  db.run(sql, [color, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Background color updated' });
  });
};

// コメントごとのハイライト設定
exports.setHighlight = (req, res, next) => {
  const { id } = req.params;
  const { highlight } = req.body;
  const sql = `UPDATE comments SET highlight = ? WHERE id = ?`;
  db.run(sql, [highlight, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Highlight updated' });
  });
};

// コメントごとの固定表示設定
exports.setPin = (req, res, next) => {
  const { id } = req.params;
  const { pinned } = req.body;
  const sql = `UPDATE comments SET pinned = ? WHERE id = ?`;
  db.run(sql, [pinned, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Pin status updated' });
  });
};

// コメントごとの自動アーカイブ設定
exports.setAutoArchive = (req, res, next) => {
  const { id } = req.params;
  const { autoArchive } = req.body;
  const sql = `UPDATE comments SET auto_archive = ? WHERE id = ?`;
  db.run(sql, [autoArchive, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Auto archive setting updated' });
  });
};

// コメントごとの外部共有設定
exports.setExternalShare = (req, res, next) => {
  const { id } = req.params;
  const { shared } = req.body;
  const sql = `UPDATE comments SET external_shared = ? WHERE id = ?`;
  db.run(sql, [shared, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'External share setting updated' });
  });
};

// コメントごとの編集履歴取得
exports.getEditHistory = (req, res, next) => {
  const { id } = req.params;
  const sql = `SELECT * FROM comment_edits WHERE comment_id = ? ORDER BY edited_at DESC`;
  db.all(sql, [id], (err, rows) => {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: rows, message: 'Edit history fetched' });
  });
};

// コメントごとの通知頻度設定
exports.setNotificationFrequency = (req, res, next) => {
  const { id } = req.params;
  const { frequency } = req.body;
  const sql = `UPDATE comments SET notification_frequency = ? WHERE id = ?`;
  db.run(sql, [frequency, id], function(err) {
    if (err) return next({ status: 500, message: 'Database error', details: err });
    res.json({ status: 200, data: null, message: 'Notification frequency updated' });
  });
};
