// src/components/debt/DebtStrategyRecommendations.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalBudgetedDebt } from '@/store/budgetStore';
import { useToast } from '@/hooks/use-toast';
import type { DebtItem } from '@/lib/types';
import { isDebtActive } from '@/lib/debtUtils';
import { formatCurrency, cn } from '@/lib/utils';
import { 
  Compass, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  Zap, 
  Target, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  ShieldCheck,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface DebtStrategyRecommendationsProps {
  className?: string;
}

type StrategyType = 'avalanche' | 'snowball' | 'hybrid';

interface PayoffSimulationResult {
  strategy: StrategyType;
  monthsToFree: number;
  totalInterestPaid: number;
  monthlyAllocation: number;
  payoffOrder: {
    debt: DebtItem;
    targetMonthlyPayment: number;
    estimatedMonths: number;
  }[];
}

export function DebtStrategyRecommendations({ className }: DebtStrategyRecommendationsProps) {
  const { debts } = useDebtStore();
  const budgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalBudgetedDebt = useBudgetStore(selectTotalBudgetedDebt);
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [expectedMonthlyIncome, setExpectedMonthlyIncome] = useState<number>(() => budgetedIncome > 0 ? budgetedIncome : 120000);
  const [allocationPercent, setAllocationPercent] = useState<number>(20); // 20% of income by default
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('avalanche');

  const activeDebts = useMemo(() => debts.filter(isDebtActive), [debts]);
  const totalPrincipal = useMemo(() => activeDebts.reduce((sum, d) => sum + (d.principal || 0), 0), [activeDebts]);
  const totalMinPayment = useMemo(() => activeDebts.reduce((sum, d) => sum + (d.minPayment || 0), 0), [activeDebts]);

  // Target monthly payment towards debt based on expected income and allocation %
  const targetMonthlyBudget = useMemo(() => {
    const fromPercent = (expectedMonthlyIncome * allocationPercent) / 100;
    return Math.max(totalMinPayment, fromPercent);
  }, [expectedMonthlyIncome, allocationPercent, totalMinPayment]);

  // Debt-to-Income (DTI) & Repayment Burden Assessment
  const debtBurden = useMemo(() => {
    if (expectedMonthlyIncome <= 0) return { ratio: 0, level: 'unknown', text: 'No income specified' };
    const ratio = (totalMinPayment / expectedMonthlyIncome) * 100;
    if (ratio <= 15) return { ratio, level: 'healthy', text: 'Healthy (<15% of income)' };
    if (ratio <= 35) return { ratio, level: 'moderate', text: 'Moderate (15-35% of income)' };
    return { ratio, level: 'high', text: 'High Burden (>35% of income). Restructuring recommended.' };
  }, [expectedMonthlyIncome, totalMinPayment]);

  // High-interest debt restructuring opportunities
  const highInterestDebts = useMemo(() => {
    return activeDebts.filter(d => (d.interestRate || 0) >= 12 && (d.principal || 0) > 0);
  }, [activeDebts]);

  // Payoff simulations for Avalanche & Snowball
  const simulations = useMemo(() => {
    if (activeDebts.length === 0 || targetMonthlyBudget <= 0) {
      return {
        avalanche: { strategy: 'avalanche' as StrategyType, monthsToFree: 0, totalInterestPaid: 0, monthlyAllocation: 0, payoffOrder: [] },
        snowball: { strategy: 'snowball' as StrategyType, monthsToFree: 0, totalInterestPaid: 0, monthlyAllocation: 0, payoffOrder: [] },
      };
    }

    const runSimulation = (strategy: StrategyType): PayoffSimulationResult => {
      let currentDebts = activeDebts.map(d => ({
        ...d,
        currentPrincipal: d.principal || 0,
        rate: d.interestRate || 0,
        min: d.minPayment || 0,
      }));

      let months = 0;
      let totalInterest = 0;
      const MAX_MONTHS = 480;

      while (currentDebts.some(d => d.currentPrincipal > 0.01) && months < MAX_MONTHS) {
        months++;
        let available = targetMonthlyBudget;

        // 1. Apply monthly interest
        currentDebts.forEach(d => {
          if (d.currentPrincipal > 0 && d.rate > 0) {
            const mInterest = d.currentPrincipal * (d.rate / 100 / 12);
            d.currentPrincipal += mInterest;
            totalInterest += mInterest;
          }
        });

        // 2. Pay minimums first
        currentDebts.forEach(d => {
          if (d.currentPrincipal > 0 && available > 0) {
            const pay = Math.min(d.min, d.currentPrincipal, available);
            d.currentPrincipal -= pay;
            available -= pay;
          }
        });

        // 3. Sort debts by chosen strategy for surplus payment
        if (available > 0.01) {
          if (strategy === 'avalanche') {
            // Highest interest rate first
            currentDebts.sort((a, b) => b.rate - a.rate || b.currentPrincipal - a.currentPrincipal);
          } else {
            // Lowest balance first (Snowball)
            currentDebts.sort((a, b) => a.currentPrincipal - b.currentPrincipal || b.rate - a.rate);
          }

          for (const d of currentDebts) {
            if (d.currentPrincipal > 0.01 && available > 0.01) {
              const extra = Math.min(available, d.currentPrincipal);
              d.currentPrincipal -= extra;
              available -= extra;
            }
            if (available <= 0.01) break;
          }
        }
      }

      // Ordered list for display
      const sortedActive = [...activeDebts].sort((a, b) => {
        if (strategy === 'avalanche') {
          return (b.interestRate || 0) - (a.interestRate || 0) || (b.principal || 0) - (a.principal || 0);
        }
        return (a.principal || 0) - (b.principal || 0) || (b.interestRate || 0) - (a.interestRate || 0);
      });

      const payoffOrder = sortedActive.map((debt, idx) => {
        const isPriority = idx === 0;
        const targetMonthly = isPriority ? (debt.minPayment || 0) + Math.max(0, targetMonthlyBudget - totalMinPayment) : (debt.minPayment || 0);
        const estMonths = targetMonthly > 0 ? Math.ceil((debt.principal || 0) / targetMonthly) : 0;
        return {
          debt,
          targetMonthlyPayment: targetMonthly,
          estimatedMonths: estMonths,
        };
      });

      return {
        strategy,
        monthsToFree: months,
        totalInterestPaid: Math.round(totalInterest),
        monthlyAllocation: targetMonthlyBudget,
        payoffOrder,
      };
    };

    return {
      avalanche: runSimulation('avalanche'),
      snowball: runSimulation('snowball'),
    };
  }, [debts, targetMonthlyBudget, totalMinPayment]);

  const activeSimulation = simulations[selectedStrategy === 'snowball' ? 'snowball' : 'avalanche'];
  const interestDifference = Math.abs(simulations.snowball.totalInterestPaid - simulations.avalanche.totalInterestPaid);

  if (debts.length === 0) return null;

  return (
    <Card className={cn("border border-border/80 bg-card overflow-hidden", className)}>
      <CardHeader 
        className="p-4 cursor-pointer hover:bg-muted/20 transition-colors flex flex-row items-center justify-between space-y-0"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">
              Strategic Debt Payoff & Income Recommendations
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal py-0">
              Optional Advisor
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Compare Avalanche vs Snowball strategies based on your expected monthly income.
          </CardDescription>
        </div>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 pt-0 space-y-4 text-xs border-t border-border/40 mt-2">
          {/* Income & Repayment Budget Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Expected Monthly Income (KES)</Label>
              <Input
                type="number"
                step="1000"
                min="0"
                value={expectedMonthlyIncome || ''}
                onChange={(e) => setExpectedMonthlyIncome(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Income Allocated to Debt</Label>
              <Select
                value={String(allocationPercent)}
                onValueChange={(val) => setAllocationPercent(parseInt(val, 10))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10" className="text-xs">10% (Conservative)</SelectItem>
                  <SelectItem value="15" className="text-xs">15% (Moderate)</SelectItem>
                  <SelectItem value="20" className="text-xs">20% (Recommended)</SelectItem>
                  <SelectItem value="25" className="text-xs">25% (Accelerated)</SelectItem>
                  <SelectItem value="30" className="text-xs">30% (Aggressive)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Strategy Method</Label>
              <Select
                value={selectedStrategy}
                onValueChange={(val: any) => setSelectedStrategy(val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avalanche" className="text-xs">Debt Avalanche (Highest Rate First)</SelectItem>
                  <SelectItem value="snowball" className="text-xs">Debt Snowball (Lowest Balance First)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* DTI & Health Insight Bar */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                debtBurden.level === 'healthy' ? "bg-emerald-500" :
                debtBurden.level === 'moderate' ? "bg-amber-500" : "bg-rose-500"
              )} />
              <div>
                <span className="font-semibold text-foreground">Debt-to-Income Commitment: </span>
                <span className="text-muted-foreground">{debtBurden.ratio.toFixed(1)}% of income ({debtBurden.text})</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-muted-foreground">Monthly Repayment Budget: </span>
              <strong className="font-mono text-foreground">{formatCurrency(targetMonthlyBudget)}</strong>
            </div>
          </div>

          {/* Strategy Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Avalanche Card */}
            <div className={cn(
              "p-3 rounded-lg border transition-all",
              selectedStrategy === 'avalanche' ? "border-primary bg-primary/5" : "border-border bg-background"
            )}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  Debt Avalanche
                </div>
                <Badge variant="secondary" className="text-[10px]">Lowest Cost</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Targets highest interest rates first. Saves the maximum money on interest.
              </p>
              <div className="flex justify-between items-center text-xs font-mono pt-1 border-t border-border/50">
                <span>Total Interest: <strong>{formatCurrency(simulations.avalanche.totalInterestPaid)}</strong></span>
                <span>Freedom: <strong>{simulations.avalanche.monthsToFree} mo</strong></span>
              </div>
            </div>

            {/* Snowball Card */}
            <div className={cn(
              "p-3 rounded-lg border transition-all",
              selectedStrategy === 'snowball' ? "border-primary bg-primary/5" : "border-border bg-background"
            )}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  Debt Snowball
                </div>
                <Badge variant="secondary" className="text-[10px]">Quick Wins</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Targets smallest principal balances first for early psychological momentum.
              </p>
              <div className="flex justify-between items-center text-xs font-mono pt-1 border-t border-border/50">
                <span>Total Interest: <strong>{formatCurrency(simulations.snowball.totalInterestPaid)}</strong></span>
                <span>Freedom: <strong>{simulations.snowball.monthsToFree} mo</strong></span>
              </div>
            </div>
          </div>

          {/* High Interest Restructuring Recommendations */}
          {highInterestDebts.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-100 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <RefreshCw className="w-3.5 h-3.5" />
                Restructuring Recommendation Detected
              </div>
              <p className="text-[11px] text-muted-foreground">
                You have <strong>{highInterestDebts.length} high-interest debt(s)</strong> (&ge;12% APR) totaling <strong>{formatCurrency(highInterestDebts.reduce((sum, d) => sum + (d.principal || 0), 0))}</strong>. Consider restructuring these into low-rate SACCO or bank facilities.
              </p>
            </div>
          )}

          {/* Priority Payoff Order Table */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-semibold text-foreground">
              Recommended Payoff Order ({selectedStrategy === 'avalanche' ? 'Avalanche Priority' : 'Snowball Priority'}):
            </div>
            <div className="space-y-1 divide-y divide-border/40">
              {activeSimulation.payoffOrder.map((item, idx) => (
                <div key={item.debt.id} className="pt-1.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center font-mono text-[10px] font-bold text-foreground">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium text-foreground">{item.debt.description}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {formatCurrency(item.debt.principal)} @ {item.debt.interestRate || 0}% APR
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="font-semibold text-foreground">{formatCurrency(item.targetMonthlyPayment)}/mo</div>
                    <div className="text-[10px] text-muted-foreground">
                      {idx === 0 ? 'Accelerated focus' : 'Minimum payment'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
