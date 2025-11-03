// 国際化ユーティリティ関数
import moment from 'moment-timezone';
import 'moment/locale/ja';
import 'moment/locale/zh-cn';
import 'moment/locale/zh-tw';
import 'moment/locale/ko';
import 'moment/locale/es';
import 'moment/locale/fr';
import 'moment/locale/de';
import 'moment/locale/it';
import 'moment/locale/pt';
import 'moment/locale/pt-br';
import 'moment/locale/ru';
import 'moment/locale/ar';
import 'moment/locale/hi';
import 'moment/locale/th';
import 'moment/locale/vi';
import 'moment/locale/id';
import 'moment/locale/ms';
import 'moment/locale/tl';
import 'moment/locale/tr';
import 'moment/locale/nl';
import 'moment/locale/sv';
import 'moment/locale/da';
import 'moment/locale/no';
import 'moment/locale/fi';
import 'moment/locale/pl';
import 'moment/locale/cs';
import 'moment/locale/sk';
import 'moment/locale/hu';
import 'moment/locale/ro';
import 'moment/locale/bg';
import 'moment/locale/hr';
import 'moment/locale/sr';
import 'moment/locale/sl';
import 'moment/locale/et';
import 'moment/locale/lv';
import 'moment/locale/lt';
import 'moment/locale/mt';
import 'moment/locale/he';
import 'moment/locale/fa';
import 'moment/locale/ur';
import 'moment/locale/bn';
import 'moment/locale/ta';
import 'moment/locale/te';
import 'moment/locale/mr';
import 'moment/locale/gu';
import 'moment/locale/kn';
import 'moment/locale/ml';
import 'moment/locale/pa';
import 'moment/locale/or';
import 'moment/locale/as';
import 'moment/locale/ne';
import 'moment/locale/si';
import 'moment/locale/dv';
import 'moment/locale/my';
import 'moment/locale/km';
import 'moment/locale/lo';

// タイムゾーンデータベース
export const TIMEZONE_GROUPS = {
  'asia': {
    name: 'アジア',
    zones: [
      { value: 'Asia/Tokyo', label: '東京 (JST)', offset: '+09:00' },
      { value: 'Asia/Shanghai', label: '上海 (CST)', offset: '+08:00' },
      { value: 'Asia/Seoul', label: 'ソウル (KST)', offset: '+09:00' },
      { value: 'Asia/Hong_Kong', label: '香港 (HKT)', offset: '+08:00' },
      { value: 'Asia/Singapore', label: 'シンガポール (SGT)', offset: '+08:00' },
      { value: 'Asia/Kolkata', label: 'コルカタ (IST)', offset: '+05:30' },
      { value: 'Asia/Dubai', label: 'ドバイ (GST)', offset: '+04:00' },
      { value: 'Asia/Bangkok', label: 'バンコク (ICT)', offset: '+07:00' },
      { value: 'Asia/Jakarta', label: 'ジャカルタ (WIB)', offset: '+07:00' },
      { value: 'Asia/Manila', label: 'マニラ (PHT)', offset: '+08:00' }
    ]
  },
  'europe': {
    name: 'ヨーロッパ',
    zones: [
      { value: 'Europe/London', label: 'ロンドン (GMT/BST)', offset: '+00:00/+01:00' },
      { value: 'Europe/Paris', label: 'パリ (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Berlin', label: 'ベルリン (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Rome', label: 'ローマ (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Madrid', label: 'マドリード (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Amsterdam', label: 'アムステルダム (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Stockholm', label: 'ストックホルム (CET/CEST)', offset: '+01:00/+02:00' },
      { value: 'Europe/Moscow', label: 'モスクワ (MSK)', offset: '+03:00' },
      { value: 'Europe/Athens', label: 'アテネ (EET/EEST)', offset: '+02:00/+03:00' },
      { value: 'Europe/Warsaw', label: 'ワルシャワ (CET/CEST)', offset: '+01:00/+02:00' }
    ]
  },
  'americas': {
    name: 'アメリカ大陸',
    zones: [
      { value: 'America/New_York', label: 'ニューヨーク (EST/EDT)', offset: '-05:00/-04:00' },
      { value: 'America/Chicago', label: 'シカゴ (CST/CDT)', offset: '-06:00/-05:00' },
      { value: 'America/Denver', label: 'デンバー (MST/MDT)', offset: '-07:00/-06:00' },
      { value: 'America/Los_Angeles', label: 'ロサンゼルス (PST/PDT)', offset: '-08:00/-07:00' },
      { value: 'America/Toronto', label: 'トロント (EST/EDT)', offset: '-05:00/-04:00' },
      { value: 'America/Vancouver', label: 'バンクーバー (PST/PDT)', offset: '-08:00/-07:00' },
      { value: 'America/Sao_Paulo', label: 'サンパウロ (BRT)', offset: '-03:00' },
      { value: 'America/Mexico_City', label: 'メキシコシティ (CST/CDT)', offset: '-06:00/-05:00' },
      { value: 'America/Buenos_Aires', label: 'ブエノスアイレス (ART)', offset: '-03:00' },
      { value: 'America/Santiago', label: 'サンティアゴ (CLT/CLST)', offset: '-04:00/-03:00' }
    ]
  },
  'oceania': {
    name: 'オセアニア',
    zones: [
      { value: 'Australia/Sydney', label: 'シドニー (AEST/AEDT)', offset: '+10:00/+11:00' },
      { value: 'Australia/Melbourne', label: 'メルボルン (AEST/AEDT)', offset: '+10:00/+11:00' },
      { value: 'Australia/Perth', label: 'パース (AWST)', offset: '+08:00' },
      { value: 'Pacific/Auckland', label: 'オークランド (NZST/NZDT)', offset: '+12:00/+13:00' },
      { value: 'Pacific/Honolulu', label: 'ホノルル (HST)', offset: '-10:00' }
    ]
  },
  'africa': {
    name: 'アフリカ',
    zones: [
      { value: 'Africa/Cairo', label: 'カイロ (EET/EEST)', offset: '+02:00/+03:00' },
      { value: 'Africa/Johannesburg', label: 'ヨハネスブルグ (SAST)', offset: '+02:00' },
      { value: 'Africa/Lagos', label: 'ラゴス (WAT)', offset: '+01:00' },
      { value: 'Africa/Casablanca', label: 'カサブランカ (WET/WEST)', offset: '+00:00/+01:00' },
      { value: 'Africa/Nairobi', label: 'ナイロビ (EAT)', offset: '+03:00' }
    ]
  }
};

