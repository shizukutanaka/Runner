import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Stack, TextField, Button, Alert, List, ListItem, ListItemText, IconButton,
} from '@mui/material';
import { Stop as StopIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  extractYouTubeVideoId, getYouTubeWatches, startYouTubeWatch, stopYouTubeWatch,
} from '../api/youtube';

// 取り込みを始める唯一の入口。これが無いと POST /api/youtube/watch を
// 手で叩かない限り、ダッシュボードには1件もコメントが流れない
const REASON_MESSAGES = {
  disabled: 'YOUTUBE_API_KEY が未設定です。backend/.env に設定して再起動してください。',
  not_live: 'この動画は現在ライブ配信中ではありません（アクティブなライブチャットがありません）。',
  quota_exceeded: '本日の YouTube API クォータを使い切りました。',
  lookup_failed: 'YouTube API への問い合わせに失敗しました。APIキーを確認してください。',
  already_watching: 'この配信はすでに監視中です。',
};

export default function LiveChatWatchPanel() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getYouTubeWatches());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStart = async (event) => {
    event.preventDefault();
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) {
      setError(t('live_watch_invalid_input', 'YouTube の配信URLまたは11文字の動画IDを入力してください。'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startYouTubeWatch(videoId);
      setInput('');
      await refresh();
    } catch (err) {
      setError(REASON_MESSAGES[err.reason] || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (videoId) => {
    setError(null);
    try {
      await stopYouTubeWatch(videoId);
    } catch (err) {
      setError(err.message);
    }
    await refresh();
  };

  const watches = status?.watches || [];

  return (
    <Paper sx={{ p: 2 }} component="section" aria-labelledby="live-watch-title">
      <Typography id="live-watch-title" variant="h6" gutterBottom>
        {t('live_watch_title', 'ライブチャットの監視')}
      </Typography>
      {status?.enabled === false && (
        <Alert severity="warning" sx={{ mb: 1 }}>{REASON_MESSAGES.disabled}</Alert>
      )}
      <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={handleStart}>
        <TextField
          size="small"
          fullWidth
          label={t('live_watch_input_label', 'YouTube の配信URLまたは動画ID')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" variant="contained" disabled={busy || !input.trim()}>
          {t('live_watch_start', '監視を開始')}
        </Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {watches.length > 0 && (
        <List dense>
          {watches.map((w) => (
            <ListItem
              key={w.videoId}
              secondaryAction={(
                <IconButton
                  edge="end"
                  aria-label={`${t('live_watch_stop', '監視を停止')} ${w.videoId}`}
                  onClick={() => handleStop(w.videoId)}
                >
                  <StopIcon />
                </IconButton>
              )}
            >
              <ListItemText primary={`YouTube: ${w.videoId}`} secondary={w.startedAt} />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
