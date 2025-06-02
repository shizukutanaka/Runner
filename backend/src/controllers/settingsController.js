// 設定管理コントローラ
const db = require('../../src/db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// デフォルト設定
const defaultSettings = {
  theme: 'light',
  notifications: true,
  bannedWords: ['spam', 'offensive'],
  thresholds: { spam: 0.8, offensive: 0.7 },
  language: 'ja',
  timezone: 'Asia/Tokyo',
  layout: 'default',
  adminEmail: 'admin@example.com',
  autoBackup: {
    enabled: false,
    frequency: 'daily',
    time: '02:00',
    maxBackups: 30,
    lastBackup: null
  },
  apiKeys: [],
  externalIntegrations: {},
  uiCustomizations: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ヘルパー関数: ネストされた設定を更新する
function updateNestedSetting(userId, parentKey, childKey, value, res, next, settingName, merge = true) {
  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({ 
        status: 500, 
        message: `${settingName}の更新中にエラーが発生しました`,
        details: err 
      });
    }
    
    try {
      const settings = row ? JSON.parse(row.settings) : { ...defaultSettings };
      
      // 親キーが存在しない場合は初期化
      if (!settings[parentKey]) {
        settings[parentKey] = {};
      }
      
      if (childKey !== null) {
        // 子キーが指定されている場合
        if (merge && settings[parentKey][childKey] && typeof settings[parentKey][childKey] === 'object' && typeof value === 'object') {
          // マージモードで、両方がオブジェクトの場合はマージ
          settings[parentKey][childKey] = { ...settings[parentKey][childKey], ...value };
        } else {
          // それ以外は上書き
          settings[parentKey][childKey] = value;
        }
      } else {
        // 子キーがnullの場合は親キー全体を更新
        if (merge && settings[parentKey] && typeof settings[parentKey] === 'object' && typeof value === 'object') {
          settings[parentKey] = { ...settings[parentKey], ...value };
        } else {
          settings[parentKey] = value;
        }
      }
      
      settings.updatedAt = new Date().toISOString();
      
      // データベースを更新
      const upsertSql = `
        INSERT INTO user_settings (user_id, settings, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET 
          settings = excluded.settings,
          updated_at = CURRENT_TIMESTAMP`;
      
      db.run(upsertSql, [userId, JSON.stringify(settings)], function(updateErr) {
        if (updateErr) {
          return next({ 
            status: 500, 
            message: `${settingName}の保存中にエラーが発生しました`,
            details: updateErr 
          });
        }
        
        const responseData = childKey !== null 
          ? { [parentKey]: { [childKey]: value } } 
          : { [parentKey]: value };
        
        res.json({ 
          status: 200, 
          data: responseData, 
          message: `${settingName}を更新しました` 
        });
      });
      
    } catch (parseErr) {
      next({ 
        status: 500, 
        message: `${settingName}の処理中にエラーが発生しました`,
        details: parseErr 
      });
    }
  });
}

// ヘルパー関数: ユーザー設定を更新する
function updateUserSetting(userId, key, value, res, next, settingName) {
  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({ 
        status: 500, 
        message: `${settingName}の更新中にエラーが発生しました`,
        details: err 
      });
    }
    
    try {
      const settings = row ? JSON.parse(row.settings) : { ...defaultSettings };
      settings[key] = value;
      settings.updatedAt = new Date().toISOString();
      
      const upsertSql = `
        INSERT INTO user_settings (user_id, settings, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET 
          settings = excluded.settings,
          updated_at = CURRENT_TIMESTAMP`;
      
      db.run(upsertSql, [userId, JSON.stringify(settings)], function(updateErr) {
        if (updateErr) {
          return next({ 
            status: 500, 
            message: `${settingName}の保存中にエラーが発生しました`,
            details: updateErr 
          });
        }
        
        res.json({ 
          status: 200, 
          data: { [key]: value }, 
          message: `${settingName}を更新しました` 
        });
      });
      
    } catch (parseErr) {
      next({ 
        status: 500, 
        message: `${settingName}の処理中にエラーが発生しました`,
        details: parseErr 
      });
    }
  });
}

