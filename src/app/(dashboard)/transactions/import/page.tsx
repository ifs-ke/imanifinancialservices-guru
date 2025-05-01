
'use client';

import React, { useState, type ChangeEvent, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileCheck, RotateCcw, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Loader2, ListChecks } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactions } from '@/contexts/TransactionsContext';
import type { TransactionWithId, ModeOfPayment } from '@/lib/types';
import Papa, { type ParseResult } from 'papaparse'; // CSV parsing library
import Link from 'next/link'; // For back button

// Possible CSV headers and their corresponding Transaction fields
const POSSIBLE_HEADERS: { [key: string]: keyof TransactionWithId | 'ignore' } = {
  date: 'date',
  time: 'ignore', // Often combined with date or irrelevant
  description: 'description',
  details: 'description',
  memo: 'description',
  payee: 'description',
  amount: 'amount',
  debit: 'amount', // Treat as negative
  credit: 'amount', // Treat as positive
  'payment mode': 'modeOfPayment',
  'payment method': 'modeOfPayment',
  type: 'ignore', // Often transaction type, less useful than description/amount
  category: 'ignore', // Let user categorize later if needed
  balance: 'ignore',
  'transaction id': 'ignore', // Bank's ID, not ours
};

// Expected Transaction fields for mapping
const TRANSACTION_FIELDS: (keyof TransactionWithId)[] = ['date', 'description', 'amount', 'modeOfPayment'];

// Define states for the import process
type ImportStage = 'upload' | 'mapping' | 'preview' | 'reconciling' | 'complete' | 'error';

interface ParsedRow extends Record<string, string> {
  __originalIndex: number; // Keep track of original row for potential errors
}

interface MappedTransaction extends Omit<TransactionWithId, 'id' | 'date'> {
    id?: string; // Might match existing during reconciliation
    date: Date | null; // Date might fail parsing
    __originalData: ParsedRow;
    __parseError?: string;
    __duplicatePotential?: TransactionWithId; // Potential match found
    __toBeImported: boolean; // Flag to control import
}

