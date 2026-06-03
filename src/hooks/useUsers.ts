import { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';

type UserRole = 'admin' | 'user';

type UserListItem = {
  uid: string;
  email?: string;
  displayname: string;
  photourl: string;
  role: UserRole;
};

export const useUsers = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiJson<Array<{ uid: string; displayname: string; photourl: string; role?: string }>>(
          '/api/users'
        );
        setUsers(
          data.map((u) => ({
            uid: u.uid,
            displayname: u.displayname,
            photourl: u.photourl,
            role: u.role === 'admin' ? 'admin' : 'user',
          }))
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  return { users, loading };
};
