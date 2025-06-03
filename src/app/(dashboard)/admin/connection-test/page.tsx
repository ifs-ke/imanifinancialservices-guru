
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
import { checkDatabaseConnection, saveTestData, fetchTestData, getHashForServerComparison } from '@/app/actions/adminTestActions';
import { PageHeader } from '@/components/layout/PageHeader';
import { TestTube, DatabaseZap, AlertTriangle, CheckCircle, RotateCcw, Save, Download, HashIcon, Server, Timer, Link2, Info, Eye, Copy as CopyIcon } from 'lucide-react';
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
  content: string;
  isOpen: boolean;
  onClose: () => void;
}

const DetailViewerDialog: React.FC<DetailViewerProps> = ({ title, content, isOpen, onClose }) => {
  const { toast } = useToast();
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
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
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-3 rounded-md overflow-x-auto">{content}</pre>
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

  const [detailViewTitle, setDetailViewTitle] = useState('');
  const [detailViewContent, setDetailViewContent] = useState('');
  const [isDetailViewerOpen, setIsDetailViewerOpen] = useState(false);

  const openDetailViewer = (title: string, content: string) => {
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
      } else {
        throw new Error(serverResult.message || "Failed to get hash from server.");
      }
    } catch (error: any) {
      setClientServerHashError(error.message);
    } finally {
      setIsClientServerHashTesting(false);
    }
  };

  const handleSaveTestData = async () => {
    setIsSavingData(true);
    setSaveResult(null);
    const result = await saveTestData(testDataInput);
    setSaveResult(result);
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

  const ResultBadge: React.FC<{ success: boolean; message: string; duration?: number }> = ({ success, message, duration }) => (
    <Badge variant={success ? "default" : "destructive"} className="text-sm p-2 w-full justify-start gap-2">
      {success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span>{message}</span>
      {duration !== undefined && <span className="ml-auto text-xs flex items-center gap-1"><Timer size={12}/>{duration.toFixed(0)}ms</span>}
    </Badge>
  );

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader title="Admin Connection & Utility Tests" icon={<TestTube />} description="Verify core application functionalities." />

      <div className="flex-1 px-4 md:px-6 lg:px-8 grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={20} /> Zustand Persistence
              <Button variant="ghost" size="icon" className="h-5 w-5" title="Tests if Zustand state (e.g., 'Statement Start Date') correctly persists in Session Storage across page refreshes. (HoverCard component missing)">
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
            <CardTitle className="flex items-center gap-2"><Link2 size={20}/> Client-Server Hash Consistency</CardTitle>
            <CardDescription>Tests if client & server produce identical hashes for the same data string. Uses `fast-json-stable-stringify` and SHA-256.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-2 border rounded-md bg-muted/30">
                <p className="text-xs font-medium mb-1">Sample Data (Client-Side):</p>
                <Textarea value={JSON.stringify(clientServerHashTestData, null, 2).substring(0, 100) + "..."} readOnly rows={2} className="text-xs bg-muted/50" title="Sample Data"/>
                <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Sample Client-Server Hash Data", JSON.stringify(clientServerHashTestData, null, 2))}>View Full Data</Button>
            </div>
            <Button onClick={handleClientServerHashTest} disabled={isClientServerHashTesting} className="w-full">
              {isClientServerHashTesting ? 'Testing...' : 'Run Client-Server Hash Test'}
            </Button>
             {clientServerHashError && <Badge variant="destructive" className="text-sm p-2 w-full justify-start gap-1"><AlertTriangle size={14}/>{clientServerHashError}</Badge>}
            {clientCalculatedHash && (
              <div className="space-y-2 mt-2 text-xs border p-3 rounded-md bg-muted/10">
                <p><strong>Client Prepared String (sent to server):</strong> <Button variant="link" size="sm" className="p-0 h-auto text-xs ml-1" onClick={() => openDetailViewer("Client Prepared String", clientPreparedStringForServer)}>View</Button></p>
                <Textarea value={clientPreparedStringForServer.substring(0,150) + (clientPreparedStringForServer.length > 150 ? "..." : "")} readOnly rows={2} className="bg-muted/50 font-mono"/>
                
                <div className="flex justify-between items-center">
                    <span><strong>Client Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{clientCalculatedHash.substring(0,32)}...</span></span>
                    <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Client Calculated Hash", clientCalculatedHash)}>View Full</Button>
                </div>
                 <div className="flex justify-between items-center">
                    <span><strong>Server Hash:</strong> <span className="font-mono bg-muted/50 p-1 rounded">{serverCalculatedHash ? serverCalculatedHash.substring(0,32) + "..." : 'N/A'}</span></span>
                    {serverCalculatedHash && <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => openDetailViewer("Server Calculated Hash", serverCalculatedHash)}>View Full</Button>}
                </div>

                {serverHashingDuration !== null && <p><Timer size={12} className="inline mr-1"/>Server Hashing Duration: {serverHashingDuration.toFixed(0)}ms</p>}
                <Badge variant={clientServerHashMatchResult === true ? "default" : clientServerHashMatchResult === false ? "destructive" : "secondary"} className="text-sm p-2 w-full justify-start gap-1">
                   {clientServerHashMatchResult === true ? <CheckCircle size={16}/> : clientServerHashMatchResult === false ? <AlertTriangle size={16}/> : <Info size={16}/>}
                   Hashes Match: {clientServerHashMatchResult === true ? 'Yes' : clientServerHashMatchResult === false ? 'No' : 'N/A'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save size={20} /> Database Saving (TestEntry)</CardTitle>
            <CardDescription>Tests saving sample data to the TestEntry model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={testDataInput} onChange={(e) => setTestDataInput(e.target.value)} placeholder="Enter data to save" />
            <Button onClick={handleSaveTestData} disabled={isSavingData || !testDataInput.trim()} className="w-full">
              {isSavingData ? 'Saving...' : 'Save Test Data'}
            </Button>
            {saveResult && <ResultBadge success={saveResult.success} message={saveResult.message} duration={saveResult.duration} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download size={20} /> Database Fetching (TestEntry)</CardTitle>
            <CardDescription>Tests fetching the latest TestEntry for the user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleFetchTestData} disabled={isFetchingData} className="w-full">
              {isFetchingData ? 'Fetching...' : 'Fetch Latest Test Data'}
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

