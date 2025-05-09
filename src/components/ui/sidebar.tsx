// src/components/ui/sidebar.tsx
 "use client";

import * as React from "react";
import { usePathname } from "next/navigation"; // Correct import for App Router
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
  ClipboardList,
  RefreshCw,
  Menu,
  PieChart,
  // UserCircle removed
} from "lucide-react";
import Link from "next/link";
import { useSyncManager } from "@/hooks/useSyncManager";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationStore } from "@/store/notificationStore";
import { Badge } from "@/components/ui/badge";
import { UserButton, useUser } from "@clerk/nextjs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "./scroll-area";
import { logInfo, logWarn, logDebug } from "@/lib/logger"; // Assuming logger is set up

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
  { href: '/logger', label: 'Logger', icon: <ClipboardList size={18} /> },
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
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
}) => {
  const isMobile = useIsMobile();
  const [state, setState] = React.useState<SidebarState>(isMobile ? "collapsed" : "expanded");
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  React.useEffect(() => {
    if (hasMounted) {
      if (isMobile) {
        setState("collapsed");
      } else {
        // setState("expanded"); // Keep previous logic or set to expanded
      }
    }
  }, [isMobile, hasMounted]);

  const collapseSidebar = () => setState("collapsed");
  const expandSidebar = () => setState("expanded");
  const toggleSidebar = () => {
    setState(prev => (prev === "collapsed" ? "expanded" : "collapsed"));
  };

  const value = {
    isMobile,
    state,
    collapseSidebar,
    expandSidebar,
    toggleSidebar,
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};

const SidebarBase = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, toggleSidebar, isMobile } = useSidebar(); // Added isMobile
  const rawPathname = usePathname(); // From next/navigation
  const [clientPathname, setClientPathname] = React.useState<string>("/"); // Default to a valid path
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
    if (typeof rawPathname === 'string') { // Ensure rawPathname is a string before setting
      setClientPathname(rawPathname);
    } else {
      // Optional: handle null pathname, though default state already covers this
      setClientPathname("/"); // Fallback to default if rawPathname is null
    }
  }, [rawPathname]);

  const unreadCount = useNotificationStore(state => state.unreadCount());
  const { user, isSignedIn, isLoaded: isClerkLoaded } = useUser();
  const syncManager = useSyncManager();
  const { syncStatus, retrySync, hashMismatch, isMismatchDialogOpen } = syncManager;

  let PersistenceIcon: React.ElementType = CloudOff;
  let persistenceStatusText = 'Local';
  let persistenceTooltipText = "Data saved locally. Click to sync.";
  let iconColor = 'text-muted-foreground';
  let isClickable = true;

  if (!isClerkLoaded) {
    PersistenceIcon = RefreshCw;
    persistenceStatusText = 'Auth Loading...';
    persistenceTooltipText = 'Waiting for authentication status...';
    iconColor = 'text-muted-foreground animate-spin';
    isClickable = false;
  } else if (!isSignedIn) {
    PersistenceIcon = CloudOff;
    persistenceStatusText = 'Offline';
    persistenceTooltipText = 'Sign in to enable cloud sync.';
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
    if (!isClerkLoaded || !isSignedIn) {
      logWarn("Sync click attempted but user not signed in or Clerk not loaded.", { isSignedIn, isClerkLoaded, userId: user?.id });
      return;
    }
    if (isClickable) retrySync();
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear border-r border-sidebar-border",
        state === "expanded" ? "w-64" : "w-14",
        className
      )}
      {...props}
    >
      <div data-sidebar="header" className="flex-shrink-0 border-b border-sidebar-border p-2.5 h-14 flex items-center">
        <div className={cn(
            "flex items-center gap-2 overflow-hidden w-full",
            state === 'collapsed' && "justify-center"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0"
            onClick={toggleSidebar}
            aria-label={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {state === 'collapsed' ? <Menu size={20} /> : <PanelLeft size={20} />}
          </Button>
          {isMounted && state === "expanded" && ( // Render only if expanded and mounted
            <span
              className={cn(
                "whitespace-nowrap text-lg font-semibold transition-opacity duration-200",
                 "opacity-100 delay-100"
              )}
            >
              IFC - Guru
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-grow">
        <nav className="space-y-1 p-2.5">
          {isMounted && menuItems.map((item) => ( // Defer rendering until mounted
            <TooltipProvider key={item.href} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={clientPathname === item.href ? "primary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-sm h-9",
                      state === "collapsed" && "justify-center px-0 w-9 h-9",
                      clientPathname === item.href ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      {React.cloneElement(item.icon as React.ReactElement, { size: 18, className: "flex-shrink-0" })}
                      {state === "expanded" && (
                        <span className="ml-2 truncate">
                          {item.label}
                        </span>
                      )}
                      {item.href === "/notifications" && unreadCount > 0 && (
                        <Badge variant="destructive" className={cn("ml-auto", state === 'collapsed' && 'absolute top-0 right-0 h-4 w-4 p-0 flex items-center justify-center text-[10px]')}>
                          {state === 'expanded' ? unreadCount : ''}
                        </Badge>
                      )}
                    </Link>
                  </Button>
                </TooltipTrigger>
                {state === "collapsed" && (
                  <TooltipContent side="right" align="center">
                    {item.label}
                    {item.href === "/notifications" && unreadCount > 0 && (
                      <span className="ml-1.5 text-xs">({unreadCount})</span>
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          ))}
        </nav>
      </ScrollArea>

      {isMounted && ( // Defer rendering of bottom section until mounted
        <div className="mt-auto space-y-1 border-t border-sidebar-border p-2.5">
          <ThemeToggle sidebarState={state} />

          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={handleSyncClick}
                  className={cn(
                    "w-full justify-start text-sm h-9",
                    state === "collapsed" && "justify-center px-0 w-9 h-9",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isMismatchDialogOpen && "animate-pulse border-destructive ring-2 ring-destructive"
                  )}
                  aria-label={persistenceTooltipText}
                  disabled={!isClickable}
                >
                  {React.cloneElement(<PersistenceIcon />, { size: 18, className: cn("flex-shrink-0", iconColor, isMismatchDialogOpen && "text-destructive") })}
                  {state === "expanded" && (
                    <span className="ml-2 truncate text-xs">
                      {persistenceStatusText}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              {state === "collapsed" && (
                <TooltipContent side="right" align="center">
                  {persistenceTooltipText}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <div className={cn(
              "flex items-center w-full",
              state === 'collapsed' ? "justify-center py-1" : "p-1"
          )}>
            {isLoaded && isSignedIn && user ? (
              <UserButton afterSignOutUrl="/" appearance={{
                  elements: {
                      userButtonAvatarBox: state === 'collapsed' ? "w-7 h-7" : "w-8 h-8",
                      userButtonPopoverCard: "bg-popover border-border",
                  }
              }}/>
            ) : (
              <div className="h-8 w-8 flex items-center justify-center">
                {/* Optional: Placeholder icon when not signed in or loading */}
              </div>
            )}
            {state === 'expanded' && isLoaded && isSignedIn && user && (
              <span className="ml-2 text-xs text-sidebar-muted-foreground truncate max-w-[calc(100%-2.5rem)]" title={user.primaryEmailAddress?.emailAddress ?? 'No email'}>
                  {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
SidebarBase.displayName = "SidebarBase";

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "left" | "right";
    variant?: "sidebar" | "navigation";
    collapsible?: "icon" | "full";
  }
>(({ className, side = "left", variant = "sidebar", collapsible = "icon", ...props }, ref) => {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm h-10 w-10">
            <Menu size={24} />
            <span className="sr-only">Open sidebar</span>
          </Button>
        </SheetTrigger>
        <SheetContent side={side} className={cn(
            "w-64 p-0 border-r-sidebar-border",
            variant === "navigation" && "bg-card text-card-foreground"
        )}>
          <SidebarBase
            className={cn(className, variant === "navigation" && "bg-card text-card-foreground")}
            {...props}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop view (Div)
  return (
    <div
      ref={ref}
      className={cn(
        "group/sidebar peer hidden md:block text-sidebar-foreground",
        className
      )}
      data-collapsible={collapsible}
      data-variant={variant}
      data-side={side}
      {...props}
    >
      <SidebarBase className={cn(variant === "navigation" && "bg-card text-card-foreground")} />
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
