/**
 * Emotional Contagion Detector（感情伝播検知エンジン）
 *
 * 【ソクラテス式問答から生まれた視点】
 * Q: 「なぜ有害コメントは連鎖するのか？」
 * A: 「悪意あるユーザーが複数いるから」
 * Q: 「本当にそうか？ 1人の怒りが他の人に伝播しているのでは？」
 * → 発見: コメントの"雰囲気"はウイルスのように伝播する（Emotional Contagion）
 *
 * 従来のアプローチ: 個別コメントを1件ずつ判定 → 炎上後に削除
 * 新アプローチ: コメントの"流れ"を監視 → 炎上"前に"介入
 *
 * 実装: 直近N件のコメントから感情勾配（sentiment gradient）を計算し、
 * 急激なネガティブ化を「炎上リスク」として早期検知
 */

const logger = require('../logger');

// 分析ウィンドウ設定
const WINDOW_SIZE      = 20;   // 直近20件を分析対象
const RISK_THRESHOLD   = 0.65; // 炎上リスクスコアの閾値
const VELOCITY_WINDOW  = 60;   // 1分間の感情速度を計算
const MAX_HISTORY      = 500;  // 保持する最大コメント数

// ─── 循環バッファ（メモリ効率化） ──────────────────────────
class CircularBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = [];
    this.head = 0;
  }

  add(item) {
    if (this.buffer.length < this.size) {
      this.buffer.push(item);
    } else {
      this.buffer[this.head] = item;
      this.head = (this.head + 1) % this.size;
    }
  }

  toArray() {
    if (this.buffer.length < this.size) {
      return [...this.buffer];
    }
    // head以降 + head以前の順で返す（時系列順）
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  length() {
    return this.buffer.length;
  }
}

class EmotionalContagionDetector {
  constructor() {
    // プラットフォーム × チャンネルごとの履歴（CircularBuffer使用）
    this.history   = new Map(); // key: `${platform}:${channelId}` → CircularBuffer
    this.listeners = new Map(); // イベントリスナー
  }

  // ─────────────────────────────────────────
  // コメントを受信して状態を更新
  // ─────────────────────────────────────────
  ingest(comment) {
    const key = this._key(comment.platform, comment.channelId);
    if (!this.history.has(key)) {
      this.history.set(key, new CircularBuffer(MAX_HISTORY));
    }

    const buffer = this.history.get(key);
    buffer.add({
      id:        comment.id,
      content:   comment.content,
      sentiment: comment.sentimentScore ?? 0.5, // 0=最もネガティブ、1=最もポジティブ
      toxicity:  comment.toxicityScore  ?? 0,
      timestamp: comment.timestamp ? new Date(comment.timestamp) : new Date(),
      userId:    comment.user
    });

    // 炎上リスクを再計算
    return this.evaluate(comment.platform, comment.channelId);
  }

  // ─────────────────────────────────────────
  // 炎上リスク評価（コアロジック）
  // ─────────────────────────────────────────
  evaluate(platform, channelId) {
    const key    = this._key(platform, channelId);
    const buffer = this.history.get(key);

    if (!buffer || buffer.length() < 3) {
      return this._safeResult();
    }

    const window = buffer.toArray();
    const recent = window.slice(-WINDOW_SIZE);

    // 1. 平均センチメント（低いほど危険）
    const avgSentiment = this._mean(recent.map(c => c.sentiment));

    // 2. 感情勾配（急激な低下が危険）
    const gradient = this._sentimentGradient(recent);

    // 3. 毒性スパイク（短時間に毒性コメントが集中）
    const toxicitySpike = this._toxicitySpike(window);

    // 4. 感情速度（単位時間あたりのセンチメント変化量）
    const velocity = this._emotionalVelocity(window);

    // 5. 同一ユーザーによる連続ネガティブ（個人の煽り）
    const agitatorScore = this._detectAgitator(recent);

    // ─ 加重合成スコア ─
    const riskScore = (
      (1 - avgSentiment)    * 0.25 +  // 現在の雰囲気
      Math.max(0, -gradient) * 0.30 +  // 悪化速度（最重視）
      toxicitySpike          * 0.20 +  // 毒性集中度
      Math.min(1, Math.abs(velocity)) * 0.15 + // 急変動
      agitatorScore          * 0.10    // 煽り検出
    );

    const level = this._riskLevel(riskScore);
    const result = {
      platform,
      channelId,
      riskScore:       Math.round(riskScore * 100) / 100,
      level,           // 'safe' | 'watch' | 'warning' | 'critical'
      signals: {
        avgSentiment:  Math.round(avgSentiment  * 100) / 100,
        gradient:      Math.round(gradient       * 1000) / 1000,
        toxicitySpike: Math.round(toxicitySpike  * 100) / 100,
        velocity:      Math.round(velocity        * 100) / 100,
        agitatorScore: Math.round(agitatorScore   * 100) / 100,
      },
      recommendation: this._recommend(level, riskScore),
      sampleSize:     recent.length,
      timestamp:      new Date().toISOString()
    };

    // 警戒ラインを超えたらイベント発火
    if (riskScore >= RISK_THRESHOLD) {
      this._emit('risk', result);
    }

    return result;
  }

