// src/app/(dashboard)/logger/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  Filter, 
  XCircle, 
  AlertTriangle, 
  Info, 
  MessageSquare, 
  Terminal, 
  Copy, 
  Eye, 
  CopyCheck, 
  Search, 
  Trash2, 
  Activity, 
  ShieldAlert, 
  RefreshCw 
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface CapturedLogEntry {
  id: string; 
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'log';
  message: string;
  context?: string; 
}

let logIdCounter = 0;
const generateLogId = () => `log_${logIdCounter++}_${Date.now()}`;

export default function LoggerPage() {
  const { role, isLoaded } = useAuth();
  const [capturedLogs, setCapturedLogs] = useState<CapturedLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { toast } = useToast();

  const [selectedLogDetail, setSelectedLogDetail] = useState<CapturedLogEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    const savedLogs = localStorage.getItem('capturedLogs');
    if (savedLogs) {
      try {
        const parsedLogs: CapturedLogEntry[] = JSON.parse(savedLogs).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        }));
        setCapturedLogs(parsedLogs);
      } catch (error) {
        console.error("Failed to parse logs from localStorage:", error);
      }
    }
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
      setCapturedLogs(prev => [createLogEntry('log', args), ...prev.slice(0, 499)]);
    };
    console.info = (...args: any[]) => {
      originalConsole.info(...args);
      setCapturedLogs(prev => [createLogEntry('info', args), ...prev.slice(0, 499)]);
    };
    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      setCapturedLogs(prev => [createLogEntry('warn', args), ...prev.slice(0, 499)]);
    };
    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      setCapturedLogs(prev => [createLogEntry('error', args), ...prev.slice(0, 499)]);
    };
    console.debug = (...args: any[]) => {
      originalConsole.debug(...args);
      setCapturedLogs(prev => [createLogEntry('debug', args), ...prev.slice(0, 499)]);
    };

    console.info("LoggerPage: Live diagnostic system active.");
    setIsHydrated(true);

    return () => {
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

  // Aggregate stats
  const metrics = useMemo(() => {
    const errors = capturedLogs.filter(l => l.level === 'error').length;
    const warnings = capturedLogs.filter(l => l.level === 'warn').length;
    const infoLogs = capturedLogs.filter(l => l.level === 'info' || l.level === 'log').length;
    const debugs = capturedLogs.filter(l => l.level === 'debug').length;
    return { errors, warnings, infoLogs, debugs, total: capturedLogs.length };
  }, [capturedLogs]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('capturedLogs', JSON.stringify(capturedLogs.slice(0, 500)));
    }
  }, [capturedLogs, isHydrated]);

  const getBadgeClass = (level: CapturedLogEntry['level']) => {
    switch (level.toLowerCase()) {
      case 'error': 
        return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      case 'warn': 
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20'; 
      case 'info': 
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20'; 
      case 'debug': 
        return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
      case 'log': 
      default:
        return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
    }
  };
  
  const getIconForLevel = (level: CapturedLogEntry['level']) => {
    switch (level.toLowerCase()) {
      case 'error': return <XCircle className="h-3.5 w-3.5 text-rose-500" />;
      case 'warn': return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      case 'info': return <Info className="h-3.5 w-3.5 text-blue-500" />;
      case 'debug': return <Terminal className="h-3.5 w-3.5 text-slate-500" />;
      case 'log': 
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-violet-500" />;
    }
  };
  
  const handleClearLogs = () => {
    localStorage.removeItem('capturedLogs');
    setCapturedLogs([]);
    console.info("LoggerPage: Diagnostics stream buffer reset.");
    toast({ title: "Logs Cleared", description: "All local session logs have been deleted." });
  };

  const formatLogForCopy = (log: CapturedLogEntry): string => {
    return `[${format(log.timestamp, 'PPpp')}] [${log.level.toUpperCase()}] ${log.message}${log.context ? `\nContext:\n${log.context}` : ''}`;
  };

  const handleCopyLog = async (log: CapturedLogEntry) => {
    const logString = formatLogForCopy(log);
    try {
      await navigator.clipboard.writeText(logString);
      toast({ title: "Log Entry Copied", description: "Copied complete log event trace." });
    } catch (err) {
      toast({ title: "Copy Failed", description: "Failed to access clipboard.", variant: "destructive" });
    }
  };

  const handleCopyAllVisibleLogs = async () => {
    if (filteredLogs.length === 0) {
      toast({ title: "No Logs Available", description: "There are no visible logs in the active view." });
      return;
    }
    const allLogsString = filteredLogs.map(formatLogForCopy).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(allLogsString);
      toast({ title: "Copied Visible Stream", description: `Copied ${filteredLogs.length} logs to your clipboard.` });
    } catch (err) {
      toast({ title: "Copy Failed", description: "Could not export stream.", variant: "destructive" });
    }
  };

  const handleViewLogDetails = (log: CapturedLogEntry) => {
    setSelectedLogDetail(log);
    setIsDetailModalOpen(true);
  };

  if (!isLoaded) {
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
              The telemetry console and diagnostic stream are restricted to authorized administrators. If you believe this is an error, please contact your systems architect.
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

  return (
    <div className="flex flex-col w-full min-h-screen bg-background/30 py-6 space-y-6">
      {/* Header Panel */}
      <header className="px-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Diagnostic Logger</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            Live telemetry stream tracking client events, background processes, and authentication states.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyAllVisibleLogs} 
            disabled={filteredLogs.length === 0}
            className="h-9 px-3 rounded-xl text-xs font-medium border-border/40 hover:bg-muted"
          >
            <CopyCheck className="mr-1.5 h-3.5 w-3.5" /> Export Viewable
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearLogs} 
            disabled={capturedLogs.length === 0}
            className="h-9 px-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 text-xs font-medium"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Reset Buffer
          </Button>
        </div>
      </header>

      {/* Stats Indicator Row */}
      <section className="px-4 md:px-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="p-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-600">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Errors</p>
            <p className="text-base font-bold text-rose-600 font-mono mt-0.5">{metrics.errors}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Warnings</p>
            <p className="text-base font-bold text-amber-600 font-mono mt-0.5">{metrics.warnings}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Info Logs</p>
            <p className="text-base font-bold text-blue-600 font-mono mt-0.5">{metrics.infoLogs}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Debugs</p>
            <p className="text-base font-bold text-foreground font-mono mt-0.5">{metrics.debugs}</p>
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-border/40 bg-primary/5 border-primary/20 flex items-center gap-3 col-span-2 md:col-span-4 lg:col-span-1">
          <div className="p-2 rounded-xl bg-primary/10 text-primary animate-pulse">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-primary">Status</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 flex items-center gap-1">
              Active Capture <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 inline-block" />
            </p>
          </div>
        </div>
      </section>

      {/* Main Console Container */}
      <main className="px-4 md:px-8">
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm shadow-sm rounded-2xl overflow-hidden flex flex-col">
          {/* Filtering Control Bar */}
          <CardHeader className="p-4 border-b border-border/40 bg-muted/15 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">Active Session Stream</CardTitle>
              <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono">
                {filteredLogs.length} items
              </span>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by message or stack..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl border-border/40 bg-background/50 focus-visible:bg-background"
                />
              </div>

              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-[120px] h-9 text-xs rounded-xl border-border/40 bg-background/50">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="All Levels" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs">All Levels</SelectItem>
                  <SelectItem value="error" className="text-xs">Error</SelectItem>
                  <SelectItem value="warn" className="text-xs">Warning</SelectItem>
                  <SelectItem value="info" className="text-xs">Info</SelectItem>
                  <SelectItem value="debug" className="text-xs">Debug</SelectItem>
                  <SelectItem value="log" className="text-xs">Log</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          {/* Table Container */}
          <CardContent className="p-0">
            <ScrollArea className="h-[550px] w-full">
              <Table>
                <TableHeader className="bg-muted/10 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-b border-border/30">
                    <TableHead className="w-[180px] pl-6 text-xs font-semibold py-2.5">Time Logged</TableHead>
                    <TableHead className="w-[100px] text-xs font-semibold py-2.5">Level</TableHead>
                    <TableHead className="text-xs font-semibold py-2.5">Trace / Event Message</TableHead>
                    <TableHead className="w-[100px] text-center pr-6 text-xs font-semibold py-2.5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="font-mono text-[11px] leading-relaxed divide-y divide-border/30">
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <TableRow 
                        key={log.id} 
                        className="group border-b border-border/20 hover:bg-muted/35 cursor-pointer transition-colors" 
                        onClick={() => handleViewLogDetails(log)}
                      >
                        <TableCell className="text-muted-foreground pl-6 whitespace-nowrap">
                          {format(log.timestamp, 'HH:mm:ss.SSS')}
                          <span className="text-[9px] text-muted-foreground/50 block font-normal">
                            {format(log.timestamp, 'yyyy-MM-dd')}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize",
                            getBadgeClass(log.level)
                          )}>
                            {getIconForLevel(log.level)}
                            {log.level}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 max-w-xl truncate pr-4 text-foreground/90 font-medium">
                          {log.message}
                          {log.context && (
                            <span className="text-[10px] text-muted-foreground/60 block truncate font-normal mt-0.5">
                              {log.context.split('\n')[0]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center py-2.5 pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleCopyLog(log)} 
                              title="Copy details" 
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleViewLogDetails(log)} 
                              title="Inspect log" 
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-36 text-center text-muted-foreground font-sans">
                        <div className="flex flex-col items-center justify-center py-8 space-y-2">
                          <Terminal className="h-8 w-8 text-muted-foreground/30 stroke-[1.5]" />
                          <p className="text-sm font-semibold text-foreground">No events found</p>
                          <p className="text-xs text-muted-foreground max-w-xs">
                            {searchTerm || levelFilter !== 'all' 
                              ? 'Refine search parameters to view other entries.' 
                              : 'Session console is currently empty.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
          <CardFooter className="p-4 border-t border-border/40 text-[10px] text-muted-foreground/80 font-mono bg-muted/5 flex justify-between">
            <span>Buffer ceiling: 500 records</span>
            <span>Displaying {filteredLogs.length} of {capturedLogs.length} visibilities</span>
          </CardFooter>
        </Card>
      </main>

      {/* Structured Inspect Trace Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl border border-border/50 bg-card p-6 shadow-xl z-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {selectedLogDetail && getIconForLevel(selectedLogDetail.level)}
              Event Trace Inspector
            </DialogTitle>
            {selectedLogDetail && (
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Captured on {format(selectedLogDetail.timestamp, 'PPPP pppp')}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedLogDetail && (
            <ScrollArea className="max-h-[60vh] mt-4 pr-1">
              <div className="space-y-4 font-mono text-xs">
                <div className="space-y-1.5">
                  <h4 className="font-sans font-semibold text-xs text-muted-foreground uppercase tracking-wider">Log Level:</h4>
                  <Badge className={cn("text-[10px] font-semibold capitalize", getBadgeClass(selectedLogDetail.level))}>
                    {selectedLogDetail.level}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <h4 className="font-sans font-semibold text-xs text-muted-foreground uppercase tracking-wider">Event Message:</h4>
                  <div className="text-sm text-foreground leading-relaxed bg-muted/40 p-4 rounded-xl border border-border/40 font-mono select-text whitespace-pre-wrap break-words">
                    {selectedLogDetail.message}
                  </div>
                </div>

                {selectedLogDetail.context && (
                  <div className="space-y-1.5">
                    <h4 className="font-sans font-semibold text-xs text-muted-foreground uppercase tracking-wider">Trace Stack / Context:</h4>
                    <pre className="text-[10px] leading-relaxed text-muted-foreground bg-muted/30 p-4 rounded-xl border border-border/40 overflow-x-auto select-text whitespace-pre-wrap break-all">
                      {selectedLogDetail.context}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            {selectedLogDetail && (
              <Button 
                variant="outline" 
                onClick={() => handleCopyLog(selectedLogDetail)}
                className="h-9 px-4 rounded-xl text-xs font-medium"
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Copy Log String
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" className="h-9 px-4 rounded-xl text-xs font-medium">
                Close Inspector
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
