// src/components/providers/ClientLogCaptureProvider.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useClientLogStore } from '@/store/clientLogStore';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; // Use the existing logger methods which now use Winston
import type { LogLevel, CapturedLog } from '@/store/clientLogStore'; // Import LogLevel type

interface ClientLogCaptureProviderProps {
  children: React.ReactNode;
}

const ClientLogCaptureProvider: React.FC<ClientLogCaptureProviderProps> = ({ children }) => {
  const addLogToStore = useClientLogStore((state) => state.addLog);
  const originalConsoleMethodsRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && console && !originalConsoleMethodsRef.current) {
      originalConsoleMethodsRef.current = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };

      const createLogHandler = (level: LogLevel, originalMethod: (...args: any[]) => void) => {
        return (...args: any[]) => {
          // 1. Call the original console method
          originalMethod(...args);

          // 2. Add the log to the Zustand store for the UI Logger page
          addLogToStore(level, args);

          // 3. Format and send the log to the Winston backend via logger functions
          const message = args.map(arg => {
            if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\nStack: ${arg.stack}` : ''}`;
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg); } catch { return '[Unserializable Object]'; }
            }
            return String(arg);
          }).join(' ');

          const context = { source: 'client-console' }; // Add context

          // Use the appropriate Winston-backed logger function
          switch (level) {
              case 'log': logInfo(`Client Console Log: ${message}`, context); break;
              case 'info': logInfo(`Client Console Info: ${message}`, context); break;
              case 'warn': logWarn(`Client Console Warn: ${message}`, context); break;
              case 'error':
                  const errorArg = args.find(arg => arg instanceof Error);
                  logError(`Client Console Error: ${message}`, errorArg, context);
                  break;
              case 'debug': logDebug(`Client Console Debug: ${message}`, context); break;
          }
        };
      };

      console.log = createLogHandler('log', originalConsoleMethodsRef.current.log);
      console.info = createLogHandler('info', originalConsoleMethodsRef.current.info);
      console.warn = createLogHandler('warn', originalConsoleMethodsRef.current.warn);
      console.error = createLogHandler('error', originalConsoleMethodsRef.current.error);
      console.debug = createLogHandler('debug', originalConsoleMethodsRef.current.debug);


      logInfo('ClientLogCaptureProvider: Console methods overridden and connected to Winston logger.');
    }

    // Cleanup function is generally not needed here.
  }, [addLogToStore]);

  return <>{children}</>;
};

export default ClientLogCaptureProvider;
