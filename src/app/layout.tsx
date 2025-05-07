import type { Metadata } from 'next/server';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/providers/theme-provider';
// import { ClerkProvider } from '@clerk/nextjs'; // Clerk disabled

 // Initialize Inter font for sans-serif
 const inter = Inter({
   subsets: ['latin'],
   display: 'swap',
   variable: '--font-inter',
 });

 // Initialize Roboto Mono for monospace
 const roboto_mono = Roboto_Mono({
   subsets: ['latin'],
   display: 'swap',
   variable: '--font-roboto-mono',
 });


export const metadata: Metadata = {
  title: 'IFC - Guru',
  description: 'Take control of your finances and conquer your debt.',
  // icons: { // Consider adding favicons here
  //   icon: '/favicon.ico',
  // },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}> // Clerk disabled
    <html lang="en" suppressHydrationWarning={true}>
      <body
          className={cn(
            'min-h-screen bg-background font-sans antialiased',
            inter.variable,
            roboto_mono.variable // Add Roboto Mono variable
          )}
        >
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
                {/* Removed Context Providers as state is handled by Zustand */}
                 <SidebarProvider> {/* Sidebar context needed for layout */}
                    {children}
                    <Toaster />
                 </SidebarProvider>
            </ThemeProvider>
        </body>
      </html>
    // </ClerkProvider> // Clerk disabled
  );
}
