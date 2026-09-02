import axios from 'axios';
import { handleAPIError } from './comments';

// API ベースURL設定（Vite環境変数）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// 設定取得
export const getSettings = async (userId) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/settings/user/${userId}`);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '設定の取得に失敗しました');
  }
};

// 設定更新
export const updateSettings = async (userId, settings) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/settings/user/${userId}`, settings);
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '設定の更新に失敗しました');
  }
};
