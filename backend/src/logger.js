const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('./config');
const path = require('path');

const level = config.logging?.level ?? process.env.LOG_LEVEL ?? 'info';

const buildBaseFormat = () => {
  const common = [format.timestamp(), format.errors({ stack: true }), format.splat()];

  const env = config.environment ?? config.app?.env ?? process.env.NODE_ENV ?? 'development';
  if (env === 'development') {
    return format.combine(
      ...common,
      format.colorize(),
      format.printf(({ level: lvl, message, timestamp, stack, ...meta }) => {
        const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : '';
        if (stack) {
          return `[${timestamp}] [${lvl}] ${message}\n${stack}${metaString}`;
        }
        return `[${timestamp}] [${lvl}] ${message}${metaString}`;
      })
    );
  }

  return format.combine(...common, format.json());
};

// ログディレクトリの設定
const logDir = path.resolve(__dirname, '..', 'logs');

// ローテーション設定（本番環境用）
const rotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // 14日間保持
  level: 'info'
});

// エラーログ専用のローテーション
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // エラーログは30日間保持
  level: 'error'
});

// アクセスログのローテーション（オプション）
const accessRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '7d', // 7日間保持
  level: 'info'
});

// トランスポートの設定
const logTransports = [
  new transports.Console({ handleExceptions: true })
];

// 本番環境ではファイルローテーションを追加
const configEnv = config.environment ?? config.app?.env ?? process.env.NODE_ENV ?? 'development';
if (configEnv === 'production') {
  logTransports.push(rotateTransport);
  logTransports.push(errorRotateTransport);
}

const logger = createLogger({
  level,
  defaultMeta: {
    service: 'runner-backend',
    environment: configEnv,
    hostname: require('os').hostname()
  },
  transports: logTransports,
  format: buildBaseFormat(),
  exitOnError: false
});

const buildRequestContext = (req = {}) => ({
  requestId: req.id || req.headers?.['x-request-id'] || null,
  correlationId: req.headers?.['x-correlation-id'] || null,
  userId: req.user?.id || null,
  ip: req.ip || null,
  userAgent: typeof req.get === 'function' ? req.get('User-Agent') : null,
  method: req.method || null,
  path: req.originalUrl || req.url || null
});

const withContext = (context = {}) => logger.child(context);
const createRequestLogger = (req) => withContext(buildRequestContext(req));

logger.withContext = withContext;
logger.buildRequestContext = buildRequestContext;
logger.createRequestLogger = createRequestLogger;

module.exports = logger;
