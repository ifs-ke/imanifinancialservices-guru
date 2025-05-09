// src/app/(auth)/sign-in/[[...sign-in]]/page.tsx

 import { SignIn } from '@clerk/nextjs';

 export default function SignInPage() {
   // Render the Clerk Sign In component
   return (
     <div className="flex items-center justify-center min-h-screen">
       <SignIn />
     </div>
   );
 }
