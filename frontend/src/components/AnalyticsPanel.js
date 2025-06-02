import React from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';

export default function AnalyticsPanel() {
  const theme = useTheme();
  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>分析パネル</Typography>
      <Paper sx={{ p: 2, mb: 2, bgcolor: theme.palette.background.paper }}>
        <Typography variant="body2">
          （ここにコメント・ユーザーの統計やグラフが表示されます）
        </Typography>
      </Paper>
    </Box>
  );
}
