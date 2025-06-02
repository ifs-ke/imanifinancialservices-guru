
// src/app/(dashboard)/investments/InvestmentForecastingTool.tsx
'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as ShadTableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const forecastingFormSchema = z.object({
  monthlyContribution: z.coerce.number().positive({ message: 'Monthly contribution must be positive.' }),
  annualRate: z.coerce.number().min(0, { message: 'Rate cannot be negative.' }).max(100, { message: 'Rate seems too high (0-100).' }),
  compoundingFrequency: z.coerce.number().int().positive({ message: 'Select compounding frequency.' }), // 1, 2, 4, 12
  durationYears: z.coerce.number().int().min(1, { message: 'Duration must be at least 1 year.' }).max(50, { message: 'Max 50 years.' }),
});

type ForecastingFormData = z.infer<typeof forecastingFormSchema>;

interface ProjectionRow {
  year: number;
  startingBalance: number;
  contributionsThisYear: number;
  interestEarnedThisYear: number;
  cumulativeContributions: number;
  cumulativeInterest: number;
  endingBalance: number;
}

interface SummaryData {
  totalContributions: number;
  totalInterest: number;
  finalProjectedValue: number;
}

export default function InvestmentForecastingTool() {
  const [projection, setProjection] = useState<ProjectionRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const form = useForm<ForecastingFormData>({
    resolver: zodResolver(forecastingFormSchema),
    defaultValues: {
      monthlyContribution: 10000,
      annualRate: 5,
      compoundingFrequency: 12, // Monthly
      durationYears: 10,
    },
  });

  const onSubmit = (data: ForecastingFormData) => {
    const { monthlyContribution, annualRate, compoundingFrequency, durationYears } = data;
    const ratePerCompoundingPeriod = (annualRate / 100) / compoundingFrequency;
    const newProjection: ProjectionRow[] = [];

    let currentBalance = 0;
    let overallCumulativeContributions = 0;
    let overallCumulativeInterest = 0;

    for (let year = 1; year <= durationYears; year++) {
      const balanceAtStartOfYear = currentBalance;
      let interestEarnedThisYear = 0;
      const contributionsThisYear = monthlyContribution * 12;

      for (let month = 1; month <= 12; month++) {
        // Add contribution at the START of the month
        currentBalance += monthlyContribution;

        // Check if this month-end is a compounding point
        if (month % (12 / compoundingFrequency) === 0) {
          const interestAccruedThisPeriod = currentBalance * ratePerCompoundingPeriod;
          currentBalance += interestAccruedThisPeriod;
          interestEarnedThisYear += interestAccruedThisPeriod;
        }
      }

      overallCumulativeContributions += contributionsThisYear;
      overallCumulativeInterest += interestEarnedThisYear;

      newProjection.push({
        year,
        startingBalance: balanceAtStartOfYear,
        contributionsThisYear: contributionsThisYear,
        interestEarnedThisYear: interestEarnedThisYear,
        cumulativeContributions: overallCumulativeContributions,
        cumulativeInterest: overallCumulativeInterest,
        endingBalance: currentBalance,
      });
    }

    setProjection(newProjection);
    setSummary({
      totalContributions: overallCumulativeContributions,
      totalInterest: overallCumulativeInterest,
      finalProjectedValue: currentBalance,
    });
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> Investment Growth Forecaster
        </CardTitle>
        <CardDescription>
          Project potential growth from regular monthly contributions with compound interest.
          Suitable for savings plans, or recurring investments where returns are reinvested.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="monthlyContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Contribution (KES)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 10000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="annualRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Interest Rate (%)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="e.g., 5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="compoundingFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compounding Frequency</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={String(field.value)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">Annually</SelectItem>
                        <SelectItem value="2">Semi-Annually</SelectItem>
                        <SelectItem value="4">Quarterly</SelectItem>
                        <SelectItem value="12">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Years)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 10" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full md:w-auto">
              <LineChart className="mr-2 h-4 w-4" /> Calculate Projection
            </Button>
          </form>
        </Form>

        {projection.length > 0 && summary && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">Year-by-Year Projection</h3>
            <ScrollArea className="h-[400px] w-full border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[60px] text-center">Year</TableHead>
                    <TableHead className="text-right">Start Balance</TableHead>
                    <TableHead className="text-right">Contributions (Year)</TableHead>
                    <TableHead className="text-right">Interest (Year)</TableHead>
                    <TableHead className="text-right">Cum. Contributions</TableHead>
                    <TableHead className="text-right">Cum. Interest</TableHead>
                    <TableHead className="text-right">End Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projection.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="text-center font-medium">{row.year}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.startingBalance)}</TableCell>
                      <TableCell className="text-right font-mono text-blue-600 dark:text-blue-400">{formatCurrency(row.contributionsThisYear)}</TableCell>
                      <TableCell className="text-right font-mono text-accent">{formatCurrency(row.interestEarnedThisYear)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.cumulativeContributions)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.cumulativeInterest)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(row.endingBalance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <Card className="mt-6 bg-muted/50">
              <CardHeader><CardTitle className="text-base">Overall Summary</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div className="flex justify-between"><span>Total Contributions:</span> <span className="font-mono font-medium text-blue-600 dark:text-blue-400">{formatCurrency(summary.totalContributions)}</span></div>
                <div className="flex justify-between"><span>Total Interest Earned:</span> <span className="font-mono font-medium text-accent">{formatCurrency(summary.totalInterest)}</span></div>
                <div className="flex justify-between text-base"><strong>Projected Final Value:</strong> <strong className="font-mono">{formatCurrency(summary.finalProjectedValue)}</strong></div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
