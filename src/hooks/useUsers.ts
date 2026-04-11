import { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';

export const useUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiJson<Array<{ uid: string; displayname: string; photourl: string }>>(
          '/api/users'
        );
        setUsers(
          data.map((u) => ({
            uid: u.uid,
            displayname: u.displayname,
            photourl: u.photourl,
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
