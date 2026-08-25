// AIモデレーションサービスの雛形
// OpenAI APIやローカルMLと連携し、コメント内容を分析

const config = require('../config');
const logger = require('../logger');
const removeConfusables = require('confusables').default;

let openaiWarningIssued = false;

// NGワード回避対策（R-11）: leetspeak/同形異字(homoglyph)/全角文字/ゼロ幅文字による
// フィルタ回避が2024-2026の研究で広く報告されている（例: 全角"ｆｕｃｋ"、
// キリル文字のｋに見えるκ等での置換、単語内へのゼロ幅スペース挿入）。
// ゼロ幅文字除去+NFKC正規化は日英どちらのテキストにも安全に適用できるため
// 常時適用する。confusables.remove()（英字のホモグリフをASCIIへ寄せるライブラリ）は
// 日本語の仮名を誤って英字に変換してしまうケースがある（実測: "こんにちは"→"こhにちは"）
// ため、主判定文字列の置き換えには使わず、あくまで追加の照合候補として
// OR条件でのみ使う（誤爆しても主判定には影響しない設計）
// U+200B ZERO WIDTH SPACE, U+200C ZWNJ, U+200D ZWJ, U+2060 WORD JOINER, U+FEFF BOM/ZWNBSP
// eslint-disable-next-line no-misleading-character-class -- 意図的にZWJ等のゼロ幅文字を個別に除去する
const ZERO_WIDTH_CHARS_REGEX = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const stripZeroWidthChars = (text) => text.replace(ZERO_WIDTH_CHARS_REGEX, '');
const normalizeForMatching = (text) => stripZeroWidthChars(text).normalize('NFKC');

// NGワードリスト（R-5a）: 旧実装は ['badword','spamword'] というプレースホルダで
// キーワードモデレーションが実質無効だった。src/data/ng-words.json（ja/en・カテゴリ別）
// から起動時に読み込む。読めない場合は空リストで警告し、他の分析は通常どおり動作させる
// R-14: どのカテゴリ（abuse/threat/spam）でヒットしたかを保持する。構造化された
// フラグ理由の提示はモデレーターの判断を約7.4%高速化するという研究（arXiv:2406.04106）に
// もとづき、単なる語のリスト（flaggedWords）に加えてカテゴリ（flaggedCategories）も返す
let NG_WORDS = [];
const NG_WORD_CATEGORY = new Map(); // 小文字化した語 → カテゴリ名
try {
  const ngWordData = require('../data/ng-words.json');
  Object.entries(ngWordData.categories || {}).forEach(([category, langs]) => {
    [...(langs.ja || []), ...(langs.en || [])].forEach((word) => {
      const normalized = word.toLowerCase();
      NG_WORDS.push(normalized);
      // 同じ語が複数カテゴリに現れた場合は最初のカテゴリを優先（実運用では稀）
      if (!NG_WORD_CATEGORY.has(normalized)) {
        NG_WORD_CATEGORY.set(normalized, category);
      }
    });
  });
  logger.info(`[ModerationService] Loaded ${NG_WORDS.length} NG words from ng-words.json (${Object.keys(ngWordData.categories || {}).length} categories)`);
} catch (err) {
  logger.warn('[ModerationService] Failed to load ng-words.json - keyword moderation is disabled', { error: err.message });
}

// R-30: 日本語NGワードの部分一致による誤検知ガード。
// 日本語は語の区切りが無いため `includes()` 照合が別語の内部に噛む。実測した例:
//   「ラスボス倒した！やっと死ねる…完走おめでとう」→ 「死ね」に一致（可能形の「死ねる」）
//   「シネマ」→ 「シネ」に一致
//   「気にしねえよ」→ 「しね」に一致（関東方言の「しない」）
// 語ごとに「直後に来たら不一致とみなす文字」「直前に来たら不一致とみなす文字」を持つ。
// 単純に語を削るのではなく用法で切り分けるのは、「死ねよ」「しね!!」のような
// 実際の暴言は取りこぼしたくないため。
const NG_WORD_MATCH_GUARDS = {
  // 死ねる/死ねれば/死ねます = 可能形。「死ねー！」は暴言なので長音は除外しない
  '死ね': { after: /^[るれま]/ },
  // しねる/しねます に加え、方言の しねえ/しねぇ/しねー、「〜でしね」(ですねの打ち間違い)
  'しね': { after: /^[るれまえぇー]/, before: /で$/ },
  // シネマ（cinema）が最大の誤検知源
  'シネ': { after: /^[ルレママ]/ },
  '氏ね': { after: /^[るれま]/ }
};

// 語 word が haystack に「誤検知ガードを通過した形で」出現するか判定する。
// 出現位置ごとに前後を見て、すべてがガードに掛かった場合のみ不一致とする
const matchesNgWord = (haystack, word) => {
  const guard = NG_WORD_MATCH_GUARDS[word];
  if (!guard) return haystack.includes(word);

  let index = haystack.indexOf(word);
  while (index !== -1) {
    const after = haystack.slice(index + word.length);
    const before = haystack.slice(0, index);
    const suppressed = (guard.after && guard.after.test(after))
      || (guard.before && guard.before.test(before));
    if (!suppressed) return true;
    index = haystack.indexOf(word, index + 1);
  }
  return false;
};

// R-31: つきまとい・監視の示唆パターン（カテゴリは threat 扱い）。
// 語彙単体では無害な言葉の組み合わせで成立するため、NGワードリストでは表現できない。
// いずれも「配信者の現実の所在／移動」と「それを把握しているという主張」が
// 同一文中に揃うことを条件にしており、ゲーム内の話や一般的な世間話には当たらない。
// 判定はあくまで保留（人間のレビュー）に回すためのものであり、自動処罰はしない
const STALKING_PATTERNS = [
  {
    // 「どこにいたか知ってる」「どこ住んでるか知ってる」「昨日どこ行ったか知ってるよ」
    id: 'stalking:knows_whereabouts',
    pattern: /どこ(に|で)?(いた|居た|行った|住んで|勤めて|通って)[^。！!？?]{0,12}(知って|わかって|分かって|把握)/
  },
  {
    // 「家の前にいた」「職場の近くで見た」「学校まで来た」
    id: 'stalking:near_real_location',
    pattern: /(自宅|家|職場|会社|学校|最寄り駅)[^。！!？?]{0,8}(前|近く|まで|付近)[^。！!？?]{0,8}(いた|居た|来た|行った|見た|待って)/
  },
  {
    // 「後をつけた」「尾行した」
    id: 'stalking:followed',
    pattern: /(後|あと)を(つけ|付け)|尾行/
  }
];

