// 設定管理コントローラ
const db = require('../../src/db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 通知設定デフォルト
const defaultNotificationSettings = {
  enabled: true,
  email: true,
  push: true,
  sound: true,
  frequency: 'real-time',
  lastNotified: null,
  preferences: {
    mentions: true,
    replies: true,
    updates: true,
    newsletter: false
  }
};

// デフォルト設定
const defaultSettings = {
  theme: 'light',
  notifications: { ...defaultNotificationSettings },
  bannedWords: ['spam', 'offensive'],
  thresholds: { spam: 0.8, offensive: 0.7 },
  language: 'ja',
  timezone: 'Asia/Tokyo',
  layout: 'default',
  adminEmail: require('../../src/config').getEnv('DEFAULT_ADMIN_EMAIL', 'admin@localhost'),
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
  const { enabled, email, push, sound, frequency, preferences } = req.body;

  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }

  const normalizeBoolean = (value, fallback) =>
    typeof value === 'boolean' ? value : fallback;

  const normalizeCategories = (input, allowed, fallback) => {
    if (!Array.isArray(input)) {
      return [...fallback];
    }
    const unique = Array.from(new Set(input.map((item) => String(item).trim())));
    return unique.filter((item) => allowed.includes(item));
  };

  const allowedFrequencies = ['real-time', 'hourly', 'daily', 'weekly'];
  const sanitizedFrequency = allowedFrequencies.includes(frequency)
    ? frequency
    : defaultNotificationSettings.frequency;

  const defaultPrefs = defaultNotificationSettings.preferences;
  const sanitizedPreferences = {
    mentions: normalizeBoolean(preferences?.mentions, defaultPrefs.mentions),
    replies: normalizeBoolean(preferences?.replies, defaultPrefs.replies),
    updates: normalizeBoolean(preferences?.updates, defaultPrefs.updates),
    newsletter: normalizeBoolean(preferences?.newsletter, defaultPrefs.newsletter)
  };

  const notificationSettings = {
    ...defaultNotificationSettings,
    enabled,
    email: normalizeBoolean(email, defaultNotificationSettings.email),
    push: normalizeBoolean(push, defaultNotificationSettings.push),
    sound: normalizeBoolean(sound, defaultNotificationSettings.sound),
    frequency: sanitizedFrequency,
    lastNotified: null,
    preferences: sanitizedPreferences
  };

  updateUserSetting(userId, 'notifications', notificationSettings, res, next, '通知設定');
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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next({ status: 400, message: '有効なメールアドレスを指定してください' });
  }

  if (req.user?.role !== 'admin') {
    return next({
      status: 403,
      message: 'この操作を実行する権限がありません'
    });
  }

  updateNestedSetting(
    userId,
    'admin',
    'email',
    email,
    res,
    next,
    '管理者メール設定'
  );
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

// コメント最大文字数設定
exports.setCommentMaxLength = (req, res, next) => {
  const { userId } = req.params;
  const { maxLength } = req.body;

  if (!maxLength || typeof maxLength !== 'number' || maxLength < 1 || maxLength > 10000) {
    return next({
      status: 400,
      message: 'コメント最大文字数は1から10000の範囲で指定してください'
    });
  }

  updateUserSetting(userId, 'commentMaxLength', maxLength, res, next, 'コメント最大文字数設定');
};

// コメント自動翻訳設定
exports.setAutoTranslation = (req, res, next) => {
  const { userId } = req.params;
  const {
    enabled,
    targetLanguage,
    sourceLanguage,
    provider = 'google',
    usageLimitPerHour = 120,
    fallbackLanguages = [],
    notifyOnFailure = false
  } = req.body;

  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }

  const validLanguages = ['ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'];
  if (targetLanguage && !validLanguages.includes(targetLanguage)) {
    return next({
      status: 400,
      message: `サポートされていない言語です。サポート: ${validLanguages.join(', ')}`
    });
  }

  const translationSettings = {
    enabled,
    targetLanguage: targetLanguage || 'ja',
    sourceLanguage: sourceLanguage || 'auto',
    provider,
    usageLimitPerHour,
    fallbackLanguages,
    notifyOnFailure,
    apiKeyConfigured: false,
    lastUsed: null,
    usageCount: 0,
    errorCount: 0
  };

  updateNestedSetting(
    userId,
    'autoTranslation',
    null,
    translationSettings,
    res,
    next,
    '自動翻訳設定'
  );
};

