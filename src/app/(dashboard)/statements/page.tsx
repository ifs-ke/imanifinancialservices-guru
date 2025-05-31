
// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, XCircle, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, isValid as isDateValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { useStatementStore } from '@/store/statementStore';
import NetWorthStatementSection from './NetWorthStatementSection';
import CashFlowStatementSection from './CashFlowStatementSection';
import BudgetVarianceReportSection from './BudgetVarianceReportSection';
import { logDebug } from '@/lib/logger';

const formatDateForStatements = (date: Date | undefined) => {
    if (!date || !isDateValid(date)) return <span>Pick a date</span>;
    return format(date, "LLL dd, y");
};

export default function StatementsPage() {
  const {
      startDate, endDate, setStartDate, setEndDate,
      assetItems, otherLiabilityItems,
      setAssetItems, setOtherLiabilityItems, // To pass down for editing
  } = useStatementStore();

  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Ensure initial dates are set after hydration if they are undefined
  useEffect(() => {
    if (!startDate && isHydrated) {
      setStartDate(dfnsStartOfMonth(new Date()));
      logDebug("StatementsPage: Default start date set on hydration.", { currentUserId: 'mock_user' });
    }
    if (!endDate && isHydrated) {
      setEndDate(dfnsEndOfMonth(new Date()));
      logDebug("StatementsPage: Default end date set on hydration.", { currentUserId: 'mock_user' });
    }
    setIsHydrated(true);
  }, [isHydrated, startDate, endDate, setStartDate, setEndDate]);


  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (isEditing) { // Was editing, now finishing
        // Save logic is handled within NetWorthStatementSection
        // This toggle is just for the button state on this page
        toast({ title: 'Edit Mode Ended', description: 'Changes (if any) should be saved within the Net Worth section.' });
    } else {
        toast({ title: 'Edit Mode Enabled', description: 'You can now edit Assets and Other Liabilities in the Net Worth statement.' });
    }
  };

  // This is a simplified save, actual saving of assets/liabilities happens in NetWorthStatementSection
  const handleSaveChanges = () => {
    // This function might become more relevant if global save for the page is needed
    // For now, individual sections handle their saves
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Assets and Other Liabilities have been updated if changed.' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Potentially revert changes if NetWorthStatementSection doesn't handle it internally on cancel
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };


  if (!isHydrated) {
    return (
        <div className="flex h-full w-full items-center justify-center p-4 md:p-6 lg:p-8">
            <p>Loading statement data...</p>
        </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen py-4 md:py-6 lg:py-8">
      <header className="mb-6 px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary"/> Financial Statements
            </h1>
            <p className="text-muted-foreground text-sm">Review your financial position and performance.</p>
        </div>
         <div className="flex gap-2 flex-wrap">
            {isEditing ? (
                <>
                    <Button variant="outline" onClick={handleCancelEdit} size="sm">
                        <XCircle className="mr-2 h-4 w-4" /> Cancel Edit
                    </Button>
                    {/* Save button in NetWorthStatementSection now handles actual save */}
                </>
            ) : (
                <Button onClick={handleEditToggle} size="sm">
                    Edit Assets/Liabilities
                </Button>
            )}
         </div>
      </header>

       <div className="flex flex-col sm:flex-row items-center gap-2 text-sm mb-6 p-4 mx-4 md:mx-6 lg:px-8 border rounded-lg bg-card shadow-sm">
          <Label className="font-semibold shrink-0">Statement Period:</Label>
           <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full sm:w-auto justify-start text-left font-normal h-9 min-w-[150px]", !startDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateForStatements(startDate)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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
           <span className="text-muted-foreground hidden sm:inline">-</span>
           <Popover>
                <PopoverTrigger asChild>
                     <Button
                        variant={"outline"}
                        className={cn("w-full sm:w-auto justify-start text-left font-normal h-9 min-w-[150px] mt-2 sm:mt-0", !endDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateForStatements(endDate)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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

      <main className="flex-1 grid gap-6 lg:grid-cols-2 px-4 md:px-6 lg:px-8">
        <CashFlowStatementSection 
            startDate={startDate}
            endDate={endDate}
        />
        <NetWorthStatementSection 
            isEditingAssetsLiabilities={isEditing}
            onSaveEdits={handleSaveChanges} // Or pass specific save handlers from here
            assetItems={assetItems} // Pass state down
            otherLiabilityItems={otherLiabilityItems} // Pass state down
            setAssetItems={setAssetItems} // Pass setters down
            setOtherLiabilityItems={setOtherLiabilityItems} // Pass setters down
        />
        <BudgetVarianceReportSection
            startDate={startDate}
            endDate={endDate}
        />
      </main>
    </div>
  );
}