// R-33: 語彙に頼らない標的型ハラスメントの検知（カテゴリは abuse 扱い）。
//
// 評価セット(R-5b)の indirect 層は、NG語を一つも含まない攻撃で構成されている:
//   「その顔で配信とか、よく人前に出られるね」   容姿への言及＋公の場に出ることの否定
//   「誰も見てないのに続ける意味あるの？やめたら？」 活動の無価値化＋中止要求
//   「この配信者、前に問題起こしてたって本当ですか？みんな知ってる話で」 未確認の悪評の流布
// 語彙フィルタは構造上これを0%しか拾えない。
//
// R-31（つきまとい）で有効だった設計をそのまま使う: **2つの成分の共起を要求する**。
// 単独では日常語なので、片方だけでは絶対に発火させない。
// 例えば「意味あるの？」だけ、「本当ですか？」だけでは何も起きない。
//
// 判定は保留（人間のレビュー）に回すためのものであり、自動処罰はしない。
const TARGETED_HARASSMENT_PATTERNS = [
  {
    // 容姿・声への言及 × 人前での活動 × 呆れ／非難の標識、の3成分。
    // 実測した誤検知で条件を二度絞っている:
    //   「その顔でよく笑えるねw かわいい」 → 第1成分から「よく」を外した
    //     （活動を表す語が無ければ発火しない）
    //   「その顔で配信とか最高」 → 非難の標識から「とか」を外した
    //     （「とか」は揶揄にも賞賛にも付くので識別力が無い）
    id: 'harassment:appearance_shaming',
    pattern: /(その|そんな)(顔|声|見た目|ツラ|容姿)で[^。！!？?]{0,16}(配信|人前|出られる|出てこられる|歌|喋っ|話し|やってる)/,
    requires: /(よく[^。！!？?]{0,8}(ね|な|わ)|恥ずかし|やめ)/
  },
  {
    // 活動の無価値化 × 中止の要求。両方揃って初めて「やめろ」という攻撃になる。
    // 実測した誤検知で二点絞っている:
    //   「このクエスト意味ないから途中でやめたらいいよ」 → 無価値化の対象を
    //     **配信・活動そのもの**に限定した（ゲーム内の物に付く「意味ない」を除外）
    //   「才能ないから引退しますw」「誰も見てないうちに引退した装備」 →
    //     中止要求から自称・過去形（引退します／引退した）を除外した
    id: 'harassment:worthlessness_and_quit',
    pattern: /(誰も(見て|聞いて|興味|覚えて)(い)?ない|(配信|活動|チャンネル|放送)[^。！!？?]{0,6}(意味|価値)(が)?(ある|ない|無い)|向いてない|才能ない)/,
    requires: /(やめたら|やめれば|やめた方|やめろ|辞めたら|辞めれば|引退)(?!し(ます|た|ようか|たい|ちゃ|よう))/
  },
  {
    // 未確認の悪評 × 伝聞の枠組み。疑問形にすることで responsibility を回避しつつ流布する形。
    // 悪評の主語が**人**であることを必須にする。これが無いと
    // 「問題起こしたキャラの調整、次のパッチで入るらしいです」のような
    // ゲーム内の話題を誤検知する（実測で発生したので条件を足した）
    id: 'harassment:rumor_mongering',
    pattern: /(この|あの|その)?(配信者|人|方|チャンネル|主|中の人|うp主)[^。！!？?]{0,12}(問題(を)?起こ|炎上|前科|逮捕|訴えられ|裏切っ|パクっ|盗作|やらかし)/,
    requires: /(本当ですか|本当\?|本当？|らしいです|って聞いた|みんな知って|噂|デマ)/
  }
];

// R-35: 属性への言及 × 断定的な貶め（属性差別）。
//
// 外部ベンチマークの **dev側だけ**を見て設計した（test側は最後の報告まで見ていない）。
// dev側の見逃しに共通していた構造がこれ:
//   「中国人って素行が悪いからなぁ」「働けよ無職」「士業は路頭に迷え」
// いずれも属性語も貶め語も単独では日常語であり、NGワードでは表現できない。
//
// R-31/R-33 と同じく2成分の共起を要求し、さらに**近接（20文字以内）**も要求する。
// 近接を課さないと「無職の友達が働けって言われてた」のような伝聞まで拾ってしまう。
const ATTRIBUTE_PATTERN = /(中国人|韓国人|朝鮮人|外国人|移民|老人|年寄り|障害者|無職|ニート|生活保護|士業|公務員|養護学校)/;
const DEROGATION_PATTERN = /(素行が悪い|民度が低い|民度低い|劣ってる|劣っている|使えない|消えろ|失せろ|路頭に迷え|働けよ|働け[。！!\s]|税金泥棒|寄生虫|クズばかり|ゴミばかり|しかいない|中退)/;
const ATTRIBUTE_PROXIMITY = 20;

const detectAttributeDerogation = (text) => {
  const a = text.match(ATTRIBUTE_PATTERN);
  const d = text.match(DEROGATION_PATTERN);
  if (!a || !d) return false;
  return Math.abs(a.index - d.index) <= ATTRIBUTE_PROXIMITY;
};

// R-36: 性的ハラスメント（身体への言及 × 性的な要求・評価）。
//
// 配信者への性的ハラスメントは、ライブ配信のモデレーションで最も報告の多い
// 加害のひとつであり（特に女性配信者）、本製品にはこの区分が**そもそも存在しなかった**
// （カテゴリは abuse / threat / spam / discrimination のみだった）。
// 文化プロファイルには `no_adult` / `adult_verified` というフラグが既にあるのに、
// それが働きかける対象が無い状態だった。
//
// 語彙だけでは扱えない部分をここで補う。身体部位も要求語も**単独では日常語**なので、
// R-31/R-33 と同じく2成分の共起を必須にし、さらに近接（20文字以内）も要求する。
// ゲーム配信で普通に出る「このキャラの胸当て強い」「脚が速いキャラ」等に
// 当たらないようにするため。
const BODY_REFERENCE_PATTERN = /(胸|おっぱい|お尻|尻|太もも|谷間|下着|パンツ|裸|素肌)/;
const SEXUAL_DEMAND_PATTERN = /(見せて|見せろ|見たい|触りたい|舐め|しゃぶ|揉み|揉ませ|エロ|えっち|やらしい|興奮|抜ける|抜いた)/;
const SEXUAL_PROXIMITY = 20;

const detectSexualHarassment = (text) => {
  const b = text.match(BODY_REFERENCE_PATTERN);
  const d = text.match(SEXUAL_DEMAND_PATTERN);
  if (!b || !d) return false;
  return Math.abs(b.index - d.index) <= SEXUAL_PROXIMITY;
};

