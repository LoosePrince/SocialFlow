import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from 'antd'
import { Capacitor } from '@capacitor/core'
import { loadRuntimeConfig } from './runtimeConfig'

function renderStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <div style={{ maxWidth: 720, margin: '64px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>应用配置加载失败</h1>
        <p style={{ color: '#555', lineHeight: 1.7 }}>
          请确认后端服务已经启动，并且数据库或环境变量中配置了有效的 Supabase 地址和公开密钥。
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 16, borderRadius: 8 }}>
          {message}
        </pre>
      </div>
    </React.StrictMode>,
  )
}

function registerAppServiceWorker() {
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('[sw] register failed:', err);
    });
  });
}

async function bootstrap() {
  await loadRuntimeConfig()
  registerAppServiceWorker()

  const [
    { default: SocialApp },
    { ThemeProvider },
    { AuthProvider },
    { NotificationProvider },
    { I18nProvider },
  ] = await Promise.all([
    import('./App'),
    import('./context/ThemeContext'),
    import('./context/AuthContext'),
    import('./context/NotificationContext'),
    import('./context/I18nContext'),
  ])

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
}

void bootstrap().catch(renderStartupError)
