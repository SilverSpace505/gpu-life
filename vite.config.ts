import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // hmr: {
    //   host: 'dev.silverspace.io', // Your new subdomain for HMR
    //   clientPort: 443,
    // },
    allowedHosts: [
      'dev.silverspace.io', // Allow your new subdomain
    ],
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  define: {
    global: 'window',
  },
  // ... rest of your configuration ...
});
