import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : window.location.origin);

// 接続状態を追跡するためのイベントエミッター
class ConnectionManager {
  constructor() {
    this.listeners = new Map();
    this.connectionState = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.length === 0) {
      return;
    }

    if (!callback) {
      this.listeners.delete(event);
      return;
    }

    const filtered = callbacks.filter((registered) => registered !== callback);
    if (filtered.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, filtered);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks && callbacks.length > 0) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('[ConnectionManager] Listener execution failed', error);
        }
      });
    }
  }

  setState(state) {
    this.connectionState = state;
    this.emit('stateChange', state);
  }

  getState() {
    return this.connectionState;
  }

  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  incrementReconnectAttempts() {
    this.reconnectAttempts++;
    return this.reconnectAttempts;
  }

  shouldReconnect() {
    return this.reconnectAttempts < this.maxReconnectAttempts;
  }
}

const connectionManager = new ConnectionManager();

const socket = io(SOCKET_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  reconnectionAttempts: Infinity,
  timeout: 20000,
  transports: ['websocket', 'polling'],
  autoConnect: true,
  withCredentials: true
});

socket.on('connect', () => {
  console.log('[WebSocket] Connected successfully');
  connectionManager.setState('connected');
  connectionManager.resetReconnectAttempts();

  // 接続成功時に通知
  connectionManager.emit('connected', {
    timestamp: new Date().toISOString(),
    socketId: socket.id
  });
});

socket.on('disconnect', (reason) => {
  console.log('[WebSocket] Disconnected:', reason);
  connectionManager.setState('disconnected');

  connectionManager.emit('disconnected', {
    reason,
    timestamp: new Date().toISOString()
  });

  // サーバー側から切断された場合は自動再接続
  if (reason === 'io server disconnect') {
    console.log('[WebSocket] Server disconnected, attempting manual reconnect...');
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  const attempts = connectionManager.incrementReconnectAttempts();
  console.error(`[WebSocket] Connection error (attempt ${attempts}):`, error.message);
  connectionManager.setState('error');

  connectionManager.emit('connectionError', {
    error: error.message,
    attempts,
    timestamp: new Date().toISOString()
  });

  if (!connectionManager.shouldReconnect()) {
    console.error('[WebSocket] Max reconnection attempts reached');
    connectionManager.emit('reconnectFailed', {
      maxAttempts: connectionManager.maxReconnectAttempts,
      timestamp: new Date().toISOString()
    });

    // 最大試行回数に達した場合は、指数バックオフで再試行
    const backoffDelay = Math.min(30000, 1000 * Math.pow(2, attempts - 10));
    console.log(`[WebSocket] Waiting ${backoffDelay}ms before next retry attempt`);

    setTimeout(() => {
      connectionManager.reconnectAttempts = 0; // カウンターリセット
      socket.connect();
    }, backoffDelay);
  }
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log(`[WebSocket] Reconnection attempt ${attemptNumber}`);
  connectionManager.setState('reconnecting');
  connectionManager.emit('reconnecting', { attemptNumber });
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`[WebSocket] Reconnected after ${attemptNumber} attempts`);
  connectionManager.setState('connected');
  connectionManager.resetReconnectAttempts();
  connectionManager.emit('reconnected', { attemptNumber });
});

socket.on('reconnect_failed', () => {
  console.error('[WebSocket] Reconnection failed');
  connectionManager.setState('failed');
  connectionManager.emit('reconnectFailed', {
    timestamp: new Date().toISOString()
  });
});

socket.on('error', (error) => {
  console.error('[WebSocket] Socket error:', error);
  connectionManager.emit('error', { error });
});

// ページのアンロード時に接続をクリーンアップ
window.addEventListener('beforeunload', () => {
  if (socket.connected) {
    socket.disconnect();
  }
});

// ページの可視性変更時の処理
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('[WebSocket] Page hidden, maintaining connection');
  } else {
    console.log('[WebSocket] Page visible');
    // ページが再び表示されたときに接続を確認
    if (!socket.connected) {
      console.log('[WebSocket] Reconnecting after page became visible');
      socket.connect();
    }
  }
});

export default socket;
export { connectionManager };