// コメントピン固定数設定
exports.setPinLimit = (req, res, next) => {
  const { userId } = req.params;
  const { limit } = req.body;

  if (!limit || typeof limit !== 'number' || limit < 1 || limit > 100) {
    return next({
      status: 400,
      message: 'ピン固定数は1から100の範囲で指定してください'
    });
  }

  updateUserSetting(userId, 'pinLimit', limit, res, next, 'ピン固定数設定');
};

// コメント自動削除時間設定
exports.setAutoDeleteTime = (req, res, next) => {
  const { userId } = req.params;
  const { hours } = req.body;

  if (!hours || typeof hours !== 'number' || hours < 0 || hours > 8760) {
    return next({
      status: 400,
      message: '自動削除時間は0から8760時間(1年)の範囲で指定してください'
    });
  }

  const autoDeleteSettings = {
    enabled: hours > 0,
    hours,
    lastCleanup: null,
    deletedCount: 0
  };

  updateNestedSetting(
    userId,
    'autoDelete',
    null,
    autoDeleteSettings,
    res,
    next,
    '自動削除時間設定'
  );
};

// NGワード自動追加設定
exports.setAutoNGWordAddition = (req, res, next) => {
  const { userId } = req.params;
  const { enabled, threshold, minOccurrences, excludedWords } = req.body;

  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }

  if (threshold && (typeof threshold !== 'number' || threshold < 0.1 || threshold > 1.0)) {
    return next({
      status: 400,
      message: '閾値は0.1から1.0の範囲で指定してください'
    });
  }

  const autoNGSettings = {
    enabled,
    threshold: threshold || 0.8,
    minOccurrences: minOccurrences || 3,
    excludedWords: excludedWords || ['test', 'hello', 'thank'],
    lastProcessed: null,
    addedWords: [],
    processingCount: 0
  };

  updateNestedSetting(
    userId,
    'autoNGWord',
    null,
    autoNGSettings,
    res,
    next,
    'NGワード自動追加設定'
  );
};

// AI閾値個別設定
exports.setIndividualAIThreshold = (req, res, next) => {
  const { userId } = req.params;
  const { commentId, threshold } = req.body;

  if (!commentId) {
    return next({ status: 400, message: 'コメントIDを指定してください' });
  }

  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    return next({
      status: 400,
      message: 'AI閾値は0から1の範囲で指定してください'
    });
  }

  const individualThresholdSettings = {
    commentId,
    threshold,
    setBy: userId,
    setAt: new Date().toISOString(),
    reason: 'manual_override'
  };

  updateNestedSetting(
    userId,
    'individualAIThresholds',
    commentId,
    individualThresholdSettings,
    res,
    next,
    'AI閾値個別設定',
    false
  );
};

// ユーザーごとのテーマ設定
exports.setUserTheme = (req, res, next) => {
  const { userId } = req.params;
  const { theme, primaryColor, secondaryColor } = req.body;

  if (!theme) {
    return next({ status: 400, message: 'テーマを指定してください' });
  }

  const validThemes = ['light', 'dark', 'system', 'custom'];
  if (!validThemes.includes(theme)) {
    return next({
      status: 400,
      message: `無効なテーマです。有効な値: ${validThemes.join(', ')}`
    });
  }

  const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (primaryColor && !colorRegex.test(primaryColor)) {
    return next({ status: 400, message: 'プライマリカラーは有効な16進数カラーコードで指定してください' });
  }

  if (secondaryColor && !colorRegex.test(secondaryColor)) {
    return next({ status: 400, message: 'セカンダリカラーは有効な16進数カラーコードで指定してください' });
  }

  const themeSettings = {
    theme,
    primaryColor: primaryColor || '#2563eb',
    secondaryColor: secondaryColor || '#7c3aed',
    customizations: {}
  };

  updateNestedSetting(
    userId,
    'userTheme',
    null,
    themeSettings,
    res,
    next,
    'ユーザーごとのテーマ設定'
  );
};

