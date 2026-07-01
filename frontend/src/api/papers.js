import axios from 'axios';
import { APIError } from './comments';

const handlePapersAPIError = (error, defaultMessage) => {
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

export const findRelatedPapersFromComments = async (comments, source) => {
  try {
    const res = await axios.post('/api/papers/related-comments', { comments, source });
    return res.data;
  } catch (error) {
    handlePapersAPIError(error, '関連論文の取得に失敗しました');
  }
};
