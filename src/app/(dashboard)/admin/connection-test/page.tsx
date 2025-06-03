
// src/app/(dashboard)/admin/connection-test/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useStatementStore } from '@/store/statementStore';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { checkDatabaseConnection, saveTestData, fetchTestData, getHashForServerComparison } from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save, Download, HashIcon, Server, Timer, Link2 } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { logDebug } from '@/lib/logger';
import { Separator } from '@/components/ui/separator';

const AdminConnectionTestPage: React.FC = () => {
  const { toast } = useToast();
  const { startDate, setStartDate, isHydrated: isStatementStoreHydrated } = useStatementStore();

  const [dbConnectionResult, setDbConnectionResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isDbConnectionTesting, setIsDbConnectionTesting] = useState(false);

  const [localHashTestData, setLocalHashTestData] = useState<any>({ name: "Test Data", value: 123, nested: { date: new Date().toISOString() } });
  const [preparedLocalHashString, setPreparedLocalHashString] = useState('');
  const [generatedLocalHash, setGeneratedLocalHash] = useState('');
  const [localVerificationResult, setLocalVerificationResult] = useState<boolean | null>(null);
  const [localMismatchVerificationResult, setLocalMismatchVerificationResult] = useState<boolean | null>(null);

  const [clientServerHashTestData] = useState<any>({ user: "testUser", id: 99, timestamp: new Date().toISOString(), items: [1, "a", true] });
  const [clientPreparedStringForServer, setClientPreparedStringForServer] = useState('');
  const [clientCalculatedHash, setClientCalculatedHash] = useState('');
  const [serverCalculatedHash, setServerCalculatedHash] = useState('');
  const [serverHashingDuration, setServerHashingDuration] = useState<number | null>(null);
  const [clientServerHashMatchResult, setClientServerHashMatchResult] = useState<boolean | null>(null);
  const [isClientServerHashTesting, setIsClientServerHashTesting] = useState(false);
  const [clientServerHashError, setClientServerHashError] = useState<string | null>(null);


  const [testDataInput, setTestDataInput] = useState('Sample test data for saving.');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);

  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string; duration?: number } | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);

  const handleDbConnectionTest = async () => {
    setIsDbConnectionTesting(true);
    setDbConnectionResult(null);
    const result = await checkDatabaseConnection();
    setDbConnectionResult(result);
    toast({ title: result.success ? 'DB Test Success' : 'DB Test Failed', description: `${result.message}${result.duration ? ` (Took ${result.duration.toFixed(0)}ms)` : ''}`, variant: result.success ? 'default' : 'destructive' });
    setIsDbConnectionTesting(false);
  };

  const handleLocalHashTest = async () => {
    const prepared = prepareDataForHashing(localHashTestData);
    const str = stringify(prepared);
    setPreparedLocalHashString(str);
    const hash = await hashData(str);
    setGeneratedLocalHash(hash);
    const isValidHash = await verifyHash(str, hash);
    setLocalVerificationResult(isValidHash);
    const isMismatchValid = await verifyHash(str, "deliberately_wrong_hash_string_for_testing");
    setLocalMismatchVerificationResult(isMismatchValid);
  };

  const handleClientServerHashTest = async () => {
    setIsClientServerHashTesting(true);
    setClientServerHashError(null);
    setClientCalculatedHash('');
    setServerCalculatedHash('');
    setServerHashingDuration(null);
    setClientServerHashMatchResult(null);

    try {
      const preparedClientData = prepareDataForHashing(clientServerHashTestData);
      const clientString = stringify(preparedClientData);
      setClientPreparedStringForServer(clientString);

      const localClientHash = await hashData(clientString);
      setClientCalculatedHash(localClientHash);

      logDebug("Calling getHashForServerComparison with client string:", { clientStringLength: clientString.length });
      const serverResult = await getHashForServerComparison(clientString);

      if (serverResult.success && serverResult.serverHash) {
        setServerCalculatedHash(serverResult.serverHash);
        setServerHashingDuration(serverResult.duration || null);
        setClientServerHashMatchResult(localClientHash === serverResult.serverHash);
        toast({ title: "Client-Server Hash Test Complete", description: localClientHash === serverResult.serverHash ? "Hashes match!" : "Hashes DO NOT match!", variant: localClientHash === serverResult.serverHash ? 'default' : 'destructive' });
      } else {
        throw new Error(serverResult.message || "Failed to get hash from server.");
      }
    } catch (error: any) {
      setClientServerHashError(error.message);
      toast({ title: "Client-Server Hash Test Error", description: error.message, variant: "destructive" });
    } finally {
      setIsClientServerHashTesting(false);
    }
  };


  const handleSaveTestData = async () => {
    setIsSavingData(true);
    setSaveResult(null);
    const result = await saveTestData(testDataInput);
    setSaveResult(result);
    toast({ title: result.success ? 'Save Test Success' : 'Save Test Failed', description: `${result.message}${result.duration ? ` (Took ${result.duration.toFixed(0)}ms)` : ''}`, variant: result.success ? 'default' : 'destructive' });
    setIsSavingData(false);
  };

  const handleFetchTestData = async () => {
    setIsFetchingData(true);
    setFetchResult(null);
    setFetchedData(null);
    const result = await fetchTestData();
    setFetchResult({ success: result.success, message: result.message, duration: result.duration });
    if (result.success && result.data) {
      setFetchedData(result.data);
    }
    toast({ title: result.success ? 'Fetch Test Success' : 'Fetch Test Failed', description: `${result.message}${result.duration ? ` (Took ${result.duration.toFixed(0)}ms)` : ''}`, variant: result.success ? 'default' : 'destructive' });
    setIsFetchingData(false);
  };

  const handleZustandDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = parse(e.target.value, 'yyyy-MM-dd', new Date());
    if (isValid(newDate)) {
      setStartDate(newDate);
    } else {
      setStartDate(undefined);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader title="Admin Connection & Utility Tests" icon={<TestTube />} description="Verify core application functionalities." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RotateCcw size={20} /> Zustand Persistence</CardTitle>
            <CardDescription>Tests if Zustand state persists in session storage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">The "Statement Start Date" from Statement Settings is used. Change it, refresh the page. If it persists, test is successful.</p>
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
              <div className={`p-3 rounded-md text-sm ${dbConnectionResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {dbConnectionResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {dbConnectionResult.message}
                {dbConnectionResult.duration !== undefined && <span className="block text-xs mt-1"><Timer size={12} className="inline mr-1"/>Duration: {dbConnectionResult.duration.toFixed(0)}ms</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HashIcon size={20} /> Local Hash Utilities</CardTitle>
            <CardDescription>Tests client-side data hashing & verification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={JSON.stringify(localHashTestData, null, 2)} readOnly rows={3} className="text-xs bg-muted/50" />
            <Button onClick={handleLocalHashTest} className="w-full">Run Local Hash Test</Button>
            {preparedLocalHashString && (
              <>
                <Textarea title="Prepared String" value={preparedLocalHashString} readOnly rows={2} className="text-xs bg-muted/50" />
                <Input title="Generated Hash" value={generatedLocalHash} readOnly className="text-xs bg-muted/50 font-mono" />
                <div className={`text-sm flex items-center gap-1 ${localVerificationResult ? 'text-accent-foreground' : 'text-destructive-foreground'}`}>Verification (Correct Hash): {localVerificationResult === true ? <CheckCircle size={16}/> : localVerificationResult === false ? <AlertTriangle size={16}/> : 'N/A'}</div>
                <div className={`text-sm flex items-center gap-1 ${!localMismatchVerificationResult ? 'text-accent-foreground' : 'text-destructive-foreground'}`}>Verification (Incorrect Hash): {!localMismatchVerificationResult === true ? <CheckCircle size={16}/> : !localMismatchVerificationResult === false ? <AlertTriangle size={16}/> : 'N/A'}</div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 size={20}/> Client-Server Hash Consistency</CardTitle>
            <CardDescription>Tests if client & server produce identical hashes for the same data string.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={JSON.stringify(clientServerHashTestData, null, 2)} readOnly rows={3} className="text-xs bg-muted/50" title="Sample Data to Hash"/>
            <Button onClick={handleClientServerHashTest} disabled={isClientServerHashTesting} className="w-full">
              {isClientServerHashTesting ? 'Testing...' : 'Run Client-Server Hash Test'}
            </Button>
             {clientServerHashError && <p className="text-sm text-destructive"><AlertTriangle className="inline mr-1 h-4 w-4"/>{clientServerHashError}</p>}
            {clientCalculatedHash && (
              <div className="space-y-2 mt-2 text-xs">
                <p><strong>Client Prepared String (sent to server):</strong></p>
                <Textarea value={clientPreparedStringForServer} readOnly rows={2} className="bg-muted/50 font-mono"/>
                <p><strong>Client Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{clientCalculatedHash}</span></p>
                <p><strong>Server Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{serverCalculatedHash || 'N/A'}</span></p>
                {serverHashingDuration !== null && <p><Timer size={12} className="inline mr-1"/>Server Hashing Duration: {serverHashingDuration.toFixed(0)}ms</p>}
                <div className={`text-sm flex items-center gap-1 font-semibold ${clientServerHashMatchResult === true ? 'text-accent-foreground' : clientServerHashMatchResult === false ? 'text-destructive-foreground' : ''}`}>
                  Hashes Match: {clientServerHashMatchResult === true ? <CheckCircle size={16}/> : clientServerHashMatchResult === false ? <AlertTriangle size={16}/> : 'N/A'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save size={20} /> Database Saving</CardTitle>
            <CardDescription>Tests saving sample data to the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={testDataInput} onChange={(e) => setTestDataInput(e.target.value)} placeholder="Enter data to save" />
            <Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
              {isSavingData ? 'Saving...' : 'Save Test Data'}
            </Button>
            {saveResult && (
              <div className={`p-3 rounded-md text-sm ${saveResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {saveResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {saveResult.message}
                {saveResult.duration !== undefined && <span className="block text-xs mt-1"><Timer size={12} className="inline mr-1"/>Duration: {saveResult.duration.toFixed(0)}ms</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download size={20} /> Database Fetching</CardTitle>
            <CardDescription>Tests fetching the latest sample entry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
              {isFetchingData ? 'Fetching...' : 'Fetch Latest Test Data'}
            </Button>
            {fetchResult && (
              <div className={`p-3 rounded-md text-sm mb-2 ${fetchResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {fetchResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {fetchResult.message}
                {fetchResult.duration !== undefined && <span className="block text-xs mt-1"><Timer size={12} className="inline mr-1"/>Duration: {fetchResult.duration.toFixed(0)}ms</span>}
              </div>
            )}
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
    </div>
  );
};

export default AdminConnectionTestPage;
