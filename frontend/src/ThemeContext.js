import React, { createContext, useMemo, useState, useContext, useEffect, useCallback } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { setAutoDarkMode, setColorPattern } from './themeApi';

const ThemeContext = createContext();

export function useThemeMode() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  // Atlassian風カラートークン
  const atlassianColors = {
    light: {
      // Primary colors
      brand: {
        bold: '#0052CC', // Blue
        default: '#0065FF',
        subtle: '#4C9AFF',
      },
      neutral: {
        bold: '#172B4D',
        default: '#42526E',
        subtle: '#6B778C',
        subtlest: '#8993A4',
        subtlestBorder: '#DFE1E6',
        subtlestBackground: '#F4F5F7',
      },
      success: {
        bold: '#006644',
        default: '#00875A',
        subtle: '#57A55A',
      },
      warning: {
        bold: '#FF8B00',
        default: '#FFAB00',
        subtle: '#FFE380',
      },
      danger: {
        bold: '#DE350B',
        default: '#FF5630',
        subtle: '#FF8F73',
      },
      information: {
        bold: '#0065FF',
        default: '#4C9AFF',
        subtle: '#85B8FF',
      },
      discovery: {
        bold: '#8F73FF',
        default: '#998DD9',
        subtle: '#C0B6F2',
      },
      accent: {
        blue: '#4C9AFF',
        teal: '#00A3BF',
        purple: '#8F73FF',
        red: '#FF5630',
        orange: '#FFAB00',
        yellow: '#FFC400',
        green: '#36B37E',
        magenta: '#FF69B4',
      },
      background: {
        default: '#FFFFFF',
        subtle: '#F4F5F7',
        bold: '#FAFBFC',
      },
      border: {
        default: '#DFE1E6',
        bold: '#C1C7D0',
      },
      text: {
        default: '#172B4D',
        subtle: '#6B778C',
        subtlest: '#8993A4',
        inverse: '#FFFFFF',
      },
      icon: {
        default: '#42526E',
        subtle: '#6B778C',
        subtlest: '#8993A4',
        inverse: '#FFFFFF',
      },
      link: {
        default: '#0065FF',
        pressed: '#0052CC',
        visited: '#5E4DB2',
      },
    },
    dark: {
      // Dark mode adaptations
      brand: {
        bold: '#4C9AFF',
        default: '#85B8FF',
        subtle: '#B3D4FF',
      },
      neutral: {
        bold: '#FFFFFF',
        default: '#C7CEDB',
        subtle: '#8993A4',
        subtlest: '#6B778C',
        subtlestBorder: '#42526E',
        subtlestBackground: '#1D2125',
      },
      background: {
        default: '#1D2125',
        subtle: '#2C3E50',
        bold: '#344563',
      },
      border: {
        default: '#42526E',
        bold: '#6B778C',
      },
      text: {
        default: '#FFFFFF',
        subtle: '#C7CEDB',
        subtlest: '#8993A4',
        inverse: '#172B4D',
      },
      icon: {
        default: '#C7CEDB',
        subtle: '#8993A4',
        subtlest: '#6B778C',
        inverse: '#42526E',
      },
      link: {
        default: '#4C9AFF',
        pressed: '#85B8FF',
        visited: '#998DD9',
      },
      success: {
        bold: '#57A55A',
        default: '#36B37E',
        subtle: '#4C9AFF',
      },
      warning: {
        bold: '#FFAB00',
        default: '#FFC400',
        subtle: '#FFE380',
      },
      danger: {
        bold: '#FF5630',
        default: '#FF8F73',
        subtle: '#FFB3BA',
      },
      information: {
        bold: '#85B8FF',
        default: '#4C9AFF',
        subtle: '#B3D4FF',
      },
      discovery: {
        bold: '#998DD9',
        default: '#C0B6F2',
        subtle: '#D1C4F2',
      },
    },
  };

  // 基本設定
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('themeMode');
    return saved || 'light';
  });

  const [colors, setColors] = useState(() => {
    const saved = localStorage.getItem('themeColors');
    return saved ? JSON.parse(saved) : {
      primary: atlassianColors.light.brand.default,
      secondary: atlassianColors.light.accent.purple
    };
  });

  // レイアウト設定
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem('layoutSettings');
    return saved ? JSON.parse(saved) : {
      sidebarWidth: 280,
      headerHeight: 64,
      footerHeight: 72,
      containerPadding: 24,
      maxWidth: '1200px',
      spacing: 'normal'
    };
  });


  // アクセシビリティ設定
  const [accessibility, setAccessibility] = useState(() => {
    const saved = localStorage.getItem('accessibilitySettings');
    return saved ? JSON.parse(saved) : {
      fontSize: 'medium',
      highContrast: false,
      reduceAnimations: false,
      focusVisible: true,
      screenReader: false,
      keyboardNavigation: true
    };
  });

  // フォント設定
  const [fontSettings, setFontSettings] = useState(() => {
    const saved = localStorage.getItem('fontSettings');
    return saved ? JSON.parse(saved) : {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 16,
      lineHeight: 1.5,
      letterSpacing: 0,
      fontWeight: 'normal'
    };
  });

  // 拡大縮小設定
  const [zoomSettings, setZoomSettings] = useState(() => {
    const saved = localStorage.getItem('zoomSettings');
    return saved ? JSON.parse(saved) : {
      zoomLevel: 100,
      minZoom: 50,
      maxZoom: 200,
      step: 10,
      rememberZoom: true
    };
  });

  // ダークモード自動切替設定
  const [autoDarkMode, setAutoDarkMode] = useState(() => {
    const saved = localStorage.getItem('autoDarkModeSettings');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      schedule: {
        start: '22:00',
        end: '06:00'
      },
      locationBased: false,
      systemPreference: true
    };
  });

  // 通知バッジ設定
  const [notificationBadges, setNotificationBadges] = useState(() => {
    const saved = localStorage.getItem('notificationBadgeSettings');
    return saved ? JSON.parse(saved) : {
      enabled: true,
      position: 'top-right',
      showCount: true,
      maxCount: 99,
      animate: true,
      colors: {
        background: '#f44336',
        text: '#ffffff'
      }
    };
  });

  // ヘルプ表示設定
  const [helpSettings, setHelpSettings] = useState(() => {
    const saved = localStorage.getItem('helpSettings');
    return saved ? JSON.parse(saved) : {
      showTooltips: true,
      showTutorials: true,
      showHints: true,
      helpPosition: 'bottom-right',
      autoShow: false,
      language: 'ja'
    };
  });

  // 言語切替設定
  const [languageSettings, setLanguageSettings] = useState(() => {
    const saved = localStorage.getItem('languageSettings');
    return saved ? JSON.parse(saved) : {
      currentLanguage: 'ja',
      fallbackLanguage: 'en',
      autoDetect: true,
      savePreference: true,
      rtlSupport: false
    };
  });

  // カスタムCSS設定
  const [customCSS, setCustomCSS] = useState(() => {
    const saved = localStorage.getItem('customCSS');
    return saved || '';
  });

  const [isLoading, setIsLoading] = useState(false);

  // システムダークモード検出
  useEffect(() => {
    if (autoDarkMode.systemPreference) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (autoDarkMode.enabled) {
          setMode(mediaQuery.matches ? 'dark' : 'light');
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [autoDarkMode]);

  // 時間ベースのダークモード切替
  useEffect(() => {
    if (autoDarkMode.enabled && autoDarkMode.schedule) {
      const checkTime = () => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMin] = autoDarkMode.schedule.start.split(':').map(Number);
        const [endHour, endMin] = autoDarkMode.schedule.end.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        const shouldBeDark = currentTime >= startTime || currentTime < endTime;
        setMode(shouldBeDark ? 'dark' : 'light');
      };

      const interval = setInterval(checkTime, 60000); // 1分ごとにチェック
      checkTime(); // 初回実行
      return () => clearInterval(interval);
    }
  }, [autoDarkMode]);

  const theme = useMemo(() => {
    const colors = atlassianColors[mode];

    const baseTheme = createTheme({
      palette: {
        mode,
        primary: {
          main: colors.brand.default,
          dark: colors.brand.bold,
          light: colors.brand.subtle,
          contrastText: colors.text.inverse,
        },
        secondary: {
          main: colors.accent.purple,
          dark: colors.discovery.bold,
          light: colors.discovery.subtle,
          contrastText: colors.text.inverse,
        },
        success: {
          main: colors.success.default,
          dark: colors.success.bold,
          light: colors.success.subtle,
          contrastText: colors.text.inverse,
        },
        warning: {
          main: colors.warning.default,
          dark: colors.warning.bold,
          light: colors.warning.subtle,
          contrastText: colors.text.default,
        },
        error: {
          main: colors.danger.default,
          dark: colors.danger.bold,
          light: colors.danger.subtle,
          contrastText: colors.text.inverse,
        },
        info: {
          main: colors.information.default,
          dark: colors.information.bold,
          light: colors.information.subtle,
          contrastText: colors.text.inverse,
        },
        background: {
          default: colors.background.default,
          paper: colors.background.subtle,
        },
        text: {
          primary: colors.text.default,
          secondary: colors.text.subtle,
          disabled: colors.text.subtlest,
        },
        divider: colors.border.default,
        action: {
          hover: colors.background.subtle,
          selected: colors.background.bold,
          disabled: colors.neutral.subtlest,
          disabledBackground: colors.background.subtle,
        },
      },
      typography: {
        fontFamily: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ].join(','),
        fontSize: 14,
        fontWeightLight: 300,
        fontWeightRegular: 400,
        fontWeightMedium: 500,
        fontWeightBold: 700,
        h1: {
          fontSize: '2.125rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.01562em',
        },
        h2: {
          fontSize: '1.875rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.00833em',
        },
        h3: {
          fontSize: '1.5rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '0em',
        },
        h4: {
          fontSize: '1.25rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '0.00735em',
        },
        h5: {
          fontSize: '1.125rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '0em',
        },
        h6: {
          fontSize: '1rem',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '0.0075em',
        },
        body1: {
          fontSize: '1rem',
          lineHeight: 1.5,
          letterSpacing: '0.00938em',
        },
        body2: {
          fontSize: '0.875rem',
          lineHeight: 1.43,
          letterSpacing: '0.01071em',
        },
        button: {
          fontSize: '0.875rem',
          fontWeight: 500,
          lineHeight: 1.75,
          letterSpacing: '0.02857em',
          textTransform: 'none',
        },
      },
      shape: {
        borderRadius: 6, // Atlassianの標準的なボーダー半径
      },
      spacing: 8, // ベースのスペーシングユニット
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              fontWeight: 500,
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              '&:hover': {
                transform: 'none',
              },
            },
            contained: {
              boxShadow: 'none',
              '&:hover': {
                boxShadow: '0 1px 2px 1px rgba(23, 43, 77, 0.2)',
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            },
            outlined: {
              borderWidth: 1.5,
              '&:hover': {
                borderWidth: 1.5,
              },
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
              border: `1px solid ${colors.border.default}`,
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: 'none',
            },
            elevation1: {
              boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
            },
            elevation2: {
              boxShadow: '0 4px 8px -2px rgba(23, 43, 77, 0.1)',
            },
            elevation3: {
              boxShadow: '0 8px 16px -4px rgba(23, 43, 77, 0.1)',
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundColor: colors.background.default,
              color: colors.text.default,
              boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: colors.background.subtle,
              borderRight: `1px solid ${colors.border.default}`,
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 6,
              margin: '2px 4px',
              '&.Mui-selected': {
                backgroundColor: colors.background.bold,
                '&:hover': {
                  backgroundColor: colors.background.bold,
                },
              },
              '&:hover': {
                backgroundColor: colors.background.subtle,
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              height: 24,
              fontSize: '0.75rem',
              borderRadius: 12,
            },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              minHeight: 48,
              padding: '12px 16px',
            },
          },
        },
        MuiTextField: {
          styleOverrides: {
            root: {
              '& .MuiOutlinedInput-root': {
                borderRadius: 6,
                '& fieldset': {
                  borderColor: colors.border.default,
                },
                '&:hover fieldset': {
                  borderColor: colors.border.bold,
                },
                '&.Mui-focused fieldset': {
                  borderWidth: 2,
                  borderColor: colors.brand.default,
                },
              },
            },
          },
        },
        MuiSelect: {
          styleOverrides: {
            root: {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.border.default,
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.border.bold,
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.brand.default,
                borderWidth: 2,
              },
            },
          },
        },
      },
    });

    return baseTheme;
  }, [mode, atlassianColors]);

  const syncToServer = useCallback(async (settings) => {
    try {
      setIsLoading(true);
      // 実際の実装ではAPIに設定を保存
      console.log('Syncing settings to server:', settings);
    } catch (error) {
      console.error('Failed to sync settings to server:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // レイアウト保存
  const saveLayout = useCallback((newLayout) => {
    setLayout(newLayout);
    localStorage.setItem('layoutSettings', JSON.stringify(newLayout));
    syncToServer({ layout: newLayout });
  }, [syncToServer]);


  // アクセシビリティ設定
  const updateAccessibility = useCallback((newAccessibility) => {
    setAccessibility(newAccessibility);
    localStorage.setItem('accessibilitySettings', JSON.stringify(newAccessibility));
    syncToServer({ accessibility: newAccessibility });
  }, [syncToServer]);

  // フォント設定
  const updateFontSettings = useCallback((newFontSettings) => {
    setFontSettings(newFontSettings);
    localStorage.setItem('fontSettings', JSON.stringify(newFontSettings));
    syncToServer({ fontSettings: newFontSettings });
  }, [syncToServer]);

  // 拡大縮小設定
  const updateZoomSettings = useCallback((newZoomSettings) => {
    setZoomSettings(newZoomSettings);
    localStorage.setItem('zoomSettings', JSON.stringify(newZoomSettings));
    syncToServer({ zoomSettings: newZoomSettings });

    // 実際のズーム適用
    document.documentElement.style.fontSize = `${(newZoomSettings.zoomLevel / 100) * 16}px`;
  }, [syncToServer]);

  // ダークモード自動切替設定
  const updateAutoDarkMode = useCallback((newAutoDarkMode) => {
    setAutoDarkMode(newAutoDarkMode);
    localStorage.setItem('autoDarkModeSettings', JSON.stringify(newAutoDarkMode));
    syncToServer({ autoDarkMode: newAutoDarkMode });
  }, [syncToServer]);

  // 通知バッジ設定
  const updateNotificationBadges = useCallback((newNotificationBadges) => {
    setNotificationBadges(newNotificationBadges);
    localStorage.setItem('notificationBadgeSettings', JSON.stringify(newNotificationBadges));
    syncToServer({ notificationBadges: newNotificationBadges });
  }, [syncToServer]);

  // ヘルプ表示設定
  const updateHelpSettings = useCallback((newHelpSettings) => {
    setHelpSettings(newHelpSettings);
    localStorage.setItem('helpSettings', JSON.stringify(newHelpSettings));
    syncToServer({ helpSettings: newHelpSettings });
  }, [syncToServer]);

  // 言語切替設定
  const updateLanguageSettings = useCallback((newLanguageSettings) => {
    setLanguageSettings(newLanguageSettings);
    localStorage.setItem('languageSettings', JSON.stringify(newLanguageSettings));
    syncToServer({ languageSettings: newLanguageSettings });
  }, [syncToServer]);

  // カスタムCSS設定
  const updateCustomCSS = useCallback((newCustomCSS) => {
    setCustomCSS(newCustomCSS);
    localStorage.setItem('customCSS', newCustomCSS);
    syncToServer({ customCSS: newCustomCSS });

    // 既存のCSSを削除して新しいCSSを適用
    const existingStyle = document.getElementById('custom-theme-css');
    if (existingStyle) {
      existingStyle.remove();
    }

    if (newCustomCSS) {
      const style = document.createElement('style');
      style.textContent = newCustomCSS;
      style.id = 'custom-theme-css';
      document.head.appendChild(style);
    }
  }, [syncToServer]);

  const toggleTheme = useCallback(() => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    localStorage.setItem('themeMode', newMode);
    syncToServer({ mode: newMode });
  }, [mode, syncToServer]);

  const updateColors = useCallback((newColors) => {
    setColors(newColors);
    localStorage.setItem('themeColors', JSON.stringify(newColors));
    syncToServer({ colors: newColors });
  }, [syncToServer]);

  const value = {
    // 基本設定
    mode,
    colors,
    isLoading,
    toggleTheme,
    updateColors,
    setMode: (newMode) => {
      setMode(newMode);
      localStorage.setItem('themeMode', newMode);
      syncToServer({ mode: newMode });
    },

    // レイアウト設定
    layout,
    saveLayout,


    // アクセシビリティ設定
    accessibility,
    updateAccessibility,

    // フォント設定
    fontSettings,
    updateFontSettings,

    // 拡大縮小設定
    zoomSettings,
    updateZoomSettings,

    // ダークモード自動切替設定
    autoDarkMode,
    updateAutoDarkMode,

    // 通知バッジ設定
    notificationBadges,
    updateNotificationBadges,

    // ヘルプ表示設定
    helpSettings,
    updateHelpSettings,

    // 言語切替設定
    languageSettings,
    updateLanguageSettings,

    // カスタムCSS設定
    customCSS,
    updateCustomCSS,

    // ユーティリティ関数
    resetToDefaults: () => {
      setMode('light');
      setColors({ primary: atlassianColors.light.brand.default, secondary: atlassianColors.light.accent.purple });
      setLayout({
        sidebarWidth: 280,
        headerHeight: 64,
        footerHeight: 72,
        containerPadding: 24,
        maxWidth: '1200px',
        spacing: 'normal'
      });
      localStorage.clear();
      syncToServer({
        mode: 'light',
        colors: { primary: atlassianColors.light.brand.default, secondary: atlassianColors.light.accent.purple },
        layout: {
          sidebarWidth: 280,
          headerHeight: 64,
          footerHeight: 72,
          containerPadding: 24,
          maxWidth: '1200px',
          spacing: 'normal'
        }
      });
    }
  };

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
