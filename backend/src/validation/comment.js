// Joiバリデーションスキーマ（コメントAPI用）
const Joi = require('joi');

exports.list = Joi.object({
  platform: Joi.string().trim().valid('youtube', 'twitch').optional(),
  status: Joi.string().trim().valid('visible', 'hidden', 'muted', 'flagged', 'deleted').optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().trim().min(1).max(200).optional()
});

exports.create = Joi.object({
  content: Joi.string().trim().min(1).max(500).required(),
  user: Joi.string().trim().min(1).max(100).required(),
  platform: Joi.string().trim().valid('youtube', 'twitch').required(),
});

exports.summary = Joi.object({
  comments: Joi.array()
    .items(
      Joi.object({
        content: Joi.string().trim().min(1).max(500).required(),
        user: Joi.string().trim().min(1).max(100).required(),
        platform: Joi.string().trim().valid('youtube', 'twitch').required(),
        timestamp: Joi.date().iso().optional()
      })
    )
    .min(1)
    .max(100)
    .required()
});

exports.autoAnswer = Joi.object({
  comment: Joi.string().trim().min(1).max(500).required(),
  context: Joi.array().items(Joi.string().trim().min(1).max(500)).max(20).default([])
});