// 通貨フォーマット設定
export const CURRENCY_SETTINGS = {
  'USD': { symbol: '$', position: 'before', locale: 'en-US', name: 'US Dollar' },
  'EUR': { symbol: '€', position: 'after', locale: 'de-DE', name: 'Euro' },
  'JPY': { symbol: '¥', position: 'before', locale: 'ja-JP', name: 'Japanese Yen' },
  'GBP': { symbol: '£', position: 'before', locale: 'en-GB', name: 'British Pound' },
  'CNY': { symbol: '¥', position: 'before', locale: 'zh-CN', name: 'Chinese Yuan' },
  'KRW': { symbol: '₩', position: 'before', locale: 'ko-KR', name: 'Korean Won' },
  'INR': { symbol: '₹', position: 'before', locale: 'hi-IN', name: 'Indian Rupee' },
  'RUB': { symbol: '₽', position: 'after', locale: 'ru-RU', name: 'Russian Ruble' },
  'BRL': { symbol: 'R$', position: 'before', locale: 'pt-BR', name: 'Brazilian Real' },
  'CAD': { symbol: 'C$', position: 'before', locale: 'en-CA', name: 'Canadian Dollar' },
  'AUD': { symbol: 'A$', position: 'before', locale: 'en-AU', name: 'Australian Dollar' },
  'CHF': { symbol: 'CHF', position: 'before', locale: 'de-CH', name: 'Swiss Franc' },
  'SEK': { symbol: 'kr', position: 'after', locale: 'sv-SE', name: 'Swedish Krona' },
  'NOK': { symbol: 'kr', position: 'after', locale: 'no-NO', name: 'Norwegian Krone' },
  'DKK': { symbol: 'kr', position: 'after', locale: 'da-DK', name: 'Danish Krone' },
  'PLN': { symbol: 'zł', position: 'after', locale: 'pl-PL', name: 'Polish Złoty' },
  'CZK': { symbol: 'Kč', position: 'after', locale: 'cs-CZ', name: 'Czech Koruna' },
  'HUF': { symbol: 'Ft', position: 'after', locale: 'hu-HU', name: 'Hungarian Forint' },
  'RON': { symbol: 'lei', position: 'after', locale: 'ro-RO', name: 'Romanian Leu' },
  'BGN': { symbol: 'лв', position: 'after', locale: 'bg-BG', name: 'Bulgarian Lev' },
  'HRK': { symbol: 'kn', position: 'after', locale: 'hr-HR', name: 'Croatian Kuna' },
  'RSD': { symbol: 'дин', position: 'after', locale: 'sr-RS', name: 'Serbian Dinar' },
  'TRY': { symbol: '₺', position: 'before', locale: 'tr-TR', name: 'Turkish Lira' },
  'ILS': { symbol: '₪', position: 'before', locale: 'he-IL', name: 'Israeli Shekel' },
  'AED': { symbol: 'د.إ', position: 'before', locale: 'ar-AE', name: 'UAE Dirham' },
  'SAR': { symbol: '﷼', position: 'before', locale: 'ar-SA', name: 'Saudi Riyal' },
  'THB': { symbol: '฿', position: 'before', locale: 'th-TH', name: 'Thai Baht' },
  'VND': { symbol: '₫', position: 'after', locale: 'vi-VN', name: 'Vietnamese Dong' },
  'IDR': { symbol: 'Rp', position: 'before', locale: 'id-ID', name: 'Indonesian Rupiah' },
  'MYR': { symbol: 'RM', position: 'before', locale: 'ms-MY', name: 'Malaysian Ringgit' },
  'PHP': { symbol: '₱', position: 'before', locale: 'tl-PH', name: 'Philippine Peso' },
  'SGD': { symbol: 'S$', position: 'before', locale: 'en-SG', name: 'Singapore Dollar' },
  'HKD': { symbol: 'HK$', position: 'before', locale: 'zh-HK', name: 'Hong Kong Dollar' },
  'TWD': { symbol: 'NT$', position: 'before', locale: 'zh-TW', name: 'Taiwan Dollar' },
  'MXN': { symbol: '$', position: 'before', locale: 'es-MX', name: 'Mexican Peso' },
  'ARS': { symbol: '$', position: 'before', locale: 'es-AR', name: 'Argentine Peso' },
  'CLP': { symbol: '$', position: 'before', locale: 'es-CL', name: 'Chilean Peso' },
  'PEN': { symbol: 'S/', position: 'before', locale: 'es-PE', name: 'Peruvian Sol' },
  'COP': { symbol: '$', position: 'before', locale: 'es-CO', name: 'Colombian Peso' },
  'ZAR': { symbol: 'R', position: 'before', locale: 'en-ZA', name: 'South African Rand' },
  'EGP': { symbol: '£', position: 'before', locale: 'ar-EG', name: 'Egyptian Pound' },
  'NGN': { symbol: '₦', position: 'before', locale: 'en-NG', name: 'Nigerian Naira' },
  'KES': { symbol: 'KSh', position: 'before', locale: 'en-KE', name: 'Kenyan Shilling' },
  'MAD': { symbol: 'د.م.', position: 'after', locale: 'ar-MA', name: 'Moroccan Dirham' },
  'DZD': { symbol: 'دج', position: 'before', locale: 'ar-DZ', name: 'Algerian Dinar' },
  'TND': { symbol: 'د.ت', position: 'before', locale: 'ar-TN', name: 'Tunisian Dinar' },
  'JOD': { symbol: 'د.أ', position: 'before', locale: 'ar-JO', name: 'Jordanian Dinar' },
  'LBP': { symbol: 'ل.ل', position: 'before', locale: 'ar-LB', name: 'Lebanese Pound' },
  'QAR': { symbol: '﷼', position: 'before', locale: 'ar-QA', name: 'Qatari Riyal' },
  'KWD': { symbol: 'د.ك', position: 'before', locale: 'ar-KW', name: 'Kuwaiti Dinar' },
  'BHD': { symbol: 'د.ب', position: 'before', locale: 'ar-BH', name: 'Bahraini Dinar' },
  'OMR': { symbol: '﷼', position: 'before', locale: 'ar-OM', name: 'Omani Rial' }
};

