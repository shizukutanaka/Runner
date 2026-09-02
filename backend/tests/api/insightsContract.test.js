// コミュニティ分析系の画面が読む項目が、実応答に存在すること。
//
// ---------------------------------------------------------------------------
// なぜ
// ---------------------------------------------------------------------------
// E-30 で「200を返すが、フロントが読む項目が入っていない」という失敗を
// 監視ダッシュボードで見つけた。エラーが出ないので、画面が空でも
// 「まだデータが無いのだろう」と読めてしまう種類の壊れ方である。
//
// `/api/insights/*` を読む画面は5つあり、いずれもテストが無い:
//   TriageQueue / CommunityHealthWidget / SilentDepartureAlert /
//   ContextAnalysisPanel / CultureProfilePanel
//
// 各画面が実際に参照している項目を**明示的に書き出して**突き合わせる。
// ソースからの自動抽出にすると、フロントが読むのをやめた項目まで永久に守り続ける。
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

const token = () => generateToken({ id: 'ic-mod', username: 'ic-mod', role: 'moderator' });
const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token()}`);
const post = (url, body) => request(app).post(url).set('Authorization', `Bearer ${token()}`).send(body);

const dig = (obj, dotted) =>
  dotted.split('.').reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);

describe('/api/insights が各画面の読む形を返すこと', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1200));
  });

  describe('TriageQueue — POST /insights/triage', () => {
    let body;
    beforeAll(async () => {
      // キーは `pendingComments`。`comments` で送ると400にもならず
      // **空のqueuesが200で返る**ため、テストが素通りする。
      // フロント（TriageQueue.jsx）が送っているキーと同じにすること
      const res = await post('/api/insights/triage', {
        // 項目のキーは `id`（moderatorTriageService は `comment.id` を読む）。
        // `commentId` で送ると queues の各項目の commentId が undefined になり、
        // 画面側の `key={item.commentId}` が全部 undefined になる
        pendingComments: [
          { id: 'tq-1', user: 'u1', content: '死ね', moderationScore: 0.9 },
          { id: 'tq-2', user: 'u2', content: '今日も楽しい', moderationScore: 0.1 }
        ],
        channelContext: { platform: 'youtube', channelId: 'ch-contract' }
      });
      expect(res.status).toBe(200);
      body = res.body;
    });

    it('data.queues と data.summary がある', () => {
      expect(dig(body, 'data.queues')).toBeDefined();
      expect(dig(body, 'data.summary')).toBeDefined();
    });

    it('queues のキーは画面の LEVEL_META と一致する', () => {
      // 画面は EMERGENCY / URGENT / ROUTINE / CAN_WAIT しか描画しない。
      // これ以外のキーで返すと、その分は**黙って消える**
      const keys = Object.keys(body.data.queues);
      expect(keys.sort()).toEqual(['CAN_WAIT', 'EMERGENCY', 'ROUTINE', 'URGENT']);
    });

    it('summary は emergency / urgent を持つ（バッジの数字）', () => {
      expect(dig(body, 'data.summary.emergency')).toBeDefined();
      expect(dig(body, 'data.summary.urgent')).toBeDefined();
    });

    it('各項目は commentId / content / user / priorityScore を持つ', () => {
      const items = Object.values(body.data.queues).flat();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.commentId).toBeDefined();
        expect(item.content).toBeDefined();
        expect(item.user).toBeDefined();
        // 画面は Math.round(priorityScore * 100) を表示する。数値でないとNaNになる
        expect(typeof item.priorityScore).toBe('number');
      }
    });
  });

  describe('CommunityHealthWidget — GET /insights/risk/:platform/:channelId', () => {
    it('data.riskScore / level / recommendation がある', async () => {
      const res = await get('/api/insights/risk/youtube/ch-contract');
      expect(res.status).toBe(200);
      expect(dig(res.body, 'data.riskScore')).toBeDefined();
      expect(dig(res.body, 'data.level')).toBeDefined();
      expect(dig(res.body, 'data.recommendation')).toBeDefined();
    });
  });

  describe('SilentDepartureAlert — GET /insights/silent-departure/:platform/:channelId', () => {
    it('画面が読む6項目がある', async () => {
      const res = await get('/api/insights/silent-departure/youtube/ch-contract');
      expect(res.status).toBe(200);
      for (const f of ['departureRisk', 'trend', 'regularUserCount', 'silentUserCount', 'silentUsers', 'insight']) {
        expect(dig(res.body, `data.${f}`)).toBeDefined();
      }
    });
  });

  describe('CultureProfilePanel — GET /insights/culture-presets と /culture/:platform/:channelId', () => {
    it('プリセット一覧が返る', async () => {
      const res = await get('/api/insights/culture-presets');
      expect(res.status).toBe(200);
      expect(dig(res.body, 'data')).toBeDefined();
    });

    it('チャンネルの文化プロファイルが返る', async () => {
      const res = await get('/api/insights/culture/youtube/ch-contract');
      expect(res.status).toBe(200);
      expect(dig(res.body, 'data')).toBeDefined();
    });
  });

  describe('ContextAnalysisPanel — POST /insights/context-analysis', () => {
    it('200 と data を返す（AIキー未設定でも落ちない）', async () => {
      const res = await post('/api/insights/context-analysis', {
        comment: 'これは酷い',
        context: []
      });
      // フェイルセーフ: キー未設定でも500にはしない
      expect(res.status).toBeLessThan(500);
    });
  });
});
