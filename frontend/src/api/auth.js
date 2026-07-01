import axios from 'axios';
import { APIError } from './comments';
import { tokenStorage } from '../utils/tokenStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const handleAuthAPIError = (error, defaultMessage) => {
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.error || data?.message || defaultMessage;
    throw new APIError(message, status, data?.details);
  }
  if (error.request) {
    throw new APIError('ネットワークエラーが発生しました', 0);
  }
  throw new APIError(error.message || defaultMessage, 500);
};

export const login = async (username, password) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/users/login`, { username, password });
    if (res.data.token) {
      tokenStorage.set(res.data.token);
    }
    return res.data;
  } catch (error) {
    handleAuthAPIError(error, 'ログインに失敗しました');
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
  try {
    await axios.post(`${API_BASE_URL}/users/logout`);
  } catch {
    // ログアウトはベストエフォート: サーバー側エラーがあってもクライアント側トークンは破棄する
  } finally {
    tokenStorage.remove();
  }
};
