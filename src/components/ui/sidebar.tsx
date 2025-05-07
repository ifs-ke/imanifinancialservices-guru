// src/components/ui/sidebar.tsx
"use client";

import * as React from "react";
import { useState, useContext, createContext } from "react";
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
  Logger,
  RefreshCw,
  Menu,
  UserCircle // Placeholder for UserButton
} from "lucide-react";
import Link from "next/link";
import { useSyncManager } from "@/hooks/useSyncManager";
import { ThemeToggle } from "./ThemeToggle";
import { useNotificationStore } from "@/store/notificationStore";
import { Badge } from "@/components/ui/badge";
// import { UserButton, useUser } from "@clerk/nextjs"; // Clerk disabled
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

// Temporary placeholder for Clerk's UserButton and useUser
const UserButtonPlaceholder = () => (
  <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs text-sidebar-accent-foreground">
    <UserCircle size={20} />
  </div>
);
const useUser = () => ({ isSignedIn: true, user: { id: "user_2wXc4D8KBDKGhxagoRStZOXnP2Y", fullName: "Local User" } });


interface SidebarMenuItem {
  href: string;
  label: string;
  icon: React.ReactNode; // Lucide icons are ReactNode
}

const menuItems: SidebarMenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/transactions", label: "Transactions", icon: <ReceiptText size={18} /> },
  { href: "/income-expenses", label: "Income/Expenses", icon: <TrendingUp size={18} /> },
  { href: "/debt", label: "Debts", icon: <Coins size={18} /> },
  { href: "/statements", label: "Statements", icon: <FileText size={18} /> },
  { href: "/budget", label: "Budget", icon: <TrendingUp size={18} /> },
  { href: "/weekly-review", label: "Weekly Review", icon: <BookOpen size={18} /> },
  { href: "/notifications", label: "Notifications", icon: <Bell size={18} /> },
  { href: '/logger', label: 'Logger', icon: <Logger size={18} /> },
];

type SidebarState = "collapsed" | "expanded";

