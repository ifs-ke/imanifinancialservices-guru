// src/components/debt/DebtAmortizationSchedule.tsx
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DebtItem } from '@/lib/types';

interface DebtAmortizationScheduleProps {
  debt: DebtItem;
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

     // Basic validation: If minPayment doesn't cover initial interest, the loan might never be paid off.
     if (debt.principal * monthlyInterestRate >= monthlyPayment && monthlyPayment > 0) {
       console.warn(`Minimum payment (${formatCurrency(monthlyPayment)}) for "${debt.description}" might not cover the monthly interest (${formatCurrency(debt.principal * monthlyInterestRate)}). The debt may not be paid off.`);
       // Optionally return an empty schedule or a message instead of potentially infinite loop
       // return [];
     }


    while (balance > 0 && paymentNumber < 720) { // Increased limit to 60 years, but add a check for non-decreasing balance
        paymentNumber++;
        const startingBalance = balance; // Store balance at the start of the period
        const interestPayment = balance * monthlyInterestRate;
        let principalPayment = monthlyPayment - interestPayment;
        let actualPayment = monthlyPayment;

        // If principal payment is negative (interest > payment), the balance will increase.
        // This can happen if minPayment is too low. Handle this to prevent infinite loops.
         if (principalPayment <= 0 && monthlyPayment > 0) {
           console.warn(`Payment ${paymentNumber}: Interest (${formatCurrency(interestPayment)}) exceeds or equals minimum payment (${formatCurrency(monthlyPayment)}) for "${debt.description}". Balance is increasing.`);
           // Stop calculation if balance starts increasing indefinitely due to low payment
           schedule.push({
                paymentNumber,
                startingBalance,
                payment: actualPayment,
                principal: 0, // Principal payment is effectively zero or negative
                interest: interestPayment,
                endingBalance: startingBalance + interestPayment - actualPayment, // Balance increases
                error: "Payment less than interest"
            });
           break; // Exit loop
         }


        // Check if this is the last payment
        if (balance - principalPayment <= 0) {
          actualPayment = balance + interestPayment; // Final payment amount
          principalPayment = balance; // Pay off remaining balance
          balance = 0;
        } else {
          balance -= principalPayment; // Reduce balance by principal paid
        }


        schedule.push({
            paymentNumber,
            startingBalance: startingBalance, // Use stored starting balance
            payment: actualPayment,
            principal: principalPayment,
            interest: interestPayment,
            endingBalance: balance,
        });

        if (balance <= 0) break; // Ensure loop terminates if balance reaches zero

        // Safety break if balance isn't decreasing significantly (potential issue)
         if (paymentNumber > 1 && schedule[paymentNumber - 1].endingBalance >= schedule[paymentNumber - 2].endingBalance - 0.01) {
             console.warn(`Amortization for "${debt.description}" stopped: Balance not decreasing significantly. Check interest rate and minimum payment.`);
              // Add a final row indicating the issue
             schedule.push({
                 paymentNumber: paymentNumber + 1,
                 startingBalance: balance,
                 payment: 0,
                 principal: 0,
                 interest: 0,
                 endingBalance: balance,
                 error: "Balance not decreasing"
             });
             break;
         }
    }

    // Add warning if schedule reaches max iterations
    if (paymentNumber >= 720) {
         console.warn(`Amortization schedule for "${debt.description}" reached maximum iterations (720 payments).`);
          schedule.push({
             paymentNumber: paymentNumber + 1,
             startingBalance: balance,
             payment: 0, principal: 0, interest: 0,
             endingBalance: balance,
             error: "Max iterations reached"
         });
    }


    return schedule;
};

const DebtAmortizationSchedule: React.FC<DebtAmortizationScheduleProps> = ({ debt }) => {
  const schedule = calculateAmortization(debt);

  return (
    <Card className="mt-6"> {/* Added margin top for spacing */}
      <CardHeader>
        <CardTitle>Amortization Schedule: {debt.description}</CardTitle>
        <CardDescription>
          Projected payment schedule based on current principal, interest rate, and minimum payment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Payment #</TableHead>
                <TableHead className="text-right">Starting Balance</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Ending Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.length > 0 ? (
                schedule.map((row) => (
                  <TableRow key={row.paymentNumber} className={row.error ? "bg-destructive/10 text-destructive" : ""}>
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
                    Could not generate amortization schedule. Check if the minimum payment covers the interest.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default DebtAmortizationSchedule;
