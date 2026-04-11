import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

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
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isPredefinedAdmin(email: string | null | undefined): boolean {
  const configured = import.meta.env.VITE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured) return false;
  const normalized = email?.trim().toLowerCase();
  return !!normalized && normalized === configured;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
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

  const fetchProfile = async (uid: string) => {
    try {
      // 先尝试读取
      const { data: existing, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle(); // 使用 maybeSingle 避免 406

      if (existing) {
        setProfile(existing);
        setLoading(false);
        return;
      }

      // 如果不存在，再尝试创建
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const metadata = userData.user.user_metadata;
      const initialProfile = {
        id: uid,
        email: userData.user.email || '',
        displayname: metadata.full_name || metadata.name || metadata.user_name || '新用户',
        photourl: metadata.avatar_url || '',
        role: isPredefinedAdmin(userData.user.email) ? 'admin' : 'user',
        createdat: Date.now(),
      };

      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .upsert([initialProfile], { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (created) setProfile(created);
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin
      }
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, isAdmin }}>
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
