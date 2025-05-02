
'use client';

import React, { useState, type ChangeEvent, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileCheck, RotateCcw, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Loader2, ListChecks } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types'; // Import new types
import Papa, { type ParseResult } from 'papaparse'; // CSV parsing library
import Link from 'next/link'; // For back button
import { format } from 'date-fns'; // For date formatting
import { cn } from '@/lib/utils'; // For conditional classes

// Possible CSV headers and their corresponding Transaction fields
// Added frequency and variability
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
  mode: 'modeOfPayment', // Added shorter 'mode'
  type: 'ignore', // Often transaction type, less useful than description/amount
  category: 'ignore', // Let user categorize later if needed
  balance: 'ignore',
  'transaction id': 'ignore', // Bank's ID, not ours
  frequency: 'frequency', // Added frequency
  recurrence: 'frequency', // Added frequency alias
  variability: 'variability', // Added variability
  'fixed/variable': 'variability', // Added variability alias
};

// Expected Transaction fields for mapping - Added frequency and variability
const TRANSACTION_FIELDS: (keyof TransactionWithId)[] = ['date', 'description', 'amount', 'modeOfPayment', 'frequency', 'variability'];

// Define states for the import process
type ImportStage = 'upload' | 'mapping' | 'preview' | 'reconciling' | 'complete' | 'error';

interface ParsedRow extends Record<string, string> {
  __originalIndex: number; // Keep track of original row for potential errors
}

// Added optional frequency and variability
interface MappedTransaction extends Omit<TransactionWithId, 'id' | 'date'> {
    id?: string; // Might match existing during reconciliation
    date: Date | null; // Date might fail parsing
    frequency?: TransactionFrequency; // Added frequency
    variability?: TransactionVariability; // Added variability
    __originalData: ParsedRow;
    __parseError?: string;
    __duplicatePotential?: TransactionWithId; // Potential match found
    __toBeImported: boolean; // Flag to control import
}

// Helper function for formatting currency (can be moved to utils)
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
};

