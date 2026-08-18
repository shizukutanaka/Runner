/**
 * ヘイトレイド（協調攻撃）検知
 *
 * 研究的背景:
 *  ライブ配信固有の脅威は「個々の有害コメント」ではなく、**多数のアカウントが
 *  同時に similar な内容を投稿する協調攻撃（hate raid）**である。Han et al.,
 *  "Hate Raids on Twitch: Understanding Real-Time Human-Bot Coordinated Attacks
 *  in Live Streaming Communities" (CSCW 2023 / arXiv:2305.16248) は、これが
 *  人間とボットが連携した集団攻撃であり、周縁化された配信者を標的にすること、
 *  そして配信者側の対抗手段が技術的手段に大きく依存していることを示した。
 *
 *  重要なのは、**1件ずつ見ると無害に見えるメッセージでも、短時間に多数の
 *  アカウントから同一/類似内容が投げ込まれれば攻撃**だという点である。
 *  本製品の `analyzeComment()` は1コメント単位の判定しか行わないため、
 *  この横断的なシグナルを見る層が存在しなかった。
 *
 * 検知シグナル（研究が挙げる「複数アカウントの同時投稿」を実装）:
 *  1. 短時間ウィンドウ内の**類似内容クラスタ**（異なるユーザーが同一/類似内容を投稿）
 *  2. メッセージ流量のスパイク
 *  3. 初出ユーザーの比率（レイドは新規/使い捨てアカウントを伴うことが多い）
 *
 * 誤検知への配慮: 配信では「草」「88888」等の**正当な同時多発コメント**が起きる。
 * そのため単一シグナルでは判定せず、複数シグナルの合成スコアで判断する。
 */

const logger = require('../logger');

// ─── 設定 ────────────────────────────────────────────────
const WINDOW_MS = 60 * 1000;          // 解析ウィンドウ（直近60秒）
const MAX_ENTRIES_PER_CHANNEL = 500;  // メモリ上限
const MIN_MESSAGES_FOR_ANALYSIS = 5;  // これ未満は判定しない（統計的に無意味）
const SIMILAR_CLUSTER_MIN_USERS = 3;  // 類似クラスタとみなす最小ユーザー数
const RATE_SPIKE_THRESHOLD = 30;      // ウィンドウ内メッセージ数のスパイク閾値
const RAID_SCORE_THRESHOLD = 0.6;     // これ以上でレイド判定
const ALERT_COOLDOWN_MS = 2 * 60 * 1000; // 同一チャンネルへの再通知間隔（通知の洪水を防ぐ）
const CHECK_MIN_INTERVAL_MS = 2000;      // 解析の実行間隔（毎メッセージでの再計算を避ける）
const DEFENSE_DURATION_MS = 5 * 60 * 1000; // 防御モードの継続時間（R-25）
// 手動解除後、自動再起動を抑止する時間（R-25）。これが無いと、レイド判定が
// ウィンドウ内で継続している限り解除した直後に再起動してしまい、
// 「人間のオーバーライド」が実質的に機能しない（E2E検証で発見）
const DEFENSE_SUPPRESS_MS = 5 * 60 * 1000;

