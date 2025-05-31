
'use client';

import React from 'react';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useTheme } from 'next-themes';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { 
    Sun, Moon, Laptop, LogOut, UserCircle, LifeBuoy, HelpCircle, FilePlus, FolderOpen, Save, Undo, Redo, Copy, ClipboardPaste, Scissors, FileQuestion
} from 'lucide-react';

export function AppMenubar() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useClerk();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
        await signOut(() => router.push('/'));
        toast({ title: 'Signed Out', description: 'You have been successfully signed out.' });
    } catch (error) {
        console.error("Sign out error", error);
        toast({ title: 'Sign Out Error', description: 'Could not sign you out. Please try again.', variant: 'destructive' });
    }
  };

  const handlePlaceholderAction = (action: string) => {
    toast({ title: 'Action Triggered', description: `${action} action clicked.`});
    console.log(`${action} clicked`);
  };

  return (
    <Menubar className="rounded-none border-b border-border bg-card px-2 lg:px-4 print:hidden h-10">
      <MenubarMenu>
        <MenubarTrigger className="font-medium">File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => handlePlaceholderAction('New File')}>
            <FilePlus className="mr-2 h-4 w-4" /> New File
          </MenubarItem>
          <MenubarItem onClick={() => handlePlaceholderAction('Open File')}>
            <FolderOpen className="mr-2 h-4 w-4" /> Open...
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => handlePlaceholderAction('Save')}>
            <Save className="mr-2 h-4 w-4" /> Save
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => router.push('/')}> {/* Assuming '/' is a safe exit point */}
            <LogOut className="mr-2 h-4 w-4" /> Exit Application
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="font-medium">Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => handlePlaceholderAction('Undo')}>
            <Undo className="mr-2 h-4 w-4" /> Undo
          </MenubarItem>
          <MenubarItem onClick={() => handlePlaceholderAction('Redo')}>
            <Redo className="mr-2 h-4 w-4" /> Redo
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => handlePlaceholderAction('Cut')}>
            <Scissors className="mr-2 h-4 w-4" /> Cut
          </MenubarItem>
          <MenubarItem onClick={() => handlePlaceholderAction('Copy')}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </MenubarItem>
          <MenubarItem onClick={() => handlePlaceholderAction('Paste')}>
            <ClipboardPaste className="mr-2 h-4 w-4" /> Paste
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="font-medium">View</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>
              {theme === 'light' && <Sun className="mr-2 h-4 w-4" />}
              {theme === 'dark' && <Moon className="mr-2 h-4 w-4" />}
              {theme === 'system' && <Laptop className="mr-2 h-4 w-4" />}
              Theme
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarRadioGroup value={theme}>
                <MenubarRadioItem value="light" onClick={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" /> Light
                </MenubarRadioItem>
                <MenubarRadioItem value="dark" onClick={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" /> Dark
                </MenubarRadioItem>
                <MenubarRadioItem value="system" onClick={() => setTheme('system')}>
                  <Laptop className="mr-2 h-4 w-4" /> System
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="font-medium">Profile</MenubarTrigger>
        <MenubarContent>
          <MenubarItem asChild>
            {/* Assuming dashboard is a suitable profile overview, or create a dedicated /profile page */}
            <Link href="/dashboard"> 
              <UserCircle className="mr-2 h-4 w-4" /> View Profile
            </Link>
          </MenubarItem>
          <MenubarItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      
      <MenubarMenu>
        <MenubarTrigger className="font-medium">Help</MenubarTrigger>
        <MenubarContent>
            <MenubarItem onClick={() => handlePlaceholderAction('View Documentation')}>
                <FileQuestion className="mr-2 h-4 w-4" /> Documentation
            </MenubarItem>
            <MenubarItem onClick={() => handlePlaceholderAction('About IFC Guru')}>
                <LifeBuoy className="mr-2 h-4 w-4" /> About
            </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
