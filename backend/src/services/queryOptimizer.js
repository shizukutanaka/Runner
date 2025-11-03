const logger = require('../logger');

/**
 * Query optimizer for performance improvements
 */
class QueryOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.queryStats = new Map();
    this.cacheMaxSize = 1000;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.slowQueryThreshold = 100; // ms
  }

  /**
   * Generate cache key from query and params
   */
  getCacheKey(sql, params) {
    return `${sql}|${JSON.stringify(params)}`;
  }

  /**
   * Execute query with caching
   */
  async cachedQuery(queryFn, sql, params = [], options = {}) {
    const cacheKey = this.getCacheKey(sql, params);
    const cached = this.queryCache.get(cacheKey);
    const skipCache = options.skipCache || false;

    // Return cached result if valid
    if (!skipCache && cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.debug('[QueryOptimizer] Cache hit', { sql: sql.substring(0, 50) });
      this.recordStats(sql, 0, true);
      return cached.data;
    }

    // Execute query
    const startTime = Date.now();
    const result = await queryFn();
    const duration = Date.now() - startTime;

    // Record stats
    this.recordStats(sql, duration, false);

    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      logger.warn('[QueryOptimizer] Slow query detected', {
        sql: sql.substring(0, 100),
        duration: `${duration}ms`,
        params: params.length
      });
    }

    // Cache result if enabled
    if (!skipCache && options.cacheable !== false) {
      this.cacheResult(cacheKey, result);
    }

    return result;
  }

  /**
   * Cache query result
   */
  cacheResult(key, data) {
    // Evict oldest entry if cache is full
    if (this.queryCache.size >= this.cacheMaxSize) {
      const oldestKey = this.queryCache.keys().next().value;
      this.queryCache.delete(oldestKey);
    }

    this.queryCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate cache by pattern
   */
  invalidateCache(pattern) {
    let invalidated = 0;

    for (const key of this.queryCache.keys()) {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
        invalidated++;
      }
    }

    logger.debug('[QueryOptimizer] Cache invalidated', { pattern, count: invalidated });
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    const size = this.queryCache.size;
    this.queryCache.clear();
    logger.info('[QueryOptimizer] Cache cleared', { entries: size });
  }

  /**
   * Record query statistics
   */
  recordStats(sql, duration, fromCache) {
    const key = sql.substring(0, 100); // Use first 100 chars as key
    const stats = this.queryStats.get(key) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      maxDuration: 0,
      minDuration: Infinity,
      cacheHits: 0
    };

    stats.count++;
    if (fromCache) {
      stats.cacheHits++;
    } else {
      stats.totalDuration += duration;
      stats.avgDuration = stats.totalDuration / (stats.count - stats.cacheHits);
      stats.maxDuration = Math.max(stats.maxDuration, duration);
      stats.minDuration = Math.min(stats.minDuration, duration);
    }

    this.queryStats.set(key, stats);
  }

  /**
   * Get query statistics
   */
  getStats() {
    const stats = [];

    for (const [sql, data] of this.queryStats.entries()) {
      stats.push({
        sql,
        ...data,
        cacheHitRate: data.count > 0 ? (data.cacheHits / data.count * 100).toFixed(2) + '%' : '0%'
      });
    }

    // Sort by count (most executed queries first)
    stats.sort((a, b) => b.count - a.count);

    return {
      queries: stats.slice(0, 20), // Top 20 queries
      cacheSize: this.queryCache.size,
      totalQueries: stats.reduce((sum, s) => sum + s.count, 0)
    };
  }

  /**
   * Get slow queries report
   */
  getSlowQueries() {
    const slowQueries = [];

    for (const [sql, data] of this.queryStats.entries()) {
      if (data.avgDuration > this.slowQueryThreshold) {
        slowQueries.push({
          sql,
          avgDuration: data.avgDuration.toFixed(2),
          maxDuration: data.maxDuration,
          count: data.count
        });
      }
    }

    // Sort by average duration (slowest first)
    slowQueries.sort((a, b) => b.avgDuration - a.avgDuration);

    return slowQueries;
  }

  /**
   * Optimize query by analyzing execution plan
   */
  async analyzeQuery(db, sql, params = []) {
    try {
      const plan = await new Promise((resolve, reject) => {
        db.all(`EXPLAIN QUERY PLAN ${sql}`, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const hasIndex = plan.some(row =>
        row.detail && row.detail.includes('USING INDEX')
      );

      const hasScan = plan.some(row =>
        row.detail && row.detail.includes('SCAN TABLE')
      );

      if (hasScan && !hasIndex) {
        logger.warn('[QueryOptimizer] Query may benefit from index', {
          sql: sql.substring(0, 100),
          plan
        });
      }

      return { plan, hasIndex, hasScan };
    } catch (error) {
      logger.error('[QueryOptimizer] Query analysis failed', { error: error.message });
      return null;
    }
  }

  /**
   * Suggest indexes based on query patterns
   */
  suggestIndexes() {
    const suggestions = [];
    const tablePatterns = new Map();

    // Analyze query patterns
    for (const [sql] of this.queryStats.entries()) {
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=/i);
      const joinMatch = sql.match(/JOIN\s+(\w+)\s+ON\s+(\w+)/i);

      if (whereMatch) {
        const [, column] = whereMatch;
        const count = (tablePatterns.get(column) || 0) + 1;
        tablePatterns.set(column, count);
      }

      if (joinMatch) {
        const [, table, column] = joinMatch;
        const key = `${table}.${column}`;
        const count = (tablePatterns.get(key) || 0) + 1;
        tablePatterns.set(key, count);
      }
    }

    // Generate suggestions for frequently used columns
    for (const [column, count] of tablePatterns.entries()) {
      if (count >= 5) { // Threshold: 5+ queries
        suggestions.push({
          column,
          frequency: count,
          suggestion: `CREATE INDEX IF NOT EXISTS idx_${column} ON table(${column});`
        });
      }
    }

    return suggestions;
  }
}

const queryOptimizer = new QueryOptimizer();

module.exports = { QueryOptimizer, queryOptimizer };
