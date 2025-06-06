
// src/app/(dashboard)/budget/import/page.tsx
'use client'

import React, { useState, type ChangeEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileCheck, RotateCcw, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Loader2, PieChart } from 'lucide-react';
import { useBudgetStore, BudgetItemCategorySchema } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import Papa, { type ParseResult } from 'papaparse';
import Link from 'next/link';
import { cn, formatCurrency } from '@/lib/utils';
import { format, parse } from 'date-fns';

type ImportStage = 'upload' | 'preview' | 'reconciling' | 'complete' | 'error';

interface ParsedRow extends Record<string, string> {
  __originalIndex: string;
}

interface MappedBudgetItem extends Omit<BudgetItem, 'id' | 'period'> {
  id?: string;
  period?: string;
  __originalData: ParsedRow;
  __parseError?: string;
  __toBeImported: boolean;
}

const requiredHeaders = ['category', 'description', 'amount'];

export default function ImportBudgetPage() {
  const { importBudgetsBatch, budgetPeriod } = useBudgetStore();
  const { toast } = useToast();

  const [stage, setStage] = useState<ImportStage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [mappedBudgetItems, setMappedBudgetItems] = useState<MappedBudgetItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      resetState();
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV file.",
        variant: "destructive"
      });
      resetState();
      return;
    }

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setStage('upload');
    setImportError(null);
  }, [toast]);

  const handleParseFile = useCallback(() => {
    if (!file) return;

    setIsParsing(true);
    setImportError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: ParseResult<Record<string, string>>) => {
        setIsParsing(false);

        if (results.errors.length > 0) {
          setImportError(`Error parsing CSV: ${results.errors[0].message}. Check file format.`);
          setStage('error');
          return;
        }

        if (!results.data.length || !results.meta.fields?.length) {
          setImportError("CSV is empty or has no headers. Expected headers: category, description, amount.");
          setStage('error');
          return;
        }

        const headers = results.meta.fields.map(h => h.toLowerCase());
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
          setImportError(`Missing required CSV headers: ${missingHeaders.join(', ')}.`);
          setStage('error');
          return;
        }

        const dataWithIndex = results.data.map((row, index) => ({
          ...row,
          __originalIndex: index.toString(), // Convert to string here
        }));

        setParsedData(dataWithIndex);
        proceedToPreview(dataWithIndex);
      },
      error: (error: Error) => {
        setImportError(`Failed to parse file: ${error.message}`);
        setStage('error');
        setIsParsing(false);
      }
    });
  }, [file]);

  const proceedToPreview = useCallback((parsedRows: ParsedRow[]) => {
    const mapped: MappedBudgetItem[] = parsedRows.map((row) => {
      const budgetItem: Partial<MappedBudgetItem> = {
        __originalData: row,
        __toBeImported: true,
        description: '',
        category: 'recurring-expense',
      };

      let parseError = '';
      const rawCategory = row.category?.trim().toLowerCase();
      const rawDescription = row.description?.trim();
      const rawAmount = row.amount?.trim().replace(/,/g, '');

      // Category Validation
      const categoryValidation = BudgetItemCategorySchema.safeParse(rawCategory);
      if (categoryValidation.success) {
        if (categoryValidation.data === 'unplanned-expense') {
          parseError += `Category 'unplanned-expense' cannot be directly imported. `;
        } else {
          budgetItem.category = categoryValidation.data;
        }
      } else {
        parseError += `Invalid category: '${row.category || ""}'. Valid categories: income, recurring-expense, one-time-expense, goal, debt. `;
      }

      // Description Validation
      if (!rawDescription) {
        parseError += "Description is missing. ";
      } else if (rawDescription.length > 100) {
        parseError += "Description is too long (max 100 chars). ";
      } else {
        budgetItem.description = rawDescription;
      }

      // Amount Validation
      const parsedAmount = parseFloat(rawAmount || '');
      if (isNaN(parsedAmount)) {
        parseError += `Invalid amount: '${row.amount || ""}'. `;
      } else if (parsedAmount <= 0) {
        parseError += `Amount must be positive: '${row.amount || ""}'. `;
      } else {
        budgetItem.amount = parsedAmount;
      }

      if (parseError) {
        budgetItem.__parseError = parseError.trim();
        budgetItem.__toBeImported = false;
      }

      return budgetItem as MappedBudgetItem;
    });

    setMappedBudgetItems(mapped);
    setStage('preview');
  }, []);

  const toggleImportRow = useCallback((index: number) => {
    setMappedBudgetItems(prev => prev.map((item, i) =>
      i === index ? { ...item, __toBeImported: !item.__toBeImported } : item
    ));
  }, []);

  const handleConfirmImport = useCallback(async () => {
    setStage('reconciling');
    setImportError(null);

    const itemsToImport = mappedBudgetItems.filter(item =>
      item.__toBeImported && !item.__parseError
    );

    const currentSkippedCount = mappedBudgetItems.length - itemsToImport.length;
    setSkippedCount(currentSkippedCount);

    if (itemsToImport.length === 0) {
      setImportedCount(0);
      setStage('complete');
      toast({
        title: "Import Complete",
        description: `No new budget items were imported. ${currentSkippedCount} rows skipped.`,
        variant: "default"
      });
      return;
    }

    try {
      const newBudgetData = itemsToImport.map(item => ({
        category: item.category!,
        description: item.description!,
        amount: item.amount!,
      }));

      const addedItems = importBudgetsBatch(newBudgetData);
      setImportedCount(addedItems.length);
      setStage('complete');

      toast({
        title: "Import Successful",
        description: `${addedItems.length} budget items imported to period ${format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}. ${currentSkippedCount} rows skipped.`,
        variant: "default"
      });
    } catch (error: any) {
      setImportError(`Failed to save budget items: ${error.message}`);
      setStage('error');
      toast({
        title: "Import Failed",
        description: "Could not save imported budget items.",
        variant: "destructive"
      });
    }
  }, [mappedBudgetItems, budgetPeriod, importBudgetsBatch, toast]);

  const resetState = useCallback(() => {
    setStage('upload');
    setFile(null);
    setFileName('');
    setIsParsing(false);
    setParsedData([]);
    setMappedBudgetItems([]);
    setImportError(null);
    setImportedCount(0);
    setSkippedCount(0);

    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, []);

  const handleBack = useCallback(() => {
    if (stage === 'preview') {
      setStage('upload');
    } else if (stage === 'complete' || stage === 'error') {
      resetState();
    }
    setImportError(null);
  }, [stage, resetState]);

  const renderUploadStage = () => (
    <Card>
      <CardHeader className="p-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          Import Budget Items (Step 1/3)
        </CardTitle>
        <CardDescription>
          Select a CSV file with columns: category, description, amount.
          For best results and to avoid potential save/sync issues, we recommend importing files with fewer than 500-1000 budget items at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="file-upload">Choose CSV File</Label>
          <Input
            id="file-upload"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
        </div>
        {fileName && (
          <p className="text-sm text-muted-foreground">Selected: {fileName}</p>
        )}
        {importError && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle size={14} /> {importError}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex justify-between p-6">
        <Button variant="outline" asChild>
          <Link href="/budget">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Budget
          </Link>
        </Button>
        <Button onClick={handleParseFile} disabled={!file || isParsing}>
          {isParsing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCheck className="mr-2 h-4 w-4" />
          )}
          {isParsing ? 'Parsing...' : 'Parse & Preview'}
        </Button>
      </CardFooter>
    </Card>
  );

  const renderPreviewStage = () => {
    const itemsToImportCount = mappedBudgetItems.filter(
      item => item.__toBeImported && !item.__parseError
    ).length;

    return (
      <Card>
        <CardHeader className="p-6">
          <CardTitle className="text-lg">Preview Budget Items (Step 2/3)</CardTitle>
          <CardDescription>
            Review parsed items for period:{' '}
            <span className="font-semibold">
              {format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}
            </span>
            . Uncheck rows to exclude. Rows with errors cannot be imported.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {importError && (
            <p className="text-sm text-destructive flex items-center gap-1 px-6 pb-4">
              <AlertTriangle size={14} /> {importError}
            </p>
          )}
          <ScrollArea className="h-[500px] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] pl-6 pr-3">Import?</TableHead>
                  <TableHead className="px-3">Category</TableHead>
                  <TableHead className="px-3">Description</TableHead>
                  <TableHead className="px-3 text-right">Amount (KES)</TableHead>
                  <TableHead className="pr-6 pl-3">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedBudgetItems.map((item, index) => (
                  <TableRow
                    key={index}
                    className={cn(
                      item.__parseError && "bg-destructive/10 text-destructive"
                    )}
                    title={item.__parseError ? item.__parseError : undefined}
                  >
                    <TableCell className="text-center pl-6 pr-3">
                      <Input
                        type="checkbox"
                        aria-label={`Select row ${index + 1} for import`}
                        checked={item.__toBeImported}
                        disabled={!!item.__parseError}
                        onChange={() => toggleImportRow(index)}
                        className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </TableCell>
                    <TableCell className="capitalize px-3">
                      {item.category}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate px-3">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-right font-mono px-3">
                      {item.amount !== undefined && !isNaN(item.amount)
                        ? formatCurrency(item.amount)
                        : 'Invalid'}
                    </TableCell>
                    <TableCell className="text-xs pr-6 pl-3">
                      {item.__parseError ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle size={14} /> Error
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-accent">
                          <CheckCircle size={14} /> Ready
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {mappedBudgetItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                      No budget items parsed or preview available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 p-6">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Upload
          </Button>
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            {itemsToImportCount} of {mappedBudgetItems.length} rows selected for import.
          </div>
          <Button
            onClick={handleConfirmImport}
            disabled={itemsToImportCount === 0}
          >
            <Upload className="mr-2 h-4 w-4" /> Confirm Import
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const renderReconcilingStage = () => (
    <Card>
      <CardHeader className="p-6">
        <CardTitle className="text-lg">Importing Budget Items...</CardTitle>
        <CardDescription>
          Please wait while the selected items are being added to{' '}
          {format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center items-center h-40 p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </CardContent>
    </Card>
  );

  const renderCompleteStage = () => (
    <Card>
      <CardHeader className="p-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle className="text-accent" /> Import Complete
        </CardTitle>
        <CardDescription>
          The budget item import process has finished.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-6">
        <p>
          Successfully imported:{' '}
          <span className="font-semibold">{importedCount}</span> items to budget
          for {format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}.
        </p>
        <p>
          Skipped or excluded:{' '}
          <span className="font-semibold">{skippedCount}</span> rows.
        </p>
        {importError && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle size={14} /> Error during saving: {importError}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 p-6">
        <Button variant="outline" onClick={resetState}>
          <Upload className="mr-2 h-4 w-4" /> Import Another File
        </Button>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/budget">
              View Budget <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );

  const renderErrorStage = () => (
    <Card className="border-destructive">
      <CardHeader className="p-6">
        <CardTitle className="text-lg flex items-center gap-2 text-destructive">
          <AlertTriangle /> Import Error
        </CardTitle>
        <CardDescription>
          An error occurred during the budget import process.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <p className="text-destructive font-medium">
          {importError || "An unknown error occurred."}
        </p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 p-6">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
        <Button variant="outline" onClick={resetState}>
          <RotateCcw className="mr-2 h-4 w-4" /> Start Over
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      {stage === 'upload' && renderUploadStage()}
      {stage === 'preview' && renderPreviewStage()}
      {stage === 'reconciling' && renderReconcilingStage()}
      {stage === 'complete' && renderCompleteStage()}
      {stage === 'error' && renderErrorStage()}
    </div>
  );
}
