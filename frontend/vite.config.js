import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react({
      // @vitejs/plugin-react-swc の既定includeは .ts/.tsx/.mts/.jsx/.mdx のみで、
      // 素の .js は対象外。本プロジェクトは多数のコンポーネントを .js 拡張子のまま
      // JSXで書いているため（下のesbuild.include設定はvite buildのRollup経路にしか効かず、
      // devサーバーのトランスフォームパイプラインはこのSWCプラグインが専有する）、
      // parserConfigで明示的に .js/.jsx をJSXとして解釈するよう上書きする。
      // これが無いとdevサーバーでJSXを含む.jsファイルが軒並みパースエラーになる
      // （vite buildでは問題が起きないため長らく気づかれていなかった）
      parserConfig(id) {
        if (id.includes('node_modules')) return undefined;
        if (/\.(js|jsx)$/.test(id)) {
          return { syntax: 'ecmascript', jsx: true };
        }
        return undefined;
      }
    }),
    // Brotli compression (higher compression ratio, better for modern browsers)
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024, // Only compress files > 1KB
      deleteOriginFile: false // Keep original files
    }),
    // Gzip compression (fallback for older browsers)
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      deleteOriginFile: false
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.config.js',
        '**/*.config.ts',
        '**/main.jsx',
        '**/index.css'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  },
  server: {
    // バックエンドは既定でポート3000を使う（backend/src/config.js, .env.example）ため、
    // devサーバー自身が3000を名乗ると起動時に衝突する。バックエンドのCORS既定値
    // （config.js の corsOrigin/allowedOrigins）も 5173 を前提にしているため、それに合わせる
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        // 以前は存在しない4000番を指しており、相対パスで/apiを叩く全コンポーネント
        // （例: CriticalAlertsBanner.jsx）がdevサーバー経由では常に接続失敗になっていた
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          charts: ['@mui/x-charts'],
          socket: ['socket.io-client']
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    },
    target: 'esnext',
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1000
  },
  define: {
    'process.env': {}
  },
  // 一部のコンポーネントが .js 拡張子で JSX を含むため、
  // esbuild/依存事前バンドルで .js も JSX として扱う
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  }
});