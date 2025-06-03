
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
  getHashForServerPreparedObject, // New
  createMultipleTestEntries, // New
  readAllTestEntries, // New
  updateSingleTestEntry, // New
  deleteSingleTestEntry, // New
  deleteAllUserTestEntries, // New
} from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save, Download, HashIcon, Server, Timer, Link2, Info, Eye, Copy as CopyIcon, Database, CircleSlash } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { logDebug } from '@/lib/logger';
import { Separator } from '@/components/ui/separator';
// import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'; // Temporarily commented out
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

interface DetailViewerProps {
  title: string;
  content: string | object; // Allow object for raw data display
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

  const [dbConnectionResult, setDbConnectionResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isDbConnectionTesting, setIsDbConnectionTesting] = useState(false);

  // Client-Server Hash Test (String-to-Hash)
  const [csStringTestData] = useState<any>({ user: "testUser", id: 99, timestamp: new Date().toISOString(), items: [1, "a", true] });
  const [csClientPreparedString, setCsClientPreparedString] = useState('');
  const [csClientCalculatedHash, setCsClientCalculatedHash] = useState('');
  const [csServerCalculatedHash, setCsServerCalculatedHash] = useState('');
  const [csServerHashingDuration, setCsServerHashingDuration] = useState<number | null>(null);
  const [csHashMatchResult, setCsHashMatchResult] = useState<boolean | null>(null);
  const [isCsStringHashTesting, setIsCsStringHashTesting] = useState(false);
  const [csStringHashError, setCsStringHashError] = useState<string | null>(null);

  // Client-Server Hash Test (Object-to-String-to-Hash for Data Prep)
  const [csObjectTestData] = useState<any>({ itemA: "valueA", itemB: 123, itemC: null, itemD: [1,2,3], date: new Date() });
  const [csObjClientPreparedString, setCsObjClientPreparedString] = useState('');
  const [csObjClientHash, setCsObjClientHash] = useState('');
  const [csObjServerPreparedString, setCsObjServerPreparedString] = useState('');
  const [csObjServerHash, setCsObjServerHash] = useState('');
  const [csObjPrepMatch, setCsObjPrepMatch] = useState<boolean | null>(null);
  const [csObjHashMatch, setCsObjHashMatch] = useState<boolean | null>(null);
  const [isCsObjectHashTesting, setIsCsObjectHashTesting] = useState(false);
  const [csObjectHashError, setCsObjectHashError] = useState<string | null>(null);

  // Client-Side verifyHash Utility Test
  const [verifyHashTestResults, setVerifyHashTestResults] = useState<Array<{ description: string, expected: boolean, actual: boolean, data?: string, hash?: string, stringToVerify?: string }>>([]);

