import axios from 'axios';
import { APIError } from './comments';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const handleAuthAPIError = (error, defaultMessage) => {
  if (error.response) {
    const { status, data } = error.response;
    // バックエンドのエラー応答形状は2種類混在している:
    // middleware/validation.js経由の400は {message: "..."} のフラット形、
    // errorHandler.js経由の一般的なエラー（404/500等）は {error: {message: "..."}} のネスト形。
    // data.errorが文字列ならフラット形と誤認される旧実装の想定に合わせつつ、
    // オブジェクト形の場合はネストされたmessageを取り出す（以前は[object Object]と表示されていた）
    const message =
      (typeof data?.error === 'string' && data.error) ||
      data?.error?.message ||
      data?.message ||
      defaultMessage;
    throw new APIError(message, status, data?.details);
  }
  if (error.request) {
    throw new APIError('ネットワークエラーが発生しました', 0);
  }
  throw new APIError(error.message || defaultMessage, 500);
};

export const login = async (username, password) => {
  try {
    // D-7: サーバーが httpOnly Cookie を発行する。応答本文にもトークンは入っているが
    // （APIクライアント互換のため）、ブラウザ側では保存しない
    const res = await axios.post(
      `${API_BASE_URL}/users/login`, { username, password }, { withCredentials: true }
    );
    return res.data;
  } catch (error) {
    handleAuthAPIError(error, 'ログインに失敗しました');
  }
};

// アクセストークンの期限切れ時にリフレッシュトークンで再取得する。
// axiosのレスポンスインターセプター（comments.js）から401時に呼ばれる。
// 循環import回避のため、生のaxiosインスタンス（インターセプター未適用）を都度使う
export const refreshAccessToken = async () => {
  // D-7: リフレッシュトークンは httpOnly Cookie にある。クライアントからは読めないので
  // 本文には載せず、`withCredentials` でCookieを送るだけでよい。
  // 更新されたトークンもサーバーが Set-Cookie で差し替える。
  // 戻り値は「更新できたか」を表す真偽値（呼び出し側はそのまま再実行すればよい）
  try {
    const res = await axios.post(`${API_BASE_URL}/users/refresh`, {}, { withCredentials: true });
    return Boolean(res.data?.success);
  } catch {
    return false;
  }
};

export const register = async (username, email, password) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/users/register`, { username, email, password });
    return res.data;
  } catch (error) {
    handleAuthAPIError(error, 'アカウント登録に失敗しました');
  }
};

export const fetchCurrentAccount = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/users/me`);
    return res.data;
  } catch (error) {
    handleAuthAPIError(error, 'アカウント情報の取得に失敗しました');
  }
};

export const logout = async () => {
  // D-7: Cookieを消せるのはサーバーだけ（httpOnly なのでJSからは触れない）。
  // ログアウトの本体は POST /users/logout の Set-Cookie による失効指示である
  try {
    await axios.post(`${API_BASE_URL}/users/logout`, {}, { withCredentials: true });
  } catch {
    // ベストエフォート。失敗してもリフレッシュトークンはサーバー側で無効化を試みている
  }
};
