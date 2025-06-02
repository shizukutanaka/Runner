import axios from 'axios';

export const fetchComments = async (platform) => {
  const res = await axios.get(`/api/comments?platform=${platform}`);
  return res.data;
};

export const postComment = async (data) => {
  return axios.post('/api/comments', data);
};

export const updateComment = async (id, data) => {
  return axios.put(`/api/comments/${id}`, data);
};

// AI要約API: コメント配列を送って要約テキストを取得
export const fetchCommentsSummary = async (comments) => {
  const res = await axios.post('/api/comments/summary', { comments });
  return res.data.data;
};

// AI自動Q&AボットAPI: コメントテキストを送ってFAQまたはAI応答を取得
export const fetchAutoAnswer = async (comment) => {
  const res = await axios.post('/api/comments/auto-answer', { comment });
  return res.data.data;
};
