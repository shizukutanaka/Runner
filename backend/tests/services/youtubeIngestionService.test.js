// YouTube Ingestion Service Unit Tests
// Mocks googleapis (no real network access) and commentsController.ingestComment
// to verify polling -> ingestion -> quota tracking -> auto-stop behavior in isolation.

jest.useFakeTimers();

const mockYoutubeClient = {
  videos: { list: jest.fn() },
  liveChatMessages: { list: jest.fn() }
};

jest.mock('googleapis', () => ({
  google: { youtube: jest.fn(() => mockYoutubeClient) }
}));

jest.mock('../../src/controllers/commentsController', () => ({
  ingestComment: jest.fn().mockResolvedValue({ outcome: 'created' })
}));

// youtubeIngestionService.js reads config.services.youtube.apiKey once at module
// load time (module-level singleton, same pattern as openaiService.js), so the
// key must be set before requiring it.
process.env.YOUTUBE_API_KEY = 'test-youtube-api-key';

const youtubeIngestionService = require('../../src/services/youtubeIngestionService');
const commentsController = require('../../src/controllers/commentsController');

describe('YouTube Ingestion Service', () => {
  beforeEach(() => {
    // jest.config.js has resetMocks/restoreMocks enabled, which wipes the
    // jest.mock() factory's own mockImplementation before every test (same
    // issue as the openaiService.test.js OpenAI constructor mock) - reapply it.
    const { google } = require('googleapis');
    google.youtube.mockImplementation(() => mockYoutubeClient);

    youtubeIngestionService.stopAll();
    youtubeIngestionService.quota = { unitsUsed: 0, day: youtubeIngestionService.quota.day };
    mockYoutubeClient.videos.list.mockReset();
    mockYoutubeClient.liveChatMessages.list.mockReset();
    commentsController.ingestComment.mockReset().mockResolvedValue({ outcome: 'created' });
  });

  afterAll(() => {
    youtubeIngestionService.stopAll();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('isEnabled()', () => {
    it('is enabled when YOUTUBE_API_KEY is configured', () => {
      expect(youtubeIngestionService.isEnabled()).toBe(true);
    });
  });

  describe('startWatching()', () => {
    it('looks up the live chat id and registers the watch', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chat123' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeIngestionService.startWatching('vid1');

      expect(result).toEqual({ started: true, videoId: 'vid1', liveChatId: 'chat123' });
      expect(youtubeIngestionService.listWatches().map((w) => w.videoId)).toContain('vid1');
    });

    it('returns not_live when the video has no active live chat', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({ data: { items: [{}] } });

      const result = await youtubeIngestionService.startWatching('vid2');

      expect(result).toEqual({ started: false, reason: 'not_live' });
    });

    it('refuses to watch the same video twice', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chatX' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({ data: { items: [] } });

      await youtubeIngestionService.startWatching('vid3');
      const second = await youtubeIngestionService.startWatching('vid3');

      expect(second).toEqual({ started: false, reason: 'already_watching' });
    });

    it('returns lookup_failed when the videos.list call throws', async () => {
      mockYoutubeClient.videos.list.mockRejectedValue(new Error('network down'));

      const result = await youtubeIngestionService.startWatching('vid-err');

      expect(result.started).toBe(false);
      expect(result.reason).toBe('lookup_failed');
    });
  });

  describe('polling and ingestion', () => {
    it('ingests fetched live chat messages via commentsController.ingestComment', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chatY' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({
        data: {
          items: [
            {
              snippet: { displayMessage: 'Hello chat!', publishedAt: '2026-01-01T00:00:00Z' },
              authorDetails: { displayName: 'Alice' }
            }
          ],
          nextPageToken: 'tok2',
          pollingIntervalMillis: 3000
        }
      });

      await youtubeIngestionService.startWatching('vid4');
      // startWatching schedules the first poll via setTimeout(0, ...); flush it.
      await jest.runOnlyPendingTimersAsync();

      expect(commentsController.ingestComment).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello chat!',
          user: 'Alice',
          platform: 'youtube',
          timestamp: '2026-01-01T00:00:00Z'
        }),
        expect.any(Object)
      );
    });

    it('skips messages missing content or author instead of crashing', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chatZ' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({
        data: {
          items: [
            { snippet: {}, authorDetails: { displayName: 'Bob' } }, // no message
            { snippet: { displayMessage: 'hi' }, authorDetails: {} } // no name
          ],
          nextPageToken: null
        }
      });

      await youtubeIngestionService.startWatching('vid5');
      await jest.runOnlyPendingTimersAsync();

      expect(commentsController.ingestComment).not.toHaveBeenCalled();
    });
  });

  describe('quota tracking', () => {
    it('refuses to start watching once the daily quota is exhausted', async () => {
      youtubeIngestionService.quota.unitsUsed = 10_000;

      const result = await youtubeIngestionService.startWatching('vid-quota');

      expect(result).toEqual({ started: false, reason: 'quota_exceeded' });
      expect(mockYoutubeClient.videos.list).not.toHaveBeenCalled();
    });

    it('getQuotaStatus reports remaining units', () => {
      youtubeIngestionService.quota.unitsUsed = 100;
      const status = youtubeIngestionService.getQuotaStatus();

      expect(status.unitsUsed).toBe(100);
      expect(status.dailyLimit).toBe(10_000);
      expect(status.remaining).toBe(9_900);
    });

    it('stops the watch when quota is exhausted mid-poll', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chatQ' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({
        data: { items: [], nextPageToken: null, pollingIntervalMillis: 1000 }
      });

      await youtubeIngestionService.startWatching('vid-quota-2');
      youtubeIngestionService.quota.unitsUsed = 10_000; // exhaust before the first poll fires
      await jest.runOnlyPendingTimersAsync();

      expect(youtubeIngestionService.listWatches().map((w) => w.videoId)).not.toContain('vid-quota-2');
      expect(mockYoutubeClient.liveChatMessages.list).not.toHaveBeenCalled();
    });
  });

  describe('stopWatching() / stopAll()', () => {
    it('removes the video from the watch list', async () => {
      mockYoutubeClient.videos.list.mockResolvedValue({
        data: { items: [{ liveStreamingDetails: { activeLiveChatId: 'chatS' } }] }
      });
      mockYoutubeClient.liveChatMessages.list.mockResolvedValue({ data: { items: [] } });

      await youtubeIngestionService.startWatching('vid6');
      const stopped = youtubeIngestionService.stopWatching('vid6');

      expect(stopped).toBe(true);
      expect(youtubeIngestionService.listWatches().map((w) => w.videoId)).not.toContain('vid6');
    });

    it('returns false when the video is not being watched', () => {
      expect(youtubeIngestionService.stopWatching('never-watched')).toBe(false);
    });
  });
});
