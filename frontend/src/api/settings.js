import axios from 'axios';
import { APIError, handleAPIError } from './comments';

// API ベースURL設定（Vite環境変数）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// 設定取得
export const getSettings = async (userId) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/${userId}`);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '設定の取得に失敗しました');
  }
};

// 設定更新
export const updateSettings = async (userId, settings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/${userId}`, settings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '設定の更新に失敗しました');
  }
};

// テーマ設定
export const setTheme = async (userId, theme) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/theme`, { theme });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'テーマ設定の更新に失敗しました');
  }
};

// 通知設定
export const setNotifications = async (userId, notificationSettings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/notifications`, notificationSettings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '通知設定の更新に失敗しました');
  }
};

// 言語設定
export const setLanguage = async (userId, language) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/default-language`, { language });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '言語設定の更新に失敗しました');
  }
};

// タイムゾーン設定
export const setTimezone = async (userId, timezone) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/timezone`, { timezone });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'タイムゾーン設定の更新に失敗しました');
  }
};

// UIカスタマイズ設定
export const setUICustomization = async (userId, customization) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/ui-custom`, customization);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'UIカスタマイズ設定の更新に失敗しました');
  }
};

// 自動バックアップ設定
export const setAutoBackup = async (userId, backupSettings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/auto-backup`, backupSettings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '自動バックアップ設定の更新に失敗しました');
  }
};

// 外部連携設定
export const setExternalIntegration = async (userId, service, credentials) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/external-integration`, {
      service,
      action: 'connect',
      credentials
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '外部連携設定の更新に失敗しました');
  }
};

// APIキー管理
export const manageApiKeys = async (userId, action, keyData) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/api-keys`, {
      action,
      ...keyData
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'APIキー管理に失敗しました');
  }
};

// 設定エクスポート
export const exportSettings = async (userId, format = 'json', includeSensitive = false) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/export`, {
      params: { format, includeSensitive },
      responseType: 'blob'
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, '設定のエクスポートに失敗しました');
  }
};

// 設定インポート
export const importSettings = async (userId, settingsData, merge = true) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/settings/import`, {
      settings: settingsData,
      merge
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '設定のインポートに失敗しました');
  }
};

// 管理者メール設定
export const setAdminEmail = async (userId, email) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/admin-email`, { email });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '管理者メール設定の更新に失敗しました');
  }
};

// バージョン情報取得
export const getVersion = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/version`);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'バージョン情報の取得に失敗しました');
  }
};

// 利用規約取得
export const getTerms = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/terms`);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '利用規約の取得に失敗しました');
  }
};

// ヘルプ取得
export const getHelp = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/help`);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'ヘルプの取得に失敗しました');
  }
};

// コメント最大文字数設定
export const setCommentMaxLength = async (userId, maxLength) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/comment-max-length`, { maxLength });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'コメント最大文字数設定の更新に失敗しました');
  }
};

// コメント自動翻訳設定
export const setAutoTranslation = async (userId, translationSettings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/auto-translation`, translationSettings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '自動翻訳設定の更新に失敗しました');
  }
};

// コメントピン固定数設定
export const setPinLimit = async (userId, limit) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/pin-limit`, { limit });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'ピン固定数設定の更新に失敗しました');
  }
};

// コメント自動削除時間設定
export const setAutoDeleteTime = async (userId, hours) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/auto-delete-time`, { hours });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '自動削除時間設定の更新に失敗しました');
  }
};

// NGワード自動追加設定
export const setAutoNGWordAddition = async (userId, ngWordSettings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/auto-ng-word`, ngWordSettings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'NGワード自動追加設定の更新に失敗しました');
  }
};

// AI閾値個別設定
export const setIndividualAIThreshold = async (userId, commentId, threshold) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/individual-ai-threshold`, {
      commentId,
      threshold
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'AI閾値個別設定の更新に失敗しました');
  }
};

// ユーザーごとのテーマ設定
export const setUserTheme = async (userId, themeSettings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/user-theme`, themeSettings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'ユーザーごとのテーマ設定の更新に失敗しました');
  }
};

// ユーザーごとのBAN理由記録
export const setBanReason = async (userId, targetUserId, reason, duration, moderatorNotes) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/ban-reason`, {
      targetUserId,
      reason,
      duration,
      moderatorNotes
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'BAN理由記録の更新に失敗しました');
  }
};

// ユーザーごとのミュート期間設定
export const setUserMuteDuration = async (userId, targetUserId, duration, reason) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/user-mute-duration`, {
      targetUserId,
      duration,
      reason
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'ミュート期間設定の更新に失敗しました');
  }
};

// ユーザーごとのコメント色設定
export const setUserCommentColor = async (userId, targetUserId, color, applyTo) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/user-comment-color`, {
      targetUserId,
      color,
      applyTo
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'コメント色設定の更新に失敗しました');
  }
};

// コメントごとのリアクション設定
export const setCommentReaction = async (userId, commentId, reactionType) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/comment-reaction`, {
      commentId,
      reactionType
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'リアクション設定の更新に失敗しました');
  }
};

// コメントごとのタグ付与
export const setCommentTag = async (userId, commentId, tag) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/comment-tag`, {
      commentId,
      tag
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'タグ設定の更新に失敗しました');
  }
};

// AI判定ログ取得
export const getAIModerationLogs = async (commentId, limit = 50, offset = 0) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/ai-moderation-logs/${commentId}`, {
      params: { limit, offset }
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'AI判定ログの取得に失敗しました');
  }
};

// コメント編集履歴取得
export const getCommentEditHistory = async (commentId, limit = 50, offset = 0) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/comment-edit-history/${commentId}`, {
      params: { limit, offset }
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'コメント編集履歴の取得に失敗しました');
  }
};
