// src/app/(dashboard)/dashboard/loading.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { LayoutDashboard } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader
        title="Dashboard"
        description={<Skeleton className="h-4 w-[300px] mt-1" />}
        icon={LayoutDashboard}
      />
      <main className="flex-1 grid gap-6 px-4 md:px-6 lg:px-8">
        <Skeleton className="h-24 w-full" /> {/* Alert placeholder */}
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-20" /></CardTitle>
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            {[...Array(2)].map((_, i) => (
                <Card key={i} className="shadow-sm">
                    <CardHeader className="pb-2 p-4">
                        <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-24" /></CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded-full" />
                            <Skeleton className="h-6 w-1/2" />
                        </div>
                        <Skeleton className="h-3 w-full mt-1" />
                    </CardContent>
                </Card>
            ))}
        </div>
        
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-5 w-48" />
            </CardTitle>
            <Skeleton className="h-3 w-1/2 mt-1" />
          </CardHeader>
          <CardContent className="pl-2 pr-6 pb-6">
            <div className="h-[250px] flex items-center justify-center">
              <Skeleton className="h-full w-full" />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