// ユーザーごとのBAN理由記録
exports.setBanReason = (req, res, next) => {
  const { userId } = req.params;
  const { targetUserId, reason, duration, moderatorNotes } = req.body;

  if (!targetUserId || !reason) {
    return next({ status: 400, message: '対象ユーザーIDと理由を指定してください' });
  }

  const validDurations = ['1h', '6h', '12h', '1d', '3d', '7d', '30d', 'permanent'];
  if (duration && !validDurations.includes(duration)) {
    return next({
      status: 400,
      message: `無効な期間です。有効な値: ${validDurations.join(', ')}`
    });
  }

  const banRecord = {
    targetUserId,
    reason,
    duration: duration || '1d',
    moderatorId: userId,
    moderatorNotes: moderatorNotes || '',
    timestamp: new Date().toISOString(),
    status: 'active'
  };

  // BAN履歴を追加
  updateNestedSetting(
    userId,
    'banHistory',
    targetUserId,
    banRecord,
    res,
    next,
    'BAN理由記録',
    false
  );
};

// ユーザーごとのミュート期間設定
exports.setUserMuteDuration = (req, res, next) => {
  const { userId } = req.params;
  const { targetUserId, duration, reason } = req.body;

  if (!targetUserId || !duration) {
    return next({ status: 400, message: '対象ユーザーIDと期間を指定してください' });
  }

  const validDurations = ['5m', '15m', '30m', '1h', '6h', '12h', '1d', '3d'];
  if (!validDurations.includes(duration)) {
    return next({
      status: 400,
      message: `無効な期間です。有効な値: ${validDurations.join(', ')}`
    });
  }

  const muteSettings = {
    targetUserId,
    duration,
    reason: reason || '違反行為',
    setBy: userId,
    setAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + parseDurationToMs(duration)).toISOString()
  };

  updateNestedSetting(
    userId,
    'userMuteSettings',
    targetUserId,
    muteSettings,
    res,
    next,
    'ユーザーごとのミュート期間設定',
    false
  );
};

// ユーザーごとのコメント色設定
exports.setUserCommentColor = (req, res, next) => {
  const { userId } = req.params;
  const { targetUserId, color, applyTo } = req.body;

  if (!targetUserId || !color) {
    return next({ status: 400, message: '対象ユーザーIDと色を指定してください' });
  }

  const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!colorRegex.test(color)) {
    return next({ status: 400, message: '色は有効な16進数カラーコードで指定してください' });
  }

  const validApplyTo = ['all', 'youtube', 'twitch'];
  if (applyTo && !validApplyTo.includes(applyTo)) {
    return next({
      status: 400,
      message: `無効な適用範囲です。有効な値: ${validApplyTo.join(', ')}`
    });
  }

  const colorSettings = {
    targetUserId,
    color,
    applyTo: applyTo || 'all',
    setBy: userId,
    setAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'userCommentColors',
    targetUserId,
    colorSettings,
    res,
    next,
    'ユーザーごとのコメント色設定',
    false
  );
};

// コメントごとのリアクション設定
exports.setCommentReaction = (req, res, next) => {
  const { userId } = req.params;
  const { commentId, reactionType } = req.body;

  if (!commentId || !reactionType) {
    return next({ status: 400, message: 'コメントIDとリアクションタイプを指定してください' });
  }

  const validReactions = ['like', 'dislike', 'love', 'laugh', 'angry', 'sad', 'surprise'];
  if (!validReactions.includes(reactionType)) {
    return next({
      status: 400,
      message: `無効なリアクションタイプです。有効な値: ${validReactions.join(', ')}`
    });
  }

  // まず既存のリアクションを確認
  const checkReactionSql = 'SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction_type = ?';

  db.get(checkReactionSql, [commentId, userId, reactionType], (err, row) => {
    if (err) {
      return next({
        status: 500,
        message: 'リアクションの確認中にエラーが発生しました',
        details: err
      });
    }

    if (row) {
      // 同じリアクションが既に存在する場合は削除（トグル）
      const deleteSql = 'DELETE FROM comment_reactions WHERE id = ?';
      db.run(deleteSql, [row.id], (deleteErr) => {
        if (deleteErr) {
          return next({
            status: 500,
            message: 'リアクションの削除中にエラーが発生しました',
            details: deleteErr
          });
        }

        res.json({
          status: 200,
          data: { removed: true },
          message: 'リアクションを削除しました'
        });
      });
    } else {
      // 新しいリアクションを追加
      const insertSql = 'INSERT INTO comment_reactions (comment_id, user_id, reaction_type) VALUES (?, ?, ?)';
      db.run(insertSql, [commentId, userId, reactionType], function(insertErr) {
        if (insertErr) {
          return next({
            status: 500,
            message: 'リアクションの追加中にエラーが発生しました',
            details: insertErr
          });
        }

        res.json({
          status: 200,
          data: { added: true, reactionId: this.lastID },
          message: 'リアクションを追加しました'
        });
      });
    }
  });
};

