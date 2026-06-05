import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Divider, theme, Tooltip, Typography } from 'antd';
import type { Components } from 'react-markdown';
import { GithubCdnImg } from './GithubCdnImg';
import { useTwikooOwo } from '../hooks/useTwikooOwo';

const { Title, Text } = Typography;

export interface ProjectMarkdownContentProps {
  markdown: string;
}

/**
 * 与项目详情页一致的项目正文 Markdown 渲染（GFM）。
 */
const ProjectMarkdownContent: React.FC<ProjectMarkdownContentProps> = ({
  markdown,
}) => {
  const { token } = theme.useToken();
  const { getIcon } = useTwikooOwo();

  const markdownWithOwo = useMemo(
    () =>
      (typeof markdown === 'string' ? markdown : '').replace(
        /\[:(\S+?)\]/g,
        (raw, id: string) => {
          const icon = getIcon(id);
          return icon ? `![owo:${id}](${icon})` : raw;
        }
      ),
    [getIcon, markdown]
  );

  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <Title level={3} style={{ marginTop: '1.25em', marginBottom: '0.5em' }}>
          {children}
        </Title>
      ),
      h2: ({ children }) => (
        <Title level={4} style={{ marginTop: '1.1em', marginBottom: '0.45em' }}>
          {children}
        </Title>
      ),
      h3: ({ children }) => (
        <Title level={5} style={{ marginTop: '1em', marginBottom: '0.4em' }}>
          {children}
        </Title>
      ),
      h4: ({ children }) => (
        <Text
          strong
          style={{
            display: 'block',
            fontSize: 16,
            marginTop: '0.9em',
            marginBottom: '0.35em',
          }}
        >
          {children}
        </Text>
      ),
      h5: ({ children }) => (
        <Text
          strong
          style={{
            display: 'block',
            fontSize: 15,
            marginTop: '0.85em',
            marginBottom: '0.3em',
          }}
        >
          {children}
        </Text>
      ),
      h6: ({ children }) => (
        <Text
          type="secondary"
          strong
          style={{
            display: 'block',
            fontSize: 14,
            marginTop: '0.8em',
            marginBottom: '0.25em',
          }}
        >
          {children}
        </Text>
      ),
      p: ({ children }) => (
        <p
          style={{
            margin: '0.75em 0',
            fontSize: 16,
            lineHeight: 1.8,
            color: token.colorText,
          }}
        >
          {children}
        </p>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: token.colorLink }}
        >
          {children}
        </a>
      ),
      ul: ({ children }) => (
        <ul
          style={{
            margin: '0.75em 0',
            paddingLeft: 24,
            color: token.colorText,
            lineHeight: 1.8,
          }}
        >
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol
          style={{
            margin: '0.75em 0',
            paddingLeft: 24,
            color: token.colorText,
            lineHeight: 1.8,
          }}
        >
          {children}
        </ol>
      ),
      li: ({ children }) => <li style={{ margin: '0.25em 0' }}>{children}</li>,
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '1em 0',
            padding: '0.5em 1em',
            borderLeft: `4px solid ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
            color: token.colorTextSecondary,
          }}
        >
          {children}
        </blockquote>
      ),
      code: ({ className, children, ...props }) => {
        const inline = !className;
        if (inline) {
          return (
            <code
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.9em',
                padding: '2px 6px',
                borderRadius: token.borderRadiusSM,
                background: token.colorFillQuaternary,
              }}
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className={className}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }}
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre
          style={{
            margin: '1em 0',
            padding: 16,
            overflow: 'auto',
            borderRadius: token.borderRadius,
            background: token.colorFillQuaternary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {children}
        </pre>
      ),
      hr: () => <Divider style={{ margin: '1.5em 0' }} />,
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '1em 0' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead style={{ background: token.colorFillQuaternary }}>{children}</thead>
      ),
      th: ({ children }) => (
        <th
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            padding: '8px 12px',
            textAlign: 'left',
            fontWeight: 600,
          }}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            padding: '8px 12px',
          }}
        >
          {children}
        </td>
      ),
      img: ({ src, alt }) => {
        if (alt?.startsWith('owo:')) {
          return (
            <Tooltip
              title={
                <img
                  src={src}
                  alt=""
                  style={{
                    display: 'block',
                    maxWidth: 150,
                    maxHeight: 150,
                    minWidth: 50,
                    minHeight: 50,
                    objectFit: 'contain',
                  }}
                />
              }
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                style={{
                  height: '1.25em',
                  width: 'auto',
                  maxWidth: '6em',
                  verticalAlign: 'middle',
                  display: 'inline-block',
                  margin: '0 1px',
                }}
              />
            </Tooltip>
          );
        }
        return (
          <GithubCdnImg
            src={src}
            alt={alt ?? ''}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: token.borderRadius,
            }}
          />
        );
      },
    }),
    [token]
  );

  return (
    <div
      style={{ fontSize: 16, lineHeight: 1.8, color: token.colorText }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdownWithOwo}
      </ReactMarkdown>
    </div>
  );
};

export default ProjectMarkdownContent;
