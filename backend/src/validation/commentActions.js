// Joiバリデーションスキーマ（コメント管理の付加操作用）
const Joi = require('joi');

const colorPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

exports.updateStatus = Joi.object({
  action: Joi.string().valid('visible', 'hidden', 'muted', 'deleted', 'flagged').required(),
  reason: Joi.string().allow('', null).max(500),
});

exports.setAvatar = Joi.object({
  avatarUrl: Joi.string().uri({ scheme: ['https'] }).required()
});

exports.setBackground = Joi.object({
  color: Joi.string().pattern(colorPattern).required()
});

exports.setHighlight = Joi.object({
  highlight: Joi.boolean().required()
});

exports.setPin = Joi.object({
  pinned: Joi.boolean().required()
});

exports.setAutoArchive = Joi.object({
  autoArchive: Joi.boolean().required()
});

exports.setExternalShare = Joi.object({
  shared: Joi.boolean().required()
});

exports.notificationFrequency = Joi.object({
  frequency: Joi.string().valid('immediate', 'hourly', 'daily', 'weekly', 'never').required()
});

exports.visibility = Joi.object({
  visibility: Joi.string().valid('public', 'followers', 'members', 'private', 'moderators').required(),
  allowedRoles: Joi.array().items(Joi.string()).optional(),
  allowedUsers: Joi.array().items(Joi.string()).optional(),
  expiresAt: Joi.date().optional(),
  reason: Joi.string().allow('', null).max(500)
});

exports.batchVisibility = Joi.object({
  updates: Joi.array().items(Joi.object({
    commentId: Joi.string().required(),
    visibility: Joi.string().valid('public', 'followers', 'members', 'private', 'moderators').required(),
    allowedRoles: Joi.array().items(Joi.string()).optional(),
    allowedUsers: Joi.array().items(Joi.string()).optional(),
    expiresAt: Joi.date().optional()
  })).min(1).max(100).required(),
  reason: Joi.string().allow('', null).max(500)
});

exports.pagination = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

// コメントIDはingestComment()がuuidv4()で発行するため、UUID形式を強制する
// （不正な形式のIDは無駄なDB照会をせず即座に400を返す）
exports.commentIdParam = Joi.object({
  id: Joi.string().guid({ version: 'uuidv4' }).required()
});
