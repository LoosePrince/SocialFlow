import React, { useMemo, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Input, Typography, Empty, List, Avatar, Spin, Divider, theme, Card, Flex, Tag } from 'antd';
import { Search as SearchIcon, User, FileText, FolderKanban } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUsers } from '../hooks/useUsers';
import { useFeeds } from '../hooks/useFeeds';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentText from '../components/CommentText';
import PageHeader from '../components/PageHeader';
import ResponsiveContainer from '../components/ResponsiveContainer';

const { Text, Paragraph } = Typography;

const SEARCH_RECENT_KEY = 'socialflow.search.recent';
const MAX_RECENT_SEARCHES = 8;

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

function matchQuery(text: string, q: string): boolean {
  if (!q.trim()) return false;
  return text.toLowerCase().includes(q.trim().toLowerCase());
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
  const q = searchParams.get('q') ?? '';
  const [inputText, setInputText] = useState(() => searchParams.get('q') ?? '');
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);
  const { token } = theme.useToken();
  const { t } = useI18n();

  useEffect(() => {
    setInputText(searchParams.get('q') ?? '');
  }, [searchParams]);
  const { users, loading: usersLoading } = useUsers();
  const { feeds, loading: feedsLoading } = useFeeds(true);

  const loading = usersLoading || feedsLoading;

  const filteredUsers = useMemo(() => {
    if (!q.trim()) return [];
    return users.filter((u) => matchQuery(u.displayname, q));
  }, [users, q]);

  const filteredPosts = useMemo(() => {
    if (!q.trim()) return [];
    return feeds.filter((item) => {
      if (item.type !== 'post') return false;
      const content = String(item.content ?? '');
      const name = String(item.authorName ?? '');
      return matchQuery(content, q) || matchQuery(name, q);
    });
  }, [feeds, q]);

  const filteredProjects = useMemo(() => {
    if (!q.trim()) return [];
    return feeds.filter((item) => {
      if (item.type !== 'project') return false;
      const title = String(item.title ?? '');
      const summary = String(item.summary ?? '');
      const name = String(item.authorName ?? '');
      return matchQuery(title, q) || matchQuery(summary, q) || matchQuery(name, q);
    });
  }, [feeds, q]);

  const hasQuery = q.trim().length > 0;
  const hasResults =
    hasQuery &&
    (filteredUsers.length > 0 || filteredPosts.length > 0 || filteredProjects.length > 0);
  const totalResults = filteredUsers.length + filteredPosts.length + filteredProjects.length;

  const submitSearch = (value?: string) => {
    const v = (value ?? inputText).trim();
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
        onChange={(e) => setInputText(e.target.value)}
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
                          <Link to={`/profile/${u.uid}`} style={{ color: token.colorLink }}>
                            <HighlightText text={u.displayname} query={q} />
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
                          <HighlightText text={String(item.content ?? '').slice(0, 200)} query={q} />
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
                          <HighlightText text={String(item.title ?? t('search.projectFallback'))} query={q} />
                        </Link>
                        <Text type="secondary" ellipsis style={{ display: 'block', marginTop: 4 }}>
                          <HighlightText text={String(item.summary ?? '').slice(0, 160)} query={q} />
                        </Text>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </>
          )}
        </div>
      )}
      </motion.div>
    </ResponsiveContainer>
  );
};

export default Search;
