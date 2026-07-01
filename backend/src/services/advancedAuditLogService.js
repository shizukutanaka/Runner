const auditLogService = require('./auditLog');
const logger = require('../logger');

/**
 * ユーザーデータ変更を監査ログに記録するヘルパー
 * @param {string} actorId - 変更を行ったユーザー/システムのID
 * @param {string} resourceType - 変更対象のリソース種別（例: 'users'）
 * @param {string} action - 変更内容の種別（例: 'status_update'）
 * @param {string} resourceId - 変更対象のリソースID
 * @param {object} metadata - 変更内容の詳細
 */
const logDataMod = (actorId, resourceType, action, resourceId, metadata = {}) => {
  return auditLogService.log({
    action: `${resourceType}.${action}`,
    actorId,
    resourceType,
    resourceId,
    details: action,
    metadata
  }).catch((err) => {
    logger.error('[AdvancedAuditLog] Failed to log data modification', { error: err.message, action, resourceId });
  });
};

module.exports = { logDataMod };
