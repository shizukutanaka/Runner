import React, { useEffect, useRef } from 'react';
import { useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from './i18n';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionStatus from './components/ConnectionStatus';
import CriticalAlertsBanner from './components/CriticalAlertsBanner';
import LanguageSwitcher from './components/LanguageSwitcher';
import { ThemeProvider, useThemeMode } from './ThemeContext';
import { AppBar, Toolbar, Typography, IconButton, Box, CssBaseline, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTheme } from '@mui/material/styles';

// アクセシビリティフック
const useAccessibility = () => {
  const { t } = useTranslation();
  const [skipLinkTarget, setSkipLinkTarget] = useState(null);

  useEffect(() => {
    // スキップリンクターゲットを設定
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      setSkipLinkTarget(mainContent);
    }
  }, []);

  const focusableElements = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  const trapFocus = (element) => {
    const focusableContent = element.querySelectorAll(focusableElements);
    const firstFocusableElement = focusableContent[0];
    const lastFocusableElement = focusableContent[focusableContent.length - 1];

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusableElement) {
          lastFocusableElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusableElement) {
          firstFocusableElement.focus();
          e.preventDefault();
        }
      }
    };

    element.addEventListener('keydown', handleTabKey);
    return () => element.removeEventListener('keydown', handleTabKey);
  };

  return {
    t,
    skipLinkTarget,
    trapFocus
  };
};

function AppInner() {
  const { mode, toggleTheme } = useThemeMode();
  const { t, skipLinkTarget } = useAccessibility();
  const mainContentRef = useRef(null);
  const drawerWidth = 240;

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.focus();
    }
  }, []);

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* スキップリンク */}
      {skipLinkTarget && (
        <a
          href="#main-content"
          style={{
            position: 'absolute',
            top: '-40px',
            left: '6px',
            background: '#000',
            color: '#fff',
            padding: '8px',
            textDecoration: 'none',
            borderRadius: '4px',
            zIndex: 1301, // AppBarより手前に表示
            transition: 'top 0.3s'
          }}
          onFocus={() => {
            const link = document.querySelector('[href="#main-content"]');
            if (link) link.style.top = '6px';
          }}
          onBlur={() => {
            const link = document.querySelector('[href="#main-content"]');
            if (link) link.style.top = '-40px';
          }}
        >
          {t('skip_to_main_content', 'メインコンテンツにスキップ')}
        </a>
      )}

      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: 'background.default',
          color: 'text.primary',
          boxShadow: 'none',
          borderBottom: 1,
          borderColor: 'divider',
        }}
        role="banner"
        aria-label={t('main_navigation', 'メインナビゲーション')}
      >
        <Toolbar sx={{ px: 3, minHeight: 64 }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              color: 'text.primary',
              letterSpacing: '-0.025em',
            }}
            id="app-title"
          >
            YouTube & Twitch コメント管理ダッシュボード
          </Typography>
          <IconButton
            color="inherit"
            onClick={toggleTheme}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
            aria-label={mode === 'dark'
              ? t('switch_to_light_mode', 'ライトモードに切り替え')
              : t('switch_to_dark_mode', 'ダークモードに切り替え')
            }
            aria-pressed={mode === 'dark'}
          >
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: '64px', // AppBarの下に配置
            height: 'calc(100% - 64px)',
            borderRight: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper'
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 1 }}>
          <List>
            <ListItem disablePadding>
              <ListItemButton>
                <ListItemIcon>
                  <DashboardIcon />
                </ListItemIcon>
                <ListItemText primary={t('dashboard', 'ダッシュボード')} />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton>
                <ListItemIcon>
                  <SettingsIcon />
                </ListItemIcon>
                <ListItemText primary={t('settings', '設定')} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        ref={mainContentRef}
        id="main-content"
        tabIndex={-1}
        role="main"
        aria-labelledby="app-title"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: '64px', // AppBarの高さ分
          ml: `${drawerWidth}px`, // Drawerの幅分
          outline: 'none',
          overflowY: 'auto'
        }}
      >
        <ErrorBoundary>
          <Dashboard />
        </ErrorBoundary>
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <>
      <CssBaseline />
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            <div id="app-root" role="application" aria-label="YouTube & Twitchコメント管理アプリケーション">
              <CriticalAlertsBanner />
              <LanguageSwitcher />
              <AppInner />
              <ConnectionStatus />
            </div>
          </ThemeProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </>
  );
}
