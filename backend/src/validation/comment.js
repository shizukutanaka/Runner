// Joiバリデーションスキーマ（コメントAPI用）
const Joi = require('joi');

exports.create = Joi.object({
  content: Joi.string().min(1).max(500).required(),
  user: Joi.string().required(),
  platform: Joi.string().valid('youtube', 'twitch').required(),
});

exports.update = Joi.object({
  content: Joi.string().min(1).max(500).required(),
});