// リンクブロック関連の設定
const LINK_BLOCK_CONFIG = {
  // 完全にブロックするドメイン
  blockedDomains: [
    'spam-site.com',
    'malicious-link.net',
    'scam-domain.org',
    'phishing-site.ru'
  ],
  // 疑わしいドメイン（警告対象）
  suspiciousDomains: [
    'free-gift.com',
    'win-prize.net',
    'cheap-deals.org'
  ],
  // ブロックするURLパターン
  blockedPatterns: [
    /bit\.ly\//i,
    /tinyurl\.com\//i,
    /goo\.gl\//i,
    /t\.co\//i,
    /discord\.gg\//i, // Discord招待リンクはモデレーター判断を推奨
    /paypal\.me\//i // PayPalリンクはスパムになりやすい
  ],
  // 許可するドメイン
  allowedDomains: [
    'youtube.com',
    'youtu.be',
    'twitch.tv',
    'twitter.com',
    'instagram.com',
    'facebook.com',
    'discord.com',
    'github.com'
  ]
};

// URL抽出の正規表現
const URL_REGEX = /(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?/gi;

// YouTube Community Guidelinesに基づく追加フィルタ
const YOUTUBE_COMMUNITY_FILTERS = {
  // 暴力的・危険なコンテンツ
  violentKeywords: [
    'kill', 'murder', 'suicide', 'bomb', 'gun', 'knife', 'fight', 'attack', 'harm', 'hurt',
    'death', 'die', 'blood', 'gore', 'torture', 'abuse', 'assault', 'rape', 'molest'
  ],
  // ヘイトスピーチ
  hateSpeechKeywords: [
    'nazi', 'racist', 'sexist', 'homophobic', 'transphobic', 'bigot', 'supremacist',
    'white power', 'black lives matter' // 文脈によるが注意が必要
  ],
  // 性的コンテンツ
  sexualKeywords: [
    'porn', 'sex', 'nude', 'naked', 'erotic', 'arousal', 'orgasm', 'masturbation',
    'genitals', 'breasts', 'penis', 'vagina', 'intercourse', 'fellatio', 'cunnilingus'
  ],
  // 詐欺・スパム
  scamKeywords: [
    'free money', 'win prize', 'congratulations winner', 'urgent reply', 'bank account',
    'social security number', 'credit card', 'paypal transfer', 'inheritance', 'lottery'
  ],
  // 個人情報関連
  personalInfoKeywords: [
    'phone number', 'address', 'email', 'social security', 'bank details',
    'passport', 'driver license', 'ssn', 'credit card number'
  ]
};

const CUSTOM_FILTER_CONFIG = {
  // デフォルトフィルタ
  defaultFilters: [
    {
      id: 'spam-patterns',
      name: 'スパムパターン',
      patterns: [
        /\b(?:free|win|prize|gift)\b.*\$?\d+/i,  // "free money", "win $100" など
        /\b(?:paypal|bitcoin|crypto)\b.*\b(?:send|give|donate)\b/i, // 仮想通貨関連
        /(?:http|https|www\.)\S+/i,  // 一般的なURL
        /\b(?:follow|subscribe|like)\b.*\b(?:back|me|now)\b/i // フォロー誘導
      ],
      action: 'flag',
      severity: 'medium',
      enabled: true,
      caseSensitive: false,
      matchType: 'regex' // 'exact', 'contains', 'regex'
    },
    {
      id: 'offensive-language',
      name: '不適切表現',
      patterns: [
        /\b(?:damn|hell|shit)\b/i,
        /\b(?:fuck|asshole|bastard)\b/i,
        /\b(?:retard|idiot|stupid)\b/i
      ],
      action: 'block',
      severity: 'high',
      enabled: true,
      caseSensitive: false,
      matchType: 'regex'
    },
    {
      id: 'repeated-chars',
      name: '繰り返し文字',
      patterns: [
        /(.)\1{4,}/,  // 同じ文字が5回以上繰り返し
        /(?:\b(?:lol|haha|hehe)\b){3,}/i  // 笑い声の繰り返し
      ],
      action: 'flag',
      severity: 'low',
      enabled: true,
      caseSensitive: false,
      matchType: 'regex'
    }
  ]
};

// カスタムフィルタ適用関数
function applyCustomFilters(content, customFilters = []) {
  const matches = [];
  const allFilters = [...CUSTOM_FILTER_CONFIG.defaultFilters, ...customFilters];

  // 有効なフィルタのみ適用
  const activeFilters = allFilters.filter((filter) => filter.enabled);

  for (const filter of activeFilters) {
    try {
      let patternMatched = false;
      let matchedText = '';

      if (filter.matchType === 'exact') {
        // 完全一致
        const words = filter.patterns.map((p) => p.toString());
        for (const word of words) {
          const regex = filter.caseSensitive
            ? new RegExp(`\\b${word}\\b`)
            : new RegExp(`\\b${word}\\b`, 'i');
          if (regex.test(content)) {
            patternMatched = true;
            matchedText = word;
            break;
          }
        }
      } else if (filter.matchType === 'contains') {
        // 部分一致
        for (const pattern of filter.patterns) {
          const regex = filter.caseSensitive
            ? new RegExp(pattern.toString())
            : new RegExp(pattern.toString(), 'i');
          if (regex.test(content)) {
            patternMatched = true;
            matchedText = pattern.toString();
            break;
          }
        }
      } else if (filter.matchType === 'regex') {
        // 正規表現
        for (const pattern of filter.patterns) {
          // 既に i フラグ付きのパターンに無条件で 'i' を連結すると 'ii' となり
          // SyntaxError（Invalid flags）で全フィルタが毎回死んでいた。
          // デフォルト3フィルタ群は大半のパターンが /.../i 定義のため、
          // このバグによりカスタムフィルタ機能全体が一度も動作していなかった
          const regex = (filter.caseSensitive || pattern.flags.includes('i'))
            ? pattern
            : new RegExp(pattern.source, pattern.flags + 'i');
          if (regex.test(content)) {
            patternMatched = true;
            matchedText = pattern.toString();
            break;
          }
        }
      }

      if (patternMatched) {
        matches.push({
          filterId: filter.id,
          filterName: filter.name,
          matchedText: matchedText,
          action: filter.action,
          severity: filter.severity,
          caseSensitive: filter.caseSensitive,
          matchType: filter.matchType
        });
      }
    } catch (error) {
      logger.warn('[CustomFilter] Error applying filter:', filter.id, error);
    }
  }

  return {
    matches,
    hasMatches: matches.length > 0,
    highestSeverity: matches.length > 0 ?
      ['low', 'medium', 'high'].indexOf(
        matches.reduce((max, match) =>
          ['low', 'medium', 'high'].indexOf(match.severity) >
          ['low', 'medium', 'high'].indexOf(max) ? match.severity : max,
        'low'
        )
      ) : -1,
    recommendedAction: matches.length > 0 ?
      matches.reduce((action, match) =>
        match.severity === 'high' ? 'block' :
          action === 'block' ? 'block' :
            match.action === 'block' ? 'block' :
              match.action === 'flag' ? 'flag' : action,
      'allow'
      ) : 'allow'
  };
}

// チャットボット設定
const CHATBOT_CONFIG = {
  // デフォルトのFAQ
  faqResponses: {
    'schedule': {
      keywords: ['schedule', 'time', 'when', 'スケジュール', '時間', 'いつ'],
      response: '配信スケジュールはダッシュボードの「スケジュール」タブで確認できます。毎週火曜日と金曜日の20時からです！',
      confidence: 0.9
    },
    'ban': {
      keywords: ['ban', 'unban', '解除', 'ban解除'],
      response: 'ユーザーのBAN解除は「ユーザー管理」から対象ユーザーを選択して操作してください。',
      confidence: 0.8
    },
    'settings': {
      keywords: ['settings', 'setting', '設定', 'どこ'],
      response: '設定は右上のギアアイコンからアクセスできます。',
      confidence: 0.7
    },
    'commands': {
      keywords: ['command', 'commands', 'コマンド', 'help'],
      response: '利用可能なコマンド: !schedule, !social, !discord, !rules',
      confidence: 0.8
    },
    'social': {
      keywords: ['social', 'twitter', 'discord', 'follow', 'ソーシャル', 'twitter', 'discord'],
      response: 'フォローお願いします！ Twitter: @streamer, Discord: discord.gg/invite',
      confidence: 0.9
    },
    'rules': {
      keywords: ['rules', 'rule', 'ルール', 'マナー'],
      response: 'コミュニティルール: 1.敬意を払う 2.スパム禁止 3.ポジティブなコメントを心がける',
      confidence: 0.8
    }
  },

  // 製品/サービス推薦
  productRecommendations: {
    'merch': {
      keywords: ['merch', 'グッズ', 't-shirt', 'shirt'],
      response: '公式グッズはこちらから！ https://store.streamer.com',
      confidence: 0.8
    },
    'donation': {
      keywords: ['donate', 'donation', '投げ銭', '支援'],
      response: 'サポートありがとうございます！ https://streamlabs.com/streamer/tip',
      confidence: 0.9
    },
    'subscription': {
      keywords: ['subscribe', 'subscription', 'サブスク', 'メンバー'],
      response: 'メンバーシップに登録して特別な特典を手に入れよう！',
      confidence: 0.7
    }
  },

  // インタラクション応答
  interactionResponses: {
    'greeting': {
      patterns: [/^(hi|hello|hey|こんにちは|こんばんは|おはよう)/i],
      responses: [
        'こんにちは！配信を見に来てくれてありがとう！',
        'Hello! Thanks for joining the stream!',
        'おはようございます！今日も一緒に楽しみましょう！'
      ]
    },
    'thanks': {
      patterns: [/^(thanks?|thank you)/i],
      responses: [
        'You\'re welcome! Glad you\'re enjoying the stream!',
        'No problem! Keep having fun!',
        'Thank you too! Your support means everything!'
      ]
    },
    'goodbye': {
      patterns: [/^(bye|goodbye|see you|またね|ばいばい)/i],
      responses: [
        'またね！次回も待ってるよ！',
        'See you next time! Take care!',
        'お疲れ様でした！また会いましょう！'
      ]
    }
  }
};

// チャットボット応答関数
function generateChatbotResponse(content, context = {}) {
  try {
    const lowerContent = content.toLowerCase();

    // 1. FAQチェック
    for (const [key, faq] of Object.entries(CHATBOT_CONFIG.faqResponses)) {
      if (faq.keywords.some((keyword) => lowerContent.includes(keyword))) {
        return {
          response: faq.response,
          confidence: faq.confidence,
          type: 'faq',
          category: key,
          suggestedActions: []
        };
      }
    }

    // 2. 製品推薦チェック
    for (const [key, product] of Object.entries(CHATBOT_CONFIG.productRecommendations)) {
      if (product.keywords.some((keyword) => lowerContent.includes(keyword))) {
        return {
          response: product.response,
          confidence: product.confidence,
          type: 'recommendation',
          category: key,
          suggestedActions: ['view_product', 'purchase']
        };
      }
    }

    // 3. インタラクション応答
    for (const [key, interaction] of Object.entries(CHATBOT_CONFIG.interactionResponses)) {
      if (interaction.patterns.some((pattern) => pattern.test(content))) {
        const randomResponse = interaction.responses[Math.floor(Math.random() * interaction.responses.length)];
        return {
          response: randomResponse,
          confidence: 0.8,
          type: 'interaction',
          category: key,
          suggestedActions: []
        };
      }
    }

    // 4. コンテキストベースの応答（ゲーム関連など）
    if (context.game) {
      if (lowerContent.includes('how') && (lowerContent.includes('play') || lowerContent.includes('game'))) {
        return {
          response: `${context.game}の遊び方を説明しますね！基本ルールは...`,
          confidence: 0.6,
          type: 'game_help',
          category: 'gaming',
          suggestedActions: ['learn_more']
        };
      }
    }

    // 5. デフォルト応答
    const defaultResponses = [
      'ご質問ありがとうございます！詳しくはチャットで質問してくださいね。',
      'それは面白い質問です！配信中に答えさせていただきます。',
      'わかりました！その件については後ほど詳しくお話ししますね。'
    ];

    return {
      response: defaultResponses[Math.floor(Math.random() * defaultResponses.length)],
      confidence: 0.3,
      type: 'default',
      category: 'general',
      suggestedActions: []
    };

  } catch (error) {
    logger.warn('[Chatbot] Error generating response:', error);
    return {
      response: '申し訳ありませんが、自動応答に失敗しました。',
      confidence: 0.1,
      type: 'error',
      category: 'error',
      suggestedActions: [],
      error: error.message
    };
  }
}

// 翻訳サービス設定
const TRANSLATION_CONFIG = {
  // 対応言語
  supportedLanguages: {
    'en': 'English',
    'ja': '日本語',
    'zh': '中文',
    'ko': '한국어',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'pt': 'Português',
    'ru': 'Русский',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'th': 'ไทย',
    'vi': 'Tiếng Việt',
    'it': 'Italiano',
    'nl': 'Nederlands',
    'sv': 'Svenska',
    'da': 'Dansk',
    'no': 'Norsk',
    'fi': 'Suomi',
    'pl': 'Polski',
    'tr': 'Türkçe'
  },

  // 言語検出の正規表現パターン
  languagePatterns: {
    'ja': /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/i,
    'zh': /[\u4e00-\u9fff]/i,
    'ko': /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/i,
    'ar': /[\u0600-\u06ff]/i,
    'hi': /[\u0900-\u097f]/i,
    'th': /[\u0e00-\u0e7f]/i,
    'vi': /[\u1ea0-\u1ef9àáâãèéêìíòóôõùúýăđĩũơư]/i,
    'ru': /[\u0400-\u04ff]/i,
    'es': /\b(?:el|la|los|las|un|una|unos|unas|y|o|pero|porque|cuando|donde|como)\b/i,
    'fr': /\b(?:le|la|les|un|une|des|et|ou|mais|ou|quand|où|comment|pourquoi)\b/i,
    'de': /\b(?:der|die|das|den|dem|des|ein|eine|einen|und|oder|aber|weil|wann|wo|wie)\b/i,
    'it': /\b(?:il|lo|la|i|gli|le|un|uno|una|una|e|o|ma|perché|quando|dove|come)\b/i,
    'pt': /\b(?:o|a|os|as|um|uma|uns|umas|e|ou|mas|porque|quando|onde|como)\b/i,
    'nl': /\b(?:de|het|een|en|of|maar|omdat|wanneer|waar|hoe|wat)\b/i,
    'sv': /\b(?:en|ett|och|eller|men|som|jag|du|han|hon|vi|de|det|den)\b/i,
    'da': /\b(?:en|et|og|eller|men|som|jeg|du|han|hun|vi|de|det|den)\b/i,
    'no': /\b(?:en|et|og|eller|men|som|jeg|du|han|hun|vi|de|det|den)\b/i,
    'fi': /\b(?:ja|on|ei|että|mutta|vai|koska|kun|missä|miten|miksi)\b/i,
    'pl': /\b(?:i|oraz|albo|ale|że|bo|kiedy|gdzie|jak|dlaczego|co)\b/i,
    'tr': /\b(?:ve|veya|ama|çünkü|ne|nasıl|nerede|ne|zaman|kim)\b/i
  },

  // 翻訳品質設定
  qualitySettings: {
    fast: { priority: 'speed', maxLength: 1000 },
    balanced: { priority: 'balanced', maxLength: 2000 },
    high: { priority: 'quality', maxLength: 5000 }
  }
};

// 言語検出関数
function detectLanguage(text) {
  try {
    // まず文字ベースの検出
    for (const [lang, pattern] of Object.entries(TRANSLATION_CONFIG.languagePatterns)) {
      if (pattern.test(text)) {
        return {
          language: lang,
          confidence: 0.9,
          method: 'character_detection'
        };
      }
    }

    // 単語ベースの検出（英語をデフォルトに）
    const words = text.toLowerCase().split(/\s+/);
    const englishWords = words.filter((word) =>
      /^[a-z]+$/i.test(word) &&
      !TRANSLATION_CONFIG.languagePatterns.es.test(word) &&
      !TRANSLATION_CONFIG.languagePatterns.fr.test(word) &&
      !TRANSLATION_CONFIG.languagePatterns.de.test(word)
    );

    if (englishWords.length > words.length * 0.7) {
      return {
        language: 'en',
        confidence: 0.8,
        method: 'word_analysis'
      };
    }

    // デフォルトは英語
    return {
      language: 'en',
      confidence: 0.5,
      method: 'default'
    };

  } catch (error) {
    logger.warn('[LanguageDetection] Error detecting language:', error);
    return {
      language: 'en',
      confidence: 0.1,
      method: 'error_fallback',
      error: error.message
    };
  }
}

// 注: かつてここに translateText()/processAutoTranslation()（ハードコード語彙+
// "[from→to] text" 機械翻訳風の偽装文字列を返すモック）が存在したが、どこからも
// export/参照されていないデッドコードだった。実際に動く翻訳は openaiService.translateText()
// にあり、moderationController.translateText/autoTranslate から直接呼ぶよう配線済み
// （docs/RESEARCH_IMPROVEMENTS.md R-10）。detectLanguage()/TRANSLATION_CONFIG は
// 20言語対応の実用的な検出ロジックのため残し、下記でexportして再利用する


// Import OpenAI service
const openaiService = require('./openaiService');
const creatorCultureService = require('./creatorCultureService');

// コメント本文からURLを抽出し、LINK_BLOCK_CONFIGに基づいてブロック/警告対象を判定する
function analyzeLinks(content) {
  const matches = (content || '').match(URL_REGEX) || [];
  const links = [...new Set(matches)];
  const flaggedLinks = [];
  let hasBlockedLinks = false;
  let hasSuspiciousLinks = false;

  links.forEach((link) => {
    const lowerLink = link.toLowerCase();
    const isAllowed = LINK_BLOCK_CONFIG.allowedDomains.some((domain) => lowerLink.includes(domain));
    if (isAllowed) {
      return;
    }

    const isBlocked = LINK_BLOCK_CONFIG.blockedDomains.some((domain) => lowerLink.includes(domain))
      || LINK_BLOCK_CONFIG.blockedPatterns.some((pattern) => pattern.test(link));
    const isSuspicious = LINK_BLOCK_CONFIG.suspiciousDomains.some((domain) => lowerLink.includes(domain));

    if (isBlocked) {
      hasBlockedLinks = true;
      flaggedLinks.push({ url: link, reason: 'blocked' });
    } else if (isSuspicious) {
      hasSuspiciousLinks = true;
      flaggedLinks.push({ url: link, reason: 'suspicious' });
    }
  });

  return {
    links,
    flaggedLinks,
    linkCount: links.length,
    hasBlockedLinks,
    hasSuspiciousLinks
  };
}

// ルールベースの簡易感情分析（OpenAIが利用できない場合のフォールバック用ベースライン）
function analyzeSentiment(content) {
  const text = (content || '').toLowerCase();
  if (!text) {
    return { sentiment: 'neutral', score: 0.5, intensity: 'neutral', confidence: 0 };
  }

  const positivePattern = /すごい|最高|good|great|love|nice|thanks|ありがとう|楽しい|好き|嬉しい|amazing|awesome/i;
  const negativePattern = /最悪|ひどい|bad|hate|クソ|うざい|死ね|消えろ|バカ|アホ|stupid|terrible|awful/i;

  const hasPositive = positivePattern.test(text);
  const hasNegative = negativePattern.test(text);

  let sentiment = 'neutral';
  let score = 0.5;
  let intensity = 'neutral';

  if (hasPositive && !hasNegative) {
    sentiment = 'positive';
    score = 0.75;
    intensity = 'positive';
  } else if (hasNegative && !hasPositive) {
    sentiment = 'negative';
    score = 0.2;
    intensity = 'negative';
  } else if (hasPositive && hasNegative) {
    sentiment = 'mixed';
    score = 0.45;
  }

  return {
    sentiment,
    score,
    intensity,
    confidence: (hasPositive || hasNegative) ? 0.6 : 0.3
  };
}

// R-27: シンボル/エモート連投の検出。
// 日本語配信の文化的表現（顔文字/www/8888/絵文字リアクション）を潰さないよう、
// 「同一文字・同一絵文字が異常に長く連打されている」ケースに限定して検出する。
function detectSymbolSpam(text) {
  const content = String(text || '');
  if (content.length < 12) {
    return { isSpam: false, kind: null }; // 短文は対象外（www, 8888 等を守る）
  }

  // 同一の記号/絵文字が10回以上連続するか（「!!!!!!!!!!!!」「🔥🔥🔥🔥…」）
  // 文字ではなくコードポイント単位で見る（絵文字はサロゲートペアのため）
  const chars = [...content];
  let run = 1;
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === chars[i - 1]) {
      run += 1;
      if (run >= 10 && !/[\p{L}\p{N}]/u.test(chars[i])) {
        return { isSpam: true, kind: 'repeated_symbol' };
      }
    } else {
      run = 1;
    }
  }

  // 文字（日本語/英字/数字）をほとんど含まず、記号・絵文字だけで構成された長文
  const meaningful = chars.filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  if (meaningful / chars.length < 0.1) {
    return { isSpam: true, kind: 'symbol_only' };
  }

  return { isSpam: false, kind: null };
}

