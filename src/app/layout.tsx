
import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ClerkProvider } from '@clerk/nextjs';
import ClientLogCaptureProvider from '@/components/providers/ClientLogCaptureProvider'; // Import the new provider

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
  title: 'IFC - Guru',
  description: 'Your personal finance management companion.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning={true}>
        <body
          className={cn(
            'min-h-screen bg-background font-sans antialiased',
            inter.variable,
            roboto_mono.variable
          )}
        >
          <ClientLogCaptureProvider> {/* Wrap with ClientLogCaptureProvider */}
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <SidebarProvider>
                {children}
                <Toaster />
              </SidebarProvider>
            </ThemeProvider>
          </ClientLogCaptureProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