// 設定を取得
exports.getSettings = (req, res, next) => {
  const { userId } = req.params;
  const sql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  
  db.get(sql, [userId], (err, row) => {
    if (err) {
      return next({ status: 500, message: '設定の取得中にエラーが発生しました', details: err });
    }
    
    try {
      const userSettings = row ? JSON.parse(row.settings) : { ...defaultSettings };
      res.json({ 
        status: 200, 
        data: userSettings, 
        message: '設定を取得しました' 
      });
    } catch (parseErr) {
      next({ status: 500, message: '設定の解析中にエラーが発生しました', details: parseErr });
    }
  });
};

// 設定を更新
exports.updateSettings = (req, res, next) => {
  const { userId } = req.params;
  const updatedSettings = req.body;
  
  // 現在の設定を取得してマージ
  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({ status: 500, message: '設定の取得中にエラーが発生しました', details: err });
    }
    
    try {
      const currentSettings = row ? JSON.parse(row.settings) : { ...defaultSettings };
      const mergedSettings = { ...currentSettings, ...updatedSettings, updatedAt: new Date().toISOString() };
      
      // 更新または挿入
      const upsertSql = `
        INSERT INTO user_settings (user_id, settings, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET 
          settings = excluded.settings,
          updated_at = CURRENT_TIMESTAMP`;
      
      db.run(upsertSql, [userId, JSON.stringify(mergedSettings)], function(updateErr) {
        if (updateErr) {
          return next({ status: 500, message: '設定の更新中にエラーが発生しました', details: updateErr });
        }
        
        res.json({ 
          status: 200, 
          data: mergedSettings, 
          message: '設定を更新しました' 
        });
      });
    } catch (parseErr) {
      next({ status: 500, message: '設定の処理中にエラーが発生しました', details: parseErr });
    }
  });
};

// テーマ色設定
exports.setTheme = (req, res, next) => {
  const { userId } = req.params;
  const { theme } = req.body;
  
  if (!theme) {
    return next({ status: 400, message: 'テーマを指定してください' });
  }
  
  // 有効なテーマの検証
  const validThemes = ['light', 'dark', 'system'];
  if (!validThemes.includes(theme)) {
    return next({ 
      status: 400, 
      message: `無効なテーマです。有効な値: ${validThemes.join(', ')}` 
    });
  }
  
  // 設定を更新
  updateUserSetting(userId, 'theme', theme, res, next, 'テーマ設定');
};

// レイアウト設定
exports.setLayout = (req, res, next) => {
  const { userId } = req.params;
  const { layout } = req.body;
  
  if (!layout) {
    return next({ status: 400, message: 'レイアウトを指定してください' });
  }
  
  // 有効なレイアウトの検証
  const validLayouts = ['default', 'compact', 'spacious', 'custom'];
  if (!validLayouts.includes(layout)) {
    return next({ 
      status: 400, 
      message: `無効なレイアウトです。有効な値: ${validLayouts.join(', ')}` 
    });
  }
  
  // 設定を更新
  updateUserSetting(userId, 'layout', layout, res, next, 'レイアウト設定');
};

// 通知設定
exports.setNotifications = (req, res, next) => {
  const { userId } = req.params;
  const { enabled, email, push, sound, frequency } = req.body;
  
  // バリデーション
  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }
  
  // 通知設定オブジェクトを作成
  const notificationSettings = {
    enabled,
    email: email !== undefined ? email : true, // デフォルト値
    push: push !== undefined ? push : true,
    sound: sound !== undefined ? sound : true,
    frequency: frequency || 'real-time', // real-time, hourly, daily, weekly
    lastNotified: null,
    preferences: {
      mentions: true,
      replies: true,
      updates: true,
      newsletter: false
    }
  };
  
  // 設定を更新
  updateNestedSetting(
    userId,
    'notifications',
    null,
    notificationSettings,
    res,
    next,
    '通知設定'
  );
};

// 言語設定
exports.setDefaultLanguage = (req, res, next) => {
  const { userId } = req.params;
  const { language } = req.body;
  
  if (!language) {
    return next({ status: 400, message: '言語を指定してください' });
  }
  
  // サポートされている言語の検証
  const supportedLanguages = [
    'ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'
  ];
  
  if (!supportedLanguages.includes(language)) {
    return next({ 
      status: 400, 
      message: `サポートされていない言語です。サポート: ${supportedLanguages.join(', ')}` 
    });
  }
  
  // 設定を更新
  updateUserSetting(userId, 'language', language, res, next, '言語設定');
};

