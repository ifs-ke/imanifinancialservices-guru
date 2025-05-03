
// src/components/debt/DebtAmortizationSheet.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DebtItem } from '@/lib/types';
import { cn } from '@/lib/utils'; // Import cn utility

interface DebtAmortizationSheetProps {
  debt: DebtItem;
  children: React.ReactNode; // Trigger element
}

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Amortization calculation logic
const calculateAmortization = (debt: DebtItem) => {
    const monthlyInterestRate = debt.interestRate / 100 / 12;
    const monthlyPayment = debt.minPayment;
    let balance = debt.principal;
    let paymentNumber = 0;
    const schedule = [];
    const threshold = 0.01; // Threshold for zero balance check

     if (balance <= 0) return schedule; // No schedule needed if balance is already zero or negative

     if (monthlyPayment <= 0 && monthlyInterestRate > 0 && balance > 0) {
        schedule.push({ paymentNumber: 1, startingBalance: balance, payment: 0, principal: 0, interest: balance * monthlyInterestRate, endingBalance: balance, error: "Zero minimum payment, balance increases" });
        return schedule;
     }
     if (monthlyPayment <= 0 && monthlyInterestRate <= 0 && balance > 0) {
         schedule.push({ paymentNumber: 1, startingBalance: balance, payment: 0, principal: 0, interest: 0, endingBalance: balance, error: "Zero minimum payment, zero interest" });
         return schedule;
     }


    while (balance > threshold && paymentNumber < 720) { // Use threshold
        paymentNumber++;
        const startingBalance = balance;
        const interestPayment = balance * monthlyInterestRate;
        let principalPayment = monthlyPayment - interestPayment;
        let actualPayment = monthlyPayment;

        // Check if payment covers interest (only if interest rate is positive)
        if (principalPayment <= 0 && monthlyInterestRate > 0) {
             schedule.push({
                paymentNumber,
                startingBalance,
                payment: actualPayment,
                principal: 0,
                interest: interestPayment,
                endingBalance: startingBalance, // Balance stops decreasing
                error: "Payment <= Interest"
             });
             console.warn(`Amortization for "${debt.description}" stopped: Payment ${formatCurrency(actualPayment)} <= Interest ${formatCurrency(interestPayment)} at payment #${paymentNumber}.`);
             break;
        }

        // Handle last payment correctly
        if (balance - principalPayment <= threshold) {
          actualPayment = balance + interestPayment;
          principalPayment = balance;
          balance = 0;
        } else {
          balance -= principalPayment;
        }

        schedule.push({
            paymentNumber,
            startingBalance: startingBalance,
            payment: actualPayment,
            principal: principalPayment,
            interest: interestPayment,
            endingBalance: balance,
        });

         // Safety break removed as the primary checks should handle termination
    }

    // Add warning if schedule reaches max iterations with remaining balance
    if (paymentNumber >= 720 && balance > threshold) {
         console.warn(`Amortization schedule for "${debt.description}" reached maximum iterations (720 payments) with remaining balance ${formatCurrency(balance)}.`);
          schedule.push({
             paymentNumber: paymentNumber + 1, startingBalance: balance, payment: 0, principal: 0, interest: 0, endingBalance: balance, error: "Max Iterations Reached"
         });
    }

    return schedule;
};

const DebtAmortizationSheet: React.FC<DebtAmortizationSheetProps> = ({ debt, children }) => {
  const schedule = calculateAmortization(debt);

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      {/* Increased max-width for better table visibility */}
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl p-0">
        <SheetHeader className="p-6 border-b bg-background z-20 sticky top-0"> {/* Make header sticky */}
          <SheetTitle>Amortization: {debt.description}</SheetTitle>
          <SheetDescription>
            Based on {formatCurrency(debt.principal)} @ {debt.interestRate.toFixed(2)}% with min. payment of {formatCurrency(debt.minPayment)}.
            {schedule.some(row => row.error) && (
                <span className='block text-destructive text-xs mt-1'>Warning: Issues found in calculation ({schedule.find(r=>r.error)?.error}).</span>
            )}
          </SheetDescription>
        </SheetHeader>
        {/* Removed intermediate div, apply padding directly to ScrollArea parent if needed */}
        <ScrollArea className="h-[calc(100vh-140px)] w-full"> {/* Adjusted height considering sticky header */}
            <Table>
                {/* Make TableHeader sticky */}
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                    <TableHead className="w-[80px] text-center">Month</TableHead> {/* Centered */}
                    <TableHead className="text-right">Start Balance</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">End Balance</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {schedule.length > 0 ? (
                    schedule.map((row) => (
                    <TableRow key={row.paymentNumber} className={cn(row.error && "bg-destructive/10 text-destructive hover:bg-destructive/20")}>
                        <TableCell className="text-center font-medium">{row.paymentNumber}</TableCell> {/* Centered */}
                        <TableCell className="text-right font-mono">{formatCurrency(row.startingBalance)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.payment)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.principal)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(row.interest)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(row.endingBalance)}</TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Could not generate amortization schedule. Check input values.
                    </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default DebtAmortizationSheet;

    