// R-24: contextComments は直近の文脈コメント（時系列順）。Policy-as-Prompt の
// 文脈込み判定に使う。省略時は文脈なしで判定する（既存呼び出し元は変更不要）
exports.analyzeComment = async (content, platform, user, timestamp, contextComments = []) => {
  const result = {
    isSpam: false,
    isOffensive: false,
    isAd: false,
    score: 0,
    flaggedWords: [],
    flaggedCategories: [], // R-14: どのNGカテゴリ（abuse/threat/spam）でヒットしたか
    links: [],
    flaggedLinks: [],
    linkCount: 0,
    aiAnalysis: null
  };

  // Use OpenAI for advanced analysis if available
  if (openaiService.isAvailable()) {
    try {
      // Parallel AI analysis for better performance
      const [sentimentResult, toxicityResult] = await Promise.all([
        openaiService.analyzeSentiment(content),
        openaiService.detectToxicContent(content)
      ]);

      result.aiAnalysis = {
        sentiment: sentimentResult,
        toxicity: toxicityResult
      };

      // Update score based on AI analysis
      if (toxicityResult.isToxic) {
        result.isOffensive = true;
        result.score += toxicityResult.score * 100;
      }

      // Add toxicity details
      result.toxicityScore = toxicityResult.score;
      result.toxicityCategories = toxicityResult.categories;

      // R-24: Policy-as-Prompt による文脈込みの判定。文化プロファイル（配信ごとの
      // 許容度）を自然言語ポリシーへ変換してLLMへ渡す。R-5bの実測で、語彙一致層は
      // 「NG語を含まない遠回しな攻撃」を0%しか検知できないと判明しており、この層が
      // その穴を埋めることを狙う。
      //
      // **重要な制約（arXiv:2607.12149の指摘に基づく）**: LLMの判定は助言に留める。
      //   - 既に決定論的判定（NGワード等）でoffensiveなものを、LLMが覆すことはしない
      //   - LLM単独では自動処罰せず、スコアを上げて人間のレビュー（保留）へ寄せる
      //   - どのポリシーで判定したかを必ず結果に残し、監査可能にする
      try {
        const policyPrompt = creatorCultureService.buildPolicyPrompt(platform, 'default');
        const policyResult = await openaiService.moderateWithPolicy(content, policyPrompt, contextComments);
        if (policyResult.available) {
          result.policyAnalysis = {
            isViolation: policyResult.isViolation,
            score: policyResult.score,
            reason: policyResult.reason,
            category: policyResult.category,
            cultureType: policyResult.cultureType,
            advisory: true // 助言であることを明示（自動処罰の根拠にはしない）
          };
          if (policyResult.isViolation) {
            // 加点のみ。決定論的な判定結果を打ち消さない
            result.score += Math.round(policyResult.score * 0.5);
            result.needsHumanReview = true;
          }
        }
      } catch (policyError) {
        logger.warn('[ModerationService] Policy-as-Prompt analysis failed:', policyError.message);
      }

    } catch (error) {
      logger.warn('[ModerationService] AI analysis failed, falling back to rule-based:', error.message);
    }
  } else if (!openaiWarningIssued) {
    logger.warn('[ModerationService] OPENAI_API_KEY is not set. Using rule-based analysis only.');
    openaiWarningIssued = true;
  }

  // R-27: シンボル/エモート連投スパム検知。Nightbot/Moobot/StreamElements 等が
  // 標準で備えるフィルタだが本製品には無かった。
  //
  // **日本語配信チャット特有の誤検知リスク**に注意して設計している。英語圏Botの
  // 素朴な「記号比率」フィルタをそのまま持ち込むと、日本語圏で日常的に使われる
  // 顔文字「(´・ω・｀)」、笑い「www」、拍手「88888」、絵文字リアクションを
  // 軒並みスパム判定してしまう。これらは荒らしではなく**文化そのもの**なので、
  // 次の2条件を課して誤検知を避ける:
  //   1. 一定長（12文字以上）に達している場合のみ判定する
  //   2. 顔文字に多用される括弧・記号列は、**同一文字の長い連打**である場合に限り数える
  const symbolSpam = detectSymbolSpam(content);
  if (symbolSpam.isSpam) {
    result.symbolSpam = true;
    result.symbolSpamKind = symbolSpam.kind;
    result.score += 20; // 軽度シグナル（単体では拒否しない）
  }

  // R-26: 大文字乱用（CAPS）検知。Nightbot/Moobot/StreamElements 等の主要
  // モデレーションBotが例外なく備える基本フィルタだが、本製品には存在しなかった。
  // 日本語主体のチャットでは英字が少ないため、**英字が一定数以上ある場合のみ**判定して
  // 「OK」「www」等の短い英字表現を誤検知しないようにする
  const letters = content.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 8) {
    const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
    if (upperRatio >= 0.7) {
      result.excessiveCaps = true;
      result.capsRatio = Math.round(upperRatio * 100) / 100;
      result.score += 15; // 単体では拒否に至らない軽度のシグナル
    }
  }

  // リンク分析
  const linkAnalysis = analyzeLinks(content);
  result.links = linkAnalysis.links;
  result.flaggedLinks = linkAnalysis.flaggedLinks;
  result.linkCount = linkAnalysis.linkCount;

  // カスタムフィルタ適用
  const customFilterResults = applyCustomFilters(content);
  result.customFilterMatches = customFilterResults.matches;
  result.hasCustomFilterMatches = customFilterResults.hasMatches;

  // 感情分析
  // R-23: 旧実装は、上でAI感情分析(openaiService.analyzeSentiment)を実行して
  // aiAnalysis.sentiment に格納していたにもかかわらず、ここでルールベースの結果で
  // result.sentiment を **無条件に上書き** していた。つまり課金・レイテンシを払って
  // 取得したAIの判定が下流の判断（保留ルール等）に一切使われず捨てられていた。
  // AIの結果が利用可能で信頼度が十分なときはそちらを優先し、無ければ従来通り
  // ルールベースにフォールバックする（キー未設定時の動作は不変）
  const sentimentAnalysis = analyzeSentiment(content);
  const aiSentiment = result.aiAnalysis?.sentiment;
  const useAiSentiment = aiSentiment
    && !aiSentiment.error
    && typeof aiSentiment.score === 'number'
    && (aiSentiment.confidence ?? 0) >= 0.5;

  if (useAiSentiment) {
    result.sentiment = aiSentiment.sentiment;
    result.sentimentScore = aiSentiment.score;
    result.sentimentIntensity = aiSentiment.intensity || sentimentAnalysis.intensity;
    result.sentimentConfidence = aiSentiment.confidence;
    result.sentimentSource = 'ai';
  } else {
    result.sentiment = sentimentAnalysis.sentiment;
    result.sentimentScore = sentimentAnalysis.score;
    result.sentimentIntensity = sentimentAnalysis.intensity;
    result.sentimentConfidence = sentimentAnalysis.confidence;
    result.sentimentSource = 'rule';
  }

  // リンクベースのスコアリング
  if (linkAnalysis.hasBlockedLinks) {
    result.isSpam = true;
    result.score += 80; // 高いペナルティ
  } else if (linkAnalysis.hasSuspiciousLinks) {
    result.score += 40; // 中程度のペナルティ
  }

  // カスタムフィルタベースのスコアリング
  if (customFilterResults.hasMatches) {
    if (customFilterResults.recommendedAction === 'block') {
      result.isSpam = true;
      result.score += 70; // 高いペナルティ
    } else if (customFilterResults.recommendedAction === 'flag') {
      result.score += 30; // 中程度のペナルティ
    }
  }

  // 過度なリンク数チェック（3つ以上は疑わしい）
  if (linkAnalysis.linkCount >= 3) {
    result.score += 30;
    result.isSpam = true;
  }

  // NGワード照合（ja/enリストはng-words.jsonで管理。英語は小文字で収録済みのため
  // 比較側を小文字化する。日本語はtoLowerCase()の影響を受けない）
  // R-11: ゼロ幅文字除去+NFKC正規化した文字列を主判定に使い、全角文字や単語内への
  // ゼロ幅スペース挿入による回避を防ぐ。加えてconfusables正規化した文字列もOR条件で
  // 照合し、ホモグリフ（例: κys のκをkとみなす）による回避も検出する
  // （confusablesは日本語仮名を誤って英字化することがあるため、この副読み用途に限定）
  const contentLower = normalizeForMatching(content).toLowerCase();
  const contentConfusablesNormalized = removeConfusables(normalizeForMatching(content)).toLowerCase();
  NG_WORDS.forEach((word) => {
    // R-30: 日本語は語境界が無いため、可能形や同音語の内部に噛む一致をガードで除外する
    if (matchesNgWord(contentLower, word) || matchesNgWord(contentConfusablesNormalized, word)) {
      result.flaggedWords.push(word);
      // R-14: ヒットした語のカテゴリを記録（重複は除外）してモデレーターに理由を提示
      const category = NG_WORD_CATEGORY.get(word);
      if (category && !result.flaggedCategories.includes(category)) {
        result.flaggedCategories.push(category);
      }
      result.isOffensive = true;
      result.score += 50;
    }
  });

  // R-31: 実世界での監視・つきまとい示唆の検知。
  // 既存のthreatリストは「住所特定した」「i know where you live」のような直截な表現しか
  // 拾えず、評価セットの「昨日どこにいたか知ってるよ。いつも同じ道通ってるね」のように
  // 単語単体では無害な語だけで構成された示唆を素通りしていた。
  // Han et al. のヘイトレイド研究（arXiv:2305.16248）でも、配信者が最も深刻に受け取るのは
  // 罵倒そのものより「現実の身元・所在を握っている」という示唆だと報告されている。
  // 誤検知を避けるため、①配信者の実世界での所在・移動、かつ ②それを把握しているという主張、
  // の両方が揃う形にのみ一致させる（ゲーム内の「同じ道」等に当たらないようにする）
  STALKING_PATTERNS.forEach(({ id, pattern }) => {
    if (pattern.test(contentLower)) {
      result.flaggedWords.push(id);
      if (!result.flaggedCategories.includes('threat')) {
        result.flaggedCategories.push('threat');
      }
      result.isOffensive = true;
      result.score += 50;
    }
  });

  // R-33: 標的型ハラスメント（語彙に頼らない攻撃）。2成分の共起を必須にしている
  TARGETED_HARASSMENT_PATTERNS.forEach(({ id, pattern, requires }) => {
    if (pattern.test(contentLower) && requires.test(contentLower)) {
      result.flaggedWords.push(id);
      if (!result.flaggedCategories.includes('abuse')) {
        result.flaggedCategories.push('abuse');
      }
      result.isOffensive = true;
      result.score += 50;
    }
  });

  // R-36: 性的ハラスメント（身体への言及と性的な要求・評価が近接して共起する形）
  if (detectSexualHarassment(contentLower)) {
    result.flaggedWords.push('harassment:sexual');
    if (!result.flaggedCategories.includes('sexual')) {
      result.flaggedCategories.push('sexual');
    }
    result.isOffensive = true;
    result.score += 50;
  }

  // R-35: 属性差別（属性への言及と断定的な貶めが近接して共起する形）
  if (detectAttributeDerogation(contentLower)) {
    result.flaggedWords.push('harassment:attribute_derogation');
    if (!result.flaggedCategories.includes('discrimination')) {
      result.flaggedCategories.push('discrimination');
    }
    result.isOffensive = true;
    result.score += 50;
  }

  if (result.score >= 50) {
    result.isSpam = true;
  }

  return result;
};

