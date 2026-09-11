
// src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignInForm } from '@/components/auth/SignInForm';

export default function SignInPage() {
  return (
    <div className="w-full flex items-center justify-center">
      <SignInForm />
    </div>
  );
}