// 日付・時間フォーマット設定
export const DATETIME_FORMATS = {
  'en': {
    shortDate: 'MM/DD/YYYY',
    longDate: 'MMMM DD, YYYY',
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss',
    dateTime: 'MM/DD/YYYY HH:mm',
    fullDateTime: 'MMMM DD, YYYY HH:mm:ss'
  },
  'ja': {
    shortDate: 'YYYY/MM/DD',
    longDate: 'YYYY年MM月DD日',
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss',
    dateTime: 'YYYY/MM/DD HH:mm',
    fullDateTime: 'YYYY年MM月DD日 HH:mm:ss'
  },
  'zh-CN': {
    shortDate: 'YYYY/MM/DD',
    longDate: 'YYYY年MM月DD日',
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss',
    dateTime: 'YYYY/MM/DD HH:mm',
    fullDateTime: 'YYYY年MM月DD日 HH:mm:ss'
  },
  'ko': {
    shortDate: 'YYYY.MM.DD',
    longDate: 'YYYY년 MM월 DD일',
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss',
    dateTime: 'YYYY.MM.DD HH:mm',
    fullDateTime: 'YYYY년 MM월 DD일 HH:mm:ss'
  },
  'ar': {
    shortDate: 'DD/MM/YYYY',
    longDate: 'DD MMMM، YYYY',
    shortTime: 'HH:mm',
    longTime: 'HH:mm:ss',
    dateTime: 'DD/MM/YYYY HH:mm',
    fullDateTime: 'DD MMMM، YYYY HH:mm:ss'
  }
};

