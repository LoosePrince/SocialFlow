import React from 'react';
import { Card, Divider, Flex, Grid, Skeleton, theme } from 'antd';

const { useBreakpoint } = Grid;

/** 与详情页中 CommentSection 外包一层 + 评论区根节点一致 */
function CommentSectionSkeleton() {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  return (
    <div style={{ marginTop: 24, padding: screens.md ? 0 : 16 }}>
      <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG, padding: 20 }}>
        <Flex align="center" gap={8} style={{ marginBottom: 20 }}>
          <Skeleton.Input active size="small" style={{ width: 100, height: 18 }} />
        </Flex>
        <Flex gap={12} style={{ marginBottom: 24 }}>
          <Skeleton.Avatar active size={40} />
          <div style={{ flex: 1 }}>
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </div>
        </Flex>
        <Skeleton active avatar={{ size: 36 }} paragraph={{ rows: 2 }} title={false} />
      </div>
    </div>
  );
}

/** 与 PostCard 卡片结构一致 */
export function PostCardSkeleton() {
  const { token } = theme.useToken();
  return (
    <Card
      style={{
        marginBottom: 16,
        background: token.colorBgContainer,
        boxShadow: token.boxShadow,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
      styles={{ body: { padding: 20 } }}
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
        <Flex align="start" gap={16}>
          <Skeleton.Avatar active size="large" />
          <Flex vertical gap={8}>
            <Skeleton.Input active size="small" style={{ width: 120, height: 16 }} />
            <Skeleton.Input active size="small" style={{ width: 72, height: 12 }} />
          </Flex>
        </Flex>
        <Skeleton.Button active size="small" style={{ width: 32, minWidth: 32, height: 32 }} />
      </Flex>

      <div style={{ marginBottom: 16 }}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            width: '100%',
            maxWidth: 400,
            marginTop: 12,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '100%',
                paddingBottom: '100%',
                position: 'relative',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0 }}>
                <Skeleton.Input
                  active
                  block
                  size="large"
                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
        <Flex gap={16}>
          <Skeleton.Button active size="small" style={{ width: 52, height: 28 }} />
          <Skeleton.Button active size="small" style={{ width: 52, height: 28 }} />
          <Skeleton.Button active size="small" style={{ width: 36, height: 28 }} />
        </Flex>
        <div style={{ marginTop: 12 }}>
          <Skeleton active title={false} paragraph={{ rows: 1, width: ['40%'] }} />
        </div>
      </div>
    </Card>
  );
}