interface SidebarContextProps {
  isMobile: boolean;
  state: SidebarState;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps>({
  isMobile: false,
  state: "expanded", // Default to expanded on desktop
  collapseSidebar: () => {},
  expandSidebar: () => {},
  toggleSidebar: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

interface SidebarProviderProps {
  children: React.ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
}) => {
  const isMobile = useIsMobile();
  // Initialize state based on isMobile. Default to collapsed on mobile, expanded on desktop.
  const [state, setState] = useState<SidebarState>(isMobile ? "collapsed" : "expanded");

  const collapseSidebar = () => setState("collapsed");
  const expandSidebar = () => setState("expanded");
  const toggleSidebar = () => setState(prev => (prev === "collapsed" ? "expanded" : "collapsed"));

  React.useEffect(() => {
    // When isMobile changes, update the sidebar state accordingly
    setState(isMobile ? "collapsed" : "expanded");
  }, [isMobile]);

  const value = {
    isMobile,
    state,
    collapseSidebar,
    expandSidebar,
    toggleSidebar,
  };

  return (
    <SidebarContext.Provider value={value}>
      <SidebarWrapper>{children}</SidebarWrapper>
    </SidebarContext.Provider>
  );
};

interface SidebarWrapperProps {
  children: React.ReactNode;
}

const SidebarWrapper: React.FC<SidebarWrapperProps> = ({ children }) => {
  const { state, isMobile } = useSidebar();
  return (
    <div
      style={{
        // @ts-ignore
        "--sidebar-width": state === "expanded" && !isMobile ? "16rem" : "3.5rem", // Adjust collapsed width
      }}
      data-state={state}
      className={cn(
        "group/sidebar-wrapper flex min-h-svh w-full",
        isMobile ? "bg-background" : "bg-sidebar" // Only apply sidebar bg on desktop
      )}
    >
      {children}
    </div>
  );
};

// Base Sidebar component (used for both desktop and mobile sheet)
const SidebarBase = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant: 'desktop' | 'mobile' }
>(({ className, variant, ...props }, ref) => {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const pathname = usePathname();
  const unreadCount = useNotificationStore(state => state.unreadCount());
  const { isSignedIn, user } = useUser(); // Using placeholder hook
  const { syncStatus, retrySync, hashMismatch } = useSyncManager();


  let PersistenceIcon: React.ElementType = CloudOff;
  let persistenceStatusText = 'Local';
  let persistenceTooltipText = "Data local. Sync to cloud.";
  let iconColor = 'text-muted-foreground'; // Default to muted
  let isClickable = true;

  switch (syncStatus) {
    case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; break;
    case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break;
    case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error'; persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break;
    case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local'; persistenceTooltipText = "Data local. Sync to cloud."; iconColor = 'text-muted-foreground'; isClickable = true; break;
  }

  const handleSyncClick = () => { if (isClickable) retrySync(); };

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear",
        state === "expanded" ? "w-[var(--sidebar-width)]" : "w-[var(--sidebar-width-icon)]",
        className
      )}
      {...props}
    >
      <div data-sidebar="header" className="flex-shrink-0 border-b border-sidebar-border p-2.5">
        <div className={cn(
            "flex items-center gap-2 overflow-hidden",
            state === 'collapsed' && "justify-center"
        )}>
           <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={toggleSidebar}
            aria-label={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {state === 'collapsed' ? <Menu size={20} /> : <PanelLeft size={20} />}
          </Button>
          <span
            className={cn(
              "whitespace-nowrap text-lg font-semibold transition-opacity duration-200",
              state === "collapsed" ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          >
            IFC - Guru
          </span>
        </div>
      </div>

      <ScrollArea className="flex-grow">
        <nav className="space-y-1 p-2.5">
          {menuItems.map((item) => (
            <TooltipProvider key={item.href} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={pathname === item.href ? "primary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-sm h-9",
                      state === "collapsed" && "justify-center px-0",
                      pathname === item.href ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      <div className={cn("flex items-center", state === "expanded" ? "gap-2" : "gap-0")}>
                         {React.cloneElement(item.icon as React.ReactElement, { size: 18, className: "flex-shrink-0" })}
                        <span className={cn("truncate", state === "collapsed" && "sr-only")}>
                          {item.label}
                        </span>
                        {item.href === "/notifications" && unreadCount > 0 && (
                           <Badge variant="destructive" className={cn("ml-auto", state === 'collapsed' && 'hidden')}>{unreadCount}</Badge>
                        )}
                      </div>
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

      <div className="mt-auto space-y-1 border-t border-sidebar-border p-2.5">
        <ThemeToggle />

        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleSyncClick}
                className={cn(
                  "w-full justify-start text-sm h-9",
                  state === "collapsed" && "justify-center px-0",
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-label={persistenceTooltipText}
              >
                 <div className={cn("flex items-center", state === "expanded" ? "gap-2" : "gap-0")}>
                    <PersistenceIcon size={18} className={cn("flex-shrink-0", iconColor)} />
                    <span className={cn("truncate text-xs", state === "collapsed" && "sr-only")}>
                        {persistenceStatusText}
                    </span>
                 </div>
              </Button>
            </TooltipTrigger>
            {state === "collapsed" && (
              <TooltipContent side="right" align="center">
                {persistenceTooltipText}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {isSignedIn && (
           <div className={cn(
              "flex items-center justify-between",
              state === 'collapsed' ? "justify-center py-1" : "p-1"
           )}>
             {/* <UserButton afterSignOutUrl="/" /> */}
             <UserButtonPlaceholder /> {/* Using placeholder */}
             {state === 'expanded' && user?.fullName && (
                <span className="ml-2 text-xs text-sidebar-muted-foreground truncate max-w-[calc(100%-2.5rem)]" title={user.fullName}>
                    {user.fullName}
                </span>
             )}
          </div>
        )}
      </div>
    </div>
  );
});
SidebarBase.displayName = "SidebarBase";


// Main Sidebar component that decides whether to render Sheet or static Sidebar
export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm">
            <Menu size={24} />
            <span className="sr-only">Open sidebar</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[var(--sidebar-width)] p-0 border-r-sidebar-border">
          <SidebarBase ref={ref} variant="mobile" {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop view (Div)
  return (
      <div
        ref={ref}
        className={cn(
          "group/sidebar peer hidden md:block text-sidebar-foreground"
        )}
         // data-state is managed by SidebarWrapper
        // data-collapsible={collapsible}
        // data-variant={variant}
        // data-side={side}
      >
        <SidebarBase ref={ref} variant="desktop" {...props} />
      </div>
  );
});
Sidebar.displayName = "Sidebar";


export const SidebarRail = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, isMobile } = useSidebar();

  if (isMobile) return null; // SidebarRail is only for desktop

  return (
    <div
      ref={ref}
      className={cn(
        "hidden md:block flex-shrink-0 transition-[width] duration-200 ease-linear",
        state === "expanded" ? "w-[var(--sidebar-width)]" : "w-[var(--sidebar-width-icon)]",
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
  const { isMobile } = useSidebar();

  // Apply inset only if sidebar is present (not mobile or expanded)
  const shouldInset = !isMobile;

  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 transition-[margin-left] duration-200 ease-linear",
        shouldInset ? "md:ml-[var(--sidebar-width)]" : "",
        className
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";
