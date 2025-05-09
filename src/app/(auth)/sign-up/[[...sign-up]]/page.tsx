// src/app/(auth)/sign-up/[[...sign-up]]/page.tsx

 import { SignUp } from '@clerk/nextjs';

 export default function SignUpPage() {
    // Render the Clerk Sign Up component
   return (
     <div className="flex items-center justify-center min-h-screen">
       <SignUp />
     </div>
   );
 }
