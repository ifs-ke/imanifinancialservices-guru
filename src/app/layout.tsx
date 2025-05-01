import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

// Initialize Inter font for sans-serif
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

// Initialize Roboto Mono font for monospace
const roboto_mono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Debt Conqueror',
  description: 'Take control of your finances and conquer your debt.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add className="dark" here to force dark mode, or implement a theme switcher
    // that dynamically adds/removes the class based on user preference or system settings.
    // For now, we'll assume a theme switcher might handle this, or rely on OS preference.
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable, // Use Inter variable
          roboto_mono.variable // Use Roboto Mono variable
        )}
      >
        <SidebarProvider>
          {children}
          <Toaster />
        </SidebarProvider>
      </body>
    </html>
  );
}