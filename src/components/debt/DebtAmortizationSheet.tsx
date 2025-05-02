
// src/components/debt/DebtAmortizationSheet.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DebtItem } from '@/lib/types';

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

// Amortization calculation logic (copied from previous component)
const calculateAmortization = (debt: DebtItem) => {
    const monthlyInterestRate = debt.interestRate / 100 / 12;
    const monthlyPayment = debt.minPayment;
    let balance = debt.principal;
    let paymentNumber = 0;
    const schedule = [];

     if (debt.principal * monthlyInterestRate >= monthlyPayment && monthlyPayment > 0 && monthlyInterestRate > 0) {
       console.warn(`Minimum payment (${formatCurrency(monthlyPayment)}) for "${debt.description}" might not cover the monthly interest (${formatCurrency(debt.principal * monthlyInterestRate)}). The debt may not be paid off.`);
       schedule.push({
            paymentNumber: 1,
            startingBalance: debt.principal,
            payment: monthlyPayment,
            principal: 0,
            interest: debt.principal * monthlyInterestRate,
            endingBalance: debt.principal, // Balance doesn't decrease or might increase
            error: "Payment may not cover interest"
        });
        return schedule; // Return early with a warning entry
     }

    // Handle edge case: 0% interest rate
    if (monthlyInterestRate <= 0 && monthlyPayment > 0) {
        while (balance > 0 && paymentNumber < 720) {
             paymentNumber++;
             const startingBalance = balance;
             const principalPayment = Math.min(monthlyPayment, balance);
             balance -= principalPayment;
             schedule.push({
                paymentNumber,
                startingBalance,
                payment: principalPayment, // Payment is just the principal paid
                principal: principalPayment,
                interest: 0,
                endingBalance: balance,
             });
              if (balance <= 0) break;
        }
        return schedule;
    }

     // Handle edge case: Zero minimum payment (loan never gets paid)
     if (monthlyPayment <= 0 && balance > 0) {
         schedule.push({
            paymentNumber: 1,
            startingBalance: balance,
            payment: 0,
            principal: 0,
            interest: balance * monthlyInterestRate, // Interest accrues
            endingBalance: balance, // Balance remains same or increases if interest > 0
            error: "Zero minimum payment"
        });
        return schedule;
     }


    while (balance > 0.01 && paymentNumber < 720) { // Use a small threshold like 0.01 KES instead of 0
        paymentNumber++;
        const startingBalance = balance;
        const interestPayment = balance * monthlyInterestRate;
        let principalPayment = monthlyPayment - interestPayment;
        let actualPayment = monthlyPayment;

        // Check if payment covers interest
        if (principalPayment <= 0) {
             schedule.push({
                paymentNumber,
                startingBalance,
                payment: actualPayment,
                principal: 0,
                interest: interestPayment,
                endingBalance: startingBalance + interestPayment - actualPayment, // Balance increases
                error: "Payment less than interest"
             });
             console.warn(`Payment ${paymentNumber}: Interest (${formatCurrency(interestPayment)}) exceeds or equals minimum payment (${formatCurrency(monthlyPayment)}) for "${debt.description}". Calculation stopped.`);
             break;
        }

        // Check if this is the last payment
        if (balance - principalPayment <= 0.01) { // Use threshold
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

         // Safety break if balance isn't decreasing significantly (potential issue)
         if (paymentNumber > 1 && schedule[paymentNumber - 1].endingBalance >= schedule[paymentNumber - 2].endingBalance - 0.01 && schedule[paymentNumber-2].endingBalance > 0.01 ) {
             console.warn(`Amortization for "${debt.description}" stopped: Balance not decreasing significantly at payment #${paymentNumber}. Check rate/payment.`);
             schedule.push({
                 paymentNumber: paymentNumber + 1, startingBalance: balance, payment: 0, principal: 0, interest: 0, endingBalance: balance, error: "Balance not decreasing"
             });
             break;
         }
    }

    // Add warning if schedule reaches max iterations
    if (paymentNumber >= 720 && balance > 0.01) {
         console.warn(`Amortization schedule for "${debt.description}" reached maximum iterations (720 payments) with remaining balance ${formatCurrency(balance)}.`);
          schedule.push({
             paymentNumber: paymentNumber + 1, startingBalance: balance, payment: 0, principal: 0, interest: 0, endingBalance: balance, error: "Max iterations reached"
         });
    }

    return schedule;
};

const DebtAmortizationSheet: React.FC<DebtAmortizationSheetProps> = ({ debt, children }) => {
  const schedule = calculateAmortization(debt);

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0"> {/* Adjusted width and removed padding */}
        <SheetHeader className="p-6 border-b"> {/* Added padding and border */}
          <SheetTitle>Amortization Schedule: {debt.description}</SheetTitle>
          <SheetDescription>
            Projected monthly payment schedule based on {formatCurrency(debt.principal)} @ {debt.interestRate.toFixed(2)}% with min. payment of {formatCurrency(debt.minPayment)}.
            {schedule.some(row => row.error) && (
                <span className='block text-destructive text-xs mt-1'>Warning: Issues found in calculation (e.g., payment may not cover interest). See details below.</span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="p-6"> {/* Add padding to the content area */}
            <ScrollArea className="h-[calc(100vh-180px)] w-full"> {/* Adjust height based on header/footer */}
            <Table>
                <TableHeader className="sticky top-0 bg-background z-10"> {/* Make header sticky */}
                <TableRow>
                    <TableHead className="w-[80px]">Month #</TableHead>
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
                    <TableRow key={row.paymentNumber} className={row.error ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "hover:bg-muted/50"}>
                        <TableCell className="text-center">{row.paymentNumber}</TableCell>
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
                        Could not generate amortization schedule. Check if the minimum payment covers the interest or if interest rate is 0%.
                    </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DebtAmortizationSheet;
