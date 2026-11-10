
// src/app/(dashboard)/admin/connection-test/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useStatementStore } from '@/store/statementStore';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore } from '@/store/budgetStore';
import { getOfflineMutations } from '@/lib/offlineQueue';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { hashData, verifyHash } from '@/lib/storage-utils';
import {
  checkDatabaseConnection,
  saveTestData,
  fetchTestData,
  getHashForServerComparison,
  getHashForServerPreparedObject,
  createMultipleTestEntries,
  readAllTestEntries,
  updateSingleTestEntry,
  deleteSingleTestEntry,
  deleteAllUserTestEntries,
  getClerkUserInfo,
  verifyFirebaseAuthSyncAction,
  verifyClientDataHashAction,
  simulateSaveWithPotentialMismatchAction,
  performComprehensiveSaveTest,
} from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import {
    TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save,
    Download, HashIcon, Server, Timer, Info, Eye, Copy as CopyIcon,
    Database, UserCircle2, ShieldCheck, ShieldAlert, FileSignature,
    Loader2, Settings, Layers, Users, Lock, Smartphone, UploadCloud, DownloadCloud, Activity
} from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog'; // Import the dialog
import { useUser, useAuth } from "@/context/AuthContext";
import { useSyncManager } from '@/hooks/useSyncManager';
import { RefreshCw } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import type { TransactionWithId, DebtItem, BudgetItem } from '@/lib/types'; // For test data

// Helper for section headers
const SectionHeader: React.FC<{ title: string; description?: string; icon?: React.ElementType }> = ({ title, description, icon: IconComponent }) => (
  <div className="my-8 first:mt-0 md:col-span-2">
    <div className="flex items-center gap-3 mb-2">
      {IconComponent && <IconComponent className="h-6 w-6 text-primary" />}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    </div>
    {description && <p className="text-sm text-muted-foreground">{description}</p>}
    <Separator className="mt-3" />
  </div>
);


interface DetailViewerProps {
  title: string;
  content: string | object;
  isOpen: boolean;
  onClose: () => void;
}

