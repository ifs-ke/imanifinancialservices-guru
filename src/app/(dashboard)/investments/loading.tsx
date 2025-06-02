// src/app/(dashboard)/investments/loading.tsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Briefcase } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader
        title="Investments"
        description="Track your current portfolio and plan for future growth."
        icon={<Briefcase className="h-6 w-6" />}
      >
        <Skeleton className="h-9 w-36" /> {/* Placeholder for Add Investment button */}
      </PageHeader>

      <main className="flex-1 px-4 md:px-6 lg:px-8 space-y-8">
        {/* Current Portfolio Overview Skeleton */}
        <Card className="shadow-md">
          <CardHeader className="p-6">
            <CardTitle>Current Portfolio Overview</CardTitle>
            <Skeleton className="h-4 w-3/4 mt-1" /> {/* Description skeleton */}
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm p-6">
            <div className="flex flex-col p-3 rounded-md border bg-primary/10">
              <Skeleton className="h-4 w-1/2 mb-1" /> {/* Label skeleton */}
              <Skeleton className="h-7 w-3/4" /> {/* Value skeleton */}
            </div>
            <div className="flex flex-col p-3 rounded-md border">
              <Skeleton className="h-4 w-1/2 mb-1" /> {/* Label skeleton */}
              <Skeleton className="h-7 w-1/4" /> {/* Value skeleton */}
            </div>
          </CardContent>
        </Card>

        {/* Investment Holdings Table Skeleton */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 md:p-6 border-b">
            <CardTitle>My Investment Holdings</CardTitle>
            <Skeleton className="h-4 w-full mt-1" /> {/* Description skeleton */}
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" /> {/* Search/View placeholder */}
              <Skeleton className="h-40 w-full" /> {/* Table content placeholder */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-1/4" /> {/* Selected rows text placeholder */}
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" /> {/* Prev button placeholder */}
                    <Skeleton className="h-8 w-20" /> {/* Next button placeholder */}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Skeleton className="h-4 w-full my-8" /> {/* Separator skeleton */}

        {/* Investment Forecasting Tool Skeleton */}
        <Card className="shadow-md">
          <CardHeader className="p-6">
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" /> {/* Icon skeleton */}
              <Skeleton className="h-5 w-48" /> {/* Title skeleton */}
            </CardTitle>
            <Skeleton className="h-4 w-full mt-1" /> {/* Description skeleton */}
            <Skeleton className="h-4 w-3/4 mt-1" />
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-16 w-full" /> {/* Input field skeleton */}
                    <Skeleton className="h-16 w-full" />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
                <Skeleton className="h-10 w-full md:w-48" /> {/* Button skeleton */}
            </div>
            {/* Placeholder for results if needed */}
            <div className="mt-8">
                <Skeleton className="h-6 w-1/3 mb-3" /> {/* Results title skeleton */}
                <Skeleton className="h-48 w-full border rounded-md" /> {/* Table area skeleton */}
                <Skeleton className="h-32 w-full mt-6" /> {/* Summary card skeleton */}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
