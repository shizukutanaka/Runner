const logger = require('../logger');

/**
 * Database Query Optimization Utilities
 */
class QueryOptimizer {
  constructor() {
    this.queryStats = new Map();
    this.slowQueryThreshold = 100; // ms
  }

  /**
   * Analyze query performance
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {number} executionTime - Execution time in milliseconds
   */
  recordQueryStats(query, params, executionTime) {
    const key = this.generateQueryKey(query);
    const stats = this.queryStats.get(key) || {
      query,
      count: 0,
      totalTime: 0,
      avgTime: 0,
      maxTime: 0,
      minTime: Infinity,
      slowCount: 0
    };

    stats.count++;
    stats.totalTime += executionTime;
    stats.avgTime = stats.totalTime / stats.count;
    stats.maxTime = Math.max(stats.maxTime, executionTime);
    stats.minTime = Math.min(stats.minTime, executionTime);

    if (executionTime > this.slowQueryThreshold) {
      stats.slowCount++;
    }

    this.queryStats.set(key, stats);

    if (executionTime > this.slowQueryThreshold) {
      logger.warn('[QueryOptimizer] Slow query detected', {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        executionTime,
        params: params ? params.length : 0
      });
    }
  }

  /**
   * Generate a unique key for query statistics
   * @param {string} query - SQL query
   * @returns {string} Query key
   */
  generateQueryKey(query) {
    // Normalize query by removing specific values and whitespace
    return query
      .replace(/\s+/g, ' ')
      .replace(/'[^']*'/g, '?')
      .replace(/\d+/g, 'N')
      .trim();
  }

  /**
   * Get query performance statistics
   * @returns {Array} Array of query statistics
   */
  getQueryStats() {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.totalTime - a.totalTime);
  }

  /**
   * Clear query statistics
   */
  clearStats() {
    this.queryStats.clear();
  }

  /**
   * Optimize SELECT query by suggesting indexes
   * @param {string} query - SQL query
   * @returns {Array} Array of suggested indexes
   */
  suggestIndexes(query) {
    const suggestions = [];

    // Check for WHERE clauses that might benefit from indexes
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+(?:ORDER BY|GROUP BY|LIMIT|OFFSET)|\s*$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];

      // Look for column comparisons
      const columnMatches = whereClause.match(/(\w+)\s*[=<>!]+\s*[\?\w]/g);
      if (columnMatches) {
        columnMatches.forEach(match => {
          const column = match.split(/\s*[=<>!]+\s*/)[0];
          if (column && !column.includes('?')) {
            suggestions.push(`CREATE INDEX IF NOT EXISTS idx_${column} ON table_name(${column})`);
          }
        });
      }

      // Look for LIKE queries
      if (whereMatch[1].includes('LIKE')) {
        const likeMatches = whereClause.match(/(\w+)\s+LIKE/g);
        if (likeMatches) {
          likeMatches.forEach(match => {
            const column = match.replace(/\s+LIKE/, '');
            suggestions.push(`CREATE INDEX IF NOT EXISTS idx_${column}_like ON table_name(${column})`);
          });
        }
      }
    }

    // Check for ORDER BY clauses
    const orderByMatch = query.match(/ORDER BY\s+(.+?)(?:\s+(?:LIMIT|OFFSET)|\s*$)/i);
    if (orderByMatch) {
      const orderColumns = orderByMatch[1].split(',').map(col => col.trim().split(' ')[0]);
      orderColumns.forEach(column => {
        if (column && !column.includes('?')) {
          suggestions.push(`CREATE INDEX IF NOT EXISTS idx_${column}_order ON table_name(${column})`);
        }
      });
    }

    return suggestions;
  }

  /**
   * Optimize query execution with EXPLAIN QUERY PLAN
   * @param {Object} db - Database connection
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query plan analysis
   */
  async analyzeQueryPlan(db, query, params = []) {
    return new Promise((resolve, reject) => {
      const explainQuery = `EXPLAIN QUERY PLAN ${query}`;

      db.all(explainQuery, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const analysis = {
          query,
          plan: rows,
          suggestions: []
        };

        // Analyze the query plan for potential optimizations
        rows.forEach(row => {
          const detail = row.detail.toLowerCase();

          // Check for table scans (inefficient)
          if (detail.includes('scan') && !detail.includes('index')) {
            analysis.suggestions.push('Consider adding an index for better performance');
          }

          // Check for temporary sorts
          if (detail.includes('use temp b-tree')) {
            analysis.suggestions.push('Consider adding an index to avoid temporary sorting');
          }
        });

        resolve(analysis);
      });
    });
  }
}

/**
 * Query execution wrapper with performance monitoring
 * @param {Object} db - Database connection
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Operation type ('get', 'all', 'run')
 * @returns {Promise} Query result
 */
function executeWithMonitoring(db, sql, params = [], operation = 'all') {
  const optimizer = getQueryOptimizer();
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const callback = (err, result) => {
      const executionTime = Date.now() - startTime;

      optimizer.recordQueryStats(sql, params, executionTime);

      if (err) {
        logger.error('[Database] Query failed', {
          sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
          executionTime,
          error: err.message
        });
        reject(err);
      } else {
        if (executionTime > 1000) { // Log very slow queries
          logger.warn('[Database] Very slow query', {
            sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
            executionTime,
            params: params ? params.length : 0
          });
        }

        resolve(result);
      }
    };

    switch (operation) {
      case 'get':
        db.get(sql, params, callback);
        break;
      case 'run':
        db.run(sql, params, function(err) {
          callback(err, { lastID: this.lastID, changes: this.changes });
        });
        break;
      case 'all':
      default:
        db.all(sql, params, callback);
        break;
    }
  });
}

// Singleton instance
let queryOptimizerInstance = null;

/**
 * Get the query optimizer singleton instance
 * @returns {QueryOptimizer} Query optimizer instance
 */
function getQueryOptimizer() {
  if (!queryOptimizerInstance) {
    queryOptimizerInstance = new QueryOptimizer();
  }
  return queryOptimizerInstance;
}

module.exports = {
  QueryOptimizer,
  executeWithMonitoring,
  getQueryOptimizer
};
