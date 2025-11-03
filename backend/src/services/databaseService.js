const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const encryptionService = require('./encryptionService');

class DatabaseService {
  constructor() {
    this.db = null;
    this.connectionPool = [];
    this.maxConnections = 10;
    this.activeConnections = 0;
    this.waitingQueue = [];
    this.queryTimeout = 30000; // 30 seconds
    this.healthCheckInterval = 60000; // 1 minute
    this.isHealthy = true;
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      connectionErrors: 0
    };

    this.initialize();
  }

  async initialize() {
    try {
      await this.ensureDataDirectory();
      await this.createPrimaryConnection();
      await this.initializeSchema();
      await this.setupConnectionPool();
      await this.enableWALMode();
      await this.optimizeSettings();
      this.startHealthCheck();

      logger.info('[DatabaseService] Initialized successfully', {
        path: config.database.path,
        maxConnections: this.maxConnections,
        walMode: true
      });
    } catch (error) {
      logger.error('[DatabaseService] Initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureDataDirectory() {
    const dataDir = path.dirname(config.database.path);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async createPrimaryConnection() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.database.path, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          logger.error('[DatabaseService] Primary connection failed', {
            error: err.message,
            path: config.database.path
          });
          reject(err);
        } else {
          logger.info('[DatabaseService] Primary connection established');
          resolve();
        }
      });
    });
  }

  async setupConnectionPool() {
    for (let i = 0; i < this.maxConnections; i++) {
      try {
        const connection = await this.createConnection();
        this.connectionPool.push({
          db: connection,
          inUse: false,
          lastUsed: Date.now(),
          queryCount: 0
        });
      } catch (error) {
        logger.warn('[DatabaseService] Failed to create pooled connection', {
          index: i,
          error: error.message
        });
      }
    }

    logger.info('[DatabaseService] Connection pool created', {
      poolSize: this.connectionPool.length
    });
  }

  async createConnection() {
    return new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(
        config.database.path,
        sqlite3.OPEN_READWRITE,
        (err) => {
          if (err) {
            this.metrics.connectionErrors++;
            reject(err);
          } else {
            resolve(connection);
          }
        }
      );
    });
  }

  async getConnection() {
    return new Promise((resolve) => {
      // Try to get an available connection from the pool
      for (const conn of this.connectionPool) {
        if (!conn.inUse) {
          conn.inUse = true;
          conn.lastUsed = Date.now();
          this.activeConnections++;
          resolve(conn);
          return;
        }
      }

      // If no connection available, queue the request
      this.waitingQueue.push(resolve);
    });
  }

  releaseConnection(connection) {
    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.activeConnections--;

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const nextResolve = this.waitingQueue.shift();
      connection.inUse = true;
      this.activeConnections++;
      nextResolve(connection);
    }
  }

  async enableWALMode() {
    try {
      await this.run('PRAGMA journal_mode=WAL');
      await this.run('PRAGMA synchronous=NORMAL');
      await this.run('PRAGMA cache_size=10000');
      await this.run('PRAGMA temp_store=memory');
      await this.run('PRAGMA mmap_size=268435456'); // 256MB
      logger.info('[DatabaseService] WAL mode enabled with optimizations');
    } catch (error) {
      logger.error('[DatabaseService] Failed to enable WAL mode', {
        error: error.message
      });
    }
  }

  async optimizeSettings() {
    try {
      // Performance optimizations
      await this.run('PRAGMA foreign_keys=ON');
      await this.run('PRAGMA optimize');

      // Auto-vacuum for space management
      await this.run('PRAGMA auto_vacuum=INCREMENTAL');

      logger.info('[DatabaseService] Database settings optimized');
    } catch (error) {
      logger.error('[DatabaseService] Failed to optimize settings', {
        error: error.message
      });
    }
  }

  async initializeSchema() {
    const schema = `
      -- Enhanced comments table with full-text search
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        user TEXT NOT NULL,
        content TEXT NOT NULL,
        content_encrypted TEXT, -- For sensitive content
        timestamp DATETIME NOT NULL,
        status TEXT DEFAULT 'active',
        moderation_reason TEXT,
        moderation_timestamp DATETIME,
        moderation_score REAL,
        moderator TEXT,
        avatar_url TEXT,
        background_color TEXT,
        highlight INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        auto_archive INTEGER DEFAULT 0,
        external_shared INTEGER DEFAULT 0,
        notification_frequency TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
        content,
        content='comments',
        content_rowid='rowid'
      );

      -- Triggers to maintain FTS index
      CREATE TRIGGER IF NOT EXISTS comments_ai AFTER INSERT ON comments BEGIN
        INSERT INTO comments_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS comments_ad AFTER DELETE ON comments BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS comments_au AFTER UPDATE ON comments BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO comments_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      -- Enhanced users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        email_encrypted TEXT,
        status TEXT DEFAULT 'active',
        role TEXT DEFAULT 'user',
        tier TEXT DEFAULT 'free',
        warning_count INTEGER DEFAULT 0,
        ban_until DATETIME,
        mute_until DATETIME,
        history TEXT,
        preferences TEXT,
        last_active DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Session management
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- API keys for external access
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        permissions TEXT NOT NULL,
        last_used DATETIME,
        expires_at DATETIME,
        revoked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Audit log for compliance
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Enhanced notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system',
        level TEXT NOT NULL DEFAULT 'info',
        read INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Comment edit history
      CREATE TABLE IF NOT EXISTS comment_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        editor TEXT NOT NULL,
        previous_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        edit_reason TEXT,
        edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
      );

      -- File uploads tracking
      CREATE TABLE IF NOT EXISTS file_uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        checksum TEXT NOT NULL,
        encrypted INTEGER DEFAULT 0,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- System configuration
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        encrypted INTEGER DEFAULT 0,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Performance monitoring
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        tags TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create optimized indexes
      CREATE INDEX IF NOT EXISTS idx_comments_platform_timestamp ON comments(platform, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_comments_user_status ON comments(user, status);
      CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_comments_pinned_timestamp ON comments(pinned, timestamp DESC) WHERE pinned = 1;

      CREATE INDEX IF NOT EXISTS idx_users_platform_status ON users(platform, status);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);

      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_expires ON api_keys(user_id, expires_at);

      CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp ON audit_log(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_action_timestamp ON audit_log(action, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);

      CREATE INDEX IF NOT EXISTS idx_uploads_user_uploaded ON file_uploads(user_id, uploaded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_uploads_checksum ON file_uploads(checksum);

      CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_timestamp ON performance_metrics(metric_name, timestamp DESC);
    `;

    try {
      await this.exec(schema);
      logger.info('[DatabaseService] Schema initialized successfully');
    } catch (error) {
      logger.error('[DatabaseService] Schema initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  // Promisified database operations
  async run(sql, params = []) {
    const startTime = Date.now();
    const connection = await this.getConnection();

    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Query timeout'));
        }, this.queryTimeout);

        connection.db.run(sql, params, function(err) {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            resolve({
              lastID: this.lastID,
              changes: this.changes
            });
          }
        });
      });

      const duration = Date.now() - startTime;
      this.recordQueryMetrics(true, duration);

      if (duration > 1000) { // Log slow queries
        logger.warn('[DatabaseService] Slow query detected', {
          sql: sql.substring(0, 100),
          duration,
          params: params.length
        });
        this.metrics.slowQueries++;
      }

      return result;
    } catch (error) {
      this.recordQueryMetrics(false, Date.now() - startTime);
      logger.error('[DatabaseService] Query failed', {
        sql: sql.substring(0, 100),
        error: error.message,
        params: params.length
      });
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  async get(sql, params = []) {
    const startTime = Date.now();
    const connection = await this.getConnection();

    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Query timeout'));
        }, this.queryTimeout);

        connection.db.get(sql, params, (err, row) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });

      const duration = Date.now() - startTime;
      this.recordQueryMetrics(true, duration);
      return result;
    } catch (error) {
      this.recordQueryMetrics(false, Date.now() - startTime);
      logger.error('[DatabaseService] Get query failed', {
        sql: sql.substring(0, 100),
        error: error.message
      });
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  async all(sql, params = []) {
    const startTime = Date.now();
    const connection = await this.getConnection();

    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Query timeout'));
        }, this.queryTimeout);

        connection.db.all(sql, params, (err, rows) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });

      const duration = Date.now() - startTime;
      this.recordQueryMetrics(true, duration);
      return result;
    } catch (error) {
      this.recordQueryMetrics(false, Date.now() - startTime);
      logger.error('[DatabaseService] All query failed', {
        sql: sql.substring(0, 100),
        error: error.message
      });
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  async exec(sql) {
    const connection = await this.getConnection();

    try {
      await new Promise((resolve, reject) => {
        connection.db.exec(sql, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  // Transaction support
  async transaction(callback) {
    const connection = await this.getConnection();

    try {
      await new Promise((resolve, reject) => {
        connection.db.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const result = await callback({
        run: (sql, params = []) => this.runInConnection(connection.db, sql, params),
        get: (sql, params = []) => this.getInConnection(connection.db, sql, params),
        all: (sql, params = []) => this.allInConnection(connection.db, sql, params)
      });

      await new Promise((resolve, reject) => {
        connection.db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return result;
    } catch (error) {
      await new Promise((resolve) => {
        connection.db.run('ROLLBACK', () => {
          resolve(); // Always resolve, even if rollback fails
        });
      });
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  // Connection-specific operations for transactions
  async runInConnection(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  async getInConnection(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async allInConnection(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Encrypted data operations
  async setEncrypted(table, id, field, value) {
    const encrypted = encryptionService.encryptField(value, table, field);
    const sql = `UPDATE ${table} SET ${field}_encrypted = ? WHERE id = ?`;
    return this.run(sql, [encrypted, id]);
  }

  async getEncrypted(table, id, field) {
    const sql = `SELECT ${field}_encrypted FROM ${table} WHERE id = ?`;
    const row = await this.get(sql, [id]);
    if (!row || !row[`${field}_encrypted`]) {
      return null;
    }
    return encryptionService.decryptField(row[`${field}_encrypted`], table, field);
  }

  // Full-text search
  async searchComments(query, limit = 10, offset = 0) {
    const sql = `
      SELECT c.*, snippet(comments_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      FROM comments_fts fts
      JOIN comments c ON c.rowid = fts.rowid
      WHERE comments_fts MATCH ?
      ORDER BY bm25(comments_fts)
      LIMIT ? OFFSET ?
    `;
    return this.all(sql, [query, limit, offset]);
  }

  // Health check
  async checkHealth() {
    try {
      const result = await this.get('SELECT 1 as test');
      const isHealthy = result && result.test === 1;

      if (isHealthy !== this.isHealthy) {
        this.isHealthy = isHealthy;
        logger.info('[DatabaseService] Health status changed', { healthy: isHealthy });
      }

      return isHealthy;
    } catch (error) {
      logger.error('[DatabaseService] Health check failed', {
        error: error.message
      });
      this.isHealthy = false;
      return false;
    }
  }

  startHealthCheck() {
    setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckInterval);
  }

  recordQueryMetrics(success, duration) {
    this.metrics.totalQueries++;
    if (success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.failedQueries++;
    }

    // Update average query time
    this.metrics.averageQueryTime = (
      (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1)) + duration
    ) / this.metrics.totalQueries;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.activeConnections,
      poolSize: this.connectionPool.length,
      waitingQueue: this.waitingQueue.length,
      healthy: this.isHealthy,
      successRate: this.metrics.totalQueries > 0
        ? (this.metrics.successfulQueries / this.metrics.totalQueries * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  // Database maintenance
  async vacuum() {
    try {
      await this.exec('VACUUM');
      logger.info('[DatabaseService] VACUUM completed');
    } catch (error) {
      logger.error('[DatabaseService] VACUUM failed', {
        error: error.message
      });
    }
  }

  async analyze() {
    try {
      await this.exec('ANALYZE');
      logger.info('[DatabaseService] ANALYZE completed');
    } catch (error) {
      logger.error('[DatabaseService] ANALYZE failed', {
        error: error.message
      });
    }
  }

  async optimize() {
    try {
      await this.exec('PRAGMA optimize');
      logger.info('[DatabaseService] Database optimized');
    } catch (error) {
      logger.error('[DatabaseService] Optimization failed', {
        error: error.message
      });
    }
  }

  // Graceful shutdown
  async close() {
    try {
      // Close all pooled connections
      for (const conn of this.connectionPool) {
        await new Promise((resolve) => {
          conn.db.close((err) => {
            if (err) {
              logger.error('[DatabaseService] Error closing pooled connection', {
                error: err.message
              });
            }
            resolve();
          });
        });
      }

      // Close primary connection
      if (this.db) {
        await new Promise((resolve) => {
          this.db.close((err) => {
            if (err) {
              logger.error('[DatabaseService] Error closing primary connection', {
                error: err.message
              });
            } else {
              logger.info('[DatabaseService] All connections closed');
            }
            resolve();
          });
        });
      }

      this.connectionPool = [];
      this.waitingQueue = [];
    } catch (error) {
      logger.error('[DatabaseService] Error during shutdown', {
        error: error.message
      });
    }
  }
}

module.exports = new DatabaseService();