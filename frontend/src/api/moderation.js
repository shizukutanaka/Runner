import axios from 'axios';
import { handleAPIError } from './comments';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// 保留メッセージ一覧取得
export const fetchHeldMessages = async (status = 'pending', limit = 50, offset = 0) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/moderation/held-messages`, {
      params: { status, limit, offset }
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '保留メッセージの取得に失敗しました');
  }
};

// 保留メッセージ統計取得
export const fetchHeldMessageStats = async (period = '24h') => {
  try {
    const res = await axios.get(`${API_BASE_URL}/moderation/held-messages/stats`, {
      params: { period }
    });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '保留メッセージ統計の取得に失敗しました');
  }
};

// 保留メッセージ1件の承認/却下/エスカレート
export const processHeldMessage = async (holdId, action, reason) => {
  try {
    const res = await axios.put(`${API_BASE_URL}/moderation/held-messages/${holdId}`, { action, reason });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '保留メッセージの処理に失敗しました');
  }
};

// 保留メッセージの一括承認/却下
export const bulkProcessHeldMessages = async (holdIds, action, reason) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/moderation/held-messages/bulk`, { holdIds, action, reason });
    return res.data.data;
  } catch (error) {
    handleAPIError(error, '保留メッセージの一括処理に失敗しました');
  }
};
