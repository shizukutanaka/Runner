import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function Register({ onRegister, onSwitchToLogin }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRegister(username.trim(), email.trim(), password);
    } catch (err) {
      setError(err?.message || t('register_error', 'アカウント登録に失敗しました'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 4, width: 360, borderRadius: 2 }} elevation={3}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
          {t('register_title', 'アカウント作成')}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label={t('register_username', 'ユーザー名')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            margin="normal"
            autoComplete="username"
            autoFocus
            disabled={submitting}
          />
          <TextField
            label={t('register_email', 'メールアドレス')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
            autoComplete="email"
            disabled={submitting}
          />
          <TextField
            label={t('register_password', 'パスワード')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
            autoComplete="new-password"
            disabled={submitting}
            helperText={t('register_password_hint', '12文字以上、大文字・小文字・数字・記号を含めてください')}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            sx={{ mt: 3 }}
            disabled={submitting || !username.trim() || !email.trim() || !password}
          >
            {submitting ? <CircularProgress size={24} color="inherit" /> : t('register_submit', 'アカウント作成')}
          </Button>
        </Box>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link component="button" type="button" variant="body2" onClick={onSwitchToLogin} disabled={submitting}>
            {t('register_switch_to_login', 'すでにアカウントをお持ちの方はこちら')}
          </Link>
        </Box>
      </Paper>
    </Box>
  );
}
