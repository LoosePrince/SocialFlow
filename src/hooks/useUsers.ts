import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export const useUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, displayname, photourl');

      if (!error && data) {
        setUsers(data.map(u => ({
          uid: u.id,
          displayname: u.displayname,
          photourl: u.photourl
        })));
      }
      setLoading(false);
    };

    fetchUsers();
  }, []);

  return { users, loading };
};
