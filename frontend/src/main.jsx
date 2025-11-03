import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initializeI18n } from './i18n.js';
import './index.css';

// Enable MSW in development mode
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === 'true') {
  const { worker } = await import('./mocks/browser.js');
  await worker.start({
    onUnhandledRequest: 'bypass',
  });
  console.log('🔧 MSW enabled for API mocking');
}

// i18nの初期化
async function initializeApp() {
  try {
    // i18nの初期化を待つ
    await initializeI18n();

    // Reactアプリケーションのレンダリング
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    console.log('🚀 Runner Frontend initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);

    // エラーが発生した場合でも基本的なアプリケーションを表示
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: 'Arial, sans-serif',
          backgroundColor: '#f5f5f5'
        }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2 style={{ color: '#d32f2f' }}>初期化エラー</h2>
            <p>アプリケーションの初期化に失敗しました。ページをリロードしてください。</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              再読み込み
            </button>
          </div>
        </div>
      </React.StrictMode>
    );
  }
}

// アプリケーションの初期化
initializeApp();
