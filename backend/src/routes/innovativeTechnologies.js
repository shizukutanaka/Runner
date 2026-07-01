const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('moderator'));

router.get('/features', asyncHandler(async (req, res) => {
  res.json({
    features: [
      {
        id: 'emotional-contagion',
        name: '感情伝播検知',
        status: 'active',
        description: 'コミュニティ内の感情伝播を検知し、炎上を事前に予測'
      },
      {
        id: 'community-health',
        name: 'コミュニティ健全性スコア',
        status: 'active',
        description: '6次元の指標でコミュニティの健全性を評価'
      },
      {
        id: 'silent-departure',
        name: 'サイレント離脱検知',
        status: 'active',
        description: '常連ユーザーの沈黙を早期警告として検知'
      },
      {
        id: 'creator-culture',
        name: 'クリエイター文化プロファイル',
        status: 'active',
        description: 'チャンネルごとのコミュニティ文化に基づくモデレーション調整'
      },
      {
        id: 'triage',
        name: 'モデレーター・トリアージ',
        status: 'active',
        description: '医療的優先度分類でモデレーションキューを整理'
      }
    ]
  });
}));

router.post('/experiment', asyncHandler(async (req, res) => {
  const { featureId, payload } = req.body;

  if (!featureId) {
    return res.status(400).json({ status: 400, message: 'featureId は必須です' });
  }

  logger.info('[InnovativeTech] Experiment requested', { featureId });

  res.json({
    featureId,
    status: 'pending',
    message: '実験的機能は /api/insights エンドポイントで利用可能です'
  });
}));

router.get('/status', asyncHandler(async (req, res) => {
  res.json({
    version: '2.1.0',
    experimental_features: 5,
    active_features: 5,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
