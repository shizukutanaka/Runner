import React, { useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, TextField, Button, Snackbar, Stack, IconButton } from '@mui/material';
import { useComments } from '../hooks/useComments';
import { postComment, updateComment, fetchAutoAnswer } from '../api/comments';
import PushPinIcon from '@mui/icons-material/PushPin';
import DeleteIcon from '@mui/icons-material/Delete';

const platformColors = {
  YouTube: '#e3f2fd',
  Twitch: '#f3e5f5',
};

import { fetchCommentsSummary } from '../api/comments';

export default function CommentTimeline({ platform = 'YouTube' }) {
  const { comments, loading, error } = useComments(platform);
  const [input, setInput] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [answeringId, setAnsweringId] = useState(null);
  const [aiAnswer, setAiAnswer] = useState({}); // { [commentId]: answer }

  // 最新コメント要約を定期取得
  React.useEffect(() => {
    let timer;
    async function updateSummary() {
      if (comments && comments.length > 0) {
        try {
          const summary = await fetchCommentsSummary(comments.slice(-30)); // 直近30件
          setSummaryText(summary);
        } catch (e) {
          setSummaryText('要約取得失敗');
        }
      } else {
        setSummaryText('コメントがありません');
      }
      timer = setTimeout(updateSummary, 12000); // 12秒ごとに更新
    }
    updateSummary();
    return () => clearTimeout(timer);
  }, [comments]);

  const handlePost = async () => {
    setPostError(null);
    if (!input.trim()) {
      setPostError('コメントを入力してください');
      return;
    }
    setPostLoading(true);
    try {
      await postComment({ platform, user: 'demoUser', content: input });
      setInput('');
      setSuccess(true);
      // TODO: コメント再取得やWebSocket即時反映
    } catch (e) {
      setPostError('投稿に失敗しました');
    } finally {
      setPostLoading(false);
    }
  };

  const handlePin = async (id) => {
    await updateComment(id, { action: 'pin' });
    setSuccess(true);
    // TODO: コメント再取得やWebSocket即時反映
  };

  const handleDelete = async (id) => {
    await updateComment(id, { action: 'delete' });
    setSuccess(true);
    // TODO: コメント再取得やWebSocket即時反映
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Paper elevation={2} sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
        <Typography variant="subtitle2" color="primary">AI要約（直近コメント）</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{summaryText}</Typography>
      </Paper>
      <Box>
        <Typography variant="h6" gutterBottom>コメントタイムライン</Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <TextField
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="コメントを入力..."
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handlePost}
            disabled={postLoading}
          >投稿</Button>
        </Stack>
        <Stack spacing={1}>
          {comments && comments.map((c) => (
            <Paper key={c.id} sx={{ p: 1.5, bgcolor: platformColors[c.platform] || '#fff', position: 'relative' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ flex: 1 }}>{c.content || c.text}</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    setAnsweringId(c.id);
                    try {
                      const answer = await fetchAutoAnswer(c.content || c.text);
                      setAiAnswer(prev => ({ ...prev, [c.id]: answer }));
                    } catch {
                      setAiAnswer(prev => ({ ...prev, [c.id]: 'AI応答失敗' }));
                    } finally {
                      setAnsweringId(null);
                    }
                  }}
                  disabled={answeringId === c.id}
                  sx={{ minWidth: 80 }}
                >AI回答</Button>
                <IconButton size="small" onClick={() => handlePin(c.id)}><PushPinIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => handleDelete(c.id)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
              {aiAnswer[c.id] && (
                <Paper variant="outlined" sx={{ p: 1, mt: 1, bgcolor: '#f1f8e9' }}>
                  <Typography variant="caption" color="secondary">AI回答</Typography>
                  <Typography variant="body2">{aiAnswer[c.id]}</Typography>
                </Paper>
              )}
            </Paper>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
