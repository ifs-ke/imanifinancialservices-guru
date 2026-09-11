// src/components/layout/DataImportDialog.tsx
'use client';

import React, { useState, type ChangeEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileJson, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

// Import all store setters
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { logError, logInfo } from '@/lib/logger';
import { useAuth } from '@/context/AuthContext';

interface DataImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FilePreview {
    fileName: string;
    size: number;
    transactionCount: number;
    debtCount: number;
    investmentCount: number;
    budgetItemCount: number;
    hasErrors: boolean;
    fileContent: string;
}

const DataImportDialog: React.FC<DataImportDialogProps> = ({ isOpen, onClose }) => {
    const { toast } = useToast();
    const { userId } = useAuth();
    const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Get all store setters
    const { setTransactions } = useTransactionsStore();
    const { setDebts, acknowledgeDebtChange } = useDebtStore();
    const { setInvestmentItems } = useInvestmentStore();
    const { setAssetItems, setOtherLiabilityItems, setStartDate, setEndDate } = useStatementStore();
    const { setBudgetItems } = useBudgetStore();
    const { setOwnedReviews, setSharedReviews } = useWeeklyReviewStore();
    const { setNotifications } = useNotificationStore();

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            setFilePreview(null);
            return;
        }

        if (!file.name.toLowerCase().endsWith('.json') || file.type !== 'application/json') {
            toast({
                title: "Invalid File Type",
                description: "Please select a valid JSON file exported from this application.",
                variant: "destructive"
            });
            setFilePreview(null);
            return;
        }

        setIsProcessing(true);
        try {
            const fileContent = await file.text();
            const data = JSON.parse(fileContent);

            // Basic validation
            const hasTransactions = Array.isArray(data.transactions);
            const hasDebts = Array.isArray(data.debts);
            if (!hasTransactions || !hasDebts) {
                throw new Error("File does not appear to be a valid export.");
            }

            setFilePreview({
                fileName: file.name,
                size: file.size,
                transactionCount: data.transactions?.length || 0,
                debtCount: data.debts?.length || 0,
                investmentCount: data.investmentItems?.length || 0,
                budgetItemCount: data.budgetItems?.length || 0,
                hasErrors: false,
                fileContent: fileContent,
            });

        } catch (error: any) {
            logError("Failed to parse import file", error, { userId });
            setFilePreview({
                fileName: file.name,
                size: file.size,
                transactionCount: 0,
                debtCount: 0,
                investmentCount: 0,
                budgetItemCount: 0,
                hasErrors: true,
                fileContent: '',
            });
            toast({
                title: "File Read Error",
                description: `Could not parse the file. Ensure it is a valid JSON export. Error: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!filePreview || filePreview.hasErrors || !filePreview.fileContent) {
            toast({ title: "Cannot Import", description: "Please select a valid file first.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        try {
            logInfo("Starting data import process.", { userId, fileName: filePreview.fileName });
            const data = JSON.parse(filePreview.fileContent);

            // Set data for each store
            setTransactions(data.transactions || []);
            setDebts(data.debts || []);
            setInvestmentItems(data.investmentItems || []);
            setAssetItems(data.assetItems || []);
            setOtherLiabilityItems(data.otherLiabilityItems || []);
            setBudgetItems(data.budgetItems || []);
            setOwnedReviews(data.ownedReviews || {});
            setSharedReviews(data.sharedReviews || {});
            setNotifications(data.notifications || []);
            
            // Handle dates and special cases
            const startDate = data.statementSettings?.startDate ? new Date(data.statementSettings.startDate) : undefined;
            const endDate = data.statementSettings?.endDate ? new Date(data.statementSettings.endDate) : undefined;
            setStartDate(startDate);
            setEndDate(endDate);

            // Re-acknowledge all imported debts
            if (data.debts) {
                data.debts.forEach((debt: any) => acknowledgeDebtChange(debt.id));
            }
            
            toast({
                title: "Import Successful",
                description: "Your application data has been replaced with the imported file.",
            });
            logInfo("Data import process completed successfully.", { userId });
            onClose();
            // Force a page reload to ensure all components re-render with fresh store data
            window.location.reload();

        } catch (error: any) {
            logError("Error during import confirmation", error, { userId });
            toast({
                title: "Import Failed",
                description: `An error occurred while importing data: ${error.message}`,
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Reset state when dialog closes
    React.useEffect(() => {
        if (!isOpen) {
            setFilePreview(null);
            setIsProcessing(false);
            const fileInput = document.getElementById('import-file-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" /> Import Application Data
                    </DialogTitle>
                    <DialogDescription>
                        Select a JSON file previously exported from this application to replace all current data.
                    </DialogDescription>
                </DialogHeader>

                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning!</AlertTitle>
                    <AlertDescription>
                        This action is irreversible and will **replace all existing data** in your current browser session with the contents of the file.
                    </AlertDescription>
                </Alert>

                <div className="space-y-3 py-4">
                    <Label htmlFor="import-file-upload">JSON File</Label>
                    <Input id="import-file-upload" type="file" accept=".json,application/json" onChange={handleFileChange} disabled={isProcessing} />
                </div>

                {filePreview && (
                    <div className="text-sm border p-3 rounded-md">
                        <p className="font-semibold flex items-center gap-2">
                            <FileJson className="h-4 w-4" /> {filePreview.fileName} ({ (filePreview.size / 1024).toFixed(2) } KB)
                        </p>
                        {filePreview.hasErrors ? (
                            <p className="text-destructive mt-2">File could not be parsed. Please check format.</p>
                        ) : (
                            <ul className="text-muted-foreground mt-2 list-disc pl-5 text-xs">
                                <li>Transactions: {filePreview.transactionCount}</li>
                                <li>Debts: {filePreview.debtCount}</li>
                                <li>Investments: {filePreview.investmentCount}</li>
                                <li>Budget Items: {filePreview.budgetItemCount}</li>
                            </ul>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
                    <Button onClick={handleConfirmImport} disabled={!filePreview || filePreview.hasErrors || isProcessing}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        {isProcessing ? "Importing..." : "Confirm & Import Data"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DataImportDialog;
