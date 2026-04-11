import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
import ProjectDetail from './pages/ProjectDetail';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Navbar from './components/Navbar';
import MobileTabBar from './components/MobileTabBar';
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
