--- a/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
+++ b/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@@ -2,9 +2,10 @@
 
 // import { SignIn } from '@clerk/nextjs'; // Clerk disabled
 import { redirect } from 'next/navigation';
-
+ 
 export default function SignInPage() {
   // When Clerk is disabled, redirect to dashboard or a landing page
+
   redirect('/dashboard');
 
   // return ( // Clerk disabled
+