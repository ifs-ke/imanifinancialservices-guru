
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/context/AuthContext';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';

// Initialize Plus Jakarta Sans as the single global typeface
const plus_jakarta_sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'IFS-Guru',
  description: 'Unified personal wealth intelligence and SME business cashflow operating system with offline-first sync, statement parsing, debt elimination, and DPA 2019 audit compliance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <html lang="en" suppressHydrationWarning={true}>
        <body
          className={cn(
            'min-h-screen w-full bg-background font-jakarta antialiased',
            plus_jakarta_sans.variable
          )}
        >
          {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
            <GoogleAnalytics />
          )}
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
        </body>
      </html>
    </AuthProvider>
  );
}
