import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Input, Typography, Empty, List, Avatar, Spin, Divider, theme, Card, Flex, Tag } from 'antd';
import { Search as SearchIcon, User, FileText, FolderKanban } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentText from '../components/CommentText';
import PageHeader from '../components/PageHeader';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { apiJson } from '../lib/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

const { Text, Paragraph } = Typography;

const SEARCH_RECENT_KEY = 'socialflow.search.recent';
const MAX_RECENT_SEARCHES = 8;
const SEARCH_PAGE_SIZE = 20;

type SearchItemType = 'user' | 'post' | 'project';

type SearchItem = {
  id: string;
  uid?: string;
  type: SearchItemType;
  displayname?: string;
  photourl?: string;
  role?: string;
  content?: string;
  title?: string;
  summary?: string;
  profiles?: { displayname?: string; photourl?: string } | null;
  authorName?: string;
  authorPhoto?: string;
  createdat?: string | number;
};

type SearchPage = {
  items: SearchItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(SEARCH_RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(items: string[]) {
  window.localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES)));
}

function normalizeSearchItems(items: SearchItem[]): SearchItem[] {
  return items.map((item) => {
    if (item.type === 'user') {
      return {
        ...item,
        uid: item.uid ?? item.id,
        photourl: item.photourl ? getGithubUrl(item.photourl) : '',
      };
    }

    const authorPhoto = item.profiles?.photourl ?? item.authorPhoto ?? '';
    return {
      ...item,
      authorName: item.profiles?.displayname ?? item.authorName ?? '',
      authorPhoto: authorPhoto ? getGithubUrl(authorPhoto) : '',
    };
  });
}