// タイムゾーン設定
exports.setTimezone = (req, res, next) => {
  const { userId } = req.params;
  const { timezone } = req.body;
  
  if (!timezone) {
    return next({ status: 400, message: 'タイムゾーンを指定してください' });
  }
  
  try {
    // タイムゾーンが有効かどうかをテスト
    new Date().toLocaleString('en-US', { timeZone: timezone });
    
    // 設定を更新
    updateUserSetting(
      userId,
      'timezone',
      timezone,
      res,
      next,
      'タイムゾーン設定'
    );
    
  } catch (err) {
    next({ 
      status: 400, 
      message: '無効なタイムゾーンです',
      details: err.message 
    });
  }
};

// 表示設定
exports.setDisplay = (req, res, next) => {
  const { userId } = req.params;
  const { 
    fontSize, 
    density, 
    theme, 
    showAvatars, 
    showImages, 
    showVideos,
    showGifs,
    autoPlayMedia,
    reduceAnimations,
    highContrast
  } = req.body;
  
  // バリデーション
  const validFontSizes = ['small', 'medium', 'large'];
  if (fontSize && !validFontSizes.includes(fontSize)) {
    return next({ 
      status: 400, 
      message: `無効なフォントサイズです。有効な値: ${validFontSizes.join(', ')}` 
    });
  }
  
  const validDensities = ['compact', 'normal', 'comfortable'];
  if (density && !validDensities.includes(density)) {
    return next({ 
      status: 400, 
      message: `無効な表示密度です。有効な値: ${validDensities.join(', ')}` 
    });
  }
  
  // 表示設定オブジェクトを作成
  const displaySettings = {
    fontSize: fontSize || 'medium',
    density: density || 'normal',
    theme: theme || 'system',
    showAvatars: showAvatars !== undefined ? showAvatars : true,
    showImages: showImages !== undefined ? showImages : true,
    showVideos: showVideos !== undefined ? showVideos : true,
    showGifs: showGifs !== undefined ? showGifs : true,
    autoPlayMedia: autoPlayMedia !== undefined ? autoPlayMedia : false,
    reduceAnimations: reduceAnimations !== undefined ? reduceAnimations : false,
    highContrast: highContrast !== undefined ? highContrast : false,
    updatedAt: new Date().toISOString()
  };
  
  // 設定を更新
  updateNestedSetting(
    userId,
    'display',
    null,
    displaySettings,
    res,
    next,
    '表示設定'
  );
};

// APIキー管理
exports.manageApiKeys = (req, res, next) => {
  const { userId } = req.params;
  const { action, keyName, permissions, expiresIn } = req.body;
  
  // アクションのバリデーション
  const validActions = ['create', 'revoke', 'list', 'update'];
  if (!validActions.includes(action)) {
    return next({ 
      status: 400, 
      message: `無効なアクションです。有効な値: ${validActions.join(', ')}` 
    });
  }
  
  // アクションに応じた処理
  if (action === 'create') {
    // 新しいAPIキーを生成
    const apiKey = generateApiKey();
    const keyData = {
      key: apiKey,
      name: keyName || '新しいAPIキー',
      permissions: permissions || ['read'],
      createdAt: new Date().toISOString(),
      lastUsed: null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      isActive: true
    };
    
    // APIキーを保存
    updateNestedSetting(
      userId,
      'apiKeys',
      apiKey,
      keyData,
      res,
      next,
      'APIキー管理',
      false // マージせずに上書き
    );
    
  } else if (action === 'revoke') {
    if (!keyName) {
      return next({ status: 400, message: '無効化するAPIキーを指定してください' });
    }
    
    // APIキーを無効化
    updateNestedSetting(
      userId,
      'apiKeys',
      keyName,
      { isActive: false, revokedAt: new Date().toISOString() },
      res,
      next,
      'APIキー無効化',
      true // 既存のキー情報を保持したまま更新
    );
    
  } else if (action === 'update') {
    if (!keyName) {
      return next({ status: 400, message: '更新するAPIキーを指定してください' });
    }
    
    // APIキーの権限を更新
    const updates = {};
    if (permissions) updates.permissions = permissions;
    if (expiresIn) updates.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    
    updateNestedSetting(
      userId,
      'apiKeys',
      keyName,
      updates,
      res,
      next,
      'APIキー更新',
      true // 既存のキー情報を保持したまま更新
    );
    
  } else if (action === 'list') {
    // ユーザーのAPIキー一覧を取得
    const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
    
    db.get(getSettingsSql, [userId], (err, row) => {
      if (err) {
        return next({ 
          status: 500, 
          message: 'APIキーの取得中にエラーが発生しました',
          details: err 
        });
      }
      
      try {
        const settings = row ? JSON.parse(row.settings) : { ...defaultSettings };
        const apiKeys = settings.apiKeys || {};
        
        // セキュリティのため、実際のキーは返さない
        const safeApiKeys = Object.entries(apiKeys).map(([key, data]) => ({
          name: data.name,
          lastUsed: data.lastUsed,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          isActive: data.isActive,
          permissions: data.permissions
        }));
        
        res.json({ 
          status: 200, 
          data: { apiKeys: safeApiKeys }, 
          message: 'APIキー一覧を取得しました' 
        });
        
      } catch (parseErr) {
        next({ 
          status: 500, 
          message: 'APIキー情報の解析中にエラーが発生しました',
          details: parseErr 
        });
      }
    });
  }
};

