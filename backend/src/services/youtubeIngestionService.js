const { google } = require('googleapis');
const logger = require('../logger');
const config = require('../config');
const commentsController = require('../controllers/commentsController');

// YouTube Data API v3 の公式クォータコスト（ユニット単位）
const QUOTA_COST = {
  VIDEOS_LIST: 1,
  LIVE_CHAT_MESSAGES_LIST: 5
};

const DAILY_QUOTA_LIMIT = 10_000;
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_BACKOFF_MS = 60_000;

/**
 * YouTube Data API v3 のライブチャットをポーリングし、取得したメッセージを
 * commentsController.ingestComment() へ投入する取り込みサービス。
 * videos.list / liveChatMessages.list のみを使用する監視型API
 * （明示的に startWatching(videoId) された動画のみをポーリングする）。
 */
class YouTubeIngestionService {
  constructor() {
    this.apiKey = config.services.youtube.apiKey;
    this.pollingInterval = config.services.youtube.pollingInterval;
    this.maxResults = config.services.youtube.maxResults;
    this.enabled = Boolean(this.apiKey);
    this.client = null;
    this.watches = new Map(); // videoId -> { liveChatId, nextPageToken, timer, io, errorCount, startedAt }
    this.quota = this._freshQuotaTracker();

    if (!this.enabled) {
      logger.warn('[YouTubeIngestion] YOUTUBE_API_KEY not set - ingestion disabled');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  _freshQuotaTracker() {
    return { unitsUsed: 0, day: new Date().toISOString().slice(0, 10) };
  }

  _getClient() {
    if (!this.client) {
      this.client = google.youtube({ version: 'v3', auth: this.apiKey });
    }
    return this.client;
  }

  _resetQuotaIfNewDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.quota.day !== today) {
      this.quota = this._freshQuotaTracker();
    }
  }

  /**
   * @param {number} cost - units this call is about to spend
   * @returns {boolean} whether the call is allowed under the daily quota
   */
  _consumeQuota(cost) {
    this._resetQuotaIfNewDay();
    if (this.quota.unitsUsed + cost > DAILY_QUOTA_LIMIT) {
      return false;
    }
    this.quota.unitsUsed += cost;
    return true;
  }

  getQuotaStatus() {
    this._resetQuotaIfNewDay();
    return {
      unitsUsed: this.quota.unitsUsed,
      dailyLimit: DAILY_QUOTA_LIMIT,
      remaining: Math.max(DAILY_QUOTA_LIMIT - this.quota.unitsUsed, 0),
      day: this.quota.day
    };
  }

  listWatches() {
    return Array.from(this.watches.entries()).map(([videoId, watch]) => ({
      videoId,
      liveChatId: watch.liveChatId,
      startedAt: watch.startedAt,
      errorCount: watch.errorCount
    }));
  }

  /**
   * Starts polling a video's live chat for new messages.
   * @param {string} videoId
   * @param {{io?: object}} [options]
   */
  async startWatching(videoId, { io } = {}) {
    if (!this.enabled) {
      return { started: false, reason: 'disabled' };
    }

    if (this.watches.has(videoId)) {
      return { started: false, reason: 'already_watching' };
    }

    if (!this._consumeQuota(QUOTA_COST.VIDEOS_LIST)) {
      logger.warn('[YouTubeIngestion] Daily quota exhausted, cannot start watching', { videoId });
      return { started: false, reason: 'quota_exceeded' };
    }

    let liveChatId;
    try {
      const response = await this._getClient().videos.list({
        part: ['liveStreamingDetails'],
        id: [videoId]
      });
      liveChatId = response.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    } catch (error) {
      logger.error('[YouTubeIngestion] Failed to look up live chat for video', {
        videoId,
        error: error.message
      });
      return { started: false, reason: 'lookup_failed', error: error.message };
    }

    if (!liveChatId) {
      return { started: false, reason: 'not_live' };
    }

    const watch = {
      liveChatId,
      nextPageToken: null,
      timer: null,
      io,
      errorCount: 0,
      startedAt: new Date().toISOString()
    };
    this.watches.set(videoId, watch);
    logger.info('[YouTubeIngestion] Started watching video', { videoId, liveChatId });
    this._scheduleNextPoll(videoId, 0);

    return { started: true, videoId, liveChatId };
  }

  stopWatching(videoId) {
    const watch = this.watches.get(videoId);
    if (!watch) {
      return false;
    }
    if (watch.timer) {
      clearTimeout(watch.timer);
    }
    this.watches.delete(videoId);
    logger.info('[YouTubeIngestion] Stopped watching video', { videoId });
    return true;
  }

  stopAll() {
    Array.from(this.watches.keys()).forEach((videoId) => this.stopWatching(videoId));
  }

  _scheduleNextPoll(videoId, delayMs) {
    const watch = this.watches.get(videoId);
    if (!watch) {
      return;
    }
    const timer = setTimeout(() => this._pollOnce(videoId), delayMs);
    timer.unref();
    watch.timer = timer;
  }

  async _pollOnce(videoId) {
    const watch = this.watches.get(videoId);
    if (!watch) {
      return;
    }

    if (!this._consumeQuota(QUOTA_COST.LIVE_CHAT_MESSAGES_LIST)) {
      logger.warn('[YouTubeIngestion] Daily quota exhausted, stopping watch', { videoId });
      this.stopWatching(videoId);
      return;
    }

    try {
      const response = await this._getClient().liveChatMessages.list({
        liveChatId: watch.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: watch.nextPageToken || undefined,
        maxResults: this.maxResults
      });

      const messages = response.data.items || [];
      for (const item of messages) {
        const content = item.snippet?.displayMessage;
        const user = item.authorDetails?.displayName;
        if (!content || !user) {
          continue;
        }
        try {
          await commentsController.ingestComment(
            { content, user, platform: 'youtube', timestamp: item.snippet?.publishedAt },
            { io: watch.io }
          );
        } catch (ingestError) {
          logger.error('[YouTubeIngestion] Failed to ingest chat message', {
            videoId,
            error: ingestError.message
          });
        }
      }

      watch.nextPageToken = response.data.nextPageToken || null;
      watch.errorCount = 0;
      const nextDelay = response.data.pollingIntervalMillis || this.pollingInterval;
      this._scheduleNextPoll(videoId, nextDelay);
    } catch (error) {
      watch.errorCount += 1;
      logger.error('[YouTubeIngestion] Live chat poll failed', {
        videoId,
        errorCount: watch.errorCount,
        error: error.message
      });

      if (watch.errorCount >= MAX_CONSECUTIVE_ERRORS) {
        logger.error('[YouTubeIngestion] Too many consecutive errors, stopping watch', { videoId });
        this.stopWatching(videoId);
        return;
      }

      const backoffMs = Math.min(1000 * (2 ** watch.errorCount), MAX_BACKOFF_MS);
      this._scheduleNextPoll(videoId, backoffMs);
    }
  }
}

module.exports = new YouTubeIngestionService();
