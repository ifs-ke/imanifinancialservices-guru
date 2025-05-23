// src/app/(dashboard)/income-expenses/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner size={48} text="Loading Analysis..." />
      </div>
    );
}
