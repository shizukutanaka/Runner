// frontend/src/service-worker.js
const CACHE_NAME = 'runner-app-v1.0.0';
const STATIC_CACHE_NAME = 'runner-static-v1.0.0';
const API_CACHE_NAME = 'runner-api-v1.0.0';

// キャッシュ対象のリソース
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo.svg',
  // CSSファイル
  '/assets/css/*',
  // JavaScriptファイル
  '/assets/js/*.js',
  // フォントファイル
  '/assets/fonts/*'
];

// APIキャッシュ設定
const API_CACHE_CONFIG = {
  '/api/users': { maxAge: 5 * 60 * 1000 }, // 5分
  '/api/notifications': { maxAge: 2 * 60 * 1000 }, // 2分
  '/api/settings': { maxAge: 10 * 60 * 1000 }, // 10分
  '/api/analytics': { maxAge: 30 * 60 * 1000 } // 30分
};

// インストールイベント
self.addEventListener('install', (event) => {
  console.log('[SW] インストール中...');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME);

      try {
        await cache.addAll(STATIC_ASSETS);
        console.log('[SW] 静的アセットをキャッシュしました');
      } catch (error) {
        console.warn('[SW] キャッシュに失敗したアセットがあります:', error);
        // 失敗したアセットを個別にキャッシュ
        for (const asset of STATIC_ASSETS) {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn(`[SW] ${asset} のキャッシュに失敗:`, error);
          }
        }
      }

      // インストール完了を通知
      self.skipWaiting();
    })()
  );
});

// アクティベートイベント
self.addEventListener('activate', (event) => {
  console.log('[SW] アクティベート中...');

  event.waitUntil(
    (async () => {
      // 古いキャッシュを削除
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(
        name => name !== STATIC_CACHE_NAME && name !== API_CACHE_NAME
      );

      await Promise.all(
        oldCaches.map(cacheName => caches.delete(cacheName))
      );

      console.log('[SW] 古いキャッシュを削除しました');

      // クライアントをリロード
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.postMessage('sw-updated'));

      // アクティベート完了を通知
      await self.clients.claim();
    })()
  );
});

// フェッチイベント
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // APIリクエストの処理
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // 静的アセットのリクエスト処理
  if (isStaticAsset(request)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // その他のリクエスト（ネットワークファースト）
  event.respondWith(handleOtherRequest(request));
});

/**
 * APIリクエストの処理
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const cacheConfig = API_CACHE_CONFIG[url.pathname];

  try {
    // ネットワークリクエストを試行
    const networkResponse = await fetch(request.clone());

    // 成功レスポンスの場合、キャッシュを更新
    if (networkResponse.ok && cacheConfig) {
      const cache = await caches.open(API_CACHE_NAME);
      const responseToCache = networkResponse.clone();

      // レスポンスの有効期限を設定
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());
      headers.set('sw-cache-max-age', cacheConfig.maxAge.toString());

      const cacheResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      await cache.put(request, cacheResponse);
    }

    return networkResponse;
  } catch (error) {
    // ネットワークエラーの場合、キャッシュから取得
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
      const maxAge = cachedResponse.headers.get('sw-cache-max-age');

      if (cacheTimestamp && maxAge) {
        const age = Date.now() - parseInt(cacheTimestamp);
        if (age < parseInt(maxAge)) {
          console.log('[SW] キャッシュからAPIレスポンスを返します');
          return cachedResponse;
        }
      }

      // キャッシュが古い場合は削除してエラーを返す
      await caches.open(API_CACHE_NAME).then(cache => cache.delete(request));
    }

    // オフライン用のフォールバックレスポンス
    return new Response(
      JSON.stringify({
        error: 'オフラインです',
        message: 'ネットワーク接続を確認してください'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 静的アセットのリクエスト処理（キャッシュファースト）
 */
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    console.log('[SW] キャッシュから静的アセットを返します:', request.url);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] 静的アセットの取得に失敗:', request.url, error);

    // オフライン用のフォールバック
    if (request.destination === 'document') {
      return caches.match('/');
    }

    return new Response('オフラインです', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * その他のリクエスト処理（ネットワークファースト）
 */
async function handleOtherRequest(request) {
  try {
    const networkResponse = await fetch(request);

    // 成功したレスポンスをキャッシュ（短時間）
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseToCache = networkResponse.clone();

      // 短時間のキャッシュ（5分）
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());
      headers.set('sw-cache-max-age', '300000'); // 5分

      const cacheResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      // キャッシュサイズ制限を考慮して保存
      const cacheSize = await getCacheSize(cache);
      if (cacheSize < 50 * 1024 * 1024) { // 50MB制限
        await cache.put(request, cacheResponse);
      }
    }

    return networkResponse;
  } catch (error) {
    // キャッシュから取得を試行
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
      const maxAge = cachedResponse.headers.get('sw-cache-max-age');

      if (cacheTimestamp && maxAge) {
        const age = Date.now() - parseInt(cacheTimestamp);
        if (age < parseInt(maxAge)) {
          console.log('[SW] キャッシュからレスポンスを返します');
          return cachedResponse;
        }
      }
    }

    return new Response(
      JSON.stringify({
        error: 'オフラインです',
        message: 'ネットワーク接続を確認してください'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 静的アセットかどうかを判定
 */
function isStaticAsset(request) {
  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.url.includes('/assets/') ||
    request.url.endsWith('.css') ||
    request.url.endsWith('.js') ||
    request.url.endsWith('.png') ||
    request.url.endsWith('.jpg') ||
    request.url.endsWith('.jpeg') ||
    request.url.endsWith('.svg') ||
    request.url.endsWith('.woff') ||
    request.url.endsWith('.woff2') ||
    request.url.endsWith('.ttf')
  );
}

/**
 * キャッシュサイズを取得
 */
async function getCacheSize(cache) {
  const keys = await cache.keys();
  let size = 0;

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      size += blob.size;
    }
  }

  return size;
}

