
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex justify-center items-center w-full h-screen"> {/* Changed min-h-screen to h-screen and removed left-[30%] */}
      <SignIn path="/sign-in" />
    </div>
  );
}