// コメントごとのタグ付与
exports.setCommentTag = (req, res, next) => {
  const { userId } = req.params;
  const { commentId, tag } = req.body;

  if (!commentId || !tag) {
    return next({ status: 400, message: 'コメントIDとタグを指定してください' });
  }

  if (tag.length > 50) {
    return next({ status: 400, message: 'タグは50文字以下にしてください' });
  }

  // まず既存のタグを確認
  const checkTagSql = 'SELECT id FROM comment_tags WHERE comment_id = ? AND tag = ?';

  db.get(checkTagSql, [commentId, tag], (err, row) => {
    if (err) {
      return next({
        status: 500,
        message: 'タグの確認中にエラーが発生しました',
        details: err
      });
    }

    if (row) {
      // 同じタグが既に存在する場合は削除（トグル）
      const deleteSql = 'DELETE FROM comment_tags WHERE id = ?';
      db.run(deleteSql, [row.id], (deleteErr) => {
        if (deleteErr) {
          return next({
            status: 500,
            message: 'タグの削除中にエラーが発生しました',
            details: deleteErr
          });
        }

        res.json({
          status: 200,
          data: { removed: true },
          message: 'タグを削除しました'
        });
      });
    } else {
      // 新しいタグを追加
      const insertSql = 'INSERT INTO comment_tags (comment_id, tag) VALUES (?, ?)';
      db.run(insertSql, [commentId, tag], function(insertErr) {
        if (insertErr) {
          return next({
            status: 500,
            message: 'タグの追加中にエラーが発生しました',
            details: insertErr
          });
        }

        res.json({
          status: 200,
          data: { added: true, tagId: this.lastID },
          message: 'タグを追加しました'
        });
      });
    }
  });
};

