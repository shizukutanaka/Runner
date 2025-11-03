import { io } from 'socket.io-client';

/**
 * Enhanced WebSocket client with reconnection logic and exponential backoff
 */
class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier || 1.5;
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.heartbeatTimeout = null;
    this.connectionTimeout = options.connectionTimeout || 10000;
    this.isConnecting = false;
    this.isConnected = false;
    this.listeners = new Map();
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError = options.onError || (() => {});
    this.onReconnecting = options.onReconnecting || (() => {});
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.isConnecting || this.isConnected) {
      console.warn('[WebSocket] Already connected or connecting');
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = io(this.url, {
        reconnection: false, // Handle reconnection manually
        timeout: this.connectionTimeout,
        transports: ['websocket', 'polling'],
        upgrade: true
      });

      this.setupEventHandlers();

      console.log('[WebSocket] Connecting to', this.url);
    } catch (error) {
      console.error('[WebSocket] Connection failed', error);
      this.isConnecting = false;
      this.handleReconnect();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.onConnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.isConnected = false;
      this.stopHeartbeat();
      this.onDisconnect(reason);

      // Auto-reconnect for certain disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, reconnect manually
        this.handleReconnect();
      } else if (reason === 'transport close' || reason === 'transport error') {
        // Connection lost, reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      this.isConnecting = false;
      this.onError(error);
      this.handleReconnect();
    });

    this.socket.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
      this.onError(error);
    });

    this.socket.on('pong', () => {
      console.debug('[WebSocket] Pong received');
    });

    // Re-register listeners
    for (const [event, handlers] of this.listeners.entries()) {
      handlers.forEach(handler => {
        this.socket.on(event, handler);
      });
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this.onError(new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(this.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.onReconnecting(this.reconnectAttempts, delay);

    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.isConnecting = false;
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimeout = setInterval(() => {
      if (this.isConnected && this.socket) {
        this.socket.emit('ping');
        console.debug('[WebSocket] Ping sent');
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimeout) {
      clearInterval(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Emit event to server
   */
  emit(event, data) {
    if (!this.isConnected || !this.socket) {
      console.warn('[WebSocket] Cannot emit, not connected');
      return false;
    }

    try {
      this.socket.emit(event, data);
      return true;
    } catch (error) {
      console.error('[WebSocket] Emit failed', error);
      return false;
    }
  }

  /**
   * Listen for event from server
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(handler);

    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  /**
   * Remove event listener
   */
  off(event, handler) {
    if (this.listeners.has(event)) {
      const handlers = this.listeners.get(event);
      const index = handlers.indexOf(handler);

      if (index !== -1) {
        handlers.splice(index, 1);
      }

      if (handlers.length === 0) {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    console.log('[WebSocket] Disconnecting');

    this.stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Get connection state
   */
  getState() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  /**
   * Reset reconnection attempts
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }
}

export default WebSocketClient;
