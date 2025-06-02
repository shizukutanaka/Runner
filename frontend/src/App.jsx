import React from 'react';
import Dashboard from './components/Dashboard';
import { ThemeProvider, useThemeMode } from './ThemeContext';
import { AppBar, Toolbar, Typography, IconButton } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

function AppInner() {
  const { mode, toggleTheme } = useThemeMode();
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            YouTube & Twitch コメント管理ダッシュボード
          </Typography>
          <IconButton color="inherit" onClick={toggleTheme}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Dashboard />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
