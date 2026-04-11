import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home.tsx';
import PostDetail from './pages/PostDetail.tsx';
import ProjectDetail from './pages/ProjectDetail.tsx';
import Profile from './pages/Profile.tsx';
import Settings from './pages/Settings.tsx';
import Notifications from './pages/Notifications.tsx';
import Navbar from './components/Navbar.tsx';
import MobileTabBar from './components/MobileTabBar.tsx';
import { AnimatePresence } from 'framer-motion';
import { theme, Grid } from 'antd';

const { useBreakpoint } = Grid;

const App: React.FC = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:uid" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<Notifications />} />
            </Routes>
          </AnimatePresence>
        </main>
        <MobileTabBar />
      </div>
    </Router>
  );
};

export default App;
