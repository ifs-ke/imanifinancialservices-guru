import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google'; // Changed font imports
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

// Initialize Inter font for sans-serif
const inter = Inter({
  variable: '--font-inter', // Changed variable name
  subsets: ['latin'],
});

// Initialize Roboto Mono font for monospace
const roboto_mono = Roboto_Mono({
  variable: '--font-roboto-mono', // Changed variable name
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
    <html lang="en">
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
