
// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2, MinusCircle, LineChart as LineChartIcon, CalendarClock, Target, CheckCircle, AlertTriangle } from 'lucide-react'; // Added Target, CheckCircle, AlertTriangle
import Link from 'next/link';
import Image from 'next/image';
import { useTransactionsStore } from '@/store/transactionsStore'; // Import transactions store
import { useDebtStore } from '@/store/debtStore'; // Import debt store
import { useStatementStore } from '@/store/statementStore'; // Import statement store
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted } from '@/store/budgetStore'; // Import budget store hook and selectors
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts'; // Changed to LineChart, Line
import { format } from 'date-fns'; // Import date-fns format
import { cn } from '@/lib/utils'; // Import cn utility


// Calculation Functions (consider moving to utils)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0); // Corrected from item.principal

// Formatting Functions
const formatCurrency = (amount: number | undefined) => {
   if (amount === undefined || isNaN(amount)) return 'N/A'; // Added NaN check
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date to 'MMM yyyy'
const formatMonthYear = (date: Date) => format(date, 'MMM yyyy');

export default function DashboardPage() {
  // Use Zustand store hooks directly
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  // Use budget store selectors
  const totalBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const netBudgetedMonthly = useBudgetStore(selectNetBudgeted); // Renamed for clarity in this context


  // Calculate financial metrics based on context data
  const financialData = useMemo(() => {
    const totalAssets = calculateTotal(assetItems);
    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateOtherLiabilityTotal(otherLiabilityItems);
    const netWorth = totalAssets - (totalDebt + totalOtherLiabilities);

    // Calculate cash flow for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        return txDate instanceof Date && !isNaN(txDate.getTime()) && txDate >= thirtyDaysAgo;
    });
    const totalIncomeRecent = calculateTotal(recentTransactions.filter(tx => tx.amount > 0));
    const totalExpensesRecent = Math.abs(calculateTotal(recentTransactions.filter(tx => tx.amount < 0)));
    const netActualRecent = totalIncomeRecent - totalExpensesRecent; // Actual net for last 30 days

    // Budget Variance Calculation (comparing 30-day actual net vs monthly budgeted net)
    const budgetVariance = netActualRecent - netBudgetedMonthly;

    return {
      netWorth,
      cashFlow: netActualRecent, // Use calculated net actual
      totalDebt,
      totalAssets,
      totalIncomeRecent,
      totalExpensesRecent,
      totalOtherLiabilities,
      budgetVariance, // Add variance to the data object
    };
  }, [transactions, debts, assetItems, otherLiabilityItems, netBudgetedMonthly]);

  // State for formatted currency values to avoid hydration issues
  const [formattedNetWorth, setFormattedNetWorth] = useState<string>('N/A');
  const [formattedTotalAssets, setFormattedTotalAssets] = useState<string>('N/A');
  const [formattedTotalLiabilities, setFormattedTotalLiabilities] = useState<string>('N/A');
  const [formattedCashFlow, setFormattedCashFlow] = useState<string>('N/A');
  const [formattedTotalIncomeRecent, setFormattedTotalIncomeRecent] = useState<string>('N/A');
  const [formattedTotalExpensesRecent, setFormattedTotalExpensesRecent] = useState<string>('N/A');
  const [formattedOtherLiabilities, setFormattedOtherLiabilities] = useState<string>('N/A'); // Added state for other liabilities formatting
  const [budgetStatus, setBudgetStatus] = useState<string>('N/A'); // State for budget status
  const [formattedBudgetVariance, setFormattedBudgetVariance] = useState<string>('N/A'); // State for formatted variance

  useEffect(() => {
    // Format the values here to avoid server/client differences
    setFormattedNetWorth(formatCurrency(financialData.netWorth));
    setFormattedTotalAssets(formatCurrency(financialData.totalAssets));
    setFormattedTotalLiabilities(formatCurrency(financialData.totalDebt + financialData.totalOtherLiabilities));
    setFormattedCashFlow(formatCurrency(financialData.cashFlow));
    setFormattedTotalIncomeRecent(formatCurrency(financialData.totalIncomeRecent));
    setFormattedTotalExpensesRecent(formatCurrency(financialData.totalExpensesRecent));
    setFormattedOtherLiabilities(formatCurrency(financialData.totalOtherLiabilities)); // Format other liabilities

    // Determine budget status and format variance
     if (financialData.budgetVariance >= 0) {
         setBudgetStatus("On Track");
     } else {
         setBudgetStatus("Off Track");
     }
    setFormattedBudgetVariance(formatCurrency(financialData.budgetVariance));

  }, [financialData]);

  // --- Debt Payoff Timeline Calculation ---
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>("N/A");

    useEffect(() => {
        // Calculate debt payoff timeline on debt or budgeted income change
        if (debts.length > 0 && totalBudgetedIncome > 0) {
            const totalDebtAmount = debts.reduce((sum, debt) => sum + debt.principal, 0);
             // Rough estimate: available income after *all* budgeted expenses (recurring + one-time + goals)
             const totalBudgetedOutflows = totalRecurringExpenses + totalOneTimeExpenses + totalGoals;
             const availableForDebt = totalBudgetedIncome - totalBudgetedOutflows;

            if (availableForDebt <= 0) {
                setDebtPayoffTimeline("Cannot estimate: Budgeted income does not exceed outflows.");
            } else {
                 // More realistic estimate: Sum of minimum payments + available surplus
                 const totalMinPayments = debts.reduce((sum, debt) => sum + debt.minPayment, 0);
                 const actualPaymentTowardsDebt = Math.max(totalMinPayments, availableForDebt); // Pay at least minimums, or more if surplus allows


                 // This is still a very rough estimate, ideally use amortization logic
                 if (actualPaymentTowardsDebt <= 0) {
                     setDebtPayoffTimeline("Cannot estimate: No funds available for debt.");
                 } else {
                    const monthsToPayoff = totalDebtAmount / actualPaymentTowardsDebt;
                    const years = Math.floor(monthsToPayoff / 12);
                    const remainingMonths = Math.ceil(monthsToPayoff % 12);
                    setDebtPayoffTimeline(`${years} years and ${remainingMonths} months (estimated)`);
                 }
            }
        } else if (debts.length === 0) {
           setDebtPayoffTimeline("Debt Free!"); // Show positive message if no debt
        }
        else {
            setDebtPayoffTimeline("N/A"); // Reset if no debts or income
        }
    }, [debts, totalBudgetedIncome, totalRecurringExpenses, totalOneTimeExpenses, totalGoals]);


  // --- Chart Data and Config ---

  // 1. Income vs Expense Chart (Bar Chart - Last 30 days)
  const cashFlowChartData = useMemo(() => [
    { name: 'Income', value: financialData.totalIncomeRecent, fill: "hsl(var(--chart-2))" },
    { name: 'Expenses', value: financialData.totalExpensesRecent, fill: "hsl(var(--destructive))" },
  ], [financialData.totalIncomeRecent, financialData.totalExpensesRecent]);

  const cashFlowChartConfig = {
    value: { label: 'Amount (KES)' },
    Income: { label: 'Income', color: "hsl(var(--chart-2))" },
    Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" },
  } satisfies ChartConfig;

  // 2. Asset Allocation Chart (Pie Chart)
   const assetChartData = useMemo(() =>
    assetItems
      .filter(item => item.amount > 0) // Only include positive assets
      .map((item, index) => ({
        name: item.description,
        value: item.amount,
        fill: `hsl(var(--chart-${(index % 5) + 1}))` // Cycle through chart colors
    })), [assetItems]);

   const assetChartConfig = useMemo(() => {
       const config: ChartConfig = {};
       assetChartData.forEach((item) => {
           config[item.name] = {
               label: item.name,
               color: item.fill // Use the same fill color assigned earlier
           };
       });
       // Add a key for the value itself for the tooltip
       config.value = { label: 'Amount (KES)' };
       return config;
   }, [assetChartData]);

   // 3. Income/Expense Trend Chart (Line Chart - All Time)
   const trendChartData = useMemo(() => {
        const monthlyData: { [key: string]: { month: string; income: number; expense: number } } = {};

        // Sort transactions oldest to newest for chronological plotting
        const sortedTransactions = [...transactions].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0; // Handle invalid dates
            return dateA.getTime() - dateB.getTime();
        });

        sortedTransactions.forEach(tx => {
            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
            if (isNaN(txDate.getTime())) return; // Skip invalid dates

            const monthKey = format(txDate, 'yyyy-MM'); // Group by year and month
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { month: format(txDate, 'MMM yyyy'), income: 0, expense: 0 };
            }

            if (tx.amount > 0) {
                monthlyData[monthKey].income += tx.amount;
            } else if (tx.amount < 0) {
                monthlyData[monthKey].expense += Math.abs(tx.amount); // Store expense as positive value for plotting
            }
        });

        // Convert to array and sort chronologically
        return Object.values(monthlyData).sort((a, b) => {
            const dateA = new Date(a.month.replace(' ', ' 1, ')); // Convert 'MMM yyyy' back to Date for sorting
            const dateB = new Date(b.month.replace(' ', ' 1, '));
            return dateA.getTime() - dateB.getTime();
        });
    }, [transactions]);

   const trendChartConfig = {
        income: { label: "Income", color: "hsl(var(--chart-2))" },
        expense: { label: "Expenses", color: "hsl(var(--destructive))" },
        month: { label: "Month" },
    } satisfies ChartConfig;


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

      {/* Updated grid layout for better responsiveness and new charts */}
      <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

        {/* Financial Metrics Cards - Span 1 col each */}
        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formattedNetWorth}
            </div>
            <p className="text-xs text-muted-foreground">
               Assets ({formattedTotalAssets}) - Liabilities ({formattedTotalLiabilities})
            </p>
             {/* Link to Statements */}
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/statements">
                    View Statement <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow (Last 30d)</CardTitle>
            {financialData.cashFlow >= 0 ? (
              <TrendingUp className="h-4 w-4 text-accent" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                financialData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'
              }`}
            >
              {formattedCashFlow}
            </div>
            <p className="text-xs text-muted-foreground">
              Income ({formattedTotalIncomeRecent}) - Expenses ({formattedTotalExpensesRecent})
            </p>
             {/* Link to Statements */}
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/statements">
                    View Statement <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
             <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {formatCurrency(financialData.totalDebt)} {/* Display only debt here */}
            </div>
             <p className="text-xs text-muted-foreground">
                Excludes other liabilities
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/debt">
                    Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
             </Button>
          </CardContent>
        </Card>
         <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Other Liabilities</CardTitle>
            <MinusCircle className="h-4 w-4 text-muted-foreground" /> {/* Example Icon */}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {formattedOtherLiabilities} {/* Display other liabilities */}
            </div>
             <p className="text-xs text-muted-foreground">
                Items from Statements
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/statements">
                    Manage Statements <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
             </Button>
          </CardContent>
        </Card>

         {/* Debt Payoff Timeline Card */}
        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Debt Payoff Timeline</CardTitle>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-lg font-bold"> {/* Slightly smaller font */}
                    {debtPayoffTimeline}
                </div>
                <p className="text-xs text-muted-foreground">
                    Based on current debt & budgeted outflows.
                </p>
                 <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                    <Link href="/debt">
                        Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                 </Button>
            </CardContent>
        </Card>

         {/* Budget Variance Card */}
         <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Budget Variance (30d)</CardTitle>
                  {financialData.budgetVariance >= 0 ? (
                     <CheckCircle className="h-4 w-4 text-accent" />
                 ) : (
                     <AlertTriangle className="h-4 w-4 text-destructive" />
                 )}
             </CardHeader>
             <CardContent>
                 <div className={cn(
                    "text-lg font-bold",
                    financialData.budgetVariance >= 0 ? 'text-accent' : 'text-destructive'
                 )}>
                     {budgetStatus}
                 </div>
                 <p className="text-xs text-muted-foreground">
                     {formattedBudgetVariance} {financialData.budgetVariance >= 0 ? 'Surplus' : 'Shortfall'} vs Budgeted Net
                 </p>
                 <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                     <Link href="/statements">
                         View Variance Report <ArrowRight className="ml-1 h-3 w-3" />
                     </Link>
                 </Button>
             </CardContent>
         </Card>


        {/* Chart Cards - Span full width on md, adjust for lg/xl */}
        <Card className="md:col-span-2 lg:col-span-3 xl:col-span-4">
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                <LineChartIcon className="h-4 w-4"/> Income/Expense Trend (All Time)
             </CardTitle>
             <CardDescription>Monthly income vs. expenses over time.</CardDescription>
           </CardHeader>
           <CardContent>
                {trendChartData.length > 1 ? ( // Need at least 2 points for a line chart
                    <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
                        {/* Changed to LineChart */}
                        <LineChart
                            accessibilityLayer
                            data={trendChartData}
                            margin={{ left: -20, right: 10, top: 10, bottom: 0 }}
                        >
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tickFormatter={(value) => value.slice(0, 3)} // Show only month abbreviation
                                // Optionally adjust number of ticks for smaller screens
                                // interval="preserveStartEnd" // Show start and end, adjust middle
                                // minTickGap={20} // Minimum gap between ticks
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tickFormatter={(value) => `KES ${value / 1000}k`} // Format as thousands
                            />
                            <ChartTooltip
                                cursor={true} // Show cursor for LineChart
                                content={<ChartTooltipContent indicator="line" />} // Use line indicator
                             />
                             {/* Removed defs for gradients */}
                             <Line
                                dataKey="income"
                                type="monotone"
                                stroke="hsl(var(--chart-2))"
                                strokeWidth={2}
                                dot={false} // Optionally hide dots for cleaner look
                             />
                             <Line
                                dataKey="expense"
                                type="monotone"
                                stroke="hsl(var(--destructive))"
                                strokeWidth={2}
                                dot={false} // Optionally hide dots for cleaner look
                             />
                        </LineChart>
                    </ChartContainer>
                 ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                        Not enough data for trend analysis (need transactions spanning at least two months).
                    </div>
                 )}
            </CardContent>
         </Card>

         {/* Existing Chart Cards */}
         <Card className="md:col-span-1 lg:col-span-1 xl:col-span-2"> {/* Adjust span */}
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="h-4 w-4" /> Cash Flow (Last 30d)
             </CardTitle>
             <CardDescription>Income vs. Expenses</CardDescription>
           </CardHeader>
           <CardContent>
              {financialData.totalIncomeRecent > 0 || financialData.totalExpensesRecent > 0 ? (
                 <ChartContainer config={cashFlowChartConfig} className="h-[200px] w-full">
                   <BarChart accessibilityLayer data={cashFlowChartData} layout="vertical" margin={{left: 0, right: 10, top: 0, bottom: 0}}>
                      <XAxis type="number" hide />
                      <YAxis
                       dataKey="name"
                       type="category"
                       tickLine={false}
                       axisLine={false}
                       tickMargin={10}
                       tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      />
                     <ChartTooltip
                       cursor={false}
                       content={<ChartTooltipContent hideLabel />}
                     />
                     <Bar dataKey="value" radius={5} />
                   </BarChart>
                 </ChartContainer>
              ) : (
                 <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                     No income or expense data for the last 30 days.
                 </div>
              )}
           </CardContent>
         </Card>

         <Card className="md:col-span-1 lg:col-span-2 xl:col-span-2"> {/* Adjust span */}
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                 <PieChart className="h-4 w-4"/> Asset Allocation
             </CardTitle>
             <CardDescription>Distribution of your assets</CardDescription>
           </CardHeader>
           <CardContent className="flex items-center justify-center">
              {assetChartData.length > 0 ? (
                  <ChartContainer config={assetChartConfig} className="h-[200px] w-full max-w-[300px]">
                     <ResponsiveContainer width="100%" height={200}>
                         <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                          <Pie
                             data={assetChartData}
                             dataKey="value"
                             nameKey="name"
                             cx="50%"
                             cy="50%"
                             outerRadius={70}
                             innerRadius={50}
                             labelLine={false}
                             paddingAngle={2}
                          >
                               {assetChartData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.fill} />
                             ))}
                          </Pie>
                         </PieChart>
                     </ResponsiveContainer>
                 </ChartContainer>
              ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                     No positive asset data available. Add assets in Statements.
                 </div>
              )}
           </CardContent>
         </Card>


        {/* Action/Navigation Cards - Adjust spans */}
        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Manage Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow">
             <Image
              src="https://picsum.photos/400/200"
              alt="Ledger book with coins and pen"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="money ledger coins pen" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Import, categorize, and manage your financial transactions.
            </p>
          </CardContent>
           <CardFooter>
             <Button asChild variant="outline" className="w-full">
              <Link href="/transactions">
                Go to Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>View Income/Expenses</CardTitle>
          </CardHeader>
           <CardContent className="flex-grow">
             <Image
              src="https://picsum.photos/400/200"
              alt="Graph showing upward and downward financial trends"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="finance chart graph money trend" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Analyze your income and expense patterns.
            </p>
          </CardContent>
           <CardFooter className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="secondary" className="flex-1">
                <Link href="/income">
                    Income <TrendingUp className="ml-2 h-4 w-4" />
                </Link>
                </Button>
                 <Button asChild variant="secondary" className="flex-1">
                <Link href="/expenses">
                    Expenses <TrendingDown className="ml-2 h-4 w-4" />
                </Link>
                </Button>
             </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Manage Debts</CardTitle> {/* Changed Title */}
          </CardHeader>
          <CardContent className="flex-grow">
            <Image
              src="https://picsum.photos/400/200"
              alt="Stack of coins next to a calculator"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="coins calculator finance debt money" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Track and manage your outstanding debts. {/* Changed description */}
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/debt"> {/* Changed Link */}
                Manage Debts <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>View Statements</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow">
            <Image
              src="https://picsum.photos/400/200"
              alt="Formal financial statement document with pen"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="documents report sheet balance statement pen" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Check your cash flow and net worth statements.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/statements">
                View Statements <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

