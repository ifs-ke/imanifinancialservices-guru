// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, FileText, Check, Settings, Sparkles, TrendingUp, HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, subMonths, startOfYear, endOfYear, isValid as isDateValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { useStatementStore } from '@/store/statementStore';
import NetWorthStatementSection from '@/components/statements/NetWorthStatementSection';
import CashFlowStatementSection from '@/components/statements/CashFlowStatementSection';
import BudgetVarianceReportSection from '@/components/statements/BudgetVarianceReportSection';
import { logDebug } from '@/lib/logger';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';

const formatDateForStatements = (date: Date | undefined, isStart: boolean) => {
  if (!date || !isDateValid(date)) return <span className="text-muted-foreground/60">{isStart ? "All Time (Start)" : "All Time (End)"}</span>;
  return format(date, "LLL dd, yyyy");
};

export default function StatementsPage() {
  const {
    startDate, endDate, setStartDate, setEndDate,
    assetItems, otherLiabilityItems,
    setAssetItems, setOtherLiabilityItems,
  } = useStatementStore();

  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (!isEditing) {
      toast({ 
        title: 'Edit Mode Enabled', 
        description: 'You can now manage Assets and Liabilities directly within the Net Worth card.',
        className: "bg-primary text-primary-foreground border-none"
      });
    } else {
      toast({ 
        title: 'Edit Mode Saved', 
        description: 'Statement balances are fully synchronized with local persistence.' 
      });
    }
  };

  const handlePresetSelect = (preset: 'this-month' | 'last-month' | 'last-3-months' | 'ytd' | 'all') => {
    const today = new Date();
    switch (preset) {
      case 'this-month':
        setStartDate(dfnsStartOfMonth(today));
        setEndDate(dfnsEndOfMonth(today));
        break;
      case 'last-month':
        const lm = subMonths(today, 1);
        setStartDate(dfnsStartOfMonth(lm));
        setEndDate(dfnsEndOfMonth(lm));
        break;
      case 'last-3-months':
        setStartDate(dfnsStartOfMonth(subMonths(today, 2)));
        setEndDate(dfnsEndOfMonth(today));
        break;
      case 'ytd':
        setStartDate(startOfYear(today));
        setEndDate(dfnsEndOfMonth(today));
        break;
      case 'all':
        setStartDate(undefined);
        setEndDate(undefined);
        break;
    }
    toast({
      title: "Filter Period Updated",
      description: "Statements successfully filtered for the selected preset interval.",
    });
  };

  if (!isHydrated) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-2">
          <FileText className="h-8 w-8 text-primary animate-bounce" />
          <p className="text-sm font-semibold text-muted-foreground">Hydrating your ledger data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen py-6 md:py-8 bg-background/50">
      
      {/* HEADER ROW */}
      <PageHeader
        title="Financial Statements"
        description="Review audit-ready ledger statements across assets, liabilities, and monthly expense variances."
        icon={FileText}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant={isEditing ? "outline" : "default"} 
            onClick={handleEditToggle} 
            size="sm"
            className={cn(
              "h-9 text-xs font-semibold rounded-lg shadow-sm shrink-0",
              isEditing && "border-primary text-primary bg-primary/5 hover:bg-primary/10"
            )}
          >
            {isEditing ? (
              <>
                <Check className="mr-1.5 h-4 w-4" /> Save Modifications
              </>
            ) : (
              <>
                <Settings className="mr-1.5 h-4 w-4" /> Configure Positions
              </>
            )}
          </Button>
        </div>
      </PageHeader>

      {/* FILTER & PERIOD SELECTOR BAR */}
      <div className="mx-4 md:mx-6 lg:mx-8 mb-6 p-4 rounded-2xl border border-border/60 bg-card shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Label className="text-xs font-bold text-foreground shrink-0 uppercase tracking-wider">Statement Period:</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full sm:w-auto justify-start text-left font-semibold text-xs h-9 min-w-[160px] border-border/60 rounded-lg shadow-sm hover:bg-muted/10",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {formatDateForStatements(startDate, true)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-xl border border-border/60 shadow-lg z-50" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    if (endDate && date && date > endDate) setEndDate(date);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <span className="text-muted-foreground hidden sm:inline font-semibold">-</span>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full sm:w-auto justify-start text-left font-semibold text-xs h-9 min-w-[160px] border-border/60 rounded-lg shadow-sm hover:bg-muted/10",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {formatDateForStatements(endDate, false)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-xl border border-border/60 shadow-lg z-50" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    if (startDate && date && date < startDate) setStartDate(date);
                  }}
                  disabled={(date) => startDate ? date < startDate : false}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* PERIOD PRESET INLINE SHORTCUTS */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Presets:</span>
          <Button variant="outline" size="xs" onClick={() => handlePresetSelect('this-month')} className="h-7 text-[11px] font-semibold rounded-lg border-border/60">This Month</Button>
          <Button variant="outline" size="xs" onClick={() => handlePresetSelect('last-month')} className="h-7 text-[11px] font-semibold rounded-lg border-border/60">Last Month</Button>
          <Button variant="outline" size="xs" onClick={() => handlePresetSelect('last-3-months')} className="h-7 text-[11px] font-semibold rounded-lg border-border/60">3 Months</Button>
          <Button variant="outline" size="xs" onClick={() => handlePresetSelect('ytd')} className="h-7 text-[11px] font-semibold rounded-lg border-border/60">YTD</Button>
          <Button variant="outline" size="xs" onClick={() => handlePresetSelect('all')} className="h-7 text-[11px] font-semibold rounded-lg border-border/60">All</Button>
        </div>
      </div>

      {/* MAIN LAYOUT GRID */}
      <main className="flex-1 grid gap-6 lg:grid-cols-2 px-4 md:px-6 lg:px-8 items-start">
        <CashFlowStatementSection 
          startDate={startDate}
          endDate={endDate}
        />
        
        <NetWorthStatementSection 
          isEditingAssetsLiabilities={isEditing}
          onSaveEdits={() => setIsEditing(false)}
          assetItems={assetItems}
          otherLiabilityItems={otherLiabilityItems}
          setAssetItems={setAssetItems}
          setOtherLiabilityItems={setOtherLiabilityItems}
        />

        <BudgetVarianceReportSection
          startDate={startDate}
          endDate={endDate}
        />
      </main>
    </div>
  );
}
