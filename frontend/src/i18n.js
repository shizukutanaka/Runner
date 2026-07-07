import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 実在するロケールファイル（frontend/src/locales/）に対応する言語のみを列挙する。
// 以前は13言語分の未実装エントリがあり、選択すると動的importが失敗して
// 無言で英語にフォールバックしていた（D-13）
export const SUPPORTED_LANGUAGES = {
  'en': { name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
  'ja': { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', rtl: false },
};

// 言語リソースの動的インポート（最適化版）
const loadLanguageResources = async (languages = ['en', 'ja']) => {
  const resources = {};

  // 優先言語のみを読み込み（パフォーマンス最適化）
  const loadLanguages = languages.filter(lang => SUPPORTED_LANGUAGES[lang]);

  for (const langCode of loadLanguages) {
    try {
      // 動的に言語ファイルをインポート
      const module = await import(`./locales/${langCode}.json`);
      resources[langCode] = {
        translation: module.default
      };
      console.log(`✅ 言語ファイル ${langCode}.json を読み込みました`);
    } catch (error) {
      console.warn(`⚠️ 言語ファイル ${langCode}.json の読み込みに失敗しました:`, error);

      // 英語をフォールバックとして使用
      if (langCode !== 'en' && resources.en) {
        resources[langCode] = resources.en;
        console.log(`🔄 ${langCode} のフォールバックとして英語を使用します`);
      } else {
        resources[langCode] = { translation: {} };
      }
    }
  }

  return resources;
};

// ブラウザ言語検出の強化（スコアリングシステム）
const detectBrowserLanguage = () => {
  const savedLang = localStorage.getItem('preferredLanguage');
  if (savedLang && SUPPORTED_LANGUAGES[savedLang]) {
    return savedLang;
  }

  const browserLang = navigator.language || navigator.userLanguage;
  const primaryLang = browserLang.split('-')[0];

  // 完全一致を優先（スコア: 100）
  if (SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }

  // 言語コードのみで検索（スコア: 80）
  if (SUPPORTED_LANGUAGES[primaryLang]) {
    return primaryLang;
  }

  // 類似言語の検索（スコア: 60）
  const similarLangs = Object.keys(SUPPORTED_LANGUAGES).filter(lang =>
    lang.startsWith(primaryLang) || browserLang.startsWith(lang)
  );

  if (similarLangs.length > 0) {
    return similarLangs[0];
  }

  // 地域別デフォルト設定（スコア: 40）
  const regionDefaults = {
    'zh': 'zh-CN',
    'pt': 'pt-BR',
  };

  if (regionDefaults[primaryLang] && SUPPORTED_LANGUAGES[regionDefaults[primaryLang]]) {
    return regionDefaults[primaryLang];
  }

  return 'en'; // デフォルトは英語
};

// RTL言語の判定
export const isRTLLanguage = (langCode) => {
  return SUPPORTED_LANGUAGES[langCode]?.rtl || false;
};

// 言語名取得
export const getLanguageName = (langCode) => {
  return SUPPORTED_LANGUAGES[langCode]?.nativeName || langCode;
};

// 言語フラグ取得
export const getLanguageFlag = (langCode) => {
  return SUPPORTED_LANGUAGES[langCode]?.flag || '🌐';
};

// 言語リスト取得（グループ化）
export const getLanguageGroups = () => {
  const groups = {
    'common': [], // 一般的な言語
    'asia': [],   // アジア言語
    'europe': [], // 欧州言語
    'rtl': []     // RTL言語
  };

  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (info.rtl) {
      groups.rtl.push({ code, ...info });
    } else if (['zh-CN', 'ko', 'hi', 'th', 'vi', 'id', 'tr'].includes(code)) {
      groups.asia.push({ code, ...info });
    } else if (['en', 'es', 'fr', 'de', 'pt-BR', 'ru'].includes(code)) {
      groups.europe.push({ code, ...info });
    } else {
      groups.common.push({ code, ...info });
    }
  }

  return groups;
};

// 翻訳品質チェック
export const validateTranslation = (langCode, key, value) => {
  if (!value || typeof value !== 'string') return false;

  // プレースホルダーが正しく翻訳されているかチェック
  const placeholderRegex = /\{\{\s*\w+\s*\}\}/g;
  const originalMatches = SUPPORTED_LANGUAGES.en?.translation?.[key]?.match(placeholderRegex) || [];
  const translatedMatches = value.match(placeholderRegex) || [];

  return originalMatches.length === translatedMatches.length;
};

// 言語切替機能
export const changeLanguage = async (langCode) => {
  if (!SUPPORTED_LANGUAGES[langCode]) {
    console.error(`❌ サポートされていない言語: ${langCode}`);
    return false;
  }

  try {
    // 言語ファイルが読み込まれていない場合は動的に読み込み
    const currentResources = i18n.getDataByLanguage(langCode);
    if (!currentResources || Object.keys(currentResources).length === 0) {
      const resources = await loadLanguageResources([langCode]);
      i18n.addResourceBundle(langCode, 'translation', resources[langCode]?.translation || {}, true, true);
    }

    await i18n.changeLanguage(langCode);
    localStorage.setItem('preferredLanguage', langCode);

    // ドキュメント属性の更新
    document.documentElement.setAttribute('lang', langCode);
    document.documentElement.setAttribute('dir', isRTLLanguage(langCode) ? 'rtl' : 'ltr');

    console.log(`✅ 言語を ${langCode} に変更しました`);
    return true;

  } catch (error) {
    console.error(`❌ 言語変更エラー (${langCode}):`, error);
    return false;
  }
};

// 初期化関数
export const initializeI18n = async () => {
  const defaultLang = detectBrowserLanguage();
  const resources = await loadLanguageResources(['en', 'ja', defaultLang]); // デフォルトで3言語を読み込み

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: defaultLang,
      fallbackLng: 'en',
      detection: {
        order: ['localStorage', 'navigator', 'htmlTag', 'subdomain'],
        caches: ['localStorage'],
        lookupLocalStorage: 'preferredLanguage',
        checkWhitelist: true
      },
      interpolation: {
        escapeValue: false
      },
      react: {
        useSuspense: false,
        bindI18n: 'languageChanged loaded',
        bindI18nStore: 'added removed',
        transEmptyNodeValue: '',
        transSupportBasicHtmlNodes: true,
        transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em', 'span', 'p']
      },
      // 言語切替時の追加処理
      postProcess: ['interval', 'plural'],
      // 欠落翻訳の処理
      saveMissing: false, // プロダクションでは無効化
      missingKeyHandler: (lng, ns, key, fallbackValue) => {
        console.warn(`欠落翻訳: ${lng}.${ns}.${key}`);
        return fallbackValue || key;
      }
    });

  // 言語変更時の処理
  i18n.on('languageChanged', (lng) => {
    localStorage.setItem('preferredLanguage', lng);
    document.documentElement.setAttribute('lang', lng);
    document.documentElement.setAttribute('dir', isRTLLanguage(lng) ? 'rtl' : 'ltr');

    // 言語固有のフォント設定
    const fontMap = {
      'ja': 'font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Meiryo", sans-serif;',
      'zh-CN': 'font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;',
      'ko': 'font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif;',
      'hi': 'font-family: "Noto Sans Devanagari", sans-serif;',
      'th': 'font-family: "Noto Sans Thai", sans-serif;',
      'ar': 'font-family: "Noto Sans Arabic", "Tahoma", sans-serif;',
      'he': 'font-family: "Noto Sans Hebrew", "Tahoma", sans-serif;'
    };

    // 既存のフォント設定をクリア
    document.documentElement.style.fontFamily = '';

    if (fontMap[lng]) {
      document.documentElement.style.cssText += fontMap[lng];
    }

    // RTL言語の追加CSS
    if (isRTLLanguage(lng)) {
      document.documentElement.style.cssText += `
        text-align: right;
        direction: rtl;
      `;
    }
  });

  return i18n;
};

export default i18n;
