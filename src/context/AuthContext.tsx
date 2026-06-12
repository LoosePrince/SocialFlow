import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { apiJson, clearApiCache } from '../lib/api';
import { sanitizeReturnPath } from '../lib/navigation';

interface UserProfile {
  id: string;
  email: string;
  displayname: string;
  photourl: string;
  role: 'admin' | 'user';
  createdat: number;
  /** 绑定后的 QQ uin，未绑定时可能为空或缺省 */
  qq_uin?: string | null;
  /** 是否已设置账号密码 */
  haspassword?: boolean;
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  /** OAuth 完成后进入的站内路径，默认 `/` */
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const activeUserIdRef = useRef<string | null>(null);
  /** 按 userId 合并并发 /api/me；切换账号时作废旧请求 */
  const profileFetchRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const fetchProfileForUser = async (userId: string, options?: { localFirst?: boolean }) => {
    const inFlight = profileFetchRef.current;
    if (inFlight?.userId === userId) {
      return inFlight.promise;
    }

    const promise = (async () => {
      try {
        const p = await apiJson<UserProfile>('/api/me', {
          localFirst: options?.localFirst ?? false,
        });
        if (activeUserIdRef.current !== userId) return;
        setProfile(p);
      } catch (err) {
        console.error('Profile fetch error:', err);
        if (activeUserIdRef.current === userId) {
          setProfile(null);
        }
      } finally {
        if (profileFetchRef.current?.userId === userId) {
          profileFetchRef.current = null;
        }
        if (activeUserIdRef.current === userId) {
          setLoading(false);
        }
      }
    })();

    profileFetchRef.current = { userId, promise };
    return promise;
  };

  const applySession = (session: Session | null, options?: { localFirst?: boolean }) => {
    const nextUserId = session?.user?.id ?? null;
    const prevUserId = activeUserIdRef.current;

    if (nextUserId !== prevUserId) {
      profileFetchRef.current = null;
      clearApiCache();
      setProfile(null);
      activeUserIdRef.current = nextUserId;
    }

    setUser(session?.user ?? null);

    if (nextUserId) {
      if (nextUserId !== prevUserId) {
        setLoading(true);
      }
      void fetchProfileForUser(nextUserId, options);
      return;
    }

    setLoading(false);
  };

  const refreshProfile = async () => {
    const userId = activeUserIdRef.current;
    if (!userId) return;
    profileFetchRef.current = null;
    await fetchProfileForUser(userId, { localFirst: false });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session, { localFirst: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session, { localFirst: false });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (returnTo: string = '/') => {
    const next = sanitizeReturnPath(returnTo);
    const url = new URL(`${window.location.origin}/login`);
    url.searchParams.set('from', next);
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: url.toString(),
      },
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, refreshProfile, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
