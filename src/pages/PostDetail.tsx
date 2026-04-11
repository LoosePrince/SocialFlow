import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Typography, Button, App, Card, theme, Flex } from 'antd';
import { PostDetailPageSkeleton } from '../components/PageSkeletons';
import { GithubCdnAvatar } from '../components/GithubCdnAvatar';
import { GithubCdnImg } from '../components/GithubCdnImg';
import { ArrowLeft, Clock } from 'lucide-react';
import { getGithubUrl } from '../github';
import CommentSection from '../components/CommentSection';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';

const { Title, Text, Paragraph } = Typography;

const PostDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { token } = theme.useToken();

  useEffect(() => {
    const fetchPost = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`*, profiles:authorid (displayname, photourl)`)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        setPost(null);
      } else {
        const authorPhoto = data.profiles?.photourl || '';
        setPost({
          ...data,
          authorName: data.profiles?.displayname,
          authorPhoto: authorPhoto.startsWith('http') ? authorPhoto : getGithubUrl(authorPhoto),
          images: (data.images as string[] || []).map(getGithubUrl)
        });
      }
      setLoading(false);
    };

    fetchPost();
  }, [id]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 680, margin: '0 auto' }}>
        <PostDetailPageSkeleton />
      </motion.div>
    );
  }
  if (!post) return <div style={{ padding: 24, textAlign: 'center' }}><Text type="secondary">动态不存在</Text></div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 680, margin: '0 auto' }}
    >
      <Button 
        type="text" 
        icon={<ArrowLeft size={16}/>} 
        onClick={() => navigate(-1)} 
        style={{ marginBottom: 16, color: token.colorTextSecondary }}
      >
        返回
      </Button>
      
      <Card 
        variant="borderless"
        style={{ 
          boxShadow: token.boxShadow,
          borderRadius: token.borderRadiusLG,
          marginBottom: 24
        }}
        styles={{ body: { padding: 32 } }}
      >
        <Flex align="start" gap={16} style={{ marginBottom: 24 }}>
          <GithubCdnAvatar 
            src={post.authorPhoto} 
            size={48} 
            onClick={() => navigate(`/profile/${post.authorid}`)} 
            style={{ cursor: 'pointer' }}
          />
          <Flex vertical>
            <Title 
              level={4} 
              style={{ margin: 0, cursor: 'pointer' }} 
              onClick={() => navigate(`/profile/${post.authorid}`)}
            >
              {post.authorName}
            </Title>
            <Flex align="center" gap={4} style={{ marginTop: 4 }}>
              <Clock size={12} style={{ color: token.colorTextDescription }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(post.createdat || post.createdAt).format('YYYY-MM-DD HH:mm')}
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <Paragraph style={{ fontSize: 18, lineHeight: 1.6, color: token.colorText, marginBottom: 24 }}>
          {post.content}
        </Paragraph>
        
        {post.images && post.images.length > 0 && (
          <Flex vertical gap={12}>
            {post.images.map((img: string, idx: number) => (
              <GithubCdnImg 
                key={idx} 
                src={img} 
                style={{ 
                  width: '100%', 
                  borderRadius: token.borderRadius,
                  boxShadow: token.boxShadowSecondary 
                }} 
                alt="" 
              />
            ))}
          </Flex>
        )}
      </Card>

      <div style={{ marginTop: 24 }}>
        <CommentSection contentId={post.id} contentType="post" />
      </div>
    </motion.div>
  );
};

export default PostDetail;
