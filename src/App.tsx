import { Grid, theme } from 'antd';
import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import MobileTabBar from './components/MobileTabBar';
import Navbar from './components/Navbar';
import RequireAdmin from './components/RequireAdmin';
import RequireAuth from './components/RequireAuth';
import SiteFooter from './components/SiteFooter';
import { LoginModalProvider } from './context/LoginModalContext';
import About from './pages/About';
import Admin from './pages/Admin';
import Create from './pages/Create';
import Files from './pages/Files';
import Home from './pages/Home';
import Login from './pages/Login';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';
import PostDetail from './pages/PostDetail';
import Profile from './pages/Profile';
import ProjectDetail from './pages/ProjectDetail';
import SearchPage from './pages/Search';
import Settings from './pages/Settings';

const { useBreakpoint } = Grid;

/** 与 Vite `base` 一致；自定义域名挂在根路径时用 `/`，子路径部署用 `/repo/` */
function routerBasename(): string | undefined {
  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl === '/') return undefined;
  return baseUrl.replace(/\/$/, '') || undefined;
}

const AppLayout: React.FC = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const location = useLocation();
  const isCompactMobileRoute = location.pathname === '/' || location.pathname.startsWith('/profile');
  const isDetailRoute =
    location.pathname.startsWith('/project/') || location.pathname.startsWith('/post/');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isFilesRoute = location.pathname.startsWith('/files');
  const mobilePadding = isCompactMobileRoute
    ? '64px 16px calc(50px + env(safe-area-inset-bottom))'
    : isDetailRoute
      ? '64px 0 calc(50px + env(safe-area-inset-bottom))'
      : '80px 16px 80px';

  return (
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
          maxWidth: isAdminRoute || isFilesRoute ? 1180 : 680,
          width: '100%',
          margin: '0 auto',
          padding: screens.md ? '80px 16px 24px' : mobilePadding,
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
            <Route path="/files" element={<RequireAuth><Files /></RequireAuth>} />
            <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
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
  );
};

const App: React.FC = () => {
  return (
    <Router
      basename={routerBasename()}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LoginModalProvider>
        <AppLayout />
      </LoginModalProvider>
    </Router>
  );
};

export default App;
