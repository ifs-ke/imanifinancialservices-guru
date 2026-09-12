
// src/app/(dashboard)/investments/GovernmentBondProjectionTool.tsx
'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, Landmark } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { GovBondForecastingFormSchema, type GovBondForecastingFormData } from '@/lib/schemas';

interface BondProjectionRow {
  year: number;
  couponsPaidThisYear: number;
  cumulativeCouponsPaid: number;
  principalRepaidThisYear: number;
}

interface BondProjectionSummary {
  totalFaceValue: number;
  totalCouponsPaid: number;
  totalValueRealized: number;
  simpleAnnualYield: number;
  totalReturnPercentage: number;
}

export default function GovernmentBondProjectionTool() {
  const [projection, setProjection] = useState<BondProjectionRow[]>([]);
  const [summary, setSummary] = useState<BondProjectionSummary | null>(null);

  const form = useForm<GovBondForecastingFormData>({
    resolver: zodResolver(GovBondForecastingFormSchema),
    defaultValues: {
      faceValue: 100000,
      couponRate: 10,
      yearsToMaturity: 5,
      couponPaymentFrequency: 'semi-annually',
    },
  });

  const onSubmit = (data: GovBondForecastingFormData) => {
    const { faceValue, couponRate, yearsToMaturity, couponPaymentFrequency } = data;

    const annualCouponPayment = faceValue * (couponRate / 100);
    const paymentsPerYear = couponPaymentFrequency === 'annually' ? 1 : 2;
    const couponPaymentPerPeriod = annualCouponPayment / paymentsPerYear;

    const newProjection: BondProjectionRow[] = [];
    let cumulativeCoupons = 0;

    for (let year = 1; year <= yearsToMaturity; year++) {
      const couponsThisYear = annualCouponPayment;
      cumulativeCoupons += couponsThisYear;
      const principalRepaidThisYear = (year === yearsToMaturity) ? faceValue : 0;

      newProjection.push({
        year,
        couponsPaidThisYear: couponsThisYear,
        cumulativeCouponsPaid: cumulativeCoupons,
        principalRepaidThisYear: principalRepaidThisYear,
      });
    }

    const totalValueRealized = faceValue + cumulativeCoupons;
    const totalReturnPercentage = cumulativeCoupons > 0 && faceValue > 0 ? (cumulativeCoupons / faceValue) * 100 : 0;


    setProjection(newProjection);
    setSummary({
      totalFaceValue: faceValue,
      totalCouponsPaid: cumulativeCoupons,
      totalValueRealized: totalValueRealized,
      simpleAnnualYield: faceValue > 0 ? (annualCouponPayment / faceValue) * 100 : 0,
      totalReturnPercentage: totalReturnPercentage,
    });
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" data-ai-hint="government building" /> Government Bond Projection
        </CardTitle>
        <CardDescription>
          Project potential returns from a government bond based on its face value, coupon rate, and maturity.
          This tool calculates simple interest payments and principal repayment at maturity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="faceValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Face Value (KES)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 100000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="couponRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Coupon Rate (%)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="e.g., 12.5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="yearsToMaturity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years to Maturity</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="couponPaymentFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coupon Payment Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="annually">Annually</SelectItem>
                        <SelectItem value="semi-annually">Semi-Annually</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full md:w-auto">
              <TrendingUp className="mr-2 h-4 w-4" /> Calculate Bond Projection
            </Button>
          </form>
        </Form>

        {projection.length > 0 && summary && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">Year-by-Year Projection</h3>
            <ScrollArea className="h-[300px] w-full border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[60px] text-center">Year</TableHead>
                    <TableHead className="text-right">Coupons Paid (Year)</TableHead>
                    <TableHead className="text-right">Cumulative Coupons</TableHead>
                    <TableHead className="text-right">Principal Repaid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projection.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="text-center font-medium">{row.year}</TableCell>
                      <TableCell className="text-right font-mono text-accent">{formatCurrency(row.couponsPaidThisYear)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.cumulativeCouponsPaid)}</TableCell>
                      <TableCell className="text-right font-mono text-primary">{row.principalRepaidThisYear > 0 ? formatCurrency(row.principalRepaidThisYear) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <Card className="mt-6 bg-muted/50">
              <CardHeader><CardTitle className="text-base">Overall Bond Summary</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div className="flex justify-between"><span>Face Value (Principal Invested):</span> <span className="font-mono font-medium">{formatCurrency(summary.totalFaceValue)}</span></div>
                <div className="flex justify-between"><span>Total Coupon Payments Received:</span> <span className="font-mono font-medium text-accent">{formatCurrency(summary.totalCouponsPaid)}</span></div>
                <div className="flex justify-between"><span>Principal Repayment at Maturity:</span> <span className="font-mono font-medium text-primary">{formatCurrency(summary.totalFaceValue)}</span></div>
                <div className="flex justify-between text-base mt-2 pt-2 border-t"><strong>Total Value Realized at Maturity:</strong> <strong className="font-mono">{formatCurrency(summary.totalValueRealized)}</strong></div>
                <div className="flex justify-between text-xs"><span>Simple Annual Yield:</span> <span className="font-mono">{summary.simpleAnnualYield.toFixed(2)}%</span></div>
                <div className="flex justify-between text-xs"><span>Total Return on Investment (Over Term):</span> <span className="font-mono text-green-600 dark:text-green-400">{summary.totalReturnPercentage.toFixed(2)}%</span></div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
