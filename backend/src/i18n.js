const i18n = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');

// サポートする言語の定義
const SUPPORTED_LANGUAGES = {
  // 主要言語（完全対応）
  'en': { name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
  'ja': { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', rtl: false },
  'zh-CN': { name: 'Chinese (Simplified)', nativeName: '中文（简体）', flag: '🇨🇳', rtl: false },
  'ko': { name: 'Korean', nativeName: '한국어', flag: '🇰🇷', rtl: false },
  'es': { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', rtl: false },
  'fr': { name: 'French', nativeName: 'Français', flag: '🇫🇷', rtl: false },
  'de': { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', rtl: false },
  'pt-BR': { name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷', rtl: false },
  'ru': { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', rtl: false },
  'ar': { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  'hi': { name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', rtl: false },
  'th': { name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', rtl: false },
  'vi': { name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', rtl: false },
  'id': { name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', rtl: false },
  'tr': { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', rtl: false },
};

// 言語検出関数
const detectLanguage = (req) => {
  // クエリパラメータから言語を取得
  const queryLang = req.query.lang;
  if (queryLang && SUPPORTED_LANGUAGES[queryLang]) {
    return queryLang;
  }

  // Accept-Languageヘッダーから言語を取得
  const acceptLanguage = req.get('Accept-Language');
  if (acceptLanguage) {
    const primaryLang = acceptLanguage.split(',')[0].split('-')[0];
    if (SUPPORTED_LANGUAGES[primaryLang]) {
      return primaryLang;
    }
  }

  // デフォルトは英語
  return 'en';
};

// 言語設定ミドルウェア
const setLanguage = (req, res, next) => {
  const lang = detectLanguage(req);
  req.language = lang;
  req.locale = lang;
  res.locals.language = lang;
  res.locals.locale = lang;
  next();
};

// 国際化されたレスポンス関数
const createI18nResponse = (res, lang) => {
  return {
    success: (message, data = null, statusCode = 200) => {
      const translatedMessage = i18n.t(message, { lng: lang });
      const response = {
        success: true,
        message: translatedMessage,
        timestamp: new Date().toISOString()
      };

      if (data !== null) {
        response.data = data;
      }

      return res.status(statusCode).json(response);
    },

    error: (message, error = null, statusCode = 500) => {
      const translatedMessage = i18n.t(message, { lng: lang });
      const response = {
        success: false,
        message: translatedMessage,
        timestamp: new Date().toISOString()
      };

      if (error) {
        response.error = error;
      }

      return res.status(statusCode).json(response);
    },

    validationError: (errors) => {
      const translatedErrors = errors.map(error => ({
        field: error.field,
        message: i18n.t(error.message, { lng: lang })
      }));

      return res.status(400).json({
        success: false,
        message: i18n.t('validation_error', { lng: lang }),
        errors: translatedErrors,
        timestamp: new Date().toISOString()
      });
    },

    notFound: (resource = 'Resource') => {
      const message = i18n.t('not_found', { lng: lang });
      return res.status(404).json({
        success: false,
        message: message,
        timestamp: new Date().toISOString()
      });
    },

    unauthorized: () => {
      const message = i18n.t('unauthorized', { lng: lang });
      return res.status(401).json({
        success: false,
        message: message,
        timestamp: new Date().toISOString()
      });
    },

    forbidden: () => {
      const message = i18n.t('forbidden', { lng: lang });
      return res.status(403).json({
        success: false,
        message: message,
        timestamp: new Date().toISOString()
      });
    }
  };
};

// 国際化されたエラークラス
class I18nError extends Error {
  constructor(message, lang = 'en', statusCode = 500) {
    super(i18n.t(message, { lng: lang }));
    this.name = 'I18nError';
    this.statusCode = statusCode;
    this.originalMessage = message;
    this.language = lang;
  }
}

// 初期化関数
const initializeI18n = async () => {
  await i18n
    .use(Backend)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      backend: {
        loadPath: path.join(__dirname, 'locales/{{lng}}.json'),
      },
      interpolation: {
        escapeValue: false
      },
      returnEmptyString: false,
      returnNull: false,
      cleanCode: true,
      debug: process.env.NODE_ENV === 'development'
    });

  console.log('🌐 バックエンド国際化システムが初期化されました');
  console.log(`📋 対応言語: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
};

// 言語リスト取得
const getSupportedLanguages = () => SUPPORTED_LANGUAGES;

// 言語情報取得
const getLanguageInfo = (langCode) => SUPPORTED_LANGUAGES[langCode] || null;

// 翻訳関数
const translate = (key, options = {}) => {
  return i18n.t(key, options);
};

// 複数言語対応の翻訳
const translateMulti = (key, languages = ['en', 'ja']) => {
  const translations = {};
  languages.forEach(lang => {
    translations[lang] = i18n.t(key, { lng: lang });
  });
  return translations;
};

module.exports = {
  initializeI18n,
  setLanguage,
  createI18nResponse,
  I18nError,
  getSupportedLanguages,
  getLanguageInfo,
  translate,
  translateMulti,
  detectLanguage,
  SUPPORTED_LANGUAGES
};
