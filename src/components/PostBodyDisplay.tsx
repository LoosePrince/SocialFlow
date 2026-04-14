import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Typography, theme } from 'antd';

const { Paragraph } = Typography;

export interface PostBodyDisplayProps {
  text: string;
  /** 与动态详情页默认一致为 18；卡片信息流为 16 */
  fontSize?: number;
  /** 设置后启用折叠能力，值为默认展示行数 */
  collapsibleRows?: number;
  /** 在可点击父容器中使用时，阻止链接和展开按钮冒泡 */
  preventOuterClick?: boolean;
}

/**
 * 与动态详情 / 信息流一致的纯文本正文（保留换行 + 链接高亮）。
 */
const PostBodyDisplay: React.FC<PostBodyDisplayProps> = ({
  text,
  fontSize = 18,
  collapsibleRows,
  preventOuterClick = false,
}) => {
  const { token } = theme.useToken();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const lineHeight = 1.6;
  const collapsedMaxHeight = (collapsibleRows ?? 0) * fontSize * lineHeight;
  const shouldCollapse = typeof collapsibleRows === 'number' && collapsibleRows > 0;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urlPattern = /^https?:\/\/[^\s]+$/;
  const segments = useMemo(() => text.split('\n'), [text]);

  useEffect(() => {
    if (!shouldCollapse || expanded) {
      return;
    }
    const el = contentRef.current;
    if (!el) {
      return;
    }
    setCanExpand(el.scrollHeight > collapsedMaxHeight + 1);
  }, [collapsedMaxHeight, expanded, shouldCollapse, text]);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  const stopPropagation = (event: React.MouseEvent<HTMLElement>) => {
    if (preventOuterClick) {
      event.stopPropagation();
    }
  };

  const renderLine = (line: string, lineIndex: number) => {
    const parts = line.split(urlRegex);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (urlPattern.test(part)) {
            return (
              <a
                key={`link-${lineIndex}-${partIndex}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stopPropagation}
                style={{
                  color: token.colorLink,
                  wordBreak: 'break-all',
                }}
              >
                {part}
              </a>
            );
          }
          return <React.Fragment key={`text-${lineIndex}-${partIndex}`}>{part}</React.Fragment>;
        })}
        {lineIndex < segments.length - 1 && <br />}
      </React.Fragment>
    );
  };

  return (
    <div>
      <Paragraph
        ref={contentRef}
        style={{
          fontSize,
          lineHeight,
          marginBottom: 0,
          color: token.colorText,
          wordBreak: 'break-word',
          ...(shouldCollapse && !expanded
            ? {
                maxHeight: collapsedMaxHeight,
                overflow: 'hidden',
              }
            : {}),
        }}
      >
        {segments.map((line, lineIndex) => renderLine(line, lineIndex))}
      </Paragraph>
      {shouldCollapse && canExpand && (
        <Button
          type="link"
          size="small"
          style={{ paddingInline: 0, marginTop: 4 }}
          onClick={(event) => {
            stopPropagation(event);
            setExpanded((prev) => !prev);
          }}
        >
          {expanded ? '收起' : '展开'}
        </Button>
      )}
    </div>
  );
};

export default PostBodyDisplay;
