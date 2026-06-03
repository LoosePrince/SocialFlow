import React from 'react'
import ReactDOM from 'react-dom/client'
import SocialApp from './App'
import './index.css'
import { App } from 'antd'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { I18nProvider } from './context/I18nContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <App>
              <SocialApp />
            </App>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
)
