const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');
const { NotFoundError } = require('../utils/validation');

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

module.exports = router;
