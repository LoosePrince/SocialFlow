import React, { useMemo, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Input, Typography, Empty, List, Avatar, Spin, Divider, theme, Card } from 'antd';
import { Search as SearchIcon, User, FileText, FolderKanban } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUsers } from '../hooks/useUsers';
import { useFeeds } from '../hooks/useFeeds';
import { useI18n } from '../context/I18nContext';
import { getGithubUrl } from '../github';
import CommentText from '../components/CommentText';

const { Title, Text, Paragraph } = Typography;

function matchQuery(text: string, q: string): boolean {
  if (!q.trim()) return false;
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [inputText, setInputText] = useState(() => searchParams.get('q') ?? '');
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 24 }}
    >
      <Title level={2} style={{ marginBottom: 16 }}>
        {t('search.title')}
      </Title>

      <Input.Search
        autoFocus
        size="large"
        allowClear
        enterButton
        placeholder={t('search.placeholder')}
        prefix={<SearchIcon size={18} style={{ color: token.colorTextDescription }} />}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onSearch={(value) => {
          const v = (value ?? inputText).trim();
          if (v) setSearchParams({ q: v });
          else setSearchParams({});
        }}
        style={{ marginBottom: 24 }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : !hasQuery ? (
        <Empty description={t('search.emptyInput')} />
      ) : !hasResults ? (
        <Empty description={t('search.emptyResult')} />
      ) : (
        <div>
          {filteredUsers.length > 0 && (
            <Card size="small" title={<><User size={16} style={{ marginRight: 8 }} />{t('search.users')}</>} style={{ marginBottom: 16 }}>
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
                            {u.displayname}
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
              <Card size="small" title={<><FileText size={16} style={{ marginRight: 8 }} />{t('search.posts')}</>} style={{ marginBottom: 16 }}>
                <List
                  dataSource={filteredPosts}
                  renderItem={(item) => (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Link to={`/post/${item.id}`} style={{ color: token.colorLink, fontWeight: 600 }}>
                          {String(item.authorName ?? t('search.userFallback'))} {t('search.postSuffix')}
                        </Link>
                        <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, marginTop: 4 }} type="secondary">
                          <CommentText text={String(item.content ?? '').slice(0, 200)} />
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
              <Card size="small" title={<><FolderKanban size={16} style={{ marginRight: 8 }} />{t('search.projects')}</>}>
                <List
                  dataSource={filteredProjects}
                  renderItem={(item) => (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Link to={`/project/${item.id}`} style={{ color: token.colorLink, fontWeight: 600 }}>
                          <CommentText text={String(item.title ?? t('search.projectFallback'))} singleLine />
                        </Link>
                        <Text type="secondary" ellipsis style={{ display: 'block', marginTop: 4 }}>
                          <CommentText text={String(item.summary ?? '').slice(0, 160)} singleLine />
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
  );
};

export default Search;