const DetailViewerDialog: React.FC<DetailViewerProps> = ({ title, content, isOpen, onClose }) => {
  const { toast } = useToast();
  const displayContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      toast({ title: "Copied to clipboard!", description: `${title} content copied.` });
    } catch (err) {
      toast({ title: "Copy Failed", description: "Could not copy content to clipboard.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Detailed view of {typeof content === 'string' ? 'text' : 'object'} content
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full pr-4">
            <pre className="text-xs p-4 bg-muted rounded-md">
              {displayContent}
            </pre>
          </ScrollArea>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCopyToClipboard}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Copy to Clipboard
          </Button>
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TestStepLogs: React.FC<{ logs?: string[] }> = ({ logs }) => {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5 animate-in fade-in duration-200">
      <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Step-by-Step Execution Logs
        </span>
        <span className="text-[10px] font-mono lowercase">({logs.length} events)</span>
      </div>
      <ScrollArea className="h-[130px] w-full border rounded-xl p-3 bg-muted/30 text-xs text-left">
        <div className="space-y-1 font-mono text-[11px] leading-relaxed">
          {logs.map((log, i) => {
            const isError = log.includes('❌');
            const isSuccess = log.includes('✓');
            return (
              <p 
                key={i} 
                className={
                  isError 
                    ? 'text-destructive font-semibold' 
                    : isSuccess 
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold' 
                      : 'text-muted-foreground'
                }
              >
                {log}
              </p>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// Define distinct SyncDataInput structures for each hashing test
const STRING_TEST_SYNC_DATA_INPUT = {
  transactions: [{ id: 'tx_str_1', date: new Date(2023, 0, 15, 10, 0, 0).toISOString(), description: 'String Test Transaction Alpha', amount: 100.50, modeOfPayment: 'Cash' } as TransactionWithId],
  gettingStartedDismissed: true,
  startDate: new Date(2023,0,1).toISOString(),
};

const OBJECT_TEST_SYNC_DATA_INPUT = {
  debts: [{ id: 'd_obj_1', description: 'Object Test Debt Bravo', principal: 2500.75, interestRate: 7.5, minPayment: 120, term: 'long' } as DebtItem],
  gettingStartedDismissed: false,
  endDate: new Date(2023,11,31).toISOString(),
};

const INTEGRITY_TEST_INITIAL_SYNC_DATA_INPUT = {
  budgetItems: [{ id: 'b_int_1', description: 'Integrity Test Budget Charlie', amount: 300.00, category: 'goal', period: '2023-02' } as BudgetItem],
  startDate: new Date(2023, 1, 1).toISOString(),
  endDate: new Date(2023, 1, 28).toISOString(),
};


const AdminConnectionTestPage: React.FC = () => {
  const { toast } = useToast();
  const { startDate, setStartDate, isHydrated: isStatementStoreHydrated } = useStatementStore();
  const { isSignedIn: isClientUserSignedIn, user: clientClerkUser, isLoaded: isClientClerkLoaded } = useUser();
  const { role, isLoaded: isAuthLoaded } = useAuth();

  if (!isAuthLoaded || !isClientClerkLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] w-full">
        <Activity className="h-8 w-8 text-primary animate-pulse" />
        <span className="mt-2.5 text-xs text-muted-foreground font-medium font-sans">Checking authorization...</span>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] p-4 text-center w-full animate-in fade-in duration-300">
        <Card className="max-w-md w-full border border-border/40 bg-card/60 backdrop-blur-xs shadow-md rounded-2xl p-6 space-y-6">
          <div className="flex flex-col items-center space-y-3">
            <div className="p-4 bg-rose-500/10 rounded-full text-rose-500">
              <ShieldAlert className="h-10 w-10 stroke-[1.5]" />
            </div>
            <h2 className="text-xl font-bold text-foreground font-sans tracking-tight">Administrative Access Only</h2>
            <p className="text-muted-foreground text-xs leading-relaxed max-w-sm font-sans">
              The administrative connection tests and database diagnostic tools are restricted to authorized administrators.
            </p>
          </div>

          <div className="border-t border-border/20 pt-4 flex flex-col gap-2">
            <Button 
              variant="default"
              className="w-full h-10 rounded-xl text-xs font-semibold"
              onClick={() => window.location.href = '/dashboard'}
            >
              Return to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Hook up live Sync Manager
  const {
    syncStatus: liveSyncStatus,
    isOffline: isLiveOffline,
    pendingOfflineCount: livePendingOfflineCount,
    drainOfflineQueue: triggerLiveDrainOfflineQueue,
    forceSave: triggerLiveForceSave,
    forceFetch: triggerLiveForceFetch,
    lastSyncTime: liveLastSyncTime,
  } = useSyncManager();

  const [isLiveForceSaveRunning, setIsLiveForceSaveRunning] = useState(false);
  const [isLiveForceFetchRunning, setIsLiveForceFetchRunning] = useState(false);
  const [isLiveDrainRunning, setIsLiveDrainRunning] = useState(false);

  const [liveSyncTestResults, setLiveSyncTestResults] = useState<{
    action: string;
    success: boolean;
    message: string;
    timestamp: string;
  } | null>(null);


  const handleLiveForceSave = async () => {
    setIsLiveForceSaveRunning(true);
    setLiveSyncTestResults(null);
    setTestLogs(prev => ({ ...prev, liveSync: [] }));
    logTestStep('liveSync', 'Initializing forceSave() overwrite sequence...');
    logTestStep('liveSync', 'Scanning local memory state for transactions and debts...');
    const startTime = performance.now();
    try {
      logTestStep('liveSync', 'Generating local baseline hash representing current client data structures...');
      logTestStep('liveSync', 'Pushing client dataset payload to Cloud Firestore "Users" record...');
      await triggerLiveForceSave();
      const duration = performance.now() - startTime;
      
      logTestStep('liveSync', `Force push write acknowledged by remote Firestore in ${duration.toFixed(0)}ms.`, 'success');
      logTestStep('liveSync', 'Successfully aligned remote server hash baseline with active client data.', 'success');
      setLiveSyncTestResults({
        action: 'Force Overwrite Cloud Save (forceSave)',
        success: true,
        message: `Force save pushed client memory state to Cloud Firestore in ${duration.toFixed(0)}ms. Overwrote remote hash baseline.`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Force Save Completed", description: "Local data forcefully synced to Cloud." });
    } catch (error: any) {
      logTestStep('liveSync', `Force save failed: ${error.message}`, 'error');
      setLiveSyncTestResults({
        action: 'Force Overwrite Cloud Save (forceSave)',
        success: false,
        message: `Force save failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Force Save Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLiveForceSaveRunning(false);
    }
  };

  const handleLiveForceFetch = async () => {
    setIsLiveForceFetchRunning(true);
    setLiveSyncTestResults(null);
    setTestLogs(prev => ({ ...prev, liveSync: [] }));
    logTestStep('liveSync', 'Initializing forceFetch() overwrite sequence...');
    logTestStep('liveSync', 'WARNING: Discarding unsaved client-side changes and dirty hashes.');
    const startTime = performance.now();
    try {
      logTestStep('liveSync', 'Querying Cloud Firestore profile and master document snapshots...');
      await triggerLiveForceFetch();
      const duration = performance.now() - startTime;
      
      logTestStep('liveSync', `Snapshot retrieved and loaded into memory stores in ${duration.toFixed(0)}ms.`, 'success');
      logTestStep('liveSync', 'Local Zustand statement state and debt structures populated successfully.', 'success');
      setLiveSyncTestResults({
        action: 'Force Overwrite Client Fetch (forceFetch)',
        success: true,
        message: `Force fetch retrieved cloud state and populated local stores in ${duration.toFixed(0)}ms. Discarded unsaved changes.`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Force Fetch Completed", description: "Cloud data loaded successfully." });
    } catch (error: any) {
      logTestStep('liveSync', `Force fetch failed: ${error.message}`, 'error');
      setLiveSyncTestResults({
        action: 'Force Overwrite Client Fetch (forceFetch)',
        success: false,
        message: `Force fetch failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Force Fetch Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLiveForceFetchRunning(false);
    }
  };

  const handleLiveDrainQueue = async () => {
    setIsLiveDrainRunning(true);
    setLiveSyncTestResults(null);
    setTestLogs(prev => ({ ...prev, liveSync: [] }));
    logTestStep('liveSync', 'Initializing drainOfflineQueue() pipeline...');
    logTestStep('liveSync', `Inspecting queue depth... Found ${livePendingOfflineCount} items pending.`);
    const startTime = performance.now();
    try {
      logTestStep('liveSync', 'Draining mutations to backend database...');
      await triggerLiveDrainOfflineQueue();
      const duration = performance.now() - startTime;
      
      logTestStep('liveSync', `Offline queue successfully resolved and processed in ${duration.toFixed(0)}ms.`, 'success');
      setLiveSyncTestResults({
        action: 'Immediate Offline Queue Drain (drainOfflineQueue)',
        success: true,
        message: `Offline mutation queue processed in ${duration.toFixed(0)}ms. Local updates successfully resolved.`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Queue Drain Completed", description: "Offline queue drained." });
    } catch (error: any) {
      logTestStep('liveSync', `Queue drain failed: ${error.message}`, 'error');
      setLiveSyncTestResults({
        action: 'Immediate Offline Queue Drain (drainOfflineQueue)',
        success: false,
        message: `Drain failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ title: "Queue Drain Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLiveDrainRunning(false);
    }
  };

  const [dbConnectionResult, setDbConnectionResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isDbConnectionTesting, setIsDbConnectionTesting] = useState(false);

  const [testLogs, setTestLogs] = useState<Record<string, string[]>>({});

  // Load persistent logs on admin account
  useEffect(() => {
    if (!clientClerkUser?.id) return;
    const loadPersistedLogs = async () => {
      try {
        const docRef = doc(db, 'admin_logs', clientClerkUser.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().logs) {
          setTestLogs(docSnap.data().logs);
        }
      } catch (err) {
        console.error('Failed to load persisted logs from Firestore', err);
      }
    };
    loadPersistedLogs();
  }, [clientClerkUser?.id]);

  // Persist updated logs to Firestore with a debounce to prevent excessive writes
  useEffect(() => {
    if (!clientClerkUser?.id || Object.keys(testLogs).length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const docRef = doc(db, 'admin_logs', clientClerkUser.id);
        await setDoc(docRef, { logs: testLogs, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.error('Failed to save logs to Firestore', err);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [testLogs, clientClerkUser?.id]);

  const [activePayloadTab, setActivePayloadTab] = useState<'zustand' | 'offline_queue' | 'firestore'>('zustand');
  const [inspectedPayload, setInspectedPayload] = useState<any>(null);
  const [isFetchingInspectedPayload, setIsFetchingInspectedPayload] = useState(false);

  const handleFetchPayload = async (tab: 'zustand' | 'offline_queue' | 'firestore') => {
    setIsFetchingInspectedPayload(true);
    setInspectedPayload(null);
    try {
      if (tab === 'zustand') {
        const payload = {
          transactions: useTransactionsStore.getState().transactions,
          debts: useDebtStore.getState().debts,
          budgetItems: useBudgetStore.getState().budgetItems,
          assetItems: useStatementStore.getState().assetItems,
          otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
          startDate: useStatementStore.getState().startDate?.toISOString(),
          endDate: useStatementStore.getState().endDate?.toISOString(),
        };
        setInspectedPayload(payload);
        logTestStep('liveSync', 'Local Zustand Store Snapshot Compiled successfully.');
      } else if (tab === 'offline_queue') {
        if (!clientClerkUser?.id) {
          throw new Error('User not logged in.');
        }
        const mutations = getOfflineMutations(clientClerkUser.id);
        setInspectedPayload(mutations);
        logTestStep('liveSync', `Offline Mutation Queue read successfully. Total count: ${mutations.length}.`);
      } else if (tab === 'firestore') {
        if (!clientClerkUser?.id) {
          throw new Error('User not logged in.');
        }
        const docRef = doc(db, 'users_sync', clientClerkUser.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setInspectedPayload(docSnap.data());
          logTestStep('liveSync', 'Cloud Firestore users_sync Document retrieved successfully.');
        } else {
          setInspectedPayload({ message: 'No sync document found on the server for this user.' });
          logTestStep('liveSync', 'Cloud Firestore users_sync Document not found.');
        }
      }
    } catch (err: any) {
      setInspectedPayload({ error: err.message });
      logTestStep('liveSync', `Failed to fetch payload: ${err.message}`, 'error');
    } finally {
      setIsFetchingInspectedPayload(false);
    }
  };

  const handleClearCloudLogs = async () => {
    if (!clientClerkUser?.id) return;
    try {
      const docRef = doc(db, 'admin_logs', clientClerkUser.id);
      await deleteDoc(docRef);
      setTestLogs({});
      toast({ title: 'Logs Cleared', description: 'Persistent logs removed from Firestore successfully.' });
    } catch (err: any) {
      toast({ title: 'Clear Failed', description: err.message, variant: 'destructive' });
    }
  };

  const logTestStep = (testKey: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✓' : '•';
    setTestLogs(prev => ({
      ...prev,
      [testKey]: [...(prev[testKey] || []), `[${timestamp}] ${prefix} ${message}`]
    }));
  };

  // For String-to-Hash Consistency Test
  const csStringTestData = STRING_TEST_SYNC_DATA_INPUT; // Use the constant
  const [csClientPreparedString, setCsClientPreparedString] = useState('');
  const [csClientCalculatedHash, setCsClientCalculatedHash] = useState('');
  const [csServerCalculatedHash, setCsServerCalculatedHash] = useState('');
  const [csServerHashingDuration, setCsServerHashingDuration] = useState<number | null>(null);
  const [csHashMatchResult, setCsHashMatchResult] = useState<boolean | null>(null);
  const [isCsStringHashTesting, setIsCsStringHashTesting] = useState(false);
  const [csStringHashError, setCsStringHashError] = useState<string | null>(null);

  // For Data Preparation & Hashing Consistency Test
  const csObjectTestData = OBJECT_TEST_SYNC_DATA_INPUT; // Use the constant
  const [csObjClientPreparedString, setCsObjClientPreparedString] = useState('');
  const [csObjClientHash, setCsObjClientHash] = useState('');
  const [csObjServerPreparedString, setCsObjServerPreparedString] = useState('');
  const [csObjServerHash, setCsObjServerHash] = useState('');
  const [csObjPrepMatch, setCsObjPrepMatch] = useState<boolean | null>(null);
  const [csObjHashMatch, setCsObjHashMatch] = useState<boolean | null>(null);
  const [isCsObjectHashTesting, setIsCsObjectHashTesting] = useState(false);
  const [csObjectHashError, setCsObjectHashError] = useState<string | null>(null);

  const [verifyHashTestResults, setVerifyHashTestResults] = useState<Array<{ description: string, expected: boolean, actual: boolean, data?: string, hash?: string, stringToVerify?: string }>>([]);

  const [testDataInput, setTestDataInput] = useState('Sample test data for saving.');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string; entryId?: string; duration?: number } | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);

  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);

  const [crudTestLog, setCrudTestLog] = useState<string[]>([]);
  const [isCrudTesting, setIsCrudTesting] = useState(false);

  const [serverClerkUserInfo, setServerClerkUserInfo] = useState<Record<string, any> | null>(null);
  const [isServerClerkUserInfoLoading, setIsServerClerkUserInfoLoading] = useState(false);
  const [serverClerkUserInfoError, setServerClerkUserInfoError] = useState<string | null>(null);

  // States for End-to-End Hash Verification
  const [integrityTestData, setIntegrityTestData] = useState<any>(INTEGRITY_TEST_INITIAL_SYNC_DATA_INPUT);
  const [integrityTestClientPreparedString, setIntegrityTestClientPreparedString] = useState('');
  const [integrityTestClientHash, setIntegrityTestClientHash] = useState('');
  const [integrityTestServerResult, setIntegrityTestServerResult] = useState<Awaited<ReturnType<typeof verifyClientDataHashAction>> | null>(null);
  const [isIntegrityTesting, setIsIntegrityTesting] = useState(false);

  // States for Stale Hash Simulation Test
  const [staleHash_originalData, setStaleHash_originalData] = useState<any>(null);
  const [staleHash_staleHash, setStaleHash_staleHash] = useState<string | null>(null);
  const [staleHash_editableJSONString, setStaleHash_editableJSONString] = useState<string>('');
  const [staleHash_dataToSendToServer, setStaleHash_dataToSendToServer] = useState<any>(null);
  const [staleHash_simulationResult, setStaleHash_simulationResult] = useState<Awaited<ReturnType<typeof simulateSaveWithPotentialMismatchAction>> | null>(null);
  const [isStaleHashSimulating, setIsStaleHashSimulating] = useState(false);
  const [isStaleHashTestDialogVisible, setIsStaleHashTestDialogVisible] = useState(false);
  const [staleHashSimulationResolution, setStaleHashSimulationResolution] = useState<string | null>(null);


  const [comprehensiveSaveTestResult, setComprehensiveSaveTestResult] = useState<{ success: boolean; message: string; duration?: number; details?: any } | null>(null);
  const [isComprehensiveSaveTesting, setIsComprehensiveSaveTesting] = useState(false);

  const [isAuthSyncTesting, setIsAuthSyncTesting] = useState(false);
  const [authSyncResult, setAuthSyncResult] = useState<Awaited<ReturnType<typeof verifyFirebaseAuthSyncAction>> | null>(null);

  const [detailViewTitle, setDetailViewTitle] = useState('');
  const [detailViewContent, setDetailViewContent] = useState<string | object>('');
  const [isDetailViewerOpen, setIsDetailViewerOpen] = useState(false);

  const openDetailViewer = (title: string, content: string | object) => {
    setDetailViewTitle(title);
    setDetailViewContent(content);
    setIsDetailViewerOpen(true);
  };

  const handleDbConnectionTest = async () => {
    setIsDbConnectionTesting(true);
    setDbConnectionResult(null);
    setTestLogs(prev => ({ ...prev, dbConnection: [] }));
    logTestStep('dbConnection', 'Initiating Database Connection Ping...');
    const startTime = performance.now();
    try {
      logTestStep('dbConnection', 'Connecting to secure server proxy endpoint action...');
      const result = await checkDatabaseConnection();
      const duration = performance.now() - startTime;
      setDbConnectionResult({
        ...result,
        duration: Math.round(duration)
      });
      if (result.success) {
        logTestStep('dbConnection', `Connection succeeded! Server-side Firestore response: "${result.message}"`, 'success');
        logTestStep('dbConnection', `Roundtrip duration: ${Math.round(duration)}ms`, 'success');
      } else {
        logTestStep('dbConnection', `Connection check failed: ${result.message}`, 'error');
      }
      toast({
        title: result.success ? "Connection Successful" : "Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });
    } catch (error: any) {
      const message = error.message || "Unknown connection error";
      logTestStep('dbConnection', `Critical client connection error: ${message}`, 'error');
      setDbConnectionResult({
        success: false,
        message: `Client-side error: ${message}`,
        duration: 0
      });
      toast({
        title: "Connection Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsDbConnectionTesting(false);
    }
  };

  const handleCsStringHashTest = async () => {
    setIsCsStringHashTesting(true); setCsStringHashError(null); setCsClientCalculatedHash(''); setCsServerCalculatedHash(''); setCsServerHashingDuration(null); setCsHashMatchResult(null);
    setTestLogs(prev => ({ ...prev, stringHash: [] }));
    logTestStep('stringHash', 'Retrieving mock String Test Dataset...');
    try {
      logTestStep('stringHash', 'Preparing dataset for canonical hashing sorting rules (prepareDataForHashing)...');
      const preparedClientData = prepareDataForHashing(csStringTestData);
      logTestStep('stringHash', 'Stringifying sorted dataset via deterministic JSON encoder...');
      const clientString = stringify(preparedClientData);
      setCsClientPreparedString(clientString);
      logTestStep('stringHash', `Client String representation compiled (length: ${clientString.length} chars).`);
      
      logTestStep('stringHash', 'Calculating client-side SHA-256 hash utilizing browser Web Crypto API...');
      const localClientHash = await hashData(clientString);
      setCsClientCalculatedHash(localClientHash);
      logTestStep('stringHash', `Client Hash generated: "${localClientHash.substring(0, 16)}..."`, 'success');
      
      logTestStep('stringHash', 'Dispatched JSON string to server comparator endpoint for comparative hashing...');
      const serverResult = await getHashForServerComparison(clientString);
      if (serverResult.success && serverResult.serverHash) {
        setCsServerCalculatedHash(serverResult.serverHash);
        setCsServerHashingDuration(serverResult.duration || null);
        const match = localClientHash === serverResult.serverHash;
        setCsHashMatchResult(match);
        logTestStep('stringHash', `Server-side hash computed in ${serverResult.duration || 0}ms: "${serverResult.serverHash.substring(0, 16)}..."`);
        if (match) {
          logTestStep('stringHash', 'CLIENT/SERVER HASH MATCH CONFIRMED. The deterministic string representation matches 100% byte-for-byte!', 'success');
        } else {
          logTestStep('stringHash', 'HASH MISMATCH DETECTED. Serialized contents differ.', 'error');
        }
      } else { 
        throw new Error(serverResult.message || "Failed to get hash from server for string test."); 
      }
    } catch (error: any) { 
      logTestStep('stringHash', `Error: ${error.message}`, 'error');
      setCsStringHashError(error.message);
    } finally { setIsCsStringHashTesting(false); }
  };

  const handleCsObjectHashTest = async () => {
    setIsCsObjectHashTesting(true); setCsObjectHashError(null); setCsObjClientPreparedString(''); setCsObjClientHash(''); setCsObjServerPreparedString(''); setCsObjServerHash(''); setCsObjPrepMatch(null); setCsObjHashMatch(null);
    setTestLogs(prev => ({ ...prev, objectHash: [] }));
    logTestStep('objectHash', 'Retrieving nested Object Test Dataset (transactions + debts)...');
    try {
      logTestStep('objectHash', 'Running client-side key sorting and preparation...');
      const clientPreparedData = prepareDataForHashing(csObjectTestData);
      const clientPreparedString = stringify(clientPreparedData);
      setCsObjClientPreparedString(clientPreparedString);
      
      logTestStep('objectHash', 'Calculating client SHA-256 hash...');
      const clientHash = await hashData(clientPreparedString);
      setCsObjClientHash(clientHash);
      logTestStep('objectHash', `Client hash generated: "${clientHash.substring(0, 16)}..."`);
      
      logTestStep('objectHash', 'Dispatching raw nested object to server endpoint for server-side preparation comparison...');
      const serverResult = await getHashForServerPreparedObject(csObjectTestData);
      if (serverResult.success && serverResult.serverPreparedString && serverResult.serverHash) {
        setCsObjServerPreparedString(serverResult.serverPreparedString);
        setCsObjServerHash(serverResult.serverHash);
        
        const prepMatch = clientPreparedString === serverResult.serverPreparedString;
        const hashMatch = clientHash === serverResult.serverHash;
        setCsObjPrepMatch(prepMatch);
        setCsObjHashMatch(hashMatch);
        
        logTestStep('objectHash', `Server prepared string returned (length: ${serverResult.serverPreparedString.length} chars).`);
        logTestStep('objectHash', `Server hash computed: "${serverResult.serverHash.substring(0, 16)}..."`);
        
        if (prepMatch) {
          logTestStep('objectHash', '✓ Preparation Consistency: Exact byte-for-byte serialization matches.', 'success');
        } else {
          logTestStep('objectHash', '❌ Preparation Consistency: Serialized formats differ.', 'error');
        }
        
        if (hashMatch) {
          logTestStep('objectHash', '✓ Hashing Consistency: SHA-256 matches perfectly.', 'success');
        } else {
          logTestStep('objectHash', '❌ Hashing Consistency: SHA-256 output mismatch.', 'error');
        }
      } else {
        throw new Error(serverResult.message || "Failed to compare preparation with server.");
      }
    } catch (error: any) {
      logTestStep('objectHash', `Error: ${error.message}`, 'error');
      setCsObjectHashError(error.message);
    } finally {
      setIsCsObjectHashTesting(false);
    }
  };

  const handleVerifyHashUtilityTest = async () => {
    setTestLogs(prev => ({ ...prev, verifyHashUtility: [] }));
    logTestStep('verifyHashUtility', 'Starting internal verifyHash validation test harness...');
    const results = [];
    const data = "Test data for verifyHash";
    logTestStep('verifyHashUtility', `Computing master hash for string: "${data}"`);
    const correctHash = await hashData(data);
    const wrongHash = "deliberatelywronghash12345";
    const differentData = "Different test data";
    
    logTestStep('verifyHashUtility', `Phase 1: Verifying data with correct hash: "${correctHash.substring(0, 16)}..."`);
    const match1 = await verifyHash(data, correctHash);
    results.push({ description: "Correct hash", expected: true, actual: match1, data, hash: correctHash, stringToVerify: data });
    logTestStep('verifyHashUtility', `Phase 1 match verdict: ${match1} (Expected: true)`, match1 ? 'success' : 'error');

    logTestStep('verifyHashUtility', `Phase 2: Verifying data with incorrect hash: "${wrongHash}"`);
    const match2 = await verifyHash(data, wrongHash);
    results.push({ description: "Incorrect hash", expected: false, actual: match2, data, hash: wrongHash, stringToVerify: data });
    logTestStep('verifyHashUtility', `Phase 2 match verdict: ${match2} (Expected: false)`, !match2 ? 'success' : 'error');

    logTestStep('verifyHashUtility', `Phase 3: Verifying different data with correct master hash`);
    const match3 = await verifyHash(differentData, correctHash);
    results.push({ description: "Correct hash, wrong data", expected: false, actual: match3, data: differentData, hash: correctHash, stringToVerify: differentData });
    logTestStep('verifyHashUtility', `Phase 3 match verdict: ${match3} (Expected: false)`, !match3 ? 'success' : 'error');
    
    setVerifyHashTestResults(results);
    logTestStep('verifyHashUtility', 'All internal verifyHash utility test sweeps completed.', 'success');
  };

  const handleRunIntegrityTest = async () => {
    setIsIntegrityTesting(true);
    setIntegrityTestServerResult(null);
    setIntegrityTestClientPreparedString('');
    setIntegrityTestClientHash('');
    setTestLogs(prev => ({ ...prev, integrity: [] }));
    logTestStep('integrity', 'Starting End-to-End Client-to-Server Integrity Validation...');
    try {
      if (!integrityTestData || typeof integrityTestData !== 'object') {
        throw new Error("Please provide valid test data in JSON format for integrity test.");
      }
      logTestStep('integrity', 'Executing client-side deep key sorting...');
      const clientPreparedData = prepareDataForHashing(integrityTestData);
      const clientPreparedString = stringify(clientPreparedData);
      logTestStep('integrity', `Client-side canonical JSON serialized (length: ${clientPreparedString.length} chars)`);
      
      logTestStep('integrity', 'Hashing client-prepared JSON via SHA-256...');
      const clientHash = await hashData(clientPreparedString);
      setIntegrityTestClientPreparedString(clientPreparedString);
      setIntegrityTestClientHash(clientHash);
      logTestStep('integrity', `Calculated Client Hash: "${clientHash.substring(0, 16)}..."`);
      
      logTestStep('integrity', 'Sending raw data payload and client hash to server verifyClientDataHashAction...');
      const startTime = performance.now();
      const serverResult = await verifyClientDataHashAction(integrityTestData, clientHash);
      const duration = performance.now() - startTime;

      setIntegrityTestServerResult({
        ...serverResult,
        duration: Math.round(duration)
      });
      
      logTestStep('integrity', `Server replied in ${Math.round(duration)}ms. Success status: ${serverResult.success}`);
      if (serverResult.success) {
        logTestStep('integrity', `Server-side hash calculation matched: ${serverResult.clientHashMatches}`, serverResult.clientHashMatches ? 'success' : 'error');
        logTestStep('integrity', `Server message: "${serverResult.message}"`, serverResult.clientHashMatches ? 'success' : 'error');
      } else {
        logTestStep('integrity', `Server error: "${serverResult.message}"`, 'error');
      }
      
      toast({
        title: serverResult.success && serverResult.clientHashMatches ? "Integrity Verified" : "Integrity Check Failed",
        description: serverResult.message,
        variant: serverResult.success && serverResult.clientHashMatches ? "default" : "destructive"
      });
    } catch (error: any) {
      logTestStep('integrity', `Critical error during validation run: ${error.message}`, 'error');
      setIntegrityTestServerResult({ success: false, message: `Client-side error: ${error.message}`, duration: 0 });
      toast({
        title: "Integrity Test Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsIntegrityTesting(false);
    }
  };

  const handleGenerateStaleHashData = async () => {
    setTestLogs(prev => ({ ...prev, staleHash: [] }));
    logTestStep('staleHash', 'Step 1: Generating Initial Benchmark Data...');
    const initialData = {
        transactions: [{ id: 'stale_tx_1', date: new Date(2023, 2, 10).toISOString(), description: 'Initial Stale Test TX', amount: 50.00, modeOfPayment: 'Bank' } as TransactionWithId],
        gettingStartedDismissed: true
    };
    setStaleHash_originalData(initialData);
    logTestStep('staleHash', 'Sorting and stringifying initial data structure...');
    const prepared = prepareDataForHashing(initialData as any);
    const hash = await hashData(stringify(prepared));
    setStaleHash_staleHash(hash);
    logTestStep('staleHash', `Initial baseline hash established: "${hash.substring(0, 16)}..."`);
    setStaleHash_dataToSendToServer(initialData); // Initialize data to send with original data
    setStaleHash_editableJSONString(JSON.stringify(initialData, null, 2)); // Populate editor
    setStaleHash_simulationResult(null);
    setStaleHashSimulationResolution(null); // Reset resolution message
    logTestStep('staleHash', 'Original baseline ready. Please edit fields in Step 2 to simulate external modifications!', 'success');
    toast({ title: "Step 1 Complete", description: "Initial data & stale hash generated. Edit in Step 2." });
  };

  const handleApplyEditorChangesToStaleTestData = () => {
    if (!staleHash_editableJSONString) {
      toast({ title: "Error", description: "Editor is empty.", variant: "destructive" });
      return;
    }
    try {
      const modifiedData = JSON.parse(staleHash_editableJSONString);
      setStaleHash_dataToSendToServer(modifiedData); // This is the data that will be sent
      // Re-stringify to ensure editor reflects what would be parsed if saved/sent
      setStaleHash_editableJSONString(JSON.stringify(modifiedData, null, 2));
      toast({ title: "Data Updated", description: "Editor changes applied to 'Modified Data' payload. Stale hash remains unchanged." });
    } catch (error: any) {
      toast({ title: "JSON Parse Error", description: `Could not parse JSON: ${error.message}`, variant: "destructive" });
    }
  };

  const handleAttemptSaveWithStaleHash = async () => {
    if (!staleHash_staleHash || staleHash_dataToSendToServer === null || staleHash_dataToSendToServer === undefined) {
      toast({ title: "Error", description: "Please complete Step 1 & ensure data payload is set (apply editor changes if needed).", variant: "destructive" });
      return;
    }
    setIsStaleHashSimulating(true);
    setStaleHash_simulationResult(null);
    setStaleHashSimulationResolution(null);
    logTestStep('staleHash', 'Step 3: Simulating client save attempt with the stale baseline hash...');
    logTestStep('staleHash', `Transmitting stale hash: "${staleHash_staleHash.substring(0, 16)}..." and modified payload to simulation endpoint...`);
    try {
      const result = await simulateSaveWithPotentialMismatchAction(
        staleHash_dataToSendToServer, // Send the (potentially modified) data
        staleHash_staleHash          // Send the original, stale hash
      );
      setStaleHash_simulationResult(result);
      logTestStep('staleHash', `Endpoint response received. Mismatch detected on Server? ${result.mismatchDetected}`);
      
      if (result.mismatchDetected) {
        logTestStep('staleHash', 'STALE HASH CONFLICT IDENTIFIED. The server-side baseline hash has evolved. Opening Data Conflict Resolution Dialog...', 'error');
        setIsStaleHashTestDialogVisible(true); // Show the dialog
        toast({
            title: "Mismatch DETECTED (Expected!)",
            description: `${result.message} The conflict resolution dialog has been opened.`,
            variant: "default"
        });
      } else {
        logTestStep('staleHash', 'No mismatch detected. The data was successfully saved on the simulated server.', 'success');
        toast({
          title: result.success ? "No Mismatch (Unexpected)" : "Simulation Error",
          description: result.message,
          variant: result.success ? "destructive" : "destructive"
        });
      }
    } catch (error: any) {
      logTestStep('staleHash', `Critical conflict simulation error: ${error.message}`, 'error');
      setStaleHash_simulationResult({ success: false, message: `Client-side error: ${error.message}.`, duration: 0, mismatchDetected: false });
       toast({ title: "Simulation Error", description: `Client-side error: ${error.message}.`, variant: "destructive"});
    } finally {
      setIsStaleHashSimulating(false);
    }
  };

  const handleSimulatedForceSave = async () => {
    toast({ title: "Simulated: Keep Local", description: "You chose to keep local data & overwrite cloud." });
    setStaleHashSimulationResolution("User chose: Keep Local & Overwrite Cloud (Simulated)");
    setIsStaleHashTestDialogVisible(false);
    return true; // Simulate success
  };

  const handleSimulatedForceFetch = async () => {
    toast({ title: "Simulated: Load Cloud", description: "You chose to discard local data & load from cloud." });
    setStaleHashSimulationResolution("User chose: Discard Local & Load Cloud (Simulated)");
    setIsStaleHashTestDialogVisible(false);
    return true; // Simulate success
  };


  const handleSaveTestData = async () => {
    setIsSavingData(true); setSaveResult(null);
    setTestLogs(prev => ({ ...prev, simpleSave: [] }));
    logTestStep('simpleSave', 'Preparing Simple DB Save action payload...');
    logTestStep('simpleSave', `Input text value: "${testDataInput}"`);
    try {
      logTestStep('simpleSave', 'Dispatching mutation package to saveTestData server action...');
      const result = await saveTestData(testDataInput);
      setSaveResult(result);
      if (result.success) {
        logTestStep('simpleSave', `✓ Write operation successful! Document ID generated: "${result.entryId}"`, 'success');
        logTestStep('simpleSave', `Server confirmation: "${result.message}"`, 'success');
        toast({ title: "Save Test", description: result.message });
      } else {
        logTestStep('simpleSave', `Write operation failed: ${result.message}`, 'error');
        toast({ title: "Save Test Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during save test.";
      logTestStep('simpleSave', `Critical execution error: ${message}`, 'error');
      setSaveResult({ success: false, message });
      toast({ title: "Save Test Error", description: message, variant: "destructive" });
    } finally {
      setIsSavingData(false);
    }
  };

  const handleFetchTestData = async () => {
    setIsFetchingData(true); setFetchResult(null); setFetchedData(null);
    setTestLogs(prev => ({ ...prev, simpleFetch: [] }));
    logTestStep('simpleFetch', 'Initiating Simple DB Fetch request...');
    try {
      logTestStep('simpleFetch', 'Requesting latest diagnostic entry snapshot from server...');
      const result = await fetchTestData();
      setFetchResult(result);
      if (result.success && result.data) {
        setFetchedData(result.data);
        logTestStep('simpleFetch', `✓ Data retrieved successfully: "${JSON.stringify(result.data)}"`, 'success');
        logTestStep('simpleFetch', `Server confirmation: "${result.message}"`, 'success');
      } else {
        logTestStep('simpleFetch', `Fetch yielded empty or failed status: ${result.message}`, 'error');
      }
      if (result.success) toast({ title: "Fetch Test", description: result.message });
      else toast({ title: "Fetch Test Failed", description: result.message, variant: "destructive" });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during fetch test.";
      logTestStep('simpleFetch', `Critical retrieval error: ${message}`, 'error');
      setFetchResult({ success: false, message });
      toast({ title: "Fetch Test Error", description: message, variant: "destructive" });
    } finally {
      setIsFetchingData(false);
    }
  };

  const handleFetchServerClerkUserInfo = async () => {
    setIsServerClerkUserInfoLoading(true); setServerClerkUserInfo(null); setServerClerkUserInfoError(null);
    setTestLogs(prev => ({ ...prev, serverClerkUserInfo: [] }));
    logTestStep('serverClerkUserInfo', 'Fetching logged-in Firebase Auth context inside Server Action (getClerkUserInfo)...');
    try {
      logTestStep('serverClerkUserInfo', 'Querying clerk authentication claims and custom token payloads...');
      const result = await getClerkUserInfo();
      if (result.success && result.userInfo) {
        setServerClerkUserInfo(result.userInfo);
        logTestStep('serverClerkUserInfo', `✓ Context loaded successfully for: ${result.userInfo.email}`, 'success');
      } else if (!result.success) {
        setServerClerkUserInfoError(result.message);
        logTestStep('serverClerkUserInfo', `Failed context load: ${result.message}`, 'error');
      }
      toast({ title: "Firebase Auth User Info (Server)", description: result.message, variant: result.success ? "default" : "destructive" });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred fetching server user info.";
      logTestStep('serverClerkUserInfo', `Critical error: ${message}`, 'error');
      setServerClerkUserInfoError(message);
      toast({ title: "User Info Error", description: message, variant: "destructive" });
    } finally {
      setIsServerClerkUserInfoLoading(false);
    }
  };

  const handleVerifyAuthSync = async () => {
    setIsAuthSyncTesting(true);
    setAuthSyncResult(null);
    setTestLogs(prev => ({ ...prev, authSync: [] }));
    logTestStep('authSync', 'Beginning Firebase Auth custom sync checker pipeline...');
    try {
      logTestStep('authSync', 'Cross-verifying client state with server-side Auth headers...');
      const result = await verifyFirebaseAuthSyncAction();
      setAuthSyncResult(result);
      if (result.success) {
        logTestStep('authSync', `✓ Authentication state alignment active: "${result.message}"`, 'success');
      } else {
        logTestStep('authSync', `Auth alignment issue: "${result.message}"`, 'error');
      }
      toast({
        title: result.success ? "Auth State Synchronized" : "Auth Sync Warning",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred testing auth sync.";
      logTestStep('authSync', `Critical verifyAuthSync error: ${message}`, 'error');
      setAuthSyncResult({ success: false, message });
      toast({ title: "Auth Sync Error", description: message, variant: "destructive" });
    } finally {
      setIsAuthSyncTesting(false);
    }
  };

  const handleRunCrudTests = async () => {
    setIsCrudTesting(true);
    setCrudTestLog([]);
    const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✓' : '•';
        setCrudTestLog(prev => [...prev, `[${timestamp}] ${prefix} ${message}`]);
    };

    try {
      log("Starting CRUD tests...");

      log("Attempting to delete all previous test entries...");
      const deleteAllRes = await deleteAllUserTestEntries();
      if (!deleteAllRes.success && deleteAllRes.count === undefined) { // Stricter check, count must be defined if success is false in some cases
          log(`Failed to clear previous test entries: ${deleteAllRes.message}. Count: ${deleteAllRes.count ?? 'N/A'}`, 'error');
          throw new Error(`Failed to clear previous test entries: ${deleteAllRes.message}`);
      }
      log(`Cleared ${deleteAllRes.count ?? 0} entries`, 'success');


      log("\nCreating 3 new test entries...");
      const entriesToCreate = [{ data: "Entry A" }, { data: "Entry B" }, { data: "Entry C" }];
      const createRes = await createMultipleTestEntries(entriesToCreate);
      if (!createRes.success || !createRes.createdIds || createRes.createdIds.length !== 3) {
        log(`Failed to create test entries. Result: ${createRes.message}, IDs: ${JSON.stringify(createRes.createdIds)}`, 'error');
        throw new Error(`Failed to create test entries. Result: ${createRes.message}`);
      }
      const [idA, idB, idC] = createRes.createdIds;
      log(`Created IDs: A=${idA}, B=${idB}, C=${idC}`, 'success');

      log("\nReading all test entries...");
      const readRes = await readAllTestEntries();
      if (!readRes.success || !readRes.entries) {
        log(`Failed to read test entries. Message: ${readRes.message}`, 'error');
        throw new Error("Failed to read test entries.");
      }
      log(`Found ${readRes.entries.length} entries. Expected 3.`);
      if (readRes.entries.length !== 3) {
          log("Entries found: " + JSON.stringify(readRes.entries.map(e => ({id: e.id, data: e.data}))), 'error')
          throw new Error(`Entry count mismatch after create. Expected 3, got ${readRes.entries.length}.`);
      }
      const entryBExists = readRes.entries.find(e => e.id === idB && e.data === "Entry B");
      if (!entryBExists) {
        log(`Entry B (ID: ${idB}) not found or data mismatch after create. Found: ${JSON.stringify(readRes.entries.find(e => e.id === idB))}`, 'error')
        throw new Error(`Entry B (ID: ${idB}) not found or data mismatch after create.`);
      }
      log("Initial entries verified.", 'success');

      log(`\nUpdating Entry B (ID: ${idB}) to "Entry B - Updated"...`);
      const updateRes = await updateSingleTestEntry(idB, "Entry B - Updated");
      if (!updateRes.success) {
        log(`Failed to update Entry B. Result: ${updateRes.message}`, 'error');
        throw new Error(`Failed to update Entry B. Result: ${updateRes.message}`);
      }
      const readAfterUpdateRes = await readAllTestEntries();
      const updatedEntryB = readAfterUpdateRes.entries?.find(e => e.id === idB);
      if (!updatedEntryB || updatedEntryB.data !== "Entry B - Updated") {
        log(`Entry B not updated correctly. Found: ${JSON.stringify(updatedEntryB)}`, 'error');
        throw new Error(`Entry B not updated correctly.`);
      }
      log("Entry B updated and verified.", 'success');

      log(`\nDeleting Entry A (ID: ${idA})...`);
      const deleteARes = await deleteSingleTestEntry(idA);
      if (!deleteARes.success) {
        log(`Failed to delete Entry A. Result: ${deleteARes.message}`, 'error');
        throw new Error(`Failed to delete Entry A. Result: ${deleteARes.message}`);
      }
      const readAfterDeleteARes = await readAllTestEntries();
      if (readAfterDeleteARes.entries?.length !== 2) {
        log(`Entry count mismatch after deleting A. Expected 2, got ${readAfterDeleteARes.entries?.length}.`, 'error');
        throw new Error(`Entry count mismatch after deleting A. Expected 2, got ${readAfterDeleteARes.entries?.length}.`);
      }
      if (readAfterDeleteARes.entries?.find(e => e.id === idA)) {
        log("Entry A still found after deletion.", 'error');
        throw new Error("Entry A still found after deletion.");
      }
      log("Entry A deleted and verified.", 'success');

      log("\nDeleting all remaining test entries for user...");
      const finalDeleteRes = await deleteAllUserTestEntries();
      if (!finalDeleteRes.success || finalDeleteRes.count !== 2) { // Stricter check on count
        log(`Failed to delete remaining entries. Expected 2, got ${finalDeleteRes.count ?? 0}. Result: ${finalDeleteRes.message}`, 'error');
        throw new Error(`Failed to delete remaining entries. Expected 2, got ${finalDeleteRes.count ?? 0}. Result: ${finalDeleteRes.message}`);
      }
      const readAfterFinalDeleteRes = await readAllTestEntries();
      if (readAfterFinalDeleteRes.entries?.length !== 0) {
        log(`Entries still found after final delete all. Count: ${readAfterFinalDeleteRes.entries?.length}.`, 'error');
        throw new Error(`Entries still found after final delete all. Count: ${readAfterFinalDeleteRes.entries?.length}.`);
      }
      log("All test entries successfully cleaned up.", 'success');

      log("\nCRUD tests completed successfully!", 'success');
      toast({ title: "CRUD Tests", description: "All CRUD operations passed." });

    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during CRUD tests.";
      log(`CRUD TEST FAILED: ${message}`, 'error');
      if (error.stack) log(`Stack: ${error.stack}`, 'error');
      toast({ title: "CRUD Test Failed", description: message, variant: "destructive" });
    } finally {
      setIsCrudTesting(false);
    }
  };

  const handleComprehensiveSaveTest = async () => {
    setIsComprehensiveSaveTesting(true);
    setComprehensiveSaveTestResult(null);
    const startTime = performance.now();
    const testTxId = `test_tx_${Date.now()}`;
    const testDebtId = `test_debt_${Date.now()}`;
    const currentUserId = clientClerkUser?.id || (auth.currentUser ? auth.currentUser.uid : null);

    try {
      // 1. If user is signed in with client-side Firebase Auth, test direct client Firestore with rule validation
      if (auth.currentUser && currentUserId && !clientClerkUser?.isDemo) {
        try {
          const txRef = doc(db, 'users', currentUserId, 'transactions', testTxId);
          const debtRef = doc(db, 'users', currentUserId, 'debts', testDebtId);

          await setDoc(txRef, {
            id: testTxId,
            userId: currentUserId,
            date: new Date().toISOString(),
            description: 'Admin Test Transaction - Comprehensive Client Save',
            amount: -123.45,
            modeOfPayment: 'Bank',
            frequency: 'one-time',
            variability: 'fixed',
          });

          await setDoc(debtRef, {
            id: testDebtId,
            userId: currentUserId,
            description: 'Admin Test Debt - Comprehensive Client Save',
            principal: 5000,
            interestRate: 5,
            minPayment: 100,
            term: 'short',
          });

          const snapTx = await getDoc(txRef);
          const snapDebt = await getDoc(debtRef);

          await deleteDoc(txRef);
          await deleteDoc(debtRef);

          const duration = performance.now() - startTime;
          const clientResult = {
            success: snapTx.exists() && snapDebt.exists(),
            message: 'Direct client-side authenticated Cloud Firestore transaction & cleanup passed.',
            duration,
            details: {
              channel: 'Client-Side Authenticated Cloud Firestore (Active Firebase Auth Session)',
              userId: currentUserId,
              createdTransactionId: testTxId,
              createdDebtId: testDebtId,
              verifiedTransaction: snapTx.exists(),
              verifiedDebt: snapDebt.exists(),
              deletedTransaction: true,
              deletedDebt: true,
            },
          };
          setComprehensiveSaveTestResult(clientResult);
          toast({
            title: "Comprehensive Save Test Passed",
            description: clientResult.message,
          });
          return;
        } catch (_clientFsErr) {
          // If client-side encounters any issue, seamlessly fall through to server action
        }
      }

      // 2. Execute server action test
      const result = await performComprehensiveSaveTest();
      setComprehensiveSaveTestResult(result);
      toast({
        title: result.success ? "Comprehensive Save Test Passed" : "Comprehensive Save Test Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });
    } catch (error: any) {
      const message = error.message || "Client-side error during comprehensive save test.";
      setComprehensiveSaveTestResult({ success: false, message, duration: performance.now() - startTime, details: { error: message } });
      toast({ title: "Test Error", description: message, variant: "destructive" });
    } finally {
      setIsComprehensiveSaveTesting(false);
    }
  };

  const handleZustandDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    if (dateStr) {
      const parsedDate = parse(dateStr, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        setStartDate(parsedDate);
      } else {
        setStartDate(undefined);
      }
    } else {
      setStartDate(undefined);
    }
  };

  const ResultBadge: React.FC<{ success?: boolean; message?: string; children?: React.ReactNode; duration?: number, variant?: "default" | "destructive" | "secondary" | "outline" | null | undefined, icon?: React.ElementType }> = ({ success, message, children, duration, variant, icon: IconComponent }) => {
    const actualVariant = success === undefined ? "secondary" : (success ? "default" : "destructive");
    const ActualIcon = IconComponent || (success === undefined ? Info : (success ? CheckCircle : AlertTriangle));
    return (
    <Badge variant={variant || actualVariant} className="text-sm p-2 w-full justify-start gap-2">
      <ActualIcon className="h-4 w-4" />
      <span>{message || children}</span>
      {duration !== undefined && <span className="ml-auto text-xs flex items-center gap-1"><Timer size={12}/>{duration.toFixed(0)}ms</span>}
    </Badge>
  )};

  useEffect(() => { handleVerifyHashUtilityTest(); }, []);

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader title="Admin Diagnostics & Tests" icon={TestTube} description="Verify core application functionalities and data integrity." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 md:grid-cols-2">

        <SectionHeader title="Core System Checks" icon={Settings} description="Basic application health and persistence mechanisms." />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DatabaseZap size={20} /> Database Connection</CardTitle><CardDescription>Tests connectivity to the database via Prisma.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDbConnectionTest} disabled={isDbConnectionTesting} className="w-full">
              {isDbConnectionTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run DB Connection Test'}
            </Button>
            {dbConnectionResult && (<ResultBadge success={dbConnectionResult.success} message={dbConnectionResult.message} duration={dbConnectionResult.duration} />)}
            <TestStepLogs logs={testLogs.dbConnection} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw size={20} /> Zustand Persistence</CardTitle><CardDescription>Checks Session Storage persistence for UI state.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><label htmlFor="zustand-date" className="text-sm font-medium">Statement Start Date:</label>{!isStatementStoreHydrated ? <Skeleton className="h-9 w-full mt-1" /> : (<Input type="date" id="zustand-date" value={startDate && isValid(startDate) ? format(startDate, 'yyyy-MM-dd') : ''} onChange={handleZustandDateChange} className="mt-1"/>)}</div>
            {isStatementStoreHydrated && startDate && isValid(startDate) && (<p className="text-xs text-muted-foreground">Current store value: {format(startDate, 'PP')}</p>)}
            {!isStatementStoreHydrated && (<p className="text-xs text-muted-foreground">Store hydrating...</p>)}
          </CardContent>
        </Card>

        <SectionHeader title="Data Integrity & Hashing" icon={Lock} description="Verify data consistency algorithms and end-to-end integrity." />

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><HashIcon size={20}/> Hashing Algorithm Consistency</CardTitle><CardDescription>Tests hashing and data preparation logic consistency between client and server.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 border rounded-md space-y-3 bg-card">
                <h4 className="font-semibold text-sm">Test 1: String-to-Hash Consistency</h4>
                <Textarea value={JSON.stringify(csStringTestData.transactions[0], null, 2).substring(0,100)+"..."} readOnly rows={1} className="text-xs bg-muted/50 font-mono" title="Showing first transaction of test data" />
                <Button onClick={handleCsStringHashTest} disabled={isCsStringHashTesting} className="w-full">
                    {isCsStringHashTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run String Hash Test'}
                </Button>
                {csStringHashError && <ResultBadge success={false} message={csStringHashError}/>}
                <TestStepLogs logs={testLogs.stringHash} />
                {csClientCalculatedHash && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2">
                      <HashIcon className="h-4 w-4" />
                      <h5 className="font-medium text-xs">Hash Test Results</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="border p-2 rounded-md bg-muted/20">
                        <p className="text-xs text-muted-foreground">Client Hash <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Client Hash (String Test)", csClientCalculatedHash)} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                        <p className="font-mono text-xs break-all">
                          {csClientCalculatedHash.substring(0, 15)}...
                          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(csClientCalculatedHash)} className="ml-2 h-5 px-1"><CopyIcon className="h-3 w-3" /></Button>
                        </p>
                      </div>
                      <div className="border p-2 rounded-md bg-muted/20">
                        <p className="text-xs text-muted-foreground">Server Hash <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Server Hash (String Test)", csServerCalculatedHash || 'N/A')} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                        <p className="font-mono text-xs break-all">
                          {csServerCalculatedHash?.substring(0, 15) || 'N/A'}...
                          {csServerCalculatedHash && <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(csServerCalculatedHash)} className="ml-2 h-5 px-1"><CopyIcon className="h-3 w-3" /></Button>}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Badge
                        variant={csHashMatchResult ? "default" : "destructive"}
                        className="w-full justify-start gap-2 p-1.5 text-xs"
                      >
                        {csHashMatchResult ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {csHashMatchResult === true ? "Hashes match perfectly!" : csHashMatchResult === false ? "Hashes DO NOT match!" : "Hash comparison not run or error."}
                      </Badge>
                      {csServerHashingDuration !== null && <p className="text-xs text-muted-foreground mt-1 text-right"><Timer size={10} className="inline mr-1"/>Server hashing: {csServerHashingDuration}ms</p>}
                    </div>
                  </div>
                )}
            </div>

            <div className="p-4 border rounded-md space-y-3 bg-card">
                <h4 className="font-semibold text-sm">Test 2: Data Preparation & Hashing Consistency</h4>
                <Textarea value={JSON.stringify(csObjectTestData.debts[0], null, 2).substring(0,100)+"..."} readOnly rows={1} className="text-xs bg-muted/50 font-mono" title="Showing first debt of test data" />
                <Button onClick={handleCsObjectHashTest} disabled={isCsObjectHashTesting} className="w-full">
                    {isCsObjectHashTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run Data Prep & Hash Test'}
                </Button>
                {csObjectHashError && <ResultBadge success={false} message={csObjectHashError}/>}
                <TestStepLogs logs={testLogs.objectHash} />
                 {csObjClientPreparedString && (
                  <div className="space-y-2 mt-3">
                     <div className="flex items-center gap-2">
                      <HashIcon className="h-4 w-4" />
                      <h5 className="font-medium text-xs">Data Prep & Hash Results</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="border p-2 rounded-md bg-muted/20">
                            <p className="text-xs text-muted-foreground">Client Prepared String <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Client Prepared String (Object Test)", csObjClientPreparedString)} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                            <p className="font-mono text-xs break-all">{csObjClientPreparedString.substring(0, 15)}...</p>
                        </div>
                        <div className="border p-2 rounded-md bg-muted/20">
                            <p className="text-xs text-muted-foreground">Server Prepared String <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Server Prepared String (Object Test)", csObjServerPreparedString || 'N/A')} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                            <p className="font-mono text-xs break-all">{csObjServerPreparedString?.substring(0, 15) || 'N/A'}...</p>
                        </div>
                        <div className="border p-2 rounded-md bg-muted/20">
                            <p className="text-xs text-muted-foreground">Client Hash <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Client Hash (Object Test)", csObjClientHash)} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                            <p className="font-mono text-xs break-all">{csObjClientHash.substring(0, 15)}...</p>
                        </div>
                        <div className="border p-2 rounded-md bg-muted/20">
                            <p className="text-xs text-muted-foreground">Server Hash <Button variant="ghost" size="icon" onClick={() => openDetailViewer("Server Hash (Object Test)", csObjServerHash || 'N/A')} className="ml-1 h-5 w-5 p-0"><Eye size={12}/></Button></p>
                            <p className="font-mono text-xs break-all">{csObjServerHash?.substring(0, 15) || 'N/A'}...</p>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                         <Badge variant={csObjPrepMatch ? "default" : "destructive"} className="justify-start gap-2 p-1.5 text-xs">
                             {csObjPrepMatch ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                             Prepared Strings Match: {csObjPrepMatch === true ? 'Yes' : csObjPrepMatch === false ? 'No' : 'N/A'}
                         </Badge>
                         <Badge variant={csObjHashMatch ? "default" : "destructive"} className="justify-start gap-2 p-1.5 text-xs">
                              {csObjHashMatch ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                             Hashes Match: {csObjHashMatch === true ? 'Yes' : csObjHashMatch === false ? 'No' : 'N/A'}
                         </Badge>
                     </div>
                  </div>
                )}
            </div>
            <div className="p-4 border rounded-md space-y-3 bg-card">
              <h4 className="font-semibold text-sm">Test 3: Client-Side `verifyHash` Utility</h4>
              <Button onClick={handleVerifyHashUtilityTest} className="w-full">Run `verifyHash` Tests</Button>
              {verifyHashTestResults.length > 0 && (
                <div className="space-y-1 mt-2 text-xs border p-2 rounded-md bg-muted/10">
                  {verifyHashTestResults.map((res, i) => (
                    <ResultBadge key={i} success={res.expected === res.actual}>
                      {res.description}: Expected {String(res.expected)}, Got {String(res.actual)}
                    </ResultBadge>
                  ))}
                </div>
              )}
              <TestStepLogs logs={testLogs.verifyHashUtility} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={20}/> End-to-End Hash Verification</CardTitle><CardDescription>Client prepares data, hashes it, sends both to server. Server re-prepares, re-hashes, and compares.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="integrity-data" className="text-xs font-medium">Test Data (JSON - entire SyncDataInput structure):</label>
              <Textarea id="integrity-data" value={JSON.stringify(integrityTestData, null, 2)} onChange={(e) => { try { setIntegrityTestData(JSON.parse(e.target.value)); } catch { /* ignore parse error while typing */ }}} rows={4} className="text-xs font-mono"/>
            </div>
            <Button onClick={handleRunIntegrityTest} disabled={isIntegrityTesting} className="w-full">
              {isIntegrityTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run Client-Server Hash Verification Test'}
            </Button>
            {integrityTestServerResult && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <h5 className="font-semibold mb-1">Verification Result:</h5>
                <p><strong>Client Prepared String (derived from Test Data):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Integrity Test: Client Prepared String", integrityTestClientPreparedString)}>View</Button></p>
                  <Textarea value={integrityTestClientPreparedString.substring(0,100) + "..."} readOnly rows={1} className="bg-muted/50 font-mono"/>
                <div className="flex justify-between items-center"><span><strong>Client Hash (sent to server):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{integrityTestClientHash.substring(0,20)}...</span></span><Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Integrity Test: Client Hash", integrityTestClientHash)}>Full</Button></div>
                <p><strong>Server Calculated Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{integrityTestServerResult.serverCalculatedHash ? integrityTestServerResult.serverCalculatedHash.substring(0,20)+'...' : 'N/A'}</span>
                    {integrityTestServerResult.serverCalculatedHash && <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Integrity Test: Server Hash", integrityTestServerResult.serverCalculatedHash!)}>Full</Button>}
                </p>
                <ResultBadge success={integrityTestServerResult.success && integrityTestServerResult.clientHashMatches} message={integrityTestServerResult.message} duration={integrityTestServerResult.duration} />
              </div>
            )}
            <TestStepLogs logs={testLogs.integrity} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert size={20}/> Save with Stale Hash (Mismatch Simulation)</CardTitle><CardDescription>Tests server rejection of saves with an old/stale hash for modified data.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 border rounded-md space-y-2">
                <h5 className="font-medium text-sm">Step 1: Generate Initial Data & Stale Hash</h5>
                <Button onClick={handleGenerateStaleHashData} size="sm" className="w-full">Generate Data & Stale Hash</Button>
                {staleHash_originalData && staleHash_staleHash && (
                    <div className="text-xs mt-1 space-y-0.5">
                        <p><strong>Initial Data (used for stale hash - SyncDataInput structure):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Stale Hash Test: Original Data", staleHash_originalData)}>View</Button></p>
                        <p><strong>Stale Hash (from original data):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{staleHash_staleHash.substring(0,20)}...</span> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Stale Hash Test: Stale Hash", staleHash_staleHash)}>Full</Button></p>
                    </div>
                )}
            </div>
            {staleHash_originalData && staleHash_staleHash && (
                 <div className="p-3 border rounded-md space-y-2">
                    <h5 className="font-medium text-sm">Step 2: Edit Data & Apply Changes</h5>
                    <Textarea value={staleHash_editableJSONString} onChange={(e) => setStaleHash_editableJSONString(e.target.value)} rows={5} className="text-xs font-mono" placeholder="Modify the JSON data here..." />
                    <p className="text-xs text-muted-foreground italic">
                        Modify the JSON data above (e.g., change a description or amount). Then, click "Apply Editor Changes" to update the data payload that will be sent in Step 3. The 'Stale Hash' from Step 1 will remain unchanged.
                    </p>
                    <Button onClick={handleApplyEditorChangesToStaleTestData} size="sm" variant="secondary" className="w-full" disabled={!staleHash_editableJSONString.trim()}>
                      Apply Editor Changes as 'Modified Data' Payload
                    </Button>
                     {staleHash_dataToSendToServer && (
                        <div className="text-xs mt-1">
                            <p><strong>Current 'Modified Data' to send (SyncDataInput structure):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Stale Hash Test: Current Data to Send", staleHash_dataToSendToServer)}>View</Button></p>
                        </div>
                     )}
                </div>
            )}
            {staleHash_originalData && staleHash_staleHash && (
                <div className="p-3 border rounded-md space-y-2">
                    <h5 className="font-medium text-sm">Step 3: Attempt Save (Sends 'Modified Data' with 'Stale Hash')</h5>
                     <Button onClick={handleAttemptSaveWithStaleHash} disabled={isStaleHashSimulating || staleHash_dataToSendToServer === null} className="w-full">
                        {isStaleHashSimulating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Attempt Save with Stale Hash"}
                     </Button>
                </div>
            )}
            {staleHash_simulationResult && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <h5 className="font-semibold mb-1">Mismatch Simulation Result:</h5>
                 <p><strong>Client Provided (Stale) Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{staleHash_simulationResult.clientProvidedOriginalHash ? staleHash_simulationResult.clientProvidedOriginalHash.substring(0,20)+'...' : 'N/A'}</span></p>
                 <p><strong>Server Calculated Hash of Data Sent:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{staleHash_simulationResult.serverHashOfDataSent ? staleHash_simulationResult.serverHashOfDataSent.substring(0,20)+'...' : 'N/A'}</span></p>
                 <ResultBadge
                    success={staleHash_simulationResult.mismatchDetected ? true : staleHash_simulationResult.success}
                    message={staleHash_simulationResult.message}
                    duration={staleHash_simulationResult.duration}
                    icon={staleHash_simulationResult.mismatchDetected ? ShieldAlert : (staleHash_simulationResult.success ? ShieldCheck : AlertTriangle)}
                 />
                 {staleHash_simulationResult.mismatchDetected === false && !staleHash_simulationResult.success && (
                    <p className="text-destructive mt-1">Note: Mismatch was NOT detected, but the server action reported failure. Check server logs.</p>
                 )}
                 {staleHash_simulationResult.mismatchDetected === false && staleHash_simulationResult.success && (
                    <p className="text-yellow-600 dark:text-yellow-400 mt-1">Note: Mismatch was NOT detected and server reported success. Ensure data was actually modified (and 'Apply Editor Changes' was clicked) for a valid mismatch test.</p>
                 )}
                 {staleHashSimulationResolution && (
                    <p className="text-primary mt-2 font-medium">Simulated Resolution: {staleHashSimulationResolution}</p>
                 )}
              </div>
            )}
            <TestStepLogs logs={testLogs.staleHash} />
          </CardContent>
        </Card>

        <SectionHeader title="Sync Hook & Mutation Queue Diagnostics" icon={Layers} description="Observe and trigger the active frontend sync state, queue depth, and cloud mutations." />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={20} className="text-primary" /> Active Sync Manager Monitors
            </CardTitle>
            <CardDescription>
              Reactive viewports reflecting the direct status of the background synchronization instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-xl bg-muted/30">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Sync Status</p>
                <div className="flex items-center gap-1.5">
                  <Badge variant={liveSyncStatus === 'synced' ? 'default' : liveSyncStatus === 'syncing' ? 'secondary' : 'destructive'} className="text-xs">
                    {liveSyncStatus}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Network Mode</p>
                <p className="text-xs font-medium font-sans">
                  {isLiveOffline ? 'Offline (Local-Only)' : 'Online (Cloud Connected)'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Queued Mutations</p>
                <p className="text-xs font-mono font-bold">
                  {livePendingOfflineCount} items
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Synced Time</p>
                <p className="text-xs font-sans text-muted-foreground">
                  {liveLastSyncTime ? new Date(liveLastSyncTime).toLocaleTimeString() : 'Never'}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold font-sans">Execute Sync Operations & Queue Tests:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">


                <Button 
                  onClick={handleLiveForceSave} 
                  disabled={isLiveForceSaveRunning} 
                  variant="outline" 
                  className="h-11 justify-start gap-2 px-3 border-border/60 hover:bg-muted/50 rounded-xl"
                >
                  <UploadCloud className={`h-4 w-4 ${isLiveForceSaveRunning ? 'animate-pulse' : ''} text-emerald-500`} />
                  <div className="text-left font-sans">
                    <p className="text-xs font-semibold">Force Overwrite Cloud Save</p>
                    <p className="text-[10px] text-muted-foreground">Trigger forceSave()</p>
                  </div>
                </Button>

                <Button 
                  onClick={handleLiveForceFetch} 
                  disabled={isLiveForceFetchRunning} 
                  variant="outline" 
                  className="h-11 justify-start gap-2 px-3 border-border/60 hover:bg-muted/50 rounded-xl"
                >
                  <DownloadCloud className={`h-4 w-4 ${isLiveForceFetchRunning ? 'animate-pulse' : ''} text-amber-500`} />
                  <div className="text-left font-sans">
                    <p className="text-xs font-semibold">Force Overwrite Client Fetch</p>
                    <p className="text-[10px] text-muted-foreground">Trigger forceFetch()</p>
                  </div>
                </Button>

                <Button 
                  onClick={handleLiveDrainQueue} 
                  disabled={isLiveDrainRunning} 
                  variant="outline" 
                  className="h-11 justify-start gap-2 px-3 border-border/60 hover:bg-muted/50 rounded-xl"
                >
                  <Activity className={`h-4 w-4 ${isLiveDrainRunning ? 'animate-pulse' : ''} text-indigo-500`} />
                  <div className="text-left font-sans">
                    <p className="text-xs font-semibold">Immediate Queue Drain</p>
                    <p className="text-[10px] text-muted-foreground">Trigger drainOfflineQueue()</p>
                  </div>
                </Button>
              </div>
            </div>

            {liveSyncTestResults && (
              <div className="mt-4 p-3 border rounded-xl bg-muted/10 text-xs space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">Sync Action Execution Result:</p>
                  <span className="text-[10px] text-muted-foreground font-mono">{liveSyncTestResults.timestamp}</span>
                </div>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Action: <span className="text-foreground font-mono font-bold bg-muted/40 px-1 py-0.5 rounded">{liveSyncTestResults.action}</span>
                </p>
                <ResultBadge 
                  success={liveSyncTestResults.success} 
                  message={liveSyncTestResults.message} 
                />
              </div>
            )}
            <TestStepLogs logs={testLogs.liveSync} />

            {/* Live Payloads & Packets Explorer */}
            <div className="border-t pt-4 mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                    <Eye size={16} className="text-primary animate-pulse" /> Live Payloads & Packets Explorer
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Inspect actual transaction objects, state snapshots, and synchronization payloads.
                  </p>
                </div>
                {/* Logger persistence controller */}
                <Button variant="outline" size="sm" onClick={handleClearCloudLogs} className="text-xs text-destructive border-destructive/20 hover:bg-destructive/10">
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear Cloud Logs
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 bg-muted/30 p-1.5 rounded-lg border">
                <button
                  type="button"
                  onClick={() => { setActivePayloadTab('zustand'); handleFetchPayload('zustand'); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activePayloadTab === 'zustand' ? 'bg-background shadow-sm text-foreground border border-border/30' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Local Store Snapshot (Zustand)
                </button>
                <button
                  type="button"
                  onClick={() => { setActivePayloadTab('offline_queue'); handleFetchPayload('offline_queue'); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activePayloadTab === 'offline_queue' ? 'bg-background shadow-sm text-foreground border border-border/30' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Offline Mutation Queue (Local)
                </button>
                <button
                  type="button"
                  onClick={() => { setActivePayloadTab('firestore'); handleFetchPayload('firestore'); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activePayloadTab === 'firestore' ? 'bg-background shadow-sm text-foreground border border-border/30' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cloud Firestore Document (Server)
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Source: {activePayloadTab === 'zustand' ? 'In-Memory State Stores' : activePayloadTab === 'offline_queue' ? 'Local Storage Queue' : 'Firestore database'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => handleFetchPayload(activePayloadTab)}
                    disabled={isFetchingInspectedPayload}
                  >
                    {isFetchingInspectedPayload ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Retrieve Payload
                  </Button>
                </div>

                {inspectedPayload ? (
                  <div className="relative border rounded-lg bg-black text-green-400 font-mono text-xs overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 bg-black/50 text-white/50 text-[10px]">
                      <span>RAW PAYLOAD JSON</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-white/50 hover:text-white"
                        onClick={async () => {
                          await navigator.clipboard.writeText(JSON.stringify(inspectedPayload, null, 2));
                          toast({ title: 'Copied!', description: 'Payload JSON copied to clipboard.' });
                        }}
                      >
                        <CopyIcon className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <ScrollArea className="h-[250px] w-full p-3 font-mono leading-relaxed select-all">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(inspectedPayload, null, 2)}</pre>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-8 text-center bg-muted/10">
                    <Eye className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">No payload loaded yet.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click "Retrieve Payload" to load and view active synchronization data.</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <SectionHeader title="Database Operations" icon={Database} description="Test fundamental CRUD operations on various data models." />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save size={20} /> Simple DB Save (TestEntry)</CardTitle>
            <CardDescription>Basic create operation on the TestEntry model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={testDataInput} onChange={(e) => setTestDataInput(e.target.value)} placeholder="Enter data to save" />
            <Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
              {isSavingData ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Save Single Test Data'}
            </Button>
            {saveResult && <ResultBadge success={saveResult.success} message={saveResult.message} duration={saveResult.duration} />}
            <TestStepLogs logs={testLogs.simpleSave} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download size={20} /> Simple DB Fetch (TestEntry)</CardTitle>
            <CardDescription>Basic read operation on the TestEntry model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
              {isFetchingData ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Fetch Latest Single Test Data'}
            </Button>
            {fetchResult && <ResultBadge success={fetchResult.success} message={fetchResult.message} duration={fetchResult.duration} />}
            {fetchedData && (
              <div className="space-y-1 border p-3 rounded-md bg-muted/50 text-xs">
                <p><strong>ID:</strong> {fetchedData.id}</p>
                <p><strong>Data:</strong> {fetchedData.data}</p>
                <p><strong>Created:</strong> {isValid(new Date(fetchedData.createdAt)) ? format(new Date(fetchedData.createdAt), 'PPpp') : 'Invalid Date'}</p>
              </div>
            )}
            <TestStepLogs logs={testLogs.simpleFetch} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><FileSignature size={20}/> Full CRUD Cycle (TestEntry)</CardTitle><CardDescription>Tests Create, Read, Update, Delete operations on `TestEntry` model, including cleanup.</CardDescription></CardHeader><CardContent className="space-y-3">
          <Button onClick={handleRunCrudTests} disabled={isCrudTesting} className="w-full">
            {isCrudTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run All CRUD Tests'}
          </Button>
          {crudTestLog.length > 0 && (<ScrollArea className="h-[200px] w-full border rounded-md p-3 bg-muted/50 text-xs">{crudTestLog.map((log, i) => <p key={i} className="font-mono whitespace-pre-wrap">{log}</p>)}</ScrollArea>)}</CardContent></Card>

        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><DatabaseZap size={20} /> Comprehensive Save & Cleanup Test</CardTitle><CardDescription>Tests transactional create and delete for core models (Transaction, Debt).</CardDescription></CardHeader><CardContent className="space-y-3">
            <Button onClick={handleComprehensiveSaveTest} disabled={isComprehensiveSaveTesting} className="w-full">
                {isComprehensiveSaveTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Run Comprehensive Save Test'}
            </Button>
            {comprehensiveSaveTestResult && (
                <div className="mt-3 space-y-1 text-xs border p-2 rounded-md bg-muted/10">
                    <ResultBadge success={comprehensiveSaveTestResult.success} message={comprehensiveSaveTestResult.message} duration={comprehensiveSaveTestResult.duration} />
                    {comprehensiveSaveTestResult.details && (
                        <pre className="p-2 bg-muted/50 rounded-sm text-xs whitespace-pre-wrap">{JSON.stringify(comprehensiveSaveTestResult.details, null, 2)}</pre>
                    )}
                </div>
            )}
        </CardContent></Card>

        <SectionHeader title="Authentication & User Info" icon={Users} description="Verify Firebase Authentication and user profile retrieval." />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server size={20} /> Server-Side Firebase Auth User Info</CardTitle>
            <CardDescription>Fetches authenticated user metadata and claims via Server Action.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchServerClerkUserInfo} disabled={isServerClerkUserInfoLoading} className="w-full">
              {isServerClerkUserInfoLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Fetch Server Firebase Auth User Info'}
            </Button>
            {serverClerkUserInfoError && <ResultBadge success={false} message={serverClerkUserInfoError} />}
            {serverClerkUserInfo && (
              <ScrollArea className="h-[200px] w-full border rounded-md p-3 bg-muted/50 text-xs">
                <pre>{JSON.stringify(serverClerkUserInfo, null, 2)}</pre>
              </ScrollArea>
            )}
            <TestStepLogs logs={testLogs.fetchServerAuth} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone size={20} /> Client-Side Firebase Auth User Info</CardTitle><CardDescription>Displays user info directly from the `useUser()` hook and Firebase Auth context on the client.</CardDescription></CardHeader><CardContent className="space-y-3 text-xs">{!isClientClerkLoaded ? (<p>Loading user info (client-side)...</p>) : !isClientUserSignedIn ? (<ResultBadge success={false} message="Not signed in (client-side)" />) : clientClerkUser ? (<div className="p-3 border rounded-md bg-muted/50"><p><strong>Full Name:</strong> {clientClerkUser.fullName || "N/A"}</p><p><strong>User ID / UID:</strong> {clientClerkUser.id}</p><p><strong>Email:</strong> {clientClerkUser.primaryEmailAddress?.emailAddress || "N/A"}</p><Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1" onClick={() => openDetailViewer("Client-Side Firebase User Object", clientClerkUser)}>View Full Object</Button></div>) : (<ResultBadge success={false} message="User data not available (client-side), though signed in." />)}</CardContent></Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={20} /> Backend-Frontend Auth Status & Firestore Sync</CardTitle>
            <CardDescription>Verifies automated bidirectional authentication synchronization between Firebase Auth, Firestore profile, and frontend state management.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleVerifyAuthSync} disabled={isAuthSyncTesting} className="w-full">
              {isAuthSyncTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying Sync...</> : 'Verify Backend-Frontend Auth Sync'}
            </Button>
            {authSyncResult && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <ResultBadge success={authSyncResult.success} message={authSyncResult.message} duration={authSyncResult.duration} />
                {authSyncResult.syncReport && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 font-mono text-xs">
                    <div className="p-2 border rounded bg-background">
                      <p className="font-semibold text-foreground mb-1">Server Authentication</p>
                      <p>UID: {authSyncResult.syncReport.serverUserId || 'None'}</p>
                      <p>Email: {authSyncResult.syncReport.serverUserEmail || 'None'}</p>
                      <p>Role: <Badge variant="outline" className="text-xs ml-1">{authSyncResult.syncReport.serverRole || 'None'}</Badge></p>
                    </div>
                    <div className="p-2 border rounded bg-background">
                      <p className="font-semibold text-foreground mb-1">Cloud Firestore State</p>
                      <p>Profile Exists: {authSyncResult.syncReport.firestoreUserExists ? 'Yes (Active)' : 'No'}</p>
                      <p>Firestore Role: {authSyncResult.syncReport.firestoreRole || 'None'}</p>
                      <p>DB ID: {authSyncResult.syncReport.firestoreDbId || 'default'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <TestStepLogs logs={testLogs.authSync} />
          </CardContent>
        </Card>

      </div>
      <DetailViewerDialog title={detailViewTitle} content={detailViewContent} isOpen={isDetailViewerOpen} onClose={() => setIsDetailViewerOpen(false)} />
    
      {/* Dialog for the Stale Hash Simulation Test */}
      <DataSyncMismatchDialog
        isOpen={isStaleHashTestDialogVisible}
        onClose={() => setIsStaleHashTestDialogVisible(false)}
        onForceSave={handleSimulatedForceSave}
        onForceFetch={handleSimulatedForceFetch}
      />
    </div>
  );
};

export default AdminConnectionTestPage;

