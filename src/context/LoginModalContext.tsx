import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import LoginPanel from '../components/LoginPanel';
import { sanitizeReturnPath } from '../lib/navigation';

type LoginModalContextValue = {
  openLoginModal: () => void;
  closeLoginModal: () => void;
};

const LoginModalContext = createContext<LoginModalContextValue | undefined>(undefined);

function LoginModalBody({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = useMemo(
    () => sanitizeReturnPath(location.pathname + location.search),
    [location.pathname, location.search]
  );

  return (
    <>
      <LoginPanel variant="modal" returnTo={returnTo} />
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a
          href="#login-page"
          onClick={(e) => {
            e.preventDefault();
            onClose();
            navigate(`/login?from=${encodeURIComponent(returnTo)}`);
          }}
          style={{ fontSize: 13 }}
        >
          前往完整登录页
        </a>
      </div>
    </>
  );
}

export const LoginModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);

  const openLoginModal = useCallback(() => setOpen(true), []);
  const closeLoginModal = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openLoginModal, closeLoginModal }),
    [openLoginModal, closeLoginModal]
  );

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      <Modal
        title="登录"
        open={open}
        onCancel={closeLoginModal}
        footer={null}
        destroyOnHidden
        width={440}
      >
        {open ? <LoginModalBody onClose={closeLoginModal} /> : null}
      </Modal>
    </LoginModalContext.Provider>
  );
};

export function useLoginModal(): LoginModalContextValue {
  const ctx = useContext(LoginModalContext);
  if (!ctx) {
    throw new Error('useLoginModal must be used within LoginModalProvider');
  }
  return ctx;
}
