import React from 'react';
import { Image, type ImageProps } from 'antd';
import { useGithubCdnSrc } from '../hooks/useGithubCdnSrc';

export const GithubCdnAntImage: React.FC<ImageProps> = ({ src, onLoad, onError, ...rest }) => {
  const cdn = useGithubCdnSrc(typeof src === 'string' ? src : undefined);

  return (
    <Image
      {...rest}
      src={cdn.src}
      onLoad={(e) => {
        cdn.onLoad(e);
        onLoad?.(e);
      }}
      onError={(e) => {
        cdn.onError(e);
        onError?.(e);
      }}
    />
  );
};
