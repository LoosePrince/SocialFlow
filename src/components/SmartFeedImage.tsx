import React, { useState } from 'react';
import { theme } from 'antd';
import { GithubCdnAntImage } from './GithubCdnAntImage';
import type { ImageProps } from 'antd';

export type SmartFeedImageLayout = 'gridCell' | 'stacked';

type Props = ImageProps & {
  layout?: SmartFeedImageLayout;
};

/**
 * 动态流图片：默认不放大超过原图尺寸；仅当原图宽、高均 &lt; 50px 时允许在容器内放大（避免图标级图片看不见）。
 */
const SmartFeedImage: React.FC<Props> = ({
  layout = 'gridCell',
  onLoad,
  style,
  ...imgRest
}) => {
  const { token } = theme.useToken();
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const tiny = dims !== null && dims.w > 0 && dims.h > 0 && dims.w < 50 && dims.h < 50;

  const handleLoad: ImageProps['onLoad'] = (e) => {
    const el = e.currentTarget;
    if (el?.naturalWidth && el?.naturalHeight) {
      setDims({ w: el.naturalWidth, h: el.naturalHeight });
    }
    onLoad?.(e);
  };

  const imgStyle: React.CSSProperties = tiny
    ? {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }
    : {
        maxWidth: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        display: 'block',
        marginLeft: 'auto',
        marginRight: 'auto',
        ...(layout === 'gridCell' ? { maxHeight: 480 } : {}),
      };

  const shellStyle: React.CSSProperties =
    layout === 'gridCell'
      ? tiny
        ? {
            position: 'relative',
            width: '100%',
            aspectRatio: '1',
            minHeight: 50,
            borderRadius: token.borderRadius,
            overflow: 'hidden',
            background: token.colorBgLayout,
          }
        : {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            width: 'fit-content',
            maxWidth: '100%',
            borderRadius: token.borderRadius,
            overflow: 'hidden',
            background: token.colorBgLayout,
          }
      : tiny
        ? {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            maxWidth: 120,
            aspectRatio: '1',
            minHeight: 50,
            marginLeft: 'auto',
            marginRight: 'auto',
            borderRadius: token.borderRadius,
            overflow: 'hidden',
            background: token.colorBgLayout,
          }
        : {
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          };

  return (
    <div style={shellStyle}>
      <GithubCdnAntImage
        {...imgRest}
        onLoad={handleLoad}
        style={{ ...imgStyle, ...style }}
      />
    </div>
  );
};

export default SmartFeedImage;
