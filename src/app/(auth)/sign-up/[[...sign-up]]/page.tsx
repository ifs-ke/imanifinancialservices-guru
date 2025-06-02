
// src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
 return (
   <div className="flex items-center justify-center min-h-screen">
     <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
   </div>
 );
}
