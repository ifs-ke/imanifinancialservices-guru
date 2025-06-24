// src/components/layout/PageHeader.tsx
import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: React.ElementType;
  className?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon: IconComponent, className, children }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          {IconComponent && <IconComponent className="h-6 w-6 text-primary" />}
          {title}
        </h1>
        {description && <div className="text-muted-foreground text-sm">{description}</div>}
      </div>
      {children && <div className="flex gap-2 flex-wrap items-center">{children}</div>}
    </header>
  );
}
