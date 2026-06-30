const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { asyncHandler } = require('../utils/asyncHandler');

router.post('/analyze', asyncHandler(async (req, res) => {
  const { text, features = ['sentiment', 'toxicity'] } = req.body;

  if (!text) {
    return res.status(400).json({ status: 400, message: 'text は必須です' });
  }
  if (text.length > 5000) {
    return res.status(400).json({ status: 400, message: 'text は5000文字以内にしてください' });
  }

  logger.info('[AdvancedAI] Analysis requested', { features, textLength: text.length });

  res.json({
    text_length: text.length,
    features_requested: features,
    results: {},
    message: 'Advanced AI analysis - configure OPENAI_API_KEY for full functionality'
  });
}));

router.post('/batch', asyncHandler(async (req, res) => {
  const { items = [] } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ status: 400, message: 'items は配列である必要があります' });
  }
  if (items.length > 100) {
    return res.status(400).json({ status: 400, message: 'items は最大100件です' });
  }

  logger.info('[AdvancedAI] Batch analysis requested', { itemCount: items.length });

  res.json({
    processed: 0,
    results: [],
    message: 'Batch AI processing - configure API keys to enable'
  });
}));

router.get('/models', asyncHandler(async (req, res) => {
  res.json({
    available_models: [
      { id: 'openai-moderation', status: 'requires_api_key' },
      { id: 'built-in-rules', status: 'active' }
    ]
  });
}));

module.exports = router;
