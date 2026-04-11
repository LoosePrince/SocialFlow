import React, { createContext, useContext, useEffect, useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme') as ThemeMode;
    return saved || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('theme', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#007AFF',
            borderRadius: 8,
            borderRadiusLG: 18, // --radius-lg
            fontFamily: "'Outfit', 'Noto Sans SC', sans-serif",
            colorBgContainer: mode === 'dark' ? '#1C1C1E' : '#FFFFFF',
            colorBgLayout: mode === 'dark' ? '#121212' : '#F2F2F7',
            colorText: mode === 'dark' ? '#FFFFFF' : '#1C1C1E',
            colorTextDescription: mode === 'dark' ? '#A1A1A6' : '#8E8E93',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
          components: {
            Button: {
              borderRadius: 12,
              fontWeight: 500,
              controlHeight: 36,
            },
            Card: {
              borderRadiusLG: 18,
              paddingLG: 20,
            },
            Input: {
              borderRadius: 12,
            },
          }
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
