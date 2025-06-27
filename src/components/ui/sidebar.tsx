// src/components/ui/sidebar.tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  ReceiptText,
  FileText,
  Coins,
  TrendingUp,
  PanelLeft,
  BookOpen,
  Bell,
  Cloud,
  CloudOff,
  UploadCloud,
  AlertTriangle,
  ClipboardList,
  RefreshCw,
  Menu,
  PieChart,
  Users,
  Briefcase,
  TestTube,
  Database,
  Download,
  Upload, // Import Upload icon
} from "lucide-react";
import Link from "next/link";
import { useSyncManager } from "@/hooks/useSyncManager";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationStore } from "@/store/notificationStore";
import { Badge } from "@/components/ui/badge";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "./scroll-area";
import { logInfo, logWarn, logDebug, logError } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton";

// Import all stores to get their state for download
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore as useNotificationStateForDownload } from '@/store/notificationStore';
import { useToast } from "@/hooks/use-toast";
import DataImportDialog from "../layout/DataImportDialog"; // Import the new dialog
import { Separator } from "./separator"; // Import Separator

interface SidebarMenuItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const menuItems: SidebarMenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/transactions", label: "Transactions", icon: <ReceiptText size={18} /> },
  { href: "/income-expenses", label: "Income/Expenses", icon: <TrendingUp size={18} /> },
  { href: "/debt", label: "Debts", icon: <Coins size={18} /> },
  { href: "/investments", label: "Investments", icon: <Briefcase size={18} /> },
  { href: "/statements", label: "Statements", icon: <FileText size={18} /> },
  { href: "/budget", label: "Budget", icon: <PieChart size={18} /> },
  { href: "/weekly-review", label: "Weekly Review", icon: <BookOpen size={18} /> },
  { href: "/notifications", label: "Notifications", icon: <Bell size={18} /> },
  { href: "/logger", label: "Logger", icon: <ClipboardList size={18} /> },
  { href: "/admin/connection-test", label: "Admin Tests", icon: <TestTube size={18} />, adminOnly: true },
];

export type SidebarState = "collapsed" | "expanded";

interface SidebarContextProps {
  isMobile: boolean;
  state: SidebarState;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = React.useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

interface SidebarProviderProps {
  children: React.ReactNode;
}

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<SidebarProviderProps>
>(({ children, ...props }, ref) => {
  const isMobileClient = useIsMobile();
  const [sidebarState, setSidebarState] = React.useState<SidebarState>("expanded");
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  React.useEffect(() => {
    if (hasMounted) {
      if (isMobileClient) {
        setSidebarState("collapsed");
      } else {
        const storedValue = localStorage.getItem("sidebarState");
        if (storedValue === "collapsed" || storedValue === "expanded") {
          setSidebarState(storedValue);
        } else {
          setSidebarState("expanded");
        }
      }
    }
  }, [isMobileClient, hasMounted]);

  React.useEffect(() => {
    if (hasMounted && !isMobileClient) {
      localStorage.setItem("sidebarState", sidebarState);
    }
  }, [sidebarState, isMobileClient, hasMounted]);

  const collapseSidebar = () => setSidebarState("collapsed");
  const expandSidebar = () => setSidebarState("expanded");
  const toggleSidebar = () => {
    setSidebarState((prev) => (prev === "collapsed" ? "expanded" : "collapsed"));
  };

  const contextValue = React.useMemo(
    () => ({
      isMobile: isMobileClient,
      state: sidebarState,
      collapseSidebar,
      expandSidebar,
      toggleSidebar,
    }),
    [isMobileClient, sidebarState]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn("group/sidebar-wrapper flex min-h-svh w-full")}
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.5rem",
          } as React.CSSProperties
        }
        ref={ref}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = "SidebarProvider";

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const pathname = usePathname();
  const unreadCount = useNotificationStore((state) => state.unreadCount());
  const [clientUnreadCount, setClientUnreadCount] = React.useState(0);
  const [hasMounted, setHasMounted] = React.useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = React.useState(false);

