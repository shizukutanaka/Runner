import React, { useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Alert, Snackbar, Stack } from '@mui/material';
import { useModerationSettings } from '../hooks/useModerationSettings';

export default function SettingsPanel({ platform = 'YouTube' }) {
  const { settings, loading, error, saveSettings } = useModerationSettings(platform);
  const [localSettings, setLocalSettings] = useState(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState(null);

  React.useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const handleChange = (field) => (e) => {
    setLocalSettings({ ...localSettings, [field]: e.target.value });
  };

  const handleSave = async () => {
    setValidationError(null);
    // バリデーション例
    if (!localSettings) return;
    if (!localSettings.bannedWords || localSettings.bannedWords.split(',').some(w => w.trim() === '')) {
      setValidationError('NGワードはカンマ区切りで入力してください');
      return;
    }
    await saveSettings({
      ...localSettings,
      bannedWords: localSettings.bannedWords.split(',').map(w => w.trim()),
    });
    setSuccess(true);
  };

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>AIモデレーション設定</Typography>
      {loading && <CircularProgress sx={{ m: 2 }} />}
      {error && <Alert severity="error">設定の取得に失敗しました</Alert>}
      {validationError && <Alert severity="error">{validationError}</Alert>}
      {localSettings && (
        <Stack spacing={2}>
          <TextField
            label="NGワード（カンマ区切り）"
            value={localSettings.bannedWords || ''}
            onChange={handleChange('bannedWords')}
            fullWidth
          />
          <TextField
            label="スパム閾値"
            type="number"
            value={localSettings.thresholds?.spam || ''}
            onChange={e => setLocalSettings({
              ...localSettings,
              thresholds: { ...localSettings.thresholds, spam: Number(e.target.value) }
            })}
            fullWidth
          />
          <TextField
            label="暴言閾値"
            type="number"
            value={localSettings.thresholds?.offensive || ''}
            onChange={e => setLocalSettings({
              ...localSettings,
              thresholds: { ...localSettings.thresholds, offensive: Number(e.target.value) }
            })}
            fullWidth
          />
          <TextField
            label="広告閾値"
            type="number"
            value={localSettings.thresholds?.advertising || ''}
            onChange={e => setLocalSettings({
              ...localSettings,
              thresholds: { ...localSettings.thresholds, advertising: Number(e.target.value) }
            })}
            fullWidth
          />
          <Button variant="contained" onClick={handleSave}>保存</Button>
        </Stack>
      )}
      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        message="設定を保存しました"
      />
    </Box>
  );
}
