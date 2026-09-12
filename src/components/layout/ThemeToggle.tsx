// src/components/layout/ThemeToggle.tsx
"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SidebarState } from "@/components/ui/sidebar";

interface ThemeToggleProps {
  sidebarState: SidebarState;
}

export function ThemeToggle({ sidebarState }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn(
          "w-full justify-start px-2",
          sidebarState === "collapsed" && "justify-center"
        )}
      >
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span
          className={cn(
            "ml-2",
            sidebarState === "collapsed" && "hidden"
          )}
        >
          Loading...
        </span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "w-full justify-start px-2",
        sidebarState === "collapsed" && "justify-center"
      )}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-[1.2rem] w-[1.2rem] transition-all" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] transition-all" />
      )}
      <span
        className={cn(
          "ml-2",
          sidebarState === "collapsed" && "hidden"
        )}
      >
        {theme === "dark" ? "Light Mode" : "Dark Mode"}
      </span>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export default ThemeToggle;
