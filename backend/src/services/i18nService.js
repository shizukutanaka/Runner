const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

class I18nService {
  constructor() {
    this.initPromise = this.initializeI18n();
  }

  async initializeI18n() {
    await i18next
      .use(Backend)
      .init({
        lng: 'ja',
        fallbackLng: 'en',
        backend: {
          loadPath: __dirname + '/../../locales/{{lng}}.json'
        }
      });
  }

  async getMessage(key, language = 'ja') {
    await this.initPromise;
    const t = i18next.getFixedT(language);
    return t(key);
  }

  addLanguage(language, messages) {
    if (!language || typeof language !== 'string') {
      throw new Error('language は文字列で指定してください');
    }
    if (!messages || typeof messages !== 'object') {
      throw new Error('messages はオブジェクトで指定してください');
    }
    i18next.addResourceBundle(language, 'translation', messages, true, true);
  }

  getSupportedLanguages() {
    return Object.keys(i18next.store?.data || { ja: true, en: true });
  }

  async hasKey(key, language = 'ja') {
    await this.initPromise;
    return i18next.exists(key, { lng: language });
  }
}

module.exports = new I18nService();
