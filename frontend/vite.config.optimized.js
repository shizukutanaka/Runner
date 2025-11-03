// frontend/vite.config.optimized.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { splitVendorChunkPlugin, importAnalysis } from 'vite';

// 本番環境最適化設定
export default defineConfig({
  plugins: [
    react({
      // Reactの高速リフレッシュを有効化
      fastRefresh: true,
      // JSXランタイムを自動設定
      jsxRuntime: 'automatic'
    }),
    // ベンダーチャンク分割プラグイン
    splitVendorChunkPlugin(),
    // インポート分析プラグイン
    importAnalysis()
  ],

  // ビルド最適化設定
  build: {
    // 出力ディレクトリ
    outDir: 'dist',
    // アセットファイル名
    assetsDir: 'assets',
    // ソースマップ（本番では無効）
    sourcemap: process.env.NODE_ENV === 'development',

    // バンドルサイズ制限（警告レベル）
    chunkSizeWarningLimit: 1000,

    // チャンク分割設定
    rollupOptions: {
      output: {
        // チャンクファイル名
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',

        // 手動チャンク分割
        manualChunks: {
          // React関連
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // UIライブラリ
          'ui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],

          // ユーティリティライブラリ
          'utils-vendor': ['lodash', 'axios', 'date-fns', 'clsx'],

          // 状態管理
          'state-vendor': ['zustand', 'jotai', 'valtio'],

          // フォームライブラリ
          'form-vendor': ['react-hook-form', 'yup', '@hookform/resolvers'],

          // 国際化
          'i18n-vendor': ['react-i18next', 'i18next', 'i18next-browser-languagedetector'],

          // その他のベンダー
          'other-vendor': ['socket.io-client', 'recharts', 'react-helmet-async']
        }
      }
    },

    // ターゲットブラウザ設定（モダンブラウザ向け）
    target: [
      'es2020',
      'chrome80',
      'firefox74',
      'safari13',
      'edge79'
    ],

    // CSSコード分割
    cssCodeSplit: true,

    // ミニファイ設定
    minify: 'esbuild',

    // Terserオプション（追加の圧縮）
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: process.env.NODE_ENV === 'production',
        pure_funcs: process.env.NODE_ENV === 'production' ? ['console.log', 'console.info'] : []
      },
      mangle: {
        safari10: true
      }
    },

    // アセットインライン制限
    assetsInlineLimit: 4096,

    // レポート生成
    reportCompressedSize: true,
    write: true
  },

  // 開発サーバー設定
  server: {
    port: 3000,
    host: true,
    open: true,
    cors: true,

    // プロキシ設定（バックエンドAPI用）
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('プロキシエラー:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('プロキシリクエスト:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('プロキシレスポンス:', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  },

  // 依存関係最適化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@mui/icons-material',
      'axios',
      'lodash',
      'date-fns'
    ],
    exclude: ['@vite/client', '@vite/env']
  },

  // 環境変数設定
  envPrefix: ['VITE_', 'APP_'],

  // パス解決設定
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils',
      '@api': '/src/api',
      '@assets': '/src/assets',
      '@locales': '/src/locales',
      '@styles': '/src/styles',
      '@types': '/src/types'
    }
  },

  // CSSプリプロセッサ設定
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/variables.scss";`
      }
    },
    modules: {
      localsConvention: 'camelCase'
    }
  },

  // ESBuild設定
  esbuild: {
    // JSX設定
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',

    // ドロップ設定
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],

    // ターゲット設定
    target: 'es2020'
  },

  // パフォーマンス設定
  define: {
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production'
  },

  // プラグイン設定
  plugins: [
    // 本番環境でのみ有効なプラグイン
    ...(process.env.NODE_ENV === 'production' ? [
      // バンドルアナライザー
      require('rollup-plugin-visualizer')({
        filename: 'dist/report.html',
        open: true,
        gzipSize: true,
        brotliSize: true
      })
    ] : [])
  ]
});