// Helper function to format categories nicely
const formatCategory = (value: string | undefined) => {
    if (!value) return <span className="text-muted-foreground italic">N/A</span>;
    // Capitalize first letter
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ImportTransactionsPage() {
    // Use Zustand store hook for transaction state management
    const { transactions: existingTransactions, importTransactionsBatch } = useTransactionsStore();
    const { toast } = useToast();

    // Local state remains the same
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
    const [lastImportedIds, setLastImportedIds] = useState<string[]>([]); // For potential rollback

    // --- Stage 1: Upload (remains the same) ---

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
          resetState();
          return;
        }
        // Basic validation for CSV type (can be expanded)
        if (!selectedFile.name.toLowerCase().endsWith('.csv') && !selectedFile.type.includes('csv')) {
            toast({ title: "Invalid File Type", description: "Please select a CSV file.", variant: "destructive" });
            resetState(); // Reset if invalid file type
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
                setIsParsing(false); // Stop parsing indicator regardless of outcome
                if (results.errors.length > 0) {
                    console.error("CSV Parsing Errors:", results.errors);
                    setImportError(`Error parsing CSV: ${results.errors[0].message}. Check file format.`);
                    setStage('error');
                    return;
                }
                if (!results.data.length || !results.meta.fields?.length) {
                     setImportError("CSV is empty or has no headers.");
                     setStage('error');
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
            },
            error: (error: Error) => {
                console.error("CSV Parsing Failed:", error);
                setImportError(`Failed to parse file: ${error.message}`);
                setStage('error');
                setIsParsing(false);
            }
        });
    };

    // --- Stage 2: Mapping (remains the same) ---

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
                     // Check if lowerHeader includes the possible key, AND ensure the mapped value is not 'ignore'
                     if (lowerHeader.includes(possibleKey) && POSSIBLE_HEADERS[possibleKey] !== 'ignore') {
                        mappedField = POSSIBLE_HEADERS[possibleKey];
                        break; // Take the first partial match that isn't 'ignore'
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
        // Check if Date, Description, and Amount are mapped
        const hasDate = mappedFields.includes('date');
        const hasDescription = mappedFields.includes('description');
        const hasAmount = mappedFields.includes('amount');

        if (!hasDate || !hasDescription || !hasAmount) {
             setImportError("Please map columns for Date, Description, and Amount.");
             toast({ title: "Mapping Incomplete", description: "Date, Description, and Amount fields are required.", variant: "destructive" });
             return false;
        }
         // Check for duplicate mapping (excluding 'ignore')
        const assignedFields = mappedFields.filter(f => f !== 'ignore');
        if (new Set(assignedFields).size !== assignedFields.length) {
             setImportError("Each transaction field (Date, Description, Amount, etc.) can only be mapped once.");
             toast({ title: "Duplicate Mapping", description: "A transaction field is mapped to multiple columns.", variant: "destructive" });
             return false;
         }

        setImportError(null);
        return true;
    };

    const proceedToPreview = () => {
        if (!validateMapping()) return;

        const mapped: MappedTransaction[] = parsedData.map((row) => {
            const transaction: Partial<MappedTransaction> & { amount?: number } = { // Initialize amount explicitly
                __originalData: row,
                __toBeImported: true, // Default to import
                date: null, // Initialize date as null
                description: '', // Initialize description
                amount: undefined, // Initialize amount as undefined
                modeOfPayment: 'Bank', // Default mode of payment
                frequency: undefined, // Default frequency
                variability: undefined, // Default variability
            };
            let parseError = '';

            for (const header in columnMapping) {
                const field = columnMapping[header];
                const rawValue = row[header]?.trim();

                if (field === 'ignore' || rawValue === undefined || rawValue === '') continue; // Skip ignored, undefined or empty values


                try {
                    switch (field) {
                        case 'date':
                             // Try common date formats, add more as needed
                            const dateFormats = [
                                "yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy", "yyyyMMdd",
                                "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss", "MM/dd/yyyy HH:mm:ss"
                            ];
                            let parsedDate = null;
                            // Attempt to parse common date structures first
                            parsedDate = new Date(rawValue);
                             if (isNaN(parsedDate.getTime())) {
                                // Add more specific parsing logic if needed (using date-fns parse maybe)
                                throw new Error(`Invalid date format: ${rawValue}`);
                             }
                            transaction.date = parsedDate;
                            break;
                        case 'description':
                            transaction.description = (transaction.description ? transaction.description + " | " : "") + rawValue; // Append if multiple description columns mapped
                            break;
                        case 'amount':
                             // Improved cleaning: handle commas, currency symbols (KES, $ etc.), parenthesis for negatives
                             let cleanedValue = rawValue.replace(/,/g, '').replace(/[^-0-9.]/g, '');
                             // Check for parenthesis indicating negative number
                             if (rawValue.startsWith('(') && rawValue.endsWith(')')) {
                                cleanedValue = '-' + cleanedValue;
                             }

                            const parsedAmount = parseFloat(cleanedValue);
                             if (isNaN(parsedAmount)) {
                                throw new Error(`Invalid amount format: ${rawValue}`);
                             }
                            // Handle potential debit/credit column mapping overrides
                             const lowerHeader = header.toLowerCase();
                             if (lowerHeader.includes('debit') && parsedAmount > 0) {
                                transaction.amount = -parsedAmount;
                             } else if (lowerHeader.includes('credit') && parsedAmount < 0) {
                                transaction.amount = Math.abs(parsedAmount); // Ensure credit is positive
                             } else {
                                // Only assign if transaction.amount is still undefined, or if the current column IS the primary 'amount' column
                                if (transaction.amount === undefined || POSSIBLE_HEADERS[lowerHeader] === 'amount') {
                                    transaction.amount = parsedAmount;
                                }
                             }
                            break;
                        case 'modeOfPayment':
                            // Basic standardization
                             const lowerMode = rawValue.toLowerCase();
                             if (lowerMode.includes('cash')) transaction.modeOfPayment = 'Cash';
                             else if (lowerMode.includes('bank') || lowerMode.includes('transfer') || lowerMode.includes('wire') || lowerMode.includes('eft')) transaction.modeOfPayment = 'Bank';
                             else if (lowerMode.includes('mpesa') || lowerMode.includes('mobile money') || lowerMode.includes('m-pesa')) transaction.modeOfPayment = 'Mpesa';
                             // else keep the default 'Bank'
                            break;
                         case 'frequency':
                             const lowerFreq = rawValue.toLowerCase();
                             if (lowerFreq.includes('recur') || lowerFreq.includes('monthly') || lowerFreq.includes('annual')) transaction.frequency = 'recurring';
                             else if (lowerFreq.includes('one') || lowerFreq.includes('single')) transaction.frequency = 'one-time';
                             // else remains undefined
                            break;
                         case 'variability':
                             const lowerVar = rawValue.toLowerCase();
                             if (lowerVar.includes('fix') || lowerVar.includes('constant')) transaction.variability = 'fixed';
                             else if (lowerVar.includes('var') || lowerVar.includes('fluctuat')) transaction.variability = 'variable';
                              // else remains undefined
                            break;
                    }
                } catch (e: any) {
                     parseError += `Error in column '${header}' ('${field}'): ${e.message}. `;
                 }
            }

             // Final checks and setting errors/defaults
            if (!transaction.date || isNaN(transaction.date.getTime())) parseError += "Missing or invalid date. ";
            if (!transaction.description) transaction.description = "Imported Transaction"; // Default description if empty
            if (transaction.amount === undefined || transaction.amount === null || isNaN(transaction.amount)) parseError += "Missing or invalid amount. ";
            // modeOfPayment has a default, so no check needed

             if (parseError) {
                 transaction.__parseError = parseError.trim();
                 transaction.__toBeImported = false; // Don't import rows with errors by default
             }

            // Add the amount back to the main object structure expected by MappedTransaction
            const finalTransaction: MappedTransaction = {
                ...transaction,
                amount: transaction.amount ?? 0, // Default to 0 if amount is still undefined (should be caught by error check though)
                date: transaction.date, // Keep date possibly null if invalid
                modeOfPayment: transaction.modeOfPayment!, // Assert non-null due to default
                frequency: transaction.frequency, // Keep potentially undefined
                variability: transaction.variability, // Keep potentially undefined
            };

            return finalTransaction;
        });

        setMappedTransactions(mapped);
        setStage('preview');
    };


    // --- Stage 3: Preview & Reconciliation (remains the same) ---

     // Simple check for potential duplicates (can be enhanced)
     const findPotentialDuplicate = useCallback((incoming: MappedTransaction): TransactionWithId | undefined => {
        if (!incoming.date || incoming.amount === undefined || !incoming.description) return undefined;

        const incomingTime = incoming.date.getTime();
        const amount = incoming.amount;
        const description = incoming.description?.toLowerCase() || '';

        // Check within a small date window (e.g., +/- 1 day) and for same amount
        const oneDay = 24 * 60 * 60 * 1000;

        return existingTransactions.find(existing => {
             const existingDate = existing.date instanceof Date ? existing.date : new Date(existing.date);
             if (isNaN(existingDate.getTime())) return false; // Skip existing transactions with invalid dates

            const timeDiff = Math.abs(existingDate.getTime() - incomingTime);
            const amountMatch = existing.amount === amount;
             // Simple description check (first 15 chars, case-insensitive)
             const descMatch = description && existing.description.toLowerCase().startsWith(description.substring(0, 15));

             // Criteria: Same amount, within 1 day, similar description start
             return amountMatch && timeDiff <= oneDay && descMatch;
         });
     }, [existingTransactions]);

     // Add potential duplicate info to mapped transactions when entering preview stage
     useEffect(() => {
         if (stage === 'preview' && mappedTransactions.length > 0) { // Ensure we have transactions to process
             setMappedTransactions(prev =>
                 prev.map(tx => {
                     const duplicate = tx.__parseError ? undefined : findPotentialDuplicate(tx);
                     return {
                         ...tx,
                         __duplicatePotential: duplicate,
                         // Uncheck duplicates by default, keep unchecked if parse error
                         __toBeImported: tx.__parseError ? false : !duplicate && tx.__toBeImported,
                     };
                 })
             );
         }
         // Intentionally exclude findPotentialDuplicate from dependencies to avoid re-running on every render
         // We only want this effect to run when the stage changes to 'preview' or mappedTransactions data initially loads
        // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [stage]);

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

        const currentSkippedCount = mappedTransactions.length - transactionsToImport.length;
        setSkippedCount(currentSkippedCount); // Set skipped count before import

        if (transactionsToImport.length === 0) {
            setImportedCount(0);
            setStage('complete');
            toast({ title: "Import Complete", description: "No new transactions were marked for import.", variant: "default" });
            return;
        }

        // Include frequency and variability in the data sent for import
        const newTransactions: Omit<TransactionWithId, 'id'>[] = transactionsToImport.map(tx => ({
            date: tx.date!, // Assert non-null as errors/null dates are filtered
            description: tx.description!,
            amount: tx.amount!,
            modeOfPayment: tx.modeOfPayment!,
            frequency: tx.frequency, // Pass frequency
            variability: tx.variability, // Pass variability
        }));


        try {
            // Use the Zustand store's batch import function
            const addedTransactionsWithIds = importTransactionsBatch(newTransactions);

            setImportedCount(addedTransactionsWithIds.length);
            // skippedCount is already set above
            setLastImportedIds(addedTransactionsWithIds.map(tx => tx.id)); // Store IDs for potential rollback
            setStage('complete');
            toast({ title: "Import Successful", description: `${addedTransactionsWithIds.length} transactions imported. ${skippedCount} rows skipped.`, variant: "default" }); // Use calculated counts in toast

        } catch (error: any) {
            console.error("Import Failed:", error);
            setImportError(`Failed to save transactions: ${error.message}`);
            setStage('error');
            setLastImportedIds([]); // Clear rollback info on error
             toast({ title: "Import Failed", description: "Could not save imported transactions.", variant: "destructive" });
        }
    };

    // --- Stage 5: Complete & Rollback (remains the same, rollback not implemented) ---

    const handleRollback = () => {
        if (lastImportedIds.length === 0) return;

        // TODO: Implement rollback logic using context if available
        // Example: deleteTransactionsBatch(lastImportedIds);
        // For now, just show a message and potentially revert state visually if needed
        console.warn("Rollback requested for IDs:", lastImportedIds, " - Not implemented in store yet.");
        toast({ title: "Rollback Not Implemented", description: "Functionality to undo the last import requires store support.", variant:"destructive" });

    };

    // --- Reset (remains the same) ---

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


    // --- Render Logic (remains the same structure) ---

    const renderUploadStage = () => (
        <Card>
            <CardHeader>
                <CardTitle>Import Transactions (Step 1/4)</CardTitle>
                <CardDescription>Select a CSV file containing your financial transactions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="file-upload">Choose CSV File</Label>
                    <Input id="file-upload" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
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
                 {/* Updated description to include frequency/variability */}
                 <CardDescription>Match columns from '{fileName}' to transaction fields. Date, Description, Amount are required. Others are optional.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
                <ScrollArea className="h-[400px] w-full">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>CSV Column Header</TableHead>
                                <TableHead>Map to Transaction Field</TableHead>
                                <TableHead>Example Data (First Row)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedHeaders.map(header => (
                                <TableRow key={header}>
                                    <TableCell className="font-medium max-w-[200px] truncate" title={header}>{header}</TableCell>
                                    <TableCell>
                                         <Select value={columnMapping[header] || 'ignore'} onValueChange={(value) => handleMappingChange(header, value)}>
                                            <SelectTrigger className="w-[180px] h-8">
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
                                                     {/* Added options for frequency and variability */}
                                                     <SelectItem value="frequency">Frequency</SelectItem>
                                                     <SelectItem value="variability">Variability</SelectItem>
                                                 </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]" title={parsedData[0]?.[header]}>
                                        {parsedData[0]?.[header] || <span className='italic'>empty</span>} {/* Show first row example */}
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
                 <CardDescription>Review parsed transactions. Uncheck rows to exclude. Potential duplicates are highlighted yellow. Rows with errors (red) cannot be imported.</CardDescription>
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
                                 {/* Added headers for frequency and variability */}
                                 <TableHead>Frequency</TableHead>
                                 <TableHead>Variability</TableHead>
                                 <TableHead>Status</TableHead>
                              </TableRow>
                         </TableHeader>
                         <TableBody>
                             {mappedTransactions.map((tx, index) => (
                                 <TableRow
                                    key={index}
                                    className={cn(
                                        tx.__parseError && "bg-destructive/10 text-destructive",
                                        tx.__duplicatePotential && !tx.__parseError && "bg-yellow-100 dark:bg-yellow-900/30"
                                    )}
                                    title={tx.__parseError ? tx.__parseError : tx.__duplicatePotential ? `Potential duplicate of: ${format(tx.__duplicatePotential.date, 'PP')} - ${tx.__duplicatePotential.description} (${formatCurrency(tx.__duplicatePotential.amount)})` : undefined}
                                    >
                                    <TableCell className="text-center">
                                        <Input
                                            type="checkbox"
                                            aria-label={`Select row ${index + 1} for import`}
                                            checked={tx.__toBeImported}
                                            disabled={!!tx.__parseError} // Disable checkbox if there's a parse error
                                            onChange={() => toggleImportRow(index)}
                                            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                         />
                                     </TableCell>
                                     <TableCell>{tx.date ? format(tx.date, 'PP') : <span className="text-destructive italic">Invalid Date</span>}</TableCell>
                                     <TableCell className="max-w-[250px] truncate">{tx.description}</TableCell>
                                     <TableCell className={`text-right font-mono ${tx.amount === undefined || tx.amount === null || isNaN(tx.amount) ? 'text-destructive italic' : (tx.amount >= 0 ? 'text-accent' : 'text-destructive-foreground dark:text-destructive')}`}>
                                         {tx.amount !== undefined && tx.amount !== null && !isNaN(tx.amount) ? formatCurrency(tx.amount) : 'Invalid Amt'}
                                     </TableCell>
                                     <TableCell>{tx.modeOfPayment || <span className="text-muted-foreground italic">N/A</span>}</TableCell>
                                      {/* Display parsed frequency and variability */}
                                      <TableCell className="text-xs">{formatCategory(tx.frequency)}</TableCell>
                                      <TableCell className="text-xs">{formatCategory(tx.variability)}</TableCell>
                                      <TableCell className="text-xs">
                                         {tx.__parseError ? <span className="flex items-center gap-1 text-destructive"><XCircle size={14} /> Error</span> :
                                          tx.__duplicatePotential ? <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400"><AlertTriangle size={14} /> Duplicate?</span> :
                                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle size={14} /> Ready</span>}
                                     </TableCell>
                                 </TableRow>
                             ))}
                               {mappedTransactions.length === 0 && (
                                    <TableRow>
                                         {/* Adjust colspan for new columns */}
                                         <TableCell colSpan={8} className="text-center text-muted-foreground h-24">
                                             No transactions parsed or preview available.
                                        </TableCell>
                                    </TableRow>
                                )}
                         </TableBody>
                     </Table>
                 </ScrollArea>
             </CardContent>
             <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2">
                <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Mapping
                 </Button>
                 <div className='text-sm text-muted-foreground text-center sm:text-left'>
                    {mappedTransactions.filter(tx => tx.__toBeImported && !tx.__parseError).length} of {mappedTransactions.length} rows selected for import.
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
                 <p>Skipped or excluded: <span className="font-semibold">{skippedCount}</span> rows (including errors and potential duplicates).</p>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> Error during saving: {importError}</p>}
             </CardContent>
             <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
                 <Button variant="outline" onClick={resetState}>
                    <Upload className="mr-2 h-4 w-4" /> Import Another File
                 </Button>
                 <div className="flex gap-2">
                      {/* Conditionally render Rollback button */}
                     {/* {lastImportedIds.length > 0 && (
                         <Button variant="destructive" onClick={handleRollback} >
                             <RotateCcw className="mr-2 h-4 w-4" /> Rollback Last Import
                         </Button>
                     )} */}
                     <Button asChild>
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
                 <CardDescription>An error occurred. Please check the file or mappings.</CardDescription>
             </CardHeader>
             <CardContent>
                 <p className="text-destructive font-medium">{importError || "An unknown error occurred."}</p>
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

