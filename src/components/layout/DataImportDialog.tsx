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
import { Upload, FileJson, CheckCircle, AlertTriangle, Loader2, GitMerge } from 'lucide-react';

// Import all store setters
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { useAuth } from '@/context/AuthContext';
import { saveOfflineSnapshot, clearOfflineMutations } from '@/lib/offlineQueue';
import { saveAllUserDataToFirestore } from '@/lib/firestoreBackend';

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
    const { userId, isGuest } = useAuth();
    const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [importStrategy, setImportStrategy] = useState<'merge' | 'overwrite'>('merge');

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
            logInfo("Starting data import process.", { userId, fileName: filePreview.fileName, strategy: importStrategy });
            const data = JSON.parse(filePreview.fileContent);

            let finalTransactions = [];
            let finalDebts = [];
            let finalInvestmentItems = [];
            let finalAssetItems = [];
            let finalOtherLiabilityItems = [];
            let finalBudgetItems = [];
            let finalOwnedReviews = {};
            let finalSharedReviews = {};
            let finalNotifications = [];
            let finalStartDate: Date | undefined = undefined;
            let finalEndDate: Date | undefined = undefined;

            if (importStrategy === 'merge') {
                // Merge strategy: Keep existing records, add or update imported ones by ID
                const existingTransactions = useTransactionsStore.getState().transactions || [];
                const importedTransactions = data.transactions || [];
                finalTransactions = [...existingTransactions];
                importedTransactions.forEach((imp: any) => {
                    const idx = finalTransactions.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalTransactions[idx] = imp;
                    } else {
                        finalTransactions.push(imp);
                    }
                });

                const existingDebts = useDebtStore.getState().debts || [];
                const importedDebts = data.debts || [];
                finalDebts = [...existingDebts];
                importedDebts.forEach((imp: any) => {
                    const idx = finalDebts.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalDebts[idx] = imp;
                    } else {
                        finalDebts.push(imp);
                    }
                });

                const existingInvestments = useInvestmentStore.getState().investmentItems || [];
                const importedInvestments = data.investmentItems || [];
                finalInvestmentItems = [...existingInvestments];
                importedInvestments.forEach((imp: any) => {
                    const idx = finalInvestmentItems.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalInvestmentItems[idx] = imp;
                    } else {
                        finalInvestmentItems.push(imp);
                    }
                });

                const existingAssets = useStatementStore.getState().assetItems || [];
                const importedAssets = data.assetItems || [];
                finalAssetItems = [...existingAssets];
                importedAssets.forEach((imp: any) => {
                    const idx = finalAssetItems.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalAssetItems[idx] = imp;
                    } else {
                        finalAssetItems.push(imp);
                    }
                });

                const existingLiabilities = useStatementStore.getState().otherLiabilityItems || [];
                const importedLiabilities = data.otherLiabilityItems || [];
                finalOtherLiabilityItems = [...existingLiabilities];
                importedLiabilities.forEach((imp: any) => {
                    const idx = finalOtherLiabilityItems.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalOtherLiabilityItems[idx] = imp;
                    } else {
                        finalOtherLiabilityItems.push(imp);
                    }
                });

                const existingBudgets = useBudgetStore.getState().budgetItems || [];
                const importedBudgets = data.budgetItems || [];
                finalBudgetItems = [...existingBudgets];
                importedBudgets.forEach((imp: any) => {
                    const idx = finalBudgetItems.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalBudgetItems[idx] = imp;
                    } else {
                        finalBudgetItems.push(imp);
                    }
                });

                const existingOwnedReviews = useWeeklyReviewStore.getState().ownedReviews || {};
                const importedOwnedReviews = data.ownedReviews || {};
                finalOwnedReviews = { ...existingOwnedReviews, ...importedOwnedReviews };

                const existingSharedReviews = useWeeklyReviewStore.getState().sharedReviews || {};
                const importedSharedReviews = data.sharedReviews || {};
                finalSharedReviews = { ...existingSharedReviews, ...importedSharedReviews };

                const existingNotifications = useNotificationStore.getState().notifications || [];
                const importedNotifications = data.notifications || [];
                finalNotifications = [...existingNotifications];
                importedNotifications.forEach((imp: any) => {
                    const idx = finalNotifications.findIndex((e) => e.id === imp.id);
                    if (idx > -1) {
                        finalNotifications[idx] = imp;
                    } else {
                        finalNotifications.push(imp);
                    }
                });

                finalStartDate = data.statementSettings?.startDate ? new Date(data.statementSettings.startDate) : useStatementStore.getState().startDate;
                finalEndDate = data.statementSettings?.endDate ? new Date(data.statementSettings.endDate) : useStatementStore.getState().endDate;
            } else {
                // Overwrite strategy: Replace all data
                finalTransactions = data.transactions || [];
                finalDebts = data.debts || [];
                finalInvestmentItems = data.investmentItems || [];
                finalAssetItems = data.assetItems || [];
                finalOtherLiabilityItems = data.otherLiabilityItems || [];
                finalBudgetItems = data.budgetItems || [];
                finalOwnedReviews = data.ownedReviews || {};
                finalSharedReviews = data.sharedReviews || {};
                finalNotifications = data.notifications || [];
                finalStartDate = data.statementSettings?.startDate ? new Date(data.statementSettings.startDate) : undefined;
                finalEndDate = data.statementSettings?.endDate ? new Date(data.statementSettings.endDate) : undefined;
            }

            // Ensure all imported and merged entities are stamped with the active user's identity
            const effectiveUserId = userId || 'anonymous_or_server';
            const isGuestOrAnonymous = isGuest || !userId || userId.startsWith('guest_') || userId.startsWith('usr_local_') || userId === 'anonymous_or_server';

            finalTransactions = finalTransactions.map((tx: any) => ({ ...tx, userId: effectiveUserId }));
            finalDebts = finalDebts.map((d: any) => ({ ...d, userId: effectiveUserId }));
            finalInvestmentItems = finalInvestmentItems.map((inv: any) => ({ ...inv, userId: effectiveUserId }));
            finalAssetItems = finalAssetItems.map((a: any) => ({ ...a, userId: effectiveUserId }));
            finalOtherLiabilityItems = finalOtherLiabilityItems.map((l: any) => ({ ...l, userId: effectiveUserId }));
            finalBudgetItems = finalBudgetItems.map((b: any) => ({ ...b, userId: effectiveUserId }));

            // Update local Zustand stores
            setTransactions(finalTransactions);
            setDebts(finalDebts);
            setInvestmentItems(finalInvestmentItems);
            setAssetItems(finalAssetItems);
            setOtherLiabilityItems(finalOtherLiabilityItems);
            setBudgetItems(finalBudgetItems);
            setOwnedReviews(finalOwnedReviews);
            setSharedReviews(finalSharedReviews);
            setNotifications(finalNotifications);
            setStartDate(finalStartDate);
            setEndDate(finalEndDate);

            // Re-acknowledge imported/merged debts
            finalDebts.forEach((debt: any) => acknowledgeDebtChange(debt.id));

            // 1. Save offline snapshot locally to prevent loss on refresh
            const fullSnapshot = {
                transactions: finalTransactions,
                debts: finalDebts,
                investmentItems: finalInvestmentItems,
                assetItems: finalAssetItems,
                otherLiabilityItems: finalOtherLiabilityItems,
                budgetItems: finalBudgetItems,
                ownedReviews: finalOwnedReviews,
                sharedReviews: finalSharedReviews,
                notifications: finalNotifications,
                startDate: finalStartDate?.toISOString(),
                endDate: finalEndDate?.toISOString(),
            };
            saveOfflineSnapshot(effectiveUserId, fullSnapshot);

            // 2. Stream directly and solely to Cloud Firestore only if user has a verified authenticated cloud account
            if (userId && !isGuestOrAnonymous) {
                try {
                    logInfo("Streaming imported data directly and solely to Cloud Firestore.", { userId });
                    
                    await saveAllUserDataToFirestore(userId, {
                        transactions: finalTransactions,
                        debts: finalDebts,
                        investmentItems: finalInvestmentItems,
                        assetItems: finalAssetItems,
                        otherLiabilityItems: finalOtherLiabilityItems,
                        budgetItems: finalBudgetItems,
                        weeklyReviews: finalOwnedReviews,
                        notifications: finalNotifications,
                        startDate: finalStartDate?.toISOString() || undefined,
                        endDate: finalEndDate?.toISOString() || undefined,
                    });
                    
                    // Clear pending offline mutations only after verified successful cloud save
                    clearOfflineMutations(userId);
                    logInfo("Imported data successfully streamed and saved directly to Cloud Firestore.", { userId });
                } catch (fsErr: any) {
                    logError("Failed to stream imported data directly to Firestore", fsErr, { userId });
                    toast({
                        title: "Cloud Sync Failed - Offline Data Preserved",
                        description: `We could not sync the imported data to Cloud Firestore (Error: ${fsErr.message || "Unknown error"}). Your imported data is cached locally, but to prevent data loss your outstanding offline queue has been kept intact. Please check your internet connection.`,
                        variant: "destructive",
                    });
                    throw fsErr;
                }
            }
            
            toast({
                title: "Import Successful",
                description: importStrategy === 'merge' 
                    ? `Your application data has been merged successfully and ${isGuestOrAnonymous ? 'cached in your local workspace' : 'synchronized with the cloud'}.`
                    : `Your application data has been replaced and ${isGuestOrAnonymous ? 'saved locally' : 'synchronized with the cloud'}.`,
            });
            logInfo("Data import process completed successfully.", { userId });
            onClose();
            // Reload page now that persistence and local snapshot caching are complete
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" /> Import Application Data
                    </DialogTitle>
                    <DialogDescription>
                        Select a JSON file previously exported from this application to import into your account.
                    </DialogDescription>
                </DialogHeader>

                {importStrategy === 'merge' ? (
                    <Alert className="border-blue-500/30 bg-blue-500/5 text-blue-800 dark:text-blue-300">
                        <GitMerge className="h-4 w-4 text-blue-500" />
                        <AlertTitle>Merge Mode Active</AlertTitle>
                        <AlertDescription>
                            Imported items will be merged with your current local and server data. No records will be deleted.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Warning!</AlertTitle>
                        <AlertDescription>
                            This action will completely **replace all existing data** on both your device and cloud server. Any un-exported data will be lost.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="import-file-upload" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">JSON File</Label>
                        <Input id="import-file-upload" type="file" accept=".json,application/json" onChange={handleFileChange} disabled={isProcessing} />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Import Method</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setImportStrategy('merge')}
                                className={`flex flex-col items-start text-left p-3 rounded-lg border-2 transition-all ${
                                    importStrategy === 'merge'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-muted-foreground/20 bg-card'
                                }`}
                            >
                                <span className="font-semibold text-sm flex items-center gap-1.5">
                                    <GitMerge className="h-3.5 w-3.5 text-primary" /> Merge
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">
                                    Combine file items with existing data.
                                </span>
                            </button>
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setImportStrategy('overwrite')}
                                className={`flex flex-col items-start text-left p-3 rounded-lg border-2 transition-all ${
                                    importStrategy === 'overwrite'
                                        ? 'border-destructive bg-destructive/5'
                                        : 'border-border hover:border-muted-foreground/20 bg-card'
                                }`}
                            >
                                <span className="font-semibold text-sm flex items-center gap-1.5 text-destructive">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Replace
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">
                                    Wipe current data and overwrite completely.
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {filePreview && (
                    <div className="text-sm border p-3 rounded-md bg-muted/30">
                        <p className="font-semibold flex items-center gap-2">
                            <FileJson className="h-4 w-4 text-muted-foreground" /> {filePreview.fileName} ({ (filePreview.size / 1024).toFixed(2) } KB)
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

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
                    <Button 
                        onClick={handleConfirmImport} 
                        variant={importStrategy === 'overwrite' ? 'destructive' : 'default'}
                        disabled={!filePreview || filePreview.hasErrors || isProcessing}
                    >
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        {isProcessing ? "Importing..." : "Confirm & Import"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DataImportDialog;

