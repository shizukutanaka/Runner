const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('moderator'));

router.post('/comprehensive', asyncHandler(async (req, res) => {
  const { platform, channelId, comments = [] } = req.body;

  if (!platform || !channelId) {
    return res.status(400).json({ status: 400, message: 'platform と channelId は必須です' });
  }

  logger.info('[IntegratedAnalysis] Comprehensive analysis requested', {
    platform,
    channelId,
    commentCount: comments.length
  });

  res.json({
    platform,
    channelId,
    analysis: {
      sentiment: null,
      toxicity: null,
      community_health: null,
      trending_topics: []
    },
    message: 'Integrated analysis - combine multiple insight APIs for full functionality'
  });
}));

router.get('/summary/:platform/:channelId', asyncHandler(async (req, res) => {
  const { platform, channelId } = req.params;
  logger.info('[IntegratedAnalysis] Summary requested', { platform, channelId });

  res.json({
    platform,
    channelId,
    summary: {
      total_comments: 0,
      health_score: null,
      risk_level: null,
      last_updated: new Date().toISOString()
    }
  });
}));

module.exports = router;
