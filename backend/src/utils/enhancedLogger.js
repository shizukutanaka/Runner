// backend/src/utils/enhancedLogger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// ログディレクトリの作成
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * カスタムログフォーマット
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }

    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

/**
 * コンソール出力用フォーマット（開発環境用）
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }

    return log;
  })
);

/**
 * 転送ログフォーマット（外部ログシステム用）
 */
const transportFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * ログレベル設定
 */
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

/**
 * ログ設定
 */
const logConfig = {
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: transportFormat,
  defaultMeta: {
    service: process.env.APP_NAME || 'RunnerApp',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // エラーログ（ファイル）
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
      auditFile: path.join(logDir, 'error-audit.json')
    }),

    // 全てのログ（ファイル）
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
      auditFile: path.join(logDir, 'combined-audit.json')
    }),

    // HTTPリクエストログ（ファイル）
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '20m',
      maxFiles: '7d',
      format: logFormat,
      auditFile: path.join(logDir, 'http-audit.json')
    })
  ],

  // 例外・拒否処理
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],

  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
};

// 本番環境以外ではコンソール出力も有効化
if (process.env.NODE_ENV !== 'production') {
  logConfig.transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'debug',
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );
}

/**
 * 拡張ロガーインスタンス
 */
const logger = winston.createLogger(logConfig);

/**
 * HTTPリクエストログ用のロガー
 */
const httpLogger = winston.createLogger({
  levels: logLevels,
  level: 'http',
  format: transportFormat,
  defaultMeta: {
    service: process.env.APP_NAME || 'RunnerApp',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '20m',
      maxFiles: '7d',
      format: logFormat
    })
  ]
});

/**
 * パフォーマンス監視ログ用のロガー
 */
const performanceLogger = winston.createLogger({
  levels: logLevels,
  level: 'info',
  format: transportFormat,
  defaultMeta: {
    service: process.env.APP_NAME || 'RunnerApp',
    type: 'performance',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'performance-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat
    })
  ]
});

/**
 * セキュリティログ用のロガー
 */
const securityLogger = winston.createLogger({
  levels: logLevels,
  level: 'warn',
  format: transportFormat,
  defaultMeta: {
    service: process.env.APP_NAME || 'RunnerApp',
    type: 'security',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      format: logFormat,
      auditFile: path.join(logDir, 'security-audit.json')
    })
  ]
});

/**
 * データベースログ用のロガー
 */
const databaseLogger = winston.createLogger({
  levels: logLevels,
  level: 'info',
  format: transportFormat,
  defaultMeta: {
    service: process.env.APP_NAME || 'RunnerApp',
    type: 'database',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'database-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat
    })
  ]
});

/**
 * ログローテーション管理
 */
class LogManager {
  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000); // 24時間ごと
  }

  /**
   * 古いログファイルのクリーンアップ
   */
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(logDir);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30日

      files.forEach(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          logger.info(`古いログファイルを削除しました: ${file}`);
        }
      });
    } catch (error) {
      logger.error('ログクリーンアップエラー:', error);
    }
  }

  /**
   * ログ統計情報の取得
   */
  getLogStats() {
    try {
      const files = fs.readdirSync(logDir);
      let totalSize = 0;
      const fileStats = {};

      files.forEach(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileStats[file] = {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      });

      return {
        totalFiles: files.length,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        files: fileStats
      };
    } catch (error) {
      logger.error('ログ統計取得エラー:', error);
      return { error: error.message };
    }
  }

  /**
   * バイト数を人間が読みやすい形式に変換
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * ログファイルのアーカイブ
   */
  async archiveLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          // アーカイブディレクトリに移動
          const archiveDir = path.join(logDir, 'archive');
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }

          const archivePath = path.join(archiveDir, file);
          fs.renameSync(filePath, archivePath);
          logger.info(`ログファイルをアーカイブしました: ${file}`);
        }
      }
    } catch (error) {
      logger.error('ログアーカイブエラー:', error);
    }
  }
}

/**
 * ログマネージャーインスタンス
 */
const logManager = new LogManager();

/**
 * パフォーマンス監視関数
 */
const logPerformance = (operation, duration, metadata = {}) => {
  performanceLogger.info(`${operation} completed`, {
    duration: `${duration}ms`,
    ...metadata
  });
};

/**
 * セキュリティイベントログ関数
 */
const logSecurity = (event, details = {}) => {
  securityLogger.warn(`セキュリティイベント: ${event}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * データベース操作ログ関数
 */
const logDatabase = (operation, table, duration, metadata = {}) => {
  databaseLogger.info(`データベース操作: ${operation}`, {
    table,
    duration: `${duration}ms`,
    ...metadata
  });
};

/**
 * プロセス終了時のクリーンアップ
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM受信、ログシステムを終了します');
  logManager.cleanupInterval && clearInterval(logManager.cleanupInterval);
});

process.on('SIGINT', () => {
  logger.info('SIGINT受信、ログシステムを終了します');
  logManager.cleanupInterval && clearInterval(logManager.cleanupInterval);
});

module.exports = {
  logger,
  httpLogger,
  performanceLogger,
  securityLogger,
  databaseLogger,
  logManager,
  logPerformance,
  logSecurity,
  logDatabase
};
