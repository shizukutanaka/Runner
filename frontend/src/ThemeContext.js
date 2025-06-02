import React, { createContext, useMemo, useState, useContext } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

const ThemeContext = createContext();

export function useThemeMode() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: {
        main: '#1976d2',
      },
      secondary: {
        main: '#ab47bc',
      },
    },
    shape: { borderRadius: 8 },
  }), [mode]);

  const toggleTheme = () => setMode(m => (m === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
