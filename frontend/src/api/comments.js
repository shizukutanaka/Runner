import axios from 'axios';

// API ベースURL設定（Vite環境変数）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return;
      }
      query.append(key, trimmed);
      return;
    }

    query.append(key, value);
  });
  return query.toString();
};

// カスタムエラークラス
export class APIError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

// エラーハンドリングヘルパー
const handleAPIError = (error, defaultMessage = 'API エラーが発生しました') => {
  if (error.response) {
    // サーバーからのエラーレスポンス
    const { status, data } = error.response;
    const message = data?.message || defaultMessage;
    const details = data?.details || null;

    throw new APIError(message, status, details);
  } else if (error.request) {
    // ネットワークエラー
    throw new APIError('ネットワークエラーが発生しました', 0, 'サーバーに接続できません');
  } else {
    // その他のエラー
    throw new APIError(error.message || defaultMessage, 0, error);
  }
};

// リクエストインターセプター
axios.interceptors.request.use(
  (config) => {
    // リクエスト前に実行する処理（例: 認証トークンの追加）
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// レスポンスインターセプター
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // 認証エラーの場合、ログアウト処理
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const fetchComments = async (platform, options = {}) => {
  try {
    const queryString = buildQueryString({
      platform,
      ...options
    });

    const url = queryString
      ? `${API_BASE_URL}/comments?${queryString}`
      : `${API_BASE_URL}/comments`;

    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントの取得に失敗しました');
  }
};

export const postComment = async (data) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/comments`, {
      ...data,
      timestamp: new Date().toISOString()
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントの投稿に失敗しました');
  }
};

export const updateComment = async (id, data) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/comments/${id}`, data);
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントの更新に失敗しました');
  }
};

export const deleteComment = async (id) => {
  try {
    const res = await axios.delete(`${API_BASE_URL}/comments/${id}`);
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントの削除に失敗しました');
  }
};

// AI要約API: コメント配列を送って要約テキストを取得
export const fetchCommentsSummary = async (comments) => {
  try {
    if (!Array.isArray(comments) || comments.length === 0) {
      throw new APIError('コメントデータが不正です', 400);
    }

    const res = await axios.post(`${API_BASE_URL}/comments/summary`, {
      comments: comments.slice(0, 50) // 最大50件に制限
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, 'コメント要約の取得に失敗しました');
  }
};

// AI自動Q&AボットAPI: コメントテキストを送ってFAQまたはAI応答を取得
export const fetchAutoAnswer = async (comment) => {
  try {
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      throw new APIError('コメントが不正です', 400);
    }

    const res = await axios.post(`${API_BASE_URL}/comments/auto-answer`, {
      comment: comment.trim().substring(0, 1000) // 最大1000文字に制限
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '自動応答の取得に失敗しました');
  }
};

// コメントリアクション追加
export const addCommentReaction = async (commentId, reactionType) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/comments/${commentId}/reaction`, {
      reactionType
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, 'リアクションの追加に失敗しました');
  }
};

// コメントタグ追加
export const addCommentTag = async (commentId, tag) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/comments/${commentId}/tag`, {
      tag
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, 'タグの追加に失敗しました');
  }
};

// コメントピン固定
export const pinComment = async (commentId, pinned = true) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/comments/${commentId}/pin`, {
      pinned
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントのピン固定に失敗しました');
  }
};

// コメントモデレーション
export const moderateComment = async (commentId, action, reason) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/comments/${commentId}/moderate`, {
      action,
      reason,
      timestamp: new Date().toISOString()
    });
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントのモデレーションに失敗しました');
  }
};

// コメント検索
export const searchComments = async (query, filters = {}) => {
  try {
    const params = new URLSearchParams({
      q: query,
      ...filters
    });

    const res = await axios.get(`${API_BASE_URL}/comments/search?${params}`);
    return res.data;
  } catch (error) {
    handleAPIError(error, 'コメントの検索に失敗しました');
  }
};

// コメント統計取得
export const getCommentStats = async (timeframe = '24h') => {
  try {
    const res = await axios.get(`${API_BASE_URL}/comments/stats?timeframe=${timeframe}`);
    return res.data;
  } catch (error) {
    handleAPIError(error, '統計データの取得に失敗しました');
  }
};
