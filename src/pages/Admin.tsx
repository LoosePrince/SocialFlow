import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { motion } from 'framer-motion';
import {
  FileText,
  FolderKanban,
  MessageSquare,
  Pencil,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import CommentText from '../components/CommentText';
import PostBodyDisplay from '../components/PostBodyDisplay';
import { apiJson } from '../lib/api';
import { toMillis } from '../lib/time';
import { useAuth } from '../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

type Paged<T> = { items: T[]; total: number };

type AdminSummary = {
  users: number;
  posts: number;
  projects: number;
  comments: number;
  likes: number;
  recommendedPosts: number;
  recommendedProjects: number;
};

type AdminUser = {
  id: string;
  email: string;
  displayname: string;
  photourl: string;
  role: 'admin' | 'user';
  createdat: number;
  qq_uin: string | null;
  haspassword: boolean;
  postcount: number;
  projectcount: number;
  commentcount: number;
  likecount: number;
};

type AdminPost = {
  id: string;
  authorid: string;
  content: string;
  images: string[];
  createdat: number;
  likecount: number;
  commentcount: number;
  isrecommended: boolean;
  authorName: string;
  authorPhoto: string;
};

type AdminProject = {
  id: string;
  authorid: string;
  title: string;
  summary: string;
  content: string;
  coverurl: string;
  attachments: string[];
  createdat: number;
  likecount: number;
  commentcount: number;
  isrecommended: boolean;
  authorName: string;
  authorPhoto: string;
};

type AdminComment = {
  id: string;
  contentid: string;
  contenttype: 'post' | 'project';
  authorid: string;
  text: string;
  createdat: number;
  contenttitle?: string;
  authorName: string;
  authorPhoto: string;
};

type AdminSetting = {
  key: string;
  value: unknown;
  updatedat: number;
  updatedby: string | null;
};

type AdminTab = 'users' | 'posts' | 'projects' | 'comments' | 'settings';

const PAGE_SIZE = 20;

function formatTime(value: number | string | undefined) {
  const ms = toMillis(value);
  return ms == null ? '-' : dayjs(ms).format('YYYY-MM-DD HH:mm');
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function jsonPretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as unknown;
}

const Admin: React.FC = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const { message, modal } = App.useApp();

  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [userQuery, setUserQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<Paged<AdminUser>>({ items: [], total: 0 });
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm] = Form.useForm();

  const [postQuery, setPostQuery] = useState('');
  const [postRecommended, setPostRecommended] = useState('all');
  const [postPage, setPostPage] = useState(1);
  const [posts, setPosts] = useState<Paged<AdminPost>>({ items: [], total: 0 });
  const [postsLoading, setPostsLoading] = useState(false);

  const [projectQuery, setProjectQuery] = useState('');
  const [projectRecommended, setProjectRecommended] = useState('all');
  const [projectPage, setProjectPage] = useState(1);
  const [projects, setProjects] = useState<Paged<AdminProject>>({ items: [], total: 0 });
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [commentQuery, setCommentQuery] = useState('');
  const [commentType, setCommentType] = useState('all');
  const [commentPage, setCommentPage] = useState(1);
  const [comments, setComments] = useState<Paged<AdminComment>>({ items: [], total: 0 });
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<AdminSetting | null>(null);
  const [settingForm] = Form.useForm();

  const tableSize = screens.md ? 'middle' : 'small';

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await apiJson<AdminSummary>('/api/admin/summary'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载统计失败');
    } finally {
      setSummaryLoading(false);
    }
  }, [message]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((userPage - 1) * PAGE_SIZE),
      });
      if (userQuery.trim()) params.set('q', userQuery.trim());
      setUsers(await apiJson<Paged<AdminUser>>(`/api/admin/users?${params}`));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载账号失败');
    } finally {
      setUsersLoading(false);
    }
  }, [message, userPage, userQuery]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((postPage - 1) * PAGE_SIZE),
      });
      if (postQuery.trim()) params.set('q', postQuery.trim());
      if (postRecommended !== 'all') params.set('recommended', postRecommended);
      setPosts(await apiJson<Paged<AdminPost>>(`/api/admin/posts?${params}`));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载动态失败');
    } finally {
      setPostsLoading(false);
    }
  }, [message, postPage, postQuery, postRecommended]);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((projectPage - 1) * PAGE_SIZE),
      });
      if (projectQuery.trim()) params.set('q', projectQuery.trim());
      if (projectRecommended !== 'all') params.set('recommended', projectRecommended);
      setProjects(await apiJson<Paged<AdminProject>>(`/api/admin/projects?${params}`));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载项目失败');
    } finally {
      setProjectsLoading(false);
    }
  }, [message, projectPage, projectQuery, projectRecommended]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((commentPage - 1) * PAGE_SIZE),
      });
      if (commentQuery.trim()) params.set('q', commentQuery.trim());
      if (commentType !== 'all') params.set('contentType', commentType);
      setComments(await apiJson<Paged<AdminComment>>(`/api/admin/comments?${params}`));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载评论失败');
    } finally {
      setCommentsLoading(false);
    }
  }, [commentPage, commentQuery, commentType, message]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      setSettings(await apiJson<AdminSetting[]>('/api/admin/settings'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载设置失败');
    } finally {
      setSettingsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (activeTab === 'users') void loadUsers();
  }, [activeTab, loadUsers]);

  useEffect(() => {
    if (activeTab === 'posts') void loadPosts();
  }, [activeTab, loadPosts]);

  useEffect(() => {
    if (activeTab === 'projects') void loadProjects();
  }, [activeTab, loadProjects]);

  useEffect(() => {
    if (activeTab === 'comments') void loadComments();
  }, [activeTab, loadComments]);

  useEffect(() => {
    if (activeTab === 'settings') void loadSettings();
  }, [activeTab, loadSettings]);

  const refreshActiveTab = () => {
    void loadSummary();
    if (activeTab === 'users') void loadUsers();
    if (activeTab === 'posts') void loadPosts();
    if (activeTab === 'projects') void loadProjects();
    if (activeTab === 'comments') void loadComments();
    if (activeTab === 'settings') void loadSettings();
  };

  const openUserEditor = (user: AdminUser) => {
    setEditingUser(user);
    userForm.setFieldsValue({
      displayname: user.displayname,
      photourl: user.photourl,
      role: user.role,
      qq_uin: user.qq_uin ?? '',
      clearPassword: false,
    });
  };

  const saveUser = async () => {
    if (!editingUser) return;
    const values = await userForm.validateFields();
    try {
      await apiJson(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayname: values.displayname,
          photourl: values.photourl ?? '',
          role: values.role,
          qq_uin: values.qq_uin || null,
          clearPassword: !!values.clearPassword,
        }),
      });
      message.success('账号已更新');
      setEditingUser(null);
      await Promise.all([loadUsers(), loadSummary(), refreshProfile()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存账号失败');
    }
  };

  const deleteUser = async (user: AdminUser) => {
    try {
      await apiJson(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      message.success('账号已删除');
      await Promise.all([loadUsers(), loadSummary()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除账号失败');
    }
  };

  const togglePostRecommended = async (post: AdminPost, checked: boolean) => {
    try {
      await apiJson(`/api/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isrecommended: checked }),
      });
      message.success(checked ? '已推荐动态' : '已取消推荐');
      await Promise.all([loadPosts(), loadSummary()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新推荐状态失败');
    }
  };

  const deletePost = async (post: AdminPost) => {
    modal.confirm({
      title: '删除这条动态？',
      content: '删除后无法恢复，相关评论和点赞也会随内容移除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiJson(`/api/posts/${post.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ deleteFiles: false }),
          });
          message.success('动态已删除');
          await Promise.all([loadPosts(), loadSummary()]);
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除动态失败');
        }
      },
    });
  };

  const toggleProjectRecommended = async (project: AdminProject, checked: boolean) => {
    try {
      await apiJson(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isrecommended: checked }),
      });
      message.success(checked ? '已推荐项目' : '已取消推荐');
      await Promise.all([loadProjects(), loadSummary()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新推荐状态失败');
    }
  };

  const deleteProject = async (project: AdminProject) => {
    modal.confirm({
      title: '删除这个项目？',
      content: '删除后无法恢复，相关评论和点赞也会随内容移除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiJson(`/api/projects/${project.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ deleteFiles: false }),
          });
          message.success('项目已删除');
          await Promise.all([loadProjects(), loadSummary()]);
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除项目失败');
        }
      },
    });
  };

  const deleteComment = async (comment: AdminComment) => {
    try {
      await apiJson(`/api/admin/comments/${comment.id}`, { method: 'DELETE' });
      message.success('评论已删除');
      await Promise.all([loadComments(), loadSummary()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除评论失败');
    }
  };

  const openSettingEditor = (setting?: AdminSetting) => {
    setEditingSetting(setting ?? null);
    settingForm.setFieldsValue({
      key: setting?.key ?? '',
      value: setting ? jsonPretty(setting.value) : '{}',
    });
    setSettingModalOpen(true);
  };

  const saveSetting = async () => {
    const values = await settingForm.validateFields();
    let value: unknown;
    try {
      value = parseJsonInput(values.value);
    } catch {
      message.error('设置值必须是有效 JSON');
      return;
    }
    try {
      await apiJson(`/api/admin/settings/${encodeURIComponent(values.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      message.success('设置已保存');
      setSettingModalOpen(false);
      await loadSettings();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存设置失败');
    }
  };

  const deleteSetting = async (setting: AdminSetting) => {
    try {
      await apiJson(`/api/admin/settings/${encodeURIComponent(setting.key)}`, { method: 'DELETE' });
      message.success('设置已删除');
      await loadSettings();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除设置失败');
    }
  };

  const summaryCards = useMemo(
    () => [
      { title: '账号', value: summary?.users ?? 0, icon: <Users size={18} /> },
      { title: '动态', value: summary?.posts ?? 0, icon: <FileText size={18} /> },
      { title: '项目', value: summary?.projects ?? 0, icon: <FolderKanban size={18} /> },
      { title: '评论', value: summary?.comments ?? 0, icon: <MessageSquare size={18} /> },
      { title: '点赞', value: summary?.likes ?? 0, icon: <ShieldCheck size={18} /> },
      {
        title: '推荐内容',
        value: (summary?.recommendedPosts ?? 0) + (summary?.recommendedProjects ?? 0),
        icon: <SettingsIcon size={18} />,
      },
    ],
    [summary]
  );

  const userColumns: ColumnsType<AdminUser> = [
    {
      title: '账号',
      dataIndex: 'displayname',
      width: 280,
      render: (_value, record) => (
        <Flex align="center" gap={10}>
          <GithubCdnAvatar src={record.photourl} size="default" />
          <div style={{ minWidth: 0 }}>
            <Text strong ellipsis style={{ display: 'block', maxWidth: 180 }}>
              {record.displayname}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Flex>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 96,
      render: (role: AdminUser['role']) =>
        role === 'admin' ? <Tag color="blue">管理员</Tag> : <Tag>用户</Tag>,
    },
    {
      title: '内容',
      width: 160,
      render: (_value, record) => (
        <Text type="secondary">
          动态 {record.postcount} / 项目 {record.projectcount}
        </Text>
      ),
    },
    {
      title: '互动',
      width: 160,
      render: (_value, record) => (
        <Text type="secondary">
          评论 {record.commentcount} / 点赞 {record.likecount}
        </Text>
      ),
    },
    {
      title: '绑定',
      width: 150,
      render: (_value, record) => (
        <Space size={4} wrap>
          {record.qq_uin ? <Tag color="green">QQ</Tag> : <Tag>未绑 QQ</Tag>}
          {record.haspassword ? <Tag color="cyan">密码</Tag> : <Tag>无密码</Tag>}
        </Space>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdat',
      width: 170,
      render: formatTime,
    },
    {
      title: '操作',
      fixed: screens.md ? 'right' : undefined,
      width: 140,
      render: (_value, record) => (
        <Space>
          <Tooltip title="编辑账号">
            <Button icon={<Pencil size={15} />} onClick={() => openUserEditor(record)} />
          </Tooltip>
          <Popconfirm
            title="删除账号？"
            description="账号及其内容会一并删除。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void deleteUser(record)}
          >
            <Button danger icon={<Trash2 size={15} />} disabled={record.id === profile?.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const postColumns: ColumnsType<AdminPost> = [
    {
      title: '动态',
      dataIndex: 'content',
      width: 360,
      render: (content: string, record) => (
        <div style={{ maxWidth: 340 }}>
          <PostBodyDisplay text={content} fontSize={14} collapsibleRows={3} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {shortId(record.id)}
          </Text>
        </div>
      ),
    },
    {
      title: '作者',
      width: 180,
      render: (_value, record) => (
        <Flex align="center" gap={8}>
          <GithubCdnAvatar src={record.authorPhoto} size="small" />
          <Text ellipsis style={{ maxWidth: 120 }}>
            {record.authorName || record.authorid}
          </Text>
        </Flex>
      ),
    },
    {
      title: '推荐',
      dataIndex: 'isrecommended',
      width: 90,
      render: (checked: boolean, record) => (
        <Switch checked={checked} onChange={(next) => void togglePostRecommended(record, next)} />
      ),
    },
    {
      title: '资源',
      width: 100,
      render: (_value, record) => <Text type="secondary">{record.images.length} 张图</Text>,
    },
    {
      title: '互动',
      width: 140,
      render: (_value, record) => (
        <Text type="secondary">
          赞 {record.likecount} / 评 {record.commentcount}
        </Text>
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'createdat',
      width: 170,
      render: formatTime,
    },
    {
      title: '操作',
      fixed: screens.md ? 'right' : undefined,
      width: 150,
      render: (_value, record) => (
        <Space>
          <Button onClick={() => navigate(`/post/${record.id}`)}>查看</Button>
          <Button danger icon={<Trash2 size={15} />} onClick={() => void deletePost(record)} />
        </Space>
      ),
    },
  ];

  const projectColumns: ColumnsType<AdminProject> = [
    {
      title: '项目',
      width: 360,
      render: (_value, record) => (
        <div style={{ maxWidth: 340 }}>
          <Text strong>
            <CommentText text={record.title} />
          </Text>
          <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '4px 0 0' }}>
            <CommentText text={record.summary || record.content} />
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {shortId(record.id)}
          </Text>
        </div>
      ),
    },
    {
      title: '作者',
      width: 180,
      render: (_value, record) => (
        <Flex align="center" gap={8}>
          <GithubCdnAvatar src={record.authorPhoto} size="small" />
          <Text ellipsis style={{ maxWidth: 120 }}>
            {record.authorName || record.authorid}
          </Text>
        </Flex>
      ),
    },
    {
      title: '推荐',
      dataIndex: 'isrecommended',
      width: 90,
      render: (checked: boolean, record) => (
        <Switch checked={checked} onChange={(next) => void toggleProjectRecommended(record, next)} />
      ),
    },
    {
      title: '资源',
      width: 110,
      render: (_value, record) => (
        <Text type="secondary">
          封面 {record.coverurl ? 1 : 0} / 附件 {record.attachments.length}
        </Text>
      ),
    },
    {
      title: '互动',
      width: 140,
      render: (_value, record) => (
        <Text type="secondary">
          赞 {record.likecount} / 评 {record.commentcount}
        </Text>
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'createdat',
      width: 170,
      render: formatTime,
    },
    {
      title: '操作',
      fixed: screens.md ? 'right' : undefined,
      width: 150,
      render: (_value, record) => (
        <Space>
          <Button onClick={() => navigate(`/project/${record.id}`)}>查看</Button>
          <Button danger icon={<Trash2 size={15} />} onClick={() => void deleteProject(record)} />
        </Space>
      ),
    },
  ];

  const commentColumns: ColumnsType<AdminComment> = [
    {
      title: '评论',
      dataIndex: 'text',
      width: 360,
      render: (text: string) => (
        <Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
          <CommentText text={text} />
        </Paragraph>
      ),
    },
    {
      title: '作者',
      width: 180,
      render: (_value, record) => (
        <Flex align="center" gap={8}>
          <GithubCdnAvatar src={record.authorPhoto} size="small" />
          <Text ellipsis style={{ maxWidth: 120 }}>
            {record.authorName || record.authorid}
          </Text>
        </Flex>
      ),
    },
    {
      title: '所属内容',
      width: 260,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={record.contenttype === 'post' ? 'blue' : 'purple'}>
            {record.contenttype === 'post' ? '动态' : '项目'}
          </Tag>
          <Text ellipsis style={{ maxWidth: 220 }}>
            {record.contenttitle || shortId(record.contentid)}
          </Text>
        </Space>
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'createdat',
      width: 170,
      render: formatTime,
    },
    {
      title: '操作',
      fixed: screens.md ? 'right' : undefined,
      width: 160,
      render: (_value, record) => (
        <Space>
          <Button
            onClick={() =>
              navigate(record.contenttype === 'post' ? `/post/${record.contentid}` : `/project/${record.contentid}`)
            }
          >
            查看
          </Button>
          <Popconfirm
            title="删除评论？"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void deleteComment(record)}
          >
            <Button danger icon={<Trash2 size={15} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const settingColumns: ColumnsType<AdminSetting> = [
    {
      title: '键',
      dataIndex: 'key',
      width: 220,
      render: (key: string) => <Text code>{key}</Text>,
    },
    {
      title: '值',
      dataIndex: 'value',
      render: (value: unknown) => (
        <pre
          style={{
            margin: 0,
            maxHeight: 120,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {jsonPretty(value)}
        </pre>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedat',
      width: 170,
      render: formatTime,
    },
    {
      title: '操作',
      fixed: screens.md ? 'right' : undefined,
      width: 140,
      render: (_value, record) => (
        <Space>
          <Button icon={<Pencil size={15} />} onClick={() => openSettingEditor(record)} />
          <Popconfirm
            title="删除设置？"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void deleteSetting(record)}
          >
            <Button danger icon={<Trash2 size={15} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const searchBar = (
    value: string,
    onChange: (value: string) => void,
    onSearch: () => void,
    placeholder: string,
    extra?: React.ReactNode
  ) => (
    <Flex gap={8} wrap="wrap" align="center" style={{ marginBottom: 16 }}>
      <Input.Search
        allowClear
        value={value}
        placeholder={placeholder}
        prefix={<Search size={15} />}
        onChange={(event) => onChange(event.target.value)}
        onSearch={onSearch}
        style={{ flex: '1 1 260px', maxWidth: screens.md ? 420 : undefined }}
      />
      {extra}
      <Button icon={<RefreshCw size={15} />} onClick={refreshActiveTab}>
        刷新
      </Button>
    </Flex>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        width: '100%',
        maxWidth: 1120,
        margin: '0 auto',
        paddingBottom: 72,
      }}
    >
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 20 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            管理后台
          </Title>
          <Text type="secondary">全站账号、动态、项目、评论与站点设置管理</Text>
        </div>
        <Button icon={<RefreshCw size={16} />} loading={summaryLoading} onClick={refreshActiveTab}>
          刷新数据
        </Button>
      </Flex>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.md ? 'repeat(6, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {summaryCards.map((item) => (
          <Card key={item.title} styles={{ body: { padding: screens.md ? 16 : 12 } }}>
            <Flex align="center" gap={8} style={{ color: token.colorTextSecondary, marginBottom: 4 }}>
              {item.icon}
              <Text type="secondary">{item.title}</Text>
            </Flex>
            <Statistic value={item.value} valueStyle={{ fontSize: screens.md ? 24 : 20 }} />
          </Card>
        ))}
      </div>

      <Card styles={{ body: { padding: screens.md ? 20 : 12 } }} style={{ borderRadius: token.borderRadiusLG }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as AdminTab)}
          items={[
            {
              key: 'users',
              label: (
                <Space size={6}>
                  <Users size={16} />
                  账号
                </Space>
              ),
              children: (
                <>
                  {searchBar(
                    userQuery,
                    (value) => {
                      setUserQuery(value);
                      setUserPage(1);
                    },
                    () => void loadUsers(),
                    '搜索昵称、邮箱、ID 或 QQ'
                  )}
                  <Table
                    rowKey="id"
                    size={tableSize}
                    columns={userColumns}
                    dataSource={users.items}
                    loading={usersLoading}
                    scroll={{ x: 1180 }}
                    pagination={{
                      current: userPage,
                      total: users.total,
                      pageSize: PAGE_SIZE,
                      showSizeChanger: false,
                      onChange: setUserPage,
                    }}
                  />
                </>
              ),
            },
            {
              key: 'posts',
              label: (
                <Space size={6}>
                  <FileText size={16} />
                  动态
                </Space>
              ),
              children: (
                <>
                  {searchBar(
                    postQuery,
                    (value) => {
                      setPostQuery(value);
                      setPostPage(1);
                    },
                    () => void loadPosts(),
                    '搜索动态内容',
                    <Select
                      value={postRecommended}
                      style={{ width: 130 }}
                      options={[
                        { label: '全部推荐状态', value: 'all' },
                        { label: '已推荐', value: 'true' },
                        { label: '未推荐', value: 'false' },
                      ]}
                      onChange={(value) => {
                        setPostRecommended(value);
                        setPostPage(1);
                      }}
                    />
                  )}
                  <Table
                    rowKey="id"
                    size={tableSize}
                    columns={postColumns}
                    dataSource={posts.items}
                    loading={postsLoading}
                    scroll={{ x: 1200 }}
                    pagination={{
                      current: postPage,
                      total: posts.total,
                      pageSize: PAGE_SIZE,
                      showSizeChanger: false,
                      onChange: setPostPage,
                    }}
                  />
                </>
              ),
            },
            {
              key: 'projects',
              label: (
                <Space size={6}>
                  <FolderKanban size={16} />
                  项目
                </Space>
              ),
              children: (
                <>
                  {searchBar(
                    projectQuery,
                    (value) => {
                      setProjectQuery(value);
                      setProjectPage(1);
                    },
                    () => void loadProjects(),
                    '搜索项目标题、简介或详情',
                    <Select
                      value={projectRecommended}
                      style={{ width: 130 }}
                      options={[
                        { label: '全部推荐状态', value: 'all' },
                        { label: '已推荐', value: 'true' },
                        { label: '未推荐', value: 'false' },
                      ]}
                      onChange={(value) => {
                        setProjectRecommended(value);
                        setProjectPage(1);
                      }}
                    />
                  )}
                  <Table
                    rowKey="id"
                    size={tableSize}
                    columns={projectColumns}
                    dataSource={projects.items}
                    loading={projectsLoading}
                    scroll={{ x: 1220 }}
                    pagination={{
                      current: projectPage,
                      total: projects.total,
                      pageSize: PAGE_SIZE,
                      showSizeChanger: false,
                      onChange: setProjectPage,
                    }}
                  />
                </>
              ),
            },
            {
              key: 'comments',
              label: (
                <Space size={6}>
                  <MessageSquare size={16} />
                  评论
                </Space>
              ),
              children: (
                <>
                  {searchBar(
                    commentQuery,
                    (value) => {
                      setCommentQuery(value);
                      setCommentPage(1);
                    },
                    () => void loadComments(),
                    '搜索评论内容',
                    <Select
                      value={commentType}
                      style={{ width: 120 }}
                      options={[
                        { label: '全部内容', value: 'all' },
                        { label: '动态', value: 'post' },
                        { label: '项目', value: 'project' },
                      ]}
                      onChange={(value) => {
                        setCommentType(value);
                        setCommentPage(1);
                      }}
                    />
                  )}
                  <Table
                    rowKey="id"
                    size={tableSize}
                    columns={commentColumns}
                    dataSource={comments.items}
                    loading={commentsLoading}
                    scroll={{ x: 1120 }}
                    pagination={{
                      current: commentPage,
                      total: comments.total,
                      pageSize: PAGE_SIZE,
                      showSizeChanger: false,
                      onChange: setCommentPage,
                    }}
                  />
                </>
              ),
            },
            {
              key: 'settings',
              label: (
                <Space size={6}>
                  <SettingsIcon size={16} />
                  设置
                </Space>
              ),
              children: (
                <>
                  <Flex justify="space-between" align="center" wrap="wrap" gap={8} style={{ marginBottom: 16 }}>
                    <Text type="secondary">设置值按 JSON 保存，适合站点开关、链接、文案和运行参数。</Text>
                    <Space>
                      <Button icon={<RefreshCw size={15} />} onClick={() => void loadSettings()}>
                        刷新
                      </Button>
                      <Button type="primary" icon={<SettingsIcon size={15} />} onClick={() => openSettingEditor()}>
                        新增设置
                      </Button>
                    </Space>
                  </Flex>
                  {settings.length === 0 && !settingsLoading ? (
                    <Empty description="暂无站点设置" />
                  ) : (
                    <Table
                      rowKey="key"
                      size={tableSize}
                      columns={settingColumns}
                      dataSource={settings}
                      loading={settingsLoading}
                      scroll={{ x: 940 }}
                      pagination={false}
                    />
                  )}
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="编辑账号"
        open={!!editingUser}
        onCancel={() => setEditingUser(null)}
        onOk={() => void saveUser()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {editingUser && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="ID">{editingUser.id}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{editingUser.email}</Descriptions.Item>
            </Descriptions>
            <Form form={userForm} layout="vertical">
              <Form.Item name="displayname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="photourl" label="头像路径">
                <Input />
              </Form.Item>
              <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: '用户', value: 'user' },
                    { label: '管理员', value: 'admin' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="qq_uin" label="QQ UIN">
                <Input />
              </Form.Item>
              <Form.Item name="clearPassword" valuePropName="checked">
                <Switch /> <Text style={{ marginLeft: 8 }}>清除密码登录凭据</Text>
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal
        title={editingSetting ? '编辑设置' : '新增设置'}
        open={settingModalOpen}
        onCancel={() => setSettingModalOpen(false)}
        onOk={() => void saveSetting()}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={settingForm} layout="vertical">
          <Form.Item
            name="key"
            label="设置键"
            rules={[
              { required: true, message: '请输入设置键' },
              {
                pattern: /^[a-z0-9_.:-]{1,80}$/i,
                message: '只能使用字母、数字、下划线、点、冒号和短横线',
              },
            ]}
          >
            <Input disabled={!!editingSetting} placeholder="site.title" />
          </Form.Item>
          <Form.Item name="value" label="JSON 值" rules={[{ required: true, message: '请输入 JSON 值' }]}>
            <TextArea
              rows={12}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default Admin;
