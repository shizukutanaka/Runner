const { Server } = require('socket.io');
const logger = require('./logger');
const db = require('./db');
const os = require('os');
const si = require('systeminformation');
const { circuitBreakerManager } = require('./utils/circuitBreaker');
const { initializeRedisAdapter, getScalingStats } = require('./services/websocketScaling');
const emotionalDetector = require('./services/emotionalContagionDetector');
const departureDetector  = require('./services/silentDepartureDetector');

async function setupWebSocket(server, app) {
  const config = require('./config');
  const allowedOrigins = config.security.allowedOrigins || [];

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in allowed list
        const isAllowed = allowedOrigins.some((allowed) => {
          if (allowed === '*') return true;
          try {
            const normalizedOrigin = new URL(origin).origin;
            const normalizedAllowed = new URL(allowed).origin;
            return normalizedOrigin === normalizedAllowed;
          } catch {
            return origin.startsWith(allowed);
          }
        });

        if (isAllowed) {
          callback(null, true);
        } else {
          logger.warn('[WebSocket] CORS origin rejected', { origin });
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6, // 1MB max message size to prevent DoS
    allowEIO3: false // Disable legacy protocol
  });

  app.set('io', io);

  // Initialize Redis adapter for horizontal scaling
  const scalingEnabled = await initializeRedisAdapter(io);
  if (scalingEnabled) {
    logger.info('[WebSocket] Horizontal scaling enabled with Redis Pub/Sub');
  } else {
    logger.warn('[WebSocket] Running in single-instance mode (scaling disabled)');
  }

  const activeConnections = new Map();
  const userRooms = new Map(); // ユーザー別のルーム管理
  const platformRooms = new Map(); // プラットフォーム別のルーム管理
  const dashboardRooms = new Map(); // ダッシュボード別のルーム管理

  // メッセージバッチング用のキュー
  const messageQueue = new Map();
  const BATCH_INTERVAL = 100; // 100msごとにバッチ送信
  const MAX_BATCH_SIZE = 50; // 最大バッチサイズ

  // バッチメッセージの送信
  const flushMessageBatch = () => {
    for (const [room, messages] of messageQueue.entries()) {
      if (messages.length > 0) {
        io.to(room).emit('batchUpdate', {
          timestamp: new Date().toISOString(),
          count: messages.length,
          messages
        });
        messageQueue.set(room, []);
      }
    }
  };

  // メッセージをバッチに追加
  const addToBatch = (room, type, data) => {
    if (!messageQueue.has(room)) {
      messageQueue.set(room, []);
    }

    const batch = messageQueue.get(room);
    batch.push({ type, data, timestamp: new Date().toISOString() });

    // バッチサイズが上限に達したら即座に送信
    if (batch.length >= MAX_BATCH_SIZE) {
      io.to(room).emit('batchUpdate', {
        timestamp: new Date().toISOString(),
        count: batch.length,
        messages: batch
      });
      messageQueue.set(room, []);
    }
  };

  // 定期的なバッチフラッシュ
  setInterval(flushMessageBatch, BATCH_INTERVAL);

  // 統計情報のキャッシュ
  let statsCache = {
    comments: { total: 0, today: 0, thisHour: 0 },
    users: { total: 0, active: 0, newToday: 0 },
    moderation: { total: 0, today: 0, accuracy: 0 },
    system: { cpu: 0, memory: 0, disk: 0, network: 0 }
  };

  // 統計情報の更新間隔（ミリ秒）
  const STATS_UPDATE_INTERVAL = 5000; // 5秒
  const SYSTEM_UPDATE_INTERVAL = 10000; // 10秒

  // 統計情報の更新
  const updateStats = async () => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const thisHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();

      // データベースから統計情報を取得 (パラメータ化クエリでSQLインジェクション対策)
      const stats = await new Promise((resolve, reject) => {
        db.get(`
          SELECT
            (SELECT COUNT(*) FROM comments) as total_comments,
            (SELECT COUNT(*) FROM comments WHERE timestamp >= ?) as today_comments,
            (SELECT COUNT(*) FROM comments WHERE timestamp >= ?) as hour_comments,
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
            (SELECT COUNT(*) FROM users WHERE id IN (
              SELECT DISTINCT user FROM comments WHERE timestamp >= ?
            )) as new_users_today,
            (SELECT COUNT(*) FROM comments WHERE status != 'active') as total_moderation,
            (SELECT COUNT(*) FROM comments WHERE status != 'active' AND moderation_timestamp >= ?) as today_moderation
        `, [today, thisHour, today, today], (err, row) => {
          if (err) {
            logger.error('[WebSocket] Stats query error', { error: err.message });
            reject(err);
            return;
          }
          resolve(row || {});
        });
      });

      statsCache = {
        comments: {
          total: stats.total_comments || 0,
          today: stats.today_comments || 0,
          thisHour: stats.hour_comments || 0
        },
        users: {
          total: stats.total_users || 0,
          active: stats.active_users || 0,
          newToday: stats.new_users_today || 0
        },
        moderation: {
          total: stats.total_moderation || 0,
          today: stats.today_moderation || 0,
          accuracy: 95.5 // 実際の実装では計算する
        }
      };

      // システム統計情報を取得
      const systemInfo = await getSystemStats();
      statsCache.system = systemInfo;

      // ダッシュボードに統計情報をブロードキャスト
      io.to('dashboard').emit('statsUpdate', {
        timestamp: now.toISOString(),
        data: statsCache
      });

    } catch (error) {
      logger.error('[WebSocket] Error updating stats:', error);
    }
  };

  // システム統計情報の取得
  const getSystemStats = async () => {
    try {
      const cpuUsage = await si.currentLoad();
      const memInfo = await si.mem();
      const fsInfo = await si.fsSize();
      const networkInfo = await si.networkStats();

      return {
        cpu: Math.round(cpuUsage.currentLoad || 0),
        memory: Math.round(((memInfo.used / memInfo.total) * 100) || 0),
        disk: Math.round(fsInfo.reduce((acc, fs) => acc + fs.use, 0) / fsInfo.length || 0),
        network: Math.round((networkInfo[0]?.rx_sec + networkInfo[0]?.tx_sec) / 1024 / 1024 || 0), // MB/s
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
      };
    } catch (error) {
      logger.error('[WebSocket] Error getting system stats:', error);
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
      };
    }
  };

  // 定期的な統計更新
  setInterval(updateStats, STATS_UPDATE_INTERVAL);

  // 定期的なシステム統計更新
  setInterval(async () => {
    const systemStats = await getSystemStats();
    io.to('system').emit('systemStats', {
      timestamp: new Date().toISOString(),
      data: systemStats
    });
  }, SYSTEM_UPDATE_INTERVAL);

  io.on('connection', (socket) => {
    const clientId = socket.id;
    const clientInfo = {
      connectedAt: new Date(),
      lastActivity: new Date(),
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address,
      platform: null,
      userId: null
    };

    activeConnections.set(clientId, clientInfo);

    // ─── WebSocketイベントレート制限（トークンバケット方式） ───
    const rateLimiter = {
      tokens: 20,           // 初期トークン数
      maxTokens: 20,        // 最大トークン数
      refillRate: 10,       // 秒あたりの補充レート
      lastRefill: Date.now()
    };

    const checkRateLimit = () => {
      const now = Date.now();
      const elapsed = (now - rateLimiter.lastRefill) / 1000;

      // トークン補充
      rateLimiter.tokens = Math.min(
        rateLimiter.maxTokens,
        rateLimiter.tokens + (elapsed * rateLimiter.refillRate)
      );
      rateLimiter.lastRefill = now;

      // トークン消費
      if (rateLimiter.tokens >= 1) {
        rateLimiter.tokens -= 1;
        return true;
      }

      return false; // レート制限超過
    };

    logger.info(`[WebSocket] Client connected: ${clientId} from ${clientInfo.ip}`);
    logger.info(`[WebSocket] Active connections: ${activeConnections.size}`);

    // 入力バリデーションユーティリティ
    const validateInput = (data, schema) => {
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid data format' };
      }

      for (const [key, rules] of Object.entries(schema)) {
        const value = data[key];

        if (rules.required && (value === undefined || value === null || value === '')) {
          return { valid: false, error: `Missing required field: ${key}` };
        }

        if (value !== undefined && value !== null) {
          if (rules.type && typeof value !== rules.type) {
            return { valid: false, error: `Invalid type for ${key}: expected ${rules.type}` };
          }

          if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
            return { valid: false, error: `${key} exceeds max length of ${rules.maxLength}` };
          }

          if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
            return { valid: false, error: `${key} has invalid format` };
          }

          if (rules.enum && !rules.enum.includes(value)) {
            return { valid: false, error: `${key} must be one of: ${rules.enum.join(', ')}` };
          }
        }
      }

      return { valid: true };
    };

    // 認証
    socket.on('authenticate', (data) => {
      try {
        const validation = validateInput(data, {
          userId: { required: true, type: 'string', maxLength: 255, pattern: /^[a-zA-Z0-9_-]+$/ },
          platform: { required: false, type: 'string', enum: ['youtube', 'twitch', 'other'] }
        });

        if (!validation.valid) {
          logger.warn(`[WebSocket] Authentication validation failed for ${clientId}:`, validation.error);
          socket.emit('error', { type: 'validation', message: validation.error });
          return;
        }

        const { userId, platform } = data;
        clientInfo.userId = userId;
        clientInfo.platform = platform;

        // ユーザールームに参加
        socket.join(`user:${userId}`);
        userRooms.set(userId, socket.id);

        // プラットフォームルームに参加
        if (platform) {
          socket.join(`platform:${platform}`);
          platformRooms.set(platform, (platformRooms.get(platform) || new Set()).add(socket.id));
        }

        logger.info(`[WebSocket] Client ${clientId} authenticated as user ${userId} on ${platform}`);
        socket.emit('authenticated', { success: true, userId, platform });
      } catch (error) {
        logger.error(`[WebSocket] Authentication error for ${clientId}:`, error);
        socket.emit('error', { type: 'auth', message: 'Authentication failed' });
      }
    });

    // ダッシュボード参加
    socket.on('joinDashboard', (dashboardId) => {
      const validation = validateInput({ dashboardId }, {
        dashboardId: { required: true, type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ }
      });

      if (!validation.valid) {
        logger.warn(`[WebSocket] joinDashboard validation failed:`, validation.error);
        socket.emit('error', { type: 'validation', message: validation.error });
        return;
      }

      socket.join(`dashboard:${dashboardId}`);
      socket.join('dashboard'); // 一般ダッシュボード
      dashboardRooms.set(dashboardId, socket.id);

      // 現在の統計情報を送信
      socket.emit('statsUpdate', {
        timestamp: new Date().toISOString(),
        data: statsCache
      });

      logger.info(`[WebSocket] Client ${clientId} joined dashboard ${dashboardId}`);
    });

    // システム監視参加
    socket.on('joinSystem', () => {
      socket.join('system');
      logger.info(`[WebSocket] Client ${clientId} joined system monitoring`);
    });

    // コメントイベント
    socket.on('newComment', (comment) => {
      // レート制限チェック
      if (!checkRateLimit()) {
        logger.warn(`[WebSocket] Rate limit exceeded for ${clientId}`);
        socket.emit('error', { type: 'rateLimit', message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' });
        return;
      }

      const validation = validateInput(comment, {
        platform: { required: true, type: 'string', enum: ['youtube', 'twitch', 'other'] },
        user: { required: true, type: 'string', maxLength: 255 },
        content: { required: true, type: 'string', maxLength: 10000 }
      });

      if (!validation.valid) {
        logger.warn(`[WebSocket] newComment validation failed:`, validation.error);
        socket.emit('error', { type: 'validation', message: validation.error });
        return;
      }

      clientInfo.lastActivity = new Date();

      // プラットフォーム別ルームにブロードキャスト
      if (comment.platform) {
        io.to(`platform:${comment.platform}`).emit('commentUpdate', {
          type: 'new',
          data: comment,
          timestamp: new Date().toISOString()
        });
      }

      // ダッシュボードにブロードキャスト
      io.to('dashboard').emit('commentUpdate', {
        type: 'new',
        data: comment,
        timestamp: new Date().toISOString()
      });

      // 感情伝播検知器 + サイレント離脱検知器にフィード
      try {
        const channelId = comment.channelId ?? 'default';
        emotionalDetector.ingest({
          ...comment,
          channelId,
          sentimentScore: comment.sentimentScore ?? 0.5,
          toxicityScore:  comment.toxicityScore  ?? 0,
        });
        if (comment.user) {
          departureDetector.record(comment.platform, channelId, comment.user, comment.timestamp);
        }
      } catch (feedErr) {
        logger.warn('[WebSocket] Failed to feed insight services', { error: feedErr.message });
      }
    });

    // モデレーションイベント
    socket.on('moderationAction', (data) => {
      // レート制限チェック
      if (!checkRateLimit()) {
        logger.warn(`[WebSocket] Rate limit exceeded for ${clientId}`);
        socket.emit('error', { type: 'rateLimit', message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' });
        return;
      }

      const validation = validateInput(data, {
        action: { required: true, type: 'string', enum: ['hide', 'mute', 'ban', 'approve', 'flag'] },
        commentId: { required: true, type: 'string', maxLength: 255 },
        moderatorId: { required: true, type: 'string', maxLength: 255 },
        reason: { required: false, type: 'string', maxLength: 1000 }
      });

      if (!validation.valid) {
        logger.warn(`[WebSocket] moderationAction validation failed:`, validation.error);
        socket.emit('error', { type: 'validation', message: validation.error });
        return;
      }

      clientInfo.lastActivity = new Date();

      const { action, commentId, moderatorId, reason } = data;

      // ダッシュボードにブロードキャスト
      io.to('dashboard').emit('moderationUpdate', {
        type: 'moderation',
        action,
        commentId,
        moderatorId,
        reason,
        timestamp: new Date().toISOString()
      });

      // 特定のユーザーに通知
      if (userRooms.has(commentId)) {
        io.to(`user:${commentId}`).emit('moderationNotification', {
          action,
          reason,
          timestamp: new Date().toISOString()
        });
      }
    });

    // ユーザーアクティビティ
    socket.on('userActivity', (data) => {
      // レート制限チェック
      if (!checkRateLimit()) {
        logger.warn(`[WebSocket] Rate limit exceeded for ${clientId}`);
        socket.emit('error', { type: 'rateLimit', message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' });
        return;
      }

      const validation = validateInput(data, {
        userId: { required: true,  type: 'string', maxLength: 255 },
        action: { required: true,  type: 'string', enum: ['view', 'comment', 'moderate', 'export', 'login', 'logout'] },
        metadata: { required: false, type: 'object' },
      });

      if (!validation.valid) {
        logger.warn('[WebSocket] userActivity validation failed:', validation.error);
        socket.emit('error', { type: 'validation', message: validation.error });
        return;
      }

      clientInfo.lastActivity = new Date();

      const { userId, action, metadata } = data;

      io.to('dashboard').emit('userActivityUpdate', {
        userId,
        action,
        metadata,
        timestamp: new Date().toISOString()
      });
    });

    // 通知送信
    socket.on('sendNotification', (data) => {
      const { userId, type, title, message, metadata } = data;

      const notification = {
        id: Date.now().toString(),
        type: type || 'info',
        title,
        message,
        data: metadata,
        timestamp: new Date().toISOString()
      };

      // 特定のユーザーに送信
      if (userId) {
        io.to(`user:${userId}`).emit('notification', notification);
      } else {
        // 全ユーザーにブロードキャスト
        io.emit('notification', notification);
      }
    });

    // 統計情報リクエスト
    socket.on('requestStats', (period) => {
      socket.emit('statsUpdate', {
        timestamp: new Date().toISOString(),
        data: statsCache,
        period: period || 'realtime'
      });
    });

    // システム情報リクエスト
    socket.on('requestSystemInfo', () => {
      getSystemStats().then(systemStats => {
        socket.emit('systemStats', {
          timestamp: new Date().toISOString(),
          data: systemStats
        });
      });
    });

    // ルーム参加
    socket.on('joinRoom', (roomName) => {
      socket.join(roomName);
      logger.info(`[WebSocket] Client ${clientId} joined room: ${roomName}`);
    });

    // ルーム退出
    socket.on('leaveRoom', (roomName) => {
      socket.leave(roomName);
      logger.info(`[WebSocket] Client ${clientId} left room: ${roomName}`);
    });

    // カスタムイベント
    socket.on('customEvent', (data) => {
      clientInfo.lastActivity = new Date();

      const { event, payload, broadcast } = data;

      if (broadcast) {
        io.emit('customEvent', { event, payload, timestamp: new Date().toISOString() });
      } else {
        socket.emit('customEvent', { event, payload, timestamp: new Date().toISOString() });
      }
    });

    // 切断
    socket.on('disconnect', (reason) => {
      // ルームから退出
      if (clientInfo.userId) {
        socket.leave(`user:${clientInfo.userId}`);
        userRooms.delete(clientInfo.userId);
      }

      if (clientInfo.platform) {
        const platformRoom = platformRooms.get(clientInfo.platform);
        if (platformRoom) {
          platformRoom.delete(socket.id);
          if (platformRoom.size === 0) {
            platformRooms.delete(clientInfo.platform);
          }
        }
      }

      activeConnections.delete(clientId);

      logger.info(`[WebSocket] Client disconnected: ${clientId}, Reason: ${reason}`);
      logger.info(`[WebSocket] Active connections: ${activeConnections.size}`);

      // ダッシュボードに切断通知
      io.to('dashboard').emit('clientDisconnected', {
        clientId,
        userId: clientInfo.userId,
        platform: clientInfo.platform,
        reason,
        timestamp: new Date().toISOString()
      });
    });

    // エラーハンドリング
    socket.on('error', (error) => {
      logger.error(`[WebSocket] Socket error for client ${clientId}:`, error);
      socket.emit('error', {
        type: 'socket',
        message: 'WebSocket error occurred',
        timestamp: new Date().toISOString()
      });
    });

    // ハートビート
    socket.on('ping', (data) => {
      clientInfo.lastActivity = new Date();
      socket.emit('pong', {
        timestamp: new Date().toISOString(),
        serverTime: Date.now(),
        clientTime: data?.timestamp
      });
    });

    // 接続確認
    socket.emit('connected', {
      clientId,
      timestamp: new Date().toISOString(),
      serverInfo: {
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  });

  // 定期的なクリーンアップ
  setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5分

    for (const [clientId, info] of activeConnections.entries()) {
      if (now - info.lastActivity.getTime() > timeout) {
        const socket = io.sockets.sockets.get(clientId);
        if (socket) {
          socket.disconnect(true);
          logger.info(`[WebSocket] Client ${clientId} disconnected due to inactivity`);
        }
      }
    }
  }, 60000); // 1分ごとにチェック

  // サーバー統計情報の提供
  app.get('/api/websocket/stats', async (req, res) => {
    const scalingStats = await getScalingStats();
    const globalConnections = scalingEnabled
      ? await io.getGlobalConnectionCount()
      : activeConnections.size;

    const stats = {
      localConnections: activeConnections.size,
      globalConnections: globalConnections,
      userRooms: userRooms.size,
      platformRooms: platformRooms.size,
      dashboardRooms: dashboardRooms.size,
      uptime: process.uptime(),
      scaling: scalingStats,
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: stats,
      message: 'WebSocket statistics retrieved'
    });
  });

  return io;
}

module.exports = setupWebSocket;
