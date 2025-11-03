// backend/src/config/database.js
const { Sequelize } = require('sequelize');
const path = require('path');
const logger = require('../utils/logger');

// データベース設定の検証
const validateConfig = () => {
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`必要な環境変数が設定されていません: ${missing.join(', ')}`);
  }
};

// データベース設定
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: process.env.DB_DIALECT || 'postgres',
  logging: process.env.NODE_ENV === 'development' ? logger.info.bind(logger) : false,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    min: parseInt(process.env.DB_POOL_MIN) || 5,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,
    idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    evict: parseInt(process.env.DB_POOL_EVICT) || 1000
  },
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000
  },
  retry: {
    max: parseInt(process.env.DB_RETRY_MAX) || 3,
    backoffBase: parseInt(process.env.DB_RETRY_BACKOFF_BASE) || 100,
    backoffExponent: parseInt(process.env.DB_RETRY_BACKOFF_EXPONENT) || 1.5
  }
};

// 設定の検証を実行
validateConfig();

// Sequelizeインスタンスの作成
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions,
    retry: dbConfig.retry
  }
);

// 接続テスト関数
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('データベース接続に成功しました。');
    return true;
  } catch (error) {
    logger.error('データベース接続エラー:', error);
    return false;
  }
};

// 接続監視関数
const monitorConnection = () => {
  sequelize.connectionManager.pool.on('connect', (connection) => {
    logger.debug('データベース接続が確立されました。');
  });

  sequelize.connectionManager.pool.on('release', (connection) => {
    logger.debug('データベース接続が解放されました。');
  });

  sequelize.connectionManager.pool.on('error', (error) => {
    logger.error('データベース接続エラー:', error);
  });
};

// クエリ実行時間監視
const addQueryLogging = () => {
  sequelize.options.logging = (sql, timing) => {
    if (timing > 1000) { // 1秒以上のクエリをログ出力
      logger.warn(`低速クエリ検知: ${timing}ms`, { sql: sql.substring(0, 200) });
    }
  };
};

// 開発環境でのみクエリログを有効化
if (process.env.NODE_ENV === 'development') {
  addQueryLogging();
}

// 接続ヘルスチェック関数
const healthCheck = async () => {
  try {
    await sequelize.authenticate();
    const [results] = await sequelize.query('SELECT NOW()');
    return {
      status: 'healthy',
      timestamp: results[0].now,
      responseTime: Date.now()
    };
  } catch (error) {
    logger.error('データベースヘルスチェック失敗:', error);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// コネクションプールの統計情報
const getPoolStats = () => {
  const pool = sequelize.connectionManager.pool;
  return {
    total: pool.size,
    available: pool.available,
    using: pool.using,
    waiting: pool.waiting
  };
};

module.exports = {
  sequelize,
  testConnection,
  monitorConnection,
  healthCheck,
  getPoolStats,
  config: dbConfig
};
