import axios from 'axios';
import { APIError } from './comments';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const handleYoutubeAPIError = (error, defaultMessage) => {
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.error?.message || data?.message || defaultMessage;
    const apiError = new APIError(message, status, data?.error?.details);
    // POST /youtube/watch は失敗理由を data.reason（disabled / not_live 等）で返す
    apiError.reason = data?.data?.reason || null;
    throw apiError;
  }
  if (error.request) {
    throw new APIError('ネットワークエラーが発生しました', 0);
  }
  throw new APIError(error.message || defaultMessage, 500);
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// 配信者がブラウザのアドレスバーからそのまま貼る形（watch?v= / youtu.be / live/ / shorts/）
// を受け付け、動画IDだけを取り出す。取り出せなければ null
export const extractYouTubeVideoId = (input) => {
  const text = String(input ?? '').trim();
  if (VIDEO_ID.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let candidate = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'studio.youtube.com') {
    candidate = url.searchParams.get('v')
      || url.pathname.match(/^\/(?:live|shorts|embed|video)\/([^/?#]+)/)?.[1];
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
};

export const getYouTubeWatches = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/youtube/watch`);
    return res.data.data;
  } catch (error) {
    handleYoutubeAPIError(error, '監視状況の取得に失敗しました');
  }
};

export const startYouTubeWatch = async (videoId) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/youtube/watch`, { videoId });
    return res.data.data;
  } catch (error) {
    handleYoutubeAPIError(error, 'ライブチャットの監視を開始できませんでした');
  }
};

export const stopYouTubeWatch = async (videoId) => {
  try {
    await axios.delete(`${API_BASE_URL}/youtube/watch/${encodeURIComponent(videoId)}`);
  } catch (error) {
    handleYoutubeAPIError(error, 'ライブチャットの監視を停止できませんでした');
  }
};
