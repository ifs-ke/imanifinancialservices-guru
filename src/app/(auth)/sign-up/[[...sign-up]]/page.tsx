
// src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUpForm } from '@/components/auth/SignUpForm';

export default function SignUpPage() {
  return (
    <div className="w-full flex items-center justify-center">
      <SignUpForm />
    </div>
  );
}
