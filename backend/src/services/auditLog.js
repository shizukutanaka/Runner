const logger = require('../logger');
const db = require('../db');

/**
 * Audit logging service for compliance and security tracking
 */
class AuditLogService {
  constructor() {
    this.actions = {
      USER_LOGIN: 'user.login',
      USER_LOGOUT: 'user.logout',
      USER_REGISTER: 'user.register',
      USER_UPDATE: 'user.update',
      USER_DELETE: 'user.delete',
      USER_BAN: 'user.ban',
      USER_UNBAN: 'user.unban',
      COMMENT_CREATE: 'comment.create',
      COMMENT_UPDATE: 'comment.update',
      COMMENT_DELETE: 'comment.delete',
      COMMENT_MODERATE: 'comment.moderate',
      SETTINGS_UPDATE: 'settings.update',
      API_KEY_CREATE: 'apikey.create',
      API_KEY_REVOKE: 'apikey.revoke',
      BACKUP_CREATE: 'backup.create',
      BACKUP_RESTORE: 'backup.restore',
      DATA_EXPORT: 'data.export',
      DATA_IMPORT: 'data.import',
      SYSTEM_CONFIG: 'system.config'
    };

    this.severityLevels = {
      INFO: 'info',
      WARNING: 'warning',
      CRITICAL: 'critical'
    };
  }

  /**
   * Initialize audit log table
   */
  async initialize() {
    const sql = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT DEFAULT 'user',
        actor_ip TEXT,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        severity TEXT DEFAULT 'info',
        success INTEGER DEFAULT 1,
        error_message TEXT,
        user_agent TEXT,
        session_id TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
    `;

    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          logger.error('[AuditLog] Table creation failed', { error: err.message });
          reject(err);
        } else {
          logger.info('[AuditLog] Initialized successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Log an audit event
   */
  async log(params) {
    const {
      action,
      actorId,
      actorType = 'user',
      actorIp,
      resourceType,
      resourceId,
      details,
      severity = this.severityLevels.INFO,
      success = true,
      errorMessage,
      userAgent,
      sessionId,
      metadata = {}
    } = params;

    const sql = `
      INSERT INTO audit_logs (
        action, actor_id, actor_type, actor_ip, resource_type, resource_id,
        details, severity, success, error_message, user_agent, session_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      action,
      actorId || 'system',
      actorType,
      actorIp,
      resourceType,
      resourceId,
      details,
      severity,
      success ? 1 : 0,
      errorMessage,
      userAgent,
      sessionId,
      JSON.stringify(metadata)
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, values, function(err) {
        if (err) {
          logger.error('[AuditLog] Failed to log event', {
            error: err.message,
            action
          });
          reject(err);
        } else {
          logger.debug('[AuditLog] Event logged', {
            id: this.lastID,
            action,
            actor: actorId
          });
          resolve({ id: this.lastID });
        }
      });
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(filters = {}) {
    const {
      startDate,
      endDate,
      actorId,
      action,
      resourceType,
      resourceId,
      severity,
      success,
      limit = 100,
      offset = 0
    } = filters;

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    if (actorId) {
      sql += ' AND actor_id = ?';
      params.push(actorId);
    }

    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }

    if (resourceType) {
      sql += ' AND resource_type = ?';
      params.push(resourceType);
    }

    if (resourceId) {
      sql += ' AND resource_id = ?';
      params.push(resourceId);
    }

    if (severity) {
      sql += ' AND severity = ?';
      params.push(severity);
    }

    if (success !== undefined) {
      sql += ' AND success = ?';
      params.push(success ? 1 : 0);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('[AuditLog] Query failed', { error: err.message });
          reject(err);
        } else {
          const logs = rows.map(row => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            success: Boolean(row.success)
          }));
          resolve(logs);
        }
      });
    });
  }

  /**
   * Get audit statistics
   */
  async getStats(filters = {}) {
    const { startDate, endDate } = filters;

    let sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warnings
      FROM audit_logs
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('[AuditLog] Stats query failed', { error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get action breakdown
   */
  async getActionBreakdown(filters = {}) {
    const { startDate, endDate, limit = 10 } = filters;

    let sql = `
      SELECT
        action,
        COUNT(*) as count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
      FROM audit_logs
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY action ORDER BY count DESC LIMIT ?';
    params.push(limit);

    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('[AuditLog] Action breakdown query failed', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get user activity
   */
  async getUserActivity(actorId, limit = 50) {
    const sql = `
      SELECT * FROM audit_logs
      WHERE actor_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      db.all(sql, [actorId, limit], (err, rows) => {
        if (err) {
          logger.error('[AuditLog] User activity query failed', { error: err.message });
          reject(err);
        } else {
          const logs = rows.map(row => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            success: Boolean(row.success)
          }));
          resolve(logs);
        }
      });
    });
  }

  /**
   * Export audit logs for compliance
   */
  async export(filters = {}) {
    const logs = await this.query({ ...filters, limit: 10000 });

    return {
      exportDate: new Date().toISOString(),
      totalRecords: logs.length,
      filters,
      logs
    };
  }

  /**
   * Archive old logs
   */
  async archiveOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const sql = 'DELETE FROM audit_logs WHERE timestamp < ?';

    return new Promise((resolve, reject) => {
      db.run(sql, [cutoffDate.toISOString()], function(err) {
        if (err) {
          logger.error('[AuditLog] Archive failed', { error: err.message });
          reject(err);
        } else {
          logger.info('[AuditLog] Old logs archived', {
            deleted: this.changes,
            cutoffDate
          });
          resolve({ deleted: this.changes });
        }
      });
    });
  }

  /**
   * Helper: Create audit log from Express request
   */
  createFromRequest(action, req, additional = {}) {
    return this.log({
      action,
      actorId: req.user?.id || req.session?.userId,
      actorType: req.user?.type || 'user',
      actorIp: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.sessionID || req.session?.id,
      ...additional
    });
  }
}

const auditLogService = new AuditLogService();

// Initialize on startup
auditLogService.initialize().catch(err => {
  logger.error('[AuditLog] Initialization failed', { error: err.message });
});

module.exports = auditLogService;
