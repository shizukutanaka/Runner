// Verifies the "no YOUTUBE_API_KEY configured" path in isolation.
// Kept in a separate file from youtubeIngestionService.test.js because the
// module reads config.services.youtube.apiKey once at require time (module-
// level singleton) - each Jest test file gets its own fresh module registry,
// so this file can safely leave the key unset without colliding with the
// other file's `process.env.YOUTUBE_API_KEY = '...'` at import time.

jest.mock('googleapis', () => ({
  google: { youtube: jest.fn() }
}));

delete process.env.YOUTUBE_API_KEY;

const youtubeIngestionService = require('../../src/services/youtubeIngestionService');

describe('YouTube Ingestion Service (no API key configured)', () => {
  it('is disabled', () => {
    expect(youtubeIngestionService.isEnabled()).toBe(false);
  });

  it('startWatching short-circuits without calling the API', async () => {
    const { google } = require('googleapis');

    const result = await youtubeIngestionService.startWatching('vid1');

    expect(result).toEqual({ started: false, reason: 'disabled' });
    expect(google.youtube).not.toHaveBeenCalled();
  });
});
