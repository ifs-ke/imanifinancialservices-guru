// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/context/AuthContext';
import App from './App';
import './app/globals.css';

// Register Service Worker for Progressive Web App (PWA) offline capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, r) {
          console.log('[PWA] Service Worker registered with scope:', r?.scope);
        },
        onRegisterError(error) {
          console.warn('[PWA] Service Worker registration failed:', error);
        },
      });
    })
    .catch((err) => {
      console.log('[PWA] PWA auto-registration notice:', err);
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
