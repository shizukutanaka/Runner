const logger = require('../logger');

/**
 * データベースクエリの分析とインデックス使用状況の確認
 */
class DatabaseAnalyzer {
  constructor(db) {
    this.db = db;
    this.slowQueryThreshold = 100; // 100ms以上を遅いクエリとみなす
    this.slowQueries = [];
  }

  /**
   * クエリプランの分析
   */
  analyzeQueryPlan(sql, params = []) {
    return new Promise((resolve, reject) => {
      const explainSql = `EXPLAIN QUERY PLAN ${sql}`;

      this.db.all(explainSql, params, (err, rows) => {
        if (err) {
          logger.error('[DBAnalyzer] Failed to analyze query plan', {
            error: err.message,
            sql: sql.substring(0, 100)
          });
          return reject(err);
        }

        const usesIndex = rows.some(row =>
          row.detail && (
            row.detail.includes('USING INDEX') ||
            row.detail.includes('USING COVERING INDEX')
          )
        );

        const usesScan = rows.some(row =>
          row.detail && row.detail.includes('SCAN')
        );

        resolve({
          usesIndex,
          usesScan,
          plan: rows,
          recommendation: !usesIndex && usesScan ?
            'Consider adding an index to improve performance' :
            'Query appears optimized'
        });
      });
    });
  }

  /**
   * クエリの実行時間測定
   */
  async measureQuery(sql, params = []) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        const duration = Date.now() - startTime;

        if (err) {
          return reject(err);
        }

        if (duration > this.slowQueryThreshold) {
          this.slowQueries.push({
            sql: sql.substring(0, 200),
            duration,
            timestamp: new Date().toISOString(),
            rowCount: rows.length
          });

          logger.warn('[DBAnalyzer] Slow query detected', {
            duration: `${duration}ms`,
            rowCount: rows.length,
            sql: sql.substring(0, 100)
          });
        }

        resolve({
          rows,
          duration,
          rowCount: rows.length
        });
      });
    });
  }

  /**
   * インデックス使用状況の取得
   */
  getIndexUsage() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          m.name as table_name,
          ii.name as index_name,
          ii.seqno as sequence,
          ii.name as column_name
        FROM sqlite_master m
        LEFT JOIN pragma_index_list(m.name) il ON 1=1
        LEFT JOIN pragma_index_info(il.name) ii ON 1=1
        WHERE m.type = 'table'
        AND m.name NOT LIKE 'sqlite_%'
        ORDER BY m.name, il.name, ii.seqno
      `;

      this.db.all(sql, (err, rows) => {
        if (err) {
          logger.error('[DBAnalyzer] Failed to get index usage', { error: err.message });
          return reject(err);
        }

        const indexMap = new Map();

        rows.forEach(row => {
          if (row.index_name) {
            const key = `${row.table_name}.${row.index_name}`;
            if (!indexMap.has(key)) {
              indexMap.set(key, {
                table: row.table_name,
                index: row.index_name,
                columns: []
              });
            }
            if (row.column_name) {
              indexMap.get(key).columns.push(row.column_name);
            }
          }
        });

        resolve(Array.from(indexMap.values()));
      });
    });
  }

  /**
   * テーブル統計情報の取得
   */
  getTableStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          name as table_name,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=m.name) as index_count
        FROM sqlite_master m
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
      `;

      this.db.all(sql, async (err, tables) => {
        if (err) {
          logger.error('[DBAnalyzer] Failed to get table stats', { error: err.message });
          return reject(err);
        }

        const stats = [];

        for (const table of tables) {
          try {
            const countResult = await new Promise((res, rej) => {
              this.db.get(`SELECT COUNT(*) as count FROM ${table.table_name}`, (countErr, row) => {
                if (countErr) return rej(countErr);
                res(row);
              });
            });

            stats.push({
              table: table.table_name,
              rowCount: countResult.count,
              indexCount: table.index_count
            });
          } catch (error) {
            logger.warn(`[DBAnalyzer] Failed to count rows for ${table.table_name}`, {
              error: error.message
            });
          }
        }

        resolve(stats);
      });
    });
  }

  /**
   * 遅いクエリのレポート取得
   */
  getSlowQueryReport() {
    const report = {
      threshold: this.slowQueryThreshold,
      count: this.slowQueries.length,
      queries: this.slowQueries.slice(-50) // 最新50件
    };

    if (this.slowQueries.length > 0) {
      const totalDuration = this.slowQueries.reduce((sum, q) => sum + q.duration, 0);
      report.averageDuration = Math.round(totalDuration / this.slowQueries.length);
      report.maxDuration = Math.max(...this.slowQueries.map(q => q.duration));
    }

    return report;
  }

  /**
   * 分析レポートの生成
   */
  async generateReport() {
    try {
      const [indexUsage, tableStats, slowQueryReport] = await Promise.all([
        this.getIndexUsage(),
        this.getTableStats(),
        Promise.resolve(this.getSlowQueryReport())
      ]);

      const report = {
        timestamp: new Date().toISOString(),
        indexes: indexUsage,
        tables: tableStats,
        slowQueries: slowQueryReport,
        recommendations: []
      };

      // テーブルにインデックスがない場合の推奨
      tableStats.forEach(table => {
        if (table.rowCount > 1000 && table.indexCount === 0) {
          report.recommendations.push({
            type: 'missing_index',
            table: table.table,
            message: `Table ${table.table} has ${table.rowCount} rows but no indexes. Consider adding indexes for frequently queried columns.`
          });
        }
      });

      // 遅いクエリの推奨
      if (slowQueryReport.count > 10) {
        report.recommendations.push({
          type: 'slow_queries',
          count: slowQueryReport.count,
          message: `${slowQueryReport.count} slow queries detected. Review and optimize these queries.`
        });
      }

      logger.info('[DBAnalyzer] Analysis report generated', {
        indexCount: indexUsage.length,
        tableCount: tableStats.length,
        slowQueryCount: slowQueryReport.count,
        recommendationCount: report.recommendations.length
      });

      return report;
    } catch (error) {
      logger.error('[DBAnalyzer] Failed to generate report', { error: error.message });
      throw error;
    }
  }

  /**
   * クエリの最適化提案
   */
  async suggestOptimizations(sql, params = []) {
    const suggestions = [];

    try {
      const plan = await this.analyzeQueryPlan(sql, params);

      if (plan.usesScan && !plan.usesIndex) {
        suggestions.push({
          type: 'add_index',
          priority: 'high',
          message: 'Query uses table scan without index. Consider adding an index.'
        });
      }

      const { duration, rowCount } = await this.measureQuery(sql, params);

      if (duration > this.slowQueryThreshold) {
        suggestions.push({
          type: 'slow_query',
          priority: 'medium',
          message: `Query took ${duration}ms. Consider optimization.`,
          metrics: { duration, rowCount }
        });
      }

      if (rowCount > 10000 && !sql.toUpperCase().includes('LIMIT')) {
        suggestions.push({
          type: 'missing_limit',
          priority: 'medium',
          message: `Query returned ${rowCount} rows without LIMIT. Consider pagination.`
        });
      }

      return {
        sql: sql.substring(0, 200),
        suggestions,
        queryPlan: plan
      };
    } catch (error) {
      logger.error('[DBAnalyzer] Failed to suggest optimizations', { error: error.message });
      return {
        sql: sql.substring(0, 200),
        suggestions: [],
        error: error.message
      };
    }
  }
}

module.exports = DatabaseAnalyzer;