/** 与 ProjectCard（封面 + 右上操作 + Meta + actions）一致 */
export function ProjectCardSkeleton() {
  const { token } = theme.useToken();
  return (
    <Card
      style={{
        marginBottom: 16,
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
      cover={
        <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
          {/* 不用 Skeleton.Image：其在 cover 内无法铺满，易出现窄条 + 图标错位 */}
          <Skeleton.Input
            active
            block
            size="large"
            style={{ width: '100%', height: 180, minHeight: 180, borderRadius: 0 }}
          />
        </div>
      }
      actions={[
        <Flex key="t" justify="center" align="center" style={{ padding: '8px 0' }}>
          <Skeleton.Input active size="small" style={{ width: 88, height: 14 }} />
        </Flex>,
        <Flex key="l" justify="center" align="center" style={{ padding: '8px 0' }}>
          <Skeleton.Input active size="small" style={{ width: 48, height: 14 }} />
        </Flex>,
        <Flex key="c" justify="center" align="center" style={{ padding: '8px 0' }}>
          <Skeleton.Input active size="small" style={{ width: 48, height: 14 }} />
        </Flex>,
        <Flex key="s" justify="center" align="center" style={{ padding: '8px 0' }}>
          <Skeleton.Input active size="small" style={{ width: 48, height: 14 }} />
        </Flex>,
      ]}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
        <Skeleton.Button active size="small" style={{ width: 32, minWidth: 32, height: 32 }} />
      </div>
      <Card.Meta
        avatar={<Skeleton.Avatar active />}
        title={<Skeleton.Input active size="small" style={{ width: '70%', maxWidth: 280, height: 20 }} />}
        description={
          <div style={{ marginTop: 8 }}>
            <Skeleton active paragraph={{ rows: 2, width: ['100%', '80%'] }} title={false} />
          </div>
        }
      />
    </Card>
  );
}

/** 首页 Feed：动态 + 项目各一条（外层由页面加 home-page / motion） */
export function HomeFeedSkeleton() {
  return (
    <>
      <PostCardSkeleton />
      <ProjectCardSkeleton />
    </>
  );
}

/** 个人页顶部资料卡 */
export function ProfileHeaderSkeleton() {
  const { token } = theme.useToken();
  return (
    <Card
      variant="borderless"
      style={{
        marginBottom: 24,
        boxShadow: token.boxShadow,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',
      }}
      styles={{ body: { padding: 0 } }}
    >
      <Flex vertical align="center" style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
        <Skeleton.Avatar active size={100} style={{ marginBottom: 16 }} />
        <Skeleton.Input active size="small" style={{ width: 160, height: 28, marginBottom: 8 }} />
        <Skeleton.Input active size="small" style={{ width: 220, height: 16, marginBottom: 16 }} />
        <Flex gap={16} align="center" justify="center" style={{ marginTop: 4 }}>
          <Skeleton.Input active size="small" style={{ width: 72, height: 16 }} />
          <Skeleton.Input active size="small" style={{ width: 88, height: 16 }} />
        </Flex>
      </Flex>
    </Card>
  );
}

/** 个人页：资料卡 + 「发布的内容」+ 两条 Feed（外层 maxWidth 由页面 motion 容器承担） */
export function ProfilePageSkeleton() {
  return (
    <>
      <ProfileHeaderSkeleton />
      <div style={{ marginTop: 32 }}>
        <Skeleton.Input active size="small" style={{ width: 120, height: 22, marginBottom: 20 }} />
        <PostCardSkeleton />
        <ProjectCardSkeleton />
      </div>
    </>
  );
}

/** 动态详情：返回 + Card（作者行 + 正文 + 图）+ 评论区 */
export function PostDetailPageSkeleton() {
  const { token } = theme.useToken();
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Skeleton.Button active size="small" style={{ width: 72, height: 32, marginBottom: 16 }} />
      <Card
        variant="borderless"
        style={{
          boxShadow: token.boxShadow,
          borderRadius: token.borderRadiusLG,
          marginBottom: 24,
        }}
        styles={{ body: { padding: 32 } }}
      >
        <Flex align="start" gap={16} style={{ marginBottom: 24 }}>
          <Skeleton.Avatar active size={48} />
          <Flex vertical gap={10} style={{ flex: 1 }}>
            <Skeleton.Input active size="small" style={{ width: 140, height: 22 }} />
            <Skeleton.Input active size="small" style={{ width: 160, height: 14 }} />
          </Flex>
        </Flex>
        <Skeleton active paragraph={{ rows: 5 }} title={false} style={{ marginBottom: 24 }} />
        <div style={{ width: '100%', overflow: 'hidden', borderRadius: token.borderRadius }}>
          {/* 与 PostDetail 正文下图一致：整宽矩形，避免 Skeleton.Image 窄条错位 */}
          <Skeleton.Input
            active
            block
            size="large"
            style={{ width: '100%', height: 220, minHeight: 220, borderRadius: token.borderRadius }}
          />
        </div>
      </Card>
      <CommentSectionSkeleton />
    </div>
  );
}

/** 项目详情：返回 + Card（封面 + 标签/标题/摘要/作者/正文）+ 评论区 */
export function ProjectDetailPageSkeleton() {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  return (
    <div style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
      <Skeleton.Button active size="small" style={{ width: 72, height: 32, marginBottom: 16 }} />
      <Card
        variant="borderless"
        style={{
          padding: 0,
          overflow: 'hidden',
          boxShadow: screens.md ? token.boxShadow : 'none',
          borderRadius: screens.md ? token.borderRadiusLG : 0,
          background: screens.md ? token.colorBgContainer : 'transparent',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ width: '100%', maxHeight: 400, overflow: 'hidden' }}>
          <Skeleton.Input
            active
            block
            size="large"
            style={{ width: '100%', height: 240, minHeight: 240, borderRadius: 0 }}
          />
        </div>
        <div style={{ padding: screens.md ? 32 : 16 }}>
          <Skeleton.Input active size="small" style={{ width: 72, height: 24, marginBottom: 12 }} />
          <Skeleton active title={{ width: '80%' }} paragraph={{ rows: 2 }} style={{ marginBottom: 8 }} />
          <Divider style={{ margin: '16px 0' }} />
          <Flex align="center" gap={12} style={{ marginBottom: 32 }}>
            <Skeleton.Avatar active size="large" />
            <Flex vertical gap={8}>
              <Skeleton.Input active size="small" style={{ width: 100, height: 16 }} />
              <Skeleton.Input active size="small" style={{ width: 140, height: 12 }} />
            </Flex>
          </Flex>
          <Skeleton active paragraph={{ rows: 12 }} title={false} />
        </div>
      </Card>
      <CommentSectionSkeleton />
    </div>
  );
}

/** 消息列表（外层由页面加 main-container） */
export function MessagesPageSkeleton() {
  const { token } = theme.useToken();
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <Skeleton.Input active size="small" style={{ width: 140, height: 32 }} />
        <Skeleton.Button active size="small" style={{ width: 96, height: 32 }} />
      </Flex>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            marginBottom: 8,
            background: i < 2 ? token.colorPrimaryBg : 'transparent',
          }}
        >
          <Flex gap={16} align="start">
            <Skeleton.Avatar active size={40} shape="circle" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Flex wrap="wrap" gap={8} align="center" style={{ marginBottom: 8 }}>
                <Skeleton.Input active size="small" style={{ width: 96, height: 16 }} />
                <Skeleton.Input active size="small" style={{ width: 140, height: 14 }} />
                <Skeleton.Input active size="small" style={{ width: 56, height: 12 }} />
              </Flex>
              <Skeleton active title={false} paragraph={{ rows: 1, width: ['100%'] }} />
            </div>
          </Flex>
        </div>
      ))}
    </>
  );
}
