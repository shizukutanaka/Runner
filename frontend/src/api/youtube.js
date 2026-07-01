import axios from 'axios';
import { APIError } from './comments';

const handleYoutubeAPIError = (error, defaultMessage) => {
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

export const findRelatedVideosFromComments = async (comments) => {
  try {
    const res = await axios.post('/api/youtube/related-videos', { comments });
    return res.data;
  } catch (error) {
    handleYoutubeAPIError(error, '関連動画の取得に失敗しました');
  }
};
