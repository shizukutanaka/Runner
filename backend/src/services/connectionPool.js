const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

/**
 * Database connection pool manager for SQLite
 * Manages multiple connections to improve concurrency
 */
class ConnectionPool {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.poolSize = options.poolSize || 5;
    this.timeout = options.timeout || 10000;
    this.pool = [];
    this.activeConnections = 0;
    this.queue = [];
    this.initialized = false;

    // Performance settings
    this.pragmas = [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA cache_size = -64000',
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456',
      'PRAGMA page_size = 4096',
      'PRAGMA auto_vacuum = INCREMENTAL'
    ];
  }

  async initialize() {
    if (this.initialized) return;

    logger.info('[ConnectionPool] Initializing pool', {
      dbPath: this.dbPath,
      poolSize: this.poolSize
    });

    for (let i = 0; i < this.poolSize; i++) {
      const conn = await this.createConnection();
      this.pool.push({ conn, inUse: false });
    }

    this.initialized = true;
    logger.info('[ConnectionPool] Pool initialized', { connections: this.pool.length });
  }

  async createConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(
        this.dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        async (err) => {
          if (err) {
            logger.error('[ConnectionPool] Connection creation failed', { error: err.message });
            return reject(err);
          }

          db.configure('busyTimeout', this.timeout);

          // Apply pragmas
          for (const pragma of this.pragmas) {
            await new Promise((res, rej) => {
              db.run(pragma, (err) => {
                if (err) {
                  logger.warn('[ConnectionPool] Pragma failed', { pragma, error: err.message });
                }
                res();
              });
            });
          }

          logger.debug('[ConnectionPool] Connection created');
          resolve(db);
        }
      );
    });
  }

  async acquire() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Find available connection
    for (const poolConn of this.pool) {
      if (!poolConn.inUse) {
        poolConn.inUse = true;
        this.activeConnections++;
        logger.debug('[ConnectionPool] Connection acquired', {
          active: this.activeConnections,
          total: this.pool.length
        });
        return poolConn.conn;
      }
    }

    // No available connection, wait for one
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.timeout);

      this.queue.push({
        resolve: (conn) => {
          clearTimeout(timeoutId);
          resolve(conn);
        },
        reject
      });
    });
  }

  release(conn) {
    const poolConn = this.pool.find(pc => pc.conn === conn);

    if (!poolConn) {
      logger.warn('[ConnectionPool] Attempted to release unknown connection');
      return;
    }

    poolConn.inUse = false;
    this.activeConnections--;

    logger.debug('[ConnectionPool] Connection released', {
      active: this.activeConnections,
      queued: this.queue.length
    });

    // Serve queued requests
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift();
      poolConn.inUse = true;
      this.activeConnections++;
      resolve(conn);
    }
  }

  async execute(queryFn) {
    const conn = await this.acquire();

    try {
      const result = await queryFn(conn);
      this.release(conn);
      return result;
    } catch (error) {
      this.release(conn);
      throw error;
    }
  }

  async query(sql, params = []) {
    return this.execute((conn) => {
      return new Promise((resolve, reject) => {
        conn.all(sql, params, (err, rows) => {
          if (err) {
            logger.error('[ConnectionPool] Query failed', {
              error: err.message,
              sql: sql.substring(0, 100)
            });
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    });
  }

  async queryOne(sql, params = []) {
    return this.execute((conn) => {
      return new Promise((resolve, reject) => {
        conn.get(sql, params, (err, row) => {
          if (err) {
            logger.error('[ConnectionPool] Query failed', {
              error: err.message,
              sql: sql.substring(0, 100)
            });
            reject(err);
          } else {
            resolve(row || null);
          }
        });
      });
    });
  }

  async run(sql, params = []) {
    return this.execute((conn) => {
      return new Promise((resolve, reject) => {
        conn.run(sql, params, function(err) {
          if (err) {
            logger.error('[ConnectionPool] Run failed', {
              error: err.message,
              sql: sql.substring(0, 100)
            });
            reject(err);
          } else {
            resolve({
              lastID: this.lastID,
              changes: this.changes
            });
          }
        });
      });
    });
  }

  async transaction(callback) {
    return this.execute(async (conn) => {
      await new Promise((resolve, reject) => {
        conn.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      try {
        const result = await callback(conn);

        await new Promise((resolve, reject) => {
          conn.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        return result;
      } catch (error) {
        await new Promise((resolve) => {
          conn.run('ROLLBACK', () => resolve());
        });
        throw error;
      }
    });
  }

  async close() {
    logger.info('[ConnectionPool] Closing all connections');

    const closePromises = this.pool.map(({ conn }) => {
      return new Promise((resolve) => {
        conn.close((err) => {
          if (err) {
            logger.error('[ConnectionPool] Error closing connection', { error: err.message });
          }
          resolve();
        });
      });
    });

    await Promise.all(closePromises);
    this.pool = [];
    this.initialized = false;

    logger.info('[ConnectionPool] All connections closed');
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      active: this.activeConnections,
      available: this.pool.filter(pc => !pc.inUse).length,
      queued: this.queue.length
    };
  }
}

module.exports = ConnectionPool;
