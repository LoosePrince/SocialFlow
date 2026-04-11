import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { getGithubUrl } from '../github';

export const useFeeds = (showAll = false) => {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = async () => {
    try {
      // 分别请求 posts 和 projects
      const postQuery = supabase
        .from('posts')
        .select(`*, profiles:authorid (displayname, photourl)`)
        .order('createdat', { ascending: false });

      const projectQuery = supabase
        .from('projects')
        .select(`*, profiles:authorid (displayname, photourl)`)
        .order('createdat', { ascending: false });

      const [postsRes, projectsRes] = await Promise.all([postQuery, projectQuery]);

      const allData = [
        ...(postsRes.data || []).map(p => ({ ...p, type: 'post' })),
        ...(projectsRes.data || []).map(p => ({ ...p, type: 'project' }))
      ];

      // 处理和合并
      const processed = allData
        .filter(item => (showAll || item.isrecommended))
        .map(item => {
          const coverurl = item.coverurl ? getGithubUrl(item.coverurl) : '';
          const images = item.images ? (item.images as string[]).map(getGithubUrl) : [];
          const authorPhoto = item.profiles?.photourl || '';
          
          return {
            ...item,
            coverurl,
            images,
            authorName: item.profiles?.displayname,
            authorPhoto: authorPhoto.startsWith('http') ? authorPhoto : getGithubUrl(authorPhoto),
            createdAt: item.createdat, // Keeping camelCase for UI property names if needed, but DB field is createdat
            likeCount: item.likecount,
            commentCount: item.commentcount,
            isRecommended: item.isrecommended,
          };
        })
        .sort((a, b) => b.createdat - a.createdat); // 重新按时间排序

      setFeeds(processed);
    } catch (err) {
      console.error('Fetch feeds error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeds();

    // 订阅两个表的变更
    const channel = supabase
      .channel(`feeds-realtime-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => fetchFeeds())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchFeeds())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showAll]);

  return { feeds, loading };
};
