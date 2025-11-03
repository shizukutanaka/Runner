const http = require('http');
const app = require('./app');
const setupWebSocket = require('./ws');
const config = require('./config');
const logger = require('./logger');

const PORT = config.server.port;
const server = http.createServer(app);
setupWebSocket(server, app);

const onListening = () => {
  logger.info(`[Server] Listening on port ${PORT}`);
};

const onError = (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = `port ${PORT}`;
  switch (error.code) {
    case 'EACCES':
      logger.error(`[Server] ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`[Server] ${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
};

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) {
    logger.warn('[Server] Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info(`[Server] Received ${signal}, starting graceful shutdown...`);

  // 新しい接続を受け入れない
  server.close(async (err) => {
    if (err) {
      logger.error('[Server] Error during HTTP server close', { error: err.message });
    } else {
      logger.info('[Server] HTTP server closed');
    }

    try {
      // WebSocketの接続を閉じる
      const io = app.get('io');
      if (io) {
        logger.info('[Server] Closing WebSocket connections...');
        io.close(() => {
          logger.info('[Server] WebSocket server closed');
        });
      }

      // データベース接続を閉じる
      const { closeDatabase } = require('./db');
      if (closeDatabase) {
        logger.info('[Server] Closing database connection...');
        await closeDatabase();
      }

      // 進行中のリクエストを待つ（最大30秒）
      const timeout = setTimeout(() => {
        logger.warn('[Server] Forcing shutdown after timeout');
        process.exit(1);
      }, 30000);

      timeout.unref();

      logger.info('[Server] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('[Server] Error during shutdown', { error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

  // 強制終了の防止（最大45秒待つ）
  setTimeout(() => {
    logger.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 45000);
};

server.on('error', onError);
server.on('listening', onListening);

server.listen(PORT);

// シグナルハンドリング
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Server] Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise
  });
});

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  logger.error('[Server] Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  shutdown('uncaughtException');
});
