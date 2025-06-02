// Joiバリデーションスキーマ（モデレーションAPI用）
const Joi = require('joi');

exports.moderate = Joi.object({
  content: Joi.string().min(1).max(500).required(),
  user: Joi.string().required(),
});

exports.updateSettings = Joi.object({
  thresholds: Joi.object().pattern(Joi.string(), Joi.number()),
  bannedWords: Joi.array().items(Joi.string()),
});
