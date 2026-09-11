// src/app/(auth)/layout.tsx
import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full flex items-center justify-center">
        {children}
      </div>
    </main>
  );
}
