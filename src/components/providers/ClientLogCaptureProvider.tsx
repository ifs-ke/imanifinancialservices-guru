// src/components/providers/ClientLogCaptureProvider.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useClientLogStore } from '@/store/clientLogStore';
import type { LogLevel as ClientStoreLogLevel } from '@/store/clientLogStore'; // Renamed to avoid conflict
// Import the NEW client-side logger functions
import * as clientLogger from '@/lib/client-logger';
import type { ClientLogLevel } from '@/lib/client-logger';


interface ClientLogCaptureProviderProps {
  children: React.ReactNode;
}

const ClientLogCaptureProvider: React.FC<ClientLogCaptureProviderProps> = ({ children }) => {
  const addLogToStore = useClientLogStore((state) => state.addLog);
  const originalConsoleMethodsRef = useRef<any>(null);

  useEffect(() => {
    // Only run in the browser environment
    if (typeof window !== 'undefined' && console && !originalConsoleMethodsRef.current) {
      // Store original methods before overriding
      originalConsoleMethodsRef.current = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };

      // Map console methods to our client logger and Zustand store
      const createLogHandler = (level: ClientLogLevel, storeLevel: ClientStoreLogLevel, originalMethod: (...args: any[]) => void) => {
        return (...args: any[]) => {
          try {
            // 1. Call the original console method to maintain default browser behavior
            originalMethod.apply(console, args);

            // 2. Add the log entry to the Zustand store for UI display
            addLogToStore(storeLevel, args);

            // 3. Send the log to the backend via the client logger utility
            // Dynamically call the correct function from clientLogger based on level
            const loggerFunc = clientLogger[level] || clientLogger.logInfo; // Default to logInfo if level mismatch
            loggerFunc('Console Capture:', ...args); // Pass arguments to the client logger

          } catch (error) {
              // Use original console.error to report issues with the logging interception itself
              const originalError = originalConsoleMethodsRef.current?.error || console.error;
              originalError("Error within ClientLogCaptureProvider log handler:", error, { originalArgs: args });
          }
        };
      };

      // Override console methods
      console.log = createLogHandler('log', 'log', originalConsoleMethodsRef.current.log);
      console.info = createLogHandler('info', 'info', originalConsoleMethodsRef.current.info);
      console.warn = createLogHandler('warn', 'warn', originalConsoleMethodsRef.current.warn);
      console.error = createLogHandler('error', 'error', originalConsoleMethodsRef.current.error);
      console.debug = createLogHandler('debug', 'debug', originalConsoleMethodsRef.current.debug);

       // Log initialization success (uses the new overridden console.info)
       // Use a timeout to ensure the override is fully established
       setTimeout(() => {
           console.info('ClientLogCaptureProvider initialized: Console logs are now captured.');
       }, 50);

    }

    // Cleanup function (optional but good practice if needed):
    // Restore original console methods if the provider were to unmount.
    // For a root provider, this might not be strictly necessary.
    // return () => {
    //   if (originalConsoleMethodsRef.current) {
    //     console.log = originalConsoleMethodsRef.current.log;
    //     console.info = originalConsoleMethodsRef.current.info;
    //     console.warn = originalConsoleMethodsRef.current.warn;
    //     console.error = originalConsoleMethodsRef.current.error;
    //     console.debug = originalConsoleMethodsRef.current.debug;
    //     originalConsoleMethodsRef.current = null; // Clear ref
    //     console.info("ClientLogCaptureProvider cleaned up: Console methods restored.");
    //   }
    // };

  }, [addLogToStore]); // Dependency array

  return <>{children}</>;
};

export default ClientLogCaptureProvider;