function mergeSearchItems(current: SearchItem[], incoming: SearchItem[], mode: 'replace' | 'append') {
  const source = mode === 'replace' ? incoming : [...current, ...incoming];
  const seen = new Set<string>();
  const merged: SearchItem[] = [];

  for (const item of source) {
    const id = item.id || item.uid;
    if (!id) continue;
    const key = `${item.type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...item, id });
  }

  return merged;
}

function buildSearchPath(query: string, cursor?: string | null) {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('type', 'all');
  params.set('limit', String(SEARCH_PAGE_SIZE));
  if (cursor) params.set('cursor', cursor);
  return `/api/search?${params.toString()}`;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <CommentText text={text} />;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);

  while (index >= 0) {
    if (index > cursor) parts.push(<CommentText key={`t-${cursor}`} text={text.slice(cursor, index)} />);
    parts.push(
      <mark key={`m-${index}`} className="sf-highlight">
        <CommentText text={text.slice(index, index + q.length)} />
      </mark>
    );
    cursor = index + q.length;
    index = lower.indexOf(needle, cursor);
  }

  if (cursor < text.length) parts.push(<CommentText key={`t-${cursor}`} text={text.slice(cursor)} />);
  return <>{parts}</>;
}

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [inputText, setInputText] = useState(() => urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(() => urlQuery.trim());
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const loadingMoreRef = useRef(false);
  const { token } = theme.useToken();
  const { t } = useI18n();

  useEffect(() => {
    setInputText(urlQuery);
    setDebouncedQuery(urlQuery.trim());
  }, [urlQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(inputText.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [inputText]);

  useEffect(() => {
    const query = debouncedQuery.trim();
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setNextCursor(null);
    setHasMore(false);

    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void apiJson<SearchPage>(buildSearchPath(query), { localFirst: false })
      .then((data) => {
        if (requestSeq.current !== seq) return;
        const items = normalizeSearchItems(data.items ?? []);
        setResults((current) => mergeSearchItems(current, items, 'replace'));
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        if (requestSeq.current !== seq) return;
        console.error('Fetch search results error:', err);
        setResults([]);
        setNextCursor(null);
        setHasMore(false);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  }, [debouncedQuery]);

  const loadMore = useCallback(async () => {
    const query = debouncedQuery.trim();
    if (!query || loading || loadingMoreRef.current || !hasMore || !nextCursor) return;

    const seq = requestSeq.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await apiJson<SearchPage>(buildSearchPath(query, nextCursor), { localFirst: false });
      if (requestSeq.current !== seq) return;
      const items = normalizeSearchItems(data.items ?? []);
      setResults((current) => mergeSearchItems(current, items, 'append'));
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (requestSeq.current === seq) console.error('Fetch more search results error:', err);
    } finally {
      if (requestSeq.current === seq) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery, hasMore, loading, nextCursor]);

  const loadMoreRef = useInfiniteScroll({
    disabled: !debouncedQuery.trim(),
    loading: loading || loadingMore,
    hasMore,
    onLoadMore: loadMore,
  });

  const filteredUsers = useMemo(() => results.filter((item) => item.type === 'user'), [results]);
  const filteredPosts = useMemo(() => results.filter((item) => item.type === 'post'), [results]);
  const filteredProjects = useMemo(() => results.filter((item) => item.type === 'project'), [results]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasResults = hasQuery && results.length > 0;
  const totalResults = results.length;

  const submitSearch = (value?: string) => {
    const v = (value ?? inputText).trim();
    setInputText(v);
    setDebouncedQuery(v);

    if (v) {
      setSearchParams({ q: v });
      const next = [v, ...recentSearches.filter((item) => item.toLowerCase() !== v.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(next);
      saveRecentSearches(next);
    } else {
      setSearchParams({});
    }
  };

  return (
    <ResponsiveContainer>
      <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ paddingBottom: 24 }}
    >
      <PageHeader
        title={t('search.title')}
        description={hasQuery ? t('search.resultCount', { count: totalResults }) : t('search.desc')}
        compact
      />

      <Input.Search
        autoFocus
        size="large"
        allowClear
        enterButton
        placeholder={t('search.placeholder')}
        prefix={<SearchIcon size={18} style={{ color: token.colorTextDescription }} />}
        value={inputText}
        onChange={(e) => {
          const value = e.target.value;
          setInputText(value);
          if (!value.trim() && urlQuery) setSearchParams({});
        }}
        onSearch={submitSearch}
        style={{ marginBottom: 24 }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : !hasQuery ? (
        <>
          {recentSearches.length > 0 && (
            <Card size="small" title={t('search.recent')} style={{ marginBottom: 16 }}>
              <Flex gap={8} wrap="wrap">
                {recentSearches.map((item) => (
                  <Tag
                    key={item}
                    style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                    onClick={() => {
                      setInputText(item);
                      submitSearch(item);
                    }}
                  >
                    {item}
                  </Tag>
                ))}
              </Flex>
            </Card>
          )}
          <Empty description={t('search.emptyInput')} />
        </>
      ) : !hasResults ? (
        <Empty description={t('search.emptyResult')} />
      ) : (
        <div>
          {filteredUsers.length > 0 && (
              <Card size="small" title={<><User size={16} style={{ marginRight: 8 }} />{t('search.users')} ({filteredUsers.length})</>} style={{ marginBottom: 16 }}>
              <List
                dataSource={filteredUsers}
                renderItem={(u) => {
                  const photo = getGithubUrl(u.photourl || '');
                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar src={photo} />}
                        title={
                          <Link to={`/profile/${u.uid ?? u.id}`} style={{ color: token.colorLink }}>
                            <HighlightText text={u.displayname ?? ''} query={debouncedQuery} />
                          </Link>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          )}

          {filteredPosts.length > 0 && (
            <>
              {filteredUsers.length > 0 && <Divider />}
              <Card size="small" title={<><FileText size={16} style={{ marginRight: 8 }} />{t('search.posts')} ({filteredPosts.length})</>} style={{ marginBottom: 16 }}>
                <List
                  dataSource={filteredPosts}
                  renderItem={(item) => (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Link to={`/post/${item.id}`} style={{ color: token.colorLink, fontWeight: 600 }}>
                          {String(item.authorName ?? t('search.userFallback'))} {t('search.postSuffix')}
                        </Link>
                        <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, marginTop: 4 }} type="secondary">
                          <HighlightText text={String(item.content ?? '').slice(0, 200)} query={debouncedQuery} />
                        </Paragraph>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </>
          )}

          {filteredProjects.length > 0 && (
            <>
              {(filteredUsers.length > 0 || filteredPosts.length > 0) && <Divider />}
              <Card size="small" title={<><FolderKanban size={16} style={{ marginRight: 8 }} />{t('search.projects')} ({filteredProjects.length})</>}>
                <List
                  dataSource={filteredProjects}
                  renderItem={(item) => (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Link to={`/project/${item.id}`} style={{ color: token.colorLink, fontWeight: 600 }}>
                          <HighlightText text={String(item.title ?? t('search.projectFallback'))} query={debouncedQuery} />
                        </Link>
                        <Text type="secondary" ellipsis style={{ display: 'block', marginTop: 4 }}>
                          <HighlightText text={String(item.summary ?? '').slice(0, 160)} query={debouncedQuery} />
                        </Text>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </>
          )}

          <div ref={loadMoreRef} style={{ minHeight: 32, padding: 16, textAlign: 'center' }}>
            {loadingMore ? <Spin /> : hasMore ? <Text type="secondary">加载更多</Text> : null}
          </div>
        </div>
      )}
      </motion.div>
    </ResponsiveContainer>
  );
};

export default Search;