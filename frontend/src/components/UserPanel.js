import React, { useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useUser } from '../hooks/useUser';
import { updateUser } from '../api/users';

// 仮のユーザーIDリスト（本来はAPIで取得）
const userIds = ['user1', 'user2'];

export default function UserPanel() {
  const [selectedId, setSelectedId] = useState(userIds[0]);
  const { user, history, loading, error } = useUser(selectedId);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const handleAction = async (type) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await updateUser(selectedId, { action: type });
      setActionOpen(false);
    } catch (e) {

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>ユーザー情報</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography>ユーザー名: {user?.name}</Typography>
        <Typography>状態: {user?.status}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
          <Button variant="outlined" color="error" onClick={() => setBanDialog(true)}>BAN</Button>
          <Button variant="outlined" color="warning" onClick={() => setMuteDialog(true)}>ミュート</Button>
        </Stack>
      </Paper>
      <Typography variant="subtitle1">履歴</Typography>
      <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
        {history?.map(h => (
          <Paper key={h.id} sx={{ p: 1, mb: 1 }}>
            <Typography variant="body2">{h.action} - {h.timestamp}</Typography>
          </Paper>
        ))}
      </Box>
      <Dialog open={banDialog} onClose={() => setBanDialog(false)}>
        <DialogTitle>本当にBANしますか？</DialogTitle>
        <DialogContent>この操作は取り消せません。</DialogContent>
        <DialogActions>
          <Button onClick={() => setBanDialog(false)}>キャンセル</Button>
          <Button color="error" onClick={() => { banUser(); setBanDialog(false); }}>BAN</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={muteDialog} onClose={() => setMuteDialog(false)}>
        <DialogTitle>本当にミュートしますか？</DialogTitle>
        <DialogContent>ユーザーは一定期間コメントできなくなります。</DialogContent>
        <DialogActions>
          <Button onClick={() => setMuteDialog(false)}>キャンセル</Button>
          <Button color="warning" onClick={() => { muteUser(); setMuteDialog(false); }}>ミュート</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