exports.updateSettings = async (platform, thresholds, bannedWords, regexPatterns) => {
  // DBに保存する処理（省略）
  return true;
};

// 20言語対応の文字/単語ベース言語検出（moderationController.autoTranslateから利用 — R-10）
exports.detectLanguage = detectLanguage;

// メッセージ保留設定
const MESSAGE_HOLD_CONFIG = {
  // 保留条件
  holdConditions: {
    // AIスコアがこの値以上の場合保留
    aiScoreThreshold: 0.5, // 改善: 閾値を下げて検知精度向上
    // 特定のキーワードを含む場合保留
    suspiciousKeywords: ['urgent', 'emergency', 'winner', 'prize', 'million', 'billion'],
    // リンクが複数含まれる場合保留
    maxLinksForHold: 2,
    // 繰り返し文字が含まれる場合保留
    repeatedCharsThreshold: 4,
    // 感情分析でネガティブ度が高い場合保留
    negativeSentimentThreshold: 0.8
  },

  // 保留期間設定（秒）
  holdDurations: {
    low_risk: 300,    // 5分
    medium_risk: 1800, // 30分
    high_risk: 3600   // 1時間
  },

  // 自動承認/拒否の条件
  autoActions: {
    // スコアがこの値以下は自動承認
    autoApproveThreshold: 0.3,
    // スコアがこの値以上は自動拒否
    autoRejectThreshold: 0.9
  }
};

