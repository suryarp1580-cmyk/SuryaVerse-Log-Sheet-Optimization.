import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import dotenv from 'dotenv';

// Load .env.local / .env so project variables take precedence over stale container defaults
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: true });

const CANONICAL_SUPABASE_URL = 'https://mpbkurbimxknydymcaco.supabase.co';
const CANONICAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYmt1cmJpbXhrbnlkeW1jYWNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTc0NTcsImV4cCI6MjA5OTU5MzQ1N30.v1jI-diP7iqQF6MhO6UiMV33LEQT53hcdhi2qEKHTB4';

const rawUrl = process.env.VITE_SUPABASE_URL || '';
const rawKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const resolvedUrl = (rawUrl && !rawUrl.includes('lsdnmodwfwiatqofbien')) ? rawUrl : CANONICAL_SUPABASE_URL;
const resolvedKey = (rawKey && !rawUrl.includes('lsdnmodwfwiatqofbien')) ? rawKey : CANONICAL_SUPABASE_ANON_KEY;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(resolvedUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(resolvedKey),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('react')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
  };
});
