import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { apiJson } from '../lib/api';
import { sanitizeReturnPath } from '../lib/navigation';

interface UserProfile {
  id: string;
  email: string;
  displayname: string;
  photourl: string;
  role: 'admin' | 'user';
  createdat: number;
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
  /** 合并 getSession 与 onAuthStateChange 触发的并发 /api/me，减轻 401 + refresh 风暴 */
  const profileFetchRef = useRef<Promise<void> | null>(null);

  const fetchProfile = async () => {
    if (profileFetchRef.current) return profileFetchRef.current;
    profileFetchRef.current = (async () => {
      try {
        const p = await apiJson<UserProfile>('/api/me');
        setProfile(p);
      } catch (err) {
        console.error('Profile fetch error:', err);
        setProfile(null);
      } finally {
        setLoading(false);
        profileFetchRef.current = null;
      }
    })();
    return profileFetchRef.current;
  };

  const refreshProfile = async () => {
    try {
      const p = await apiJson<UserProfile>('/api/me');
      setProfile(p);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        void fetchProfile();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        void fetchProfile();
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
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
