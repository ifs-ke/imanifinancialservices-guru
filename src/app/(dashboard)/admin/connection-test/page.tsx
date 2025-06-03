
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
import { checkDatabaseConnection, saveTestData, fetchTestData } from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save, Download, HashIcon } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { logDebug } from '@/lib/logger';

const AdminConnectionTestPage: React.FC = () => {
  const { toast } = useToast();
  const { startDate, setStartDate, isHydrated: isStatementStoreHydrated } = useStatementStore();

  const [dbConnectionResult, setDbConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isDbConnectionTesting, setIsDbConnectionTesting] = useState(false);

  const [hashTestData, setHashTestData] = useState<any>({ name: "Test Data", value: 123, nested: { date: new Date().toISOString() } });
  const [preparedHashString, setPreparedHashString] = useState('');
  const [generatedHash, setGeneratedHash] = useState('');
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [mismatchVerificationResult, setMismatchVerificationResult] = useState<boolean | null>(null);

  const [testDataInput, setTestDataInput] = useState('Sample test data for saving.');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingData, setIsSavingData] = useState(false);

  const [fetchedData, setFetchedData] = useState<any | null>(null);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isFetchingData, setIsFetchingData] = useState(false);

  const [sessionStorageTestDate, setSessionStorageTestDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (isStatementStoreHydrated) {
      setSessionStorageTestDate(startDate);
    }
  }, [isStatementStoreHydrated, startDate]);

  const handleDbConnectionTest = async () => {
    setIsDbConnectionTesting(true);
    setDbConnectionResult(null);
    const result = await checkDatabaseConnection();
    setDbConnectionResult(result);
    toast({ title: result.success ? 'DB Test Success' : 'DB Test Failed', description: result.message, variant: result.success ? 'default' : 'destructive' });
    setIsDbConnectionTesting(false);
  };

  const handleHashTest = async () => {
    const prepared = prepareDataForHashing(hashTestData);
    const str = stringify(prepared);
    setPreparedHashString(str);
    const hash = await hashData(str);
    setGeneratedHash(hash);
    const isValid = await verifyHash(str, hash);
    setVerificationResult(isValid);
    const isMismatchValid = await verifyHash(str, "deliberately_wrong_hash_string_for_testing");
    setMismatchVerificationResult(isMismatchValid);
  };

  const handleSaveTestData = async () => {
    setIsSavingData(true);
    setSaveResult(null);
    const result = await saveTestData(testDataInput);
    setSaveResult(result);
    toast({ title: result.success ? 'Save Test Success' : 'Save Test Failed', description: result.message, variant: result.success ? 'default' : 'destructive' });
    setIsSavingData(false);
  };

  const handleFetchTestData = async () => {
    setIsFetchingData(true);
    setFetchResult(null);
    setFetchedData(null);
    const result = await fetchTestData();
    setFetchResult({ success: result.success, message: result.message });
    if (result.success && result.data) {
      setFetchedData(result.data);
    }
    toast({ title: result.success ? 'Fetch Test Success' : 'Fetch Test Failed', description: result.message, variant: result.success ? 'default' : 'destructive' });
    setIsFetchingData(false);
  };

  const handleZustandDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    if (isValid(newDate)) {
      setStartDate(newDate);
      setSessionStorageTestDate(newDate); // Keep local state in sync for display
    } else {
      setStartDate(undefined); // Or handle invalid date
      setSessionStorageTestDate(undefined);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader title="Admin Connection Tests" icon={<TestTube />} description="Verify core application functionalities." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Zustand Persistence Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RotateCcw size={20} /> Zustand Persistence (Session Storage)</CardTitle>
            <CardDescription>Tests if Zustand state persists in session storage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              The "Statement Start Date" from the Statement Settings store is used for this test.
              Change it below, then refresh the page. If the date persists, the test is successful.
            </p>
            <div>
              <label htmlFor="zustand-date" className="text-sm font-medium">Statement Start Date:</label>
              {!isStatementStoreHydrated ? (
                 <Skeleton className="h-9 w-full mt-1" />
              ) : (
                <Input
                  type="date"
                  id="zustand-date"
                  value={sessionStorageTestDate ? format(sessionStorageTestDate, 'yyyy-MM-dd') : ''}
                  onChange={handleZustandDateChange}
                  className="mt-1"
                />
              )}
            </div>
            {isStatementStoreHydrated && sessionStorageTestDate && (
              <p className="text-xs text-muted-foreground">
                Current value in store: {format(sessionStorageTestDate, 'PP')}
              </p>
            )}
             {!isStatementStoreHydrated && (<p className="text-xs text-muted-foreground">Store hydrating...</p>)}
            <p className="text-xs text-primary p-2 bg-primary/10 rounded-md">
              After changing the date, refresh the page. The date should remain the same if persistence is working.
            </p>
          </CardContent>
        </Card>

        {/* Database Connection Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap size={20} /> Database Connection</CardTitle>
            <CardDescription>Tests basic connectivity to the configured database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDbConnectionTest} disabled={isDbConnectionTesting} className="w-full">
              {isDbConnectionTesting ? 'Testing...' : 'Run DB Connection Test'}
            </Button>
            {dbConnectionResult && (
              <div className={`p-3 rounded-md text-sm ${dbConnectionResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {dbConnectionResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {dbConnectionResult.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hash Matching Test */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HashIcon size={20} /> Hash Matching</CardTitle>
            <CardDescription>Tests data hashing and verification utilities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Sample Data (JSON):</p>
              <Textarea value={JSON.stringify(hashTestData, null, 2)} readOnly rows={4} className="text-xs bg-muted/50" />
            </div>
            <Button onClick={handleHashTest} className="w-full">Run Hash Test</Button>
            {preparedHashString && (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Prepared & Stringified Data:</p>
                  <Textarea value={preparedHashString} readOnly rows={3} className="text-xs bg-muted/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Generated SHA-256 Hash:</p>
                  <Input value={generatedHash} readOnly className="text-xs bg-muted/50 font-mono" />
                </div>
                <div className={`text-sm flex items-center gap-1 ${verificationResult ? 'text-accent-foreground' : 'text-destructive-foreground'}`}>
                  Verification (Correct Hash): {verificationResult === true ? <CheckCircle size={16}/> : verificationResult === false ? <AlertTriangle size={16}/> : 'N/A'}
                </div>
                <div className={`text-sm flex items-center gap-1 ${!mismatchVerificationResult ? 'text-accent-foreground' : 'text-destructive-foreground'}`}>
                   Verification (Incorrect Hash): {!mismatchVerificationResult === true ? <CheckCircle size={16}/> : !mismatchVerificationResult === false ? <AlertTriangle size={16}/> : 'N/A'}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Database Saving Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save size={20} /> Database Saving</CardTitle>
            <CardDescription>Tests saving a sample entry to the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={testDataInput}
              onChange={(e) => setTestDataInput(e.target.value)}
              placeholder="Enter data to save"
            />
            <Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
              {isSavingData ? 'Saving...' : 'Save Test Data'}
            </Button>
            {saveResult && (
              <div className={`p-3 rounded-md text-sm ${saveResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {saveResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {saveResult.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Fetching Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download size={20} /> Database Fetching</CardTitle>
            <CardDescription>Tests fetching the latest sample entry from the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
              {isFetchingData ? 'Fetching...' : 'Fetch Latest Test Data'}
            </Button>
            {fetchResult && (
              <div className={`p-3 rounded-md text-sm mb-2 ${fetchResult.success ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'}`}>
                {fetchResult.success ? <CheckCircle className="inline mr-2 h-4 w-4" /> : <AlertTriangle className="inline mr-2 h-4 w-4" />}
                {fetchResult.message}
              </div>
            )}
            {fetchedData && (
              <div className="space-y-1 border p-3 rounded-md bg-muted/50">
                <p className="text-xs font-medium">Fetched Entry:</p>
                <p className="text-xs"><strong>ID:</strong> {fetchedData.id}</p>
                <p className="text-xs"><strong>Data:</strong> {fetchedData.data}</p>
                <p className="text-xs"><strong>Created:</strong> {isValid(new Date(fetchedData.createdAt)) ? format(new Date(fetchedData.createdAt), 'PPpp') : 'Invalid Date'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminConnectionTestPage;

