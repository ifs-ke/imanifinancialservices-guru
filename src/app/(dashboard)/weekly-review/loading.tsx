// src/app/(dashboard)/weekly-review/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <LoadingSpinner size={48} text="Loading Weekly Review..." />
      </div>
    );
}