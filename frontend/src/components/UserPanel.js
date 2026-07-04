import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { useUser } from '../hooks/useUser';
import { updateUser, fetchUsers } from '../api/users';

export default function UserPanel() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const { user, history, loading, error } = useUser(selectedId);
  const [banDialog, setBanDialog] = useState(false);
  const [muteDialog, setMuteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { t } = useTranslation();

  const loadUsers = useCallback(async (search) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await fetchUsers(search ? { search } : {});
      setUsers(data.users || []);
      setSelectedId((prev) => prev ?? data.users?.[0]?.id ?? null);
    } catch (err) {
      setUsersError(err?.message || t('user_panel_list_error', 'ユーザー一覧の取得に失敗しました'));
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, loadUsers]);

  const handleAction = async (type) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await updateUser(selectedId, { action: type });
      setBanDialog(false);
      setMuteDialog(false);
      loadUsers(searchTerm);
    } catch (e) {
      setActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>{t('user_panel_title')}</Typography>

      <TextField
        fullWidth
        size="small"
        placeholder={t('user_panel_search_placeholder', 'ユーザー名で検索')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {usersError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUsersError(null)}>
          {usersError}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Paper sx={{ width: { xs: '100%', sm: 240 }, maxHeight: 400, overflow: 'auto' }}>
          {usersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : users.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {t('user_panel_no_users', 'ユーザーが見つかりません')}
            </Typography>
          ) : (
            <List dense>
              {users.map((u) => (
                <ListItemButton
                  key={u.id}
                  selected={u.id === selectedId}
                  onClick={() => setSelectedId(u.id)}
                >
                  <ListItemText
                    primary={u.username}
                    secondary={u.platform}
                  />
                  <Chip
                    size="small"
                    label={u.status}
                    color={u.status === 'banned' ? 'error' : u.status === 'muted' ? 'warning' : 'default'}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>

        <Box sx={{ flex: 1 }}>
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
              {t('user_panel_action_error')}
            </Alert>
          )}

          {!selectedId ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {t('user_panel_select_prompt', '左の一覧からユーザーを選択してください')}
            </Typography>
          ) : loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">{t('user_panel_load_error')}</Alert>
          ) : (
            <>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography>{t('user_panel_username', { name: user?.username ?? t('user_panel_unknown') })}</Typography>
                <Typography>{t('user_panel_status', { status: user?.status ?? t('user_panel_unknown') })}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
                  <Button variant="outlined" color="error" disabled={actionLoading} onClick={() => setBanDialog(true)}>{t('user_panel_action_ban')}</Button>
                  <Button variant="outlined" color="warning" disabled={actionLoading} onClick={() => setMuteDialog(true)}>{t('user_panel_action_mute')}</Button>
                </Stack>
              </Paper>
              <Typography variant="subtitle1">{t('user_panel_history')}</Typography>
              <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
                {Array.isArray(history) && history.length > 0 ? (
                  history.map((h, index) => (
                    <React.Fragment key={h.id ?? index}>
                      <Paper sx={{ p: 1, mb: 1 }}>
                        <Typography variant="body2">{h.action} - {h.timestamp}</Typography>
                      </Paper>
                      {index < history.length - 1 && <Divider />}
                    </React.Fragment>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {t('user_panel_no_history', '履歴はありません')}
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      </Stack>

      <Dialog open={banDialog} onClose={() => setBanDialog(false)}>
        <DialogTitle>{t('user_panel_ban_confirm_title')}</DialogTitle>
        <DialogContent>{t('user_panel_ban_confirm_description')}</DialogContent>
        <DialogActions>
          <Button onClick={() => setBanDialog(false)}>{t('common_cancel')}</Button>
          <Button color="error" disabled={actionLoading} onClick={() => handleAction('ban')}>{t('user_panel_action_ban')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={muteDialog} onClose={() => setMuteDialog(false)}>
        <DialogTitle>{t('user_panel_mute_confirm_title')}</DialogTitle>
        <DialogContent>{t('user_panel_mute_confirm_description')}</DialogContent>
        <DialogActions>
          <Button onClick={() => setMuteDialog(false)}>{t('common_cancel')}</Button>
          <Button color="warning" disabled={actionLoading} onClick={() => handleAction('mute')}>{t('user_panel_action_mute')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
