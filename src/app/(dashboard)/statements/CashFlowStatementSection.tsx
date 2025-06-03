
// src/app/(dashboard)/statements/CashFlowStatementSection.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import type { TransactionWithId } from '@/lib/types';
import { isValid as isDateValid } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';


interface CashFlowStatementSectionProps {
  startDate?: Date;
  endDate?: Date;
}

const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
};

const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; itemCount: number; icon?: React.ElementType; className?: string }
>(({ label, sum, itemCount, icon: Icon, className, children, ...props }, ref) => (
    <AccordionTrigger ref={ref} {...props} className={cn('hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0', className)}>
      <div className="flex justify-between items-center w-full">
          <span className="flex items-center gap-2 text-base font-semibold">
            {Icon && <Icon className="h-4 w-4" />} {label}
          </span>
          <div className="flex items-center gap-2">
            {itemCount > 0 && <span className="text-xs text-muted-foreground">({itemCount} items)</span>}
            <span className="font-semibold font-mono text-base">{formatCurrency(sum)}</span>
          </div>
      </div>
    </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";

const CashFlowStatementSection: React.FC<CashFlowStatementSectionProps> = ({ startDate, endDate }) => {
  const transactions = useTransactionsStore(state => state.transactions);

  const filteredTransactions = useMemo(() => {
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) {
      return []; // Return empty if dates are invalid or not set, to avoid processing all transactions
    }
    const start = startDate.getTime();
    const end = new Date(endDate).setHours(23, 59, 59, 999);

    return transactions.filter(tx => {
        const txDate = tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date);
        if (!isDateValid(txDate)) return false;
        const txTime = txDate.getTime();
        return txTime >= start && txTime <= end;
    });
  }, [transactions, startDate, endDate]);

  const derivedIncomeItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount > 0)
      .map(tx => ({ ...tx, date: tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date) }))
      .sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)),
    [filteredTransactions]
  );

  const derivedExpenseItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount < 0)
      .map(tx => ({ ...tx, amount: Math.abs(tx.amount), date: tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date) }))
      .sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)),
    [filteredTransactions]
  );

  const totalActualIncome = useMemo(() => derivedIncomeItems.reduce((sum, item) => sum + item.amount, 0), [derivedIncomeItems]);
  const totalActualExpenses = useMemo(() => derivedExpenseItems.reduce((sum, item) => sum + item.amount, 0), [derivedExpenseItems]);
  const cashFlow = totalActualIncome - totalActualExpenses;

  const renderDerivedItemRow = (item: TransactionWithId, type: 'income' | 'expense') => (
       <TableRow key={item.id} className="text-sm">
         <TableCell className="pl-2 py-1.5 max-w-[200px] truncate" title={item.description}>{item.description}{formatCategoryBadge(item.frequency)}{formatCategoryBadge(item.variability)}</TableCell>
         <TableCell className="text-right font-mono py-1.5">{formatCurrency(type === 'income' ? item.amount : Math.abs(item.amount))}</TableCell>
       </TableRow>
   );

  return (
    <Card className="lg:col-span-1 shadow-md flex flex-col">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center gap-2">
            {cashFlow >= 0 ? <TrendingUp className="text-accent h-5 w-5" /> : <TrendingDown className="text-destructive h-5 w-5" />}
            Cash Flow Statement
        </CardTitle>
        <CardDescription className="flex items-center gap-1 text-xs pt-1">
            <Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range.
        </CardDescription>
      </CardHeader>
       <CardContent className="p-6 pt-0 flex-grow">
         <Accordion type="multiple" className="w-full" defaultValue={[]}>
            <AccordionItem value="income-accordion" className="border-b-0 mb-2 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                <AccordionTriggerWithSum label="Income" sum={totalActualIncome} itemCount={derivedIncomeItems.length} icon={TrendingUp} className="text-accent hover:text-accent-foreground data-[state=open]:border-b data-[state=closed]:border-b-0" />
                <AccordionContent className="p-0">
                    {derivedIncomeItems.length > 0 ? (
                        <ScrollArea className="h-[200px] w-full">
                            <Table>
                                <TableBody>{derivedIncomeItems.map(item => renderDerivedItemRow(item, 'income'))}</TableBody>
                            </Table>
                        </ScrollArea>
                    ) : (
                        <p className="text-center text-muted-foreground py-4 text-sm">No income transactions in selected range.</p>
                    )}
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="expenses-accordion" className="border-b-0 mb-2 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                <AccordionTriggerWithSum label="Expenses" sum={totalActualExpenses} itemCount={derivedExpenseItems.length} icon={TrendingDown} className="text-destructive hover:text-destructive-foreground data-[state=open]:border-b data-[state=closed]:border-b-0" />
                <AccordionContent className="p-0">
                    {derivedExpenseItems.length > 0 ? (
                        <ScrollArea className="h-[200px] w-full">
                            <Table>
                                <TableBody>{derivedExpenseItems.map(item => renderDerivedItemRow(item, 'expense'))}</TableBody>
                            </Table>
                        </ScrollArea>
                    ) : (
                        <p className="text-center text-muted-foreground py-4 text-sm">No expense transactions in selected range.</p>
                    )}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        </CardContent>
        <CardFooter className="p-6 pt-4 border-t mt-auto">
            <div className="flex justify-between items-center text-lg font-bold w-full">
                <span>Net Cash Flow</span>
                <span className={cn("font-mono", cashFlow >= 0 ? 'text-accent' : 'text-destructive')}>
                    {formatCurrency(cashFlow)}
                </span>
            </div>
        </CardFooter>
    </Card>
  );
};

export default CashFlowStatementSection;
