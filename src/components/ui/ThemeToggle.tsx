
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils" // Import cn utility
import type { SidebarState } from "./sidebar"; // Import SidebarState type

interface ThemeToggleProps {
    sidebarState: SidebarState; // Accept sidebar state as a prop
}

export function ThemeToggle({ sidebarState }: ThemeToggleProps) {
  const { setTheme } = useTheme()
  // No need for useSidebar here, state is passed as prop

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
              "w-full justify-start px-2",
              sidebarState === 'collapsed' && 'justify-center' // Center icon when collapsed
          )}
         >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
           {/* Use the sidebarState prop to conditionally hide text */}
           <span className={cn(
               "ml-2",
               sidebarState === 'collapsed' && "hidden" // Hide text if collapsed
            )}>
               Toggle theme
           </span>
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