export default function ImportTransactionsPage() {
    const { transactions: existingTransactions, addTransaction, importTransactionsBatch } = useTransactions();
    const { toast } = useToast();

    const [stage, setStage] = useState<ImportStage>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [isParsing, setIsParsing] = useState(false);
    const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
    const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, keyof TransactionWithId | 'ignore'>>({});
    const [mappedTransactions, setMappedTransactions] = useState<MappedTransaction[]>([]);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedCount, setImportedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);
    const [lastImportedIds, setLastImportedIds] = useState<string[]>([]); // For rollback

    // --- Stage 1: Upload ---

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
          resetState();
          return;
        }
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setStage('upload'); // Ensure stage is upload
        setImportError(null);
    };

    const handleParseFile = () => {
        if (!file) return;
        setIsParsing(true);
        setImportError(null);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: ParseResult<Record<string, string>>) => {
                if (results.errors.length > 0) {
                    console.error("CSV Parsing Errors:", results.errors);
                    setImportError(`Error parsing CSV: ${results.errors[0].message}. Check file format.`);
                    setStage('error');
                    setIsParsing(false);
                    return;
                }
                if (!results.data.length || !results.meta.fields?.length) {
                     setImportError("CSV is empty or has no headers.");
                     setStage('error');
                     setIsParsing(false);
                     return;
                }

                const headers = results.meta.fields;
                const dataWithIndex = results.data.map((row, index) => ({
                  ...row,
                   __originalIndex: index,
                 }));

                setParsedHeaders(headers);
                setParsedData(dataWithIndex);
                autoMapColumns(headers); // Attempt initial mapping
                setStage('mapping');
                setIsParsing(false);
            },
            error: (error: Error) => {
                console.error("CSV Parsing Failed:", error);
                setImportError(`Failed to parse file: ${error.message}`);
                setStage('error');
                setIsParsing(false);
            }
        });
    };

    // --- Stage 2: Mapping ---

    const autoMapColumns = (headers: string[]) => {
        const initialMapping: Record<string, keyof TransactionWithId | 'ignore'> = {};
        headers.forEach(header => {
            const lowerHeader = header.toLowerCase().trim();
            let mappedField: keyof TransactionWithId | 'ignore' = 'ignore';
            // Try direct match first
            if (POSSIBLE_HEADERS[lowerHeader]) {
                mappedField = POSSIBLE_HEADERS[lowerHeader];
            } else {
                // Try partial matches
                for (const possibleKey in POSSIBLE_HEADERS) {
                     if (lowerHeader.includes(possibleKey)) {
                        mappedField = POSSIBLE_HEADERS[possibleKey];
                        break; // Take the first partial match
                     }
                 }
            }
            initialMapping[header] = mappedField;
        });
        setColumnMapping(initialMapping);
    };

    const handleMappingChange = (header: string, value: string) => {
        setColumnMapping(prev => ({
            ...prev,
            [header]: value as keyof TransactionWithId | 'ignore'
        }));
    };

    const validateMapping = (): boolean => {
        const mappedFields = Object.values(columnMapping);
        const requiredFieldsMet = TRANSACTION_FIELDS.every(field =>
             field === 'modeOfPayment' ? true : mappedFields.includes(field) // modeOfPayment is optional initially
        );
        if (!requiredFieldsMet) {
             setImportError("Please map columns for Date, Description, and Amount.");
             toast({ title: "Mapping Incomplete", description: "Date, Description, and Amount fields are required.", variant: "destructive" });
             return false;
        }
         // Check for duplicate mapping (excluding 'ignore')
        const assignedFields = mappedFields.filter(f => f !== 'ignore');
        if (new Set(assignedFields).size !== assignedFields.length) {
             setImportError("Each transaction field (Date, Description, Amount, Mode of Payment) can only be mapped once.");
             toast({ title: "Duplicate Mapping", description: "A transaction field is mapped to multiple columns.", variant: "destructive" });
             return false;
         }

        setImportError(null);
        return true;
    };

    const proceedToPreview = () => {
        if (!validateMapping()) return;

        const mapped: MappedTransaction[] = parsedData.map((row) => {
            const transaction: Partial<MappedTransaction> = {
                __originalData: row,
                __toBeImported: true, // Default to import
            };
            let parseError = '';

            for (const header in columnMapping) {
                const field = columnMapping[header];
                const rawValue = row[header]?.trim();

                if (field === 'ignore' || !rawValue) continue;

                try {
                    switch (field) {
                        case 'date':
                            const parsedDate = new Date(rawValue);
                             if (isNaN(parsedDate.getTime())) {
                                 throw new Error(`Invalid date format: ${rawValue}`);
                             }
                            transaction.date = parsedDate;
                            break;
                        case 'description':
                            transaction.description = (transaction.description ? transaction.description + " | " : "") + rawValue; // Append if multiple description columns mapped
                            break;
                        case 'amount':
                            const parsedAmount = parseFloat(rawValue.replace(/[^0-9.-]+/g,"")); // Clean currency symbols etc.
                             if (isNaN(parsedAmount)) {
                                throw new Error(`Invalid amount format: ${rawValue}`);
                             }
                            // Handle debit/credit columns
                             if (header.toLowerCase().includes('debit') && parsedAmount > 0) {
                                transaction.amount = -parsedAmount;
                             } else if (header.toLowerCase().includes('credit') && parsedAmount < 0) {
                                transaction.amount = Math.abs(parsedAmount); // Ensure credit is positive
                             } else {
                                transaction.amount = parsedAmount;
                             }
                            break;
                        case 'modeOfPayment':
                            // Basic standardization
                             const lowerMode = rawValue.toLowerCase();
                             if (lowerMode.includes('cash')) transaction.modeOfPayment = 'Cash';
                             else if (lowerMode.includes('bank') || lowerMode.includes('transfer') || lowerMode.includes('wire')) transaction.modeOfPayment = 'Bank';
                             else if (lowerMode.includes('mpesa') || lowerMode.includes('mobile money')) transaction.modeOfPayment = 'Mpesa';
                             else transaction.modeOfPayment = 'Bank'; // Default guess if not mapped specifically
                            break;
                    }
                } catch (e: any) {
                     parseError += `Error in column '${header}' (${field}): ${e.message}. `;
                 }
            }

             // Fill missing required fields if possible or mark error
            if (!transaction.date) parseError += "Missing or invalid date. ";
            if (!transaction.description) transaction.description = "Imported Transaction"; // Default description
            if (transaction.amount === undefined || transaction.amount === null) parseError += "Missing or invalid amount. ";
            if (!transaction.modeOfPayment) transaction.modeOfPayment = 'Bank'; // Default if not mapped/parsed

             if (parseError) {
                 transaction.__parseError = parseError.trim();
                 transaction.__toBeImported = false; // Don't import rows with errors by default
             }


            return transaction as MappedTransaction; // Cast after processing
        });

        setMappedTransactions(mapped);
        setStage('preview');
    };


    // --- Stage 3: Preview & Reconciliation ---

     // Simple check for potential duplicates (can be enhanced)
     const findPotentialDuplicate = useCallback((incoming: MappedTransaction): TransactionWithId | undefined => {
        if (!incoming.date || incoming.amount === undefined) return undefined;

        const incomingTime = incoming.date.getTime();
        const amount = incoming.amount;
        const description = incoming.description?.toLowerCase() || '';

        // Check within a small date window (e.g., +/- 1 day) and for same amount
        const oneDay = 24 * 60 * 60 * 1000;

        return existingTransactions.find(existing => {
            const timeDiff = Math.abs(existing.date.getTime() - incomingTime);
            const amountMatch = existing.amount === amount;
             // Simple description check (could use fuzzy matching)
             const descMatch = description && existing.description.toLowerCase().includes(description.substring(0, 15)); // Match first 15 chars

             // Criteria: Same amount, within 1 day, similar description start
             return amountMatch && timeDiff <= oneDay && descMatch;
         });
     }, [existingTransactions]);

     // Add potential duplicate info to mapped transactions
     useEffect(() => {
         if (stage === 'preview') {
             setMappedTransactions(prev =>
                 prev.map(tx => ({
                     ...tx,
                     __duplicatePotential: tx.__parseError ? undefined : findPotentialDuplicate(tx),
                      // Optionally uncheck duplicates by default
                      // __toBeImported: tx.__parseError ? false : !findPotentialDuplicate(tx),
                 }))
             );
         }
     }, [stage, findPotentialDuplicate]);

     const toggleImportRow = (index: number) => {
        setMappedTransactions(prev => prev.map((tx, i) =>
            i === index ? { ...tx, __toBeImported: !tx.__toBeImported } : tx
        ));
     };


    // --- Stage 4: Reconciling (Actual Import) ---

    const handleConfirmImport = () => {
        setStage('reconciling');
        setImportError(null);

        const transactionsToImport = mappedTransactions
            .filter(tx => tx.__toBeImported && !tx.__parseError);

        if (transactionsToImport.length === 0) {
            setImportedCount(0);
            setSkippedCount(mappedTransactions.length);
            setStage('complete');
            toast({ title: "Import Complete", description: "No new transactions were imported.", variant: "default" });
            return;
        }

        const newTransactions: Omit<TransactionWithId, 'id'>[] = transactionsToImport.map(tx => ({
            date: tx.date!, // Assert non-null as errors are filtered
            description: tx.description!,
            amount: tx.amount!,
            modeOfPayment: tx.modeOfPayment!,
        }));

        // Simulate API call or batch processing
        // In a real app, this would likely be an async function
        try {
             // Using the context's batch import function which handles ID generation and state update
             // This returns the newly added transactions WITH IDs
            const addedTransactionsWithIds = importTransactionsBatch(newTransactions);

            setImportedCount(addedTransactionsWithIds.length);
            setSkippedCount(mappedTransactions.length - addedTransactionsWithIds.length);
            setLastImportedIds(addedTransactionsWithIds.map(tx => tx.id)); // Store IDs for rollback
            setStage('complete');
            toast({ title: "Import Successful", description: `${addedTransactionsWithIds.length} transactions imported.`, variant: "default" });

        } catch (error: any) {
            console.error("Import Failed:", error);
            setImportError(`Failed to save transactions: ${error.message}`);
            setStage('error');
            setLastImportedIds([]); // Clear rollback info on error
             toast({ title: "Import Failed", description: "Could not save imported transactions.", variant: "destructive" });
        }
    };

    // --- Stage 5: Complete & Rollback ---

    const handleRollback = () => {
        if (lastImportedIds.length === 0) return;

        // TODO: Implement rollback logic
        // This requires a way to batch-delete transactions by ID in the context
        console.warn("Rollback requested for IDs:", lastImportedIds);
        toast({ title: "Rollback Not Yet Implemented", description: "Functionality to undo the last import needs context support.", variant:"destructive" });
        // Example (if context had batch delete):
        // deleteTransactionsBatch(lastImportedIds);
        // setLastImportedIds([]);
        // setStage('preview'); // Go back to preview maybe? Or a new state?
    };

    // --- Reset ---

    const resetState = () => {
        setStage('upload');
        setFile(null);
        setFileName('');
        setIsParsing(false);
        setParsedHeaders([]);
        setParsedData([]);
        setColumnMapping({});
        setMappedTransactions([]);
        setImportError(null);
        setImportedCount(0);
        setSkippedCount(0);
        setLastImportedIds([]);
        // Reset file input visually
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    const handleBack = () => {
        if (stage === 'mapping') setStage('upload');
        else if (stage === 'preview') setStage('mapping');
         else if (stage === 'complete' || stage === 'error') resetState(); // Start over from complete/error
        setImportError(null); // Clear errors when navigating back
    };


    // --- Render Logic ---

    const renderUploadStage = () => (
        <Card>
            <CardHeader>
                <CardTitle>Import Transactions (Step 1/4)</CardTitle>
                <CardDescription>Select a CSV file containing your financial transactions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="file-upload">Choose CSV File</Label>
                    <Input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
                </div>
                {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
                {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
            </CardContent>
            <CardFooter className="flex justify-between">
                 <Button variant="outline" asChild>
                    <Link href="/transactions">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Transactions
                    </Link>
                 </Button>
                <Button onClick={handleParseFile} disabled={!file || isParsing}>
                     {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
                     {isParsing ? 'Parsing...' : 'Parse & Map Columns'}
                 </Button>
            </CardFooter>
        </Card>
    );

    const renderMappingStage = () => (
         <Card>
            <CardHeader>
                <CardTitle>Map Columns (Step 2/4)</CardTitle>
                <CardDescription>Match the columns from your CSV file ({fileName}) to the standard transaction fields. 'Mode of Payment' is optional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
                <ScrollArea className="h-[400px] w-full">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>CSV Column Header</TableHead>
                                <TableHead>Map to Transaction Field</TableHead>
                                <TableHead>Example Data</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedHeaders.map(header => (
                                <TableRow key={header}>
                                    <TableCell className="font-medium">{header}</TableCell>
                                    <TableCell>
                                         <Select value={columnMapping[header] || 'ignore'} onValueChange={(value) => handleMappingChange(header, value)}>
                                            <SelectTrigger className="w-[200px] h-8">
                                                <SelectValue placeholder="Select field..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    <SelectLabel>Transaction Fields</SelectLabel>
                                                    <SelectItem value="ignore">Ignore this column</SelectItem>
                                                    <SelectItem value="date">Date</SelectItem>
                                                    <SelectItem value="description">Description</SelectItem>
                                                    <SelectItem value="amount">Amount</SelectItem>
                                                    <SelectItem value="modeOfPayment">Mode of Payment</SelectItem>
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">
                                        {parsedData[0]?.[header] || 'N/A'} {/* Show first row example */}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
            <CardFooter className="flex justify-between">
                 <Button variant="outline" onClick={handleBack}>
                     <ArrowLeft className="mr-2 h-4 w-4" /> Back
                 </Button>
                 <Button onClick={proceedToPreview}>
                    <ListChecks className="mr-2 h-4 w-4" /> Preview & Reconcile
                 </Button>
            </CardFooter>
        </Card>
    );

     const renderPreviewStage = () => (
         <Card>
            <CardHeader>
                <CardTitle>Preview & Reconcile (Step 3/4)</CardTitle>
                <CardDescription>Review the parsed transactions. Uncheck rows you don't want to import. Potential duplicates are highlighted.</CardDescription>
             </CardHeader>
             <CardContent>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
                 <ScrollArea className="h-[500px] w-full">
                     <Table>
                         <TableHeader>
                             <TableRow>
                                <TableHead className="w-[50px]">Import?</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Amount (KES)</TableHead>
                                <TableHead>Mode</TableHead>
                                <TableHead>Status</TableHead>
                             </TableRow>
                         </TableHeader>
                         <TableBody>
                             {mappedTransactions.map((tx, index) => (
                                 <TableRow key={index} className={cn(tx.__parseError && "bg-destructive/10", tx.__duplicatePotential && !tx.__parseError && "bg-yellow-100 dark:bg-yellow-900/30")}>
                                    <TableCell className="text-center">
                                        <Input
                                            type="checkbox"
                                            checked={tx.__toBeImported}
                                            disabled={!!tx.__parseError}
                                            onChange={() => toggleImportRow(index)}
                                            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                         />
                                     </TableCell>
                                     <TableCell>{tx.date ? format(tx.date, 'PP') : <span className="text-destructive">Invalid</span>}</TableCell>
                                     <TableCell className="max-w-[250px] truncate">{tx.description}</TableCell>
                                     <TableCell className={`text-right font-mono ${tx.amount === undefined ? 'text-destructive' : (tx.amount >= 0 ? 'text-accent' : 'text-destructive')}`}>
                                         {tx.amount !== undefined ? formatCurrency(tx.amount) : 'Invalid'}
                                     </TableCell>
                                     <TableCell>{tx.modeOfPayment || <span className="text-muted-foreground">N/A</span>}</TableCell>
                                     <TableCell className="text-xs">
                                         {tx.__parseError ? <span className="text-destructive flex items-center gap-1"><XCircle size={14} /> Error</span> :
                                          tx.__duplicatePotential ? <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1"><AlertTriangle size={14} /> Potential Duplicate</span> :
                                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={14} /> Ready</span>}
                                        {tx.__parseError && <p className="text-destructive text-xs mt-1 max-w-[200px] truncate" title={tx.__parseError}>{tx.__parseError}</p>}
                                     </TableCell>
                                 </TableRow>
                             ))}
                         </TableBody>
                     </Table>
                 </ScrollArea>
             </CardContent>
             <CardFooter className="flex justify-between items-center">
                <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Mapping
                 </Button>
                 <div className='text-sm text-muted-foreground'>
                    {mappedTransactions.filter(tx => tx.__toBeImported && !tx.__parseError).length} rows selected for import.
                 </div>
                 <Button onClick={handleConfirmImport} disabled={mappedTransactions.filter(tx => tx.__toBeImported && !tx.__parseError).length === 0}>
                    <Upload className="mr-2 h-4 w-4" /> Confirm Import
                 </Button>
             </CardFooter>
         </Card>
     );

     const renderReconcilingStage = () => (
         <Card>
             <CardHeader>
                 <CardTitle>Importing Transactions...</CardTitle>
                 <CardDescription>Please wait while the selected transactions are being added.</CardDescription>
             </CardHeader>
             <CardContent className="flex justify-center items-center h-40">
                 <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </CardContent>
         </Card>
     );

      const renderCompleteStage = () => (
         <Card>
             <CardHeader>
                 <CardTitle className="flex items-center gap-2"><CheckCircle className="text-green-500" /> Import Complete</CardTitle>
                 <CardDescription>The import process has finished.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-2">
                 <p>Successfully imported: <span className="font-semibold">{importedCount}</span> transactions.</p>
                 <p>Skipped or excluded: <span className="font-semibold">{skippedCount}</span> rows.</p>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> Error during saving: {importError}</p>}
             </CardContent>
             <CardFooter className="flex justify-between">
                 <Button variant="outline" onClick={resetState}>
                    <Upload className="mr-2 h-4 w-4" /> Import Another File
                 </Button>
                 <div>
                     {/* <Button variant="destructive" onClick={handleRollback} disabled={lastImportedIds.length === 0}>
                         <RotateCcw className="mr-2 h-4 w-4" /> Rollback Last Import
                     </Button> */}
                     <Button asChild className="ml-2">
                         <Link href="/transactions">
                             View Transactions <ArrowLeft className="ml-2 h-4 w-4 rotate-180"/>
                         </Link>
                     </Button>
                 </div>
             </CardFooter>
         </Card>
     );

      const renderErrorStage = () => (
         <Card className="border-destructive">
             <CardHeader>
                 <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle /> Import Error</CardTitle>
                 <CardDescription>An error occurred during the import process.</CardDescription>
             </CardHeader>
             <CardContent>
                 <p className="text-destructive">{importError || "An unknown error occurred."}</p>
             </CardContent>
             <CardFooter className="flex justify-end gap-2">
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
            {stage === 'mapping' && renderMappingStage()}
            {stage === 'preview' && renderPreviewStage()}
            {stage === 'reconciling' && renderReconcilingStage()}
            {stage === 'complete' && renderCompleteStage()}
            {stage === 'error' && renderErrorStage()}
        </div>
    );
}

// Helper function for formatting currency (can be moved to utils)
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
};
