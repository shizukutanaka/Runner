// R-22: ヘイトレイド（協調攻撃）検知。研究(arXiv:2305.16248)が示す
// 「多数アカウントによる同時類似投稿」というライブ配信固有の攻撃パターンを
// 捉えられるか、および正当な同時多発コメントを誤検知しないかを検証する。
const { RaidDetector, normalizeForSimilarity } = require('../../src/services/raidDetector');

describe('RaidDetector（協調攻撃検知・R-22）', () => {
  let det;
  beforeEach(() => { det = new RaidDetector(); });

  describe('正規化', () => {
    it('記号/空白/連続文字の揺れを吸収して同一視する', () => {
      const a = normalizeForSimilarity('死ね!!!');
      const b = normalizeForSimilarity('し ね');
      expect(normalizeForSimilarity('死ね')).toBe(a);
      expect(b).toBe('しね');
      // 3連以上の繰り返しは圧縮される
      expect(normalizeForSimilarity('うざあああああ')).toBe(normalizeForSimilarity('うざああ'));
    });
  });

  describe('検知', () => {
    it('多数の異なるアカウントが同一内容を短時間に投稿するとレイド判定', () => {
      // 12アカウントが同じ攻撃文を投稿（＝典型的なhate raid）
      for (let i = 0; i < 12; i++) {
        det.record('twitch', 'ch1', `bot_${i}`, '死ね消えろ', new Date());
      }
      const r = det.analyze('twitch', 'ch1');
      expect(r.raidDetected).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0.6);
      expect(r.similarClusters[0].userCount).toBeGreaterThanOrEqual(3);
      expect(r.distinctUsers).toBe(12);
      expect(r.recommendation).toContain('協調攻撃');
    });

    it('表記を少し変えた回避（記号/連続文字）も同一クラスタとして捉える', () => {
      const variants = ['死ね!!!', '死ね', 'し　ね', '死ねええええ', '死ね。', '死ね~~~'];
      variants.forEach((v, i) => det.record('twitch', 'ch2', `u${i}`, v, new Date()));
      const r = det.analyze('twitch', 'ch2');
      // 全て同一クラスタに寄るはず（少なくとも半数以上）
      expect(r.similarClusters.length).toBeGreaterThanOrEqual(1);
      expect(r.similarClusters[0].userCount).toBeGreaterThanOrEqual(3);
    });

    it('同一ユーザーの連投だけではレイド判定しない（協調ではない）', () => {
      for (let i = 0; i < 15; i++) {
        det.record('youtube', 'ch3', 'single_spammer', '宣伝です', new Date());
      }
      const r = det.analyze('youtube', 'ch3');
      // クラスタのユーザー数は1なので、協調攻撃の主シグナルは立たない
      expect(r.distinctUsers).toBe(1);
      expect(r.raidDetected).toBe(false);
    });

    it('内容がバラバラな通常の盛り上がりは誤検知しない', () => {
      const msgs = ['今日もありがとう', 'いい配信だった', '次はいつ？', 'かわいい',
        'その戦法うまい', '初見です', 'おつかれさま', 'BGM教えて'];
      msgs.forEach((m, i) => det.record('youtube', 'ch4', `viewer_${i}`, m, new Date()));
      const r = det.analyze('youtube', 'ch4');
      expect(r.raidDetected).toBe(false);
    });

    it('メッセージが少なすぎる場合は判定しない', () => {
      det.record('youtube', 'ch5', 'u1', 'こんにちは', new Date());
      const r = det.analyze('youtube', 'ch5');
      expect(r.raidDetected).toBe(false);
      expect(r.recommendation).toContain('十分なメッセージがありません');
    });

    it('ウィンドウ外の古いメッセージは解析対象から外れる', () => {
      const old = new Date(Date.now() - 5 * 60 * 1000); // 5分前（ウィンドウ60秒外）
      for (let i = 0; i < 12; i++) {
        det.record('twitch', 'ch6', `bot_${i}`, '死ね', old);
      }
      const r = det.analyze('twitch', 'ch6');
      expect(r.messageCount).toBe(0);
      expect(r.raidDetected).toBe(false);
    });

    it('未観測チャンネルは空の結果を返す', () => {
      const r = det.analyze('youtube', 'unknown');
      expect(r.raidDetected).toBe(false);
      expect(r.messageCount).toBe(0);
    });
  });

  // R-22b: リアルタイム通知。レイドは短時間で押し寄せるため遷移の瞬間に通知するが、
  // 毎メッセージ通知すると洪水になるので遷移時のみ＋クールダウンで抑止する
  describe('リアルタイムアラート（checkForAlert）', () => {
    const raidBurst = (d, ch, n = 12) => {
      for (let i = 0; i < n; i++) d.record('twitch', ch, `bot_${i}`, '死ね消えろ', new Date());
    };

    it('レイド状態へ遷移した瞬間にアラートを返す', () => {
      raidBurst(det, 'a1');
      const alert = det.checkForAlert('twitch', 'a1');
      expect(alert).not.toBeNull();
      expect(alert.raidDetected).toBe(true);
      expect(alert.score).toBeGreaterThanOrEqual(0.6);
    });

    it('レイドが継続していても二重に通知しない（遷移時のみ）', () => {
      raidBurst(det, 'a2');
      const first = det.checkForAlert('twitch', 'a2');
      expect(first).not.toBeNull();

      // 解析の間引き間隔を越えた後でも、既にレイド状態なので再通知しない
      const state = det.alertState.get('twitch:a2');
      state.lastCheckAt = Date.now() - 10000;
      det.alertState.set('twitch:a2', state);

      raidBurst(det, 'a2');
      expect(det.checkForAlert('twitch', 'a2')).toBeNull();
    });

    it('通常チャットではアラートを返さない', () => {
      ['ありがとう', 'たのしい', '次はいつ？', 'うまい', '初見です', 'おつかれ']
        .forEach((m, i) => det.record('youtube', 'a3', `v${i}`, m, new Date()));
      expect(det.checkForAlert('youtube', 'a3')).toBeNull();
    });

    it('短時間に連続して呼ばれた場合は解析を間引く', () => {
      raidBurst(det, 'a4');
      expect(det.checkForAlert('twitch', 'a4')).not.toBeNull();
      // 直後の呼び出しは間引かれ null
      expect(det.checkForAlert('twitch', 'a4')).toBeNull();
    });
  });
});
