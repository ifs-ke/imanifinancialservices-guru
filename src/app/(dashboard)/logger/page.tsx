// src/app/(dashboard)/logger/page.tsx
 'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Filter, RotateCw, XCircle, AlertTriangle, Info, MessageSquare, Terminal, Copy, Eye, CopyCheck } from 'lucide-react'; // Added Copy, Eye, CopyCheck
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// Define a more specific type for log entries captured by this page
interface CapturedLogEntry {
  id: string; // Add an ID for selection purposes
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'log'; // 'log' for generic console.log
  message: string;
  context?: string; // Store context as a string for display
}

let logIdCounter = 0;
const generateLogId = () => `log_${logIdCounter++}_${Date.now()}`;

export default function LoggerPage() {
  const [capturedLogs, setCapturedLogs] = useState<CapturedLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { toast } = useToast();

  const [selectedLogDetail, setSelectedLogDetail] = useState<CapturedLogEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Capture console logs
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    const createLogEntry = (level: CapturedLogEntry['level'], args: any[]): CapturedLogEntry => {
      const messageParts: string[] = [];
      let contextParts: string[] = [];
      args.forEach(arg => {
        if (typeof arg === 'string') {
          messageParts.push(arg);
        } else if (arg instanceof Error) {
          messageParts.push(arg.message);
          if (arg.stack) contextParts.push(`Stack: ${arg.stack}`);
        } else {
          try {
            contextParts.push(JSON.stringify(arg, null, 2));
          } catch {
            contextParts.push('[Unserializable Object]');
          }
        }
      });
      return {
        id: generateLogId(),
        timestamp: new Date(),
        level,
        message: messageParts.join(' ') || 'No message',
        context: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      };
    };

    console.log = (...args: any[]) => {
      originalConsole.log(...args);
      setCapturedLogs(prev => [createLogEntry('log', args), ...prev].slice(0, 200)); // Keep last 200 logs
    };
    console.info = (...args: any[]) => {
      originalConsole.info(...args);
      setCapturedLogs(prev => [createLogEntry('info', args), ...prev].slice(0, 200));
    };
    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      setCapturedLogs(prev => [createLogEntry('warn', args), ...prev].slice(0, 200));
    };
    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      setCapturedLogs(prev => [createLogEntry('error', args), ...prev].slice(0, 200));
    };
    console.debug = (...args: any[]) => {
      originalConsole.debug(...args);
      setCapturedLogs(prev => [createLogEntry('debug', args), ...prev].slice(0, 200));
    };

    // Initial message to confirm logger page is active
    console.info("LoggerPage: Live log capture activated for this session.");

    return () => {
      // Restore original console methods on unmount
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return capturedLogs.filter(log => {
      const levelMatch = levelFilter === 'all' || log.level.toLowerCase() === levelFilter;
      const searchMatch = !searchTerm ||
        log.message.toLowerCase().includes(lowerSearchTerm) ||
        log.level.toLowerCase().includes(lowerSearchTerm) ||
        (log.context && log.context.toLowerCase().includes(lowerSearchTerm));
      return levelMatch && searchMatch;
    });
  }, [capturedLogs, levelFilter, searchTerm]);

  const getBadgeVariant = (level: CapturedLogEntry['level']): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (level.toLowerCase()) {
      case 'error': return 'destructive';
      case 'warn': return 'secondary';
      case 'info': return 'default';
      case 'debug': return 'outline';
      case 'log': return 'outline';
      default: return 'outline';
    }
  };

  const getIconForLevel = (level: CapturedLogEntry['level']) => {
    switch (level.toLowerCase()) {
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-primary" />;
      case 'debug': return <Terminal className="h-4 w-4 text-muted-foreground" />;
      case 'log': return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const handleClearLogs = () => {
    setCapturedLogs([]);
    console.info("LoggerPage: Cleared locally captured session logs.");
  };

  const formatLogForCopy = (log: CapturedLogEntry): string => {
    return `[${format(log.timestamp, 'PPpp')}] [${log.level.toUpperCase()}] ${log.message}${log.context ? `\nContext:\n${log.context}` : ''}`;
  };

  const handleCopyLog = async (log: CapturedLogEntry) => {
    const logString = formatLogForCopy(log);
    try {
      await navigator.clipboard.writeText(logString);
      toast({ title: "Log Copied", description: "Log entry copied to clipboard." });
    } catch (err) {
      toast({ title: "Copy Failed", description: "Could not copy log to clipboard.", variant: "destructive" });
      console.error("Failed to copy log:", err);
    }
  };

  const handleCopyAllVisibleLogs = async () => {
    if (filteredLogs.length === 0) {
      toast({ title: "No Logs", description: "There are no logs to copy." });
      return;
    }
    const allLogsString = filteredLogs.map(formatLogForCopy).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(allLogsString);
      toast({ title: "All Visible Logs Copied", description: `${filteredLogs.length} log entries copied.` });
    } catch (err) {
      toast({ title: "Copy Failed", description: "Could not copy logs.", variant: "destructive" });
      console.error("Failed to copy all logs:", err);
    }
  };

  const handleViewLogDetails = (log: CapturedLogEntry) => {
    setSelectedLogDetail(log);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Application Logger
        </h1>
        <p className="text-muted-foreground text-sm">
          View client-side console logs captured during this session. Server logs are in Vercel.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Session Log Entries</CardTitle>
            <CardDescription>Live events and errors from your current browser session.</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs h-9 flex-grow sm:flex-grow-0"
            />
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-full sm:w-[120px] h-9">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="log">Log</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleCopyAllVisibleLogs} className="h-9" disabled={filteredLogs.length === 0}>
              <CopyCheck className="h-4 w-4 mr-1" /> Copy Visible
            </Button>
            <Button variant="outline" size="icon" onClick={handleClearLogs} className="h-9 w-9">
              <RotateCw className="h-4 w-4" />
              <span className="sr-only">Clear Session Logs</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] w-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[100px]">Level</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[100px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow 
                        key={log.id} 
                        className="text-xs hover:bg-muted/50 cursor-pointer" 
                        onClick={() => handleViewLogDetails(log)}
                        title="Click to view details"
                    >
                      <TableCell className="font-mono whitespace-nowrap">
                        {format(log.timestamp, 'PPpp')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getBadgeVariant(log.level)} className="capitalize flex items-center gap-1">
                          {getIconForLevel(log.level)}
                          <span>{log.level}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap break-words max-w-xl truncate" title={log.message}>{log.message}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyLog(log);}} title="Copy this log" className="h-7 w-7">
                            <Copy className="h-4 w-4" />
                        </Button>
                         <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleViewLogDetails(log);}} title="View details" className="h-7 w-7">
                            <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      {searchTerm || levelFilter !== 'all' ? 'No logs found matching your criteria.' : 'No logs captured yet in this session.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLogDetail && getIconForLevel(selectedLogDetail.level)}
              Log Details
            </DialogTitle>
            {selectedLogDetail && (
                <DialogDescription>
                    {format(selectedLogDetail.timestamp, 'PPPPpppp')} - Level: {selectedLogDetail.level.toUpperCase()}
                </DialogDescription>
            )}
          </DialogHeader>
          {selectedLogDetail && (
            <ScrollArea className="max-h-[60vh] mt-4 pr-2">
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm mb-1">Message:</h4>
                  <p className="text-sm whitespace-pre-wrap break-words bg-muted p-2 rounded-md">{selectedLogDetail.message}</p>
                </div>
                {selectedLogDetail.context && (
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Context / Details:</h4>
                    <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-3 rounded-md overflow-x-auto">{selectedLogDetail.context}</pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="mt-4">
            {selectedLogDetail && (
                 <Button variant="outline" onClick={() => handleCopyLog(selectedLogDetail)}><Copy className="mr-2 h-4 w-4"/>Copy Details</Button>
            )}
            <DialogClose asChild>
              <Button type="button">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

