import React from 'react';
import { Typography, theme } from 'antd';

const { Paragraph } = Typography;

export interface PostBodyDisplayProps {
  text: string;
  /** 与动态详情页默认一致为 18；卡片信息流为 16 */
  fontSize?: number;
}

/**
 * 与动态详情 / 信息流一致的纯文本正文（保留换行）。
 */
const PostBodyDisplay: React.FC<PostBodyDisplayProps> = ({
  text,
  fontSize = 18,
}) => {
  const { token } = theme.useToken();

  return (
    <Paragraph
      style={{
        fontSize,
        lineHeight: 1.6,
        marginBottom: 0,
        whiteSpace: 'pre-wrap',
        color: token.colorText,
      }}
    >
      {text}
    </Paragraph>
  );
};

export default PostBodyDisplay;
