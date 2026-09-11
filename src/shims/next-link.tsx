import React from 'react';
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';

export interface NextLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string | { pathname?: string; query?: Record<string, string> };
  children?: React.ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  asChild?: boolean;
  className?: string;
}

export default function Link({
  href,
  children,
  prefetch,
  replace,
  className,
  ...props
}: NextLinkProps) {
  const to = typeof href === 'string' ? href : (href.pathname || '/');

  return (
    <RouterLink to={to} replace={replace} className={className} {...props}>
      {children}
    </RouterLink>
  );
}
