import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, './src/shims/next-link.tsx'),
      'next/navigation': path.resolve(__dirname, './src/shims/next-navigation.ts'),
      'next/font/google': path.resolve(__dirname, './src/shims/next-font.ts'),
      'next/font': path.resolve(__dirname, './src/shims/next-font.ts'),
      'next/script': path.resolve(__dirname, './src/shims/next-script.tsx'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  define: {
    'process.env': JSON.stringify(process.env),
  },
});
