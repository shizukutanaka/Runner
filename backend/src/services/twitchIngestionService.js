const WebSocket = require('ws');
const logger = require('../logger');
const config = require('../config');

/**
 * Twitch チャット取り込みサービス（R-29）
 *
 * 製品名は「YouTube & Twitch」を約束しているのに Twitch が未実装だった。
 * 実装経路は R-7 で確定済みの内容に従う:
 *
 *  - **EventSub WebSocket + `channel.chat.message` 購読**を使う。
 *    IRC（tmi）や PubSub はレガシー扱いであり、新規実装では使わない。
 *  - **Shared Chat 対応**: 2024年に導入された合同配信では、メッセージが参加
 *    チャンネル全体にミラーされ、ペイロードに `source_broadcaster_user_id` が付く。
 *    これを自分が購読している `broadcaster_user_id` と突き合わせないと、
 *    **同一メッセージに対する二重処理（二重BAN等）**が起きる。よって取り込み時点で
 *    「他チャンネル由来のミラー」を除外する。
 *
 * 取り込んだメッセージは必ず `commentsController.ingestComment()` を通す。
 * これによりモデレーション・保留・離脱検知・レイド検知が YouTube と同一に適用される。
 *
 * フェイルセーフ規約: クレデンシャル未設定でも例外を投げず、警告のみで無効化する。
 */

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const HELIX_BASE = 'https://api.twitch.tv/helix';
const MAX_CONSECUTIVE_ERRORS = 5;
const RECONNECT_BASE_MS = 1000;
const MAX_RECONNECT_MS = 60_000;