// 類似判定用の正規化: 記号/空白/連続同一文字を圧縮し、表記ゆれを吸収する。
// 「死ね!!!」「しね～」「死ね」を同一クラスタに寄せるのが狙い
const normalizeForSimilarity = (text) => String(text || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s\u3000]+/g, '')
  .replace(/[!-/:-@[-`{-~！-／：-＠［-｀｛-～、。！？…〜ー]/g, '')
  .replace(/(.)\1{2,}/g, '$1$1'); // 3連以上の繰り返しは2文字に圧縮

class RaidDetector {
  constructor() {
    // channelKey → [{ userId, normalized, timestamp }]
    this.records = new Map();
    // channelKey → Map(userId → firstSeenAt)  初出判定＋「レイド開始後に現れたか」の判定用（R-25）
    this.seenUsers = new Map();
    // channelKey → { lastAlertAt, lastCheckAt, inRaid, defenseUntil, defenseStartedAt, defenseClusters }
    this.alertState = new Map();
  }

  // ─────────────────────────────────────────
  // 防御モード（R-25）
  //
  // Han et al. (CSCW 2023, arXiv:2305.16248) は、レイドが「短時間に大量に押し寄せて
  // モデレーターを圧倒する」性質を持ち、1件ずつの人力対応ではスケールしないこと、
  // そして **moderation-by-design**（防御をシステム設計自体に織り込む）を
  // 推奨することを示している。検知した瞬間からシステム自身が攻撃メッセージを
  // 自動隔離することで、人間は事後にまとめてレビューできる。
  //
  // ガバナンス上の制約（arXiv:2607.12149 と整合。R-24から継続）:
  //   - 自動で **拒否（削除）はしない**。保留（人間レビュー行き）に留める
  //   - モデレーターがいつでも手動解除できる（deactivateDefense）
  //   - 隔離理由（trigger）を記録し監査可能にする
  // ─────────────────────────────────────────
  isUnderDefense(platform, channelId) {
    const state = this.alertState.get(this._key(platform, channelId));
    return Boolean(state?.defenseUntil && Date.now() < state.defenseUntil);
  }

  getDefenseStatus(platform, channelId) {
    const key = this._key(platform, channelId);
    const state = this.alertState.get(key);
    const active = this.isUnderDefense(platform, channelId);
    return {
      platform,
      channelId,
      active,
      activatedAt: active ? new Date(state.defenseStartedAt).toISOString() : null,
      expiresAt: active ? new Date(state.defenseUntil).toISOString() : null,
      quarantinedClusters: active ? [...(state.defenseClusters || [])].length : 0,
      timestamp: new Date().toISOString()
    };
  }

  // モデレーターによる手動解除（人間のオーバーライドを必ず用意する）
  deactivateDefense(platform, channelId) {
    const key = this._key(platform, channelId);
    const state = this.alertState.get(key);
    if (!state) return { deactivated: false, reason: 'no_state' };
    const wasActive = this.isUnderDefense(platform, channelId);
    state.defenseUntil = 0;
    state.defenseClusters = new Set();
    // 人間の判断を機械が即座に上書きしないよう、一定時間は自動再起動を抑止する。
    // 検知とアラート自体は継続する（モデレーターには知らせ続ける）
    state.defenseSuppressedUntil = Date.now() + DEFENSE_SUPPRESS_MS;
    this.alertState.set(key, state);
    logger.info('[RaidDetector] Defense mode manually deactivated', {
      platform, channelId, wasActive, suppressedForMs: DEFENSE_SUPPRESS_MS
    });
    return { deactivated: true, wasActive, suppressedUntil: new Date(state.defenseSuppressedUntil).toISOString() };
  }

  /**
   * 防御モード中に、このメッセージを隔離すべきかを判定する。
   * 判定根拠(trigger)も返して監査可能にする。
   *  - 'cluster'    : レイドを構成した類似内容と一致
   *  - 'first_seen' : レイド開始後に初めて現れたアカウント（使い捨てアカウント対策）
   */
  shouldQuarantine(platform, channelId, userId, content) {
    if (!this.isUnderDefense(platform, channelId)) {
      return { quarantine: false, trigger: null };
    }
    const key = this._key(platform, channelId);
    const state = this.alertState.get(key);

    const normalized = normalizeForSimilarity(content);
    if (normalized && state.defenseClusters?.has(normalized)) {
      return { quarantine: true, trigger: 'cluster' };
    }

    // 防御開始以降に初めて観測されたユーザーか（既知の常連は巻き込まない）
    const firstSeenAt = this.seenUsers.get(key)?.get(userId);
    if (firstSeenAt === undefined || firstSeenAt >= state.defenseStartedAt) {
      return { quarantine: true, trigger: 'first_seen' };
    }

    return { quarantine: false, trigger: null };
  }

  /**
   * 記録直後に呼ぶ。レイド状態へ **遷移した瞬間だけ** アラートを返す。
   *
   * ライブ配信のレイドは短時間で大量に押し寄せるため、モデレーターが
   * ポーリングして気づくのでは遅い（研究が指摘する「リアルタイム性」の要件）。
   * 一方、毎メッセージで通知すると通知自体が洪水になるので:
   *  - 解析は CHECK_MIN_INTERVAL_MS 間隔に間引く
   *  - 通知は「非レイド→レイド」の遷移時のみ、かつ ALERT_COOLDOWN_MS のクールダウン付き
   * アラート不要なら null を返す。
   */
  checkForAlert(platform, channelId) {
    const key = this._key(platform, channelId);
    const now = Date.now();
    const state = this.alertState.get(key) || { lastAlertAt: 0, lastCheckAt: 0, inRaid: false };

    if (now - state.lastCheckAt < CHECK_MIN_INTERVAL_MS) {
      return null; // 解析の間引き
    }
    state.lastCheckAt = now;

    const result = this.analyze(platform, channelId);
    const wasInRaid = state.inRaid;
    state.inRaid = result.raidDetected;

    // R-25: レイド検知中は、防御対象の類似内容クラスタを更新し続ける。
    // 攻撃文面が途中で変わっても追随できるようにするため、遷移時だけでなく
    // 継続中も集合へ追加する（防御ウィンドウ自体は遷移時に開始する）
    const suppressed = state.defenseSuppressedUntil && now < state.defenseSuppressedUntil;
    if (result.raidDetected && !suppressed) {
      if (!state.defenseUntil || now >= state.defenseUntil) {
        state.defenseStartedAt = now;
        state.defenseClusters = new Set();
        logger.warn('[RaidDetector] Defense mode activated (auto-quarantine)', {
          platform, channelId, durationMs: DEFENSE_DURATION_MS, score: result.score
        });
      }
      state.defenseUntil = now + DEFENSE_DURATION_MS;
      result.similarClusters.forEach((c) => state.defenseClusters.add(c.content));
    }

    // 遷移時のみ、かつクールダウンを過ぎている場合だけ通知する
    const isNewRaid = result.raidDetected && !wasInRaid;
    const cooledDown = now - state.lastAlertAt >= ALERT_COOLDOWN_MS;
    this.alertState.set(key, state);

    if (isNewRaid && cooledDown) {
      state.lastAlertAt = now;
      this.alertState.set(key, state);
      return {
        ...result,
        defense: {
          activated: true,
          expiresAt: new Date(state.defenseUntil).toISOString()
        }
      };
    }
    return null;
  }

  record(platform, channelId, userId, content, timestamp = new Date()) {
    const key = this._key(platform, channelId);
    if (!this.records.has(key)) {
      this.records.set(key, []);
      this.seenUsers.set(key, new Map());
    }

    const list = this.records.get(key);
    const seen = this.seenUsers.get(key);
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

    list.push({
      userId,
      normalized: normalizeForSimilarity(content),
      timestamp: ts,
      isFirstSeen: !seen.has(userId)
    });
    // R-25: 初出時刻を保持する（防御モード開始後に現れたアカウントの判定に使う）
    if (!seen.has(userId)) {
      seen.set(userId, ts.getTime());
    }

    if (list.length > MAX_ENTRIES_PER_CHANNEL) {
      list.splice(0, list.length - MAX_ENTRIES_PER_CHANNEL);
    }
  }

  /**
   * 直近ウィンドウを解析し、協調攻撃の可能性を返す。
   * 返り値の score は 0–1（高いほどレイドの疑いが強い）。
   */
  analyze(platform, channelId) {
    const key = this._key(platform, channelId);
    const list = this.records.get(key) ?? [];
    const cutoff = Date.now() - WINDOW_MS;
    const recent = list.filter((r) => r.timestamp.getTime() >= cutoff);

    if (recent.length < MIN_MESSAGES_FOR_ANALYSIS) {
      return this._emptyResult(platform, channelId, recent.length);
    }

    // ── シグナル1: 類似内容クラスタ（異なるユーザーによる同一/類似投稿） ──
    const byContent = new Map(); // normalized → Set(userId)
    recent.forEach((r) => {
      if (!r.normalized) return;
      if (!byContent.has(r.normalized)) byContent.set(r.normalized, new Set());
      byContent.get(r.normalized).add(r.userId);
    });

    const clusters = [...byContent.entries()]
      .map(([content, users]) => ({ content, userCount: users.size }))
      .filter((c) => c.userCount >= SIMILAR_CLUSTER_MIN_USERS)
      .sort((a, b) => b.userCount - a.userCount);

    const distinctUsers = new Set(recent.map((r) => r.userId)).size;
    // クラスタに参加しているユーザーの割合（同時多発性の強さ）
    const clusteredUsers = clusters.reduce((sum, c) => sum + c.userCount, 0);
    const clusterRatio = distinctUsers > 0 ? Math.min(1, clusteredUsers / distinctUsers) : 0;

    // ── シグナル2: 流量スパイク ──
    const rateRatio = Math.min(1, recent.length / RATE_SPIKE_THRESHOLD);

    // ── シグナル3: 初出ユーザー比率 ──
    const firstSeenCount = recent.filter((r) => r.isFirstSeen).length;
    const firstSeenRatio = recent.length > 0 ? firstSeenCount / recent.length : 0;

    // 合成スコア: 研究が挙げる中心シグナル（複数アカウントの同時類似投稿）を最重視
    const score = Math.min(1,
      clusterRatio * 0.6 +
      rateRatio * 0.2 +
      firstSeenRatio * 0.2);

    const raidDetected = score >= RAID_SCORE_THRESHOLD && clusters.length > 0;

    if (raidDetected) {
      logger.warn('[RaidDetector] Possible coordinated attack detected', {
        platform, channelId, score: Math.round(score * 100) / 100,
        distinctUsers, topCluster: clusters[0]?.userCount
      });
    }

    return {
      platform,
      channelId,
      raidDetected,
      score: Math.round(score * 100) / 100,
      windowSeconds: WINDOW_MS / 1000,
      messageCount: recent.length,
      distinctUsers,
      firstSeenRatio: Math.round(firstSeenRatio * 100) / 100,
      similarClusters: clusters.slice(0, 5),
      signals: {
        clusterRatio: Math.round(clusterRatio * 100) / 100,
        rateRatio: Math.round(rateRatio * 100) / 100,
        firstSeenRatio: Math.round(firstSeenRatio * 100) / 100
      },
      recommendation: this._recommendation(raidDetected, score),
      timestamp: new Date().toISOString()
    };
  }

  _recommendation(raidDetected, score) {
    if (!raidDetected) {
      return score >= 0.4
        ? '通常より同時多発的な投稿が見られます。監視を継続してください'
        : '協調攻撃の兆候はありません';
    }
    return '協調攻撃（レイド）の疑いがあります。スローモード/フォロワー限定モードの有効化と、'
      + '該当クラスタのユーザーへの一括対応を検討してください';
  }

  _emptyResult(platform, channelId, messageCount) {
    return {
      platform,
      channelId,
      raidDetected: false,
      score: 0,
      windowSeconds: WINDOW_MS / 1000,
      messageCount,
      distinctUsers: 0,
      firstSeenRatio: 0,
      similarClusters: [],
      signals: { clusterRatio: 0, rateRatio: 0, firstSeenRatio: 0 },
      recommendation: '解析に十分なメッセージがありません',
      timestamp: new Date().toISOString()
    };
  }

  _key(platform, channelId) {
    return `${platform}:${channelId ?? 'default'}`;
  }
}

module.exports = new RaidDetector();
module.exports.RaidDetector = RaidDetector;
module.exports.normalizeForSimilarity = normalizeForSimilarity;
