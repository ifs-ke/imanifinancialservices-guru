// src/components/providers/ClientLogCaptureProvider.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useClientLogStore } from '@/store/clientLogStore';
import type { LogLevel as ClientLogLevel } from '@/store/clientLogStore'; // Renamed to avoid conflict

// import { useAuth } from '@clerk/nextjs/client'; // Clerk disabled
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


interface ClientLogCaptureProviderProps {
  children: React.ReactNode;
}

const ClientLogCaptureProvider: React.FC<ClientLogCaptureProviderProps> = ({ children }) => {
  const addLogToStore = useClientLogStore((state) => state.addLog);
  const originalConsoleMethodsRef = useRef<any>(null);
  // const { userId: clerkUserId } = useAuth(); // Clerk disabled

  // Function to send log to backend API
  const sendLogToBackend = async (level: ClientLogLevel, messages: any[], context?: Record<string, any>) => {
    try {
      const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder when Clerk is disabled

      // Format message for backend
      const messageString = messages.map(arg => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\nStack: ${arg.stack}` : ''}`;
        try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
        catch { return '[Unserializable Object]' }
      }).join(' ');

      const payload = {
        level,
        message: messageString,
        context: {
          ...context,
          source: 'client-console',
          userId: userId, // Add userId to context for backend logging
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
      };

      await fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Use original console.error to avoid loop if this itself fails
      if (originalConsoleMethodsRef.current?.error) {
        originalConsoleMethodsRef.current.error('Failed to send client log to backend:', error);
      } else {
        console.error('Failed to send client log to backend (original console unavailable):', error);
      }
    }
  };


  useEffect(() => {
    if (typeof window !== 'undefined' && console && !originalConsoleMethodsRef.current) {
      originalConsoleMethodsRef.current = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };

      const createLogHandler = (level: ClientLogLevel, originalMethod: (...args: any[]) => void) => {
        return (...args: any[]) => {
          originalMethod(...args); // Call original console method
          addLogToStore(level, args); // Add to Zustand store for UI display
          sendLogToBackend(level, args); // Send to backend API
        };
      };

      console.log = createLogHandler('log', originalConsoleMethodsRef.current.log);
      console.info = createLogHandler('info', originalConsoleMethodsRef.current.info);
      console.warn = createLogHandler('warn', originalConsoleMethodsRef.current.warn);
      console.error = createLogHandler('error', originalConsoleMethodsRef.current.error);
      console.debug = createLogHandler('debug', originalConsoleMethodsRef.current.debug);

      // Initial log to confirm setup (will also be sent to backend)
      // Use a slight delay to ensure fetch is available and original console methods are stored
      setTimeout(() => {
        if (originalConsoleMethodsRef.current && console.info === createLogHandler('info', originalConsoleMethodsRef.current.info)) { // Check if still overridden
            console.info('ClientLogCaptureProvider: Console methods overridden and connected to backend logger API.');
        }
      }, 100);

    }

    // No cleanup needed for console override as it should persist for the app lifetime
    // unless the component unmounts and we want to restore, but for a provider, this is usually not the case.
  }, [addLogToStore]);

  return <>{children}</>;
};

export default ClientLogCaptureProvider;