// 地域設定マネージャー
export class LocaleManager {
  constructor() {
    this.currentLocale = 'en';
    this.timezone = 'UTC';
    this.currency = 'USD';
  }

  // 言語設定
  setLocale(locale) {
    this.currentLocale = locale;
    moment.locale(locale);

    // 言語固有の設定適用
    if (locale.startsWith('ar') || locale.startsWith('he') || locale.startsWith('fa') || locale.startsWith('ur')) {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  }

  // タイムゾーン設定
  setTimezone(timezone) {
    this.timezone = timezone;
  }

  // 通貨設定
  setCurrency(currency) {
    this.currency = currency;
  }

  // 日付フォーマット
  formatDate(date, format = 'shortDate') {
    return moment(date).tz(this.timezone).format(DATETIME_FORMATS[this.currentLocale]?.[format] || 'YYYY-MM-DD');
  }

  // 時間フォーマット
  formatTime(time, format = 'shortTime') {
    return moment(time).tz(this.timezone).format(DATETIME_FORMATS[this.currentLocale]?.[format] || 'HH:mm');
  }

  // 日時フォーマット
  formatDateTime(dateTime, format = 'dateTime') {
    return moment(dateTime).tz(this.timezone).format(DATETIME_FORMATS[this.currentLocale]?.[format] || 'YYYY-MM-DD HH:mm');
  }

  // 相対時間（「5分前」など）
  formatRelativeTime(dateTime) {
    return moment(dateTime).tz(this.timezone).fromNow();
  }

  // 通貨フォーマット
  formatCurrency(amount, currency = this.currency) {
    const setting = CURRENCY_SETTINGS[currency];
    if (!setting) return `${amount} ${currency}`;

    const formatted = new Intl.NumberFormat(setting.locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);

    return formatted;
  }

  // 数値フォーマット
  formatNumber(number, options = {}) {
    return new Intl.NumberFormat(this.currentLocale, {
      minimumFractionDigits: options.minimumFractionDigits || 0,
      maximumFractionDigits: options.maximumFractionDigits || 2,
      ...options
    }).format(number);
  }

  // パーセントフォーマット
  formatPercentage(value, options = {}) {
    return new Intl.NumberFormat(this.currentLocale, {
      style: 'percent',
      minimumFractionDigits: options.minimumFractionDigits || 0,
      maximumFractionDigits: options.maximumFractionDigits || 1,
      ...options
    }).format(value / 100);
  }

  // 現在の言語でテキストを取得（i18n連携）
  t(key, options = {}) {
    // i18nが利用可能な場合はそれを使用、なければフォールバック
    if (window.i18n) {
      return window.i18n.t(key, options);
    }
    return key; // フォールバック
  }

  // 言語固有の設定取得
  getLocaleSettings() {
    return {
      locale: this.currentLocale,
      timezone: this.timezone,
      currency: this.currency,
      direction: this.currentLocale.match(/^(ar|he|fa|ur)/) ? 'rtl' : 'ltr',
      dateFormat: DATETIME_FORMATS[this.currentLocale] || DATETIME_FORMATS.en,
      currencyFormat: CURRENCY_SETTINGS[this.currency] || CURRENCY_SETTINGS.USD
    };
  }

  // タイムゾーン一覧取得
  getTimezoneGroups() {
    return TIMEZONE_GROUPS;
  }

  // 通貨一覧取得
  getCurrencyList() {
    return Object.entries(CURRENCY_SETTINGS).map(([code, setting]) => ({
      code,
      ...setting
    }));
  }
}

// グローバルインスタンス
export const localeManager = new LocaleManager();

// Reactフック
export const useLocale = () => {
  const [locale, setLocale] = React.useState(localeManager.currentLocale);
  const [timezone, setTimezone] = React.useState(localeManager.timezone);
  const [currency, setCurrency] = React.useState(localeManager.currency);

  React.useEffect(() => {
    localeManager.setLocale(locale);
    localeManager.setTimezone(timezone);
    localeManager.setCurrency(currency);
  }, [locale, timezone, currency]);

  return {
    locale,
    setLocale,
    timezone,
    setTimezone,
    currency,
    setCurrency,
    formatDate: localeManager.formatDate.bind(localeManager),
    formatTime: localeManager.formatTime.bind(localeManager),
    formatDateTime: localeManager.formatDateTime.bind(localeManager),
    formatRelativeTime: localeManager.formatRelativeTime.bind(localeManager),
    formatCurrency: localeManager.formatCurrency.bind(localeManager),
    formatNumber: localeManager.formatNumber.bind(localeManager),
    formatPercentage: localeManager.formatPercentage.bind(localeManager),
    t: localeManager.t.bind(localeManager),
    settings: localeManager.getLocaleSettings()
  };
};

export default localeManager;
