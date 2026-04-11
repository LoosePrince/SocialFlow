import React from 'react'
import ReactDOM from 'react-dom/client'
import SocialApp from './App.tsx'
import './index.css'
import { App } from 'antd'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <App>
            <SocialApp />
          </App>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
