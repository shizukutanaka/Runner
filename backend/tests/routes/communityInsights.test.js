/**
 * Community Insights API Routes Tests
 */

const request = require('supertest');
const express = require('express');
const router = require('../../src/routes/communityInsights');

// テスト用のExpressアプリをセットアップ
const app = express();
app.use(express.json());
app.use('/api/insights', router);

describe('Community Insights API', () => {
  describe('GET /api/insights/risk/:platform/:channelId', () => {
    it('returns risk evaluation for a channel', async () => {
      const res = await request(app)
        .get('/api/insights/risk/youtube/test-channel')
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('riskScore');
      expect(res.body.data).toHaveProperty('level');
    });
  });

  describe('POST /api/insights/ingest', () => {
    it('ingests a comment successfully', async () => {
      const comment = {
        platform: 'youtube',
        channelId: 'test',
        content: 'This is a test comment',
        id: 'comment-1',
      };

      const res = await request(app)
        .post('/api/insights/ingest')
        .send(comment)
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body).toHaveProperty('data');
    });

    it('returns 400 when platform is missing', async () => {
      const comment = {
        content: 'Test comment',
      };

      const res = await request(app)
        .post('/api/insights/ingest')
        .send(comment)
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('returns 400 when content is missing', async () => {
      const comment = {
        platform: 'youtube',
      };

      const res = await request(app)
        .post('/api/insights/ingest')
        .send(comment)
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('POST /api/insights/health-score', () => {
    it('calculates health score from comments array', async () => {
      const comments = [
        { content: 'Great video!', sentimentScore: 0.9 },
        { content: 'Thanks for sharing', sentimentScore: 0.85 },
        { content: 'Very informative', sentimentScore: 0.8 },
      ];

      const res = await request(app)
        .post('/api/insights/health-score')
        .send({ comments })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('score');
      expect(res.body.data).toHaveProperty('grade');
      expect(res.body.data).toHaveProperty('signals');
    });

    it('returns 400 when comments is not an array', async () => {
      const res = await request(app)
        .post('/api/insights/health-score')
        .send({ comments: 'not an array' })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body.message).toContain('配列');
    });

    it('returns 400 when comments array exceeds 1000 items', async () => {
      const comments = Array.from({ length: 1001 }, (_, i) => ({
        content: `Comment ${i}`,
        sentimentScore: 0.5,
      }));

      const res = await request(app)
        .post('/api/insights/health-score')
        .send({ comments })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body.message).toContain('1000');
    });
  });

  describe('POST /api/insights/context-analysis', () => {
    it('analyzes comment with context', async () => {
      const targetComment = { content: 'This is okay' };
      const contextComments = [
        { content: 'Great!' },
        { content: 'Awesome' },
      ];

      const res = await request(app)
        .post('/api/insights/context-analysis')
        .send({ targetComment, contextComments })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('baseScore');
      expect(res.body.data).toHaveProperty('contextAdjusted');
      expect(res.body.data).toHaveProperty('verdict');
    });

    it('returns 400 when targetComment is missing', async () => {
      const res = await request(app)
        .post('/api/insights/context-analysis')
        .send({ contextComments: [] })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });

    it('returns 400 when context exceeds 200 comments', async () => {
      const targetComment = { content: 'Test' };
      const contextComments = Array.from({ length: 201 }, () => ({
        content: 'Context comment',
      }));

      const res = await request(app)
        .post('/api/insights/context-analysis')
        .send({ targetComment, contextComments })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body.message).toContain('200');
    });
  });

  describe('GET /api/insights/culture/:platform/:channelId', () => {
    it('returns culture profile for a channel', async () => {
      const res = await request(app)
        .get('/api/insights/culture/youtube/test-channel')
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('cultureType');
      expect(res.body.data).toHaveProperty('toxicityMultiplier');
    });
  });

  describe('PUT /api/insights/culture/:platform/:channelId', () => {
    it('sets culture profile successfully', async () => {
      const res = await request(app)
        .put('/api/insights/culture/youtube/test-channel')
        .send({ cultureType: 'family' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('cultureType', 'family');
    });

    it('returns 400 when cultureType is missing', async () => {
      const res = await request(app)
        .put('/api/insights/culture/youtube/test-channel')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });

    it('returns 400 for unknown culture type', async () => {
      const res = await request(app)
        .put('/api/insights/culture/youtube/test-channel')
        .send({ cultureType: 'unknown_type' })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });
  });

  describe('GET /api/insights/culture-presets', () => {
    it('returns list of culture presets', async () => {
      const res = await request(app)
        .get('/api/insights/culture-presets')
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/insights/culture-adjust', () => {
    it('adjusts score based on culture profile', async () => {
      const res = await request(app)
        .post('/api/insights/culture-adjust')
        .send({
          platform: 'youtube',
          channelId: 'test',
          rawScore: 50,
        })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('adjusted');
      expect(res.body.data).toHaveProperty('verdict');
    });

    it('returns 400 when rawScore is not a number', async () => {
      const res = await request(app)
        .post('/api/insights/culture-adjust')
        .send({
          platform: 'youtube',
          rawScore: 'not a number',
        })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });
  });

  describe('GET /api/insights/silent-departure/:platform/:channelId', () => {
    it('returns silent departure analysis', async () => {
      const res = await request(app)
        .get('/api/insights/silent-departure/youtube/test-channel')
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('departureRisk');
    });
  });

  describe('POST /api/insights/record-activity', () => {
    it('records user activity successfully', async () => {
      const res = await request(app)
        .post('/api/insights/record-activity')
        .send({
          platform: 'youtube',
          userId: 'user123',
          timestamp: new Date().toISOString(),
        })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('recorded', true);
    });

    it('returns 400 when platform is missing', async () => {
      const res = await request(app)
        .post('/api/insights/record-activity')
        .send({ userId: 'user123' })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });

    it('returns 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/api/insights/record-activity')
        .send({ platform: 'youtube' })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });
  });

  describe('POST /api/insights/triage', () => {
    it('performs triage on pending comments', async () => {
      const pendingComments = [
        { id: 'c1', content: 'Test comment 1', toxicityScore: 0.2 },
        { id: 'c2', content: 'Test comment 2', toxicityScore: 0.8 },
      ];

      const res = await request(app)
        .post('/api/insights/triage')
        .send({ pendingComments })
        .expect(200);

      expect(res.body).toHaveProperty('status', 200);
      expect(res.body.data).toHaveProperty('queues');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('returns 400 when pendingComments is not an array', async () => {
      const res = await request(app)
        .post('/api/insights/triage')
        .send({ pendingComments: 'not an array' })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
    });

    it('returns 400 when pendingComments exceeds 500 items', async () => {
      const pendingComments = Array.from({ length: 501 }, (_, i) => ({
        id: `c${i}`,
        content: `Comment ${i}`,
      }));

      const res = await request(app)
        .post('/api/insights/triage')
        .send({ pendingComments })
        .expect(400);

      expect(res.body).toHaveProperty('status', 400);
      expect(res.body.message).toContain('500');
    });
  });
});
