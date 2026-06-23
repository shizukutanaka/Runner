/**
 * Creator Culture Service（クリエイター文化プロファイル）
 *
 * 【ソクラテス式問答から生まれた視点】
 * Q: 「誰がコミュニティの"毒性"基準を決めるべきか？」
 * A: 「AIやプラットフォーム」
 * Q: 「ゲーム実況の煽り合いと子ども向け教育チャンネルを同じ基準で判定するのは正しいか？」
 * Q: 「クリエイター自身が自分のコミュニティ文化を定義できるなら、それが最も正確では？」
 *
 * 従来: プラットフォーム全体に単一の閾値
 * 新視点: チャンネルごとの"文化プロファイル"が許容度を調整する
 *
 * 応用例:
 *  - ゲーム実況 → 煽り・対抗心は文化の一部（高い許容度）
 *  - 教育チャンネル → 誤情報・脱線は有害（低い許容度）
 *  - 家族向け → 成人コンテンツは厳格にゼロ許容
 */

const logger = require('../logger');

// ─── 文化プリセット定義 ───────────────────────────────────
// 各値は moderationScore（0-100）に対する調整係数
const CULTURE_PRESETS = {
  family: {
    label: '家族向け',
    description: '子ども・家族向けコンテンツ。最も厳格な基準',
    // 許容度は最低。わずかな毒性も増幅して判定
    toxicityMultiplier: 1.5,   // 毒性スコアを1.5倍に感じる
    sentimentThreshold: 0.55,  // ポジティブ率の下限（高め）
    autoRejectScore:   40,     // このスコア以上で自動拒否
    autoApproveScore:  20,     // このスコア以下で自動承認
    bannedPatternBoost: 2.0,   // 禁止ワードへのペナルティ倍率
    allowedAggression: 0.1,    // 攻撃的表現の許容度（0=ゼロ）
    flags: ['no_profanity', 'no_violence', 'no_adult'],
  },
  educational: {
    label: '教育・解説',
    description: '学習コンテンツ。誤情報・脱線を重視',
    toxicityMultiplier: 1.3,
    sentimentThreshold: 0.45,
    autoRejectScore:   50,
    autoApproveScore:  25,
    bannedPatternBoost: 1.5,
    allowedAggression: 0.2,
    flags: ['no_misinformation', 'topical_only'],
  },
  entertainment: {
    label: 'エンタメ・雑談',
    description: '一般的なエンタメ・雑談。標準的な基準',
    toxicityMultiplier: 1.0,
    sentimentThreshold: 0.40,
    autoRejectScore:   60,
    autoApproveScore:  30,
    bannedPatternBoost: 1.0,
    allowedAggression: 0.35,
    flags: [],
  },
  gaming: {
    label: 'ゲーム実況',
    description: '競技性・煽り合いが文化の一部。適度に許容',
    toxicityMultiplier: 0.75,  // 毒性スコアを0.75倍に緩和
    sentimentThreshold: 0.30,
    autoRejectScore:   70,
    autoApproveScore:  35,
    bannedPatternBoost: 0.8,
    allowedAggression: 0.60,   // 煽り合いは文化的に許容
    flags: ['allow_trash_talk'],
  },
  mature: {
    label: '成人向け（要年齢確認）',
    description: '成人対象のコンテンツ。暴力・ヘイトのみ制限',
    toxicityMultiplier: 0.6,
    sentimentThreshold: 0.25,
    autoRejectScore:   80,
    autoApproveScore:  40,
    bannedPatternBoost: 0.7,
    allowedAggression: 0.70,
    flags: ['adult_verified'],
  },
};

const DEFAULT_CULTURE = 'entertainment';

// ─── サービス本体 ────────────────────────────────────────
class CreatorCultureService {
  constructor() {
    // channelKey → { cultureType, customOverrides, updatedAt }
    this.profiles = new Map();
  }

