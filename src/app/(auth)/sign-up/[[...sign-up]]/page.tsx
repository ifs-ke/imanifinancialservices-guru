--- a/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
+++ b/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
@@ -2,9 +2,10 @@
 
 // import { SignUp } from '@clerk/nextjs'; // Clerk disabled
 import { redirect } from 'next/navigation';
-
+ 
 export default function SignUpPage() {
   // When Clerk is disabled, redirect to dashboard or a landing page
+
    redirect('/dashboard');
 
   // return ( // Clerk disabled
+