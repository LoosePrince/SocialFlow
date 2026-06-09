import React from 'react';

type ResponsiveContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  wide?: boolean;
};

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  wide = false,
  className,
  style,
  ...rest
}) => {
  return (
    <div
      className={`sf-container${wide ? ' sf-container-wide' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
};

export default ResponsiveContainer;
