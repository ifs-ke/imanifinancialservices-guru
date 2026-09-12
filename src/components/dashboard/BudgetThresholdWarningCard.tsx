// src/components/dashboard/BudgetThresholdWarningCard.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import type { CategoryThresholdWarning } from '@/lib/budgetThresholdUtils';

interface BudgetThresholdWarningCardProps {
  warnings: CategoryThresholdWarning[];
  periodLabel: string;
  className?: string;
}

export const BudgetThresholdWarningCard: React.FC<BudgetThresholdWarningCardProps> = ({
  warnings,
  periodLabel,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!warnings || warnings.length === 0) {
    return (
      <Card id="card-budget-threshold-status-ok" className={cn("border border-border/60 shadow-xs bg-card", className)}>
        <CardContent className="p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold text-foreground">Budget pace status: healthy</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All spending envelopes for {periodLabel} are currently within the 10% threshold warning buffer.
              </p>
            </div>
          </div>
          <Link href="/budget">
            <Button variant="ghost" size="xs" className="h-7 text-xs font-medium text-primary hover:text-primary">
              View envelopes <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = warnings.filter(w => w.severity === 'critical').length;
  const displayWarnings = isExpanded ? warnings : warnings.slice(0, 2);

  return (
    <Card 
      id="card-budget-threshold-warning" 
      className={cn(
        "border shadow-xs bg-card transition-all",
        criticalCount > 0 
          ? "border-destructive/40 dark:border-destructive/30 bg-destructive/5 dark:bg-destructive/10" 
          : "border-amber-500/40 dark:border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10",
        className
      )}
    >
      <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-lg shrink-0 mt-0.5",
            criticalCount > 0 
              ? "bg-destructive/15 text-destructive dark:text-red-400" 
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          )}>
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-bold text-foreground tracking-tight">
                Budget threshold warning ({warnings.length} {warnings.length === 1 ? 'category' : 'categories'})
              </CardTitle>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] font-semibold py-0.5 px-2 border",
                  criticalCount > 0 
                    ? "border-destructive/50 text-destructive bg-destructive/10" 
                    : "border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                )}
              >
                {criticalCount > 0 ? `${criticalCount} critical overage` : '> 10% overrun projected'}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Spending pace for {periodLabel} is trending to exceed envelope budgets by more than 10%.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {warnings.length > 2 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
              ) : (
                <>+{warnings.length - 2} more <ChevronDown className="h-3 w-3 ml-1" /></>
              )}
            </Button>
          )}
          <Link href="/budget">
            <Button size="xs" variant="outline" className="h-7 text-xs font-semibold rounded-lg border-border/60">
              <SlidersHorizontal className="h-3 w-3 mr-1" /> Adjust envelopes
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3">
        <div className="divide-y divide-border/40">
          {displayWarnings.map((warning, idx) => {
            const isCritical = warning.severity === 'critical';
            const progressValue = Math.min(100, (warning.actualSpent / warning.budgetedAmount) * 100);
            const projectedProgressValue = Math.min(100, (warning.projectedSpent / warning.budgetedAmount) * 100);

            return (
              <div key={`warning-${warning.categoryName}-${idx}`} className="py-2.5 first:pt-0 last:pb-0 space-y-2">
                {/* Header row: category title & percentages */}
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <AlertTriangle className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isCritical ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                    )} />
                    <span className="font-semibold text-foreground truncate">{warning.categoryName}</span>
                    {warning.categoryType && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 capitalize hidden sm:inline-block">
                        {warning.categoryType.replace(/-/g, ' ')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                    <span className="text-muted-foreground">
                      Actual: <strong className="text-foreground">{formatCurrency(warning.actualSpent)}</strong>
                    </span>
                    <span className="text-muted-foreground font-sans">•</span>
                    <span className="text-muted-foreground">
                      Budget: <strong className="text-foreground">{formatCurrency(warning.budgetedAmount)}</strong>
                    </span>
                    <span className={cn(
                      "font-bold py-0.5 px-1.5 rounded text-[10px]",
                      isCritical 
                        ? "bg-destructive/15 text-destructive" 
                        : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    )}>
                      {warning.isExceedingActual 
                        ? `${warning.spentPercentage.toFixed(1)}% spent` 
                        : `Pace: ${warning.projectedPercentage.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* Progress bar visualizer with 100% budget & 110% threshold indicator */}
                <div className="space-y-1">
                  <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden flex">
                    {/* Actual spent bar */}
                    <div 
                      className={cn(
                        "h-full transition-all rounded-l-full",
                        isCritical ? "bg-destructive" : "bg-amber-500"
                      )}
                      style={{ width: `${Math.min(100, warning.spentPercentage)}%` }}
                    />
                    {/* Projected pace extension bar if actual < projected */}
                    {warning.projectedSpent > warning.actualSpent && (
                      <div 
                        className={cn(
                          "h-full opacity-40 transition-all",
                          isCritical ? "bg-destructive" : "bg-amber-500"
                        )}
                        style={{ 
                          width: `${Math.min(100 - Math.min(100, warning.spentPercentage), Math.max(0, warning.projectedPercentage - warning.spentPercentage))}%` 
                        }}
                      />
                    )}
                  </div>

                  {/* Pace projection detail footnote */}
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                    <span>
                      Day {warning.daysElapsed}/{warning.totalDaysInMonth} pace projection:
                      <strong className="text-foreground ml-1">{formatCurrency(warning.projectedSpent)}</strong>
                    </span>
                    <span className={isCritical ? "text-destructive font-semibold" : "text-amber-700 dark:text-amber-400 font-semibold"}>
                      +{warning.overagePercentage.toFixed(1)}% over threshold limit
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default BudgetThresholdWarningCard;