  // ─────────────────────────────────────────
  // チャンネルの全体健全性サマリー
  // ─────────────────────────────────────────
  getHealthSummary(platform, channelId) {
    const key    = this._key(platform, channelId);
    const buffer = this.history.get(key);
    if (!buffer || buffer.length() === 0) return null;

    const window = buffer.toArray();
    const sentiments = window.map(c => c.sentiment);
    const now        = new Date();
    const oneMin     = 60 * 1000;
    const recentMin  = window.filter(c => (now - c.timestamp) < oneMin);

    return {
      totalComments:     window.length,
      commentsPerMinute: recentMin.length,
      avgSentiment:      Math.round(this._mean(sentiments) * 100) / 100,
      trend:             this._sentimentGradient(window.slice(-20)) > 0 ? 'improving' : 'declining',
      toxicCount:        window.filter(c => c.toxicity > 0.5).length,
      toxicRate:         Math.round((window.filter(c => c.toxicity > 0.5).length / window.length) * 100),
      currentRisk:       this.evaluate(platform, channelId)
    };
  }

  // ─────────────────────────────────────────
  // イベントシステム
  // ─────────────────────────────────────────
  on(event, fn)  { (this.listeners.get(event) ?? this.listeners.set(event, []).get(event)).push(fn); }
  off(event, fn) { const list = this.listeners.get(event); if (list) this.listeners.set(event, list.filter(f => f !== fn)); }
  _emit(event, data) { (this.listeners.get(event) ?? []).forEach(fn => { try { fn(data); } catch(e) { logger.error('[ECD] Listener error:', e); } }); }

  // ─────────────────────────────────────────
  // 内部計算メソッド
  // ─────────────────────────────────────────

  // 平均値
  _mean(arr) {
    return arr.length === 0 ? 0.5 : arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // 感情勾配（線形回帰の傾き）
  // 正 = 改善中、負 = 悪化中
  _sentimentGradient(comments) {
    if (comments.length < 2) return 0;
    const n  = comments.length;
    const xs = comments.map((_, i) => i);
    const ys = comments.map(c => c.sentiment);
    const xm = this._mean(xs);
    const ym = this._mean(ys);
    const num = xs.reduce((sum, x, i) => sum + (x - xm) * (ys[i] - ym), 0);
    const den = xs.reduce((sum, x)    => sum + (x - xm) ** 2,            0);
    return den === 0 ? 0 : num / den;
  }

  // 毒性スパイク（短時間の毒性コメント集中度）
  _toxicitySpike(allComments) {
    const now     = new Date();
    const oneMin  = 60 * 1000;
    const recent  = allComments.filter(c => (now - c.timestamp) < oneMin);
    if (recent.length === 0) return 0;
    const toxic   = recent.filter(c => c.toxicity > 0.5);
    return toxic.length / Math.max(recent.length, 1);
  }

  // 感情速度（単位時間あたりのセンチメント変化）
  _emotionalVelocity(allComments) {
    if (allComments.length < 6) return 0;
    const now       = new Date();
    const oneMin    = 60 * 1000;
    const recent    = allComments.filter(c => (now - c.timestamp) < oneMin);
    const older     = allComments.filter(c => {
      const age = now - c.timestamp;
      return age >= oneMin && age < 2 * oneMin;
    });
    if (recent.length === 0 || older.length === 0) return 0;
    return this._mean(recent.map(c => c.sentiment)) - this._mean(older.map(c => c.sentiment));
  }

  // 煽りユーザー検出（直近で同一ユーザーがネガティブを連投）
  _detectAgitator(recent) {
    const userNegCount = {};
    for (const c of recent) {
      if (c.sentiment < 0.35) {
        userNegCount[c.userId] = (userNegCount[c.userId] ?? 0) + 1;
      }
    }
    const maxRepeat = Math.max(0, ...Object.values(userNegCount));
    return Math.min(1, maxRepeat / 5); // 5連投で最大スコア
  }

  _riskLevel(score) {
    if (score < 0.30) return 'safe';
    if (score < 0.50) return 'watch';
    if (score < 0.65) return 'warning';
    return 'critical';
  }

  _recommend(level, score) {
    const actions = {
      safe:     'コミュニティは健全です。通常の監視を継続してください。',
      watch:    '若干の緊張が見られます。コメントの流れに注意してください。',
      warning:  '雰囲気が悪化しています。モデレーターが状況を確認し、必要に応じてスローモードを検討してください。',
      critical: '炎上リスクが高い状態です。即座に介入を推奨します：スローモードの有効化、または一時的なコメント制限を検討してください。'
    };
    return actions[level];
  }

  _safeResult() {
    return { riskScore: 0, level: 'safe', signals: {}, recommendation: 'データ収集中です。', sampleSize: 0 };
  }

  _key(platform, channelId) {
    return `${platform}:${channelId ?? 'default'}`;
  }
}

// シングルトンインスタンスをエクスポート
const detector = new EmotionalContagionDetector();

module.exports = detector;
module.exports.EmotionalContagionDetector = EmotionalContagionDetector;