// メッセージ保留判定関数
function shouldHoldMessage(content, moderationResult, settings = {}) {
  try {
    const {
      aiScoreThreshold = MESSAGE_HOLD_CONFIG.holdConditions.aiScoreThreshold,
      suspiciousKeywords = MESSAGE_HOLD_CONFIG.holdConditions.suspiciousKeywords,
      maxLinksForHold = MESSAGE_HOLD_CONFIG.holdConditions.maxLinksForHold,
      repeatedCharsThreshold = MESSAGE_HOLD_CONFIG.holdConditions.repeatedCharsThreshold,
      negativeSentimentThreshold = MESSAGE_HOLD_CONFIG.holdConditions.negativeSentimentThreshold
    } = settings;

    const reasons = [];

    // AIスコアチェック
    if (moderationResult.score >= aiScoreThreshold) {
      reasons.push({
        type: 'ai_score',
        severity: 'high',
        score: moderationResult.score,
        threshold: aiScoreThreshold
      });
    }

    // 疑わしいキーワードチェック
    const lowerContent = content.toLowerCase();
    const foundKeywords = suspiciousKeywords.filter((keyword) =>
      lowerContent.includes(keyword.toLowerCase())
    );
    if (foundKeywords.length > 0) {
      reasons.push({
        type: 'suspicious_keywords',
        severity: 'medium',
        keywords: foundKeywords
      });
    }

    // リンク数チェック
    if (moderationResult.linkCount >= maxLinksForHold) {
      reasons.push({
        type: 'multiple_links',
        severity: 'medium',
        linkCount: moderationResult.linkCount,
        threshold: maxLinksForHold
      });
    }

    // 繰り返し文字チェック
    const repeatedCharsMatch = content.match(/(.)\1{4,}/g);
    if (repeatedCharsMatch) {
      reasons.push({
        type: 'repeated_chars',
        severity: 'low',
        matches: repeatedCharsMatch.length
      });
    }

    // 感情分析チェック（ネガティブ度）
    if (moderationResult.sentiment === 'negative' && moderationResult.sentimentScore >= negativeSentimentThreshold) {
      reasons.push({
        type: 'negative_sentiment',
        severity: 'medium',
        sentimentScore: moderationResult.sentimentScore,
        threshold: negativeSentimentThreshold
      });
    }

    // 保留レベル判定
    const holdLevel = reasons.length > 0 ? reasons.reduce((max, reason) => {
      const levels = { low: 1, medium: 2, high: 3 };
      return levels[reason.severity] > levels[max] ? reason.severity : max;
    }, 'low') : null;

    return {
      shouldHold: reasons.length > 0,
      holdLevel,
      reasons,
      recommendedAction: reasons.length > 0 ? 'hold' : 'approve',
      confidence: Math.min(0.9, reasons.length * 0.2 + 0.1)
    };

  } catch (error) {
    logger.warn('[MessageHold] Error evaluating hold conditions:', error);
    return {
      shouldHold: false,
      holdLevel: null,
      reasons: [],
      recommendedAction: 'approve',
      confidence: 0.1,
      error: error.message
    };
  }
}