  // ─────────────────────────────────────────
  // プロファイル取得
  // ─────────────────────────────────────────
  getProfile(platform, channelId) {
    const key  = this._key(platform, channelId);
    const stored = this.profiles.get(key);

    const cultureType = stored?.cultureType ?? DEFAULT_CULTURE;
    const preset      = CULTURE_PRESETS[cultureType] ?? CULTURE_PRESETS[DEFAULT_CULTURE];
    const overrides   = stored?.customOverrides ?? {};

    return {
      platform,
      channelId,
      cultureType,
      ...preset,
      ...overrides,          // カスタム上書き（個別チューニング）
      isCustomized: Object.keys(overrides).length > 0,
      updatedAt: stored?.updatedAt ?? null,
      availablePresets: Object.entries(CULTURE_PRESETS).map(([id, p]) => ({
        id,
        label: p.label,
        description: p.description,
      })),
    };
  }

  // ─────────────────────────────────────────
  // プロファイル設定
  // ─────────────────────────────────────────
  setProfile(platform, channelId, cultureType, customOverrides = {}) {
    if (!CULTURE_PRESETS[cultureType]) {
      throw new Error(`Unknown culture type: ${cultureType}. Use one of: ${Object.keys(CULTURE_PRESETS).join(', ')}`);
    }

    const key = this._key(platform, channelId);
    this.profiles.set(key, {
      cultureType,
      customOverrides,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`[CreatorCulture] Profile set: ${key} → ${cultureType}`, {
      customKeys: Object.keys(customOverrides)
    });

    return this.getProfile(platform, channelId);
  }

  // ─────────────────────────────────────────
  // モデレーションスコアをプロファイルに基づいて調整
  //
  // rawScore: 0–100（高いほど有害）
  // 返り値: 調整後スコア（0–100）
  // ─────────────────────────────────────────
  adjustScore(platform, channelId, rawScore, context = {}) {
    if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) {
      throw new Error(`adjustScore: expected finite number, got ${typeof rawScore} (${rawScore})`);
    }
    if (rawScore < 0 || rawScore > 100) {
      throw new Error(`adjustScore: rawScore ${rawScore} out of bounds (expected 0–100)`);
    }

    const profile = this.getProfile(platform, channelId);

    // 毒性スコア調整
    let adjusted = rawScore * profile.toxicityMultiplier;

    // 禁止ワードヒットがある場合の倍率
    if (context.bannedWordHit) {
      adjusted *= profile.bannedPatternBoost;
    }

    // 攻撃性がチャンネルの許容度以内なら軽減
    if (context.aggressionScore != null) {
      const excess = Math.max(0, context.aggressionScore - profile.allowedAggression);
      adjusted += excess * 20; // 許容度超過分をペナルティ
    }

    const score = Math.round(Math.min(100, Math.max(0, adjusted)));

    return {
      raw:        rawScore,
      adjusted:   score,
      culture:    profile.cultureType,
      multiplier: profile.toxicityMultiplier,
      verdict:    score >= profile.autoRejectScore ? 'reject'
                : score <= profile.autoApproveScore ? 'approve'
                : 'review',
    };
  }

  // ─────────────────────────────────────────
  // センチメント許容判定
  // ─────────────────────────────────────────
  isSentimentAcceptable(platform, channelId, sentimentScore) {
    const profile = this.getProfile(platform, channelId);
    return sentimentScore >= profile.sentimentThreshold;
  }

  // ─────────────────────────────────────────
  // 全プリセット一覧
  // ─────────────────────────────────────────
  listPresets() {
    return Object.entries(CULTURE_PRESETS).map(([id, p]) => ({
      id,
      label:       p.label,
      description: p.description,
      strictness:  this._strictnessLevel(p.toxicityMultiplier),
    }));
  }

  // ─── ヘルパー ─────────────────────────────
  _key(platform, channelId) {
    return `${platform}:${channelId ?? 'default'}`;
  }

  _strictnessLevel(multiplier) {
    if (multiplier >= 1.5) return '非常に厳格';
    if (multiplier >= 1.2) return '厳格';
    if (multiplier >= 0.9) return '標準';
    if (multiplier >= 0.7) return '緩め';
    return '非常に緩め';
  }
}

module.exports = new CreatorCultureService();
module.exports.CreatorCultureService = CreatorCultureService;
module.exports.CULTURE_PRESETS = CULTURE_PRESETS;
