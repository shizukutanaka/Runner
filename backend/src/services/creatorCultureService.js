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
const db = require('../db');

// DBアクセスの薄いPromiseラッパー（他サービスと同じ規約）
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function runCallback(err) {
    if (err) reject(err); else resolve(this);
  });
});

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
    flags: ['no_profanity', 'no_violence', 'no_adult']
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
    flags: ['no_misinformation', 'topical_only']
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
    flags: []
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
    flags: ['allow_trash_talk']
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
    flags: ['adult_verified']
  }
};

const DEFAULT_CULTURE = 'entertainment';

// ─── サービス本体 ────────────────────────────────────────
class CreatorCultureService {
  constructor() {
    // channelKey → { cultureType, customOverrides, updatedAt }
    // in-memoryのMapは読み取りの高速な真実の源。起動時にDBから復元し、
    // setProfile時にDBへも永続化する（従来は再起動で全プロファイルが消えていた — R-3'/短所#3）
    this.profiles = new Map();
    this._loaded = this._loadFromDb();
  }

  // 起動時にDBから全プロファイルをMapへ復元する（ベストエフォート）。
  // テスト環境などでテーブルがまだ無い場合も、警告のみで通常動作を継続する
  async _loadFromDb() {
    try {
      const rows = await dbAll('SELECT channel_key, culture_type, custom_overrides, updated_at FROM culture_profiles');
      rows.forEach((row) => {
        let overrides = {};
        try { overrides = row.custom_overrides ? JSON.parse(row.custom_overrides) : {}; } catch { overrides = {}; }
        this.profiles.set(row.channel_key, {
          cultureType: row.culture_type,
          customOverrides: overrides,
          updatedAt: row.updated_at
        });
      });
      if (rows.length > 0) {
        logger.info(`[CreatorCulture] Restored ${rows.length} culture profile(s) from DB`);
      }
    } catch (err) {
      logger.warn('[CreatorCulture] Could not load culture profiles from DB (starting empty)', { error: err.message });
    }
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
        description: p.description
      }))
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
    const updatedAt = new Date().toISOString();
    this.profiles.set(key, {
      cultureType,
      customOverrides,
      updatedAt
    });

    // DBへ永続化（UPSERT）。読み取りはin-memory Mapが担うため、書き込みは
    // ベストエフォート（fire-and-forget）。失敗してもプロセス内の動作は継続する
    dbRun(
      `INSERT INTO culture_profiles (channel_key, culture_type, custom_overrides, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_key) DO UPDATE SET
         culture_type = excluded.culture_type,
         custom_overrides = excluded.custom_overrides,
         updated_at = excluded.updated_at`,
      [key, cultureType, JSON.stringify(customOverrides || {}), updatedAt]
    ).catch((err) => {
      logger.warn('[CreatorCulture] Failed to persist culture profile to DB', { key, error: err.message });
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
          : 'review'
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
  // Policy-as-Prompt（R-4/R-24）
  //
  // 文化プロファイルを LLM へ渡す自然言語ポリシー文へ変換する。
  // Palla et al., "Policy-as-Prompt: Rethinking Content Moderation in the Age
  // of LLMs" (FAccT 2025, arXiv:2502.18695) は、抽象的なポリシーを
  // アノテーションガイドラインやデータセットへ「操作化」する従来工程を、
  // ポリシーを直接プロンプトとして与える形へ置き換えられると論じている。
  // 本製品の文化プロファイル（5プリセット＋個別上書き）は、その入力として
  // そのまま使える構造を既に持っている。
  //
  // ただし Neumann et al., "It is not enough to give your moderation rules to
  // ChatGPT" (MuC 2026 Workshop, arXiv:2607.12149) は、**プロンプトを書くだけでは
  // コミュニティガバナンスとして不十分**であり、基盤モデル側のプロンプト階層
  // （prompt stack）が下流の指示より優先されるため、運営者のルールが必ずしも
  // 効くとは限らないと指摘している。したがって本実装では:
  //   - LLMの判定は **助言（advisory）** であり、決定論的なNGワード判定を上書きしない
  //   - どのポリシー（cultureType）で判定したかを必ず結果に含め、監査可能にする
  //   - 自動処罰には使わず、曖昧なものは人間のレビュー（保留キュー）へ回す
  // という制約を設ける。詳細は RESEARCH_IMPROVEMENTS R-24
  // ─────────────────────────────────────────
  buildPolicyPrompt(platform, channelId) {
    const profile = this.getProfile(platform, channelId);

    const aggressionGuidance = profile.allowedAggression >= 0.5
      ? '競技的な煽り・軽口・強い言葉は、この配信の文化の一部として広く許容される。相手個人の尊厳を否定する攻撃のみ問題とする。'
      : profile.allowedAggression >= 0.3
        ? '多少の強い言葉は許容するが、特定個人への繰り返しの攻撃は問題とする。'
        : '攻撃的な表現はほとんど許容されない。穏やかでない言い回しも問題として扱う。';

    const flagGuidance = {
      no_profanity: '下品・卑猥な言葉遣いを禁止する。',
      no_violence: '暴力的な描写・示唆を禁止する。',
      no_adult: '性的・成人向けの話題を禁止する。',
      no_misinformation: '事実に反する主張・誤情報の拡散を問題とする。',
      topical_only: '配信の主題から大きく外れた投稿を問題とする。',
      allow_trash_talk: 'ゲーム内の煽り合い・挑発は文化として許容する。',
      adult_verified: '視聴者は成人であり、成人向けの話題自体は許容される。'
    };
    const flagLines = (profile.flags || [])
      .map((f) => flagGuidance[f])
      .filter(Boolean);

    const policy = [
      '# このチャンネルのモデレーション方針',
      '',
      `チャンネル種別: ${profile.label}（${profile.description}）`,
      '',
      '## 判断基準',
      `- ${aggressionGuidance}`,
      ...flagLines.map((l) => `- ${l}`),
      '- 誹謗中傷・脅迫・個人情報の晒し・執拗な付きまといは、表現が遠回しでも問題として扱う。',
      '- 単に否定的な感想や批判であることは、それだけでは問題としない。'
    ].join('\n');

    return {
      cultureType: profile.cultureType,
      policy,
      // 判定のしきい値（LLMの出力スコアを製品側で解釈するために渡す）
      thresholds: {
        autoRejectScore: profile.autoRejectScore,
        autoApproveScore: profile.autoApproveScore
      }
    };
  }

  // ─────────────────────────────────────────
  // 全プリセット一覧
  // ─────────────────────────────────────────
  listPresets() {
    return Object.entries(CULTURE_PRESETS).map(([id, p]) => ({
      id,
      label:       p.label,
      description: p.description,
      strictness:  this._strictnessLevel(p.toxicityMultiplier)
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
