// src/components/layout/AppSidebar.tsx
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
   ClipboardList, // Changed from Logger to ClipboardList
   RefreshCw,
   Menu,
   UserCircle // Placeholder for UserButton
 } from "lucide-react";
 import Link from "next/link";
 import { useSyncManager } from "@/hooks/useSyncManager";
 import { ThemeToggle } from "../ui/ThemeToggle"; // Ensure correct import path
 import { useNotificationStore } from "@/store/notificationStore";
 import { Badge } from "@/components/ui/badge";
 // import { UserButton, useUser } from "@clerk/nextjs"; // Clerk disabled
 import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
 import { ScrollArea } from "../ui/scroll-area"; // Ensure correct import path
 import { useSidebar } from "../ui/sidebar"; // Ensure correct import path


 // Placeholder user data when Clerk is disabled
 const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 const CLERK_DISABLED_PLACEHOLDER_USER_NAME = 'Local User';
 const CLERK_DISABLED_PLACEHOLDER_USER_EMAIL = 'local-user@example.com';

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
   { href: '/logger', label: 'Logger', icon: <ClipboardList size={18} /> }, // Added logger link back with correct icon
 ];

 // Component for the actual sidebar content (used in both desktop and mobile sheet)
 const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
   ({ className, ...props }, ref) => {
     const { state, toggleSidebar } = useSidebar();
     const pathname = usePathname();
     const unreadCount = useNotificationStore(state => state.unreadCount());
     // const { user } = useUser(); // Clerk disabled
     // Mock user when Clerk is disabled
     const user = {
         id: CLERK_DISABLED_PLACEHOLDER_USER_ID,
         fullName: CLERK_DISABLED_PLACEHOLDER_USER_NAME,
         primaryEmailAddress: { emailAddress: CLERK_DISABLED_PLACEHOLDER_USER_EMAIL },
     };
     const syncManager = useSyncManager();
     const { syncStatus, retrySync, hashMismatch } = syncManager;

     let PersistenceIcon: React.ElementType = CloudOff;
     let persistenceStatusText = 'Local';
     let persistenceTooltipText = "Data saved locally. Click to sync.";
     let iconColor = 'text-muted-foreground';
     let isClickable = true;

     switch (syncStatus) {
       case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; isClickable = false; break;
       case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; isClickable = false; break;
       case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error'; persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break;
       case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local'; persistenceTooltipText = "Data saved locally. Click to sync."; iconColor = 'text-muted-foreground'; isClickable = true; break;
     }

     const handleSyncClick = () => { if (isClickable) retrySync(); };

     return (
       <div
         ref={ref}
         className={cn(
           "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear border-r border-sidebar-border",
           state === "expanded" ? "w-64" : "w-14", // Use fixed widths for consistency
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
             <span
               className={cn(
                 "whitespace-nowrap text-lg font-semibold transition-opacity duration-200",
                 state === "collapsed" ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
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
                         state === "collapsed" && "justify-center px-0 w-9 h-9",
                         pathname === item.href ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                       )}
                       asChild
                     >
                       <Link href={item.href}>
                         {React.cloneElement(item.icon as React.ReactElement, { size: 18, className: "flex-shrink-0" })}
                         <span className={cn(
                           "ml-2 truncate",
                           state === "collapsed" && "hidden"
                         )}>
                           {item.label}
                         </span>
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

         <div className="mt-auto space-y-1 border-t border-sidebar-border p-2.5">
           <ThemeToggle />

           <TooltipProvider delayDuration={100}>
             <Tooltip>
               <TooltipTrigger asChild>
                 <Button
                   variant="ghost"
                   onClick={handleSyncClick}
                   className={cn(
                     "w-full justify-start text-sm h-9",
                     state === "collapsed" && "justify-center px-0 w-9 h-9",
                     "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                   )}
                   aria-label={persistenceTooltipText}
                   disabled={!isClickable}
                 >
                   {React.cloneElement(<PersistenceIcon />, { size: 18, className: cn("flex-shrink-0", iconColor) })}
                   <span className={cn("ml-2 truncate text-xs", state === "collapsed" && "hidden")}>
                     {persistenceStatusText}
                   </span>
                 </Button>
               </TooltipTrigger>
               {state === "collapsed" && (
                 <TooltipContent side="right" align="center">
                   {persistenceTooltipText}
                 </TooltipContent>
               )}
             </Tooltip>
           </TooltipProvider>

           {/* Placeholder for UserButton when Clerk is disabled */}
           <div className={cn(
               "flex items-center",
               state === 'collapsed' ? "justify-center py-1" : "p-1"
           )}>
              <UserCircle size={24} className="text-sidebar-muted-foreground" />
             {state === 'expanded' && (
                <span className="ml-2 text-xs text-sidebar-muted-foreground truncate max-w-[calc(100%-2.5rem)]" title={user?.primaryEmailAddress?.emailAddress}>
                     {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'User'}
                </span>
             )}
           </div>
         </div>
       </div>
     );
   }
 );
 SidebarContent.displayName = "SidebarContent";

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
           <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm h-10 w-10">
             <Menu size={24} />
             <span className="sr-only">Open sidebar</span>
           </Button>
         </SheetTrigger>
         <SheetContent side="left" className="w-64 p-0 border-r-sidebar-border">
           <SidebarContent {...props} />
         </SheetContent>
       </Sheet>
     );
   }

   // Desktop view (Fixed Position Div)
   return (
     <div
       ref={ref}
       className={cn("fixed inset-y-0 left-0 z-40 hidden md:flex")}
     >
       <SidebarContent {...props} />
     </div>
   );
 });
 Sidebar.displayName = "Sidebar";
