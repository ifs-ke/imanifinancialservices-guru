
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
  verifyClientDataHashAction,
  simulateSaveWithPotentialMismatchAction,
} from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save, Download, HashIcon, Server, Timer, Link2, Info, Eye, Copy as CopyIcon, Database, CircleSlash, UserCircle2, ShieldCheck, ShieldAlert, FileSignature, Loader2 } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useUser } from "@clerk/nextjs";

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Full content details. You can select and copy the text below.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] mt-4 pr-2">
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-3 rounded-md overflow-x-auto">{displayContent}</pre>
        </ScrollArea>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCopyToClipboard}><CopyIcon className="mr-2 h-4 w-4" />Copy to Clipboard</Button>
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


const AdminConnectionTestPage: React.FC = () => {
  const { toast } = useToast();
  const { startDate, setStartDate, isHydrated: isStatementStoreHydrated } = useStatementStore();
  const { isSignedIn: isClientUserSignedIn, user: clientClerkUser, isLoaded: isClientClerkLoaded } = useUser();

  const [dbConnectionResult, setDbConnectionResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isDbConnectionTesting, setIsDbConnectionTesting] = useState(false);

  const [csStringTestData] = useState<any>({ user: "testUser", id: 99, timestamp: new Date().toISOString(), items: [1, "a", true] });
  const [csClientPreparedString, setCsClientPreparedString] = useState('');
  const [csClientCalculatedHash, setCsClientCalculatedHash] = useState('');
  const [csServerCalculatedHash, setCsServerCalculatedHash] = useState('');
  const [csServerHashingDuration, setCsServerHashingDuration] = useState<number | null>(null);
  const [csHashMatchResult, setCsHashMatchResult] = useState<boolean | null>(null);
  const [isCsStringHashTesting, setIsCsStringHashTesting] = useState(false);
  const [csStringHashError, setCsStringHashError] = useState<string | null>(null);

  const [csObjectTestData] = useState<any>({ itemA: "valueA", itemB: 123, itemC: null, itemD: [1,2,3], date: new Date() });
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
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);

  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);

  const [crudTestLog, setCrudTestLog] = useState<string[]>([]);
  const [isCrudTesting, setIsCrudTesting] = useState(false);

  const [serverClerkUserInfo, setServerClerkUserInfo] = useState<Record<string, any> | null>(null);
  const [isServerClerkUserInfoLoading, setIsServerClerkUserInfoLoading] = useState(false);
  const [serverClerkUserInfoError, setServerClerkUserInfoError] = useState<string | null>(null);

  const [integrityTestData, setIntegrityTestData] = useState<any>(
    { id: "tx_1", date: new Date().toISOString(), description: "Coffee", amount: -3.50, type: "expense", items: [{id:1, qty:2}, {id:2, qty:1}] }
  );
  const [integrityTestClientPreparedString, setIntegrityTestClientPreparedString] = useState('');
  const [integrityTestClientHash, setIntegrityTestClientHash] = useState('');
  const [integrityTestServerResult, setIntegrityTestServerResult] = useState<Awaited<ReturnType<typeof verifyClientDataHashAction>> | null>(null);
  const [isIntegrityTesting, setIsIntegrityTesting] = useState(false);

  const [mismatchInitialData, setMismatchInitialData] = useState<any>(null);
  const [mismatchInitialHash, setMismatchInitialHash] = useState<string | null>(null);
  const [mismatchModifiedDataString, setMismatchModifiedDataString] = useState<string>('');
  const [mismatchSimulationResult, setMismatchSimulationResult] = useState<Awaited<ReturnType<typeof simulateSaveWithPotentialMismatchAction>> | null>(null);
  const [isMismatchSimulating, setIsMismatchSimulating] = useState(false);


  const [detailViewTitle, setDetailViewTitle] = useState('');
  const [detailViewContent, setDetailViewContent] = useState<string | object>('');
  const [isDetailViewerOpen, setIsDetailViewerOpen] = useState(false);

  const openDetailViewer = (title: string, content: string | object) => {
    setDetailViewTitle(title);
    setDetailViewContent(content);
    setIsDetailViewerOpen(true);
  };

  const handleDbConnectionTest = async () => {
    setIsDbConnectionTesting(true); setDbConnectionResult(null);
    try {
      const result = await checkDatabaseConnection();
      setDbConnectionResult(result);
    } catch (error: any) {
      setDbConnectionResult({ success: false, message: error.message || "Client-side error during DB connection test."});
    } finally {
      setIsDbConnectionTesting(false);
    }
  };

  const handleCsStringHashTest = async () => {
    setIsCsStringHashTesting(true); setCsStringHashError(null); setCsClientCalculatedHash(''); setCsServerCalculatedHash(''); setCsServerHashingDuration(null); setCsHashMatchResult(null);
    try {
      const preparedClientData = prepareDataForHashing(csStringTestData);
      const clientString = stringify(preparedClientData);
      setCsClientPreparedString(clientString);
      const localClientHash = await hashData(clientString);
      setCsClientCalculatedHash(localClientHash);
      const serverResult = await getHashForServerComparison(clientString);
      if (serverResult.success && serverResult.serverHash) {
        setCsServerCalculatedHash(serverResult.serverHash);
        setCsServerHashingDuration(serverResult.duration || null);
        setCsHashMatchResult(localClientHash === serverResult.serverHash);
      } else { throw new Error(serverResult.message || "Failed to get hash from server for string test."); }
    } catch (error: any) { setCsStringHashError(error.message);
    } finally { setIsCsStringHashTesting(false); }
  };

  const handleCsObjectHashTest = async () => {
    setIsCsObjectHashTesting(true); setCsObjectHashError(null); setCsObjClientPreparedString(''); setCsObjClientHash(''); setCsObjServerPreparedString(''); setCsObjServerHash(''); setCsObjPrepMatch(null); setCsObjHashMatch(null);
    try {
      const clientPreparedData = prepareDataForHashing(csObjectTestData);
      const clientPreparedString = stringify(clientPreparedData);
      setCsObjClientPreparedString(clientPreparedString);
      const clientHash = await hashData(clientPreparedString);
      setCsObjClientHash(clientHash);

      const serverResult = await getHashForServerPreparedObject(csObjectTestData);
      if (serverResult.success && serverResult.serverPreparedString && serverResult.serverHash) {
        setCsObjServerPreparedString(serverResult.serverPreparedString);
        setCsObjServerHash(serverResult.serverHash);
        setCsObjPrepMatch(clientPreparedString === serverResult.serverPreparedString);
        setCsObjHashMatch(clientHash === serverResult.serverHash);
      } else { throw new Error(serverResult.message || "Failed to get prepared object hash from server."); }
    } catch (error: any) { setCsObjectHashError(error.message);
    } finally { setIsCsObjectHashTesting(false); }
  };

  const handleVerifyHashUtilityTest = async () => {
    const results = [];
    const data = "Test data for verifyHash";
    const correctHash = await hashData(data);
    const wrongHash = "deliberatelywronghash12345";
    const differentData = "Different test data";

    results.push({ description: "Correct hash", expected: true, actual: await verifyHash(data, correctHash), data, hash: correctHash, stringToVerify: data });
    results.push({ description: "Incorrect hash", expected: false, actual: await verifyHash(data, wrongHash), data, hash: wrongHash, stringToVerify: data });
    results.push({ description: "Correct hash, wrong data", expected: false, actual: await verifyHash(differentData, correctHash), data: differentData, hash: correctHash, stringToVerify: differentData });
    setVerifyHashTestResults(results);
  };

  const handleRunIntegrityTest = async () => {
    setIsIntegrityTesting(true);
    setIntegrityTestServerResult(null);
    setIntegrityTestClientPreparedString('');
    setIntegrityTestClientHash('');
    try {
      const clientPreparedData = prepareDataForHashing(integrityTestData);
      const clientPreparedString = stringify(clientPreparedData);
      const clientHash = await hashData(clientPreparedString);
      setIntegrityTestClientPreparedString(clientPreparedString);
      setIntegrityTestClientHash(clientHash);

      const serverResult = await verifyClientDataHashAction(integrityTestData, clientHash);
      setIntegrityTestServerResult(serverResult);
    } catch (error: any) {
      setIntegrityTestServerResult({ success: false, message: `Client-side error: ${error.message}` });
    } finally {
      setIsIntegrityTesting(false);
    }
  };

  const handleFetchInitialDataForMismatch = async () => {
    const initialData = { id: 'test-obj-1', value: 100, name: 'Initial Test Object', timestamp: new Date().toISOString() };
    setMismatchInitialData(initialData);
    const prepared = prepareDataForHashing(initialData);
    const hash = await hashData(stringify(prepared));
    setMismatchInitialHash(hash);
    setMismatchModifiedDataString(JSON.stringify(initialData, null, 2)); // Use initialData directly
    setMismatchSimulationResult(null);
    toast({ title: "Step 1 Complete", description: "Initial data and hash generated for mismatch test." });
  };

  const handleAttemptSaveWithMismatch = async () => {
    // Ensure we use the most current string from state for parsing.
    const currentMismatchModifiedDataString = mismatchModifiedDataString;

    if (!mismatchInitialHash || !currentMismatchModifiedDataString) {
      toast({ title: "Error", description: "Please complete Step 1 first or ensure modified data is valid JSON.", variant: "destructive" });
      return;
    }
    setIsMismatchSimulating(true);
    setMismatchSimulationResult(null);
    try {
      // Parse the string from the textarea (which should reflect edits)
      const modifiedData = JSON.parse(currentMismatchModifiedDataString);
      
      // Send a shallow copy of the parsed object to the server action to be absolutely sure
      // it's not an unintentionally shared reference, though this is unlikely the root cause.
      const result = await simulateSaveWithPotentialMismatchAction(
        { ...modifiedData }, 
        mismatchInitialHash
      );
      setMismatchSimulationResult(result);
    } catch (error: any) {
      setMismatchSimulationResult({ success: false, message: `Client-side error: ${error.message}. Ensure modified data is valid JSON.` });
    } finally {
      setIsMismatchSimulating(false);
    }
  };

  const handleSaveTestData = async () => {
    setIsSavingData(true); setSaveResult(null);
    try {
      const result = await saveTestData(testDataInput);
      setSaveResult(result);
      if (result.success) toast({ title: "Save Test", description: result.message });
      else toast({ title: "Save Test Failed", description: result.message, variant: "destructive" });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during save test.";
      setSaveResult({ success: false, message });
      toast({ title: "Save Test Error", description: message, variant: "destructive" });
    } finally {
      setIsSavingData(false);
    }
  };
  
  const handleFetchTestData = async () => {
    setIsFetchingData(true); setFetchResult(null); setFetchedData(null);
    try {
      const result = await fetchTestData();
      setFetchResult(result);
      if (result.success && result.data) setFetchedData(result.data);
      if (result.success) toast({ title: "Fetch Test", description: result.message });
      else toast({ title: "Fetch Test Failed", description: result.message, variant: "destructive" });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during fetch test.";
      setFetchResult({ success: false, message });
      toast({ title: "Fetch Test Error", description: message, variant: "destructive" });
    } finally {
      setIsFetchingData(false);
    }
  };

  const handleFetchServerClerkUserInfo = async () => {
    setIsServerClerkUserInfoLoading(true); setServerClerkUserInfo(null); setServerClerkUserInfoError(null);
    try {
      const result = await getClerkUserInfo();
      if (result.success && result.userInfo) setServerClerkUserInfo(result.userInfo);
      else if (!result.success) setServerClerkUserInfoError(result.message);
      toast({ title: "Clerk User Info (Server)", description: result.message, variant: result.success ? "default" : "destructive" });
    } catch (error: any) {
      const message = error.message || "An unexpected error occurred fetching server Clerk info.";
      setServerClerkUserInfoError(message);
      toast({ title: "Clerk User Info Error", description: message, variant: "destructive" });
    } finally {
      setIsServerClerkUserInfoLoading(false);
    }
  };

  const handleRunCrudTests = async () => {
    setIsCrudTesting(true);
    setCrudTestLog([]);
    const log = (message: string) => setCrudTestLog(prev => [...prev, message]);

    try {
      log("Starting CRUD tests...");

      log("Attempting to delete all previous test entries...");
      const deleteAllRes = await deleteAllUserTestEntries();
      log(`Delete all result: ${deleteAllRes.message} (Count: ${deleteAllRes.count ?? 'N/A'})`);
      if (!deleteAllRes.success && deleteAllRes.count === undefined) {
          throw new Error(`Failed to clear previous test entries: ${deleteAllRes.message}`);
      }

      log("\nCreating 3 new test entries...");
      const entriesToCreate = [{ data: "Entry A" }, { data: "Entry B" }, { data: "Entry C" }];
      const createRes = await createMultipleTestEntries(entriesToCreate);
      log(`Create multiple result: ${createRes.message}`);
      if (!createRes.success || !createRes.createdIds || createRes.createdIds.length !== 3) {
        throw new Error(`Failed to create test entries. Result: ${createRes.message}`);
      }
      const [idA, idB, idC] = createRes.createdIds;
      log(`Created IDs: A=${idA}, B=${idB}, C=${idC}`);

      log("\nReading all test entries...");
      const readRes = await readAllTestEntries();
      log(`Read all result: ${readRes.message}`);
      if (!readRes.success || !readRes.entries) throw new Error("Failed to read test entries.");
      log(`Found ${readRes.entries.length} entries. Expected 3.`);
      if (readRes.entries.length !== 3) {
          log("Entries found: " + JSON.stringify(readRes.entries.map(e => ({id: e.id, data: e.data}))))
          throw new Error(`Entry count mismatch after create. Expected 3, got ${readRes.entries.length}.`);
      }
      const entryBExists = readRes.entries.find(e => e.id === idB && e.data === "Entry B");
      if (!entryBExists) throw new Error(`Entry B (ID: ${idB}) not found or data mismatch after create.`);
      log("Initial entries verified.");

      log(`\nUpdating Entry B (ID: ${idB}) to "Entry B - Updated"...`);
      const updateRes = await updateSingleTestEntry(idB, "Entry B - Updated");
      log(`Update result: ${updateRes.message}`);
      if (!updateRes.success) throw new Error(`Failed to update Entry B. Result: ${updateRes.message}`);
      const readAfterUpdateRes = await readAllTestEntries();
      const updatedEntryB = readAfterUpdateRes.entries?.find(e => e.id === idB);
      if (!updatedEntryB || updatedEntryB.data !== "Entry B - Updated") {
        throw new Error(`Entry B not updated correctly. Found: ${JSON.stringify(updatedEntryB)}`);
      }
      log("Entry B updated and verified.");

      log(`\nDeleting Entry A (ID: ${idA})...`);
      const deleteARes = await deleteSingleTestEntry(idA);
      log(`Delete A result: ${deleteARes.message}`);
      if (!deleteARes.success) throw new Error(`Failed to delete Entry A. Result: ${deleteARes.message}`);
      const readAfterDeleteARes = await readAllTestEntries();
      if (readAfterDeleteARes.entries?.length !== 2) {
        throw new Error(`Entry count mismatch after deleting A. Expected 2, got ${readAfterDeleteARes.entries?.length}.`);
      }
      if (readAfterDeleteARes.entries?.find(e => e.id === idA)) throw new Error("Entry A still found after deletion.");
      log("Entry A deleted and verified.");

      log("\nDeleting all remaining test entries for user...");
      const finalDeleteRes = await deleteAllUserTestEntries();
      log(`Final delete all result: ${finalDeleteRes.message} (Count: ${finalDeleteRes.count ?? 'N/A'})`);
      if (!finalDeleteRes.success || finalDeleteRes.count !== 2) {
        throw new Error(`Failed to delete remaining entries. Expected 2, got ${finalDeleteRes.count ?? 0}. Result: ${finalDeleteRes.message}`);
      }
      const readAfterFinalDeleteRes = await readAllTestEntries();
      if (readAfterFinalDeleteRes.entries?.length !== 0) {
        throw new Error(`Entries still found after final delete all. Count: ${readAfterFinalDeleteRes.entries?.length}.`);
      }
      log("All test entries successfully cleaned up.");

      log("\nCRUD tests completed successfully!");
      toast({ title: "CRUD Tests", description: "All CRUD operations passed." });

    } catch (error: any) {
      const message = error.message || "An unexpected error occurred during CRUD tests.";
      log(`\nCRUD TEST FAILED: ${message}`);
      log(`Stack: ${error.stack || 'N/A'}`);
      toast({ title: "CRUD Test Failed", description: message, variant: "destructive" });
    } finally {
      setIsCrudTesting(false);
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

  const ResultBadge: React.FC<{ success?: boolean; message?: string; children?: React.ReactNode; duration?: number, variant?: "default" | "destructive" | "secondary" | "outline" | null | undefined, icon?: React.ElementType }> = ({ success, message, children, duration, variant, icon: Icon }) => {
    const actualVariant = success === undefined ? "secondary" : (success ? "default" : "destructive");
    const ActualIcon = Icon || (success === undefined ? Info : (success ? CheckCircle : AlertTriangle));
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
      <PageHeader title="Admin Connection & Utility Tests" icon={<TestTube />} description="Verify core application functionalities." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 md:grid-cols-2">
        
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw size={20} /> Zustand Persistence</CardTitle><CardDescription>Checks Session Storage persistence.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><label htmlFor="zustand-date" className="text-sm font-medium">Statement Start Date:</label>{!isStatementStoreHydrated ? <Skeleton className="h-9 w-full mt-1" /> : (<Input type="date" id="zustand-date" value={startDate && isValid(startDate) ? format(startDate, 'yyyy-MM-dd') : ''} onChange={handleZustandDateChange} className="mt-1"/>)}</div>
            {isStatementStoreHydrated && startDate && isValid(startDate) && (<p className="text-xs text-muted-foreground">Current store value: {format(startDate, 'PP')}</p>)}
            {!isStatementStoreHydrated && (<p className="text-xs text-muted-foreground">Store hydrating...</p>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DatabaseZap size={20} /> Database Connection</CardTitle><CardDescription>Tests connectivity to the database via Prisma.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDbConnectionTest} disabled={isDbConnectionTesting} className="w-full">
              {isDbConnectionTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isDbConnectionTesting ? 'Testing...' : 'Run DB Connection Test'}
            </Button>
            {dbConnectionResult && (<ResultBadge success={dbConnectionResult.success} message={dbConnectionResult.message} duration={dbConnectionResult.duration} />)}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><HashIcon size={20}/> Hashing & Data Preparation Consistency</CardTitle><CardDescription>Tests hashing algorithm and data preparation logic consistency between client and server.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="p-3 border rounded-md space-y-3"><h4 className="font-semibold text-sm">Test 1: String-to-Hash Consistency</h4><Textarea value={JSON.stringify(csStringTestData, null, 2).substring(0,100)+"..."} readOnly rows={1} className="text-xs bg-muted/50 font-mono" /><Button onClick={handleCsStringHashTest} disabled={isCsStringHashTesting} className="w-full">{isCsStringHashTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{isCsStringHashTesting ? 'Testing...' : 'Run String Hash Test'}</Button>{csStringHashError && <ResultBadge success={false} message={csStringHashError}/>}{csClientCalculatedHash && (<div className="space-y-1 mt-2 text-xs border p-2 rounded-md bg-muted/10"><p>Client Hash: <span className="font-mono">{csClientCalculatedHash.substring(0,20)}...</span></p><p>Server Hash: <span className="font-mono">{csServerCalculatedHash ? csServerCalculatedHash.substring(0,20)+"..." : 'N/A'}</span></p><ResultBadge success={csHashMatchResult===true} message={`Hashes Match: ${csHashMatchResult===true ? 'Yes' : 'No'}`} duration={csServerHashingDuration ?? undefined}/></div>)}</div>
            <div className="p-3 border rounded-md space-y-3"><h4 className="font-semibold text-sm">Test 2: Data Preparation & Hashing Consistency</h4><Textarea value={JSON.stringify(csObjectTestData, null, 2).substring(0,100)+"..."} readOnly rows={1} className="text-xs bg-muted/50 font-mono" /><Button onClick={handleCsObjectHashTest} disabled={isCsObjectHashTesting} className="w-full">{isCsObjectHashTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{isCsObjectHashTesting ? 'Testing...' : 'Run Data Prep & Hash Test'}</Button>{csObjectHashError && <ResultBadge success={false} message={csObjectHashError}/>}{csObjClientPreparedString && (<div className="space-y-1 mt-2 text-xs border p-2 rounded-md bg-muted/10"><ResultBadge success={csObjPrepMatch===true} message={`Prepared Strings Match: ${csObjPrepMatch===true ? 'Yes' : 'No'}`}/><ResultBadge success={csObjHashMatch===true} message={`Hashes Match: ${csObjHashMatch===true ? 'Yes' : 'No'}`}/></div>)}</div>
            <div className="p-3 border rounded-md space-y-3"><h4 className="font-semibold text-sm">Test 3: Client-Side `verifyHash` Utility</h4><Button onClick={handleVerifyHashUtilityTest} className="w-full">Run `verifyHash` Tests</Button>{verifyHashTestResults.length > 0 && (<div className="space-y-1 mt-2 text-xs border p-2 rounded-md bg-muted/10">{verifyHashTestResults.map((res, i) => (<ResultBadge key={i} success={res.expected === res.actual}>{res.description}: Expected {String(res.expected)}, Got {String(res.actual)}</ResultBadge>))}</div>)}</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={20}/> Data Integrity End-to-End Verification</CardTitle>
            <CardDescription>Client prepares data, hashes it, sends both to server. Server re-prepares received data, re-hashes, and compares.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="integrity-data" className="text-xs font-medium">Test Data (JSON):</label>
              <Textarea id="integrity-data" value={JSON.stringify(integrityTestData, null, 2)} onChange={(e) => { try { setIntegrityTestData(JSON.parse(e.target.value)); } catch { /* ignore parse error while typing */ }}} rows={4} className="text-xs font-mono"/>
            </div>
            <Button onClick={handleRunIntegrityTest} disabled={isIntegrityTesting} className="w-full">
              {isIntegrityTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isIntegrityTesting ? 'Verifying...' : 'Run Client-Server Hash Verification Test'}
            </Button>
            {integrityTestServerResult && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <h5 className="font-semibold mb-1">Verification Result:</h5>
                <p><strong>Client Prepared String (sent to server action):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Integrity Test: Client Prepared String", integrityTestClientPreparedString)}>View</Button></p>
                  <Textarea value={integrityTestClientPreparedString.substring(0,100) + "..."} readOnly rows={1} className="bg-muted/50 font-mono"/>
                <div className="flex justify-between items-center"><span><strong>Client Hash (sent to server):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{integrityTestClientHash.substring(0,20)}...</span></span><Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Integrity Test: Client Hash", integrityTestClientHash)}>Full</Button></div>
                <p><strong>Server Calculated Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{integrityTestServerResult.serverCalculatedHash ? integrityTestServerResult.serverCalculatedHash.substring(0,20)+'...' : 'N/A'}</span>
                    {integrityTestServerResult.serverCalculatedHash && <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Integrity Test: Server Hash", integrityTestServerResult.serverCalculatedHash!)}>Full</Button>}
                </p>
                <ResultBadge success={integrityTestServerResult.clientHashMatches} message={integrityTestServerResult.message} duration={integrityTestServerResult.duration} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert size={20}/> Save with Stale Hash (Mismatch Simulation)</CardTitle>
            <CardDescription>Tests if the server correctly rejects a save attempt when the client sends modified data with an old/stale hash.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 border rounded-md space-y-2">
                <h5 className="font-medium text-sm">Step 1: Simulate Initial State</h5>
                <Button onClick={handleFetchInitialDataForMismatch} size="sm" className="w-full">Fetch/Set Initial Data & Hash</Button>
                {mismatchInitialData && mismatchInitialHash && (
                    <div className="text-xs mt-1 space-y-0.5">
                        <p><strong>Initial Data (as object):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Mismatch Sim: Initial Data", mismatchInitialData)}>View</Button></p>
                        <p><strong>Initial (Stale) Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{mismatchInitialHash.substring(0,20)}...</span> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Mismatch Sim: Initial Hash", mismatchInitialHash)}>Full</Button></p>
                    </div>
                )}
            </div>
            {mismatchInitialData && mismatchInitialHash && (
                 <div className="p-3 border rounded-md space-y-2">
                    <h5 className="font-medium text-sm">Step 2: Modify Data Locally (JSON)</h5>
                    <Textarea
                        value={mismatchModifiedDataString}
                        onChange={(e) => setMismatchModifiedDataString(e.target.value)}
                        rows={5}
                        className="text-xs font-mono"
                        placeholder="Modify the JSON data here..."
                    />
                     <p className="text-xs text-muted-foreground">Example: Change 'value' from 100 to 150, or 'name'.</p>
                </div>
            )}
            {mismatchInitialData && mismatchInitialHash && (
                <div className="p-3 border rounded-md space-y-2">
                    <h5 className="font-medium text-sm">Step 3: Attempt Save</h5>
                     <Button onClick={handleAttemptSaveWithMismatch} disabled={isMismatchSimulating || !mismatchModifiedDataString.trim()} className="w-full">
                        {isMismatchSimulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isMismatchSimulating ? 'Simulating Save...' : 'Attempt Save (Modified Data, ORIGINAL Hash)'}
                    </Button>
                </div>
            )}
            {mismatchSimulationResult && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <h5 className="font-semibold mb-1">Mismatch Simulation Result:</h5>
                 <p><strong>Client Provided (Stale) Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{mismatchSimulationResult.clientProvidedOriginalHash ? mismatchSimulationResult.clientProvidedOriginalHash.substring(0,20)+'...' : 'N/A'}</span></p>
                 <p><strong>Server Calculated Hash of Data Sent:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{mismatchSimulationResult.serverHashOfDataSent ? mismatchSimulationResult.serverHashOfDataSent.substring(0,20)+'...' : 'N/A'}</span></p>
                 <ResultBadge
                    success={mismatchSimulationResult.mismatchDetected === false} 
                    message={mismatchSimulationResult.message}
                    duration={mismatchSimulationResult.duration}
                    icon={mismatchSimulationResult.mismatchDetected ? ShieldAlert : (mismatchSimulationResult.success ? ShieldCheck : AlertTriangle)} 
                 />
                 {mismatchSimulationResult.mismatchDetected === false && !mismatchSimulationResult.success && (
                    <p className="text-destructive mt-1">Note: Mismatch was NOT detected, but the server action reported failure. Check server logs.</p>
                 )}
                 {mismatchSimulationResult.mismatchDetected === false && mismatchSimulationResult.success && (
                    <p className="text-yellow-600 mt-1">Note: Mismatch was NOT detected and server reported success. Ensure data was actually modified client-side for a valid test.</p>
                 )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><Database size={20}/> Database CRUD Operations</CardTitle><CardDescription>Tests Create, Read, Update, Delete operations on `TestEntry` model.</CardDescription></CardHeader><CardContent className="space-y-3">
          <Button onClick={handleRunCrudTests} disabled={isCrudTesting} className="w-full">
            {isCrudTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isCrudTesting ? 'Testing CRUD...' : 'Run All CRUD Tests'}
          </Button>
          {crudTestLog.length > 0 && (<ScrollArea className="h-[200px] w-full border rounded-md p-3 bg-muted/50 text-xs">{crudTestLog.map((log, i) => <p key={i} className="font-mono whitespace-pre-wrap">{log}</p>)}</ScrollArea>)}</CardContent></Card>
        
        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><UserCircle2 size={20} /> Server-Side Clerk User Info Test</CardTitle><CardDescription>Fetches and displays authenticated user info via a Server Action.</CardDescription></CardHeader><CardContent className="space-y-3">
          <Button onClick={handleFetchServerClerkUserInfo} disabled={isServerClerkUserInfoLoading} className="w-full">
            {isServerClerkUserInfoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isServerClerkUserInfoLoading ? 'Fetching Server Info...' : 'Fetch Server Clerk User Info'}
          </Button>
          {serverClerkUserInfoError && <ResultBadge success={false} message={serverClerkUserInfoError} />}{serverClerkUserInfo && (<ScrollArea className="h-[200px] w-full border rounded-md p-3 bg-muted/50 text-xs"><pre>{JSON.stringify(serverClerkUserInfo, null, 2)}</pre></ScrollArea>)}</CardContent></Card>
        
        <Card className="md:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><UserCircle2 size={20} /> Client-Side Clerk User Info (Direct)</CardTitle><CardDescription>Displays user info directly from the `useUser()` hook on the client.</CardDescription></CardHeader><CardContent className="space-y-3 text-xs">{!isClientClerkLoaded ? (<p>Loading user info (client-side)...</p>) : !isClientUserSignedIn ? (<ResultBadge success={false} message="Not signed in (client-side)" />) : clientClerkUser ? (<div className="p-3 border rounded-md bg-muted/50"><p><strong>Full Name:</strong> {clientClerkUser.fullName || "N/A"}</p><p><strong>User ID:</strong> {clientClerkUser.id}</p><Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1" onClick={() => openDetailViewer("Client-Side Clerk User Object", clientClerkUser)}>View Full Object</Button></div>) : (<ResultBadge success={false} message="User data not available (client-side), though signed in." />)}</CardContent></Card>
        
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Save size={20} /> Simple DB Save (TestEntry)</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={testDataInput} onChange={(e) => setTestDataInput(e.target.value)} placeholder="Enter data to save" /><Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
          {isSavingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isSavingData ? 'Saving...' : 'Save Single Test Data'}
          </Button>{saveResult && <ResultBadge success={saveResult.success} message={saveResult.message} duration={saveResult.duration} />}</CardContent></Card>
        
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Download size={20} /> Simple DB Fetch (TestEntry)</CardTitle></CardHeader><CardContent className="space-y-3">
          <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
            {isFetchingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isFetchingData ? 'Fetching...' : 'Fetch Latest Single Test Data'}
          </Button>
          {fetchResult && <ResultBadge success={fetchResult.success} message={fetchResult.message} duration={fetchResult.duration} /> }{fetchedData && (<div className="space-y-1 border p-3 rounded-md bg-muted/50 text-xs"><p><strong>ID:</strong> {fetchedData.id}</p><p><strong>Data:</strong> {fetchedData.data}</p><p><strong>Created:</strong> {isValid(new Date(fetchedData.createdAt)) ? format(new Date(fetchedData.createdAt), 'PPpp') : 'Invalid Date'}</p></div>)}</CardContent></Card>

      </div>
      <DetailViewerDialog title={detailViewTitle} content={detailViewContent} isOpen={isDetailViewerOpen} onClose={() => setIsDetailViewerOpen(false)} />
    </div>
  );
};

export default AdminConnectionTestPage;
    