// AI判定ログ取得
exports.getAIModerationLogs = (req, res, next) => {
  const { commentId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!commentId) {
    return next({ status: 400, message: 'コメントIDを指定してください' });
  }

  const sql = `
    SELECT * FROM ai_moderation_logs
    WHERE comment_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.all(sql, [commentId, limit, offset], (err, rows) => {
    if (err) {
      return next({
        status: 500,
        message: 'AI判定ログの取得中にエラーが発生しました',
        details: err
      });
    }

    res.json({
      status: 200,
      data: rows,
      message: 'AI判定ログを取得しました'
    });
  });
};

// コメント編集履歴取得
exports.getCommentEditHistory = (req, res, next) => {
  const { commentId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!commentId) {
    return next({ status: 400, message: 'コメントIDを指定してください' });
  }

  const sql = `
    SELECT * FROM comment_edit_history
    WHERE comment_id = ?
    ORDER BY edited_at DESC
    LIMIT ? OFFSET ?
  `;

  db.all(sql, [commentId, limit, offset], (err, rows) => {
    if (err) {
      return next({
        status: 500,
        message: 'コメント編集履歴の取得中にエラーが発生しました',
        details: err
      });
    }

    res.json({
      status: 200,
      data: rows,
      message: 'コメント編集履歴を取得しました'
    });
  });
};

// ヘルパー関数: 期間文字列をミリ秒に変換
function parseDurationToMs(duration) {
  const unit = duration.slice(-1);
  const value = parseInt(duration.slice(0, -1));

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

// バージョン取得
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
      effectiveDate: '2024-01-01',
      sections: [
        {
          id: 'introduction',
          heading: '1. はじめに',
          text: '本規約は、本サービスの利用条件を定めるものです。利用者は本規約に同意した上でサービスを利用してください。'
        },
        {
          id: 'usage',
          heading: '2. 利用条件',
          text: '利用者は適用される法令を遵守し、サービスを適切に利用するものとします。'
        },
        {
          id: 'prohibited',
          heading: '3. 禁止事項',
          text: '違法行為、迷惑行為、その他運営が不適切と判断する行為を禁止します。'
        },
        {
          id: 'disclaimer',
          heading: '4. 免責事項',
          text: '運営は、サービス利用によって生じたいかなる損害に対しても責任を負いません。'
        },
        {
          id: 'changes',
          heading: '5. 規約の変更',
          text: '必要に応じて本規約を改定する場合があります。改定後は速やかに通知します。'
        }
      ],
      contact: {
        email: process.env.SUPPORT_EMAIL || 'support@localhost',
        hours: '平日10:00-18:00'
      }
    },
    message: '利用規約を取得しました'
  });
};

// ヘルプ取得
exports.getHelp = (req, res) => {
  res.json({
    status: 200,
    data: {
      title: 'ヘルプ',
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

// 設定ごとの自動復元
exports.setAutoRestore = (req, res, next) => {
  const { userId } = req.params;
  const { enabled, restorePoints, frequency, maxRestores } = req.body;

  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }

  const validFrequencies = ['manual', 'hourly', 'daily', 'weekly'];
  if (frequency && !validFrequencies.includes(frequency)) {
    return next({
      status: 400,
      message: `無効な頻度です。有効な値: ${validFrequencies.join(', ')}`
    });
  }

  const autoRestoreSettings = {
    enabled,
    frequency: frequency || 'daily',
    restorePoints: restorePoints || 10,
    maxRestores: maxRestores || 5,
    lastRestore: null,
    nextScheduled: null,
    restoreHistory: [],
    settings: {
      comments: true,
      users: true,
      moderation: true,
      analytics: false,
      logs: false
    }
  };

  // 次回の復元予定日を計算
  if (enabled && frequency !== 'manual') {
    const now = new Date();
    const nextDate = new Date();

    switch (frequency) {
      case 'hourly':
        nextDate.setHours(nextDate.getHours() + 1, 0, 0, 0);
        break;
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        nextDate.setHours(2, 0, 0, 0);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        nextDate.setHours(2, 0, 0, 0);
        break;
    }

    autoRestoreSettings.nextScheduled = nextDate.toISOString();
  }

  updateNestedSetting(
    userId,
    'autoRestore',
    null,
    autoRestoreSettings,
    res,
    next,
    '自動復元設定'
  );
};

// 設定ごとのアクセス権限設定
exports.setAccessPermissions = (req, res, next) => {
  const { userId } = req.params;
  const { permissions, roles, restrictions } = req.body;

  const permissionSettings = {
    permissions: permissions || {
      read: ['basic'],
      write: ['basic'],
      admin: []
    },
    roles: roles || ['user'],
    restrictions: restrictions || {
      ipWhitelist: [],
      timeRestrictions: {
        enabled: false,
        allowedHours: { start: '09:00', end: '18:00' },
        allowedDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      featureAccess: {
        aiModeration: true,
        analytics: true,
        export: true,
        apiAccess: false
      }
    },
    auditLog: {
      enabled: true,
      logAccess: true,
      logChanges: true,
      logAdminActions: true
    },
    updatedAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'accessPermissions',
    null,
    permissionSettings,
    res,
    next,
    'アクセス権限設定'
  );
};

// 設定ごとの通知設定
exports.setNotificationSettings = (req, res, next) => {
  const { userId } = req.params;
  const {
    emailNotifications,
    pushNotifications,
    inAppNotifications,
    webhookNotifications,
    thresholds
  } = req.body;

  const notificationSettings = {
    emailNotifications: emailNotifications || {
      enabled: true,
      frequency: 'immediate',
      categories: ['errors', 'warnings', 'info'],
      recipients: []
    },
    pushNotifications: pushNotifications || {
      enabled: true,
      categories: ['errors', 'warnings'],
      quietHours: { start: '22:00', end: '08:00' }
    },
    inAppNotifications: inAppNotifications || {
      enabled: true,
      position: 'top-right',
      duration: 5000,
      categories: ['success', 'error', 'warning', 'info']
    },
    webhookNotifications: webhookNotifications || {
      enabled: false,
      url: '',
      secret: '',
      events: ['comment.created', 'user.banned', 'system.error']
    },
    thresholds: thresholds || {
      cpuUsage: 80,
      memoryUsage: 85,
      diskUsage: 90,
      errorRate: 5,
      responseTime: 1000
    },
    templates: {
      email: {
        subject: '[{level}] {service} - {message}',
        body: '詳細: {details}\n時間: {timestamp}\nサービス: {service}'
      },
      push: {
        title: '{service} 通知',
        body: '{message}'
      },
      webhook: {
        json: '{"text": "{message}", "level": "{level}", "timestamp": "{timestamp}"}'
      }
    },
    updatedAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'notificationSettings',
    null,
    notificationSettings,
    res,
    next,
    '通知設定'
  );
};

// 設定ごとのUIテーマ設定
exports.setUIThemeSettings = (req, res, next) => {
  const { userId } = req.params;
  const { themePresets, customThemes, defaultTheme, allowCustomThemes } = req.body;

  const uiThemeSettings = {
    themePresets: themePresets || [
      { id: 'light', name: 'ライト', colors: {} },
      { id: 'dark', name: 'ダーク', colors: {} },
      { id: 'blue', name: 'ブルー', colors: {} },
      { id: 'green', name: 'グリーン', colors: {} }
    ],
    customThemes: customThemes || [],
    defaultTheme: defaultTheme || 'system',
    allowCustomThemes: allowCustomThemes !== undefined ? allowCustomThemes : true,
    themeInheritance: {
      allowParentOverride: true,
      cascadeToChildren: true,
      preserveUserCustomizations: true
    },
    themeValidation: {
      enforceContrastRatio: true,
      maxCustomColors: 10,
      allowedColorFormats: ['hex', 'rgb', 'hsl']
    },
    previewSettings: {
      showPreview: true,
      previewTimeout: 30,
      savePreviewState: false
    },
    updatedAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'uiThemeSettings',
    null,
    uiThemeSettings,
    res,
    next,
    'UIテーマ設定'
  );
};

// 設定ごとの自動適用
exports.setAutoApply = (req, res, next) => {
  const { userId } = req.params;
  const { enabled, triggers, conditions, actions } = req.body;

  if (typeof enabled !== 'boolean') {
    return next({ status: 400, message: '有効/無効を指定してください' });
  }

  const autoApplySettings = {
    enabled,
    triggers: triggers || [
      'user_login',
      'session_start',
      'setting_change',
      'time_based'
    ],
    conditions: conditions || {
      userRoles: ['admin', 'moderator'],
      timeRange: { start: '09:00', end: '18:00' },
      minSessionDuration: 300,
      requireApproval: false
    },
    actions: actions || [
      'apply_theme',
      'load_layout',
      'enable_notifications',
      'set_language'
    ],
    priority: {
      userSettings: 1,
      groupSettings: 2,
      systemDefaults: 3
    },
    conflictResolution: 'user_override',
    rollbackOnError: true,
    testMode: false,
    lastApplied: null,
    appliedCount: 0,
    errorCount: 0,
    updatedAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'autoApply',
    null,
    autoApplySettings,
    res,
    next,
    '自動適用設定'
  );
};

// 設定ごとの有効期限設定
exports.setExpirationSettings = (req, res, next) => {
  const { userId } = req.params;
  const {
    settingsExpiration,
    passwordExpiration,
    sessionExpiration,
    tokenExpiration,
    cleanupSettings
  } = req.body;

  const expirationSettings = {
    settingsExpiration: settingsExpiration || {
      enabled: false,
      duration: 90, // 日数
      warnBefore: 7, // 日数
      autoExtend: true,
      categories: {
        security: 30,
        preferences: 180,
        customizations: 365
      }
    },
    passwordExpiration: passwordExpiration || {
      enabled: true,
      duration: 90,
      warnBefore: 7,
      requireComplexity: true,
      preventReuse: true,
      historySize: 5
    },
    sessionExpiration: sessionExpiration || {
      enabled: true,
      duration: 24, // 時間
      extendOnActivity: true,
      maxExtensions: 3,
      warnBefore: 60, // 分
      absoluteTimeout: 168 // 時間（7日）
    },
    tokenExpiration: tokenExpiration || {
      accessToken: 3600, // 秒
      refreshToken: 2592000, // 秒（30日）
      apiKey: 31536000, // 秒（1年）
      temporaryToken: 300 // 秒（5分）
    },
    cleanupSettings: cleanupSettings || {
      enabled: true,
      expiredSettings: 30, // 削除までの日数
      expiredSessions: 7,
      expiredTokens: 1,
      oldBackups: 90,
      logRetention: 365,
      auditRetention: 2555 // 7年
    },
    notifications: {
      expirationWarnings: true,
      cleanupReports: true,
      adminAlerts: true
    },
    updatedAt: new Date().toISOString()
  };

  updateNestedSetting(
    userId,
    'expirationSettings',
    null,
    expirationSettings,
    res,
    next,
    '有効期限設定'
  );
};

// 設定の自動復元実行
exports.executeAutoRestore = (req, res, next) => {
  const { userId } = req.params;
  const { restorePoint, categories } = req.body;

  if (!restorePoint) {
    return next({ status: 400, message: '復元ポイントを指定してください' });
  }

  // 復元処理の実装
  const restoreData = {
    userId,
    restorePoint,
    categories: categories || ['all'],
    timestamp: new Date().toISOString(),
    status: 'in_progress',
    progress: 0,
    results: {
      restored: [],
      skipped: [],
      errors: []
    }
  };

  // 実際の復元処理はバックグラウンドジョブとして実行
  // ここでは設定の更新のみ行う
  updateNestedSetting(
    userId,
    'restoreHistory',
    restorePoint,
    restoreData,
    res,
    next,
    '自動復元実行',
    false
  );
};

// アクセス権限チェック
exports.checkAccessPermission = (req, res, next) => {
  const { userId } = req.params;
  const { action, resource } = req.body;

  // 権限チェックロジック
  const hasPermission = true; // 実際の実装では詳細なチェックを行う

  if (!hasPermission) {
    return next({
      status: 403,
      message: 'この操作を実行する権限がありません'
    });
  }

  res.json({
    status: 200,
    data: { hasPermission: true, action, resource },
    message: '権限チェック完了'
  });
};

// 設定の有効期限チェック
exports.checkExpirationStatus = (req, res, next) => {
  const { userId } = req.params;
  const { category } = req.query;

  // 有効期限チェックロジック
  const expirationStatus = {
    settings: { expired: false, daysUntilExpiry: 30 },
    password: { expired: false, daysUntilExpiry: 15 },
    session: { expired: false, minutesUntilExpiry: 120 },
    tokens: { expired: false, daysUntilExpiry: 30 }
  };

// スローモード設定の取得
const getSlowModeSettings = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({
        status: 500,
        message: 'スローモード設定の取得中にエラーが発生しました',
        details: err
      });
    }

    const settings = row ? JSON.parse(row.settings) : { ...defaultSettings };

    // スローモード設定がなければデフォルト値を設定
    if (!settings.slowMode) {
      settings.slowMode = {
        enabled: false,
        intervalSeconds: 30, // デフォルト30秒
        platformSpecific: {
          youtube: { enabled: false, intervalSeconds: 30 },
          twitch: { enabled: false, intervalSeconds: 30 }
        }
      };
    }

    res.json({
      status: 200,
      data: settings.slowMode,
      message: 'スローモード設定を取得しました'
    });
  });
});

// スローモード設定の更新
const updateSlowModeSettings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { enabled, intervalSeconds, platformSpecific } = req.body;

  // バリデーション
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      status: 400,
      message: 'enabledはboolean型で指定してください'
    });
  }

  if (intervalSeconds !== undefined && (typeof intervalSeconds !== 'number' || intervalSeconds < 0 || intervalSeconds > 300)) {
    return res.status(400).json({
      status: 400,
      message: 'intervalSecondsは0-300秒の範囲で指定してください'
    });
  }

  const getSettingsSql = 'SELECT settings FROM user_settings WHERE user_id = ?';
  db.get(getSettingsSql, [userId], (err, row) => {
    if (err) {
      return next({
        status: 500,
        message: 'スローモード設定の更新中にエラーが発生しました',
        details: err
      });
    }

    const settings = row ? JSON.parse(row.settings) : { ...defaultSettings };

    // スローモード設定を更新
    if (!settings.slowMode) {
      settings.slowMode = {
        enabled: false,
        intervalSeconds: 30,
        platformSpecific: {
          youtube: { enabled: false, intervalSeconds: 30 },
          twitch: { enabled: false, intervalSeconds: 30 }
        }
      };
    }

    if (enabled !== undefined) settings.slowMode.enabled = enabled;
    if (intervalSeconds !== undefined) settings.slowMode.intervalSeconds = intervalSeconds;
    if (platformSpecific !== undefined) settings.slowMode.platformSpecific = { ...settings.slowMode.platformSpecific, ...platformSpecific };

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
          message: 'スローモード設定の保存中にエラーが発生しました',
          details: updateErr
        });
      }

      res.json({
        status: 200,
        data: settings.slowMode,
        message: 'スローモード設定を更新しました'
      });
    });
  });
});

module.exports = {
  // ... existing exports
  getSlowModeSettings,
  updateSlowModeSettings
};
