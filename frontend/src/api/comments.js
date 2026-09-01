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
export const handleAPIError = (error, defaultMessage = 'API エラーが発生しました') => {
  if (error.response) {
    // サーバーからのエラーレスポンス
    const { status, data } = error.response;
    // バックエンドのエラー応答形状は2種類混在している:
    // middleware/validation.js経由の400は {message, details} のフラット形、
    // errorHandler.js経由の一般的なエラー（404/500等）は {error: {message}} のネスト形。
    // 後者のみ考慮すると常にdefaultMessageにフォールバックし、実際のエラー内容が
    // 画面に一切表示されなかった（バックエンドは正しくメッセージを返していたのに握りつぶされていた）
    const message =
      (typeof data?.error === 'string' && data.error) ||
      data?.error?.message ||
      data?.message ||
      defaultMessage;
    const details = data?.details || data?.error?.details || null;

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
// D-7: 認証は httpOnly Cookie。ブラウザが自動送信するので Authorization ヘッダーは
// 組み立てない。`withCredentials` を立てないとCookieが送られないので必須
axios.interceptors.request.use(
  (config) => {
    config.withCredentials = true;
    return config;
  },
  (error) => Promise.reject(error)
);

// レスポンスインターセプター:
// 401受信時、まだ再試行していないリクエストに限り一度だけリフレッシュを試み、
// 成功すれば元のリクエストを再実行する。失敗時のみログイン画面へ。
//
// **D-7 で踏んだ無限ループ**: Cookie方式では未ログインか否かをJSから判定できないため、
// `useAuth` は起動時に必ず `GET /users/me` を投げる。ログイン画面では当然401になり、
// このインターセプタが「リフレッシュ→失敗→/login へ遷移」を実行し、
// 遷移先で再び `useAuth` が走って**リロードが永久に繰り返される**（実測で確認）。
// 対策は2つ:
//   1. セッション確認の問い合わせは `_isSessionProbe` を立てて再試行対象から外す
//   2. 既に /login にいる場合は遷移しない（そもそもループの余地を無くす）
const redirectToLogin = () => {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = config?.url?.includes('/users/login') || config?.url?.includes('/users/refresh');
    const isSessionProbe = Boolean(config?._isSessionProbe);

    if (response?.status === 401 && config && !config._retriedAfterRefresh
        && !isAuthEndpoint && !isSessionProbe) {
      config._retriedAfterRefresh = true;
      // 循環import回避のため動的import（auth.jsはcomments.jsのAPIErrorを参照するため）
      const { refreshAccessToken } = await import('./auth');
      // D-7: 更新後のトークンはサーバーがCookieに載せ替える。
      // クライアントは成功したかどうかだけを見て、そのまま再実行すればよい
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        return axios(config);
      }

      // D-7: Cookieの失効はサーバー側で行われる。クライアントは遷移するだけ
      redirectToLogin();
      return Promise.reject(error);
    }

    // セッション確認の401は「未ログイン」を意味するだけなので、遷移も再試行もしない
    if (response?.status === 401 && !isSessionProbe) {
      redirectToLogin();
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

// バックエンドの DELETE /comments/:id は reason と reasonCategory を必須とする
// （Joiバリデーション）。ボディを送らないと 400 になるため、必ず渡す
export const deleteComment = async (id, { reason = 'moderator action', reasonCategory = 'other', evidence } = {}) => {
  try {
    const res = await axios.delete(`${API_BASE_URL}/comments/${id}`, {
      data: { reason, reasonCategory, ...(evidence ? { evidence } : {}) }
    });
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

// ダッシュボードの分析タブ用の集計。
//
// **経緯**: 以前ここには `getCommentStats()` があり `/api/comments/stats` を叩いていたが、
// **そのエンドポイントはバックエンドに存在しない**。つまり分析タブは常に404を受け取り、
// 毎回デモデータ（ハードコードされた1240件等）にフォールバックしていた。
// 「APIが利用不可のためデモデータを表示しています」というバナーは出るものの、
// **一度も実データを表示したことがなかった**。
//
// 実在する分析エンドポイントを合成して、表示できるものは実データにする。
// バックエンドが持っていない指標（時系列のプラットフォーム別内訳・感情分布）は
// **捏造せず null を返し**、UI側で「データなし」として扱う。
export const fetchAnalyticsOverview = async () => {
  const [statsRes, graphRes, modRes] = await Promise.allSettled([
    axios.get(`${API_BASE_URL}/analytics/stats`),
    axios.get(`${API_BASE_URL}/analytics/graph`),
    axios.get(`${API_BASE_URL}/analytics/moderation`)
  ]);

  const ok = (r) => (r.status === 'fulfilled' ? r.value.data : null);
  const stats = ok(statsRes);
  const graph = ok(graphRes);
  const mod = ok(modRes);

  // 3つすべて失敗した場合のみ「取得不能」とする（部分的に取れたら実データを出す）
  if (!stats && !graph && !mod) {
    const err = new Error('分析データを取得できませんでした');
    err.allFailed = true;
    throw err;
  }

  const flagged = mod?.stats?.flagged ?? null;
  const passed = mod?.stats?.passed ?? null;
  const totalJudged = flagged !== null && passed !== null ? flagged + passed : null;

  return {
    total: stats?.commentCount ?? null,
    activeUsers: stats?.activeUsers ?? null,
    bannedUsers: stats?.bannedCount ?? null,
    mutedUsers: stats?.mutedCount ?? null,
    userCount: stats?.userCount ?? null,
    moderated: flagged,
    moderationRate: totalJudged ? Math.round((flagged / totalJudged) * 100) : null,
    byStatus: mod?.stats?.byStatus ?? null,
    // 日別のコメント数とBAN数（バックエンドが実際に返す唯一の時系列）
    timelineLabels: graph?.labels ?? null,
    timelineComments: graph?.comments ?? null,
    timelineBans: graph?.bans ?? null
  };
};
