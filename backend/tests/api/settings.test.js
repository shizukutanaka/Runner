// 設定API自動テスト（正常系・異常系）
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

const createAuthHeader = (payload) => ({
  Authorization: `Bearer ${generateToken(payload)}`
});

const adminAuth = () => createAuthHeader({ id: 'admin-tester', role: 'admin' });
const userAuth = () => createAuthHeader({ id: 'user-tester', role: 'user' });
const baseUrl = '/api/settings';
const userRoute = (suffix = '') => `${baseUrl}/user/${testUserId}${suffix}`;

describe('Settings API', () => {
  let testUserId = 'test-user-123';

  describe('GET /api/settings/user/:userId', () => {
    it('正常系: ユーザー設定取得', async () => {
      const res = await request(app)
        .get(userRoute())
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data).toBe('object');
    });

  describe('PUT /api/settings/user/:userId/auto-translation', () => {
    it('正常系: 最小入力で自動翻訳設定更新', async () => {
      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send({ enabled: true })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.autoTranslation.enabled).toBe(true);
      expect(res.body.data.autoTranslation.provider).toBe('google');
      expect(res.body.data.autoTranslation.usageLimitPerHour).toBe(120);
    });

    it('正常系: 追加パラメータ反映', async () => {
      const payload = {
        enabled: true,
        targetLanguage: 'en',
        sourceLanguage: 'ja',
        provider: 'azure',
        usageLimitPerHour: 60,
        fallbackLanguages: ['ja', 'ko'],
        notifyOnFailure: true
      };

      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send(payload)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.autoTranslation).toMatchObject({
        enabled: true,
        targetLanguage: 'en',
        sourceLanguage: 'ja',
        provider: 'azure',
        usageLimitPerHour: 60,
        fallbackLanguages: ['ja', 'ko'],
        notifyOnFailure: true
      });
    });

    it('異常系: 不正なプロバイダ', async () => {
      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send({ enabled: true, provider: 'invalid' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/provider|無効|invalid/i);
    });

    it('異常系: フォールバック言語数超過', async () => {
      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send({
          enabled: true,
          fallbackLanguages: ['ja', 'en', 'zh', 'ko', 'es', 'fr']
        })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/fallback|最大|5/);
    });

    it('異常系: フォールバック言語の不正値', async () => {
      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send({
          enabled: true,
          fallbackLanguages: ['ja', 'xx']
        })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/fallback|無効|invalid/i);
    });

    it('異常系: 利用上限の範囲外', async () => {
      const res = await request(app)
        .put(userRoute('/auto-translation'))
        .send({ enabled: true, usageLimitPerHour: 2000 })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/usageLimitPerHour|最大|1000/);
    });
  });

    it('異常系: 存在しないユーザー', async () => {
      const fakeUserId = 'non-existent-user-123';

      const res = await request(app)
        .get(`${baseUrl}/user/${fakeUserId}`)
        .set(adminAuth())
        .expect(404);

      expect(res.body.message).toMatch(/not found|見つからない|存在しない/);
    });

    it('異常系: 不正なユーザーID形式', async () => {
      const res = await request(app)
        .get(`${baseUrl}/user/invalid-user-id`)
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/id|形式|format/);
    });
  });

  describe('PUT /api/settings/user/:userId', () => {
    it('正常系: 設定更新成功', async () => {
      const updateData = {
        theme: 'dark',
        notifications: {
          enabled: true,
          email: false,
          push: true
        }
      };

      const res = await request(app)
        .put(userRoute())
        .send(updateData)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.theme).toBe('dark');
      expect(res.body.data.notifications.enabled).toBe(true);
    });

    it('異常系: 空の更新データ', async () => {
      const res = await request(app)
        .put(userRoute())
        .send({})
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/empty|空|data/);
    });

    it('異常系: 不正なテーマ値', async () => {
      const res = await request(app)
        .put(userRoute())
        .send({ theme: 'invalid_theme' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/theme|無効|invalid/);
    });
  });

  describe('PUT /api/settings/user/:userId/theme', () => {
    it('正常系: テーマ設定更新', async () => {
      const res = await request(app)
        .put(userRoute('/theme'))
        .send({ theme: 'dark' })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.theme).toBe('dark');
    });

    it('異常系: テーマなし', async () => {
      const res = await request(app)
        .put(userRoute('/theme'))
        .send({})
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/theme|必須|required/);
    });

    it('異常系: 不正なテーマ値', async () => {
      const res = await request(app)
        .put(userRoute('/theme'))
        .send({ theme: 'rainbow_theme' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/theme|無効|invalid/);
    });
  });

  describe('PUT /api/settings/user/:userId/notifications', () => {
    it('正常系: 通知設定更新', async () => {
      const notificationSettings = {
        enabled: false,
        email: true,
        push: false,
        sound: true
      };

      const res = await request(app)
        .put(userRoute('/notifications'))
        .send(notificationSettings)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.enabled).toBe(false);
    });

    it('異常系: 必須フィールド欠如', async () => {
      const res = await request(app)
        .put(userRoute('/notifications'))
        .send({ email: true })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/enabled|必須|required/);
    });

    it('異常系: 不正なboolean値', async () => {
      const res = await request(app)
        .put(userRoute('/notifications'))
        .send({ enabled: 'not_boolean' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/boolean|型|type/);
    });
  });

  describe('PUT /api/settings/user/:userId/default-language', () => {
    it('正常系: 言語設定更新', async () => {
      const res = await request(app)
        .put(userRoute('/default-language'))
        .send({ language: 'en' })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.language).toBe('en');
    });

    it('異常系: 言語なし', async () => {
      const res = await request(app)
        .put(userRoute('/default-language'))
        .send({})
        .set(adminAuth())
        .expect(400);
      expect(res.body.message).toMatch(/language|必須|required/);
    });

    it('異常系: サポートされていない言語', async () => {
      const res = await request(app)
        .put(userRoute('/default-language'))
        .send({ language: 'klingon' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/language|サポート|supported/);
    });
  });

  describe('PUT /api/settings/user/:userId/timezone', () => {
    it('正常系: タイムゾーン設定更新', async () => {
      const res = await request(app)
        .put(userRoute('/timezone'))
        .send({ timezone: 'America/New_York' })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.timezone).toBe('America/New_York');
    });
{{ ... }}

    it('異常系: タイムゾーンなし', async () => {
      const res = await request(app)
        .put(userRoute('/timezone'))
        .send({})
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/timezone|必須|required/);
    });

    it('異常系: 不正なタイムゾーン', async () => {
      const res = await request(app)
        .put(userRoute('/timezone'))
        .send({ timezone: 'Invalid/Timezone' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/timezone|無効|invalid/);
    });
  });

  describe('PUT /api/settings/user/:userId/ui-custom', () => {
    it('正常系: UIカスタマイズ設定更新', async () => {
      const uiSettings = {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        fontFamily: 'Arial',
        borderRadius: 8
      };

      const res = await request(app)
        .put(userRoute('/ui-custom'))
        .send(uiSettings)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.primaryColor).toBe('#ff0000');
    });

    it('異常系: 不正なカラーコード', async () => {
      const res = await request(app)
        .put(userRoute('/ui-custom'))
        .send({ primaryColor: 'red' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/color|カラー|format/);
    });

    it('異常系: カスタムCSSが長すぎる', async () => {
      const longCSS = 'a'.repeat(10001);
      const res = await request(app)
        .put(userRoute('/ui-custom'))
        .send({ customCSS: longCSS })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/length|文字数|長さ/);
    });
  });

  describe('PUT /api/settings/user/:userId/auto-backup', () => {
    it('正常系: 自動バックアップ設定更新', async () => {
      const backupSettings = {
        enabled: true,
        frequency: 'weekly',
        time: '02:00',
        maxBackups: 30
      };

      const res = await request(app)
        .put(userRoute('/auto-backup'))
        .send(backupSettings)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
    });

    it('異常系: 必須フィールド欠如', async () => {
      const res = await request(app)
        .put(userRoute('/auto-backup'))
        .send({ frequency: 'daily' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/enabled|必須|required/);
    });

    it('異常系: 不正な頻度値', async () => {
      const res = await request(app)
        .put(userRoute('/auto-backup'))
        .send({ enabled: true, frequency: 'yearly' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/frequency|無効|invalid/);
    });

    it('異常系: 不正な時間形式', async () => {
      const res = await request(app)
        .put(userRoute('/auto-backup'))
        .send({ enabled: true, time: '25:00' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/time|時間|format/);
    });
  });

  describe('PUT /api/settings/user/:userId/external-integration', () => {
    it('正常系: 外部連携設定更新', async () => {
      const integrationData = {
        service: 'slack',
        action: 'connect',
        credentials: { token: 'test-token' }
      };

      const res = await request(app)
        .put(userRoute('/external-integration'))
        .send(integrationData)
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
    });

    it('異常系: 必須フィールド欠如', async () => {
      const res = await request(app)
        .put(userRoute('/external-integration'))
        .send({ service: 'discord' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/action|必須|required/);
    });

    it('異常系: 不正なサービス名', async () => {
      const res = await request(app)
        .put(userRoute('/external-integration'))
        .send({ service: 'unknown_service', action: 'connect' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/service|無効|invalid/);
    });

    it('異常系: 不正なアクション', async () => {
      const res = await request(app)
        .put(userRoute('/external-integration'))
        .send({ service: 'slack', action: 'invalid_action' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/action|無効|invalid/);
    });
  });

  describe('PUT /api/settings/user/:userId/api-keys', () => {
    it('正常系: APIキー作成', async () => {
      const res = await request(app)
        .put(userRoute('/api-keys'))
        .send({ action: 'create', keyName: 'test-key' })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.key).toBeDefined();
      expect(res.body.data.name).toBe('test-key');
    });

    it('正常系: APIキー一覧取得', async () => {
      const res = await request(app)
        .put(userRoute('/api-keys'))
        .send({ action: 'list' })
        .set(adminAuth())
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(Array.isArray(res.body.data.apiKeys)).toBe(true);
    });

    it('異常系: 必須フィールド欠如', async () => {
      const res = await request(app)
        .put(userRoute('/api-keys'))
        .send({ keyName: 'test-key' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/action|必須|required/);
    });

    it('異常系: 不正なアクション', async () => {
      const res = await request(app)
        .put(userRoute('/api-keys'))
        .send({ action: 'invalid_action' })
        .set(adminAuth())
        .expect(400);

      expect(res.body.message).toMatch(/action|無効|invalid/);
    });
  });

  describe('GET /api/settings/export', () => {
    it('正常系: 設定エクスポート', async () => {
      const res = await request(app)
        .get('/api/settings/export')
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.meta).toBeDefined();
      expect(res.body.data.settings).toBeDefined();
    });

    it('正常系: 機密情報含むエクスポート', async () => {
      const res = await request(app)
        .get('/api/settings/export?includeSensitive=true')
        .expect(200);

      expect(res.body.status).toBe(200);
    });

    it('異常系: 不正なフォーマット', async () => {
      const res = await request(app)
        .get('/api/settings/export?format=invalid')
        .expect(400);

      expect(res.body.message).toMatch(/format|無効|invalid/);
    });
  });

  describe('POST /api/settings/import', () => {
    it('正常系: 設定インポート', async () => {
      const importData = {
        theme: 'light',
        notifications: { enabled: true }
      };

      const res = await request(app)
        .post('/api/settings/import')
        .send({ settings: importData, merge: true })
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.imported).toBe(true);
    });

    it('異常系: 設定データなし', async () => {
      const res = await request(app)
        .post('/api/settings/import')
        .send({})
        .expect(400);

      expect(res.body.message).toMatch(/settings|必須|required/);
    });

    it('異常系: 不正な設定形式', async () => {
      const res = await request(app)
        .post('/api/settings/import')
        .send({ settings: 'invalid_settings' })
        .expect(400);

      expect(res.body.message).toMatch(/format|形式|invalid/);
    });
  });

  describe('PUT /api/settings/admin-email', () => {
    it('正常系: 管理者メール設定更新', async () => {
      const res = await request(app)
        .put('/api/settings/admin-email')
        .send({ email: 'admin@example.com' })
        .expect(200);

      expect(res.body.status).toBe(200);
    });

    it('異常系: メールアドレスなし', async () => {
      const res = await request(app)
        .put('/api/settings/admin-email')
        .send({})
        .expect(400);

      expect(res.body.message).toMatch(/email|必須|required/);
    });

    it('異常系: 不正なメール形式', async () => {
      const res = await request(app)
        .put('/api/settings/admin-email')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(res.body.message).toMatch(/email|形式|format/);
    });
  });

  describe('GET /api/settings/version', () => {
    it('正常系: バージョン情報取得', async () => {
      const res = await request(app)
        .get('/api/settings/version')
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.version).toBeDefined();
      expect(res.body.data.name).toBeDefined();
    });
  });

  describe('GET /api/settings/terms', () => {
    it('正常系: 利用規約取得', async () => {
      const res = await request(app)
        .get('/api/settings/terms')
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.title).toBeDefined();
      expect(res.body.data.content).toBeDefined();
    });
  });

  describe('GET /api/settings/help', () => {
    it('正常系: ヘルプ取得', async () => {
      const res = await request(app)
        .get('/api/settings/help')
        .expect(200);

      expect(res.body.status).toBe(200);
      expect(res.body.data.categories).toBeDefined();
    });
  });

  describe('セキュリティテスト', () => {
    it('不正な権限での設定更新', async () => {
      const res = await request(app)
        .put('/api/settings/admin-email')
        .send({ email: 'hacker@example.com' })
        .expect(403);

      expect(res.body.message).toMatch(/権限|permission|unauthorized/);
    });

    it('XSS攻撃対策: スクリプトを含む設定', async () => {
      const xssSettings = {
        theme: 'light',
        customCSS: '<script>alert("XSS")</script>'
      };

      const res = await request(app)
        .put('/api/settings/ui-custom')
        .send(xssSettings);

      if (res.statusCode === 200) {
        // 設定が保存された場合、レスポンスでスクリプトがサニタイズされていることを確認
        expect(res.body.data.customCSS).not.toMatch(/<script>/i);
      } else {
        // ブロックされた場合も正常
        expect([400, 403, 422]).toContain(res.statusCode);
      }
    });

    it('SQLインジェクション対策: SQLを含む設定', async () => {
      const sqlInjectionSettings = {
        timezone: "'; DROP TABLE settings; --"
      };

      const res = await request(app)
        .put('/api/settings/timezone')
        .send(sqlInjectionSettings);

      // レスポンスが正常であることを確認
      expect(res.statusCode).toBe(200);
    });
  });

  describe('パフォーマンステスト', () => {
    it('大量設定の処理性能', async () => {
      const settings = [];

      // 100件の設定更新を準備
      for (let i = 0; i < 100; i++) {
        settings.push({
          theme: i % 2 === 0 ? 'light' : 'dark',
          notifications: { enabled: i % 3 === 0 }
        });
      }

      const startTime = Date.now();

      // バッチで設定を更新
      const updatePromises = settings.map(setting =>
        request(app)
          .put(`/api/settings/${testUserId}`)
          .send(setting)
      );

      const results = await Promise.all(updatePromises);
      const endTime = Date.now();

      const successfulUpdates = results.filter(res => res.statusCode === 200);
      const processingTime = endTime - startTime;

      // 成功率と処理時間を確認
      expect(successfulUpdates.length).toBeGreaterThanOrEqual(95); // 95%以上の成功率
      expect(processingTime).toBeLessThan(60000); // 60秒以内に処理完了
    });
  });
});
