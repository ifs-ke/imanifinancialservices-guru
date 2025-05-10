// src/app/(dashboard)/dashboard/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Loading() {
  // You can add any UI inside Loading, including a Skeleton.
  return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full">
        <LoadingSpinner size={48} text="Loading Dashboard..." />
      </div>
    );
}
