// src/app/(dashboard)/statements/CashFlowStatementSection.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Info, Calendar } from 'lucide-react';
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
  const normalized = value.toLowerCase();
  const isSteady = normalized === 'recurring' || normalized === 'fixed';
  return (
    <Badge 
      variant={isSteady ? 'secondary' : 'outline'} 
      className={cn(
        "text-[9px] font-semibold py-0 px-1.5 h-4.5 rounded-md border/50 uppercase tracking-wide",
        isSteady ? "bg-muted/50 text-muted-foreground" : "text-muted-foreground/80"
      )}
    >
      {value}
    </Badge>
  );
};

const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; itemCount: number; icon?: React.ElementType; className?: string }
>(({ label, sum, itemCount, icon: Icon, className, children, ...props }, ref) => (
  <AccordionTrigger ref={ref} {...props} className={cn('hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0', className)}>
    <div className="flex justify-between items-center w-full">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />} {label}
      </span>
      <div className="flex items-center gap-2 pr-2">
        {itemCount > 0 && <span className="text-[10px] text-muted-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded-full font-medium">({itemCount})</span>}
        <span className="font-semibold font-mono text-sm">{formatCurrency(sum)}</span>
      </div>
    </div>
  </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";

const CashFlowStatementSection: React.FC<CashFlowStatementSectionProps> = ({ startDate, endDate }) => {
  const transactions = useTransactionsStore(state => state.transactions);

  const filteredTransactions = useMemo(() => {
    if (!startDate && !endDate) {
      return transactions;
    }
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) {
      return [];
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
    <TableRow key={item.id} className="hover:bg-muted/10 border-b border-border/30">
      <TableCell className="pl-4 py-2 max-w-[200px]" title={item.description}>
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-xs text-foreground truncate">{item.description}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.date && (
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                <Calendar className="h-2.5 w-2.5" />
                {isDateValid(new Date(item.date)) ? new Date(item.date).toLocaleDateString() : ''}
              </span>
            )}
            {formatCategoryBadge(item.frequency)}
            {formatCategoryBadge(item.variability)}
          </div>
        </div>
      </TableCell>
      <TableCell className={cn(
        "text-right font-mono text-xs py-2 pr-4 font-bold shrink-0",
        type === 'income' ? 'text-navy dark:text-gold' : 'text-foreground font-medium'
      )}>
        {type === 'income' ? '+' : '-'}{formatCurrency(type === 'income' ? item.amount : Math.abs(item.amount))}
      </TableCell>
    </TableRow>
  );

  return (
    <Card className="shadow-md border border-border/60 overflow-hidden bg-card rounded-2xl flex flex-col min-h-[500px]">
      <CardHeader className="bg-muted/30 border-b border-border/40 py-5">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            {cashFlow >= 0 ? (
              <TrendingUp className="h-4.5 w-4.5 text-navy dark:text-gold" />
            ) : (
              <TrendingDown className="h-4.5 w-4.5 text-muted-foreground" />
            )}
            Cash Flow Statement
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            Automatically derived from transaction records in active filter duration.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-5 flex-grow">
        <Accordion type="multiple" className="w-full space-y-3" defaultValue={['income-accordion', 'expenses-accordion']}>
          {/* INCOME ACCORDION */}
          <AccordionItem value="income-accordion" className="border border-border/50 bg-muted/10 rounded-xl overflow-hidden shadow-sm">
            <AccordionTriggerWithSum 
              label="Cash Inflows" 
              sum={totalActualIncome} 
              itemCount={derivedIncomeItems.length} 
              icon={TrendingUp} 
              className="hover:bg-muted/20 text-foreground transition" 
            />
            <AccordionContent className="p-0 bg-background">
              {derivedIncomeItems.length > 0 ? (
                <ScrollArea className="max-h-[180px] w-full">
                  <Table>
                    <TableBody>
                      {derivedIncomeItems.map(item => renderDerivedItemRow(item, 'income'))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="py-10 text-center text-xs text-muted-foreground/80">
                  No verified income transactions detected.
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* EXPENSES ACCORDION */}
          <AccordionItem value="expenses-accordion" className="border border-border/50 bg-muted/10 rounded-xl overflow-hidden shadow-sm">
            <AccordionTriggerWithSum 
              label="Cash Outflows" 
              sum={totalActualExpenses} 
              itemCount={derivedExpenseItems.length} 
              icon={TrendingDown} 
              className="hover:bg-muted/20 text-foreground transition" 
            />
            <AccordionContent className="p-0 bg-background">
              {derivedExpenseItems.length > 0 ? (
                <ScrollArea className="max-h-[180px] w-full">
                  <Table>
                    <TableBody>
                      {derivedExpenseItems.map(item => renderDerivedItemRow(item, 'expense'))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="py-10 text-center text-xs text-muted-foreground/80">
                  No verified expense transactions detected.
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      <CardFooter className="p-5 border-t border-border/40 bg-muted/10 mt-auto">
        <div className="flex justify-between items-center w-full">
          <span className="text-sm font-bold text-foreground">Net Cash Surplus / (Deficit)</span>
          <span className={cn(
            "font-mono font-bold text-base tracking-tight px-3 py-1 rounded-full",
            cashFlow >= 0 ? 'text-navy dark:text-gold bg-navy-pale dark:bg-navy-mid' : 'text-foreground bg-muted'
          )}>
            {formatCurrency(cashFlow)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
};

export default CashFlowStatementSection;
