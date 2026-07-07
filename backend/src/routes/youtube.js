const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');
const { asyncHandler } = require('../utils/asyncHandler');
const { NotFoundError, Joi } = require('../utils/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');
const youtubeIngestionService = require('../services/youtubeIngestionService');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

router.use(authenticateToken);
router.use(requireRole('moderator'));

router.get('/channels/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  logger.info('[YouTube] Channel info requested', { channelId });
  res.json({
    channelId,
    status: 'active',
    message: 'YouTube channel integration - configure YOUTUBE_API_KEY to enable'
  });
}));

// 取り込み済みYouTubeコメントのDB照会
// 注意: comments テーブルはコメント単位で videoId/channelId を保持していないため、
// channelId によるフィルタリングは行わず platform='youtube' の最新コメントを返す
router.get('/channels/:channelId/comments', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  logger.info('[YouTube] Comments fetch requested', { channelId, limit });

  const rows = await dbAll(
    "SELECT id, content, user, status, timestamp FROM comments WHERE platform = 'youtube' ORDER BY timestamp DESC LIMIT ?",
    [limit]
  );

  res.json({
    channelId,
    comments: rows,
    nextPageToken: null,
    message: 'Ingested YouTube comments (channel-level filtering not yet supported)'
  });
}));

// 監視中の動画一覧とクォータ状況
router.get('/watch', asyncHandler(async (req, res) => {
  res.json({
    status: 200,
    data: {
      enabled: youtubeIngestionService.isEnabled(),
      watches: youtubeIngestionService.listWatches(),
      quota: youtubeIngestionService.getQuotaStatus()
    },
    message: 'YouTube watch status retrieved'
  });
}));

// 動画のライブチャット監視を開始
router.post('/watch', asyncHandler(async (req, res) => {
  const schema = Joi.object({ videoId: Joi.string().trim().min(1).max(50).required() });
  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ status: 400, message: 'videoId is required', details: error.details });
  }

  const result = await youtubeIngestionService.startWatching(value.videoId, { io: req.app.get('io') });

  if (!result.started) {
    const statusByReason = { disabled: 503, quota_exceeded: 429, not_live: 409, lookup_failed: 502 };
    return res.status(statusByReason[result.reason] || 400).json({
      status: statusByReason[result.reason] || 400,
      data: result,
      message: `Failed to start watching video: ${result.reason}`
    });
  }

  res.status(201).json({ status: 201, data: result, message: 'Started watching video live chat' });
}));

// 動画のライブチャット監視を停止
router.delete('/watch/:videoId', asyncHandler(async (req, res, next) => {
  const stopped = youtubeIngestionService.stopWatching(req.params.videoId);
  if (!stopped) {
    return next(new NotFoundError('Video is not currently being watched'));
  }
  res.json({ status: 200, message: 'Stopped watching video live chat' });
}));

router.get('/videos/:videoId/comments', asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  logger.info('[YouTube] Video comments requested', { videoId });
  res.json({
    videoId,
    comments: [],
    message: 'YouTube video comment integration pending'
  });
}));

// コメント内容から関連動画を検索
router.post('/related-videos', asyncHandler(async (req, res) => {
  const { comments } = req.body;
  if (!Array.isArray(comments) || comments.length === 0) {
    return res.status(400).json({ status: 400, message: 'comments must be a non-empty array' });
  }
  logger.info('[YouTube] Related videos search requested', { commentCount: comments.length });
  res.json({
    status: 200,
    data: [],
    message: 'YouTube API integration pending - configure YOUTUBE_API_KEY'
  });
}));

module.exports = router;
