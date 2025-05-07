import type { Metadata } from 'next/server';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/providers/theme-provider';
// import { ClerkProvider } from '@clerk/nextjs'; // Re-enabled Clerk
// import ClientLogCaptureProvider from '@/components/providers/ClientLogCaptureProvider'; // Removed import
 
 // Initialize Inter font for sans-serif
 const inter = Inter({
@@ -22,7 +23,7 @@
   return (
     // <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
     <html lang="en" suppressHydrationWarning={true}>
-      <body
+      <body
           className={cn(
             'min-h-screen bg-background font-sans antialiased',
             inter.variable,
@@ -40,7 +41,7 @@
             </ThemeProvider>
         </body>
       </html>
-    </ClerkProvider>
+    // </ClerkProvider>
   );
 }
 
