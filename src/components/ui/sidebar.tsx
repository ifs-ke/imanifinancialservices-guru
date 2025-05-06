// src/components/ui/sidebar.tsx
"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { Menu, PanelLeft } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem" // Adjusted icon-only width
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarState = "expanded" | "collapsed";

type SidebarContext = {
  state: SidebarState;
  open: boolean; // Derived from state for simplicity
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean | undefined; // Allow undefined initially
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean // Default state *before* hydration
    open?: boolean // Controlled state
    onOpenChange?: (open: boolean) => void
  }
>(
  (
    {
      defaultOpen = false, // Server renders based on this (collapsed default)
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile();
    const [isMounted, setIsMounted] = React.useState(false);
    const [openMobile, setOpenMobile] = React.useState(false);

    // Server-side/initial state is collapsed unless defaultOpen is true
    const serverState = defaultOpen ? "expanded" : "collapsed";
    const [sidebarState, setSidebarState] = React.useState<SidebarState>(serverState);

    // Effect to read cookie and update state *after* hydration
    React.useEffect(() => {
      setIsMounted(true); // Mark as mounted on the client

      // Only read cookie if not controlled externally
      if (openProp === undefined) {
          const cookieValue = document.cookie
              .split('; ')
              .find(row => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
              ?.split('=')[1];
          // Use cookie value if present, otherwise stick to defaultOpen prop
          const cookieState = cookieValue ? (cookieValue === 'true' ? "expanded" : "collapsed") : (defaultOpen ? "expanded" : "collapsed");
          setSidebarState(cookieState);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultOpen, openProp]); // Depend on props used for initial state calculation

    // Use controlled state if provided, otherwise internal state
    const effectiveState = openProp !== undefined ? (openProp ? "expanded" : "collapsed") : sidebarState;
    const open = effectiveState === "expanded";

    const handleSetOpen = React.useCallback(
      (newOpenValue: boolean) => {
        const newState = newOpenValue ? "expanded" : "collapsed";
        // Update cookie
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${newOpenValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;

        // Update internal state or call prop setter
        if (setOpenProp) {
          setOpenProp(newOpenValue);
        } else {
          setSidebarState(newState);
        }
      },
      [setOpenProp]
    );

    const toggleSidebar = React.useCallback(() => {
        if (isMounted) { // Only allow toggle on client after mount
            if (isMobile) {
                setOpenMobile((current) => !current);
            } else {
                handleSetOpen(!open); // Use handleSetOpen for desktop toggle
            }
        }
    }, [isMounted, isMobile, handleSetOpen, open]);

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar]);

    // Determine the state to use for data attributes, respecting hydration
    const renderedState = isMounted ? effectiveState : serverState;

    const contextValue = React.useMemo<SidebarContext>(
      () => ({
        state: renderedState,
        open: renderedState === "expanded",
        setOpen: handleSetOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [renderedState, handleSetOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delayDuration={0}>
          <div
            style={
              { "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties
            }
            data-state={renderedState} // Apply the determined state
            className={cn("group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar", className)}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider"

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }
>(
  (
    { side = "left", variant = "sidebar", collapsible = "icon", className, children, ...props },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar(); // Get current state from context

    if (collapsible === "none") {
      return (
        <div className={cn("flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground", className)} ref={ref} {...props}>
          {children}
        </div>
      )
    }

    // Mobile view (Sheet)
    if (isMobile === true) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent data-sidebar="sidebar" data-mobile="true" className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden" style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties} side={side}>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

    // Placeholder for SSR/before hydration
    if (isMobile === undefined) {
        // Render a placeholder or nothing to avoid mismatch
        return null; // Or a Skeleton component
    }

    // Desktop view (Div)
    return (
      <div ref={ref} className="group/sidebar peer hidden md:block text-sidebar-foreground" data-state={state} data-collapsible={collapsible} data-variant={variant} data-side={side}>
        {/* Spacer div for content pushing */}
        <div
          className={cn(
            "duration-200 relative h-svh bg-transparent transition-[width] ease-linear",
            state === 'expanded' ? "w-[--sidebar-width]" :
            collapsible === 'icon' ? (variant === "floating" || variant === "inset" ? "w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]" : "w-[--sidebar-width-icon]") :
            collapsible === 'offcanvas' ? "w-0" : "w-[--sidebar-width]",
             // Remove rotation, positioning handled below
          )}
        />
        {/* Actual Sidebar Container */}
        <div
          className={cn(
            "duration-200 fixed inset-y-0 z-10 hidden h-svh transition-[left,right,width] ease-linear md:flex",
             side === "left" ? ( state === 'expanded' ? "left-0 w-[--sidebar-width]" : collapsible === 'icon' ? (variant === "floating" || variant === "inset" ? "left-0 w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)] p-2" : "left-0 w-[--sidebar-width-icon]") : collapsible === 'offcanvas' ? "left-[calc(var(--sidebar-width)*-1)] w-[--sidebar-width]" : "left-0 w-[--sidebar-width]")
             : ( // side === "right"
                 state === 'expanded' ? "right-0 w-[--sidebar-width]" : collapsible === 'icon' ? (variant === "floating" || variant === "inset" ? "right-0 w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)] p-2" : "right-0 w-[--sidebar-width-icon]") : collapsible === 'offcanvas' ? "right-[calc(var(--sidebar-width)*-1)] w-[--sidebar-width]" : "right-0 w-[--sidebar-width]"
             ),
             // Apply border based on side and variant
             variant !== "floating" && variant !== "inset" && ( side === "left" ? "border-r" : "border-l" ),
            "border-sidebar-border", className
          )}
          {...props}
        >
          <div data-sidebar="sidebar" className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]/sidebar:rounded-lg group-data-[variant=floating]/sidebar:border group-data-[variant=floating]/sidebar:border-sidebar-border group-data-[variant=floating]/sidebar:shadow">
            {children}
          </div>
        </div>
      </div>
    )
  }
)
Sidebar.displayName = "Sidebar"

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentProps<typeof Button>, "children"> & { children?: React.ReactNode }
>(({ className, onClick, children, ...props }, ref) => {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

   // Determine icon based on mounted state, mobile status, and sidebar state
   const icon = React.useMemo(() => {
       if (!isMounted) return <Menu className="h-5 w-5" />; // Default for SSR
       if (isMobile) return <Menu className="h-5 w-5" />;
       return state === 'expanded' ? <PanelLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />;
   }, [isMounted, isMobile, state]);


  const content = children ?? icon;

  return (
     <Button
        ref={ref}
        data-sidebar="trigger"
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8 shrink-0", isMobile && "md:hidden", className)} // Adjusted mobile visibility
        onClick={(event) => { onClick?.(event); toggleSidebar(); }}
        {...props}
     >
        {content}
        <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"


const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border",
        "group-data-[side=left]/sidebar-wrapper:-right-2 group-data-[side=right]/sidebar-wrapper:-left-2", // Use wrapper state
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]/sidebar-wrapper:translate-x-0 group-data-[collapsible=offcanvas]/sidebar-wrapper:after:left-full group-data-[collapsible=offcanvas]/sidebar-wrapper:hover:bg-sidebar", // Use wrapper state
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
         "sm:flex", // Show on sm and up
        className
      )}
      {...props}
    />
  )
})
SidebarRail.displayName = "SidebarRail"

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background transition-[margin-left,margin-right] duration-200 ease-linear",
         // Adjust margin based on sidebar state and variant
         "group-data-[state=expanded]/sidebar-wrapper:peer-data-[variant=inset]/sidebar:md:ml-[--sidebar-width]",
         "group-data-[state=collapsed]/sidebar-wrapper:peer-data-[collapsible=icon]/sidebar:peer-data-[variant=inset]/sidebar:md:ml-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]",
         "group-data-[state=expanded]/sidebar-wrapper:peer-data-[variant=sidebar]/sidebar:md:ml-[--sidebar-width]",
         "group-data-[state=collapsed]/sidebar-wrapper:peer-data-[collapsible=icon]/sidebar:peer-data-[variant=sidebar]/sidebar:md:ml-[var(--sidebar-width-icon)]",
         // Floating variant doesn't push content
         // Offcanvas variant doesn't push content when closed
        "md:peer-data-[variant=inset]/sidebar:m-2 md:peer-data-[variant=inset]/sidebar:rounded-xl md:peer-data-[variant=inset]/sidebar:shadow", // Inset specific styles
        className
      )}
      {...props}
    />
  )
})
SidebarInset.displayName = "SidebarInset"

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn(
        "h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className
      )}
      {...props}
    />
  )
})
SidebarInput.displayName = "SidebarInput"

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex h-14 flex-shrink-0 items-center gap-2 p-2", className)}
      {...props}
    />
  )
})
SidebarHeader.displayName = "SidebarHeader"

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
})
SidebarFooter.displayName = "SidebarFooter"

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
})
SidebarSeparator.displayName = "SidebarSeparator"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]/sidebar-wrapper:overflow-hidden",
        className
      )}
      {...props}
    />
  )
})
SidebarContent.displayName = "SidebarContent"

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
})
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0", // Adjusted transition property
         "group-data-[state=collapsed]/sidebar-wrapper:-mt-8 group-data-[state=collapsed]/sidebar-wrapper:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      className={cn(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
         "group-data-[state=collapsed]/sidebar-wrapper:hidden",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupAction.displayName = "SidebarGroupAction"

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn("w-full text-sm", className)}
    {...props}
  />
))
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding,color,background-color] duration-200 focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
   // Collapsed state styles using group-data
   "group-data-[state=collapsed]/sidebar-wrapper:h-8 group-data-[state=collapsed]/sidebar-wrapper:w-8 group-data-[state=collapsed]/sidebar-wrapper:justify-center group-data-[state=collapsed]/sidebar-wrapper:p-2",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active: "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 focus-visible:ring-offset-sidebar-primary", // Use primary for active, adjusted focus
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[state=collapsed]/sidebar-wrapper:!p-2", // Adjust collapsed size for lg
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    isActive?: boolean
    tooltip?: string | React.ReactNode
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(
  (
    { asChild = false, isActive = false, variant = "default", size = "default", tooltip, className, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const { isMobile, state } = useSidebar();
    const finalVariant = isActive ? "active" : variant;

    const buttonContent = (
      <Comp ref={ref} data-sidebar="menu-button" data-size={size} data-active={isActive} className={cn(sidebarMenuButtonVariants({ variant: finalVariant, size }), className)} {...props}>
        {children}
      </Comp>
    );

    const shouldShowTooltip = tooltip && state === 'collapsed' && !isMobile; // Only show tooltip when collapsed on desktop

    if (!shouldShowTooltip) {
      return buttonContent;
    }

    const tooltipContent = typeof tooltip === 'string' ? <p>{tooltip}</p> : tooltip;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={10}>
            {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean; showOnHover?: boolean }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp ref={ref} data-sidebar="menu-action" className={cn(
        "absolute right-1 top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-3.5",
         "group-data-[state=collapsed]/sidebar-wrapper:hidden", // Hide when collapsed
        showOnHover && "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarMenuAction.displayName = "SidebarMenuAction"


const SidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar="menu-badge" className={cn(
      "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none",
      "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-primary-foreground", // Adjusted color for active state
       "peer-data-[size=sm]/menu-button:top-1",
       "peer-data-[size=default]/menu-button:top-1.5",
       "peer-data-[size=lg]/menu-button:top-3.5",
       "group-data-[state=collapsed]/sidebar-wrapper:hidden", // Hide when collapsed
       className
    )} {...props} />
))
SidebarMenuBadge.displayName = "SidebarMenuBadge"

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { showIcon?: boolean }
>(({ className, showIcon = false, ...props }, ref) => {
  const width = React.useMemo(() => `${Math.floor(Math.random() * 40) + 50}%`, [])
  return (
    <div ref={ref} data-sidebar="menu-skeleton" className={cn("rounded-md h-8 flex gap-2 px-2 items-center", className)} {...props}>
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton className="h-4 flex-1 max-w-[--skeleton-width]" data-sidebar="menu-skeleton-text" style={{"--skeleton-width": width} as React.CSSProperties}/>
    </div>
  )
})
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton"

const SidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul ref={ref} data-sidebar="menu-sub" className={cn(
      "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
       "group-data-[state=collapsed]/sidebar-wrapper:hidden",
       className
    )} {...props} />
))
SidebarMenuSub.displayName = "SidebarMenuSub"

const SidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />)
SidebarMenuSubItem.displayName = "SidebarMenuSubItem"

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & { asChild?: boolean; size?: "sm" | "md"; isActive?: boolean }
>(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a"
  return (
    <Comp ref={ref} data-sidebar="menu-sub-button" data-size={size} data-active={isActive} className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs", size === "md" && "text-sm",
         "group-data-[state=collapsed]/sidebar-wrapper:hidden",
         className
      )} {...props} />
  )
})
SidebarMenuSubButton.displayName = "SidebarMenuSubButton"

export {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar,
}