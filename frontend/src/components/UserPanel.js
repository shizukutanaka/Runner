import React, { useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useUser } from '../hooks/useUser';
import { updateUser } from '../api/users';

// 仮のユーザーIDリスト（本来はAPIで取得）
const userIds = ['user1', 'user2'];

export default function UserPanel() {
  const [selectedId] = useState(userIds[0]);
  const { user, history, loading, error } = useUser(selectedId);
  const [banDialog, setBanDialog] = useState(false);
  const [muteDialog, setMuteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { t } = useTranslation();

  const handleAction = async (type) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await updateUser(selectedId, { action: type });
      setBanDialog(false);
      setMuteDialog(false);
    } catch (e) {
      setActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', p: { xs: 1, sm: 2 } }}>
        <Alert severity="error">{t('user_panel_load_error')}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>{t('user_panel_title')}</Typography>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {t('user_panel_action_error')}
        </Alert>
      )}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography>{t('user_panel_username', { name: user?.name ?? t('user_panel_unknown') })}</Typography>
        <Typography>{t('user_panel_status', { status: user?.status ?? t('user_panel_unknown') })}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
          <Button variant="outlined" color="error" disabled={actionLoading} onClick={() => setBanDialog(true)}>{t('user_panel_action_ban')}</Button>
          <Button variant="outlined" color="warning" disabled={actionLoading} onClick={() => setMuteDialog(true)}>{t('user_panel_action_mute')}</Button>
        </Stack>
      </Paper>
      <Typography variant="subtitle1">{t('user_panel_history')}</Typography>
      <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
        {history?.map(h => (
          <Paper key={h.id} sx={{ p: 1, mb: 1 }}>
            <Typography variant="body2">{h.action} - {h.timestamp}</Typography>
          </Paper>
        ))}
      </Box>
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