class TwitchIngestionService {
  constructor() {
    this.clientId = config.services.twitch.clientId;
    this.clientSecret = config.services.twitch.clientSecret;
    // ユーザーアクセストークン（chat:read 等のスコープ付き）。
    // アプリトークンでは channel.chat.message を購読できないため別に持つ
    this.userAccessToken = config.services.twitch.userAccessToken;
    this.userId = config.services.twitch.userId;

    this.enabled = Boolean(this.clientId && this.clientSecret && this.userAccessToken && this.userId);
    this.ws = null;
    this.sessionId = null;
    this.watches = new Map(); // broadcasterUserId -> { subscriptionId, startedAt, io }
    this.consecutiveErrors = 0;
    this.reconnectDelay = RECONNECT_BASE_MS;
    this.stopped = false;

    if (!this.enabled) {
      logger.warn('[TwitchIngestion] Credentials not configured - Twitch ingestion is disabled '
        + '(set TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET / TWITCH_USER_ACCESS_TOKEN / TWITCH_USER_ID)');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  listWatches() {
    return Array.from(this.watches.entries()).map(([broadcasterUserId, w]) => ({
      broadcasterUserId,
      subscriptionId: w.subscriptionId,
      startedAt: w.startedAt
    }));
  }

  /**
   * EventSub WebSocket へ接続し welcome メッセージで session_id を得る。
   * 既に接続済みなら何もしない。
   */
  async _connect() {
    if (this.ws && this.sessionId) return this.sessionId;
    if (!this.enabled) throw new Error('Twitch ingestion is not configured');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(EVENTSUB_WS_URL);
      this.ws = ws;
      let settled = false;

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (err) {
          logger.warn('[TwitchIngestion] Non-JSON message received', { error: err.message });
          return;
        }
        const type = msg.metadata?.message_type;

        if (type === 'session_welcome') {
          this.sessionId = msg.payload?.session?.id;
          this.reconnectDelay = RECONNECT_BASE_MS;
          logger.info('[TwitchIngestion] EventSub session established', { sessionId: this.sessionId });
          if (!settled) { settled = true; resolve(this.sessionId); }
          return;
        }

        if (type === 'session_reconnect') {
          // Twitch から再接続を指示された場合は指示されたURLへ張り直す
          logger.info('[TwitchIngestion] Reconnect requested by Twitch');
          this._reconnect(msg.payload?.session?.reconnect_url);
          return;
        }

        if (type === 'notification') {
          this._handleNotification(msg).catch((err) => {
            logger.error('[TwitchIngestion] Failed to handle notification', { error: err.message });
          });
        }
      });

      ws.on('error', (err) => {
        logger.error('[TwitchIngestion] WebSocket error', { error: err.message });
        if (!settled) { settled = true; reject(err); }
      });

      ws.on('close', () => {
        this.sessionId = null;
        if (!this.stopped && this.watches.size > 0) {
          this._reconnect();
        }
      });
    });
  }

  _reconnect(url) {
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
    logger.info('[TwitchIngestion] Reconnecting', { delayMs: delay });
    setTimeout(() => {
      this.ws = null;
      this.sessionId = null;
      this._connect().catch((err) => {
        logger.error('[TwitchIngestion] Reconnect failed', { error: err.message, url });
      });
    }, delay);
  }

  /**
   * `channel.chat.message` 通知を取り込む。
   * Shared Chat のミラーは除外する（R-7の設計判断）。
   */
  async _handleNotification(msg) {
    const subType = msg.payload?.subscription?.type;
    if (subType !== 'channel.chat.message') return;

    const event = msg.payload.event || {};
    const broadcasterUserId = event.broadcaster_user_id;
    const sourceBroadcasterUserId = event.source_broadcaster_user_id;

    // Shared Chat: source_* が付いていて自チャンネルと異なる場合は、
    // 他チャンネル由来のミラーなので処理しない（二重アクション防止）
    if (sourceBroadcasterUserId && sourceBroadcasterUserId !== broadcasterUserId) {
      logger.debug('[TwitchIngestion] Skipping shared-chat mirror', {
        broadcasterUserId, sourceBroadcasterUserId
      });
      return;
    }

    const content = event.message?.text;
    const user = event.chatter_user_name || event.chatter_user_login;
    if (!content || !user) return;

    const watch = this.watches.get(broadcasterUserId);
    try {
      // eslint-disable-next-line global-require
      const commentsController = require('../controllers/commentsController');
      await commentsController.ingestComment(
        {
          content,
          user,
          platform: 'twitch',
          timestamp: new Date().toISOString(),
          // 書き戻し（R-28）と同じ枠組みで識別子を保存する
          platformMessageId: event.message_id,
          authorChannelId: event.chatter_user_id
        },
        { io: watch?.io }
      );
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors += 1;
      logger.error('[TwitchIngestion] Failed to ingest chat message', {
        broadcasterUserId, error: err.message, consecutiveErrors: this.consecutiveErrors
      });
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        logger.error('[TwitchIngestion] Too many consecutive errors - stopping all watches');
        this.stopAll();
      }
    }
  }

  async _helix(path, options = {}) {
    const res = await fetch(`${HELIX_BASE}${path}`, {
      ...options,
      headers: {
        'Client-Id': this.clientId,
        Authorization: `Bearer ${this.userAccessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twitch API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /**
   * 指定した配信者のチャットの監視を開始する。
   * @param {string} broadcasterUserId 監視対象のブロードキャスターID
   */
  async startWatching(broadcasterUserId, { io } = {}) {
    if (!this.enabled) {
      return { started: false, reason: 'not_configured' };
    }
    if (this.watches.has(broadcasterUserId)) {
      return { started: false, reason: 'already_watching' };
    }

    this.stopped = false;
    const sessionId = await this._connect();

    const body = {
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: broadcasterUserId,
        user_id: this.userId
      },
      transport: { method: 'websocket', session_id: sessionId }
    };

    const result = await this._helix('/eventsub/subscriptions', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const subscriptionId = result?.data?.[0]?.id;

    this.watches.set(broadcasterUserId, {
      subscriptionId,
      startedAt: new Date().toISOString(),
      io
    });
    logger.info('[TwitchIngestion] Started watching Twitch chat', { broadcasterUserId, subscriptionId });
    return { started: true, broadcasterUserId, subscriptionId };
  }

  async stopWatching(broadcasterUserId) {
    const watch = this.watches.get(broadcasterUserId);
    if (!watch) return { stopped: false, reason: 'not_watching' };

    if (watch.subscriptionId) {
      try {
        await this._helix(`/eventsub/subscriptions?id=${watch.subscriptionId}`, { method: 'DELETE' });
      } catch (err) {
        logger.warn('[TwitchIngestion] Failed to delete subscription', { error: err.message });
      }
    }
    this.watches.delete(broadcasterUserId);
    logger.info('[TwitchIngestion] Stopped watching', { broadcasterUserId });

    if (this.watches.size === 0) this.stopAll();
    return { stopped: true, broadcasterUserId };
  }

  stopAll() {
    this.stopped = true;
    this.watches.clear();
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
    }
    this.ws = null;
    this.sessionId = null;
    logger.info('[TwitchIngestion] All watches stopped');
  }
}

module.exports = new TwitchIngestionService();
module.exports.TwitchIngestionService = TwitchIngestionService;
