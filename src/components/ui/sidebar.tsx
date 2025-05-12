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
  AlertTriangle,
  ClipboardList, // Changed from Logger
  RefreshCw,
  Menu,
  PieChart,
  Users, 
} from "lucide-react";
import Link from "next/link";
import { useSyncManager } from "@/hooks/useSyncManager";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationStore } from "@/store/notificationStore";
import { Badge } from "@/components/ui/badge";
// import { UserButton, useUser } from "@clerk/nextjs"; // Clerk disabled
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "./scroll-area"; 
import { logInfo, logWarn, logDebug } from "@/lib/logger";
import { Skeleton } from "@/components/ui/skeleton"; 
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


interface SidebarMenuItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const menuItems: SidebarMenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/transactions", label: "Transactions", icon: <ReceiptText size={18} /> },
  { href: "/income-expenses", label: "Income/Expenses", icon: <TrendingUp size={18} /> },
  { href: "/debt", label: "Debts", icon: <Coins size={18} /> },
  { href: "/statements", label: "Statements", icon: <FileText size={18} /> },
  { href: "/budget", label: "Budget", icon: <PieChart size={18} /> },
  { href: "/weekly-review", label: "Weekly Review", icon: <BookOpen size={18} /> },
  { href: "/notifications", label: "Notifications", icon: <Bell size={18} /> },
  { href: '/logger', label: 'Logger', icon: <ClipboardList size={18} /> }, // Changed icon from Logger to ClipboardList
];

export type SidebarState = "collapsed" | "expanded";

interface SidebarContextProps {
  isMobile: boolean;
  state: SidebarState;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = React.useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

interface SidebarProviderProps {
  children: React.ReactNode;
  variant?: "sidebar" | "inset";
  width?: string;
  widthIcon?: string;
  collapsible?: "icon" | "button";
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, React.PropsWithChildren<SidebarProviderProps>>(
  ({ children, variant = "sidebar", width = "16rem", widthIcon = "3.5rem", collapsible = "button", ...props }, ref) => {
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
          const storedState = localStorage.getItem("sidebarState") as SidebarState | null;
          if (storedState) {
            setSidebarState(storedState);
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
      setSidebarState(prev => (prev === "collapsed" ? "expanded" : "collapsed"));
    };

    const contextValue = React.useMemo(() => ({
      isMobile: isMobileClient,
      state: sidebarState,
      collapseSidebar,
      expandSidebar,
      toggleSidebar,
    }), [isMobileClient, sidebarState]);

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full",
            variant === "inset" && "has-[[data-variant=inset]]:bg-sidebar"
          )}
          style={
            {
              "--sidebar-width": width,
              "--sidebar-width-icon": widthIcon,
            } as React.CSSProperties
          }
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";


const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { state, toggleSidebar, isMobile } = useSidebar(); 
    const pathname = usePathname();
    const unreadCount = useNotificationStore(state => state.unreadCount());
    const [clientUnreadCount, setClientUnreadCount] = React.useState(0);
    const [hasMounted, setHasMounted] = React.useState(false);

    // Clerk disabled: Simulate user state
    const isClerkLoaded = true; // Assume loaded
    const mockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
    const isSignedIn = !!mockUserId;
    const user = isSignedIn ? { 
      id: mockUserId, 
      fullName: 'Mock User', 
      primaryEmailAddress: { emailAddress: 'mock@example.com'} 
    } : null;
    // End Clerk disabled simulation

    const syncManager = useSyncManager();
    const { syncStatus, retrySync, hashMismatch, isMismatchDialogOpen } = syncManager;


    React.useEffect(() => {
      setHasMounted(true);
      setClientUnreadCount(unreadCount); // Sync unread count after mount
    }, [unreadCount]);


    let PersistenceIcon: React.ElementType = CloudOff;
    let persistenceStatusText = 'Local';
    let persistenceTooltipText = "Data saved locally. Click to sync.";
    let iconColor = 'text-muted-foreground';
    let isClickable = true;

    if (!isClerkLoaded) { // This condition might always be true now
      PersistenceIcon = RefreshCw;
      persistenceStatusText = 'Auth Loading...'; // Or "App Loading..."
      persistenceTooltipText = 'Waiting for application to initialize...';
      iconColor = 'text-muted-foreground animate-spin';
      isClickable = false;
    } else if (!isSignedIn) { // Checks mock user state
      PersistenceIcon = CloudOff;
      persistenceStatusText = 'Offline';
      persistenceTooltipText = 'Mock user not configured. Cloud sync disabled.';
      iconColor = 'text-muted-foreground';
      isClickable = false;
    } else {
      switch (syncStatus) {
        case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; isClickable = false; break;
        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; isClickable = false; break;
        case 'error':
          PersistenceIcon = AlertTriangle;
          persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error';
          persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.';
          iconColor = 'text-destructive';
          isClickable = true;
          break;
        case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local'; persistenceTooltipText = "Data saved locally. Click to sync."; iconColor = 'text-muted-foreground'; isClickable = true; break;
      }
    }

