
// src/app/(dashboard)/debt/import/page.tsx
'use client';

import React, { useState, type ChangeEvent, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileCheck, RotateCcw, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Loader2, ListChecks, Coins } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebtStore } from '@/store/debtStore'; // Import useDebtStore hook
import type { DebtItem } from '@/lib/types'; // Import DebtItem type
import Papa, { type ParseResult } from 'papaparse'; // CSV parsing library
import Link from 'next/link'; // For back button
import { cn } from '@/lib/utils'; // For conditional classes

// Possible CSV headers and their corresponding DebtItem fields
const POSSIBLE_HEADERS: { [key: string]: keyof DebtItem | 'ignore' } = {
  description: 'description',
  'debt name': 'description',
  principal: 'principal',
  'balance (kes)': 'principal',
  'amount (kes)': 'principal',
  'outstanding balance': 'principal',
  'interest rate (%)': 'interestRate',
  'rate (%)': 'interestRate',
  'annual rate': 'interestRate',
  'minimum payment (kes)': 'minPayment',
  'min payment (kes)': 'minPayment',
  'monthly payment': 'minPayment',
  term: 'term', // e.g., "short", "long"
  'loan term': 'term',
  'debt type': 'term',
};

// Expected DebtItem fields for mapping
const DEBT_FIELDS: (keyof DebtItem)[] = ['description', 'principal', 'interestRate', 'minPayment', 'term'];

// Define states for the import process
type ImportStage = 'upload' | 'mapping' | 'preview' | 'reconciling' | 'complete' | 'error';

interface ParsedRow extends Record<string, string> {
  __originalIndex: number; // Keep track of original row for potential errors
}

// MappedDebtItem structure for preview and processing
interface MappedDebtItem extends Omit<DebtItem, 'id'> {
    id?: string; // Might match existing during reconciliation (less common for debt)
    __originalData: ParsedRow;
    __parseError?: string;
    __duplicatePotential?: DebtItem; // Potential match found (based on description?)
    __toBeImported: boolean; // Flag to control import
}

// Helper function for formatting currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

// Helper function to format percentages
const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