// ヘルパー関数: ランダムなAPIキーを生成
function generateApiKey() {
  const buffer = crypto.randomBytes(32);
  return buffer.toString('hex');
}

// 管理者メール設定
exports.setAdminEmail = (req, res, next) => {
  const { userId } = req.params;
  const { email } = req.body;
  
  if (!email) {
    return next({ status: 400, message: 'メールアドレスを指定してください' });
  }
  
  // メールアドレスの形式を検証
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next({ status: 400, message: '有効なメールアドレスを指定してください' });
  }
  
  // ユーザーが管理者かどうかを確認
  const checkAdminSql = 'SELECT is_admin FROM users WHERE id = ?';
  
  db.get(checkAdminSql, [userId], (err, row) => {
    if (err) {
      return next({ 
        status: 500, 
        message: '管理者権限の確認中にエラーが発生しました',
        details: err 
      });
    }
    
    if (!row || !row.is_admin) {
      return next({ 
        status: 403, 
        message: 'この操作を実行する権限がありません' 
      });
    }
    
    // 管理者メールを更新
    updateNestedSetting(
      userId,
      'admin',
      'email',
      email,
      res,
      next,
      '管理者メール設定'
    );
  });
};

// 自動バックアップ設定
exports.setAutoBackup = (req, res, next) => {
  const { userId } = req.params;
  const { enabled, frequency, time, maxBackups, notifyOnSuccess, notifyOnFailure } = req.body;
  
  // バリデーション
  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }
  
  const validFrequencies = ['daily', 'weekly', 'monthly'];
  if (frequency && !validFrequencies.includes(frequency)) {
    return next({ 
      status: 400, 
      message: `無効なバックアップ頻度です。有効な値: ${validFrequencies.join(', ')}` 
    });
  }
  
  // 時間のバリデーション (HH:MM形式)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (time && !timeRegex.test(time)) {
    return next({ status: 400, message: '時間はHH:MM形式で指定してください' });
  }
  
  // バックアップ設定オブジェクトを作成
  const backupSettings = {
    enabled: enabled !== undefined ? enabled : false,
    frequency: frequency || 'weekly',
    time: time || '02:00',
    maxBackups: maxBackups || 30, // デフォルト30世代保持
    notifyOnSuccess: notifyOnSuccess !== undefined ? notifyOnSuccess : true,
    notifyOnFailure: notifyOnFailure !== undefined ? notifyOnFailure : true,
    lastBackup: null,
    lastStatus: null,
    nextScheduled: null,
    storageLocation: 'local', // 'local' または 'cloud' など
    includeDatabase: true,
    includeUploads: true,
    includeLogs: false,
    compression: 'zip',
    retentionPolicy: {
      keepLastDays: 30,
      keepLastWeeks: 12,
      keepLastMonths: 12,
      keepYearly: 2
    },
    notificationSettings: {
      email: true,
      inApp: true,
      webhook: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // 次回のバックアップ予定日を計算
  if (enabled) {
    const now = new Date();
    const [hours, minutes] = (time || '02:00').split(':').map(Number);
    let nextDate = new Date();
    
    // 今日の指定時刻を設定
    nextDate.setHours(hours, minutes, 0, 0);
    
    // 既に今日のバックアップ時刻を過ぎている場合は翌日に設定
    if (nextDate <= now) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    // 週次または月次の場合、適切な日付に調整
    if (frequency === 'weekly') {
      // 次回の日曜日
      const day = nextDate.getDay();
      const daysUntilSunday = day === 0 ? 7 : 7 - day;
      nextDate.setDate(nextDate.getDate() + daysUntilSunday);
    } else if (frequency === 'monthly') {
      // 次回の1日
      nextDate.setMonth(nextDate.getMonth() + 1, 1);
    }
    
    backupSettings.nextScheduled = nextDate.toISOString();
  }
  
  // 設定を更新
  updateNestedSetting(
    userId,
    'backup',
    null,
    backupSettings,
    res,
    next,
    '自動バックアップ設定'
  );
};

// 外部連携設定
exports.setExternalIntegration = (req, res, next) => {
  const { userId } = req.params;
  const { service, action, credentials } = req.body;
  
  // 必須パラメータの検証
  if (!service) {
    return next({ status: 400, message: '連携サービスを指定してください' });
  }
  
  if (!action) {
    return next({ status: 400, message: 'アクションを指定してください' });
  }
  
  // サポートされているサービスの検証
  const supportedServices = ['slack', 'discord', 'google', 'microsoft', 'github', 'twitter'];
  if (!supportedServices.includes(service)) {
    return next({ 
      status: 400, 
      message: `サポートされていないサービスです。有効な値: ${supportedServices.join(', ')}` 
    });
  }
  
  // アクションの検証
  const validActions = ['connect', 'disconnect', 'update'];
  if (!validActions.includes(action)) {
    return next({ 
      status: 400, 
      message: `無効なアクションです。有効な値: ${validActions.join(', ')}` 
    });
  }
  
  // 接続に必要な認証情報の検証
  if (action === 'connect' && !credentials) {
    return next({ status: 400, message: '認証情報を指定してください' });
  }
  
  // 外部連携設定を更新
  const integrationData = {
    [service]: {
      isConnected: action !== 'disconnect',
      connectedAt: action === 'connect' ? new Date().toISOString() : null,
      lastSynced: null,
      credentials: action === 'connect' ? credentials : null,
      settings: {}
    }
  };
  
  updateNestedSetting(
    userId,
    'integrations',
    service,
    integrationData[service],
    res,
    next,
    '外部連携設定',
    false
  );
};

// UIカスタマイズ設定
exports.setUICustomization = (req, res, next) => {
  const { userId } = req.params;
  const { 
    primaryColor, 
    secondaryColor, 
    fontFamily, 
    borderRadius, 
    boxShadow, 
    animationSpeed,
    customCSS,
    layout
  } = req.body;
  
  // カラーコードのバリデーション
  const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  
  if (primaryColor && !colorRegex.test(primaryColor)) {
    return next({ status: 400, message: 'プライマリカラーは有効な16進数カラーコードで指定してください' });
  }
  
  if (secondaryColor && !colorRegex.test(secondaryColor)) {
    return next({ status: 400, message: 'セカンダリカラーは有効な16進数カラーコードで指定してください' });
  }
  
  // フォントファミリーの検証
  const safeFonts = [
    'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Times New Roman',
    'Georgia', 'Garamond', 'Courier New', 'Brush Script MT', 'sans-serif', 'serif', 'monospace'
  ];
  
  if (fontFamily && !safeFonts.some(font => fontFamily.includes(font))) {
    return next({ 
      status: 400, 
      message: `安全でないフォントが指定されました。許可されているフォント: ${safeFonts.join(', ')}` 
    });
  }
  
  // カスタムCSSの検証（長さ制限）
  if (customCSS && customCSS.length > 10000) {
    return next({ status: 400, message: 'カスタムCSSは10,000文字以下にしてください' });
  }
  
  // UIカスタマイズ設定オブジェクトを作成
  const uiCustomization = {
    colors: {
      primary: primaryColor || '#2563eb',
      secondary: secondaryColor || '#7c3aed',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#1e293b',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      error: '#dc2626',
      success: '#059669',
      warning: '#d97706',
      info: '#0284c7'
    },
    typography: {
      fontFamily: fontFamily || 'system-ui, -apple-system, sans-serif',
      fontSizeBase: '1rem',
      h1: { size: '2.5rem', weight: 'bold' },
      h2: { size: '2rem', weight: 'bold' },
      h3: { size: '1.75rem', weight: '600' },
      body: { size: '1rem', weight: '400', lineHeight: '1.5' },
      small: { size: '0.875rem', weight: '400' }
    },
    spacing: {
      xs: '0.25rem',
      sm: '0.5rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem',
      '2xl': '3rem',
      '3xl': '4rem'
    },
    borderRadius: {
      sm: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      full: '9999px'
    },
    boxShadow: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
    },
    animation: {
      duration: {
        fast: '150ms',
        normal: '300ms',
        slow: '500ms'
      },
      timingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
    },
    customCSS: customCSS || '',
    layout: {
      maxWidth: '1280px',
      sidebarWidth: '280px',
      headerHeight: '64px',
      footerHeight: '72px',
      containerPadding: '1.5rem'
    },
    components: {
      button: {
        padding: '0.5rem 1rem',
        borderRadius: '0.375rem',
        fontWeight: '500',
        textTransform: 'none',
        transition: 'all 0.2s'
      },
      card: {
        padding: '1.5rem',
        borderRadius: '0.5rem',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
      },
      input: {
        padding: '0.5rem 0.75rem',
        borderRadius: '0.375rem',
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        focus: {
          borderColor: '#2563eb',
          ring: '0 0 0 3px rgba(37, 99, 235, 0.1)'
        }
      }
    },
    darkMode: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f8fafc',
        textSecondary: '#94a3b8',
        border: '#334155'
      }
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px'
    },
    zIndex: {
      dropdown: 1000,
      sticky: 1020,
      fixed: 1030,
      modalBackdrop: 1040,
      modal: 1050,
      popover: 1060,
      tooltip: 1070
    },
    updatedAt: new Date().toISOString()
  };
  
  // 指定された値で上書き
  if (layout) {
    uiCustomization.layout = { ...uiCustomization.layout, ...layout };
  }
  
  // 設定を更新
  updateNestedSetting(
    userId,
    'uiCustomization',
    null,
    uiCustomization,
    res,
    next,
    'UIカスタマイズ設定'
  );
};

