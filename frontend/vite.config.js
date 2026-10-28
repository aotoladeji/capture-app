import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    port: 3000,
    hmr: {
      overlay: true
    },
    watch: {
      usePolling: true
    },
    proxy: {
      // Laravel backend during local dev (php artisan serve --port=8001).
      // Update the target if you run Apache/Laravel on a different port.
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // Build straight into the Laravel public/ folder so one Apache
    // document root serves both the SPA and the API. Run `npm run build`
    // from this folder (or use ../build-frontend.sh from the project root).
    outDir: '../backend/public',
    emptyOutDir: false, // never wipe index.php / .htaccess / storage symlink
    rollupOptions: {
      output: {
        // Add hash to filenames to bust cache
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('scheduler')) return 'react-vendor';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
          if (id.includes('axios')) return 'axios-vendor';
          if (id.includes('xlsx')) return 'xlsx-vendor';
          if (id.includes('@mediapipe')) return 'mediapipe-vendor';
          return 'vendor';
        }
      }
    }
  },
  // Force cache busting
  optimizeDeps: {
    force: true
  }
})