// Helper function to format term
const formatTerm = (value: string | undefined) => {
    if (!value) return <span className="text-muted-foreground italic">N/A</span>;
    // Capitalize first letter
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ImportDebtsPage() {
    // Use Zustand store hook for debt state management
    const { debts: existingDebts, addDebt, importDebtsBatch } = useDebtStore();
    const { toast } = useToast();

    // Local state remains the same
    const [stage, setStage] = useState<ImportStage>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [isParsing, setIsParsing] = useState(false);
    const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
    const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, keyof DebtItem | 'ignore'>>({});
    const [mappedDebts, setMappedDebts] = useState<MappedDebtItem[]>([]);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedCount, setImportedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);
    const [lastImportedIds, setLastImportedIds] = useState<string[]>([]); // For potential rollback (if implemented)

    // --- Stage 1: Upload (remains the same) ---

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
          resetState();
          return;
        }
        if (!selectedFile.name.toLowerCase().endsWith('.csv') && !selectedFile.type.includes('csv')) {
            toast({ title: "Invalid File Type", description: "Please select a CSV file.", variant: "destructive" });
            resetState();
            return;
        }
        setFile(selectedFile);
        setFileName(selectedFile.name);
        setStage('upload');
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
                setIsParsing(false);
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
                autoMapColumns(headers);
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
        const initialMapping: Record<string, keyof DebtItem | 'ignore'> = {};
        headers.forEach(header => {
            const lowerHeader = header.toLowerCase().trim();
            let mappedField: keyof DebtItem | 'ignore' = 'ignore';
            // Try direct match first
            if (POSSIBLE_HEADERS[lowerHeader]) {
                mappedField = POSSIBLE_HEADERS[lowerHeader];
            } else {
                 // Try partial matches
                 for (const possibleKey in POSSIBLE_HEADERS) {
                     if (lowerHeader.includes(possibleKey) && POSSIBLE_HEADERS[possibleKey] !== 'ignore') {
                        mappedField = POSSIBLE_HEADERS[possibleKey];
                        break;
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
            [header]: value as keyof DebtItem | 'ignore'
        }));
    };

    const validateMapping = (): boolean => {
        const mappedFields = Object.values(columnMapping);
        // Check if essential fields are mapped
        const hasDescription = mappedFields.includes('description');
        const hasPrincipal = mappedFields.includes('principal');
        const hasInterestRate = mappedFields.includes('interestRate');
        const hasMinPayment = mappedFields.includes('minPayment');
        const hasTerm = mappedFields.includes('term');

        if (!hasDescription || !hasPrincipal || !hasInterestRate || !hasMinPayment || !hasTerm) {
             setImportError("Please map columns for Description, Principal, Interest Rate (%), Min Payment, and Term.");
             toast({ title: "Mapping Incomplete", description: "All debt fields are required for import.", variant: "destructive" });
             return false;
        }
         // Check for duplicate mapping (excluding 'ignore')
        const assignedFields = mappedFields.filter(f => f !== 'ignore');
        if (new Set(assignedFields).size !== assignedFields.length) {
             setImportError("Each debt field (Description, Principal, etc.) can only be mapped once.");
             toast({ title: "Duplicate Mapping", description: "A debt field is mapped to multiple columns.", variant: "destructive" });
             return false;
         }

        setImportError(null);
        return true;
    };

    const proceedToPreview = () => {
        if (!validateMapping()) return;

        const mapped: MappedDebtItem[] = parsedData.map((row) => {
            const debtItem: Partial<MappedDebtItem> = {
                __originalData: row,
                __toBeImported: true,
                description: '',
                principal: 0,
                interestRate: 0,
                minPayment: 0,
                term: 'long', // Default term
            };
            let parseError = '';

            for (const header in columnMapping) {
                const field = columnMapping[header];
                const rawValue = row[header]?.trim();

                if (field === 'ignore' || rawValue === undefined || rawValue === '') continue;

                try {
                    switch (field) {
                        case 'description':
                            debtItem.description = (debtItem.description ? debtItem.description + " | " : "") + rawValue;
                            break;
                        case 'principal':
                        case 'minPayment':
                             const cleanedAmount = rawValue.replace(/,/g, '').replace(/[^-0-9.]/g, '');
                             const parsedAmount = parseFloat(cleanedAmount);
                             if (isNaN(parsedAmount)) {
                                throw new Error(`Invalid ${field} format: ${rawValue}`);
                             }
                            debtItem[field] = parsedAmount;
                            break;
                        case 'interestRate':
                             const cleanedRate = rawValue.replace(/%/g, ''); // Remove percentage sign
                             const parsedRate = parseFloat(cleanedRate);
                             if (isNaN(parsedRate)) {
                                throw new Error(`Invalid interest rate format: ${rawValue}`);
                             }
                            debtItem.interestRate = parsedRate; // Store as number (e.g., 12.5)
                            break;
                        case 'term':
                            const lowerTerm = rawValue.toLowerCase();
                             if (lowerTerm.includes('short')) debtItem.term = 'short';
                             else if (lowerTerm.includes('long')) debtItem.term = 'long';
                             else {
                                // Optionally add more robust term parsing or throw error
                                // For now, default to 'long' or throw error if strict
                                parseError += `Unrecognized term '${rawValue}'. Defaulting to long. `;
                                debtItem.term = 'long';
                             }
                            break;
                    }
                } catch (e: any) {
                     parseError += `Error in column '${header}' ('${field}'): ${e.message}. `;
                 }
            }

            // Final validation checks
            if (!debtItem.description) parseError += "Missing description. ";
            if (debtItem.principal === undefined || isNaN(debtItem.principal)) parseError += "Missing or invalid principal. ";
            if (debtItem.interestRate === undefined || isNaN(debtItem.interestRate)) parseError += "Missing or invalid interest rate. ";
            if (debtItem.minPayment === undefined || isNaN(debtItem.minPayment)) parseError += "Missing or invalid minimum payment. ";
            if (!debtItem.term) parseError += "Missing or invalid term. ";


             if (parseError) {
                 debtItem.__parseError = parseError.trim();
                 debtItem.__toBeImported = false;
             }

            return debtItem as MappedDebtItem; // Assert type after processing
        });

        setMappedDebts(mapped);
        setStage('preview');
    };


    // --- Stage 3: Preview & Reconciliation (remains the same) ---

     // Simple duplicate check based on description (case-insensitive)
     const findPotentialDuplicate = useCallback((incoming: MappedDebtItem): DebtItem | undefined => {
        if (!incoming.description) return undefined;
        const description = incoming.description?.toLowerCase() || '';
        return existingDebts.find(existing => existing.description.toLowerCase() === description);
     }, [existingDebts]);

     // Add potential duplicate info when entering preview stage
     useEffect(() => {
         if (stage === 'preview' && mappedDebts.length > 0) {
             setMappedDebts(prev =>
                 prev.map(debt => {
                     const duplicate = debt.__parseError ? undefined : findPotentialDuplicate(debt);
                     return {
                         ...debt,
                         __duplicatePotential: duplicate,
                         __toBeImported: debt.__parseError ? false : !duplicate && debt.__toBeImported,
                     };
                 })
             );
         }
         // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [stage]);

     const toggleImportRow = (index: number) => {
        setMappedDebts(prev => prev.map((debt, i) =>
            i === index ? { ...debt, __toBeImported: !debt.__toBeImported } : debt
        ));
     };


    // --- Stage 4: Reconciling (Actual Import) ---

    const handleConfirmImport = () => {
        setStage('reconciling');
        setImportError(null);

        const debtsToImport = mappedDebts
            .filter(debt => debt.__toBeImported && !debt.__parseError);

        const currentSkippedCount = mappedDebts.length - debtsToImport.length;
        setSkippedCount(currentSkippedCount); // Set skipped count immediately

        if (debtsToImport.length === 0) {
            setImportedCount(0);
            setStage('complete');
            toast({ title: "Import Complete", description: `No new debts were imported. ${currentSkippedCount} rows skipped.`, variant: "default" });
            return;
        }

        // Prepare data for the store function
        const newDebtData: Omit<DebtItem, 'id'>[] = debtsToImport.map(debt => ({
            description: debt.description!,
            principal: debt.principal!,
            interestRate: debt.interestRate!,
            minPayment: debt.minPayment!,
            term: debt.term!,
        }));

        try {
            // Use the Zustand store's batch import function
             const addedDebtsWithIds = importDebtsBatch(newDebtData);

             // Use the actual length of the returned array for imported count
             const actualImportedCount = addedDebtsWithIds.length;
             setImportedCount(actualImportedCount);
             setLastImportedIds(addedDebtsWithIds.map(d => d.id));

            setStage('complete');
            toast({
                title: "Import Successful",
                // Use the calculated counts in the toast message
                description: `${actualImportedCount} debts imported. ${currentSkippedCount} rows skipped.`,
                variant: "default"
            });

        } catch (error: any) {
            console.error("Import Failed:", error);
            setImportError(`Failed to save debts: ${error.message}`);
            setStage('error');
            setLastImportedIds([]);
             toast({ title: "Import Failed", description: "Could not save imported debts.", variant: "destructive" });
        }
    };

    // --- Stage 5: Complete & Rollback (remains the same, rollback not implemented) ---

    const handleRollback = () => {
        // Rollback logic requires a batch delete function in the context
        console.warn("Rollback requested for IDs:", lastImportedIds, " - Not implemented in Debt store yet.");
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
        setMappedDebts([]);
        setImportError(null);
        setImportedCount(0);
        setSkippedCount(0);
        setLastImportedIds([]);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    const handleBack = () => {
        if (stage === 'mapping') setStage('upload');
        else if (stage === 'preview') setStage('mapping');
         else if (stage === 'complete' || stage === 'error') resetState();
        setImportError(null);
    };


    // --- Render Logic (remains the same structure) ---

    const renderUploadStage = () => (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />Import Debts (Step 1/4)</CardTitle>
                <CardDescription>Select a CSV file containing your debt information.</CardDescription>
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
                    <Link href="/debt">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Debts
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
                 <CardDescription>Match columns from '{fileName}' to debt fields. All fields are required.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
                <ScrollArea className="h-[400px] w-full">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>CSV Column Header</TableHead>
                                <TableHead>Map to Debt Field</TableHead>
                                <TableHead>Example Data (First Row)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedHeaders.map(header => (
                                <TableRow key={header}>
                                    <TableCell className="font-medium max-w-[200px] truncate" title={header}>{header}</TableCell>
                                    <TableCell>
                                         <Select value={columnMapping[header] || 'ignore'} onValueChange={(value) => handleMappingChange(header, value)}>
                                            <SelectTrigger className="w-[200px] h-8"> {/* Increased width */}
                                                <SelectValue placeholder="Select field..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    <SelectLabel>Debt Fields</SelectLabel>
                                                    <SelectItem value="ignore">Ignore this column</SelectItem>
                                                    <SelectItem value="description">Description</SelectItem>
                                                    <SelectItem value="principal">Principal (KES)</SelectItem>
                                                    <SelectItem value="interestRate">Interest Rate (%)</SelectItem>
                                                    <SelectItem value="minPayment">Min Payment (KES)</SelectItem>
                                                    <SelectItem value="term">Term (short/long)</SelectItem>
                                                 </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]" title={parsedData[0]?.[header]}>
                                        {parsedData[0]?.[header] || <span className='italic'>empty</span>}
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
                 <CardDescription>Review parsed debts. Uncheck rows to exclude. Potential duplicates (same description) are highlighted. Rows with errors cannot be imported.</CardDescription>
             </CardHeader>
             <CardContent>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
                 <ScrollArea className="h-[500px] w-full">
                     <Table>
                         <TableHeader>
                             <TableRow>
                                <TableHead className="w-[50px]">Import?</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Principal (KES)</TableHead>
                                <TableHead>Interest Rate</TableHead>
                                <TableHead>Min Payment (KES)</TableHead>
                                <TableHead>Term</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                         </TableHeader>
                         <TableBody>
                             {mappedDebts.map((debt, index) => (
                                 <TableRow
                                    key={index}
                                    className={cn(
                                        debt.__parseError && "bg-destructive/10 text-destructive",
                                        debt.__duplicatePotential && !debt.__parseError && "bg-yellow-100 dark:bg-yellow-900/30"
                                    )}
                                    title={debt.__parseError ? debt.__parseError : debt.__duplicatePotential ? `Potential duplicate of: ${debt.__duplicatePotential.description} (${formatCurrency(debt.__duplicatePotential.principal)})` : undefined}
                                    >
                                    <TableCell className="text-center">
                                        <Input
                                            type="checkbox"
                                            aria-label={`Select row ${index + 1} for import`}
                                            checked={debt.__toBeImported}
                                            disabled={!!debt.__parseError}
                                            onChange={() => toggleImportRow(index)}
                                            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                         />
                                     </TableCell>
                                     <TableCell className="max-w-[200px] truncate">{debt.description}</TableCell>
                                     <TableCell className={`text-right font-mono ${debt.principal === undefined || isNaN(debt.principal) ? 'text-destructive italic' : ''}`}>
                                        {debt.principal !== undefined && !isNaN(debt.principal) ? formatCurrency(debt.principal) : 'Invalid'}
                                     </TableCell>
                                     <TableCell className={`text-right font-mono ${debt.interestRate === undefined || isNaN(debt.interestRate) ? 'text-destructive italic' : ''}`}>
                                        {debt.interestRate !== undefined && !isNaN(debt.interestRate) ? formatPercentage(debt.interestRate) : 'Invalid'}
                                     </TableCell>
                                      <TableCell className={`text-right font-mono ${debt.minPayment === undefined || isNaN(debt.minPayment) ? 'text-destructive italic' : ''}`}>
                                        {debt.minPayment !== undefined && !isNaN(debt.minPayment) ? formatCurrency(debt.minPayment) : 'Invalid'}
                                     </TableCell>
                                     <TableCell className="capitalize">{formatTerm(debt.term)}</TableCell>
                                     <TableCell className="text-xs">
                                         {debt.__parseError ? <span className="flex items-center gap-1 text-destructive"><XCircle size={14} /> Error</span> :
                                          debt.__duplicatePotential ? <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400"><AlertTriangle size={14} /> Duplicate?</span> :
                                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle size={14} /> Ready</span>}
                                     </TableCell>
                                 </TableRow>
                             ))}
                               {mappedDebts.length === 0 && (
                                    <TableRow>
                                         <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                                             No debts parsed or preview available.
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
                    {mappedDebts.filter(debt => debt.__toBeImported && !debt.__parseError).length} of {mappedDebts.length} rows selected for import.
                 </div>
                 <Button onClick={handleConfirmImport} disabled={mappedDebts.filter(debt => debt.__toBeImported && !debt.__parseError).length === 0}>
                    <Upload className="mr-2 h-4 w-4" /> Confirm Import
                 </Button>
             </CardFooter>
         </Card>
     );

     const renderReconcilingStage = () => (
         <Card>
             <CardHeader>
                 <CardTitle>Importing Debts...</CardTitle>
                 <CardDescription>Please wait while the selected debts are being added.</CardDescription>
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
                 <CardDescription>The debt import process has finished.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-2">
                 <p>Successfully imported: <span className="font-semibold">{importedCount}</span> debts.</p>
                 <p>Skipped or excluded: <span className="font-semibold">{skippedCount}</span> rows (including errors and potential duplicates).</p>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> Error during saving: {importError}</p>}
             </CardContent>
             <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
                 <Button variant="outline" onClick={resetState}>
                    <Upload className="mr-2 h-4 w-4" /> Import Another File
                 </Button>
                 <div className="flex gap-2">
                      {/* Rollback button can be added here if implemented */}
                     {/* {lastImportedIds.length > 0 && (
                         <Button variant="destructive" onClick={handleRollback} >
                             <RotateCcw className="mr-2 h-4 w-4" /> Rollback Last Import
                         </Button>
                     )} */}
                     <Button asChild>
                         <Link href="/debt">
                             View Debts <ArrowLeft className="ml-2 h-4 w-4 rotate-180"/>
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
                 <CardDescription>An error occurred during the debt import process.</CardDescription>
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