  const [testDataInput, setTestDataInput] = useState('Sample test data for saving.');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);

  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // CRUD Test States
  const [crudTestLog, setCrudTestLog] = useState<string[]>([]);
  const [isCrudTesting, setIsCrudTesting] = useState(false);
  const [createdEntryIds, setCreatedEntryIds] = useState<string[]>([]);

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
    const result = await checkDatabaseConnection();
    setDbConnectionResult(result);
    setIsDbConnectionTesting(false);
  };

  const handleCsStringHashTest = async () => {
    setIsCsStringHashTesting(true);
    setCsStringHashError(null); setCsClientCalculatedHash(''); setCsServerCalculatedHash(''); setCsServerHashingDuration(null); setCsHashMatchResult(null);
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
    setIsCsObjectHashTesting(true);
    setCsObjectHashError(null); setCsObjClientPreparedString(''); setCsObjClientHash(''); setCsObjServerPreparedString(''); setCsObjServerHash(''); setCsObjPrepMatch(null); setCsObjHashMatch(null);
    try {
      const clientPreparedData = prepareDataForHashing(csObjectTestData);
      const clientPreparedString = stringify(clientPreparedData);
      setCsObjClientPreparedString(clientPreparedString);
      const clientHash = await hashData(clientPreparedString);
      setCsObjClientHash(clientHash);

      const serverResult = await getHashForServerPreparedObject(csObjectTestData); // Send raw object
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

  const handleSaveTestData = async () => {
    setIsSavingData(true); setSaveResult(null);
    const result = await saveTestData(testDataInput);
    setSaveResult(result); setIsSavingData(false);
  };

  const handleFetchTestData = async () => {
    setIsFetchingData(true); setFetchResult(null); setFetchedData(null);
    const result = await fetchTestData();
    setFetchResult({ success: result.success, message: result.message, duration: result.duration });
    if (result.success && result.data) { setFetchedData(result.data); }
    setIsFetchingData(false);
  };

  const handleRunCrudTests = async () => {
    setIsCrudTesting(true); setCrudTestLog([]); setCreatedEntryIds([]);
    const log = (message: string) => setCrudTestLog(prev => [...prev, message]);

    log("Starting CRUD tests...");
    // 1. Create Multiple
    const entriesToCreate = [{ data: "CRUD Entry 1" }, { data: "CRUD Entry 2" }];
    const createResult = await createMultipleTestEntries(entriesToCreate);
    log(`Create Multiple: ${createResult.success ? `Success (${createResult.message})` : `Failed (${createResult.message})`} (${createResult.duration?.toFixed(0)}ms)`);
    if (createResult.success && createResult.createdIds) {
      setCreatedEntryIds(createResult.createdIds);
      log(`Created IDs: ${createResult.createdIds.join(', ')}`);

      // 2. Read All
      const readAllResult = await readAllTestEntries();
      log(`Read All: ${readAllResult.success ? `Success (${readAllResult.entries?.length} entries)` : `Failed (${readAllResult.message})`} (${readAllResult.duration?.toFixed(0)}ms)`);
      if (readAllResult.success && readAllResult.entries) {
        log(`Fetched IDs: ${readAllResult.entries.map(e => e.id).join(', ')}`);
      }

      // 3. Update One (if IDs exist)
      const idToUpdate = createResult.createdIds[0];
      if (idToUpdate) {
        const updateResult = await updateSingleTestEntry(idToUpdate, "CRUD Entry 1 - Updated");
        log(`Update One (${idToUpdate}): ${updateResult.success ? 'Success' : `Failed (${updateResult.message})`} (${updateResult.duration?.toFixed(0)}ms)`);
      } else { log("Skipping Update: No entry ID from create step."); }

      // 4. Delete One (if IDs exist)
      const idToDelete = createResult.createdIds[1] || idToUpdate; // Try second, fallback to first if only one created/left
      if (idToDelete) {
        const deleteResult = await deleteSingleTestEntry(idToDelete);
        log(`Delete One (${idToDelete}): ${deleteResult.success ? 'Success' : `Failed (${deleteResult.message})`} (${deleteResult.duration?.toFixed(0)}ms)`);
      } else { log("Skipping Delete: No entry ID available."); }
    }

    // 5. Delete All (Cleanup)
    log("Running Cleanup: Delete All User Test Entries...");
    const deleteAllRes = await deleteAllUserTestEntries();
    log(`Delete All: ${deleteAllRes.success ? `Success (${deleteAllRes.count} deleted)` : `Failed (${deleteAllRes.message})`} (${deleteAllRes.duration?.toFixed(0)}ms)`);
    log("CRUD tests completed.");
    setIsCrudTesting(false);
  };


  const handleZustandDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parse(e.target.value, 'yyyy-MM-dd', new Date());
    if (isValid(newDate)) { setStartDate(newDate); } else { setStartDate(undefined); }
  };

  const ResultBadge: React.FC<{ success: boolean; message?: string; children?: React.ReactNode; duration?: number, variant?: "default" | "destructive" | "secondary" | "outline" | null | undefined }> = ({ success, message, children, duration, variant }) => (
    <Badge variant={variant || (success ? "default" : "destructive")} className="text-sm p-2 w-full justify-start gap-2">
      {success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span>{message || children}</span>
      {duration !== undefined && <span className="ml-auto text-xs flex items-center gap-1"><Timer size={12}/>{duration.toFixed(0)}ms</span>}
    </Badge>
  );

  useEffect(() => { // Run verifyHash test on load
    handleVerifyHashUtilityTest();
  }, []);


  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader title="Admin Connection & Utility Tests" icon={<TestTube />} description="Verify core application functionalities." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={20} /> Zustand Persistence
              <Button variant="ghost" size="icon" className="h-5 w-5" title="Tests if Zustand state (e.g., 'Statement Start Date') correctly persists in Session Storage across page refreshes.">
                  <Info size={14} className="text-muted-foreground"/>
              </Button>
            </CardTitle>
            <CardDescription>Checks Session Storage persistence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label htmlFor="zustand-date" className="text-sm font-medium">Statement Start Date:</label>
              {!isStatementStoreHydrated ? <Skeleton className="h-9 w-full mt-1" /> : (
                <Input type="date" id="zustand-date" value={startDate && isValid(startDate) ? format(startDate, 'yyyy-MM-dd') : ''} onChange={handleZustandDateChange} className="mt-1"/>
              )}
            </div>
            {isStatementStoreHydrated && startDate && isValid(startDate) && (<p className="text-xs text-muted-foreground">Current store value: {format(startDate, 'PP')}</p>)}
            {!isStatementStoreHydrated && (<p className="text-xs text-muted-foreground">Store hydrating...</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap size={20} /> Database Connection</CardTitle>
            <CardDescription>Tests connectivity to the database via Prisma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDbConnectionTest} disabled={isDbConnectionTesting} className="w-full">
              {isDbConnectionTesting ? 'Testing...' : 'Run DB Connection Test'}
            </Button>
            {dbConnectionResult && (
               <div className={`p-3 rounded-md text-sm ${dbConnectionResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                {dbConnectionResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {dbConnectionResult.message}
                {dbConnectionResult.duration !== undefined && <span className="block text-xs mt-1"><Timer size={12} className="inline mr-1"/>Duration: {dbConnectionResult.duration.toFixed(0)}ms</span>}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HashIcon size={20}/> Hashing & Data Preparation Consistency</CardTitle>
            <CardDescription>Tests hashing algorithm and data preparation logic consistency between client and server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Test 1: String-to-Hash Consistency */}
            <div className="p-3 border rounded-md space-y-3">
              <h4 className="font-semibold text-sm">Test 1: String-to-Hash Consistency</h4>
              <p className="text-xs text-muted-foreground">Verifies that client and server produce identical hashes for an *already stringified and prepared* data payload.</p>
              <div className="p-2 border rounded-md bg-muted/30">
                  <p className="text-xs font-medium mb-1">Sample Data (Client-Side, Pre-prepared):</p>
                  <Textarea value={JSON.stringify(csStringTestData, null, 2).substring(0, 100) + "..."} readOnly rows={2} className="text-xs bg-muted/50" title="Sample Data"/>
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("String Test: Sample Data (Client)", csStringTestData)}>View Full Data</Button>
              </div>
              <Button onClick={handleCsStringHashTest} disabled={isCsStringHashTesting} className="w-full">
                {isCsStringHashTesting ? 'Testing...' : 'Run String Hash Test'}
              </Button>
              {csStringHashError && <ResultBadge success={false} message={csStringHashError}/>}
              {csClientCalculatedHash && (
                <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                  <p><strong>Client Prepared String (sent to server):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("String Test: Client Prepared String", csClientPreparedString)}>View</Button></p>
                  <Textarea value={csClientPreparedString.substring(0,100) + "..."} readOnly rows={1} className="bg-muted/50 font-mono"/>
                  <div className="flex justify-between items-center"><span><strong>Client Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{csClientCalculatedHash.substring(0,20)}...</span></span><Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("String Test: Client Hash", csClientCalculatedHash)}>Full</Button></div>
                  <div className="flex justify-between items-center"><span><strong>Server Hash (of client string):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{csServerCalculatedHash ? csServerCalculatedHash.substring(0,20) + "..." : 'N/A'}</span></span>{csServerCalculatedHash && <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("String Test: Server Hash", csServerCalculatedHash)}>Full</Button>}</div>
                  {csServerHashingDuration !== null && <p><Timer size={12} className="inline mr-1"/>Server Hashing Duration: {csServerHashingDuration.toFixed(0)}ms</p>}
                  <ResultBadge success={csHashMatchResult === true} message={`Hashes Match: ${csHashMatchResult === true ? 'Yes' : csHashMatchResult === false ? 'No' : 'N/A'}`}/>
                </div>
              )}
            </div>

            {/* Test 2: Object-to-String-to-Hash (Data Prep) Consistency */}
            <div className="p-3 border rounded-md space-y-3">
              <h4 className="font-semibold text-sm">Test 2: Data Preparation & Hashing Consistency</h4>
              <p className="text-xs text-muted-foreground">Client sends a raw JS object. Both client and server independently run `prepareDataForHashing` and `stringify`. Then both generated strings and their hashes are compared.</p>
              <div className="p-2 border rounded-md bg-muted/30">
                  <p className="text-xs font-medium mb-1">Sample Raw Object (Client-Side):</p>
                  <Textarea value={JSON.stringify(csObjectTestData, null, 2).substring(0, 100) + "..."} readOnly rows={2} className="text-xs bg-muted/50" title="Sample Object Data"/>
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Data Prep Test: Sample Raw Object (Client)", csObjectTestData)}>View Full Object</Button>
              </div>
              <Button onClick={handleCsObjectHashTest} disabled={isCsObjectHashTesting} className="w-full">
                {isCsObjectHashTesting ? 'Testing...' : 'Run Data Prep & Hash Test'}
              </Button>
              {csObjectHashError && <ResultBadge success={false} message={csObjectHashError}/>}
              {csObjClientPreparedString && (
                <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                  <p><strong>Client Prepared String:</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Data Prep Test: Client Prepared String", csObjClientPreparedString)}>View</Button></p>
                  <Textarea value={csObjClientPreparedString.substring(0,100) + "..."} readOnly rows={1} className="bg-muted/50 font-mono"/>
                  <p><strong>Server Prepared String:</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Data Prep Test: Server Prepared String", csObjServerPreparedString)}>View</Button></p>
                  <Textarea value={csObjServerPreparedString.substring(0,100) + "..."} readOnly rows={1} className="bg-muted/50 font-mono"/>
                  <ResultBadge success={csObjPrepMatch === true} message={`Prepared Strings Match: ${csObjPrepMatch === true ? 'Yes' : csObjPrepMatch === false ? 'No' : 'N/A'}`}/>

                  <div className="flex justify-between items-center mt-2 pt-2 border-t"><span><strong>Client Hash (of client string):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{csObjClientHash.substring(0,20)}...</span></span><Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Data Prep Test: Client Hash", csObjClientHash)}>Full</Button></div>
                  <div className="flex justify-between items-center"><span><strong>Server Hash (of server string):</strong> <span className="font-mono bg-muted/50 p-1 rounded">{csObjServerHash ? csObjServerHash.substring(0,20) + "..." : 'N/A'}</span></span>{csObjServerHash && <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Data Prep Test: Server Hash", csObjServerHash)}>Full</Button>}</div>
                  <ResultBadge success={csObjHashMatch === true} message={`Prepared String Hashes Match: ${csObjHashMatch === true ? 'Yes' : csObjHashMatch === false ? 'No' : 'N/A'}`}/>
                </div>
              )}
            </div>

            {/* Test 3: Client-Side verifyHash Utility */}
            <div className="p-3 border rounded-md space-y-3">
              <h4 className="font-semibold text-sm">Test 3: Client-Side `verifyHash` Utility</h4>
              <p className="text-xs text-muted-foreground">Tests the `verifyHash` function used by the client to check hashes from the server (e.g., during /api/sync).</p>
              <Button onClick={handleVerifyHashUtilityTest} className="w-full">Run `verifyHash` Utility Tests</Button>
              {verifyHashTestResults.length > 0 && (
                <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                  {verifyHashTestResults.map((res, i) => (
                    <ResultBadge key={i} success={res.expected === res.actual} variant={res.expected === res.actual ? "default" : "destructive"}>
                      {res.description}: Expected {String(res.expected)}, Got {String(res.actual)}
                      <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-2" onClick={() => openDetailViewer(`verifyHash Test: ${res.description}`, { dataToVerify: res.stringToVerify, hashUsed: res.hash, dataUsedForCorrectHash: res.data })}>Details</Button>
                    </ResultBadge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database size={20}/> Database CRUD Operations</CardTitle>
            <CardDescription>Tests Create, Read, Update, Delete operations on `TestEntry` model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleRunCrudTests} disabled={isCrudTesting} className="w-full">
              {isCrudTesting ? 'Testing CRUD...' : 'Run All CRUD Tests'}
            </Button>
            {crudTestLog.length > 0 && (
              <ScrollArea className="h-[200px] w-full border rounded-md p-3 bg-muted/50 text-xs">
                {crudTestLog.map((log, i) => <p key={i} className="font-mono whitespace-pre-wrap">{log}</p>)}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Original Save/Fetch TestEntry cards - could be removed if CRUD test is sufficient, or kept for simple single operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save size={20} /> Simple DB Save (TestEntry)</CardTitle>
            <CardDescription>Tests saving a single sample data string.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={testDataInput} onChange={(e) => setTestDataInput(e.target.value)} placeholder="Enter data to save" />
            <Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
              {isSavingData ? 'Saving...' : 'Save Single Test Data'}
            </Button>
            {saveResult && <ResultBadge success={saveResult.success} message={saveResult.message} duration={saveResult.duration} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download size={20} /> Simple DB Fetch (TestEntry)</CardTitle>
            <CardDescription>Tests fetching the latest single TestEntry for the user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
              {isFetchingData ? 'Fetching...' : 'Fetch Latest Single Test Data'}
            </Button>
            {fetchResult && <ResultBadge success={fetchResult.success} message={fetchResult.message} duration={fetchResult.duration} /> }
            {fetchedData && (
              <div className="space-y-1 border p-3 rounded-md bg-muted/50 text-xs">
                <p><strong>ID:</strong> {fetchedData.id}</p>
                <p><strong>Data:</strong> {fetchedData.data}</p>
                <p><strong>Created:</strong> {isValid(new Date(fetchedData.createdAt)) ? format(new Date(fetchedData.createdAt), 'PPpp') : 'Invalid Date'}</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
      <DetailViewerDialog title={detailViewTitle} content={detailViewContent} isOpen={isDetailViewerOpen} onClose={() => setIsDetailViewerOpen(false)} />
    </div>
  );
};

export default AdminConnectionTestPage;
    