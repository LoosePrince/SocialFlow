import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
import ProjectDetail from './pages/ProjectDetail';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import SearchPage from './pages/Search';
import Navbar from './components/Navbar';
import MobileTabBar from './components/MobileTabBar';
import RequireAuth from './components/RequireAuth';
import { LoginModalProvider } from './context/LoginModalContext';
import { AnimatePresence } from 'framer-motion';
import { theme, Grid } from 'antd';

const { useBreakpoint } = Grid;

const App: React.FC = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginModalProvider>
        <div style={{ 
          minHeight: '100vh', 
          background: token.colorBgLayout,
          color: token.colorText,
          transition: 'background-color 0.3s, color 0.3s'
        }}>
          <Navbar />
          <main style={{ 
            maxWidth: 680,
            margin: '0 auto',
            padding: screens.md ? '80px 16px 24px' : '64px 16px 80px',
          }}>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/post/:id" element={<PostDetail />} />
                <Route path="/project/:id" element={<ProjectDetail />} />
                <Route path="/profile/:uid" element={<Profile />} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
                <Route path="/login" element={<Login />} />
                <Route path="/search" element={<SearchPage />} />
              </Routes>
            </AnimatePresence>
          </main>
          <MobileTabBar />
        </div>
      </LoginModalProvider>
    </Router>
  );
};

export default App;