    const handleSyncClick = () => {
      if (!isSignedIn) { // Check mock user state
        logWarn("Sync click attempted but no mock user is configured.", { isSignedIn, isClerkLoaded, userId: user?.id});
        return;
      }
      if (isClickable) retrySync();
    };

    const sidebarActualState = isMobile ? "collapsed" : state;

    return (
      <div
        ref={ref}
        className={cn(
          "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear border-r border-sidebar-border",
          sidebarActualState === "expanded" ? "w-64" : "w-14",
          className
        )}
        {...props}
      >
        <div data-sidebar="header" className="flex-shrink-0 border-b border-sidebar-border p-2.5 h-14 flex items-center">
          <div className={cn(
              "flex items-center gap-2 overflow-hidden w-full",
              sidebarActualState === 'collapsed' && "justify-center"
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
                "whitespace-nowrap text-lg font-semibold transition-opacity duration-200",
                sidebarActualState === "collapsed" ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
              )}
            >
              IFC - Guru
            </span>
          </div>
        </div>

        <ScrollArea className="flex-grow">
          <nav className="space-y-1 p-2.5">
            {menuItems.map((item) => (
              <TooltipProvider key={item.href} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={pathname === item.href ? "primary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-sm h-9",
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
                          <Badge variant="destructive" className={cn("ml-auto", sidebarActualState === 'collapsed' && 'absolute top-0 right-0 h-4 w-4 p-0 flex items-center justify-center text-[10px]')}>
                            {sidebarActualState === 'expanded' ? clientUnreadCount : ''}
                          </Badge>
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
          <ThemeToggle sidebarState={sidebarActualState} />

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
                    isMismatchDialogOpen && "animate-pulse border-destructive ring-2 ring-destructive"
                  )}
                  aria-label={persistenceTooltipText}
                  disabled={!isClickable}
                >
                  {React.cloneElement(<PersistenceIcon />, { size: 18, className: cn("flex-shrink-0", iconColor, isMismatchDialogOpen && "text-destructive") })}
                  <span className={cn("ml-2 truncate text-xs", sidebarActualState === "collapsed" && "hidden")}>
                    {persistenceStatusText}
                  </span>
                </Button>
              </TooltipTrigger>
              {sidebarActualState === "collapsed" && (
                <TooltipContent side="right" align="center">
                  {persistenceTooltipText}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <div className={cn(
              "flex items-center w-full",
              sidebarActualState === 'collapsed' ? "justify-center py-1" : "p-1"
          )}>
            {/* Clerk disabled: Show mock user info or a generic placeholder */}
            {isSignedIn && user ? (
                <div className="flex items-center gap-2">
                    <Avatar className={cn(sidebarActualState === 'collapsed' ? "w-7 h-7" : "w-8 h-8")}>
                        <AvatarFallback>{user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
                    </Avatar>
                    {sidebarActualState === 'expanded' && (
                        <span className="text-xs text-sidebar-muted-foreground truncate max-w-[calc(100%-2.5rem)]" title={user.primaryEmailAddress?.emailAddress ?? 'Mock User'}>
                            {user.fullName ?? 'Mock User'}
                        </span>
                    )}
                </div>
            ) : (
              <TooltipProvider delayDuration={100}>
                 <Tooltip>
                   <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={cn(sidebarActualState === 'collapsed' ? "h-7 w-7" : "h-8 w-8")} asChild>
                         {/* Link to a general info page or remove if no public pages are available */}
                         <div aria-label="User information unavailable">
                            <Users size={sidebarActualState === 'collapsed' ? 16 : 18} className="text-muted-foreground" />
                         </div>
                      </Button>
                   </TooltipTrigger>
                   {sidebarActualState === "collapsed" && (
                        <TooltipContent side="right" align="center">
                          User Info
                        </TooltipContent>
                   )}
                 </Tooltip>
               </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    );
  }
);
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
      <Sheet open={state === "expanded"} onOpenChange={(open) => { if(!open) toggleSidebar()}}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm h-10 w-10" onClick={toggleSidebar}>
            <Menu size={24} />
            <span className="sr-only">Open sidebar</span>
          </Button>
        </SheetTrigger>
        <SheetContent side={side} className="w-64 p-0 border-r-sidebar-border">
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


export const SidebarRail = React.forwardRef<
 HTMLDivElement,
 React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
 const { state, isMobile } = useSidebar();

 if (isMobile) return null; 

 return (
   <div
     ref={ref}
     className={cn(
       "hidden md:block flex-shrink-0 transition-[width] duration-200 ease-linear",
       state === "expanded" ? "w-64" : "w-14",
       className
     )}
     {...props}
   />
 );
});
SidebarRail.displayName = "SidebarRail";

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, isMobile } = useSidebar();
  const marginLeftClass = isMobile ? 'ml-0' : (state === 'expanded' ? 'md:ml-64' : 'md:ml-14');


  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 transition-[margin-left] duration-200 ease-linear",
        marginLeftClass,
        className
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";
