// src/app/(dashboard)/debt/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full">
        <LoadingSpinner className='left-30' size={48} text="Loading Debts..." />
      </div>
    );
}
