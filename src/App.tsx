import { Grid, theme } from 'antd';
import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import MobileTabBar from './components/MobileTabBar';
import Navbar from './components/Navbar';
import SiteFooter from './components/SiteFooter';
import RequireAuth from './components/RequireAuth';
import { LoginModalProvider } from './context/LoginModalContext';
import Create from './pages/Create';
import Home from './pages/Home';
import Login from './pages/Login';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';
import PostDetail from './pages/PostDetail';
import Profile from './pages/Profile';
import ProjectDetail from './pages/ProjectDetail';
import SearchPage from './pages/Search';
import Settings from './pages/Settings';
import About from './pages/About';

const { useBreakpoint } = Grid;

/** 与 Vite `base` 一致；自定义域名挂在根路径时用 `/`，子路径部署用 `/repo/` */
function routerBasename(): string | undefined {
  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl === '/') return undefined;
  return baseUrl.replace(/\/$/, '') || undefined;
}

const App: React.FC = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  return (
    <Router
      basename={routerBasename()}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LoginModalProvider>
        <div
          style={{
            minHeight: '100vh',
            background: token.colorBgLayout,
            color: token.colorText,
            transition: 'background-color 0.3s, color 0.3s',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Navbar />
          <main
            style={{
              flex: 1,
              maxWidth: 680,
              width: '100%',
              margin: '0 auto',
              padding: screens.md ? '80px 16px 24px' : '80px 16px 80px',
              boxSizing: 'border-box',
            }}
          >
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/post/:id" element={<PostDetail />} />
                <Route path="/project/:id" element={<ProjectDetail />} />
                <Route path="/profile/:uid" element={<Profile />} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="/notifications" element={<Navigate to="/messages" replace />} />
                <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
                <Route path="/create" element={<RequireAuth><Create /></RequireAuth>} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/about" element={<About />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AnimatePresence>
          </main>
          <SiteFooter />
          <MobileTabBar />
        </div>
      </LoginModalProvider>
    </Router>
  );
};

export default App;
