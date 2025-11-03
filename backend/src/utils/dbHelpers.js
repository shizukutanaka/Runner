const logger = require('../logger');

/**
 * Database helper utilities for SQL injection prevention and query safety
 */

/**
 * Execute a parameterized query safely
 * @param {Object} db - Database connection
 * @param {string} sql - SQL query with placeholders (?)
 * @param {Array} params - Parameters to bind
 * @returns {Promise<Object>} Query result
 */
const safeQuery = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error('[DB] Query failed', {
          error: err.message,
          sql: sql.substring(0, 100),
          paramCount: params.length
        });
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * Execute a single row query safely
 * @param {Object} db - Database connection
 * @param {string} sql - SQL query with placeholders (?)
 * @param {Array} params - Parameters to bind
 * @returns {Promise<Object|null>} Single row or null
 */
const safeQueryOne = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        logger.error('[DB] Query failed', {
          error: err.message,
          sql: sql.substring(0, 100),
          paramCount: params.length
        });
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
};

/**
 * Execute a write query safely (INSERT, UPDATE, DELETE)
 * @param {Object} db - Database connection
 * @param {string} sql - SQL query with placeholders (?)
 * @param {Array} params - Parameters to bind
 * @returns {Promise<Object>} Result with lastID and changes
 */
const safeRun = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        logger.error('[DB] Write query failed', {
          error: err.message,
          sql: sql.substring(0, 100),
          paramCount: params.length
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
};

/**
 * Build WHERE clause from filters safely
 * @param {Object} filters - Key-value pairs for filtering
 * @returns {Object} { clause, params } for safe query building
 */
const buildWhereClause = (filters = {}) => {
  const conditions = [];
  const params = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      // Validate column name (whitelist approach)
      if (!isValidColumnName(key)) {
        throw new Error(`Invalid column name: ${key}`);
      }

      if (Array.isArray(value)) {
        // IN clause
        const placeholders = value.map(() => '?').join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        // Custom operator (e.g., { operator: '>', value: 10 })
        const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'];
        if (!validOperators.includes(value.operator)) {
          throw new Error(`Invalid operator: ${value.operator}`);
        }
        conditions.push(`${key} ${value.operator} ?`);
        params.push(value.value);
      } else {
        // Equals
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
};

/**
 * Validate column name to prevent SQL injection
 * @param {string} column - Column name to validate
 * @returns {boolean} True if valid
 */
const isValidColumnName = (column) => {
  // Only allow alphanumeric characters and underscores
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column);
};

/**
 * Build ORDER BY clause safely
 * @param {string} column - Column to order by
 * @param {string} direction - ASC or DESC
 * @returns {string} Safe ORDER BY clause
 */
const buildOrderByClause = (column, direction = 'ASC') => {
  if (!column) return '';

  if (!isValidColumnName(column)) {
    throw new Error(`Invalid column name for ordering: ${column}`);
  }

  const validDirections = ['ASC', 'DESC'];
  const dir = direction.toUpperCase();

  if (!validDirections.includes(dir)) {
    throw new Error(`Invalid sort direction: ${direction}`);
  }

  return `ORDER BY ${column} ${dir}`;
};

/**
 * Build LIMIT and OFFSET clause safely
 * @param {number} limit - Maximum number of rows
 * @param {number} offset - Number of rows to skip
 * @returns {Object} { clause, params }
 */
const buildPaginationClause = (limit, offset = 0) => {
  const params = [];
  let clause = '';

  if (limit !== undefined && limit !== null) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 0) {
      throw new Error(`Invalid limit value: ${limit}`);
    }
    clause += 'LIMIT ?';
    params.push(limitNum);
  }

  if (offset !== undefined && offset !== null) {
    const offsetNum = parseInt(offset, 10);
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new Error(`Invalid offset value: ${offset}`);
    }
    clause += ' OFFSET ?';
    params.push(offsetNum);
  }

  return { clause, params };
};

/**
 * Execute batch insert safely
 * @param {Object} db - Database connection
 * @param {string} table - Table name
 * @param {Array} rows - Array of row objects
 * @returns {Promise<Object>} Batch insert result
 */
const safeBatchInsert = async (db, table, rows) => {
  if (!rows || rows.length === 0) {
    return { inserted: 0 };
  }

  if (!isValidColumnName(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  const columns = Object.keys(rows[0]);

  // Validate all column names
  for (const col of columns) {
    if (!isValidColumnName(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }

  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  let inserted = 0;

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) return reject(err);

        const stmt = db.prepare(sql);

        rows.forEach((row) => {
          const values = columns.map(col => row[col]);
          stmt.run(values, (err) => {
            if (err) {
              logger.error('[DB] Batch insert row failed', { error: err.message });
            } else {
              inserted++;
            }
          });
        });

        stmt.finalize((err) => {
          if (err) return reject(err);

          db.run('COMMIT', (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });

  logger.info('[DB] Batch insert completed', { table, total: rows.length, inserted });

  return { inserted, total: rows.length };
};

/**
 * Execute query with retry logic for busy database
 * @param {Function} queryFn - Query function to execute
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise} Query result
 */
const retryQuery = async (queryFn, maxRetries = 3, delay = 100) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error;

      if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
        logger.debug('[DB] Database busy, retrying', { attempt: i + 1, maxRetries });
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
};

module.exports = {
  safeQuery,
  safeQueryOne,
  safeRun,
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
  safeBatchInsert,
  retryQuery,
  isValidColumnName
};
