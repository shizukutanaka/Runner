const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');

router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  logger.info('[Papers] Search requested', { query: q });
  res.json({
    query: q,
    results: [],
    total: 0,
    message: 'Academic paper search - configure SEMANTIC_SCHOLAR_API_KEY to enable'
  });
}));

router.get('/:paperId', asyncHandler(async (req, res) => {
  const { paperId } = req.params;
  logger.info('[Papers] Paper fetch requested', { paperId });
  res.json({
    paperId,
    title: null,
    abstract: null,
    message: 'Paper lookup - configure external API to enable'
  });
}));

router.get('/related/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  logger.info('[Papers] Related papers requested', { channelId });
  res.json({
    channelId,
    papers: [],
    message: 'Related papers feature - not yet configured'
  });
}));

// コメント内容から関連論文を検索
router.post('/related-comments', asyncHandler(async (req, res) => {
  const { comments, source } = req.body;
  if (!Array.isArray(comments) || comments.length === 0) {
    return res.status(400).json({ status: 400, message: 'comments must be a non-empty array' });
  }
  logger.info('[Papers] Related papers from comments requested', { commentCount: comments.length, source });
  res.json({
    status: 200,
    data: [],
    message: 'Academic paper search - configure SEMANTIC_SCHOLAR_API_KEY to enable'
  });
}));

module.exports = router;
