import React from 'react';
import { useGithubCdnSrc } from '../hooks/useGithubCdnSrc';

export const GithubCdnImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  src,
  onLoad,
  onError,
  ...rest
}) => {
  const cdn = useGithubCdnSrc(typeof src === 'string' ? src : undefined);

  return (
    <img
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
