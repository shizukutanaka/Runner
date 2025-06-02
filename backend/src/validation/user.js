// Joiバリデーションスキーマ（ユーザーAPI用）
const Joi = require('joi');

exports.update = Joi.object({
  name: Joi.string().min(1).max(50),
  email: Joi.string().email(),
  bio: Joi.string().max(200),
  language: Joi.string().max(10),
  timezone: Joi.string().max(50),
});
