
// src/components/layout/PageHeader.tsx
import React, { type ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Card components are not typically used for a page header itself but are fine for this example structure if desired. Standard h1, p might be more semantic.
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode; // For action buttons or other elements
}

export function PageHeader({ title, description, icon, className, children }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          {icon && React.cloneElement(icon as React.ReactElement, { className: "h-6 w-6 text-primary" })}
          {title}
        </h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap items-center">{children}</div>}
    </header>
  );
}
