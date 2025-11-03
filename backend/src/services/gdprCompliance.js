const logger = require('../logger');
const db = require('../db');
const crypto = require('crypto');

/**
 * GDPR Compliance Service
 * Implements data protection and privacy regulations
 */

class GDPRComplianceService {
  constructor() {
    this.retentionPolicies = {
      comments: 90 * 24 * 60 * 60 * 1000, // 90 days
      users: 365 * 24 * 60 * 60 * 1000, // 1 year
      sessions: 30 * 24 * 60 * 60 * 1000, // 30 days
      logs: 180 * 24 * 60 * 60 * 1000, // 180 days
      analytics: 730 * 24 * 60 * 60 * 1000 // 2 years
    };
  }

  /**
   * Initialize GDPR tables
   */
  async initialize() {
    const sql = `
      CREATE TABLE IF NOT EXISTS data_processing_consents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        granted INTEGER NOT NULL DEFAULT 0,
        granted_at DATETIME,
        withdrawn_at DATETIME,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, consent_type)
      );

      CREATE TABLE IF NOT EXISTS data_deletion_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        completed_at DATETIME,
        data_backup TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS data_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        export_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        download_url TEXT,
        expires_at DATETIME,
        download_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS data_anonymization_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        anonymized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_types TEXT,
        irreversible INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_consents_user ON data_processing_consents(user_id);
      CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON data_deletion_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_exports_user ON data_exports(user_id);
    `;

    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          logger.error('[GDPR] Initialization failed', { error: err.message });
          reject(err);
        } else {
          logger.info('[GDPR] Initialized successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Record user consent
   */
  async recordConsent(userId, consentType, granted, metadata = {}) {
    const sql = `
      INSERT OR REPLACE INTO data_processing_consents
      (user_id, consent_type, granted, granted_at, withdrawn_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();
    const values = [
      userId,
      consentType,
      granted ? 1 : 0,
      granted ? now : null,
      granted ? null : now,
      metadata.ip || null,
      metadata.userAgent || null
    ];

    return new Promise((resolve, reject) => {
      db.run(sql, values, function(err) {
        if (err) {
          logger.error('[GDPR] Failed to record consent', { error: err.message });
          reject(err);
        } else {
          logger.info('[GDPR] Consent recorded', {
            userId,
            consentType,
            granted
          });
          resolve({ id: this.lastID });
        }
      });
    });
  }

  /**
   * Check if user has given consent
   */
  async hasConsent(userId, consentType) {
    const sql = `
      SELECT granted FROM data_processing_consents
      WHERE user_id = ? AND consent_type = ?
      AND withdrawn_at IS NULL
    `;

    return new Promise((resolve, reject) => {
      db.get(sql, [userId, consentType], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.granted === 1);
        }
      });
    });
  }

  /**
   * Request data deletion (Right to be Forgotten)
   */
  async requestDataDeletion(userId, requestType = 'full') {
    const sql = `
      INSERT INTO data_deletion_requests
      (user_id, request_type, status)
      VALUES (?, ?, 'pending')
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, [userId, requestType], function(err) {
        if (err) {
          logger.error('[GDPR] Failed to create deletion request', { error: err.message });
          reject(err);
        } else {
          logger.info('[GDPR] Deletion request created', {
            userId,
            requestType,
            requestId: this.lastID
          });
          resolve({ requestId: this.lastID });
        }
      });
    });
  }

  /**
   * Process data deletion request
   */
  async processDataDeletion(requestId) {
    // Get deletion request
    const request = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM data_deletion_requests WHERE id = ?',
        [requestId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!request) {
      throw new Error('Deletion request not found');
    }

    const userId = request.user_id;

    try {
      // Create backup before deletion
      const backup = await this.createDataBackup(userId);

      // Update request status
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE data_deletion_requests
           SET status = 'processing', processed_at = ?, data_backup = ?
           WHERE id = ?`,
          [new Date().toISOString(), JSON.stringify(backup), requestId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Delete user data
      if (request.request_type === 'full') {
        await this.deleteAllUserData(userId);
      } else {
        await this.anonymizeUserData(userId);
      }

      // Mark as completed
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE data_deletion_requests
           SET status = 'completed', completed_at = ?
           WHERE id = ?`,
          [new Date().toISOString(), requestId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      logger.info('[GDPR] Data deletion completed', { userId, requestId });

      return { success: true, requestId };
    } catch (error) {
      // Mark as failed
      await new Promise((resolve) => {
        db.run(
          `UPDATE data_deletion_requests
           SET status = 'failed', notes = ?
           WHERE id = ?`,
          [error.message, requestId],
          () => resolve()
        );
      });

      logger.error('[GDPR] Data deletion failed', {
        userId,
        requestId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create data backup before deletion
   */
  async createDataBackup(userId) {
    const backup = {
      userId,
      exportedAt: new Date().toISOString(),
      data: {}
    };

    // Backup comments
    backup.data.comments = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM comments WHERE user = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Backup user data
    backup.data.user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    return backup;
  }

  /**
   * Delete all user data
   */
  async deleteAllUserData(userId) {
    const tables = [
      'comments',
      'users',
      'user_settings',
      'data_processing_consents'
    ];

    for (const table of tables) {
      await new Promise((resolve, reject) => {
        const idColumn = table === 'comments' ? 'user' :
                        table === 'data_processing_consents' ? 'user_id' : 'id';

        db.run(
          `DELETE FROM ${table} WHERE ${idColumn} = ?`,
          [userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    logger.info('[GDPR] All user data deleted', { userId });
  }

  /**
   * Anonymize user data (instead of deletion)
   */
  async anonymizeUserData(userId) {
    const anonymousId = `anon_${crypto.randomBytes(8).toString('hex')}`;

    // Anonymize comments
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE comments SET user = ?, content = '[REDACTED]' WHERE user = ?`,
        [anonymousId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Anonymize user record
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET username = ?, email = NULL, profile_image = NULL, bio = NULL WHERE id = ?`,
        [anonymousId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Log anonymization
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO data_anonymization_log (user_id, data_types) VALUES (?, ?)`,
        [userId, 'comments,user_profile'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    logger.info('[GDPR] User data anonymized', { userId, anonymousId });
  }

  /**
   * Export user data (Right to Data Portability)
   */
  async exportUserData(userId, exportType = 'full') {
    const sql = `
      INSERT INTO data_exports
      (user_id, export_type, status)
      VALUES (?, ?, 'pending')
    `;

    const exportId = await new Promise((resolve, reject) => {
      db.run(sql, [userId, exportType], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    // Generate export data
    const exportData = await this.createDataBackup(userId);

    // Update export record
    const downloadUrl = `/api/gdpr/exports/${exportId}/download`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE data_exports
         SET status = 'completed', completed_at = ?, download_url = ?, expires_at = ?
         WHERE id = ?`,
        [new Date().toISOString(), downloadUrl, expiresAt.toISOString(), exportId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    logger.info('[GDPR] Data export created', { userId, exportId });

    return {
      exportId,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      data: exportData
    };
  }

  /**
   * Clean up old data based on retention policies
   */
  async enforceRetentionPolicies() {
    const now = Date.now();
    let totalDeleted = 0;

    for (const [dataType, retention] of Object.entries(this.retentionPolicies)) {
      const cutoffDate = new Date(now - retention).toISOString();
      let deleted = 0;

      switch (dataType) {
        case 'comments':
          deleted = await this.deleteOldRecords('comments', cutoffDate);
          break;
        case 'logs':
          deleted = await this.deleteOldRecords('audit_logs', cutoffDate);
          break;
        case 'sessions':
          // Handled by session manager
          break;
      }

      totalDeleted += deleted;
    }

    logger.info('[GDPR] Retention policies enforced', { totalDeleted });

    return { totalDeleted };
  }

  /**
   * Delete old records from table
   */
  async deleteOldRecords(table, cutoffDate) {
    const sql = `DELETE FROM ${table} WHERE created_at < ?`;

    return new Promise((resolve, reject) => {
      db.run(sql, [cutoffDate], function(err) {
        if (err) {
          logger.error('[GDPR] Failed to delete old records', {
            table,
            error: err.message
          });
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }
}

const gdprService = new GDPRComplianceService();

// Initialize on startup
gdprService.initialize().catch(err => {
  logger.error('[GDPR] Initialization failed', { error: err.message });
});

// Run retention policy enforcement daily
setInterval(() => {
  gdprService.enforceRetentionPolicies().catch(err => {
    logger.error('[GDPR] Retention policy enforcement failed', { error: err.message });
  });
}, 24 * 60 * 60 * 1000);

module.exports = gdprService;
