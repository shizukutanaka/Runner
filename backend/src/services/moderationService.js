// AIモデレーションサービスの雛形
// OpenAI APIやローカルMLと連携し、コメント内容を分析

const config = require('../config');
const logger = require('../logger');

let openaiWarningIssued = false;

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
    /paypal\.me\//i, // PayPalリンクはスパムになりやすい
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
const URL_REGEX = /(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?/gi;

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
        /\b(?:follow|subscribe|like)\b.*\b(?:back|me|now)\b/i, // フォロー誘導
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
  const activeFilters = allFilters.filter(filter => filter.enabled);

  for (const filter of activeFilters) {
    try {
      let patternMatched = false;
      let matchedText = '';

      if (filter.matchType === 'exact') {
        // 完全一致
        const words = filter.patterns.map(p => p.toString());
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
          const regex = filter.caseSensitive ? pattern : new RegExp(pattern.source, pattern.flags + 'i');
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
      if (faq.keywords.some(keyword => lowerContent.includes(keyword))) {
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
      if (product.keywords.some(keyword => lowerContent.includes(keyword))) {
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
      if (interaction.patterns.some(pattern => pattern.test(content))) {
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
    const englishWords = words.filter(word =>
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

// 翻訳関数（実際の実装ではGoogle Translate APIやDeepLを使用）
async function translateText(text, fromLang, toLang, quality = 'balanced') {
  try {
    // 実際の実装では外部APIを呼び出す
    // ここでは簡易的なモック実装

    if (fromLang === toLang) {
      return {
        translatedText: text,
        detectedLanguage: fromLang,
        confidence: 1.0,
        quality: quality,
        cached: true
      };
    }

    // 簡易的な翻訳マッピング（デモ用）
    const simpleTranslations = {
      'en-ja': {
        'hello': 'こんにちは',
        'thank you': 'ありがとう',
        'good morning': 'おはようございます',
        'how are you': 'お元気ですか',
        'schedule': 'スケジュール',
        'time': '時間',
        'when': 'いつ',
        'where': 'どこ',
        'how': 'どうやって',
        'what': '何',
        'why': 'なぜ'
      },
      'ja-en': {
        'こんにちは': 'hello',
        'ありがとう': 'thank you',
        'おはようございます': 'good morning',
        'お元気ですか': 'how are you',
        'スケジュール': 'schedule',
        '時間': 'time',
        'いつ': 'when',
        'どこ': 'where',
        'どうやって': 'how',
        '何': 'what',
        'なぜ': 'why'
      }
    };

    const key = `${fromLang}-${toLang}`;
    const translations = simpleTranslations[key];

    if (translations && translations[text.toLowerCase()]) {
      return {
        translatedText: translations[text.toLowerCase()],
        detectedLanguage: fromLang,
        confidence: 0.9,
        quality: quality,
        cached: false
      };
    }

    // 機械翻訳風の応答（デモ用）
    return {
      translatedText: `[${fromLang}→${toLang}] ${text}`,
      detectedLanguage: fromLang,
      confidence: 0.7,
      quality: quality,
      cached: false,
      note: 'This is a demo translation. In production, this would use Google Translate API or DeepL.'
    };

  } catch (error) {
    logger.warn('[Translation] Error translating text:', error);
    return {
      translatedText: text,
      detectedLanguage: fromLang,
      confidence: 0.1,
      quality: quality,
      error: error.message,
      fallback: true
    };
  }
}

// 自動翻訳処理関数
async function processAutoTranslation(content, targetLanguages = ['en'], quality = 'balanced') {
  try {
    const results = [];

    // ソース言語を検出
    const detection = detectLanguage(content);

    for (const targetLang of targetLanguages) {
      if (detection.language === targetLang) {
        // 同じ言語の場合は翻訳不要
        results.push({
          targetLanguage: targetLang,
          translatedText: content,
          detectedLanguage: detection.language,
          confidence: 1.0,
          quality: quality,
          skipped: true,
          reason: 'same_language'
        });
        continue;
      }

      // 翻訳を実行
      const translation = await translateText(content, detection.language, targetLang, quality);
      results.push({
        targetLanguage: targetLang,
        ...translation
      });
    }

    return {
      originalText: content,
      sourceLanguage: detection,
      translations: results,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.warn('[AutoTranslation] Error processing translation:', error);
    return {
      originalText: content,
      error: error.message,
      translations: [],
      timestamp: new Date().toISOString()
    };
  }
}

// Import OpenAI service
const openaiService = require('./openaiService');

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

exports.analyzeComment = async (content, platform, user, timestamp) => {
  const result = {
    isSpam: false,
    isOffensive: false,
    isAd: false,
    score: 0,
    flaggedWords: [],
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

    } catch (error) {
      logger.warn('[ModerationService] AI analysis failed, falling back to rule-based:', error.message);
    }
  } else if (!openaiWarningIssued) {
    logger.warn('[ModerationService] OPENAI_API_KEY is not set. Using rule-based analysis only.');
    openaiWarningIssued = true;
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
  const sentimentAnalysis = analyzeSentiment(content);
  result.sentiment = sentimentAnalysis.sentiment;
  result.sentimentScore = sentimentAnalysis.score;
  result.sentimentIntensity = sentimentAnalysis.intensity;
  result.sentimentConfidence = sentimentAnalysis.confidence;

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

  const bannedWords = ['badword', 'spamword'];
  bannedWords.forEach((word) => {
    if (content.includes(word)) {
      result.flaggedWords.push(word);
      result.isOffensive = true;
      result.score += 50;
    }
  });

  if (result.score >= 50) {
    result.isSpam = true;
  }

  return result;
};

exports.updateSettings = async (platform, thresholds, bannedWords, regexPatterns) => {
  // DBに保存する処理（省略）
  return true;
};

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
    const foundKeywords = suspiciousKeywords.filter(keyword =>
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
