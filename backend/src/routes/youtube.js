const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');
const { NotFoundError } = require('../utils/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');

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

router.get('/channels/:channelId/comments', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { limit = 20, pageToken } = req.query;
  logger.info('[YouTube] Comments fetch requested', { channelId, limit });
  res.json({
    channelId,
    comments: [],
    nextPageToken: null,
    message: 'YouTube API integration pending - configure YOUTUBE_API_KEY'
  });
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