/**
 * バックグラウンド同期（オンライン復帰時の処理）
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

/**
 * バックグラウンド同期処理
 */
async function doBackgroundSync() {
  try {
    // オフライン時に蓄積されたデータを同期
    const pendingData = await getStoredPendingData();

    for (const data of pendingData) {
      try {
        await fetch(data.url, {
          method: data.method,
          headers: data.headers,
          body: data.body
        });

        // 成功したらストレージから削除
        await removeStoredPendingData(data.id);
      } catch (error) {
        console.warn('[SW] バックグラウンド同期に失敗:', error);
      }
    }

    console.log('[SW] バックグラウンド同期が完了しました');
  } catch (error) {
    console.error('[SW] バックグラウンド同期エラー:', error);
  }
}

/**
 * プッシュ通知処理
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'notification',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/**
 * 通知クリック処理
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action) {
    // アクションボタンがクリックされた場合
    handleNotificationAction(event.action, event.notification.data);
  } else {
    // 通知本体がクリックされた場合
    handleNotificationClick(event.notification.data);
  }
});

/**
 * 通知アクション処理
 */
async function handleNotificationAction(action, data) {
  const clients = await self.clients.matchAll({ type: 'window' });

  for (const client of clients) {
    if (client.url.includes(self.location.origin)) {
      client.postMessage({
        type: 'notification-action',
        action,
        data
      });
      client.focus();
      return;
    }
  }

  // 該当するクライアントがない場合は新しいウィンドウを開く
  self.clients.openWindow('/');
}

/**
 * 通知クリック処理
 */
async function handleNotificationClick(data) {
  const clients = await self.clients.matchAll({ type: 'window' });

  for (const client of clients) {
    if (client.url.includes(self.location.origin)) {
      client.postMessage({
        type: 'notification-click',
        data
      });
      client.focus();
      return;
    }
  }

  // 該当するクライアントがない場合は新しいウィンドウを開く
  self.clients.openWindow(data.url || '/');
}

/**
 * オフライン時にデータを保存
 */
async function storePendingData(data) {
  const pendingData = await getStoredPendingData();
  pendingData.push({
    id: Date.now().toString(),
    timestamp: Date.now(),
    ...data
  });

  localStorage.setItem('pendingData', JSON.stringify(pendingData));
}

/**
 * 保存された保留データを取得
 */
async function getStoredPendingData() {
  const data = localStorage.getItem('pendingData');
  return data ? JSON.parse(data) : [];
}

/**
 * 保存された保留データを削除
 */
async function removeStoredPendingData(id) {
  const pendingData = await getStoredPendingData();
  const filteredData = pendingData.filter(item => item.id !== id);

  localStorage.setItem('pendingData', JSON.stringify(filteredData));
}

// メッセージイベント（メインスレッドからの通信）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    clearAllCaches();
  }
});

/**
 * 全てのキャッシュをクリア
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );

  console.log('[SW] 全てのキャッシュがクリアされました');
}
