import axios from 'axios';
import { APIError } from './comments';

const handleUserAPIError = (error, defaultMessage) => {
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.error?.message || data?.message || defaultMessage;
    throw new APIError(message, status, data?.error?.details);
  }
  if (error.request) {
    throw new APIError('ネットワークエラーが発生しました', 0);
  }
  throw new APIError(error.message || defaultMessage, 500);
};

// ユーザー一覧取得（検索・フィルタ・ページネーション対応）
export const fetchUsers = async (options = {}) => {
  try {
    const res = await axios.get('/api/users', { params: options });
    return res.data.data;
  } catch (error) {
    handleUserAPIError(error, 'ユーザー一覧の取得に失敗しました');
  }
};

export const fetchUser = async (id) => {
  try {
    const res = await axios.get(`/api/users/${id}`);
    return res.data.data;
  } catch (error) {
    handleUserAPIError(error, 'ユーザー情報の取得に失敗しました');
  }
};

export const updateUser = async (id, data) => {
  try {
    const res = await axios.put(`/api/users/${id}`, data);
    return res.data.data;
  } catch (error) {
    handleUserAPIError(error, 'ユーザー情報の更新に失敗しました');
  }
};

export const fetchUserHistory = async (id) => {
  try {
    const res = await axios.get(`/api/users/${id}/history`);
    return res.data.data;
  } catch (error) {
    handleUserAPIError(error, 'ユーザー履歴の取得に失敗しました');
  }
};
