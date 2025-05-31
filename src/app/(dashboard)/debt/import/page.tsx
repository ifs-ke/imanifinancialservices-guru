
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
import { useDebtStore } from '@/store/debtStore';
import type { DebtItem } from '@/lib/types';
import Papa, { type ParseResult } from 'papaparse';
import Link from 'next/link';
import { cn } from '@/lib/utils';

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
  term: 'term', 
  'loan term': 'term',
  'debt type': 'term',
};

const DEBT_FIELDS: (keyof DebtItem)[] = ['description', 'principal', 'interestRate', 'minPayment', 'term'];

type ImportStage = 'upload' | 'mapping' | 'preview' | 'reconciling' | 'complete' | 'error';

interface ParsedRow extends Record<string, string> {
  __originalIndex: number;
}

interface MappedDebtItem extends Omit<DebtItem, 'id'> {
    id?: string; 
    __originalData: ParsedRow;
    __parseError?: string;
    __duplicatePotential?: DebtItem;
    __toBeImported: boolean;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

const formatTerm = (value: string | undefined) => {
    if (!value) return <span className="text-muted-foreground italic">N/A</span>;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ImportDebtsPage() {
    const { debts: existingDebts, importDebtsBatch } = useDebtStore();
    const { toast } = useToast();

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
    const [lastImportedIds, setLastImportedIds] = useState<string[]>([]); 

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

    const autoMapColumns = (headers: string[]) => {
        const initialMapping: Record<string, keyof DebtItem | 'ignore'> = {};
        headers.forEach(header => {
            const lowerHeader = header.toLowerCase().trim();
            let mappedField: keyof DebtItem | 'ignore' = 'ignore';
            if (POSSIBLE_HEADERS[lowerHeader]) {
                mappedField = POSSIBLE_HEADERS[lowerHeader];
            } else {
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
                __originalData: row, __toBeImported: true, description: '', principal: 0, interestRate: 0, minPayment: 0, term: 'long',
            };
            let parseError = '';
            for (const header in columnMapping) {
                const field = columnMapping[header];
                const rawValue = row[header]?.trim();
                if (field === 'ignore' || rawValue === undefined || rawValue === '') continue;
                try {
                    switch (field) {
                        case 'description': debtItem.description = (debtItem.description ? debtItem.description + " | " : "") + rawValue; break;
                        case 'principal': case 'minPayment':
                             const cleanedAmount = rawValue.replace(/,/g, '').replace(/[^-0-9.]/g, '');
                             const parsedAmount = parseFloat(cleanedAmount);
                             if (isNaN(parsedAmount)) throw new Error(`Invalid ${field} format: ${rawValue}`);
                            debtItem[field] = parsedAmount; break;
                        case 'interestRate':
                             const cleanedRate = rawValue.replace(/%/g, '');
                             const parsedRate = parseFloat(cleanedRate);
                             if (isNaN(parsedRate)) throw new Error(`Invalid interest rate format: ${rawValue}`);
                            debtItem.interestRate = parsedRate; break;
                        case 'term':
                            const lowerTerm = rawValue.toLowerCase();
                             if (lowerTerm.includes('short')) debtItem.term = 'short';
                             else if (lowerTerm.includes('long')) debtItem.term = 'long';
                             else { parseError += `Unrecognized term '${rawValue}'. Defaulting to long. `; debtItem.term = 'long';}
                            break;
                    }
                } catch (e: any) { parseError += `Error in column '${header}' ('${field}'): ${e.message}. `; }
            }
            if (!debtItem.description) parseError += "Missing description. ";
            if (debtItem.principal === undefined || isNaN(debtItem.principal)) parseError += "Missing or invalid principal. ";
            if (debtItem.interestRate === undefined || isNaN(debtItem.interestRate)) parseError += "Missing or invalid interest rate. ";
            if (debtItem.minPayment === undefined || isNaN(debtItem.minPayment)) parseError += "Missing or invalid minimum payment. ";
            if (!debtItem.term) parseError += "Missing or invalid term. ";
             if (parseError) { debtItem.__parseError = parseError.trim(); debtItem.__toBeImported = false; }
            return debtItem as MappedDebtItem;
        });
        setMappedDebts(mapped);
        setStage('preview');
    };

     const findPotentialDuplicate = useCallback((incoming: MappedDebtItem): DebtItem | undefined => {
        if (!incoming.description) return undefined;
        const description = incoming.description?.toLowerCase() || '';
        return existingDebts.find(existing => existing.description.toLowerCase() === description);
     }, [existingDebts]);

     useEffect(() => {
         if (stage === 'preview' && mappedDebts.length > 0) {
             setMappedDebts(prev =>
                 prev.map(debt => {
                     const duplicate = debt.__parseError ? undefined : findPotentialDuplicate(debt);
                     return { ...debt, __duplicatePotential: duplicate, __toBeImported: debt.__parseError ? false : !duplicate && debt.__toBeImported, };
                 })
             );
         }
     }, [stage, findPotentialDuplicate, mappedDebts.length]); // Add mappedDebts.length as dep

     const toggleImportRow = (index: number) => {
        setMappedDebts(prev => prev.map((debt, i) =>
            i === index ? { ...debt, __toBeImported: !debt.__toBeImported } : debt
        ));
     };

    const handleConfirmImport = () => {
        setStage('reconciling');
        setImportError(null);
        const debtsToImport = mappedDebts.filter(debt => debt.__toBeImported && !debt.__parseError);
        const currentSkippedCount = mappedDebts.length - debtsToImport.length;
        setSkippedCount(currentSkippedCount);
        if (debtsToImport.length === 0) {
            setImportedCount(0);
            setStage('complete');
            toast({ title: "Import Complete", description: `No new debts were imported. ${currentSkippedCount} rows skipped.`, variant: "default" });
            return;
        }
        const newDebtData: Omit<DebtItem, 'id'>[] = debtsToImport.map(debt => ({
            description: debt.description!, principal: debt.principal!, interestRate: debt.interestRate!, minPayment: debt.minPayment!, term: debt.term!,
        }));
        try {
             const addedDebtsWithIds = importDebtsBatch(newDebtData);
             const actualImportedCount = addedDebtsWithIds.length;
             setImportedCount(actualImportedCount);
             setLastImportedIds(addedDebtsWithIds.map(d => d.id));
            setStage('complete');
            toast({ title: "Import Successful", description: `${actualImportedCount} debts imported. ${currentSkippedCount} rows skipped.`, variant: "default" });
        } catch (error: any) {
            console.error("Import Failed:", error);
            setImportError(`Failed to save debts: ${error.message}`);
            setStage('error');
            setLastImportedIds([]);
             toast({ title: "Import Failed", description: "Could not save imported debts.", variant: "destructive" });
        }
    };

    const handleRollback = () => {
        console.warn("Rollback requested for IDs:", lastImportedIds, " - Not implemented in Debt store yet.");
        toast({ title: "Rollback Not Implemented", description: "Functionality to undo the last import requires store support.", variant:"destructive" });
    };

    const resetState = () => {
        setStage('upload'); setFile(null); setFileName(''); setIsParsing(false); setParsedHeaders([]); setParsedData([]); setColumnMapping({});
        setMappedDebts([]); setImportError(null); setImportedCount(0); setSkippedCount(0); setLastImportedIds([]);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    const handleBack = () => {
        if (stage === 'mapping') setStage('upload');
        else if (stage === 'preview') setStage('mapping');
         else if (stage === 'complete' || stage === 'error') resetState();
        setImportError(null);
    };

    const renderUploadStage = () => (
        <Card>
            <CardHeader className="p-6">
                <CardTitle className="text-lg flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />Import Debts (Step 1/4)</CardTitle>
                <CardDescription>Select a CSV file containing your debt information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="file-upload">Choose CSV File</Label>
                    <Input id="file-upload" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
                </div>
                {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
                {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> {importError}</p>}
            </CardContent>
            <CardFooter className="flex justify-between p-6">
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
            <CardHeader className="p-6">
                <CardTitle className="text-lg">Map Columns (Step 2/4)</CardTitle>
                 <CardDescription>Match columns from '{fileName}' to debt fields. All fields are required.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4 p-0">
                {importError && <p className="text-sm text-destructive flex items-center gap-1 px-6 pb-4"><AlertTriangle size={14} /> {importError}</p>}
                <ScrollArea className="h-[400px] w-full">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6 pr-3">CSV Column Header</TableHead>
                                <TableHead className="px-3">Map to Debt Field</TableHead>
                                <TableHead className="pr-6 pl-3">Example Data (First Row)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parsedHeaders.map(header => (
                                <TableRow key={header}>
                                    <TableCell className="font-medium max-w-[200px] truncate pl-6 pr-3" title={header}>{header}</TableCell>
                                    <TableCell className="px-3">
                                         <Select value={columnMapping[header] || 'ignore'} onValueChange={(value) => handleMappingChange(header, value)}>
                                            <SelectTrigger className="w-[200px] h-8">
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
                                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px] pr-6 pl-3" title={parsedData[0]?.[header]}>
                                        {parsedData[0]?.[header] || <span className='italic'>empty</span>}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
            <CardFooter className="flex justify-between p-6">
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
            <CardHeader className="p-6">
                <CardTitle className="text-lg">Preview & Reconcile (Step 3/4)</CardTitle>
                 <CardDescription>Review parsed debts. Uncheck rows to exclude. Potential duplicates (same description) are highlighted. Rows with errors cannot be imported.</CardDescription>
             </CardHeader>
             <CardContent className="p-0">
                 {importError && <p className="text-sm text-destructive flex items-center gap-1 px-6 pb-4"><AlertTriangle size={14} /> {importError}</p>}
                 <ScrollArea className="h-[500px] w-full">
                     <Table>
                         <TableHeader>
                             <TableRow>
                                <TableHead className="w-[50px] pl-6 pr-3">Import?</TableHead>
                                <TableHead className="px-3">Description</TableHead>
                                <TableHead className="px-3">Principal (KES)</TableHead>
                                <TableHead className="px-3">Interest Rate</TableHead>
                                <TableHead className="px-3">Min Payment (KES)</TableHead>
                                <TableHead className="px-3">Term</TableHead>
                                <TableHead className="pr-6 pl-3">Status</TableHead>
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
                                    <TableCell className="text-center pl-6 pr-3">
                                        <Input
                                            type="checkbox"
                                            aria-label={`Select row ${index + 1} for import`}
                                            checked={debt.__toBeImported}
                                            disabled={!!debt.__parseError}
                                            onChange={() => toggleImportRow(index)}
                                            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                         />
                                     </TableCell>
                                     <TableCell className="max-w-[200px] truncate px-3">{debt.description}</TableCell>
                                     <TableCell className={`text-right font-mono px-3 ${debt.principal === undefined || isNaN(debt.principal) ? 'text-destructive italic' : ''}`}>
                                        {debt.principal !== undefined && !isNaN(debt.principal) ? formatCurrency(debt.principal) : 'Invalid'}
                                     </TableCell>
                                     <TableCell className={`text-right font-mono px-3 ${debt.interestRate === undefined || isNaN(debt.interestRate) ? 'text-destructive italic' : ''}`}>
                                        {debt.interestRate !== undefined && !isNaN(debt.interestRate) ? formatPercentage(debt.interestRate) : 'Invalid'}
                                     </TableCell>
                                      <TableCell className={`text-right font-mono px-3 ${debt.minPayment === undefined || isNaN(debt.minPayment) ? 'text-destructive italic' : ''}`}>
                                        {debt.minPayment !== undefined && !isNaN(debt.minPayment) ? formatCurrency(debt.minPayment) : 'Invalid'}
                                     </TableCell>
                                     <TableCell className="capitalize px-3">{formatTerm(debt.term)}</TableCell>
                                     <TableCell className="text-xs pr-6 pl-3">
                                         {debt.__parseError ? <span className="flex items-center gap-1 text-destructive"><XCircle size={14} /> Error</span> :
                                          debt.__duplicatePotential ? <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400"><AlertTriangle size={14} /> Duplicate?</span> :
                                          <span className="flex items-center gap-1 text-accent"><CheckCircle size={14} /> Ready</span>}
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
             <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 p-6">
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
             <CardHeader className="p-6">
                 <CardTitle className="text-lg">Importing Debts...</CardTitle>
                 <CardDescription>Please wait while the selected debts are being added.</CardDescription>
             </CardHeader>
             <CardContent className="flex justify-center items-center h-40 p-6">
                 <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </CardContent>
         </Card>
     );

      const renderCompleteStage = () => (
         <Card>
             <CardHeader className="p-6">
                 <CardTitle className="text-lg flex items-center gap-2"><CheckCircle className="text-accent" /> Import Complete</CardTitle>
                 <CardDescription>The debt import process has finished.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-2 p-6">
                 <p>Successfully imported: <span className="font-semibold">{importedCount}</span> debts.</p>
                 <p>Skipped or excluded: <span className="font-semibold">{skippedCount}</span> rows (including errors and potential duplicates).</p>
                 {importError && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> Error during saving: {importError}</p>}
             </CardContent>
             <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 p-6">
                 <Button variant="outline" onClick={resetState}>
                    <Upload className="mr-2 h-4 w-4" /> Import Another File
                 </Button>
                 <div className="flex gap-2">
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
             <CardHeader className="p-6">
                 <CardTitle className="text-lg flex items-center gap-2 text-destructive"><AlertTriangle /> Import Error</CardTitle>
                 <CardDescription>An error occurred during the debt import process.</CardDescription>
             </CardHeader>
             <CardContent className="p-6">
                 <p className="text-destructive font-medium">{importError || "An unknown error occurred."}</p>
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
            {stage === 'mapping' && renderMappingStage()}
            {stage === 'preview' && renderPreviewStage()}
            {stage === 'reconciling' && renderReconcilingStage()}
            {stage === 'complete' && renderCompleteStage()}
            {stage === 'error' && renderErrorStage()}
        </div>
    );
}
