import React, { forwardRef } from 'react';
import { Avatar, type AvatarProps } from 'antd';
import { useGithubCdnSrc } from '../hooks/useGithubCdnSrc';

/** forwardRef：避免 Tooltip / Popover 等用 findDOMNode 定位子节点（StrictMode 会告警） */
export const GithubCdnAvatar = forwardRef<React.ComponentRef<typeof Avatar>, AvatarProps>(
  function GithubCdnAvatar({ src, onError, ...rest }, ref) {
    const cdn = useGithubCdnSrc(typeof src === 'string' ? src : undefined);

    const handleError: AvatarProps['onError'] = () => {
      const inner = cdn.avatarOnError();
      const userRet = onError?.();
      return userRet !== undefined ? userRet : inner;
    };

    return <Avatar {...rest} ref={ref} src={cdn.src} onError={handleError} />;
  }
);

GithubCdnAvatar.displayName = 'GithubCdnAvatar';
