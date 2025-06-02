import React from 'react';
import { Box, AppBar, Toolbar, Typography, Tabs, Tab, Paper, Stack, useMediaQuery } from '@mui/material';
import CommentTimeline from './CommentTimeline';
import UserPanel from './UserPanel';
import AnalyticsPanel from './AnalyticsPanel';
import SettingsPanel from './SettingsPanel';
import { useTheme } from '@mui/material/styles';

export default function Dashboard() {
  const [tab, setTab] = React.useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box sx={{ height: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            YouTube & Twitch コメント管理ダッシュボード
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        <Box sx={{ width: '100%', mt: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            centered={!isMobile}
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons={isMobile ? 'auto' : false}
            allowScrollButtonsMobile
          >
            <Tab label="コメント" />
            <Tab label="ユーザー" />
            <Tab label="分析" />
            <Tab label="設定" />
          </Tabs>
        </Paper>
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          {tab === 0 && <CommentTimeline />}
          {tab === 1 && <UserPanel />}
          {tab === 2 && <AnalyticsPanel />}
          {tab === 3 && <SettingsPanel />}
        </Box>
      </Box>
    </Box>
  );
}
