import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// Mock data for demonstration
const mockData = {
  netWorth: 50000,
  cashFlow: 1500,
  totalDebt: 25000,
};

export default function DashboardPage() {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD', // Adjust currency as needed
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 bg-background">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Your financial overview and progress.
        </p>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Financial Metrics Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(mockData.netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">
              Assets minus liabilities
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow</CardTitle>
            {mockData.cashFlow >= 0 ? (
              <TrendingUp className="h-4 w-4 text-accent" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                mockData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'
              }`}
            >
              {formatCurrency(mockData.cashFlow)}
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly income vs expenses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
            {/* Placeholder for debt icon */}
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10H3"/><path d="M21 14H3"/><path d="M12 18V6"/><path d="M12 6L9 9"/><path d="M12 6L15 9"/></svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(mockData.totalDebt)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total outstanding liabilities
            </p>
          </CardContent>
        </Card>

        {/* Action/Navigation Cards */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle>Manage Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200"
              alt="Transactions illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="finance transaction"
            />
            <p className="text-sm text-muted-foreground">
              Import, categorize, and manually add your financial transactions.
            </p>
            <Button asChild variant="outline" className="mt-auto">
              <Link href="/transactions">
                Go to Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Debt Analysis & Strategy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200"
              alt="Debt analysis illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="finance chart graph"
            />
            <p className="text-sm text-muted-foreground">
              Get AI-powered insights and a personalized debt repayment plan.
            </p>
            <Button asChild variant="default" className="mt-auto bg-primary hover:bg-primary/90">
              <Link href="/analysis">
                Analyze Debt <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>View Statements</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Image
              src="https://picsum.photos/400/200"
              alt="Financial statements illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="documents report"
            />
            <p className="text-sm text-muted-foreground">
              Check your cash flow and net worth statements.
            </p>
            <Button asChild variant="secondary" className="mt-auto">
              <Link href="/statements">
                View Statements <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
