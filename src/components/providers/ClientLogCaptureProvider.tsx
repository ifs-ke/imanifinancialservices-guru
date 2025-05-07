// src/components/providers/ClientLogCaptureProvider.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useClientLogStore } from '@/store/clientLogStore';
import { captureLog as sendToLogtail } from '@/lib/logger'; // Use the generic captureLog

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

      console.log = (...args: any[]) => {
        originalConsoleMethodsRef.current?.log(...args);
        addLogToStore('log', args);
        sendToLogtail('log', args);
      };
      console.info = (...args: any[]) => {
        originalConsoleMethodsRef.current?.info(...args);
        addLogToStore('info', args);
        sendToLogtail('info', args);
      };
      console.warn = (...args: any[]) => {
        originalConsoleMethodsRef.current?.warn(...args);
        addLogToStore('warn', args);
        sendToLogtail('warn', args);
      };
      console.error = (...args: any[]) => {
        originalConsoleMethodsRef.current?.error(...args);
        addLogToStore('error', args);
        sendToLogtail('error', args);
      };
      console.debug = (...args: any[]) => {
        originalConsoleMethodsRef.current?.debug(...args);
        addLogToStore('debug', args);
        sendToLogtail('debug', args);
      };

      console.info('ClientLogCaptureProvider: Console methods overridden.');
    }

    // Cleanup function (optional, as this provider is likely top-level)
    // return () => {
    //   if (originalConsoleMethodsRef.current) {
    //     console.log = originalConsoleMethodsRef.current.log;
    //     console.info = originalConsoleMethodsRef.current.info;
    //     console.warn = originalConsoleMethodsRef.current.warn;
    //     console.error = originalConsoleMethodsRef.current.error;
    //     console.debug = originalConsoleMethodsRef.current.debug;
    //     console.info('ClientLogCaptureProvider: Console methods restored.');
    //     originalConsoleMethodsRef.current = null;
    //   }
    // };
  }, [addLogToStore]);

  return <>{children}</>;
};

export default ClientLogCaptureProvider;
