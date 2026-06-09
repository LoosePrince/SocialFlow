import { useState, useEffect } from 'react';
import { apiJson, onApiCacheUpdate } from '../lib/api';

type UserRole = 'admin' | 'user';

type UserListItem = {
  uid: string;
  email?: string;
  displayname: string;
  photourl: string;
  role: UserRole;
};

type UserApiItem = {
  uid: string;
  displayname: string;
  photourl: string;
  role?: string;
};

function normalizeUsers(data: UserApiItem[]): UserListItem[] {
  return data.map((u) => ({
    uid: u.uid,
    displayname: u.displayname,
    photourl: u.photourl,
    role: u.role === 'admin' ? 'admin' : 'user',
  }));
}

export const useUsers = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiJson<UserApiItem[]>('/api/users');
        setUsers(normalizeUsers(data));
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
    const unsubCache = onApiCacheUpdate<UserApiItem[]>('/api/users', (data) => {
      setUsers(normalizeUsers(data));
      setLoading(false);
    });

    return () => unsubCache();
  }, []);

  return { users, loading };
};
