const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticateToken, requireRole } = require('../middleware/auth');
const twitchIngestionService = require('../services/twitchIngestionService');

router.use(authenticateToken);
router.use(requireRole('moderator'));

/**
 * R-29: Twitch チャット取り込みの操作API。
 * 取り込んだメッセージは commentsController.ingestComment() を通るため、
 * モデレーション・保留・レイド検知が YouTube と同一に適用される。
 */

// 監視開始
router.post('/watch', asyncHandler(async (req, res) => {
  const { broadcasterUserId } = req.body;
  if (!broadcasterUserId) {
    return res.status(400).json({ status: 400, message: 'broadcasterUserId は必須です' });
  }
  if (!twitchIngestionService.isEnabled()) {
    return res.status(503).json({
      status: 503,
      enabled: false,
      message: 'Twitch連携が未設定です（TWITCH_USER_ACCESS_TOKEN / TWITCH_USER_ID を設定してください）'
    });
  }
  const result = await twitchIngestionService.startWatching(broadcasterUserId, { io: req.app.get('io') });
  res.json({ status: 200, data: result, message: 'Twitch watch started' });
}));

// 監視停止
router.delete('/watch/:broadcasterUserId', asyncHandler(async (req, res) => {
  const result = await twitchIngestionService.stopWatching(req.params.broadcasterUserId);
  res.json({ status: 200, data: result, message: 'Twitch watch stopped' });
}));

// 監視状況
router.get('/watch', asyncHandler(async (req, res) => {
  res.json({
    status: 200,
    data: {
      enabled: twitchIngestionService.isEnabled(),
      watches: twitchIngestionService.listWatches()
    },
    message: 'Twitch watch status retrieved'
  });
}));

module.exports = router;