// 設定エクスポート
exports.exportSettings = (req, res, next) => {
  const { userId } = req.params;
  const { format = 'json', includeSensitive = false } = req.query;
  
  // サポートされているエクスポート形式
  const validFormats = ['json', 'yaml', 'toml'];
  if (!validFormats.includes(format)) {
    return next({ 
      status: 400, 
      message: `サポートされていない形式です。有効な値: ${validFormats.join(', ')}` 
    });
  }
  
  // ユーザー設定を取得
  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({ 
        status: 500, 
        message: '設定の取得中にエラーが発生しました',
        details: err 
      });
    }
    
    try {
      let settings = row ? JSON.parse(row.settings) : { ...defaultSettings };
      
      // 機密情報を削除（オプション）
      if (!includeSensitive) {
        const { apiKeys, tokens, credentials, ...safeSettings } = settings;
        settings = safeSettings;
      }
      
      // エクスポート用のデータを準備
      const exportData = {
        meta: {
          exportedAt: new Date().toISOString(),
          version: '1.0.0',
          userId,
          format
        },
        settings
      };
      
      // 形式に応じたレスポンスを返す
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=settings.json');
        res.json({ 
          status: 200, 
          data: exportData, 
          message: '設定をエクスポートしました' 
        });
      } else {
        // YAMLやTOMLの場合は文字列に変換して返す
        // 実際の実装では、yamlやtomlのパッケージを使用する
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=settings.${format}`);
        res.send(JSON.stringify(exportData, null, 2));
      }
      
    } catch (parseErr) {
      next({ 
        status: 500, 
        message: '設定の処理中にエラーが発生しました',
        details: parseErr 
      });
    }
  });
};

// 設定インポート
exports.importSettings = (req, res, next) => {
  const { userId } = req.params;
  const { settings, merge = true } = req.body;
  
  if (!settings) {
    return next({ status: 400, message: 'インポートする設定を指定してください' });
  }
  
  try {
    // 設定の検証
    if (typeof settings !== 'object' || settings === null) {
      throw new Error('無効な設定形式です');
    }
    
    // 現在の設定を取得
    const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
    
    db.get(getSettingsSql, [userId], (err, row) => {
      if (err) {
        return next({ 
          status: 500, 
          message: '現在の設定の取得中にエラーが発生しました',
          details: err 
        });
      }
      
      try {
        const currentSettings = row ? JSON.parse(row.settings) : {};
        let newSettings;
        
        // マージモードの場合は現在の設定とマージ、そうでない場合は上書き
        if (merge) {
          newSettings = { ...defaultSettings, ...currentSettings, ...settings };
        } else {
          newSettings = { ...defaultSettings, ...settings };
        }
        
        // 更新日時を設定
        newSettings.updatedAt = new Date().toISOString();
        
        // データベースを更新
        const upsertSql = `
          INSERT INTO user_settings (user_id, settings, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET 
            settings = excluded.settings,
            updated_at = CURRENT_TIMESTAMP`;
        
        db.run(upsertSql, [userId, JSON.stringify(newSettings)], function(updateErr) {
          if (updateErr) {
            return next({ 
              status: 500, 
              message: '設定の保存中にエラーが発生しました',
              details: updateErr 
            });
          }
          
          res.json({ 
            status: 200, 
            data: { imported: true }, 
            message: '設定をインポートしました' 
          });
        });
        
      } catch (mergeErr) {
        next({ 
          status: 400, 
          message: '設定のマージ中にエラーが発生しました',
          details: mergeErr.message 
        });
      }
    });
    
  } catch (err) {
    next({ 
      status: 400, 
      message: '無効な設定データです',
      details: err.message 
    });
  }
};

// バージョン情報取得
exports.getVersion = (req, res) => {
  const pkg = require('../../package.json');
  res.json({ 
    status: 200, 
    data: { 
      version: pkg.version || '1.0.0',
      name: pkg.name || 'YouTube Twitch Comment Manager',
      description: pkg.description || 'YouTubeとTwitchのコメントを管理するアプリケーション',
      repository: pkg.repository?.url || 'https://github.com/yourusername/youtube-twitch-comment-manager',
      license: pkg.license || 'MIT',
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage()
    }, 
    message: 'バージョン情報を取得しました' 
  });
};

// 利用規約取得
exports.getTerms = (req, res) => {
  res.json({ 
    status: 200, 
    data: { 
      title: '利用規約',
      version: '1.0.0',
      effectiveDate: '2023-01-01',
      content: [
        {
          section: '1. はじめに',
          text: '本利用規約は、当アプリケーションの利用条件を定めるものです。'
        },
        {
          section: '2. 利用条件',
          text: '当アプリケーションは、以下の条件に同意いただいた場合に限り、ご利用いただけます。'
        },
        {
          section: '3. 禁止事項',
          text: '法令に違反する行為、他の利用者に迷惑をかける行為などは禁止されています。'
        },
        {
          section: '4. 免責事項',
          text: '当アプリケーションの利用によって生じたいかなる損害についても、当社は責任を負いかねます。'
        },
        {
          section: '5. 規約の変更',
          text: '当社は、必要に応じて本規約を変更することがあります。'
        }
      ]
    }, 
    message: '利用規約を取得しました' 
  });
};

// ヘルプ取得
exports.getHelp = (req, res) => {
  res.json({ 
    status: 200, 
    data: { 
      categories: [
        {
          id: 'getting-started',
          title: 'はじめに',
          articles: [
            { id: 'what-is-this', title: 'このアプリについて' },
            { id: 'how-to-use', title: '基本的な使い方' }
          ]
        },
        {
          id: 'settings',
          title: '設定',
          articles: [
            { id: 'account-settings', title: 'アカウント設定' },
            { id: 'notification-settings', title: '通知設定' },
            { id: 'privacy-settings', title: 'プライバシー設定' }
          ]
        },
        {
          id: 'troubleshooting',
          title: 'トラブルシューティング',
          articles: [
            { id: 'login-issues', title: 'ログインできない' },
            { id: 'notifications-not-working', title: '通知が届かない' },
            { id: 'data-sync-issues', title: 'データが同期されない' }
          ]
        },
        {
          id: 'faq',
          title: 'よくある質問',
          articles: [
            { id: 'cancel-subscription', title: 'サブスクリプションの解約方法' },
            { id: 'delete-account', title: 'アカウントの削除方法' },
            { id: 'contact-support', title: 'サポートへの問い合わせ' }
          ]
        }
      ]
    }, 
    message: 'ヘルプを取得しました' 
  });
};
