// Joiバリデーションスキーマ（ユーザーAPI用）
const Joi = require('joi');

// PUT /api/users/:id はモデレーター/管理者がプラットフォーム利用者（コメント投稿者）に
// ban/mute/警告などのモデレーションアクションを行うエンドポイント。
// usersController.updateUser() は req.body から action/duration/reason を読むが、
// 以前このスキーマは全く別物（name/email/bio/language/timezone、自己プロフィール編集風）
// を検証しており、validate()のstripUnknownで action 等が常に除去され
// status が常にundefinedになる ＝ このエンドポイントは一度も機能したことがなかった
exports.update = Joi.object({
  action: Joi.string().valid('active', 'ban', 'mute', 'warn').required(),
  duration: Joi.number().integer().min(1).optional(),
  reason: Joi.string().trim().max(500).allow('', null).optional(),
});