  const { user, isLoaded: isClerkLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const isUserAdmin = user?.privateMetadata?.role === 'admin';

  const syncManager = useSyncManager();
  const { syncStatus, manualSync, isFetchDisabled } = syncManager;

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getInvestmentState = useInvestmentStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStateForDownload.getState;
  const { toast } = useToast();

  React.useEffect(() => {
    setHasMounted(true);
    setClientUnreadCount(unreadCount);
  }, [unreadCount]);

  const handleDownloadAllData = () => {
    logInfo("User initiated full data download.", { userId: user?.id });

    try {
        const fullPayload = {
            transactions: getTransactionsState().transactions,
            debts: getDebtState().debts,
            investmentItems: getInvestmentState().investmentItems,
            assetItems: getStatementState().assetItems,
            otherLiabilityItems: getStatementState().otherLiabilityItems,
            budgetItems: getBudgetState().budgetItems,
            publishedBudgets: getBudgetState().publishedBudgets,
            ownedReviews: getWeeklyReviewState().ownedReviews,
            sharedReviews: getWeeklyReviewState().sharedReviews,
            notifications: getNotificationState().notifications,
            acknowledgedPrincipals: getDebtState().acknowledgedPrincipals,
            statementSettings: {
                startDate: getStatementState().startDate?.toISOString(),
                endDate: getStatementState().endDate?.toISOString(),
            },
            version: '1.0',
            exportedAt: new Date().toISOString(),
        };

        const jsonString = JSON.stringify(fullPayload, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
        link.download = `ifc_guru_export_${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
            title: "Data Exported",
            description: "Your full application data has been downloaded as a JSON file.",
        });
    } catch (error) {
        logError("Failed to export all data.", error, { userId: user?.id });
        toast({
            title: "Export Failed",
            description: "An unexpected error occurred while exporting your data.",
            variant: "destructive",
        });
    }
  };


  let SyncIcon: React.ElementType = CloudOff;
  let syncStatusText = 'Offline';
  let syncTooltipText = 'Sign in to use the application.';
  let iconColor = 'text-muted-foreground';
  let isSyncButtonClickable = false;
  let animateIcon = false;

  if (isFetchDisabled) {
      SyncIcon = Database;
      syncStatusText = 'Local Data';
      syncTooltipText = 'Data is saved locally in your browser.';
      iconColor = 'text-primary';
      isSyncButtonClickable = false;
      animateIcon = false;
  } else if (!isClerkLoaded) {
    SyncIcon = RefreshCw;
    syncStatusText = 'Auth Loading...';
    syncTooltipText = 'Waiting for authentication status...';
    iconColor = 'text-muted-foreground';
    animateIcon = true;
  } else if (!isSignedIn) {
    SyncIcon = CloudOff;
    syncStatusText = 'Offline';
    syncTooltipText = 'Sign in to enable cloud sync.';
    iconColor = 'text-muted-foreground';
  } else {
    isSyncButtonClickable = true;
    switch (syncStatus) {
      case 'syncing': SyncIcon = RefreshCw; syncStatusText = 'Syncing...'; syncTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary'; animateIcon = true; isSyncButtonClickable = false; break;
      case 'synced': SyncIcon = Cloud; syncStatusText = 'Synced'; syncTooltipText = 'Data synced with cloud. Click to refresh.'; iconColor = 'text-accent'; break;
      case 'local_changes': SyncIcon = UploadCloud; syncStatusText = 'Review & Sync'; syncTooltipText = 'You have unsaved changes. Click to review and sync.'; iconColor = 'text-yellow-500'; break;
      case 'error': SyncIcon = AlertTriangle; syncStatusText = 'Sync Error'; syncTooltipText = 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; break;
      case 'hash_mismatch': SyncIcon = AlertTriangle; syncStatusText = 'Data Conflict'; syncTooltipText = 'Data mismatch detected. A resolution is required.'; iconColor = 'text-destructive'; isSyncButtonClickable = false; break;
      case 'loading_local': SyncIcon = RefreshCw; syncStatusText = 'Loading...'; syncTooltipText = 'Loading local data...'; iconColor = 'text-primary'; animateIcon = true; isSyncButtonClickable = false; break;
      case 'error_local': SyncIcon = AlertTriangle; syncStatusText = 'Local Error'; syncTooltipText = 'Error loading local data. Click to retry.'; iconColor = 'text-destructive'; break;
      case 'local':
           SyncIcon = Cloud;
           syncStatusText = 'Local Data';
           syncTooltipText = 'Data loaded locally. Click to sync with server.';
           iconColor = 'text-primary';
          break;
      case 'idle':
      default:
        SyncIcon = CloudOff;
        syncStatusText = 'Not Synced';
        syncTooltipText = 'Click to sync data with server.';
        iconColor = 'text-muted-foreground';
        break;
    }
  }

  const handleSyncClick = React.useCallback(() => {
    if (isFetchDisabled) return; // Do nothing in local-only mode
    if (!isClerkLoaded || !isSignedIn) {
      logWarn("Sync click attempted but user not signed in or Clerk not loaded.", { isSignedIn, isClerkLoaded, userId: user?.id});
      return;
    }
    if (isSyncButtonClickable || syncStatus === 'error' || syncStatus === 'error_local') {
      manualSync();
    }
  }, [isClerkLoaded, isSignedIn, user?.id, isSyncButtonClickable, syncStatus, manualSync, isFetchDisabled]);


  const sidebarActualState = isMobile ? "expanded" : state;
  const showDedicatedConflictResolverButton = syncStatus === 'hash_mismatch' && !isFetchDisabled;

  return (
    <>
      <div
        ref={ref}
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out border-r border-sidebar-border",
          sidebarActualState === "expanded" ? "w-[var(--sidebar-width)]" : "w-[var(--sidebar-width-icon)]",
          className
        )}
        {...props}
      >
        <div data-sidebar="header" className="flex-shrink-0 border-b border-sidebar-border p-2.5 h-14 flex items-center">
        <div className={cn(
              "flex items-center gap-2 overflow-hidden w-full",
              sidebarActualState === 'collapsed'|| sidebarActualState === "expanded" && "justify-center"
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0"
              onClick={toggleSidebar}
              aria-label={sidebarActualState === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarActualState === 'collapsed' ? <Menu size={20} /> : <PanelLeft size={20} />}
            </Button>
            <span
              className={cn(
                "whitespace-nowrap text-base font-semibold transition-opacity duration-200",
                sidebarActualState === "collapsed" ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
              )}
            >
              IFC - Guru
            </span>
          </div>
        </div>

        <ScrollArea className="flex-grow">
          <nav className="space-y-1 p-2.5">
            {menuItems.filter(item => !item.adminOnly || (item.adminOnly && isUserAdmin)).map((item) => (
              <TooltipProvider key={item.href} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={pathname === item.href ? "primary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-sm h-9 relative",
                        sidebarActualState === "collapsed" && "justify-center px-0 w-9 h-9",
                        pathname === item.href ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      asChild
                    >
                      <Link href={item.href}>
                        {React.cloneElement(item.icon as React.ReactElement, { size: 18, className: "flex-shrink-0" })}
                        <span className={cn(
                          "ml-2 truncate",
                          sidebarActualState === "collapsed" && "hidden"
                        )}>
                          {item.label}
                        </span>
                        {item.href === "/notifications" && hasMounted && clientUnreadCount > 0 && (
                          <>
                            {sidebarActualState === 'expanded' && (
                              <Badge variant="destructive" className="ml-auto">
                                {clientUnreadCount}
                              </Badge>
                            )}
                            {sidebarActualState === 'collapsed' && (
                              <span className="absolute top-0.5 right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  {sidebarActualState === "collapsed" && (
                    <TooltipContent side="right" align="center">
                      {item.label}
                      {item.href === "/notifications" && hasMounted && clientUnreadCount > 0 && (
                        <span className="ml-1.5 text-xs">({clientUnreadCount})</span>
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ))}
          </nav>
        </ScrollArea>

        <div className="mt-auto space-y-1 border-t border-sidebar-border p-2.5">
            <div className={cn(sidebarActualState === 'expanded' ? "px-2 py-1 text-xs font-semibold text-muted-foreground" : "hidden")}>
                Data Management
            </div>
            
            {/* Sync Button */}
             <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={handleSyncClick}
                    className={cn(
                      "w-full justify-start text-sm h-9",
                      sidebarActualState === "collapsed" && "justify-center px-0 w-9 h-9",
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      showDedicatedConflictResolverButton && "bg-destructive/10 text-destructive-foreground hover:bg-destructive/20"
                    )}
                    aria-label={syncTooltipText}
                    disabled={!isSyncButtonClickable && !showDedicatedConflictResolverButton}
                  >
                    <SyncIcon size={18} className={cn("flex-shrink-0", iconColor, animateIcon && "animate-spin")} />
                    <span className={cn("ml-2 truncate text-xs", sidebarActualState === "collapsed" && "hidden")}>
                      {syncStatusText}
                    </span>
                  </Button>
                </TooltipTrigger>
                {sidebarActualState === "collapsed" && (
                  <TooltipContent side="right" align="center">
                    {syncTooltipText}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Import Button */}
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={() => setIsImportDialogOpen(true)}
                    className={cn(
                      "w-full justify-start text-sm h-9",
                      sidebarActualState === "collapsed" && "justify-center px-0 w-9 h-9",
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    aria-label="Import data from file"
                  >
                    <Upload size={18} className="flex-shrink-0 text-muted-foreground" />
                    <span className={cn("ml-2 truncate text-xs", sidebarActualState === "collapsed" && "hidden")}>
                      Import Data
                    </span>
                  </Button>
                </TooltipTrigger>
                {sidebarActualState === "collapsed" && (
                  <TooltipContent side="right" align="center">
                    Import Data
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Download Button */}
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={handleDownloadAllData}
                    className={cn(
                      "w-full justify-start text-sm h-9",
                      sidebarActualState === "collapsed" && "justify-center px-0 w-9 h-9",
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    aria-label="Download all local data"
                  >
                    <Download size={18} className="flex-shrink-0 text-muted-foreground" />
                    <span className={cn("ml-2 truncate text-xs", sidebarActualState === "collapsed" && "hidden")}>
                      Download Data
                    </span>
                  </Button>
                </TooltipTrigger>
                {sidebarActualState === "collapsed" && (
                  <TooltipContent side="right" align="center">
                    Download All Data
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <Separator className="my-2" />

          <ThemeToggle sidebarState={sidebarActualState} />

          <div className={cn(
              "flex items-center w-full",
              sidebarActualState === 'collapsed' ? "justify-center py-1" : "p-1"
          )}>
            {isClerkLoaded ? (
              isSignedIn && user ? (
                <UserButton afterSignOutUrl="/" appearance={{
                    elements: {
                        userButtonAvatarBox: sidebarActualState === 'collapsed' ? "w-7 h-7" : "w-8 h-8",
                        userButtonPopoverCard: "bg-popover border-border",
                    }
                }}/>
              ) : (
                 <TooltipProvider delayDuration={100}>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Button variant="ghost" size="icon" className={cn("h-8 w-8", sidebarActualState === 'collapsed' && "h-7 w-7")} asChild>
                         <Link href="/sign-in" aria-label="Sign In">
                           <Users size={sidebarActualState === 'collapsed' ? 16 : 18} className="text-muted-foreground" />
                         </Link>
                       </Button>
                     </TooltipTrigger>
                     {sidebarActualState === "collapsed" && (
                       <TooltipContent side="right" align="center">
                         Sign In
                       </TooltipContent>
                     )}
                   </Tooltip>
                 </TooltipProvider>
              )
            ) : (
              <Skeleton className={cn("rounded-full", sidebarActualState === 'collapsed' ? "h-7 w-7" : "h-8 w-8")} />
            )}
            {sidebarActualState === 'expanded' && isClerkLoaded && isSignedIn && user && (
              <span className="ml-2 text-xs text-sidebar-muted-foreground truncate max-w-[calc(100%-2.5rem)]" title={user.primaryEmailAddress?.emailAddress ?? 'No email'}>
                  {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User'}
              </span>
            )}
          </div>
        </div>
      </div>
      <DataImportDialog isOpen={isImportDialogOpen} onClose={() => setIsImportDialogOpen(false)} />
    </>
  );
});
SidebarContent.displayName = "SidebarContent";

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "left" | "right";
  }
>(({ className, side = "left", ...props }, ref) => {
  const { isMobile, toggleSidebar, state } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={state === "expanded" && isMobile} onOpenChange={(open) => { if(!open && state === "expanded") toggleSidebar()}}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm h-10 w-10" onClick={toggleSidebar}>
            <Menu size={24} />
            <span className="sr-only">Open sidebar</span>
          </Button>
        </SheetTrigger>
        <SheetContent side={side} className="w-[var(--sidebar-width)] p-0 border-r-sidebar-border">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div
      ref={ref}
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden md:flex",
        className
      )}
    >
      <SidebarContent />
    </div>
  );
});
Sidebar.displayName = "Sidebar";

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, isMobile } = useSidebar();

  if (isMobile) return <div ref={ref} className={cn("flex-1 pt-12 md:pt-0", className)} {...props} />;

  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 transition-[margin-left] duration-200 ease-in-out",
        state === "expanded" ? "md:ml-[var(--sidebar-width)]" : "md:ml-[var(--sidebar-width-icon)]",
        className
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";
