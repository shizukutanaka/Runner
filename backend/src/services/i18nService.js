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
    // Implementation for adding new languages
  }
}

module.exports = new I18nService();