// 保留期間計算関数
function calculateHoldDuration(holdLevel, customSettings = {}) {
  const durations = { ...MESSAGE_HOLD_CONFIG.holdDurations, ...customSettings };
  const durationSeconds = durations[holdLevel] || durations.medium_risk;

  return {
    durationSeconds,
    holdUntil: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    holdLevel
  };
}

// 自動アクション判定関数
function determineAutoAction(moderationResult, settings = {}) {
  const {
    autoApproveThreshold = MESSAGE_HOLD_CONFIG.autoActions.autoApproveThreshold,
    autoRejectThreshold = MESSAGE_HOLD_CONFIG.autoActions.autoRejectThreshold
  } = settings;

  if (moderationResult.score <= autoApproveThreshold) {
    return {
      action: 'auto_approve',
      confidence: 0.8,
      reason: `Score ${moderationResult.score} is below approval threshold ${autoApproveThreshold}`
    };
  }

  if (moderationResult.score >= autoRejectThreshold) {
    return {
      action: 'auto_reject',
      confidence: 0.8,
      reason: `Score ${moderationResult.score} is above rejection threshold ${autoRejectThreshold}`
    };
  }

  return {
    action: 'manual_review',
    confidence: 0.9,
    reason: `Score ${moderationResult.score} requires manual review`
  };
}

// 注: かつてここに OpenAI/Google Perspective/Azure の3プロバイダーを模した
// AIモデレーション関数群（performAIModeration / performMultiProviderAIModeration /
// normalizeAIModerationResult / AI_MODERATION_PROVIDERS）が約240行存在したが、
// 実体は Math.random() でスコアを生成する完全なモックであり、どこからも export/参照
// されていないデッドコードだった。HTTP層（moderationController.performAIModeration）は
// 既に実物の openaiService.detectToxicContent を直接呼んでいるため、混乱の元となる
// この偽装コードを削除した。Google Perspective API は 2026-12-31 にサービス終了が
// 告知されているため今後も統合しない（docs/RESEARCH_IMPROVEMENTS.md R-3 参照）。
